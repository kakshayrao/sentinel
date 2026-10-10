"""Executes evaluation runs and computes their summaries."""

from __future__ import annotations

import asyncio
import csv
import io
import math
import statistics

from . import db
from .models import Model, PerfStats, Run, RunConfig, RunDetail, RunSummary, Sample, Suite, SuiteScore
from .providers import ProviderError, build_provider
from .scorers import display_target, score
from .suites import get_suite, render_messages, sample_items


class RunError(ValueError):
    pass


def resolve_suites(config: RunConfig) -> list[Suite]:
    suites = []
    for suite_id in config.suite_ids:
        suite = get_suite(suite_id)
        if not suite:
            raise RunError(f"Unknown benchmark suite '{suite_id}'")
        suites.append(suite)
    if any(s.scorer == "code" for s in suites) and not config.allow_code_execution:
        raise RunError(
            "Coding benchmarks run model-written code on this machine. "
            "Enable allow_code_execution to include them."
        )
    if any(s.scorer == "judge" for s in suites) and not config.judge_model_id:
        raise RunError("LLM-judged benchmarks need a judge model")
    if config.judge_model_id and not db.get_model(config.judge_model_id):
        raise RunError("Judge model not found")
    return suites


def plan(suites: list[Suite], config: RunConfig) -> list[tuple[Suite, object]]:
    return [(s, item) for s in suites for item in sample_items(s, config.limit, config.seed)]


def create_run(model: Model, config: RunConfig, name: str | None = None) -> tuple[str, list[tuple[Suite, object]]]:
    suites = resolve_suites(config)
    work = plan(suites, config)
    run_id = db.new_id()
    names = [s.name for s in suites]
    label = name or (", ".join(names) if len(names) <= 3 else f"{', '.join(names[:2])} and {len(names) - 2} more")
    db.insert_run(run_id, model.id, label[:120], config, len(work))
    return run_id, work


def finish(run_id: str, status: str, error: str | None = None) -> None:
    """Final state: the summary is computed once and stored, so listings never recompute it."""
    row = db.get_run_row(run_id)
    config = RunConfig.model_validate_json(row["config"])
    summary = summarize(row["total"], db.list_samples(run_id), config.suite_ids)
    db.update_run(run_id, status=status, error=error, finished_at=db.now(), summary=summary.model_dump_json())


async def warm_up(provider) -> None:
    """One tiny request before measuring: fails fast if the server is down, and keeps
    model load time (often many seconds on first use) out of the speed numbers."""
    await provider.complete([{"role": "user", "content": "Reply with: ok"}], temperature=0.0, max_tokens=8)


async def execute(run_id: str, model: Model, config: RunConfig, work: list) -> None:
    """Runs every planned item. Per-item failures are recorded, never fatal."""
    db.update_run(run_id, status="running", started_at=db.now())
    try:
        provider = build_provider(model)
        judge_model = db.get_model(config.judge_model_id) if config.judge_model_id else None
        judge = build_provider(judge_model) if judge_model else None
    except ProviderError as e:
        finish(run_id, "failed", str(e))
        return
    try:
        await _execute(run_id, provider, judge, config, work)
    finally:
        await provider.aclose()
        if judge:
            await judge.aclose()


async def _execute(run_id: str, provider, judge, config: RunConfig, work: list) -> None:
    try:
        await warm_up(provider)
        if judge:
            await warm_up(judge)
    except asyncio.CancelledError:
        finish(run_id, "cancelled")
        raise
    except ProviderError as e:
        finish(run_id, "failed", str(e))
        return

    gate = asyncio.Semaphore(config.concurrency)

    async def one(suite: Suite, item) -> None:
        async with gate:
            messages = render_messages(suite, item)
            prompt = "\n\n".join(m["content"] for m in messages)
            sample = {"run_id": run_id, "suite_id": suite.id, "item_id": item.id,
                      "prompt": prompt, "target": display_target(item)}
            try:
                completion = await provider.complete(
                    messages, temperature=config.temperature, max_tokens=config.max_tokens or suite.max_tokens
                )
                sample |= {
                    "response": completion.text,
                    "latency_ms": completion.latency_ms,
                    "ttft_ms": completion.ttft_ms,
                    "output_tokens": completion.output_tokens,
                    "tokens_estimated": int(completion.tokens_estimated),
                }
                result = await score(suite, item, completion.text, judge)
                detail = result.detail
                if completion.truncated and not result.passed:
                    detail += " · reply hit the max token limit"
                sample |= {"score": result.value, "passed": int(result.passed), "detail": detail}
            except asyncio.CancelledError:
                raise
            except Exception as e:  # network errors, server errors, judge failures
                sample |= {"error": str(e)[:500] or type(e).__name__, "detail": "Error"}
            db.insert_sample(sample)

    try:
        await asyncio.gather(*(one(s, item) for s, item in work))
    except asyncio.CancelledError:
        finish(run_id, "cancelled")
        raise
    except Exception as e:  # a bug or storage failure: never leave the run stuck in "running"
        finish(run_id, "failed", f"{type(e).__name__}: {e}"[:500])
        return
    errors = [s["error"] for s in db.list_samples(run_id) if s["error"]]
    if work and len(errors) == len(work):
        finish(run_id, "failed", errors[0])
    else:
        finish(run_id, "completed")


# ------------------------------------------------------------- summaries


def _percentile(values: list[float], q: float) -> float:
    if len(values) == 1:
        return values[0]
    return statistics.quantiles(values, n=100, method="inclusive")[round(q * 100) - 1]


def _margin(values: list[float]) -> float:
    """Half-width of the 95% confidence interval of the mean (normal approximation)."""
    if len(values) < 2:
        return 0.0
    return 1.96 * statistics.stdev(values) / math.sqrt(len(values))


def summarize(total: int, samples: list[dict], suite_ids: list[str]) -> RunSummary:
    by_suite: list[SuiteScore] = []
    for suite_id in suite_ids:
        rows = [s for s in samples if s["suite_id"] == suite_id]
        scored = [s for s in rows if s["error"] is None and s["score"] is not None]
        values = [s["score"] for s in scored]
        suite = get_suite(suite_id)
        by_suite.append(SuiteScore(
            suite_id=suite_id,
            name=suite.name if suite else suite_id,
            category=suite.category if suite else "custom",
            scorer=suite.scorer if suite else "exact",
            n=len(scored),
            errors=sum(1 for s in rows if s["error"]),
            score=statistics.fmean(values) if values else 0.0,
            margin=_margin(values),
            passed=sum(1 for s in scored if s["passed"]),
        ))
    ok = [s for s in samples if s["error"] is None and s["latency_ms"] is not None]
    latencies = [float(s["latency_ms"]) for s in ok]
    ttfts = [float(s["ttft_ms"]) for s in ok if s["ttft_ms"] is not None]
    gen_seconds = sum(max(0, s["latency_ms"] - (s["ttft_ms"] or 0)) for s in ok) / 1000
    tokens = sum(s["output_tokens"] or 0 for s in ok)
    perf = PerfStats(
        samples=len(ok),
        avg_latency_ms=statistics.fmean(latencies) if latencies else None,
        p50_latency_ms=_percentile(latencies, 0.5) if latencies else None,
        p95_latency_ms=_percentile(latencies, 0.95) if latencies else None,
        avg_ttft_ms=statistics.fmean(ttfts) if ttfts else None,
        tokens_per_sec=tokens / gen_seconds if gen_seconds > 0 and tokens else None,
        output_tokens=tokens,
        tokens_estimated=any(s["tokens_estimated"] for s in ok),
    )
    scored_suites = [s for s in by_suite if s.n]
    k = len(scored_suites)
    return RunSummary(
        total=total,
        completed=len(samples),
        errors=sum(1 for s in samples if s["error"]),
        score=statistics.fmean(s.score for s in scored_suites) if scored_suites else 0.0,
        # Margin of a mean of independent suite means: sqrt(sum(m_i^2)) / k
        margin=math.sqrt(sum(s.margin**2 for s in scored_suites)) / k if k else 0.0,
        by_suite=by_suite,
        perf=perf,
    )


FINAL = ("completed", "failed", "cancelled")


def load_runs(rows: list[dict], models: dict[str, Model]) -> list[Run]:
    """Finished runs use their stored summary; only active (or older, unsummarized) runs
    read their samples. Older finished runs get their summary stored on first read."""
    pending = [r["id"] for r in rows if not r.get("summary")]
    samples = db.samples_by_run(pending)
    runs = []
    for row in rows:
        run = to_run(row, samples.get(row["id"], []), models)
        if not row.get("summary") and row["status"] in FINAL:
            db.update_run(row["id"], summary=run.summary.model_dump_json())
        runs.append(run)
    return runs


def to_run(row: dict, samples: list[dict], models: dict[str, Model]) -> Run:
    config = RunConfig.model_validate_json(row["config"])
    model = models.get(row["model_id"])
    stored = row.get("summary") if row["status"] in FINAL else None
    return Run(
        id=row["id"],
        name=row["name"],
        model_id=row["model_id"],
        model_name=model.name if model else "(deleted model)",
        status=row["status"],
        config=config,
        created_at=row["created_at"],
        started_at=row["started_at"],
        finished_at=row["finished_at"],
        error=row["error"],
        summary=RunSummary.model_validate_json(stored) if stored else summarize(row["total"], samples, config.suite_ids),
    )


def to_detail(row: dict, samples: list[dict], models: dict[str, Model]) -> RunDetail:
    run = to_run(row, samples, models)
    return RunDetail(
        **run.model_dump(),
        samples=[
            Sample(**{k: s[k] for k in Sample.model_fields if k in s} | {"passed": None if s["passed"] is None else bool(s["passed"])})
            for s in samples
        ],
    )


def report_markdown(run: RunDetail) -> str:
    p = run.summary.perf
    lines = [
        f"# {run.name}",
        "",
        f"- Model: **{run.model_name}**",
        f"- Status: {run.status}",
        f"- Overall score: **{run.summary.score * 100:.1f}%** ± {run.summary.margin * 100:.1f} "
        f"({run.summary.completed}/{run.summary.total} items, {run.summary.errors} errors)",
        f"- Temperature: {run.config.temperature}, seed {run.config.seed}",
        "",
        "| Benchmark | Scorer | Items | Score | 95% CI | Passed |",
        "|---|---|---:|---:|---:|---:|",
        *[f"| {s.name} | {s.scorer} | {s.n} | {s.score * 100:.1f}% | ± {s.margin * 100:.1f} | {s.passed} |"
          for s in run.summary.by_suite],
        "",
        "## Performance",
        "",
        f"- Average latency: {p.avg_latency_ms or 0:.0f} ms (p50 {p.p50_latency_ms or 0:.0f}, p95 {p.p95_latency_ms or 0:.0f})",
        f"- Average time to first token: {p.avg_ttft_ms or 0:.0f} ms",
        f"- Output speed: {p.tokens_per_sec or 0:.1f} tokens/s{' (estimated)' if p.tokens_estimated else ''}",
        "",
    ]
    return "\n".join(lines)


CSV_COLUMNS = ["suite_id", "item_id", "passed", "score", "detail", "latency_ms", "ttft_ms",
               "output_tokens", "error", "target", "response", "prompt"]


def samples_csv(run: RunDetail) -> str:
    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow(CSV_COLUMNS)
    for s in run.samples:
        writer.writerow([getattr(s, c) for c in CSV_COLUMNS])
    return out.getvalue()
