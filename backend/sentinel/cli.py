"""Command line: serve the API, run evaluations (with a CI gate), import benchmarks."""

from __future__ import annotations

import argparse
import asyncio
import json
import sys

from . import db, hub, providers, runner, suites
from .models import Model, RunConfig


def _find_model(ref: str) -> Model:
    models = db.list_models()
    match = next((m for m in models if m.id == ref), None) or next(
        (m for m in models if m.name.lower() == ref.lower()), None
    )
    if not match:
        names = ", ".join(m.name for m in models) or "none yet"
        sys.exit(f"Model '{ref}' not found. Registered models: {names}")
    return match


def _register(base_url: str, model_id: str) -> Model:
    existing = next((m for m in db.list_models() if m.base_url == base_url and m.model == model_id), None)
    if existing:
        return existing
    return db.save_model(Model(id=db.new_id(), created_at=db.now(), name=model_id, base_url=base_url, model=model_id))


def cmd_serve(args: argparse.Namespace) -> None:
    import uvicorn

    uvicorn.run("sentinel.api:app", host=args.host, port=args.port, reload=args.reload)


def cmd_run(args: argparse.Namespace) -> None:
    if args.endpoint:
        if not args.model_id:
            sys.exit("--endpoint needs --model-id (the model name on that server)")
        model = _register(args.endpoint, args.model_id)
    elif args.model:
        model = _find_model(args.model)
    else:
        sys.exit("Pass --model <name|id>, or --endpoint URL --model-id ID")
    suite_ids = args.suites.split(",") if args.suites else [s.id for s in suites.builtin_suites() if s.scorer not in ("code", "judge")]
    config = RunConfig(
        suite_ids=suite_ids,
        limit=args.limit,
        temperature=args.temperature,
        concurrency=args.concurrency,
        judge_model_id=_find_model(args.judge).id if args.judge else None,
        allow_code_execution=args.allow_code_exec,
    )
    try:
        run_id, work = runner.create_run(model, config, args.name)
    except runner.RunError as e:
        sys.exit(str(e))
    print(f"Evaluating {model.name} on {len(work)} items across {len(suite_ids)} benchmark(s)...")
    asyncio.run(runner.execute(run_id, model, config, work))

    detail = runner.to_detail(db.get_run_row(run_id), db.list_samples(run_id), {model.id: model})
    s = detail.summary
    print(f"\n{'Benchmark':<34}{'Items':>7}{'Score':>9}")
    for b in s.by_suite:
        print(f"{b.name[:33]:<34}{b.n:>7}{b.score * 100:>8.1f}%")
    print(f"{'Overall':<34}{s.completed - s.errors:>7}{s.score * 100:>8.1f}%")
    if s.perf.tokens_per_sec:
        print(f"\nSpeed: {s.perf.tokens_per_sec:.1f} tokens/s, avg latency {s.perf.avg_latency_ms:.0f} ms")
    if s.errors:
        print(f"Errors: {s.errors} (first: {next(x.error for x in detail.samples if x.error)})")
    print(f"Run id: {run_id} (status: {detail.status})")

    if args.json:
        with open(args.json, "w", encoding="utf-8") as f:
            f.write(detail.model_dump_json(indent=2))
    if args.markdown:
        with open(args.markdown, "w", encoding="utf-8") as f:
            f.write(runner.report_markdown(detail))
    if detail.status != "completed":
        sys.exit(1)
    if args.fail_below is not None and s.score < args.fail_below:
        print(f"FAIL: score {s.score:.3f} is below the threshold {args.fail_below}")
        sys.exit(1)


def cmd_suites(args: argparse.Namespace) -> None:
    for s in suites.all_suites():
        print(f"{s.id:<32}{s.category:<14}{s.scorer:<10}{len(s.items):>6}  {s.name}")


def cmd_import(args: argparse.Namespace) -> None:
    try:
        suite = asyncio.run(hub.import_benchmark(args.benchmark, args.limit))
    except ValueError as e:
        sys.exit(str(e))
    db.save_suite(suite)
    print(f"Imported {suite.name}: {len(suite.items)} items as '{suite.id}'")


def cmd_models(args: argparse.Namespace) -> None:
    for m in db.list_models():
        print(f"{m.id}  {m.name:<28}{m.kind:<10}{m.base_url or '':<34}{m.model or ''}")


def cmd_discover(args: argparse.Namespace) -> None:
    servers = asyncio.run(providers.discover())
    if not servers:
        print("No local model servers found on the usual ports.")
    for s in servers:
        print(f"{s.name} at {s.base_url}: {', '.join(s.models) or 'no models loaded'}")


def main() -> None:
    parser = argparse.ArgumentParser(prog="sentinel", description="Evaluate and benchmark local LLMs.")
    parser.add_argument("--db", help="SQLite database path (default: $SENTINEL_DB or ./sentinel.db)")
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("serve", help="Start the API server")
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--port", type=int, default=8765)
    p.add_argument("--reload", action="store_true")
    p.set_defaults(func=cmd_serve)

    p = sub.add_parser("run", help="Evaluate a model and print the scores")
    p.add_argument("--model", help="Registered model name or id")
    p.add_argument("--endpoint", help="OpenAI-compatible base URL, e.g. http://localhost:11434/v1")
    p.add_argument("--model-id", help="Model id on that server, e.g. llama3.1:8b")
    p.add_argument("--suites", help="Comma-separated suite ids (default: built-in suites)")
    p.add_argument("--limit", type=int, help="Items per suite")
    p.add_argument("--temperature", type=float, default=0.0)
    p.add_argument("--concurrency", type=int, default=2)
    p.add_argument("--judge", help="Judge model name or id, for LLM-judged suites")
    p.add_argument("--allow-code-exec", action="store_true", help="Allow coding suites to run model-written code")
    p.add_argument("--name", help="Run name")
    p.add_argument("--fail-below", type=float, help="Exit 1 if the overall score (0..1) is below this")
    p.add_argument("--json", help="Write the full run to this JSON file")
    p.add_argument("--markdown", help="Write a Markdown report to this file")
    p.set_defaults(func=cmd_run)

    p = sub.add_parser("suites", help="List benchmark suites")
    p.set_defaults(func=cmd_suites)

    p = sub.add_parser("import", help="Import a standard benchmark from Hugging Face")
    p.add_argument("benchmark", choices=list(hub.SPECS))
    p.add_argument("--limit", type=int, default=100)
    p.set_defaults(func=cmd_import)

    p = sub.add_parser("models", help="List registered models")
    p.set_defaults(func=cmd_models)

    p = sub.add_parser("discover", help="Find local model servers")
    p.set_defaults(func=cmd_discover)

    args = parser.parse_args()
    for stream in (sys.stdout, sys.stderr):  # Windows consoles default to cp1252
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    if args.db:
        db.configure(args.db)
    else:
        db.init()
    args.func(args)


if __name__ == "__main__":
    main()
