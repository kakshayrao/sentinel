"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CircleAlertIcon,
  DownloadIcon,
  FileTextIcon,
  GitCompareIcon,
  RotateCcwIcon,
  SearchIcon,
  SheetIcon,
  SquareIcon,
  Trash2Icon,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from "recharts";

import { CategoryBadge, CodeTag, PassBadge, ScoreBar, StatusBadge, TONE_TEXT } from "@/components/badges";
import { useConfirm } from "@/components/confirm";
import { PageBody, PageHeader } from "@/components/page-header";
import { SampleSheet } from "@/components/runs/sample-sheet";
import { StatCard } from "@/components/stat-card";
import { ErrorState, PageSkeleton } from "@/components/states";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { api, useRun } from "@/lib/api";
import { dateTime, duration, ms, num, pct, points, scoreTone, span, tps } from "@/lib/format";
import { SCORER_LABELS } from "@/lib/labels";
import type { Run, RunDetail as RunDetailType } from "@/lib/types";
import { clickableRow, cn } from "@/lib/utils";

/** Remaining time for a running run, from its pace so far. */
function eta(run: Run): string | null {
  const { completed, total } = run.summary;
  if (!run.started_at || completed === 0 || completed >= total) return null;
  const elapsed = Date.now() - new Date(run.started_at).getTime();
  return span((elapsed / completed) * (total - completed));
}

const TONE_FILL = {
  success: "oklch(0.7 0.16 155)",
  warning: "oklch(0.78 0.15 75)",
  danger: "oklch(0.65 0.2 25)",
};

type Outcome = "all" | "pass" | "fail" | "error";

function SuiteChart({ run }: { run: RunDetailType }) {
  const rows = run.summary.by_suite
    .filter((s) => s.n > 0)
    .map((s) => ({ name: s.name, score: Math.round(s.score * 1000) / 10, tone: scoreTone(s.score) }));
  const config = { score: { label: "Score" } } satisfies ChartConfig;
  if (!rows.length) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Score by benchmark</CardTitle>
        <CardDescription>Percent of the maximum score</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={config} className="w-full" style={{ height: Math.max(140, rows.length * 44) }}>
          <BarChart data={rows} layout="vertical" margin={{ left: 0, right: 24 }}>
            <CartesianGrid horizontal={false} />
            <XAxis type="number" dataKey="score" domain={[0, 100]} tickLine={false} axisLine={false} />
            <YAxis type="category" dataKey="name" width={150} tickLine={false} axisLine={false} />
            <ChartTooltip cursor={false} content={<ChartTooltipContent hideIndicator />} />
            <Bar dataKey="score" radius={4} barSize={22} isAnimationActive={false}>
              {rows.map((r) => (
                <Cell key={r.name} fill={TONE_FILL[r.tone]} />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

export function RunDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: run, error, mutate } = useRun(id);
  const router = useRouter();
  const [outcome, setOutcome] = useState<Outcome>("all");
  const [suiteFilter, setSuiteFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);
  const [ask, confirmDialog] = useConfirm();

  const suiteNames = useMemo(() => new Map(run?.summary.by_suite.map((s) => [s.suite_id, s.name])), [run]);
  const samples = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (run?.samples ?? []).filter((s) => {
      if (suiteFilter !== "all" && s.suite_id !== suiteFilter) return false;
      if (outcome === "pass" && !(s.passed && !s.error)) return false;
      if (outcome === "fail" && (s.passed || s.error)) return false;
      if (outcome === "error" && !s.error) return false;
      return !q || `${s.item_id} ${s.prompt} ${s.response ?? ""}`.toLowerCase().includes(q);
    });
  }, [run, outcome, suiteFilter, query]);

  if (error) return <PageBody><ErrorState error={error} /></PageBody>;
  if (!run) return <PageSkeleton />;

  const active = run.status === "queued" || run.status === "running";
  const { summary } = run;
  const perf = summary.perf;
  const openSample = run.samples.find((s) => s.id === openId) ?? null;
  const tone = scoreTone(summary.score);

  async function cancel() {
    try {
      await api.post(`/runs/${run!.id}/cancel`);
      toast.success("Run cancelled");
      mutate();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function rerun() {
    try {
      const created = await api.post<Run>(`/runs/${run!.id}/rerun`);
      toast.success("Run started");
      router.push(`/runs/${created.id}`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function remove() {
    const ok = await ask({ title: "Delete this run?", description: "All of its answers and scores will be removed.", confirmLabel: "Delete", destructive: true });
    if (!ok) return;
    try {
      await api.del(`/runs/${run!.id}`);
      toast.success("Run deleted");
      router.push("/runs");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <>
      <PageHeader
        title={run.model_name}
        description={run.name}
        actions={
          <>
            {active ? (
              <Button variant="outline" onClick={cancel}>
                <SquareIcon /> Cancel
              </Button>
            ) : (
              <Button variant="outline" onClick={rerun}>
                <RotateCcwIcon /> Run again
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  <DownloadIcon /> Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <a href={`/api/runs/${run.id}/report.md`} download={`sentinel-run-${run.id}.md`}>
                    <FileTextIcon /> Markdown report
                  </a>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <a href={`/api/runs/${run.id}/samples.csv`} download={`sentinel-run-${run.id}.csv`}>
                    <SheetIcon /> All answers (CSV)
                  </a>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="outline" asChild>
              <Link href={`/runs/compare?a=${run.id}`}>
                <GitCompareIcon /> Compare
              </Link>
            </Button>
            <Button variant="ghost" size="icon" onClick={remove} aria-label="Delete run">
              <Trash2Icon />
            </Button>
          </>
        }
      >
        <div className="text-muted-foreground mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <StatusBadge status={run.status} className="text-foreground" />
          <span>Started {dateTime(run.started_at ?? run.created_at)}</span>
          <span>Duration {duration(run.started_at, run.finished_at)}</span>
          <span>Temperature {run.config.temperature}</span>
          <CodeTag>{run.id}</CodeTag>
        </div>
        {active && (
          <div className="mt-5 space-y-1.5">
            <Progress value={summary.total ? (summary.completed / summary.total) * 100 : 0} className="h-1.5" />
            <div className="text-muted-foreground tabular flex justify-between text-xs">
              <span>
                {summary.completed} of {summary.total} items evaluated
              </span>
              {eta(run) && <span>about {eta(run)} left</span>}
            </div>
          </div>
        )}
      </PageHeader>
      <PageBody>
        {run.error && (
          <Alert variant="destructive">
            <CircleAlertIcon />
            <AlertTitle>Run failed</AlertTitle>
            <AlertDescription>{run.error}</AlertDescription>
          </Alert>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Overall score"
            value={summary.completed > summary.errors ? pct(summary.score) : "—"}
            tone={summary.completed > summary.errors ? tone : "default"}
            hint={summary.margin ? `± ${points(summary.margin)} points (95% CI)` : "Average of the benchmark scores"}
          />
          <StatCard
            label="Items"
            value={`${num(summary.completed)}/${num(summary.total)}`}
            hint={summary.errors ? `${summary.errors} errored` : "No errors"}
          />
          <StatCard label="Latency" value={ms(perf.avg_latency_ms)} hint={`p50 ${ms(perf.p50_latency_ms)} · p95 ${ms(perf.p95_latency_ms)}`} />
          <StatCard
            label="Output speed"
            value={tps(perf.tokens_per_sec)}
            hint={`First token in ${ms(perf.avg_ttft_ms)}${perf.tokens_estimated ? " · tokens estimated" : ""}`}
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <SuiteChart run={run} />
          </div>
          <Card className="gap-0 pb-0 lg:col-span-3">
            <CardHeader className="pb-4">
              <CardTitle>Benchmarks</CardTitle>
            </CardHeader>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Benchmark</TableHead>
                  <TableHead className="hidden sm:table-cell">Scorer</TableHead>
                  <TableHead className="text-right">Passed</TableHead>
                  <TableHead className="w-40 pr-6 text-right">Score</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.by_suite.map((s) => (
                  <TableRow key={s.suite_id} {...clickableRow(() => setSuiteFilter(s.suite_id))}>
                    <TableCell className="pl-6">
                      <div className="font-medium">{s.name}</div>
                      <CategoryBadge category={s.category} className="mt-1" />
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden text-sm sm:table-cell">{SCORER_LABELS[s.scorer].label}</TableCell>
                    <TableCell className="tabular text-right text-sm">
                      {s.passed}/{s.n}
                      {s.errors > 0 && <div className="text-destructive text-xs">{s.errors} errors</div>}
                    </TableCell>
                    <TableCell className="pr-6">
                      <div className={cn("tabular text-right font-semibold", s.n ? TONE_TEXT[scoreTone(s.score)] : "text-muted-foreground")}>
                        {s.n ? points(s.score) : "—"}
                        {s.n > 1 && (
                          <span className="text-muted-foreground ml-1 text-xs font-normal" title="95% confidence interval">
                            ±{points(s.margin)}
                          </span>
                        )}
                      </div>
                      <ScoreBar score={s.n ? s.score : 0} className="mt-1.5" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </div>

        <Card className="gap-0 pb-0">
          <CardHeader className="gap-4 pb-4">
            <div>
              <CardTitle>Answers</CardTitle>
              <CardDescription className="mt-1.5">Every graded response. Click a row to read it in full.</CardDescription>
            </div>
            <div className="flex flex-col gap-2 md:flex-row md:items-center">
              <div className="relative md:w-64">
                <SearchIcon className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search prompts and answers" className="pl-9" />
              </div>
              <Select value={suiteFilter} onValueChange={setSuiteFilter}>
                <SelectTrigger className="md:w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All benchmarks</SelectItem>
                  {summary.by_suite.map((s) => (
                    <SelectItem key={s.suite_id} value={s.suite_id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <ToggleGroup type="single" variant="outline" size="sm" value={outcome} onValueChange={(v) => v && setOutcome(v as Outcome)}>
                <ToggleGroupItem value="all">All</ToggleGroupItem>
                <ToggleGroupItem value="pass">Pass</ToggleGroupItem>
                <ToggleGroupItem value="fail">Fail</ToggleGroupItem>
                <ToggleGroupItem value="error">Error</ToggleGroupItem>
              </ToggleGroup>
              <span className="text-muted-foreground text-xs md:ml-auto">{samples.length} shown</span>
            </div>
          </CardHeader>
          <div className="border-t">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24 pl-6">Item</TableHead>
                  <TableHead>Prompt</TableHead>
                  <TableHead className="hidden lg:table-cell">Response</TableHead>
                  <TableHead className="w-24">Result</TableHead>
                  <TableHead className="hidden w-24 text-right md:table-cell">Latency</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {samples.slice(0, 300).map((s) => (
                  <TableRow key={s.id} {...clickableRow(() => setOpenId(s.id))}>
                    <TableCell className="pl-6">
                      <div className="font-mono text-xs">{s.item_id}</div>
                      <div className="text-muted-foreground truncate text-[11px]">{suiteNames.get(s.suite_id)}</div>
                    </TableCell>
                    <TableCell className="max-w-0">
                      <div className="truncate text-sm">{s.prompt.split("\n").find((l) => l.trim()) ?? s.prompt}</div>
                      <div className="text-muted-foreground truncate text-xs">{s.detail}</div>
                    </TableCell>
                    <TableCell className="hidden max-w-0 lg:table-cell">
                      <div className="text-muted-foreground truncate font-mono text-xs">{s.error ?? s.response}</div>
                    </TableCell>
                    <TableCell>
                      <PassBadge sample={s} />
                    </TableCell>
                    <TableCell className="tabular text-muted-foreground hidden text-right text-sm md:table-cell">{ms(s.latency_ms)}</TableCell>
                  </TableRow>
                ))}
                {samples.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-muted-foreground py-10 text-center text-sm">
                      {active && run.samples.length === 0 ? "Waiting for the first answers…" : "No answers match these filters."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            {samples.length > 300 && (
              <div className="text-muted-foreground border-t py-3 text-center text-xs">Showing the first 300. Narrow the filters to see more.</div>
            )}
          </div>
        </Card>
      </PageBody>
      {confirmDialog}
      <SampleSheet sample={openSample} suiteName={openSample ? suiteNames.get(openSample.suite_id) : undefined} onOpenChange={(o) => !o && setOpenId(null)} />
    </>
  );
}
