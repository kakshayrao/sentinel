"""SQLite storage. One short-lived connection per operation, so it is safe from the
event loop, the threadpool and the CLI at the same time (WAL mode)."""

from __future__ import annotations

import json
import os
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Iterator

from .models import Battle, Model, RunConfig, Suite

_path = os.environ.get("SENTINEL_DB", "sentinel.db")

SCHEMA = """
CREATE TABLE IF NOT EXISTS models (id TEXT PRIMARY KEY, data TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS suites (id TEXT PRIMARY KEY, data TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS runs (
    id TEXT PRIMARY KEY, model_id TEXT NOT NULL, name TEXT NOT NULL, status TEXT NOT NULL,
    config TEXT NOT NULL, total INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL,
    started_at TEXT, finished_at TEXT, error TEXT
);
CREATE TABLE IF NOT EXISTS samples (
    id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT NOT NULL, suite_id TEXT NOT NULL,
    item_id TEXT NOT NULL, prompt TEXT NOT NULL, response TEXT, target TEXT, score REAL,
    passed INTEGER, detail TEXT NOT NULL DEFAULT '', latency_ms INTEGER, ttft_ms INTEGER,
    output_tokens INTEGER, tokens_estimated INTEGER NOT NULL DEFAULT 0, error TEXT,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS samples_run ON samples(run_id);
CREATE TABLE IF NOT EXISTS battles (id TEXT PRIMARY KEY, data TEXT NOT NULL, winner TEXT, created_at TEXT NOT NULL);
"""


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def new_id() -> str:
    return uuid.uuid4().hex[:12]


def configure(path: str) -> None:
    global _path
    _path = path
    init()


@contextmanager
def connect() -> Iterator[sqlite3.Connection]:
    conn = sqlite3.connect(_path, timeout=30)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init() -> None:
    with connect() as c:
        c.execute("PRAGMA journal_mode=WAL")
        c.executescript(SCHEMA)


def recover_interrupted() -> None:
    """Called once at server start: runs left active by a previous process can't resume."""
    with connect() as c:
        c.execute(
            "UPDATE runs SET status='failed', error='Interrupted by server restart', finished_at=? "
            "WHERE status IN ('queued', 'running')",
            (now(),),
        )


# ----------------------------------------------------------------- models


def list_models() -> list[Model]:
    with connect() as c:
        rows = c.execute("SELECT data FROM models ORDER BY created_at DESC").fetchall()
    return [Model.model_validate_json(r["data"]) for r in rows]


def get_model(model_id: str) -> Model | None:
    with connect() as c:
        row = c.execute("SELECT data FROM models WHERE id=?", (model_id,)).fetchone()
    return Model.model_validate_json(row["data"]) if row else None


def save_model(model: Model) -> Model:
    with connect() as c:
        c.execute(
            "INSERT OR REPLACE INTO models (id, data, created_at) VALUES (?, ?, ?)",
            (model.id, model.model_dump_json(), model.created_at),
        )
    return model


def delete_model(model_id: str) -> None:
    with connect() as c:
        c.execute("DELETE FROM models WHERE id=?", (model_id,))


# ----------------------------------------------------------------- suites


def list_stored_suites() -> list[Suite]:
    with connect() as c:
        rows = c.execute("SELECT data FROM suites ORDER BY created_at DESC").fetchall()
    return [Suite.model_validate_json(r["data"]) for r in rows]


def save_suite(suite: Suite) -> Suite:
    with connect() as c:
        c.execute(
            "INSERT OR REPLACE INTO suites (id, data, created_at) VALUES (?, ?, ?)",
            (suite.id, suite.model_dump_json(), now()),
        )
    return suite


def delete_suite(suite_id: str) -> None:
    with connect() as c:
        c.execute("DELETE FROM suites WHERE id=?", (suite_id,))


# ------------------------------------------------------------------- runs


def insert_run(run_id: str, model_id: str, name: str, config: RunConfig, total: int) -> None:
    with connect() as c:
        c.execute(
            "INSERT INTO runs (id, model_id, name, status, config, total, created_at) VALUES (?, ?, ?, 'queued', ?, ?, ?)",
            (run_id, model_id, name, config.model_dump_json(), total, now()),
        )


def update_run(run_id: str, **fields: Any) -> None:
    allowed = {"status", "started_at", "finished_at", "error", "total"}
    keys = [k for k in fields if k in allowed]
    if not keys:
        return
    with connect() as c:
        c.execute(
            f"UPDATE runs SET {', '.join(f'{k}=?' for k in keys)} WHERE id=?",
            (*[fields[k] for k in keys], run_id),
        )


def get_run_row(run_id: str) -> dict | None:
    with connect() as c:
        row = c.execute("SELECT * FROM runs WHERE id=?", (run_id,)).fetchone()
    return dict(row) if row else None


def list_run_rows(status: str | None = None) -> list[dict]:
    with connect() as c:
        if status:
            rows = c.execute("SELECT * FROM runs WHERE status=? ORDER BY created_at DESC", (status,)).fetchall()
        else:
            rows = c.execute("SELECT * FROM runs ORDER BY created_at DESC").fetchall()
    return [dict(r) for r in rows]


def delete_run(run_id: str) -> None:
    with connect() as c:
        c.execute("DELETE FROM samples WHERE run_id=?", (run_id,))
        c.execute("DELETE FROM runs WHERE id=?", (run_id,))


def count_active_runs(model_id: str) -> int:
    with connect() as c:
        row = c.execute(
            "SELECT COUNT(*) FROM runs WHERE model_id=? AND status IN ('queued', 'running')", (model_id,)
        ).fetchone()
    return row[0]


# ---------------------------------------------------------------- samples

SAMPLE_COLUMNS = (
    "run_id", "suite_id", "item_id", "prompt", "response", "target", "score", "passed", "detail",
    "latency_ms", "ttft_ms", "output_tokens", "tokens_estimated", "error",
)


def insert_sample(sample: dict) -> None:
    sample = {"tokens_estimated": 0, "detail": ""} | {k: v for k, v in sample.items() if v is not None}
    values = [sample.get(k) for k in SAMPLE_COLUMNS]
    with connect() as c:
        c.execute(
            f"INSERT INTO samples ({', '.join(SAMPLE_COLUMNS)}, created_at) VALUES ({', '.join('?' * len(SAMPLE_COLUMNS))}, ?)",
            (*values, now()),
        )


def list_samples(run_id: str) -> list[dict]:
    with connect() as c:
        rows = c.execute("SELECT * FROM samples WHERE run_id=? ORDER BY id", (run_id,)).fetchall()
    return [dict(r) for r in rows]


def samples_by_run(run_ids: list[str]) -> dict[str, list[dict]]:
    out: dict[str, list[dict]] = {rid: [] for rid in run_ids}
    if not run_ids:
        return out
    with connect() as c:
        rows = c.execute(
            f"SELECT * FROM samples WHERE run_id IN ({', '.join('?' * len(run_ids))}) ORDER BY id", run_ids
        ).fetchall()
    for r in rows:
        out[r["run_id"]].append(dict(r))
    return out


# ---------------------------------------------------------------- battles


def save_battle(battle: Battle) -> Battle:
    with connect() as c:
        c.execute(
            "INSERT OR REPLACE INTO battles (id, data, winner, created_at) VALUES (?, ?, ?, ?)",
            (battle.id, battle.model_dump_json(), battle.winner, battle.created_at),
        )
    return battle


def get_battle(battle_id: str) -> Battle | None:
    with connect() as c:
        row = c.execute("SELECT data FROM battles WHERE id=?", (battle_id,)).fetchone()
    return Battle.model_validate_json(row["data"]) if row else None


def list_voted_battles() -> list[Battle]:
    with connect() as c:
        rows = c.execute("SELECT data FROM battles WHERE winner IS NOT NULL ORDER BY created_at").fetchall()
    return [Battle.model_validate_json(r["data"]) for r in rows]


def dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False)
