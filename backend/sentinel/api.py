"""FastAPI application. All routes live under /api."""

from __future__ import annotations

import asyncio
import json
import time
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse, StreamingResponse

from . import __version__, arena, db, hub, providers, runner, suites
from .models import (
    Battle, BattleIn, ChatIn, DiscoveredServer, HubBenchmark, HubImportIn, LeaderboardRow, MatrixCell,
    Model, ModelIn, ModelTestResult, Overview, Run, RunDetail, RunIn, Suite, SuiteInfo, SuiteUploadIn, VoteIn,
)

TASKS: dict[str, asyncio.Task] = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init()
    db.recover_interrupted()
    yield
    for task in TASKS.values():
        task.cancel()


app = FastAPI(title="Sentinel", version=__version__, lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)
api = APIRouter(prefix="/api")


def _models() -> dict[str, Model]:
    return {m.id: m for m in db.list_models()}


def _model_or_404(model_id: str) -> Model:
    model = db.get_model(model_id)
    if not model:
        raise HTTPException(404, "Model not found")
    return model


def _run_or_404(run_id: str) -> dict:
    row = db.get_run_row(run_id)
    if not row:
        raise HTTPException(404, "Run not found")
    return row


def _start(run_id: str, model: Model, config, work) -> None:
    task = asyncio.create_task(runner.execute(run_id, model, config, work))
    TASKS[run_id] = task
    task.add_done_callback(lambda _: TASKS.pop(run_id, None))


@api.get("/health")
def health() -> dict:
    return {"status": "ok", "version": __version__}


# ----------------------------------------------------------------- models


@api.get("/models")
def list_models() -> list[Model]:
    return db.list_models()


def _validate_model(body: ModelIn) -> None:
    if body.kind == "openai" and (not body.base_url or not body.model):
        raise HTTPException(400, "Base URL and model id are required")


@api.post("/models", status_code=201)
def create_model(body: ModelIn) -> Model:
    _validate_model(body)
    return db.save_model(Model(id=db.new_id(), created_at=db.now(), **body.model_dump()))


@api.post("/models/baseline", status_code=201)
def create_baseline() -> Model:
    existing = next((m for m in db.list_models() if m.kind == "baseline"), None)
    if existing:
        return existing
    return db.save_model(Model(
        id=db.new_id(), created_at=db.now(), name="Random baseline", kind="baseline", base_url=None,
        model="random-baseline", notes="Offline reference that answers at random. Shows each benchmark's chance score.",
    ))


@api.get("/models/{model_id}")
def get_model(model_id: str) -> Model:
    return _model_or_404(model_id)


@api.put("/models/{model_id}")
def update_model(model_id: str, body: ModelIn) -> Model:
    current = _model_or_404(model_id)
    _validate_model(body)
    return db.save_model(Model(id=current.id, created_at=current.created_at, **body.model_dump()))


@api.delete("/models/{model_id}", status_code=204)
def delete_model(model_id: str) -> Response:
    _model_or_404(model_id)
    if db.count_active_runs(model_id):
        raise HTTPException(409, "This model has runs in progress. Cancel them first.")
    db.delete_model(model_id)
    return Response(status_code=204)


@api.post("/models/{model_id}/test")
async def test_model(model_id: str) -> ModelTestResult:
    model = _model_or_404(model_id)
    try:
        completion = await providers.complete_once(
            model, [{"role": "user", "content": "Reply with the single word: pong"}], temperature=0.0, max_tokens=64
        )
        reply = completion.text.strip()[:500]
        if not reply and completion.truncated:  # reasoning models think before answering
            reply = "(reachable; it was still reasoning when the short test stopped)"
        return ModelTestResult(ok=True, latency_ms=completion.latency_ms, response=reply)
    except Exception as e:
        return ModelTestResult(ok=False, error=str(e)[:500])


@api.get("/discover")
async def discover() -> list[DiscoveredServer]:
    return await providers.discover()


@api.get("/server-models")
async def server_models(base_url: str) -> list[str]:
    try:
        return await providers.list_server_models(base_url)
    except Exception as e:
        raise HTTPException(400, f"Could not list models at {base_url}: {e}") from e


# ----------------------------------------------------------------- suites


@api.get("/suites")
def list_suites() -> list[SuiteInfo]:
    return [suites.info(s) for s in suites.all_suites()]


@api.get("/suites/{suite_id}")
def get_suite(suite_id: str) -> Suite:
    suite = suites.get_suite(suite_id)
    if not suite:
        raise HTTPException(404, "Benchmark not found")
    return suite


@api.post("/suites", status_code=201)
def upload_suite(body: SuiteUploadIn) -> SuiteInfo:
    try:
        suite = suites.parse_upload(body)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    return suites.info(db.save_suite(suite))


@api.delete("/suites/{suite_id}", status_code=204)
def delete_suite(suite_id: str) -> Response:
    suite = suites.get_suite(suite_id)
    if not suite:
        raise HTTPException(404, "Benchmark not found")
    if suite.source == "builtin":
        raise HTTPException(400, "Built-in benchmarks can't be deleted")
    db.delete_suite(suite_id)
    return Response(status_code=204)


@api.get("/hub")
def hub_catalog() -> list[HubBenchmark]:
    return hub.catalog()


@api.post("/hub/import", status_code=201)
async def hub_import(body: HubImportIn) -> SuiteInfo:
    try:
        suite = await hub.import_benchmark(body.benchmark, body.limit)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    except Exception as e:
        raise HTTPException(502, f"Download from Hugging Face failed: {e}") from e
    return suites.info(db.save_suite(suite))


# ------------------------------------------------------------------- runs


@api.get("/runs")
def list_runs() -> list[Run]:
    return runner.load_runs(db.list_run_rows(), _models())


@api.post("/runs", status_code=201)
async def create_runs(body: RunIn) -> list[Run]:
    targets = [_model_or_404(mid) for mid in dict.fromkeys(body.model_ids)]
    created = []
    try:
        for model in targets:
            run_id, work = runner.create_run(model, body.config, body.name)
            _start(run_id, model, body.config, work)
            created.append(run_id)
    except runner.RunError as e:
        raise HTTPException(400, str(e)) from e
    models = _models()
    return [runner.to_run(db.get_run_row(rid), [], models) for rid in created]


@api.get("/runs/{run_id}")
def get_run(run_id: str) -> RunDetail:
    return runner.to_detail(_run_or_404(run_id), db.list_samples(run_id), _models())


@api.post("/runs/{run_id}/cancel")
async def cancel_run(run_id: str) -> Run:
    row = _run_or_404(run_id)
    task = TASKS.get(run_id)
    if task:
        task.cancel()
    elif row["status"] in ("queued", "running"):
        runner.finish(run_id, "cancelled")
    row = db.get_run_row(run_id) | ({"status": "cancelled"} if task else {})
    return runner.to_run(row, db.list_samples(run_id), _models())


@api.post("/runs/{run_id}/rerun", status_code=201)
async def rerun(run_id: str) -> Run:
    row = _run_or_404(run_id)
    model = _model_or_404(row["model_id"])
    config = runner.RunConfig.model_validate_json(row["config"])
    try:
        new_id, work = runner.create_run(model, config, row["name"])
    except runner.RunError as e:
        raise HTTPException(400, str(e)) from e
    _start(new_id, model, config, work)
    return runner.to_run(db.get_run_row(new_id), [], _models())


@api.delete("/runs/{run_id}", status_code=204)
async def delete_run(run_id: str) -> Response:
    _run_or_404(run_id)
    task = TASKS.pop(run_id, None)
    if task:
        task.cancel()
    db.delete_run(run_id)
    return Response(status_code=204)


@api.get("/runs/{run_id}/report.md", response_class=PlainTextResponse)
def run_report(run_id: str) -> PlainTextResponse:
    detail = runner.to_detail(_run_or_404(run_id), db.list_samples(run_id), _models())
    return PlainTextResponse(runner.report_markdown(detail), media_type="text/markdown")


@api.get("/runs/{run_id}/samples.csv", response_class=PlainTextResponse)
def run_csv(run_id: str) -> PlainTextResponse:
    detail = runner.to_detail(_run_or_404(run_id), db.list_samples(run_id), _models())
    return PlainTextResponse(
        runner.samples_csv(detail),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="sentinel-run-{run_id}.csv"'},
    )


# ------------------------------------------------------------- playground


@api.post("/chat")
async def chat(body: ChatIn) -> StreamingResponse:
    """Streams NDJSON lines: {"delta"} and {"reasoning"} chunks, then {"done": true, "metrics": {...}}."""
    model = _model_or_404(body.model_id)
    try:
        provider = providers.build_provider(model)
    except providers.ProviderError as e:
        raise HTTPException(400, str(e)) from e
    messages = [m.model_dump() for m in body.messages]

    async def events():
        start = time.perf_counter()
        first = None
        tokens = None
        chars = 0
        finish = None
        try:
            async for event in provider.stream(messages, temperature=body.temperature, max_tokens=body.max_tokens):
                if "delta" in event or "reasoning" in event:
                    first = first or time.perf_counter()
                    chars += len(event.get("delta") or event.get("reasoning"))
                    yield json.dumps(event) + "\n"
                elif "finish" in event:
                    finish = event["finish"]
                elif isinstance(event["usage"].get("completion_tokens"), int):
                    tokens = event["usage"]["completion_tokens"]
        except Exception as e:
            yield json.dumps({"error": str(e)[:500]}) + "\n"
            return
        finally:
            await provider.aclose()
        end = time.perf_counter()
        estimated = tokens is None
        tokens = tokens if tokens is not None else providers.estimate_tokens("x" * chars)
        gen = end - (first or start)
        yield json.dumps({"done": True, "metrics": {
            "latency_ms": round((end - start) * 1000),
            "ttft_ms": round((first - start) * 1000) if first else None,
            "output_tokens": tokens,
            "tokens_per_sec": tokens / gen if gen > 0 and tokens else None,
            "tokens_estimated": estimated,
            "truncated": finish == "length",
        }}) + "\n"

    return StreamingResponse(events(), media_type="application/x-ndjson")


# ------------------------------------------------------------------ arena


@api.post("/arena/battles", status_code=201)
async def create_battle(body: BattleIn) -> Battle:
    try:
        return arena.public(await arena.battle(body))
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


@api.post("/arena/battles/{battle_id}/vote")
def vote(battle_id: str, body: VoteIn) -> Battle:
    battle = db.get_battle(battle_id)
    if not battle:
        raise HTTPException(404, "Battle not found")
    if battle.winner:
        raise HTTPException(409, "This battle already has a vote")
    battle.winner = body.winner
    return db.save_battle(battle)


@api.get("/arena/leaderboard")
def leaderboard() -> list[LeaderboardRow]:
    return arena.leaderboard()


# --------------------------------------------------------------- overview


@api.get("/overview")
def overview() -> Overview:
    models = _models()
    runs = runner.load_runs(db.list_run_rows(), models)
    completed = [r for r in runs if r.status == "completed" and r.model_id in models]
    # Latest completed score per model x suite (runs are newest first)
    matrix: dict[tuple[str, str], MatrixCell] = {}
    for run in completed:
        for s in run.summary.by_suite:
            key = (run.model_id, s.suite_id)
            if s.n and key not in matrix:
                matrix[key] = MatrixCell(model_id=run.model_id, suite_id=s.suite_id, score=s.score, run_id=run.id)
    suite_ids = list(dict.fromkeys(c.suite_id for c in matrix.values()))
    model_ids = list(dict.fromkeys(c.model_id for c in matrix.values()))
    all_suites = {s.id: s for s in suites.all_suites()}
    speeds = [r.summary.perf.tokens_per_sec for r in completed if r.summary.perf.tokens_per_sec]
    return Overview(
        models=len(models),
        runs=len(runs),
        samples=sum(s.n for r in completed for s in r.summary.by_suite),
        avg_tokens_per_sec=sum(speeds) / len(speeds) if speeds else None,
        suites=[suites.info(all_suites[sid]) for sid in suite_ids if sid in all_suites],
        model_rows=[models[mid] for mid in model_ids],
        matrix=list(matrix.values()),
        recent_runs=runs[:6],
    )


app.include_router(api)
