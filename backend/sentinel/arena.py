"""Blind side-by-side battles and Elo ratings (the Chatbot Arena method)."""

from __future__ import annotations

import asyncio
import random

from . import db
from .models import Battle, BattleIn, BattleSide, LeaderboardRow, Model
from .providers import complete_once
from .scorers import strip_reasoning

K = 32
START = 1000.0


async def _answer(model: Model, body: BattleIn) -> BattleSide:
    try:
        completion = await complete_once(
            model, [{"role": "user", "content": body.prompt}], temperature=body.temperature, max_tokens=body.max_tokens
        )
        # Judge answers, not reasoning: inline <think> blocks would reveal which model is which
        return BattleSide(response=strip_reasoning(completion.text), latency_ms=completion.latency_ms,
                          truncated=completion.truncated,
                          tokens_per_sec=completion.tokens_per_sec, model_id=model.id, model_name=model.name)
    except Exception as e:
        return BattleSide(response=None, error=str(e)[:300], model_id=model.id, model_name=model.name)


def pick_models(body: BattleIn) -> tuple[Model, Model]:
    models = {m.id: m for m in db.list_models()}
    if body.model_a_id and body.model_b_id:
        if body.model_a_id == body.model_b_id:
            raise ValueError("Pick two different models")
        a, b = models.get(body.model_a_id), models.get(body.model_b_id)
        if not a or not b:
            raise ValueError("Model not found")
        return a, b
    if len(models) < 2:
        raise ValueError("Add at least two models to use the arena")
    a, b = random.sample(list(models.values()), 2)
    return a, b


async def battle(body: BattleIn) -> Battle:
    a, b = pick_models(body)
    side_a, side_b = await asyncio.gather(_answer(a, body), _answer(b, body))
    return db.save_battle(Battle(id=db.new_id(), prompt=body.prompt, a=side_a, b=side_b, created_at=db.now()))


def public(b: Battle) -> Battle:
    """Hide which model is which until the vote is in."""
    if b.winner:
        return b
    hidden = {"model_id": None, "model_name": None}
    return b.model_copy(update={"a": b.a.model_copy(update=hidden), "b": b.b.model_copy(update=hidden)})


def leaderboard() -> list[LeaderboardRow]:
    models = {m.id: m for m in db.list_models()}
    rows: dict[str, LeaderboardRow] = {}

    def row(side: BattleSide) -> LeaderboardRow:
        if side.model_id not in rows:
            name = models[side.model_id].name if side.model_id in models else (side.model_name or "(deleted)")
            rows[side.model_id] = LeaderboardRow(model_id=side.model_id, model_name=name, rating=START,
                                                 battles=0, wins=0, losses=0, ties=0)
        return rows[side.model_id]

    for b in db.list_voted_battles():
        ra, rb = row(b.a), row(b.b)
        expected_a = 1 / (1 + 10 ** ((rb.rating - ra.rating) / 400))
        actual_a = {"a": 1.0, "b": 0.0}.get(b.winner, 0.5)  # tie and both_bad count as draws
        ra.rating += K * (actual_a - expected_a)
        rb.rating += K * ((1 - actual_a) - (1 - expected_a))
        ra.battles += 1
        rb.battles += 1
        if b.winner == "a":
            ra.wins, rb.losses = ra.wins + 1, rb.losses + 1
        elif b.winner == "b":
            rb.wins, ra.losses = rb.wins + 1, ra.losses + 1
        else:
            ra.ties, rb.ties = ra.ties + 1, rb.ties + 1
    return sorted(rows.values(), key=lambda r: r.rating, reverse=True)
