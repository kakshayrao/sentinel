"""Benchmark suites: built-in samples shipped as JSON, plus imported and custom suites
stored in the database."""

from __future__ import annotations

import json
import random
import re
from functools import lru_cache
from pathlib import Path

from . import db
from .models import Item, Suite, SuiteInfo, SuiteUploadIn
from .scorers import LETTERS

BUILTIN_DIR = Path(__file__).parent / "data" / "suites"


@lru_cache(maxsize=1)
def builtin_suites() -> tuple[Suite, ...]:
    suites = []
    for path in sorted(BUILTIN_DIR.glob("*.json")):
        suite = Suite.model_validate_json(path.read_text(encoding="utf-8"))
        suite.source = "builtin"
        suite.item_count = len(suite.items)
        suites.append(suite)
    return tuple(suites)


def all_suites() -> list[Suite]:
    return [*builtin_suites(), *db.list_stored_suites()]


def get_suite(suite_id: str) -> Suite | None:
    return next((s for s in all_suites() if s.id == suite_id), None)


def info(suite: Suite) -> SuiteInfo:
    return SuiteInfo.model_validate(suite.model_dump(exclude={"items"}) | {"item_count": len(suite.items)})


def render_messages(suite: SuiteInfo, item: Item) -> list[dict]:
    choices = "\n".join(f"{LETTERS[i]}. {c}" for i, c in enumerate(item.choices))
    context = f"{item.context}\n\n" if item.context else ""
    user = (
        suite.prompt_template.replace("{context}", context)
        .replace("{choices}", choices)
        .replace("{input}", item.input)
    )
    user = re.sub(r"\n{3,}", "\n\n", user).strip()
    messages = [{"role": "system", "content": suite.system_prompt}] if suite.system_prompt else []
    return [*messages, {"role": "user", "content": user}]


def sample_items(suite: Suite, limit: int | None, seed: int) -> list[Item]:
    """Seeded sample that keeps the original order, so runs with the same seed compare item for item."""
    if not limit or limit >= len(suite.items):
        return list(suite.items)
    keep = set(random.Random(f"{seed}:{suite.id}").sample(range(len(suite.items)), limit))
    return [item for i, item in enumerate(suite.items) if i in keep]


def slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:40] or "suite"


def parse_upload(body: SuiteUploadIn) -> Suite:
    items: list[Item] = []
    for n, line in enumerate(body.jsonl.splitlines(), start=1):
        if not line.strip():
            continue
        try:
            row = json.loads(line)
        except json.JSONDecodeError as e:
            raise ValueError(f"Line {n}: invalid JSON ({e.msg})") from e
        if not isinstance(row, dict) or not str(row.get("input", "")).strip():
            raise ValueError(f"Line {n}: each row needs an \"input\" field")
        row.setdefault("id", str(n))
        row["id"] = str(row["id"])
        try:
            items.append(Item.model_validate(row))
        except Exception as e:
            raise ValueError(f"Line {n}: {e}") from e
        if len(items) > 5000:
            raise ValueError("Suites are limited to 5,000 items")
    if not items:
        raise ValueError("No items found")
    if body.scorer == "choice" and any(not i.choices for i in items):
        raise ValueError("The choice scorer needs a \"choices\" list on every row")
    existing = {s.id for s in all_suites()}
    suite_id, k = f"custom-{slug(body.name)}", 2
    while suite_id in existing:
        suite_id, k = f"custom-{slug(body.name)}-{k}", k + 1
    return Suite(
        id=suite_id,
        name=body.name,
        description=body.description,
        category=body.category,
        scorer=body.scorer,
        prompt_template=body.prompt_template,
        system_prompt=body.system_prompt or None,
        max_tokens=body.max_tokens,
        source="custom",
        item_count=len(items),
        items=items,
    )
