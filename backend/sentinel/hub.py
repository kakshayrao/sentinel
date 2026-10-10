"""Import standard benchmarks from the Hugging Face datasets server
(https://datasets-server.huggingface.co). Rows are sampled from random offsets so a
small import still covers the whole dataset (MMLU, for example, is sorted by subject)."""

from __future__ import annotations

import math
import random
from dataclasses import dataclass
from typing import Callable

import httpx

from .models import HubBenchmark, Item, Suite
from .scorers import LETTERS

API = "https://datasets-server.huggingface.co"

CHOICE_TEMPLATE = "{context}Question: {input}\n\n{choices}\n\nRespond with only the letter of the correct answer."
MATH_TEMPLATE = (
    "Solve the following problem. Think step by step, then give the final answer on its own line "
    "in the form 'Answer: <number>'.\n\n{input}"
)
HUMANEVAL_TEMPLATE = (
    "Complete the following Python function. Return the complete function in a single ```python code block.\n\n"
    "```python\n{input}\n```"
)
MBPP_TEMPLATE = "{input}\n\nReturn only the Python code in a single ```python code block."


@dataclass
class Spec:
    info: HubBenchmark
    config: str
    split: str
    scorer: str
    template: str
    max_tokens: int
    to_item: Callable[[dict, int, random.Random], Item]


def _mmlu(row: dict, i: int, rng: random.Random) -> Item:
    return Item(id=f"mmlu-{i}", input=row["question"], choices=row["choices"],
                target=LETTERS[int(row["answer"])], meta={"subject": row.get("subject", "")})


def _gsm8k(row: dict, i: int, rng: random.Random) -> Item:
    answer = row["answer"].split("####")[-1].strip().replace(",", "")
    return Item(id=f"gsm8k-{i}", input=row["question"], target=answer)


def _arc(row: dict, i: int, rng: random.Random) -> Item:
    labels = row["choices"]["label"]
    return Item(id=row.get("id") or f"arc-{i}", input=row["question"], choices=row["choices"]["text"],
                target=LETTERS[labels.index(row["answerKey"])])


def _hellaswag(row: dict, i: int, rng: random.Random) -> Item:
    return Item(id=f"hellaswag-{i}", input=f"Which ending best completes the scenario?\n\n{row['ctx']}",
                choices=row["endings"], target=LETTERS[int(row["label"])],
                meta={"activity": row.get("activity_label", "")})


def _truthfulqa(row: dict, i: int, rng: random.Random) -> Item:
    choices = list(row["mc1_targets"]["choices"])
    correct = choices[row["mc1_targets"]["labels"].index(1)]
    rng.shuffle(choices)  # the dataset always lists the correct answer first
    return Item(id=f"truthfulqa-{i}", input=row["question"], choices=choices,
                target=LETTERS[choices.index(correct)])


def _boolq(row: dict, i: int, rng: random.Random) -> Item:
    question = row["question"].strip()
    return Item(id=f"boolq-{i}", input=question[0].upper() + question[1:] + "?", context=row["passage"],
                choices=["Yes", "No"], target="A" if row["answer"] else "B")


def _humaneval(row: dict, i: int, rng: random.Random) -> Item:
    return Item(id=row["task_id"], input=row["prompt"], tests=row["test"], entry_point=row["entry_point"])


def _mbpp(row: dict, i: int, rng: random.Random) -> Item:
    tests = "\n".join(row["test_list"])
    prompt = f"{row['text']}\nYour code should pass these tests:\n\n{tests}"
    return Item(id=f"mbpp-{row.get('task_id', i)}", input=prompt, tests=tests)


SPECS: dict[str, Spec] = {
    s.info.id: s
    for s in [
        Spec(HubBenchmark(id="mmlu", name="MMLU", dataset="cais/mmlu", category="knowledge",
                          description="Multiple-choice questions across 57 subjects, from law to physics.",
                          size="14,042 test questions"),
             "all", "test", "choice", CHOICE_TEMPLATE, 256, _mmlu),
        Spec(HubBenchmark(id="gsm8k", name="GSM8K", dataset="openai/gsm8k", category="math",
                          description="Grade-school math word problems that need multi-step reasoning.",
                          size="1,319 test problems"),
             "main", "test", "numeric", MATH_TEMPLATE, 1024, _gsm8k),
        Spec(HubBenchmark(id="arc_challenge", name="ARC-Challenge", dataset="allenai/ai2_arc", category="reasoning",
                          description="Hard grade-school science questions that retrieval alone can't answer.",
                          size="1,172 test questions"),
             "ARC-Challenge", "test", "choice", CHOICE_TEMPLATE, 256, _arc),
        Spec(HubBenchmark(id="hellaswag", name="HellaSwag", dataset="Rowan/hellaswag", category="reasoning",
                          description="Commonsense sentence completion: pick the most plausible continuation.",
                          size="10,042 validation items"),
             "default", "validation", "choice", CHOICE_TEMPLATE, 256, _hellaswag),
        Spec(HubBenchmark(id="truthfulqa", name="TruthfulQA (MC1)", dataset="truthfulqa/truthful_qa",
                          category="knowledge",
                          description="Questions where popular misconceptions tempt models into false answers.",
                          size="817 questions"),
             "multiple_choice", "validation", "choice", CHOICE_TEMPLATE, 256, _truthfulqa),
        Spec(HubBenchmark(id="boolq", name="BoolQ", dataset="google/boolq", category="reading",
                          description="Yes/no questions about a Wikipedia passage.",
                          size="3,270 validation questions"),
             "default", "validation", "choice", CHOICE_TEMPLATE, 256, _boolq),
        Spec(HubBenchmark(id="humaneval", name="HumanEval", dataset="openai/openai_humaneval", category="coding",
                          description="Write Python functions from docstrings; graded by running unit tests.",
                          size="164 problems"),
             "openai_humaneval", "test", "code", HUMANEVAL_TEMPLATE, 1024, _humaneval),
        Spec(HubBenchmark(id="mbpp", name="MBPP", dataset="google-research-datasets/mbpp", category="coding",
                          description="Short Python programming tasks with assert-based tests.",
                          size="500 test problems"),
             "full", "test", "code", MBPP_TEMPLATE, 1024, _mbpp),
    ]
}


def catalog() -> list[HubBenchmark]:
    return [s.info for s in SPECS.values()]


async def _resolve_split(client: httpx.AsyncClient, spec: Spec) -> tuple[str, str]:
    """Use the preferred config/split if the dataset has it, otherwise the closest available one."""
    res = await client.get(f"{API}/splits", params={"dataset": spec.info.dataset})
    res.raise_for_status()
    splits = [(s["config"], s["split"]) for s in res.json().get("splits", [])]
    if (spec.config, spec.split) in splits:
        return spec.config, spec.split
    for config, split in splits:
        if config == spec.config:
            return config, split
    if not splits:
        raise ValueError(f"{spec.info.dataset} has no splits available on the datasets server")
    return splits[0]


async def import_benchmark(benchmark: str, limit: int, seed: int = 7) -> Suite:
    spec = SPECS.get(benchmark)
    if not spec:
        raise ValueError(f"Unknown benchmark '{benchmark}'. Available: {', '.join(SPECS)}")
    rng = random.Random(f"{seed}:{benchmark}")
    async with httpx.AsyncClient(timeout=30.0) as client:
        config, split = await _resolve_split(client, spec)
        params = {"dataset": spec.info.dataset, "config": config, "split": split}

        async def fetch(offset: int, length: int) -> dict:
            res = await client.get(f"{API}/rows", params=params | {"offset": offset, "length": length})
            res.raise_for_status()
            return res.json()

        first = await fetch(0, 10)
        total = first.get("num_rows_total") or len(first.get("rows", []))
        chunk = 10
        starts = list(range(0, total, chunk))
        picked = sorted(rng.sample(starts, min(len(starts), math.ceil(limit / chunk))))
        rows: list[tuple[int, dict]] = []
        for start in picked:
            page = first if start == 0 else await fetch(start, chunk)
            rows.extend((r["row_idx"], r["row"]) for r in page.get("rows", []))
            if len(rows) >= limit:
                break

    items, seen = [], set()
    for idx, row in rows[:limit]:
        try:
            item = spec.to_item(row, idx, random.Random(f"{seed}:{benchmark}:{idx}"))
        except (KeyError, ValueError, IndexError, TypeError):
            continue  # skip malformed rows rather than failing the import
        if item.id in seen:
            continue
        seen.add(item.id)
        items.append(item)
    if not items:
        raise ValueError("No usable rows were returned")
    return Suite(
        id=f"hub-{benchmark}",
        name=spec.info.name,
        description=f"{spec.info.description} Sample of {len(items)} from {spec.info.dataset} ({split}).",
        category=spec.info.category,
        scorer=spec.scorer,
        prompt_template=spec.template,
        max_tokens=spec.max_tokens,
        source="hub",
        item_count=len(items),
        items=items,
    )
