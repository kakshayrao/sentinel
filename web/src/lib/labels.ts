import type { Scorer, SuiteCategory, SuiteSource } from "@/lib/types";

export const CATEGORY_LABELS: Record<SuiteCategory, string> = {
  knowledge: "Knowledge",
  reasoning: "Reasoning",
  math: "Math",
  coding: "Coding",
  instruction: "Instruction following",
  reading: "Reading",
  summarization: "Summarization",
  structured: "Structured output",
  multilingual: "Multilingual",
  chat: "Chat quality",
  custom: "Custom",
};

export const SCORER_LABELS: Record<Scorer, { label: string; description: string }> = {
  choice: { label: "Multiple choice", description: "Extracts the option letter and compares it with the answer key." },
  numeric: { label: "Numeric", description: "Compares the final number in the reply with the expected value." },
  exact: { label: "Exact match", description: "Normalized text must equal one of the expected answers." },
  contains: { label: "Contains", description: "Passes if the reply contains one of the expected answers." },
  f1: { label: "Token F1", description: "Word-overlap F1 with the reference answer (SQuAD style). Passes at 0.5." },
  rouge_l: { label: "ROUGE-L", description: "Longest-common-subsequence overlap with a reference. Passes at 0.3." },
  json: { label: "JSON fields", description: "Parses a JSON object and checks each expected field." },
  ifeval: { label: "Instruction checks", description: "Verifies formatting rules such as word limits, bullets and case." },
  code: { label: "Unit tests", description: "Runs the generated Python against unit tests (pass@1)." },
  judge: { label: "LLM judge", description: "A judge model rates each reply from 1 to 10 using reference notes." },
};

export const SOURCE_LABELS: Record<SuiteSource, string> = {
  builtin: "Built-in",
  hub: "Hugging Face",
  custom: "Custom",
};

export const SERVER_PRESETS = [
  { name: "Ollama", base_url: "http://localhost:11434/v1" },
  { name: "LM Studio", base_url: "http://localhost:1234/v1" },
  { name: "llama.cpp", base_url: "http://localhost:8080/v1" },
  { name: "vLLM", base_url: "http://localhost:8000/v1" },
  { name: "Jan", base_url: "http://localhost:1337/v1" },
];
