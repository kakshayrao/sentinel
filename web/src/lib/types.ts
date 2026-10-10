// Mirror of backend/sentinel/models.py. Keep the two in sync.

export type ProviderKind = "openai" | "baseline";
export type Scorer = "choice" | "numeric" | "exact" | "contains" | "f1" | "rouge_l" | "json" | "ifeval" | "code" | "judge";
export type SuiteCategory =
  | "knowledge"
  | "reasoning"
  | "math"
  | "coding"
  | "instruction"
  | "reading"
  | "summarization"
  | "structured"
  | "multilingual"
  | "chat"
  | "custom";
export type SuiteSource = "builtin" | "hub" | "custom";
export type RunStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface ModelIn {
  name: string;
  kind: ProviderKind;
  base_url: string | null;
  model: string | null;
  api_key_env: string | null;
  notes: string | null;
}

export interface Model extends ModelIn {
  id: string;
  created_at: string;
}

export interface ModelTestResult {
  ok: boolean;
  latency_ms: number | null;
  response: string | null;
  error: string | null;
}

export interface DiscoveredServer {
  name: string;
  base_url: string;
  models: string[];
}

export interface Item {
  id: string;
  input: string;
  context: string | null;
  choices: string[];
  target: unknown;
  constraints: Record<string, unknown>[];
  tests: string | null;
  entry_point: string | null;
  meta: Record<string, unknown>;
}

export interface SuiteInfo {
  id: string;
  name: string;
  description: string;
  category: SuiteCategory;
  scorer: Scorer;
  prompt_template: string;
  system_prompt: string | null;
  max_tokens: number;
  source: SuiteSource;
  item_count: number;
}

export interface Suite extends SuiteInfo {
  items: Item[];
}

export interface SuiteUploadIn {
  name: string;
  description: string;
  category: SuiteCategory;
  scorer: Scorer;
  prompt_template: string;
  system_prompt: string | null;
  max_tokens: number;
  jsonl: string;
}

export interface HubBenchmark {
  id: string;
  name: string;
  description: string;
  dataset: string;
  category: SuiteCategory;
  size: string;
}

export interface RunConfig {
  suite_ids: string[];
  limit: number | null;
  temperature: number;
  max_tokens: number | null;
  concurrency: number;
  judge_model_id: string | null;
  allow_code_execution: boolean;
  seed: number;
}

export interface RunIn {
  model_ids: string[];
  name?: string | null;
  config: RunConfig;
}

export interface SuiteScore {
  suite_id: string;
  name: string;
  category: SuiteCategory;
  scorer: Scorer;
  n: number;
  errors: number;
  score: number; // 0..1
  margin: number; // 95% confidence interval half-width
  passed: number;
}

export interface PerfStats {
  samples: number;
  avg_latency_ms: number | null;
  p50_latency_ms: number | null;
  p95_latency_ms: number | null;
  avg_ttft_ms: number | null;
  tokens_per_sec: number | null;
  output_tokens: number;
  tokens_estimated: boolean;
}

export interface RunSummary {
  total: number;
  completed: number;
  errors: number;
  score: number; // 0..1
  margin: number; // 95% confidence interval half-width
  by_suite: SuiteScore[];
  perf: PerfStats;
}

export interface Run {
  id: string;
  name: string;
  model_id: string;
  model_name: string;
  status: RunStatus;
  config: RunConfig;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  error: string | null;
  summary: RunSummary;
}

export interface Sample {
  id: number;
  run_id: string;
  suite_id: string;
  item_id: string;
  prompt: string;
  response: string | null;
  target: string | null;
  score: number | null;
  passed: boolean | null;
  detail: string;
  latency_ms: number | null;
  ttft_ms: number | null;
  output_tokens: number | null;
  truncated: boolean; // stopped at the max token limit
  error: string | null;
  created_at: string;
}

export interface RunDetail extends Run {
  samples: Sample[];
}

export interface BattleIn {
  prompt: string;
  model_a_id?: string | null;
  model_b_id?: string | null;
  temperature?: number;
  max_tokens?: number;
}

export interface BattleSide {
  response: string | null;
  error: string | null;
  latency_ms: number | null;
  tokens_per_sec: number | null;
  truncated: boolean;
  model_id: string | null;
  model_name: string | null;
}

export type Verdict = "a" | "b" | "tie" | "both_bad";

export interface Battle {
  id: string;
  prompt: string;
  a: BattleSide;
  b: BattleSide;
  winner: Verdict | null;
  created_at: string;
}

export interface LeaderboardRow {
  model_id: string;
  model_name: string;
  rating: number;
  battles: number;
  wins: number;
  losses: number;
  ties: number;
}

export interface MatrixCell {
  model_id: string;
  suite_id: string;
  score: number;
  run_id: string;
}

export interface Overview {
  models: number;
  runs: number;
  samples: number;
  avg_tokens_per_sec: number | null;
  suites: SuiteInfo[];
  model_rows: Model[];
  matrix: MatrixCell[];
  recent_runs: Run[];
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatMetrics {
  latency_ms: number;
  ttft_ms: number | null;
  output_tokens: number;
  tokens_per_sec: number | null;
  tokens_estimated: boolean;
  truncated: boolean;
}
