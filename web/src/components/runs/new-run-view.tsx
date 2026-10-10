"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { CheckIcon, Loader2Icon, PlayIcon, PlusIcon, TriangleAlertIcon } from "lucide-react";

import { CategoryBadge } from "@/components/badges";
import { PageBody, PageHeader } from "@/components/page-header";
import { ErrorState, LoadingRows } from "@/components/states";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { api, useModels, useSuites } from "@/lib/api";
import { num } from "@/lib/format";
import { CATEGORY_LABELS, SCORER_LABELS } from "@/lib/labels";
import type { Run, RunIn, SuiteCategory } from "@/lib/types";
import { cn } from "@/lib/utils";

function toggle(list: string[], id: string) {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

function SelectCard({
  selected,
  onClick,
  children,
  className,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "hover:border-foreground/30 relative flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors",
        selected && "border-foreground bg-muted/40",
        className,
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border",
          selected && "bg-foreground border-foreground text-background",
        )}
      >
        {selected && <CheckIcon className="size-3" />}
      </span>
      <span className="min-w-0 flex-1">{children}</span>
    </button>
  );
}

export function NewRunView() {
  const { data: models, error: modelsError } = useModels();
  const { data: suites, error: suitesError } = useSuites();
  const params = useSearchParams();
  const router = useRouter();

  const [pickedModels, setPickedModels] = useState<string[] | null>(null);
  const [pickedSuites, setPickedSuites] = useState<string[] | null>(null);
  const [limitAll, setLimitAll] = useState(true);
  const [limit, setLimit] = useState(20);
  const [temperature, setTemperature] = useState(0);
  const [maxTokens, setMaxTokens] = useState("");
  const [concurrency, setConcurrency] = useState(2);
  const [judgeId, setJudgeId] = useState<string>("");
  const [allowCode, setAllowCode] = useState(false);
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Until the user picks, preselect from ?model= / ?suite= (or sensible defaults)
  const modelIds = useMemo(() => {
    if (pickedModels) return pickedModels;
    const m = params.get("model");
    if (m && models?.some((x) => x.id === m)) return [m];
    return models?.length === 1 ? [models[0].id] : [];
  }, [pickedModels, params, models]);
  const suiteIds = useMemo(() => {
    if (pickedSuites) return pickedSuites;
    const s = params.get("suite");
    if (s && suites?.some((x) => x.id === s)) return [s];
    return (suites ?? []).filter((x) => x.source === "builtin" && x.scorer !== "code" && x.scorer !== "judge").map((x) => x.id);
  }, [pickedSuites, params, suites]);
  const setModelIds = (update: (ids: string[]) => string[]) => setPickedModels(update(modelIds));
  const setSuiteIds = (ids: string[]) => setPickedSuites(ids);

  // One dense grid ordered by category, so related benchmarks sit together
  const ordered = useMemo(() => {
    const rank = Object.keys(CATEGORY_LABELS) as SuiteCategory[];
    return [...(suites ?? [])].sort((a, b) => rank.indexOf(a.category) - rank.indexOf(b.category) || a.name.localeCompare(b.name));
  }, [suites]);

  const chosen = (suites ?? []).filter((s) => suiteIds.includes(s.id));
  const needsJudge = chosen.some((s) => s.scorer === "judge");
  const needsCode = chosen.some((s) => s.scorer === "code");
  const itemsPerModel = chosen.reduce((a, s) => a + (limitAll ? s.item_count : Math.min(limit, s.item_count)), 0);
  const totalCalls = itemsPerModel * modelIds.length;
  const blocked =
    !modelIds.length || !suiteIds.length || (needsJudge && !judgeId) || (needsCode && !allowCode) || submitting;

  async function submit() {
    setSubmitting(true);
    const body: RunIn = {
      model_ids: modelIds,
      name: name.trim() || null,
      config: {
        suite_ids: suiteIds,
        limit: limitAll ? null : limit,
        temperature,
        max_tokens: maxTokens ? Number(maxTokens) : null,
        concurrency,
        judge_model_id: needsJudge ? judgeId : null,
        allow_code_execution: needsCode && allowCode,
        seed: 7,
      },
    };
    try {
      const runs = await api.post<Run[]>("/runs", body);
      toast.success(runs.length === 1 ? "Run started" : `${runs.length} runs started`);
      router.push(runs.length === 1 ? `/runs/${runs[0].id}` : "/runs");
    } catch (e) {
      toast.error((e as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <>
      <PageHeader title="New run" description="Choose models and benchmarks. Each selected model gets its own run." />
      <PageBody className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:space-y-0">
        <div className="min-w-0 space-y-6">
          {(modelsError || suitesError) && <ErrorState error={modelsError ?? suitesError} />}

          <Card>
            <CardHeader>
              <CardTitle>1. Models</CardTitle>
              <CardDescription>Select one or more. Running several on the same benchmarks makes them easy to compare.</CardDescription>
              <CardAction>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/models?new=1">
                    <PlusIcon /> Add model
                  </Link>
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent>
              {!models ? (
                <LoadingRows rows={2} />
              ) : models.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  No models yet. <Link className="text-foreground underline" href="/models?new=1">Add one</Link> first.
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {models.map((m) => (
                    <SelectCard key={m.id} selected={modelIds.includes(m.id)} onClick={() => setModelIds((ids) => toggle(ids, m.id))}>
                      <span className="block truncate text-sm font-medium">{m.name}</span>
                      <span className="text-muted-foreground block truncate font-mono text-xs">{m.model}</span>
                    </SelectCard>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>2. Benchmarks</CardTitle>
              <CardDescription>
                {suiteIds.length} selected · {num(chosen.reduce((a, s) => a + s.item_count, 0))} items in total
              </CardDescription>
              <CardAction className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={() => setSuiteIds((suites ?? []).map((s) => s.id))}>
                  Select all
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setSuiteIds([])}>
                  Clear
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent>
              {!suites && <LoadingRows rows={3} />}
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {ordered.map((s) => (
                  <SelectCard key={s.id} selected={suiteIds.includes(s.id)} onClick={() => setSuiteIds(toggle(suiteIds, s.id))}>
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">{s.name}</span>
                      <span className="text-muted-foreground tabular shrink-0 text-xs">{num(s.item_count)}</span>
                    </span>
                    <span className="text-muted-foreground block truncate text-xs">
                      {CATEGORY_LABELS[s.category]} · {SCORER_LABELS[s.scorer].label}
                      {s.source === "hub" && " · Hugging Face"}
                      {s.source === "custom" && " · Custom"}
                    </span>
                  </SelectCard>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>3. Settings</CardTitle>
              <CardDescription>Defaults suit most comparisons: greedy decoding and a fixed sample.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <div className="space-y-3">
                  <Label>Items per benchmark</Label>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox checked={limitAll} onCheckedChange={(v) => setLimitAll(v === true)} /> All items
                    </label>
                    <Input
                      type="number"
                      min={1}
                      value={limit}
                      disabled={limitAll}
                      onChange={(e) => setLimit(Math.max(1, Number(e.target.value) || 1))}
                      className="w-24"
                    />
                  </div>
                  <p className="text-muted-foreground text-xs">A seeded sample, so repeated runs use the same items.</p>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Temperature</Label>
                    <span className="tabular text-muted-foreground text-sm">{temperature.toFixed(1)}</span>
                  </div>
                  <Slider value={[temperature]} min={0} max={1.5} step={0.1} onValueChange={([v]) => setTemperature(v)} />
                  <p className="text-muted-foreground text-xs">0 gives deterministic, reproducible answers.</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="max_tokens">Max output tokens</Label>
                  <Input
                    id="max_tokens"
                    type="number"
                    min={16}
                    placeholder="Benchmark default"
                    value={maxTokens}
                    onChange={(e) => setMaxTokens(e.target.value)}
                  />
                  <p className="text-muted-foreground text-xs">Raise this for reasoning models that think before answering.</p>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Parallel requests</Label>
                    <span className="tabular text-muted-foreground text-sm">{concurrency}</span>
                  </div>
                  <Slider value={[concurrency]} min={1} max={8} step={1} onValueChange={([v]) => setConcurrency(v)} />
                  <p className="text-muted-foreground text-xs">Keep this low on a single GPU; speed numbers are most accurate at 1.</p>
                </div>
              </div>

              {needsJudge && (
                <div className="space-y-2">
                  <Separator />
                  <Label className="pt-4">Judge model</Label>
                  <Select value={judgeId} onValueChange={setJudgeId}>
                    <SelectTrigger className="w-full sm:w-80">
                      <SelectValue placeholder="Choose the model that grades answers" />
                    </SelectTrigger>
                    <SelectContent>
                      {models?.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-muted-foreground text-xs">
                    LLM-judged benchmarks need a grader. Use your strongest model, ideally not the one being tested.
                  </p>
                </div>
              )}

              {needsCode && (
                <Alert>
                  <TriangleAlertIcon />
                  <AlertTitle>Coding benchmarks run model-written code</AlertTitle>
                  <AlertDescription className="space-y-3">
                    <p>
                      The generated Python runs on this computer in a separate process with a time limit. That stops
                      hangs and crashes, but it is not a security sandbox.
                    </p>
                    <label className="text-foreground flex items-center gap-2 font-medium">
                      <Checkbox checked={allowCode} onCheckedChange={(v) => setAllowCode(v === true)} /> I understand, run
                      the generated code
                    </label>
                  </AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="run-name">
                  Run name <span className="text-muted-foreground font-normal">(optional)</span>
                </Label>
                <Input id="run-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. after LoRA epoch 3" />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:sticky lg:top-32 lg:self-start">
          <Card>
            <CardHeader>
              <CardTitle>Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Models</span>
                <span className="tabular font-medium">{modelIds.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Benchmarks</span>
                <span className="tabular font-medium">{suiteIds.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Items per model</span>
                <span className="tabular font-medium">{num(itemsPerModel)}</span>
              </div>
              <Separator />
              <div className="flex items-end justify-between">
                <span className="text-muted-foreground">Model calls</span>
                <span className="tabular text-2xl font-semibold">{num(totalCalls)}</span>
              </div>
              {chosen.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {[...new Set(chosen.map((s) => s.category))].map((c) => (
                    <CategoryBadge key={c} category={c} />
                  ))}
                </div>
              )}
              <Button className="w-full" size="lg" disabled={blocked} onClick={submit}>
                {submitting ? <Loader2Icon className="animate-spin" /> : <PlayIcon />} Start {modelIds.length > 1 ? `${modelIds.length} runs` : "run"}
              </Button>
              {needsJudge && !judgeId && <p className="text-muted-foreground text-xs">Choose a judge model to continue.</p>}
              {needsCode && !allowCode && <p className="text-muted-foreground text-xs">Allow code execution to include coding benchmarks.</p>}
            </CardContent>
          </Card>
        </div>
      </PageBody>
    </>
  );
}
