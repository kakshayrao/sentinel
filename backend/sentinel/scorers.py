"""Scoring functions. Every scorer returns a Score with a 0..1 value, a pass flag and a
human-readable explanation shown in the UI."""

from __future__ import annotations

import asyncio
import json
import os
import re
import string
import subprocess
import sys
import tempfile
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .models import Item, SuiteInfo

LETTERS = "ABCDEFGHIJ"


@dataclass
class Score:
    value: float
    passed: bool
    detail: str


# ---------------------------------------------------------------- helpers


def strip_reasoning(text: str) -> str:
    """Drop <think>...</think> blocks emitted by local reasoning models (Qwen3, DeepSeek-R1, ...)."""
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.S | re.I)
    if re.match(r"\s*<think>", text, flags=re.I):  # unterminated reasoning: nothing usable
        return ""
    return text.strip()


def normalize(text: str) -> str:
    """SQuAD-style normalization: lowercase, no punctuation, no articles, single spaces."""
    text = text.lower()
    text = "".join(ch for ch in text if ch not in set(string.punctuation))
    text = re.sub(r"\b(a|an|the)\b", " ", text)
    return " ".join(text.split())


def as_list(target: Any) -> list[str]:
    if target is None:
        return []
    if isinstance(target, list):
        return [str(t) for t in target]
    return [str(target)]


def display_target(item: Item) -> str | None:
    if item.target is None:
        return None
    if isinstance(item.target, (dict, list)):
        return json.dumps(item.target, ensure_ascii=False)
    return str(item.target)


# ----------------------------------------------------------- choice / text


def extract_choice(response: str, choices: list[str]) -> str | None:
    letters = LETTERS[: len(choices)] or LETTERS[:4]
    cls = f"[{letters}]"
    patterns = [
        rf"(?i)\banswer\s*(?:is|:)?\s*\**\(?({cls})\)?\**(?![A-Za-z])",
        rf"(?i)\boption\s*\(?({cls})\)?(?![A-Za-z])",
        rf"^\s*\**\(?({cls})\)?\**\s*(?:[.):]|$)",
        rf"\(({cls})\)",
    ]
    for pattern in patterns:
        m = re.search(pattern, response, flags=re.M)
        if m:
            return m.group(1).upper()
    # A lone option letter somewhere in a short reply
    standalone = set(re.findall(rf"\b({cls})\b", response))
    if len(standalone) == 1 and len(response) < 200:
        return standalone.pop()
    # The reply quotes exactly one option's text
    norm = normalize(response)
    hits = [LETTERS[i] for i, c in enumerate(choices) if normalize(c) and normalize(c) in norm]
    return hits[0] if len(hits) == 1 else None


def score_choice(item: Item, response: str) -> Score:
    target = str(item.target).strip().upper()
    picked = extract_choice(response, item.choices)
    if picked is None:
        return Score(0.0, False, f"No option letter found (expected {target})")
    ok = picked == target
    return Score(float(ok), ok, f"Picked {picked}, expected {target}")


NUMBER = r"-?\$?\d[\d,]*(?:\.\d+)?"


def parse_number(text: str) -> float | None:
    try:
        return float(text.replace(",", "").replace("$", ""))
    except ValueError:
        return None


def extract_number(response: str) -> float | None:
    m = re.search(rf"(?i)answer\s*[:=]?\s*\**\s*({NUMBER})", response)
    if m:
        return parse_number(m.group(1))
    m = re.search(rf"\\boxed\{{\s*({NUMBER})", response)
    if m:
        return parse_number(m.group(1))
    numbers = re.findall(NUMBER, response)
    return parse_number(numbers[-1]) if numbers else None


def score_numeric(item: Item, response: str) -> Score:
    target = parse_number(str(item.target))
    got = extract_number(response)
    if got is None or target is None:
        return Score(0.0, False, f"No number found (expected {item.target})")
    ok = abs(got - target) <= 1e-6 * max(1.0, abs(target))
    shown = int(got) if got == int(got) else got
    return Score(float(ok), ok, f"Got {shown}, expected {item.target}")


def score_exact(item: Item, response: str) -> Score:
    targets = as_list(item.target)
    ok = normalize(response) in {normalize(t) for t in targets}
    return Score(float(ok), ok, "Exact match" if ok else f"Expected {' / '.join(targets)}")


def score_contains(item: Item, response: str) -> Score:
    targets = as_list(item.target)
    norm = normalize(response)
    hit = next((t for t in targets if normalize(t) and normalize(t) in norm), None)
    return Score(float(hit is not None), hit is not None, f"Contains '{hit}'" if hit else f"Missing {' / '.join(targets)}")


def token_f1(prediction: str, reference: str) -> float:
    pred, ref = normalize(prediction).split(), normalize(reference).split()
    if not pred or not ref:
        return float(pred == ref)
    common = Counter(pred) & Counter(ref)
    same = sum(common.values())
    if same == 0:
        return 0.0
    precision, recall = same / len(pred), same / len(ref)
    return 2 * precision * recall / (precision + recall)


def score_f1(item: Item, response: str) -> Score:
    best = max((token_f1(response, t) for t in as_list(item.target)), default=0.0)
    return Score(best, best >= 0.5, f"Token F1 {best:.2f} (pass at 0.50)")


def rouge_l(prediction: str, reference: str) -> float:
    a, b = normalize(prediction).split(), normalize(reference).split()
    if not a or not b:
        return 0.0
    # LCS length, O(len(a) * len(b)) with a rolling row
    prev = [0] * (len(b) + 1)
    for x in a:
        cur = [0]
        for j, y in enumerate(b):
            cur.append(prev[j] + 1 if x == y else max(prev[j + 1], cur[j]))
        prev = cur
    lcs = prev[-1]
    if lcs == 0:
        return 0.0
    precision, recall = lcs / len(a), lcs / len(b)
    return 2 * precision * recall / (precision + recall)


def score_rouge(item: Item, response: str) -> Score:
    best = max((rouge_l(response, t) for t in as_list(item.target)), default=0.0)
    return Score(best, best >= 0.3, f"ROUGE-L {best:.2f} (pass at 0.30)")


# -------------------------------------------------------------------- json


def extract_json(response: str) -> Any:
    fenced = re.search(r"```(?:json)?\s*(.*?)```", response, flags=re.S)
    candidates = [fenced.group(1)] if fenced else []
    candidates.append(response)
    for text in candidates:
        text = text.strip()
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass
        start = text.find("{")
        while start != -1:
            depth = 0
            for i in range(start, len(text)):
                if text[i] == "{":
                    depth += 1
                elif text[i] == "}":
                    depth -= 1
                    if depth == 0:
                        try:
                            return json.loads(text[start : i + 1])
                        except json.JSONDecodeError:
                            break
            start = text.find("{", start + 1)
    return None


def _same(a: Any, b: Any) -> bool:
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        return abs(a - b) < 1e-6
    if isinstance(a, list) and isinstance(b, list):
        return sorted(normalize(str(x)) for x in a) == sorted(normalize(str(x)) for x in b)
    return normalize(str(a)) == normalize(str(b))


def score_json(item: Item, response: str) -> Score:
    data = extract_json(response)
    expected = item.target if isinstance(item.target, dict) else {}
    if not isinstance(data, dict):
        return Score(0.0, False, "No valid JSON object in the response")
    if not expected:
        return Score(1.0, True, "Valid JSON")
    wrong = [k for k, v in expected.items() if k not in data or not _same(data[k], v)]
    value = 1 - len(wrong) / len(expected)
    return Score(value, not wrong, "All fields correct" if not wrong else f"Wrong or missing: {', '.join(wrong)}")


# ------------------------------------------------------------------ ifeval


def _words(text: str) -> list[str]:
    return re.findall(r"\b[\w'-]+\b", text)


def check_constraint(c: dict, text: str) -> tuple[bool, str]:
    kind, value = c.get("type"), c.get("value")
    lower = text.lower()
    if kind == "max_words":
        n = len(_words(text))
        return n <= value, f"{n} words (max {value})"
    if kind == "min_words":
        n = len(_words(text))
        return n >= value, f"{n} words (min {value})"
    if kind == "lowercase":
        return text == text.lower(), "all lowercase"
    if kind == "uppercase":
        return text == text.upper(), "all uppercase"
    if kind == "include_keywords":
        missing = [k for k in value if k.lower() not in lower]
        return not missing, f"missing {missing}" if missing else "keywords present"
    if kind == "exclude_keywords":
        found = [k for k in value if re.search(rf"\b{re.escape(k.lower())}\b", lower)]
        return not found, f"contains {found}" if found else "forbidden words absent"
    if kind == "num_bullets":
        n = len(re.findall(r"^\s*[-*•]\s+", text, flags=re.M))
        return n == value, f"{n} bullets (need {value})"
    if kind == "num_paragraphs":
        n = len([p for p in re.split(r"\n\s*\n", text.strip()) if p.strip()])
        return n == value, f"{n} paragraphs (need {value})"
    if kind == "starts_with":
        return text.strip().lower().startswith(value.lower()), f"starts with '{value}'"
    if kind == "ends_with":
        return text.strip().lower().endswith(value.lower()), f"ends with '{value}'"
    if kind == "json_format":
        return extract_json(text) is not None, "valid JSON"
    if kind == "no_commas":
        return "," not in text, "no commas"
    if kind == "title":
        return bool(re.search(r"<<[^<>\n]+>>", text)), "title in <<double angle brackets>>"
    if kind == "max_sentences":
        n = len([s for s in re.split(r"(?<=[.!?])\s+", text.strip()) if s])
        return n <= value, f"{n} sentences (max {value})"
    if kind == "language_script":  # e.g. "devanagari", "telugu"
        ranges = {"devanagari": "\u0900-\u097f", "telugu": "\u0c00-\u0c7f"}
        letters = re.findall(r"[^\W\d_]", text)
        native = re.findall(f"[{ranges[value]}]", text)
        ok = bool(letters) and len(native) / len(letters) >= 0.6
        return ok, f"written in {value} script"
    return False, f"unknown constraint {kind}"


def score_ifeval(item: Item, response: str) -> Score:
    if not item.constraints:
        return Score(1.0, True, "No constraints")
    results = [(c, *check_constraint(c, response)) for c in item.constraints]
    failed = [f"{c['type']}: {msg}" for c, ok, msg in results if not ok]
    value = 1 - len(failed) / len(results)
    return Score(value, not failed, "All instructions followed" if not failed else "Failed " + "; ".join(failed))


# -------------------------------------------------------------------- code


def extract_code(response: str, entry_point: str | None) -> str:
    blocks = re.findall(r"```(?:python|py)?\s*\n(.*?)```", response, flags=re.S)
    if not blocks:
        return response
    if entry_point:
        for block in blocks:
            if f"def {entry_point}" in block:
                return block
    return max(blocks, key=len)


def build_program(item: Item, response: str) -> str:
    code = extract_code(response, item.entry_point)
    if item.entry_point:
        if f"def {item.entry_point}" in code:
            program = item.input + "\n\n" + code  # prompt keeps the imports the function needs
        else:
            program = item.input + code  # model returned only the function body
        return f"{program}\n\n{item.tests or ''}\n\ncheck({item.entry_point})\n"
    return f"{code}\n\n{item.tests or ''}\n"


def run_python(program: str, timeout: float = 15.0) -> tuple[bool, str]:
    """Runs a program in a separate interpreter in a temp dir with a timeout.
    This isolates crashes and hangs; it is not a security sandbox."""
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "solution.py"
        path.write_text(program, encoding="utf-8")
        env = {k: v for k, v in os.environ.items() if k in ("PATH", "SYSTEMROOT", "TEMP", "TMP")}
        try:
            proc = subprocess.run(
                [sys.executable, "-I", str(path)],
                cwd=tmp, capture_output=True, text=True, timeout=timeout, env=env,
            )
        except subprocess.TimeoutExpired:
            return False, f"Timed out after {timeout:.0f}s"
    if proc.returncode == 0:
        return True, "All tests passed"
    err = (proc.stderr or proc.stdout).strip().splitlines()
    return False, err[-1][:300] if err else f"Exited with code {proc.returncode}"


async def score_code(item: Item, response: str) -> Score:
    ok, detail = await asyncio.to_thread(run_python, build_program(item, response))
    return Score(float(ok), ok, detail)


# ------------------------------------------------------------------- judge

JUDGE_PROMPT = """You are grading an AI assistant's answer. Be strict and consistent.

[Question]
{question}

[Reference notes for a good answer]
{reference}

[Assistant's answer]
{answer}

Rate the answer from 1 to 10 for correctness, helpfulness and completeness, using the
reference notes. Reply with one short sentence of justification, then a final line exactly
in the form "Score: N"."""


async def score_judge(item: Item, response: str, judge: Any) -> Score:
    if judge is None:
        return Score(0.0, False, "No judge model configured")
    prompt = JUDGE_PROMPT.format(
        question=item.input, reference=display_target(item) or "(none)", answer=response or "(empty)"
    )
    completion = await judge.complete([{"role": "user", "content": prompt}], temperature=0.0, max_tokens=512)
    verdict = strip_reasoning(completion.text)
    m = re.search(r"(?i)score\s*[:=]\s*(\d+(?:\.\d+)?)", verdict) or re.search(r"\b(10|[1-9])\s*/\s*10\b", verdict)
    if not m:
        return Score(0.0, False, f"Judge reply had no score: {verdict[:120]}")
    raw = min(10.0, max(1.0, float(m.group(1))))
    reason = verdict.splitlines()[0][:200] if verdict else ""
    return Score(raw / 10, raw >= 7, f"Judge {raw:g}/10. {reason}")


# ---------------------------------------------------------------- dispatch

SYNC = {
    "choice": score_choice,
    "numeric": score_numeric,
    "exact": score_exact,
    "contains": score_contains,
    "f1": score_f1,
    "rouge_l": score_rouge,
    "json": score_json,
    "ifeval": score_ifeval,
}


async def score(suite: SuiteInfo, item: Item, response: str, judge: Any = None) -> Score:
    if re.match(r"\s*<think>", response, flags=re.I) and not re.search(r"</think>", response, flags=re.I):
        return Score(0.0, False, "Still reasoning when the token limit was reached. Raise max output tokens.")
    answer = strip_reasoning(response)
    if suite.scorer == "code":
        return await score_code(item, answer)
    if suite.scorer == "judge":
        return await score_judge(item, answer, judge)
    return SYNC[suite.scorer](item, answer)
