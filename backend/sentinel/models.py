"""Data contracts shared by the engine, the API and the CLI.

The TypeScript mirror lives in web/src/lib/types.ts. Keep the two in sync.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

ProviderKind = Literal["openai", "baseline"]
Scorer = Literal["choice", "numeric", "exact", "contains", "f1", "rouge_l", "json", "ifeval", "code", "judge"]
SuiteCategory = Literal[
    "knowledge",
    "reasoning",
    "math",
    "coding",
    "instruction",
    "reading",
    "summarization",
    "structured",
    "multilingual",
    "chat",
    "custom",
]
SuiteSource = Literal["builtin", "hub", "custom"]
RunStatus = Literal["queued", "running", "completed", "failed", "cancelled"]


# ----------------------------------------------------------------- models


class ModelIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)  # display name
    kind: ProviderKind = "openai"
    base_url: str | None = "http://localhost:11434/v1"  # any OpenAI-compatible server
    model: str | None = None  # model id on that server, e.g. "llama3.1:8b"
    api_key_env: str | None = None  # NAME of an env var holding a key, if the server needs one
    notes: str | None = None


class Model(ModelIn):
    id: str
    created_at: str


class ModelTestResult(BaseModel):
    ok: bool
    latency_ms: int | None = None
    response: str | None = None
    error: str | None = None


class DiscoveredServer(BaseModel):
    name: str  # "Ollama", "LM Studio", ...
    base_url: str
    models: list[str]


# ----------------------------------------------------------------- suites


class Item(BaseModel):
    id: str
    input: str  # question / instruction
    context: str | None = None  # passage for reading / summarization tasks
    choices: list[str] = Field(default_factory=list)  # multiple choice options
    target: Any = None  # str | list[str] | dict, depending on the scorer
    constraints: list[dict[str, Any]] = Field(default_factory=list)  # ifeval checks
    tests: str | None = None  # coding: test code defining check(candidate)
    entry_point: str | None = None  # coding: function name under test
    meta: dict[str, Any] = Field(default_factory=dict)


class SuiteInfo(BaseModel):
    id: str
    name: str
    description: str = ""
    category: SuiteCategory = "custom"
    scorer: Scorer
    # Placeholders: {input}, {context}, {choices} (rendered "A. ...\nB. ...")
    prompt_template: str = "{input}"
    system_prompt: str | None = None
    max_tokens: int = 512
    source: SuiteSource = "custom"
    item_count: int = 0


class Suite(SuiteInfo):
    items: list[Item]


class SuiteUploadIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    description: str = ""
    category: SuiteCategory = "custom"
    scorer: Scorer
    prompt_template: str = "{input}"
    system_prompt: str | None = None
    max_tokens: int = Field(512, ge=16, le=8192)
    # One JSON object per line: {"input": ..., "target": ..., "choices"?: [...], "context"?: ..., "id"?: ...}
    jsonl: str = Field(min_length=2)


class HubBenchmark(BaseModel):
    id: str  # local key, e.g. "gsm8k"
    name: str
    description: str
    dataset: str  # Hugging Face dataset id
    category: SuiteCategory
    size: str  # human hint, e.g. "1,319 test problems"


class HubImportIn(BaseModel):
    benchmark: str
    limit: int = Field(100, ge=1, le=2000)


# ------------------------------------------------------------------- runs


class RunConfig(BaseModel):
    suite_ids: list[str] = Field(min_length=1)
    limit: int | None = Field(None, ge=1)  # items per suite (seeded sample)
    temperature: float = Field(0.0, ge=0, le=2)
    max_tokens: int | None = Field(None, ge=16, le=8192)  # overrides each suite's default
    concurrency: int = Field(2, ge=1, le=16)
    judge_model_id: str | None = None  # needed by "judge" suites
    # Coding suites run model-written code in a local subprocess. Off unless explicitly allowed.
    allow_code_execution: bool = False
    seed: int = 7


class RunIn(BaseModel):
    model_ids: list[str] = Field(min_length=1)  # one run is created per model
    name: str | None = None
    config: RunConfig


class SuiteScore(BaseModel):
    suite_id: str
    name: str
    category: SuiteCategory
    scorer: Scorer
    n: int  # scored items (errors excluded)
    errors: int
    score: float  # mean score 0..1
    margin: float = 0.0  # 95% confidence interval half-width, same units as score
    passed: int  # items with passed == True


class PerfStats(BaseModel):
    samples: int
    avg_latency_ms: float | None = None
    p50_latency_ms: float | None = None
    p95_latency_ms: float | None = None
    avg_ttft_ms: float | None = None
    tokens_per_sec: float | None = None  # mean output tokens / generation second
    output_tokens: int = 0
    tokens_estimated: bool = False  # server didn't report usage; counted ~4 chars per token


class RunSummary(BaseModel):
    total: int  # planned items
    completed: int  # recorded results, including errors
    errors: int
    score: float  # macro average of suite scores, 0..1
    margin: float = 0.0  # 95% confidence interval half-width of the overall score
    by_suite: list[SuiteScore]
    perf: PerfStats


class Run(BaseModel):
    id: str
    name: str
    model_id: str
    model_name: str
    status: RunStatus
    config: RunConfig
    created_at: str
    started_at: str | None = None
    finished_at: str | None = None
    error: str | None = None
    summary: RunSummary


class Sample(BaseModel):
    id: int
    run_id: str
    suite_id: str
    item_id: str
    prompt: str
    response: str | None
    target: str | None  # display form of the expected answer
    score: float | None  # 0..1, None on error
    passed: bool | None
    detail: str  # scorer explanation
    latency_ms: int | None = None
    ttft_ms: int | None = None
    output_tokens: int | None = None
    error: str | None = None
    created_at: str


class RunDetail(Run):
    samples: list[Sample]


# ------------------------------------------------------------------ arena


class BattleIn(BaseModel):
    prompt: str = Field(min_length=1, max_length=8000)
    model_a_id: str | None = None  # random pick when omitted
    model_b_id: str | None = None
    temperature: float = Field(0.7, ge=0, le=2)
    max_tokens: int = Field(1024, ge=16, le=8192)


class BattleSide(BaseModel):
    response: str | None
    error: str | None = None
    latency_ms: int | None = None
    tokens_per_sec: float | None = None
    model_id: str | None = None  # hidden until voted
    model_name: str | None = None  # hidden until voted


class Battle(BaseModel):
    id: str
    prompt: str
    a: BattleSide
    b: BattleSide
    winner: Literal["a", "b", "tie", "both_bad"] | None = None
    created_at: str


class VoteIn(BaseModel):
    winner: Literal["a", "b", "tie", "both_bad"]


class LeaderboardRow(BaseModel):
    model_id: str
    model_name: str
    rating: float  # Elo, starts at 1000
    battles: int
    wins: int
    losses: int
    ties: int


# ------------------------------------------------------------- dashboard


class MatrixCell(BaseModel):
    model_id: str
    suite_id: str
    score: float
    run_id: str


class Overview(BaseModel):
    models: int
    runs: int
    samples: int  # scored samples across completed runs
    avg_tokens_per_sec: float | None
    suites: list[SuiteInfo]  # suites that appear in the matrix
    model_rows: list[Model]  # models that appear in the matrix
    matrix: list[MatrixCell]  # latest completed score per model x suite
    recent_runs: list[Run]


class ChatMessage(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str


class ChatIn(BaseModel):
    model_id: str
    messages: list[ChatMessage] = Field(min_length=1)
    temperature: float = Field(0.7, ge=0, le=2)
    max_tokens: int = Field(1024, ge=16, le=8192)
