"use client";

import Link from "next/link";
import { toast } from "sonner";
import { ArrowRightIcon, BoxIcon, GaugeIcon, ListChecksIcon, PlayIcon, PlusIcon, SparklesIcon, TargetIcon } from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { ScoreBadge, StatusBadge, TONE_TEXT } from "@/components/badges";
import { PageBody, PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { ErrorState, LoadingRows } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, useDiscover, useModels, useOverview } from "@/lib/api";
import { num, points, scoreTone, timeAgo, tps } from "@/lib/format";
import type { Overview } from "@/lib/types";
import { cn } from "@/lib/utils";

const HEAT = {
  success: "bg-emerald-500/15 hover:bg-emerald-500/25",
  warning: "bg-amber-500/15 hover:bg-amber-500/25",
  danger: "bg-red-500/15 hover:bg-red-500/25",
};

function Onboarding({ onChange }: { onChange: () => void }) {
  const { data: servers, isLoading } = useDiscover();

  async function add(name: string, base_url: string, model: string) {
    try {
      await api.post("/models", { name: model, kind: "openai", base_url, model, api_key_env: null, notes: `Detected on ${name}` });
      toast.success(`Added ${model}`);
      onChange();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function addBaseline() {
    try {
      await api.post("/models/baseline");
      toast.success("Added the random baseline");
      onChange();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const found = servers?.filter((s) => s.models.length > 0) ?? [];

  return (
    <Card className="bg-grid overflow-hidden">
      <CardHeader>
        <CardTitle className="text-xl">Evaluate your first local model</CardTitle>
        <CardDescription>
          Connect any OpenAI-compatible server such as Ollama, LM Studio, llama.cpp or vLLM, then run benchmarks
          against it.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="bg-background rounded-lg border p-4">
          <div className="text-muted-foreground mb-2 font-mono text-xs">01</div>
          <div className="font-medium">Connect a model</div>
          {isLoading ? (
            <p className="text-muted-foreground mt-1 text-sm">Looking for local servers…</p>
          ) : found.length > 0 ? (
            <div className="mt-3 space-y-2">
              {found.slice(0, 2).flatMap((s) =>
                s.models.slice(0, 3).map((m) => (
                  <div key={`${s.base_url}-${m}`} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate font-mono text-xs">{m}</span>
                    <Button size="sm" variant="outline" className="h-7" onClick={() => add(s.name, s.base_url, m)}>
                      Add
                    </Button>
                  </div>
                )),
              )}
            </div>
          ) : (
            <p className="text-muted-foreground mt-1 text-sm">
              No local server detected. Start one (for example <code className="font-mono">ollama serve</code>) or add
              it by URL.
            </p>
          )}
          <Button asChild size="sm" variant="link" className="mt-2 px-0">
            <Link href="/models?new=1">
              Add by URL <ArrowRightIcon />
            </Link>
          </Button>
        </div>
        <div className="bg-background rounded-lg border p-4">
          <div className="text-muted-foreground mb-2 font-mono text-xs">02</div>
          <div className="font-medium">No server yet?</div>
          <p className="text-muted-foreground mt-1 text-sm">
            Add the offline random baseline to try every feature. Its scores show each benchmark&apos;s chance level.
          </p>
          <Button size="sm" variant="outline" className="mt-3" onClick={addBaseline}>
            <SparklesIcon /> Add random baseline
          </Button>
        </div>
        <div className="bg-background rounded-lg border p-4">
          <div className="text-muted-foreground mb-2 font-mono text-xs">03</div>
          <div className="font-medium">Run benchmarks</div>
          <p className="text-muted-foreground mt-1 text-sm">
            Pick models and benchmarks: knowledge, maths, coding, instruction following and more. Import MMLU, GSM8K
            or HumanEval from Hugging Face.
          </p>
          <Button asChild size="sm" className="mt-3">
            <Link href="/runs/new">
              <PlayIcon /> New run
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Leaderboard({ data }: { data: Overview }) {
  const cell = new Map(data.matrix.map((c) => [`${c.model_id}:${c.suite_id}`, c]));
  const rows = data.model_rows
    .map((m) => {
      const scores = data.suites.map((s) => cell.get(`${m.id}:${s.id}`)).filter(Boolean);
      const avg = scores.length ? scores.reduce((a, c) => a + c!.score, 0) / scores.length : 0;
      return { model: m, avg, count: scores.length };
    })
    .sort((a, b) => b.avg - a.avg);

  return (
    <Card className="gap-0 pb-0">
      <CardHeader className="pb-4">
        <CardTitle>Leaderboard</CardTitle>
        <CardDescription>Latest score of each model on each benchmark. Click a cell to open its run.</CardDescription>
      </CardHeader>
      <div className="overflow-x-auto border-t">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10 pl-6">#</TableHead>
              <TableHead>Model</TableHead>
              <TableHead className="text-right">Average</TableHead>
              {data.suites.map((s) => (
                <TableHead key={s.id} className="min-w-28 text-right">
                  <Link href={`/benchmarks/${s.id}`} className="hover:text-foreground whitespace-nowrap">
                    {s.name}
                  </Link>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ model, avg, count }, i) => (
              <TableRow key={model.id}>
                <TableCell className="text-muted-foreground pl-6 font-mono text-xs">{i + 1}</TableCell>
                <TableCell>
                  <div className="font-medium">{model.name}</div>
                  <div className="text-muted-foreground font-mono text-xs">{model.model}</div>
                </TableCell>
                <TableCell className="text-right">
                  <span className={cn("tabular font-semibold", TONE_TEXT[scoreTone(avg)])}>{points(avg)}</span>
                  <span className="text-muted-foreground ml-1 text-xs">({count})</span>
                </TableCell>
                {data.suites.map((s) => {
                  const c = cell.get(`${model.id}:${s.id}`);
                  return (
                    <TableCell key={s.id} className="p-1 text-right">
                      {c ? (
                        <Link
                          href={`/runs/${c.run_id}`}
                          className={cn("tabular block rounded-md px-3 py-2 text-sm transition-colors", HEAT[scoreTone(c.score)])}
                        >
                          {points(c.score)}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground/50 block px-3 py-2">—</span>
                      )}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}

function ScoreChart({ data }: { data: Overview }) {
  const models = data.model_rows.slice(0, 5);
  const config = Object.fromEntries(
    models.map((m, i) => [m.id, { label: m.name, color: `var(--chart-${i + 1})` }]),
  ) satisfies ChartConfig;
  const cell = new Map(data.matrix.map((c) => [`${c.model_id}:${c.suite_id}`, c.score]));
  const rows = data.suites.map((s) => ({
    suite: s.name,
    ...Object.fromEntries(models.map((m) => [m.id, Math.round((cell.get(`${m.id}:${s.id}`) ?? 0) * 1000) / 10])),
  }));
  return (
    <Card>
      <CardHeader>
        <CardTitle>Scores by benchmark</CardTitle>
        <CardDescription>Percent of the maximum score, latest run per model</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={config} className="h-72 w-full">
          <BarChart data={rows} margin={{ left: -16 }}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="suite"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              interval="preserveStartEnd" // skip labels that would collide on narrow screens
              minTickGap={12}
              tickFormatter={(v: string) => (v.length > 14 ? `${v.slice(0, 13)}…` : v)}
            />
            <YAxis tickLine={false} axisLine={false} domain={[0, 100]} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            {models.map((m) => (
              <Bar key={m.id} dataKey={m.id} fill={`var(--color-${m.id})`} radius={[3, 3, 0, 0]} />
            ))}
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

function RecentRuns({ data }: { data: Overview }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent runs</CardTitle>
        <CardAction>
          <Button asChild variant="ghost" size="sm">
            <Link href="/runs">
              View all <ArrowRightIcon />
            </Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-1">
        {data.recent_runs.length === 0 && <p className="text-muted-foreground text-sm">No runs yet.</p>}
        {data.recent_runs.map((r) => (
          <Link key={r.id} href={`/runs/${r.id}`} className="hover:bg-muted/60 -mx-2 flex items-center gap-3 rounded-md px-2 py-2">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{r.model_name}</div>
              <div className="text-muted-foreground truncate text-xs">
                {r.summary.by_suite.map((s) => s.name).join(", ")} · {timeAgo(r.created_at)}
              </div>
            </div>
            {r.status === "completed" ? <ScoreBadge score={r.summary.score} /> : <StatusBadge status={r.status} className="text-xs" />}
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}

export default function OverviewPage() {
  const { data, error, isLoading, mutate } = useOverview();
  const { data: models, mutate: mutateModels } = useModels();
  const refresh = () => {
    mutate();
    mutateModels();
  };
  const hasResults = !!data && data.matrix.length > 0;

  return (
    <>
      <PageHeader
        title="Overview"
        description="How your local models score across benchmarks, and how fast they run."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/models?new=1">
                <PlusIcon /> Add model
              </Link>
            </Button>
            <Button asChild>
              <Link href="/runs/new">
                <PlayIcon /> New run
              </Link>
            </Button>
          </>
        }
      />
      <PageBody>
        {error && <ErrorState error={error} />}
        {isLoading && <LoadingRows rows={4} />}
        {data && (
          <>
            {(models?.length ?? 0) === 0 && <Onboarding onChange={refresh} />}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Models" value={num(data.models)} icon={<BoxIcon />} hint="Connected endpoints" />
              <StatCard label="Runs" value={num(data.runs)} icon={<ListChecksIcon />} hint="Evaluation runs so far" />
              <StatCard label="Items evaluated" value={num(data.samples)} icon={<TargetIcon />} hint="Across completed runs" />
              <StatCard
                label="Average speed"
                value={data.avg_tokens_per_sec ? tps(data.avg_tokens_per_sec) : "—"}
                icon={<GaugeIcon />}
                hint="Output tokens per second"
              />
            </div>
            {hasResults ? (
              <>
                <Leaderboard data={data} />
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                  <div className="lg:col-span-2">
                    <ScoreChart data={data} />
                  </div>
                  <RecentRuns data={data} />
                </div>
              </>
            ) : (
              (models?.length ?? 0) > 0 && (
                <Card className="bg-grid items-center py-14 text-center">
                  <CardTitle>No results yet</CardTitle>
                  <CardDescription className="max-w-md">
                    You have {models!.length} model{models!.length === 1 ? "" : "s"} connected. Start a run to fill the
                    leaderboard.
                  </CardDescription>
                  <Button asChild>
                    <Link href="/runs/new">
                      <PlayIcon /> Start a run
                    </Link>
                  </Button>
                </Card>
              )
            )}
          </>
        )}
      </PageBody>
    </>
  );
}
