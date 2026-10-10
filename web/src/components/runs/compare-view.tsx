"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowDownIcon, ArrowRightIcon, ArrowUpIcon, GitCompareIcon } from "lucide-react";

import { PageBody, PageHeader } from "@/components/page-header";
import { SampleSheet } from "@/components/runs/sample-sheet";
import { EmptyState, ErrorState, LoadingRows } from "@/components/states";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useRun, useRuns } from "@/lib/api";
import { ms, points, timeAgo, tps } from "@/lib/format";
import type { RunDetail, Sample } from "@/lib/types";
import { cn } from "@/lib/utils";

function Delta({ value, unit = "pts", invert = false, digits = 1 }: { value: number | null; unit?: string; invert?: boolean; digits?: number }) {
  if (value == null || !Number.isFinite(value)) return <span className="text-muted-foreground">—</span>;
  const good = invert ? value < 0 : value > 0;
  const flat = Math.abs(value) < 10 ** -digits / 2;
  return (
    <span
      className={cn(
        "tabular inline-flex items-center gap-0.5 font-medium",
        flat ? "text-muted-foreground" : good ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400",
      )}
    >
      {!flat && (value > 0 ? <ArrowUpIcon className="size-3" /> : <ArrowDownIcon className="size-3" />)}
      {flat ? "±0" : `${value > 0 ? "+" : ""}${value.toFixed(digits)}`} {unit}
    </span>
  );
}

function RunPicker({ value, onChange, label, exclude }: { value: string | null; onChange: (id: string) => void; label: string; exclude?: string | null }) {
  const { data: runs } = useRuns();
  const options = (runs ?? []).filter((r) => r.status === "completed" && r.id !== exclude);
  return (
    <div className="min-w-0 flex-1 space-y-1.5">
      <div className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{label}</div>
      <Select value={value ?? ""} onValueChange={onChange}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Choose a completed run" />
        </SelectTrigger>
        <SelectContent>
          {options.map((r) => (
            <SelectItem key={r.id} value={r.id}>
              <span className="font-medium">{r.model_name}</span>
              <span className="text-muted-foreground"> · {points(r.summary.score)} · {timeAgo(r.created_at)}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function Changes({ a, b }: { a: RunDetail; b: RunDetail }) {
  const [open, setOpen] = useState<Sample | null>(null);
  const before = new Map(a.samples.map((s) => [`${s.suite_id}:${s.item_id}`, s]));
  const names = new Map([...a.summary.by_suite, ...b.summary.by_suite].map((s) => [s.suite_id, s.name]));
  const fixed: Sample[] = [];
  const broke: Sample[] = [];
  for (const s of b.samples) {
    const prev = before.get(`${s.suite_id}:${s.item_id}`);
    if (!prev || prev.error || s.error) continue;
    if (!prev.passed && s.passed) fixed.push(s);
    if (prev.passed && !s.passed) broke.push(s);
  }

  const list = (items: Sample[], empty: string) =>
    items.length === 0 ? (
      <p className="text-muted-foreground text-sm">{empty}</p>
    ) : (
      <div className="divide-y">
        {items.slice(0, 50).map((s) => (
          <button key={s.id} type="button" onClick={() => setOpen(s)} className="hover:bg-muted/50 flex w-full items-center gap-3 px-1 py-2 text-left">
            <span className="w-20 shrink-0 font-mono text-xs">{s.item_id}</span>
            <span className="text-muted-foreground min-w-0 flex-1 truncate text-sm">{s.prompt.split("\n").find((l) => l.trim())}</span>
            <span className="text-muted-foreground shrink-0 text-xs">{names.get(s.suite_id)}</span>
          </button>
        ))}
      </div>
    );

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-emerald-500" /> Fixed in B ({fixed.length})
          </CardTitle>
          <CardDescription>Items that failed in A and pass in B.</CardDescription>
        </CardHeader>
        <CardContent>{list(fixed, "No newly passing items.")}</CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-red-500" /> Regressed in B ({broke.length})
          </CardTitle>
          <CardDescription>Items that passed in A and fail in B.</CardDescription>
        </CardHeader>
        <CardContent>{list(broke, "No regressions.")}</CardContent>
      </Card>
      <SampleSheet sample={open} suiteName={open ? names.get(open.suite_id) : undefined} onOpenChange={(o) => !o && setOpen(null)} />
    </div>
  );
}

export function CompareView() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const aId = params.get("a");
  const bId = params.get("b");
  const { data: a, error: aError } = useRun(aId);
  const { data: b, error: bError } = useRun(bId);

  const setParam = (key: "a" | "b", value: string) => {
    const next = new URLSearchParams(params.toString());
    next.set(key, value);
    router.replace(`${pathname}?${next.toString()}`);
  };

  const rows = useMemo(() => {
    if (!a || !b) return [];
    const bySuite = new Map(b.summary.by_suite.map((s) => [s.suite_id, s]));
    return a.summary.by_suite
      .filter((s) => bySuite.has(s.suite_id))
      .map((s) => ({ a: s, b: bySuite.get(s.suite_id)! }));
  }, [a, b]);

  const shared = rows.length;
  const avg = (key: "a" | "b") => (shared ? rows.reduce((t, r) => t + r[key].score, 0) / shared : 0);

  return (
    <>
      <PageHeader title="Compare runs" description="Put two runs side by side: scores per benchmark, speed, and which items changed.">
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end">
          <RunPicker label="Run A (baseline)" value={aId} onChange={(id) => setParam("a", id)} exclude={bId} />
          <ArrowRightIcon className="text-muted-foreground mb-2.5 hidden size-4 shrink-0 sm:block" />
          <RunPicker label="Run B (candidate)" value={bId} onChange={(id) => setParam("b", id)} exclude={aId} />
        </div>
      </PageHeader>
      <PageBody>
        {(aError || bError) && <ErrorState error={aError ?? bError} />}
        {(!aId || !bId) && (
          <EmptyState
            icon={<GitCompareIcon />}
            title="Pick two runs"
            description="Compare a fine-tune against its base model, two quantizations, or yesterday's checkpoint against today's."
          />
        )}
        {aId && bId && (!a || !b) && !aError && !bError && <LoadingRows rows={4} />}
        {a && b && (
          <>
            {shared === 0 ? (
              <EmptyState icon={<GitCompareIcon />} title="No benchmarks in common" description="These runs used different benchmarks, so their scores can't be compared." />
            ) : (
              <>
                <div className="grid gap-4 md:grid-cols-3">
                  <Card className="gap-1 p-5">
                    <div className="text-muted-foreground text-sm">Average score on {shared} shared benchmark{shared === 1 ? "" : "s"}</div>
                    <div className="mt-2 flex items-baseline gap-3">
                      <span className="tabular text-muted-foreground text-2xl">{points(avg("a"))}</span>
                      <ArrowRightIcon className="text-muted-foreground size-4" />
                      <span className="tabular text-3xl font-semibold">{points(avg("b"))}</span>
                    </div>
                    <Delta value={(avg("b") - avg("a")) * 100} />
                  </Card>
                  <Card className="gap-1 p-5">
                    <div className="text-muted-foreground text-sm">Output speed</div>
                    <div className="mt-2 flex items-baseline gap-3">
                      <span className="tabular text-muted-foreground text-2xl">{tps(a.summary.perf.tokens_per_sec)}</span>
                      <ArrowRightIcon className="text-muted-foreground size-4" />
                      <span className="tabular text-2xl font-semibold">{tps(b.summary.perf.tokens_per_sec)}</span>
                    </div>
                    <Delta
                      value={a.summary.perf.tokens_per_sec && b.summary.perf.tokens_per_sec ? b.summary.perf.tokens_per_sec - a.summary.perf.tokens_per_sec : null}
                      unit="tok/s"
                    />
                  </Card>
                  <Card className="gap-1 p-5">
                    <div className="text-muted-foreground text-sm">Average latency</div>
                    <div className="mt-2 flex items-baseline gap-3">
                      <span className="tabular text-muted-foreground text-2xl">{ms(a.summary.perf.avg_latency_ms ? Math.round(a.summary.perf.avg_latency_ms) : null)}</span>
                      <ArrowRightIcon className="text-muted-foreground size-4" />
                      <span className="tabular text-2xl font-semibold">{ms(b.summary.perf.avg_latency_ms ? Math.round(b.summary.perf.avg_latency_ms) : null)}</span>
                    </div>
                    <Delta
                      value={a.summary.perf.avg_latency_ms && b.summary.perf.avg_latency_ms ? b.summary.perf.avg_latency_ms - a.summary.perf.avg_latency_ms : null}
                      unit="ms"
                      invert
                      digits={0}
                    />
                  </Card>
                </div>
                <Card className="py-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="pl-6">Benchmark</TableHead>
                        <TableHead className="text-right">A · {a.model_name}</TableHead>
                        <TableHead className="text-right">B · {b.model_name}</TableHead>
                        <TableHead className="pr-6 text-right">Change</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map(({ a: sa, b: sb }) => (
                        <TableRow key={sa.suite_id}>
                          <TableCell className="pl-6 font-medium">{sa.name}</TableCell>
                          <TableCell className="tabular text-muted-foreground text-right">{points(sa.score)}</TableCell>
                          <TableCell className="tabular text-right font-medium">{points(sb.score)}</TableCell>
                          <TableCell className="pr-6 text-right">
                            <Delta value={(sb.score - sa.score) * 100} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Card>
                <Changes a={a} b={b} />
              </>
            )}
          </>
        )}
      </PageBody>
    </>
  );
}
