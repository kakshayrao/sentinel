"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { GitCompareIcon, ListChecksIcon, MoreHorizontalIcon, PlayIcon, RotateCcwIcon, SearchIcon, Trash2Icon } from "lucide-react";

import { ScoreBadge, StatusBadge } from "@/components/badges";
import { PageBody, PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState, LoadingRows } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, useRuns } from "@/lib/api";
import { duration, timeAgo, tps } from "@/lib/format";
import type { Run, RunStatus } from "@/lib/types";

function RunActions({ run, onChange }: { run: Run; onChange: () => void }) {
  const router = useRouter();

  async function rerun() {
    try {
      const created = await api.post<Run>(`/runs/${run.id}/rerun`);
      toast.success("Run started");
      router.push(`/runs/${created.id}`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function remove() {
    if (!confirm(`Delete "${run.name}" and all of its results?`)) return;
    try {
      await api.del(`/runs/${run.id}`);
      toast.success("Run deleted");
      onChange();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8" aria-label="Run actions" onClick={(e) => e.stopPropagation()}>
          <MoreHorizontalIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onSelect={rerun}>
          <RotateCcwIcon /> Run again
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={`/runs/compare?a=${run.id}`}>
            <GitCompareIcon /> Compare with…
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={remove}>
          <Trash2Icon /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function RunsView() {
  const { data: runs, error, isLoading, mutate } = useRuns();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | RunStatus>("all");
  const router = useRouter();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (runs ?? []).filter(
      (r) =>
        (status === "all" || r.status === status) &&
        (!q || `${r.name} ${r.model_name} ${r.id}`.toLowerCase().includes(q)),
    );
  }, [runs, query, status]);

  return (
    <>
      <PageHeader
        title="Runs"
        description="Every evaluation of a model on a set of benchmarks, with scores and speed."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/runs/compare">
                <GitCompareIcon /> Compare
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
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative w-full sm:max-w-xs">
            <SearchIcon className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search runs or models" className="pl-9" />
          </div>
          <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="running">Running</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {error && <ErrorState error={error} />}
        {isLoading && <LoadingRows rows={6} />}
        {runs && runs.length === 0 && (
          <EmptyState
            icon={<ListChecksIcon />}
            title="No runs yet"
            description="Pick one or more models and benchmarks to start your first evaluation."
          >
            <Button asChild>
              <Link href="/runs/new">
                <PlayIcon /> New run
              </Link>
            </Button>
          </EmptyState>
        )}
        {runs && runs.length > 0 && (
          <Card className="py-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-full pl-6">Run</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Score</TableHead>
                  <TableHead className="hidden text-right md:table-cell">Speed</TableHead>
                  <TableHead className="hidden text-right md:table-cell">Items</TableHead>
                  <TableHead className="hidden text-right lg:table-cell">Created</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => {
                  const active = r.status === "running" || r.status === "queued";
                  const progress = r.summary.total ? (r.summary.completed / r.summary.total) * 100 : 0;
                  return (
                    <TableRow key={r.id} className="cursor-pointer" onClick={() => router.push(`/runs/${r.id}`)}>
                      <TableCell className="max-w-0 pl-6">
                        <div className="truncate font-medium">{r.model_name}</div>
                        <div className="text-muted-foreground truncate text-xs">
                          {r.summary.by_suite.map((s) => s.name).join(", ")}
                        </div>
                      </TableCell>
                      <TableCell className="w-44">
                        {active ? (
                          <div className="space-y-1.5">
                            <StatusBadge status={r.status} className="text-xs" />
                            <Progress value={progress} className="h-1" />
                          </div>
                        ) : (
                          <div>
                            <StatusBadge status={r.status} className="text-xs" />
                            <div className="text-muted-foreground text-xs">{duration(r.started_at, r.finished_at)}</div>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {r.summary.completed > r.summary.errors ? <ScoreBadge score={r.summary.score} /> : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="tabular hidden text-right text-sm md:table-cell">{tps(r.summary.perf.tokens_per_sec)}</TableCell>
                      <TableCell className="tabular hidden text-right text-sm md:table-cell">
                        {r.summary.completed}/{r.summary.total}
                      </TableCell>
                      <TableCell className="text-muted-foreground hidden text-right text-sm lg:table-cell">{timeAgo(r.created_at)}</TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <RunActions run={r} onChange={() => mutate()} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        )}
      </PageBody>
    </>
  );
}
