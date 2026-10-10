"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { PlayIcon, Trash2Icon } from "lucide-react";

import { CategoryBadge, CodeTag, SourceBadge } from "@/components/badges";
import { PageBody, PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { ErrorState, PageSkeleton } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, useSuite } from "@/lib/api";
import { num } from "@/lib/format";
import { SCORER_LABELS } from "@/lib/labels";
import type { Item } from "@/lib/types";
import { cn } from "@/lib/utils";

const LETTERS = "ABCDEFGHIJ";

function expected(item: Item): string {
  if (item.entry_point) return `Unit tests for ${item.entry_point}()`;
  if (item.constraints.length) return item.constraints.map((c) => String(c.type)).join(", ");
  if (item.target == null) return "—";
  return typeof item.target === "string" ? item.target : JSON.stringify(item.target);
}

function Block({ label, children, mono }: { label: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <div className="space-y-1.5">
      <div className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{label}</div>
      <div className={cn("bg-muted/50 rounded-md border p-3 text-sm whitespace-pre-wrap", mono && "font-mono text-xs")}>
        {children}
      </div>
    </div>
  );
}

export function BenchmarkDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: suite, error } = useSuite(id);
  const [selected, setSelected] = useState<Item | null>(null);
  const router = useRouter();

  async function remove() {
    if (!suite || !confirm(`Delete ${suite.name}? Past runs keep their results.`)) return;
    try {
      await api.del(`/suites/${suite.id}`);
      toast.success("Benchmark deleted");
      router.push("/benchmarks");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  if (error) return <PageBody><ErrorState error={error} /></PageBody>;
  if (!suite) return <PageSkeleton />;

  return (
    <>
      <PageHeader
        title={suite.name}
        description={suite.description}
        actions={
          <>
            {suite.source !== "builtin" && (
              <Button variant="outline" onClick={remove}>
                <Trash2Icon /> Delete
              </Button>
            )}
            <Button asChild>
              <Link href={`/runs/new?suite=${suite.id}`}>
                <PlayIcon /> Run this benchmark
              </Link>
            </Button>
          </>
        }
      >
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <CategoryBadge category={suite.category} />
          <SourceBadge source={suite.source} />
          <CodeTag>{suite.id}</CodeTag>
        </div>
      </PageHeader>
      <PageBody>
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard label="Items" value={num(suite.items.length)} />
          <StatCard label="Scorer" value={<span className="text-2xl">{SCORER_LABELS[suite.scorer].label}</span>} hint={SCORER_LABELS[suite.scorer].description} />
          <StatCard label="Max output tokens" value={num(suite.max_tokens)} hint="Per item, unless a run overrides it" />
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Prompt template</CardTitle>
            <CardDescription>How each item is turned into the message sent to the model.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {suite.system_prompt && <Block label="System" mono>{suite.system_prompt}</Block>}
            <Block label="User" mono>{suite.prompt_template}</Block>
          </CardContent>
        </Card>
        <Card className="gap-0 pb-0">
          <CardHeader className="pb-4">
            <CardTitle>Items</CardTitle>
            <CardDescription>Click an item to see it in full.</CardDescription>
          </CardHeader>
          <div className="border-t">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28 pl-6">Id</TableHead>
                  <TableHead>Input</TableHead>
                  <TableHead className="w-1/4">Expected</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {suite.items.map((item) => (
                  <TableRow key={item.id} className="cursor-pointer" onClick={() => setSelected(item)}>
                    <TableCell className="text-muted-foreground pl-6 font-mono text-xs">{item.id}</TableCell>
                    <TableCell className="max-w-0">
                      <div className="truncate">{item.input}</div>
                    </TableCell>
                    <TableCell className="max-w-0">
                      <div className="text-muted-foreground truncate font-mono text-xs">{expected(item)}</div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      </PageBody>
      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle>Item {selected.id}</SheetTitle>
                <SheetDescription>{suite.name}</SheetDescription>
              </SheetHeader>
              <div className="space-y-4 px-4 pb-6">
                {selected.context && <Block label="Context">{selected.context}</Block>}
                <Block label="Input" mono={!!selected.entry_point}>{selected.input}</Block>
                {selected.choices.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Choices</div>
                    {selected.choices.map((c, i) => (
                      <div
                        key={i}
                        className={cn(
                          "flex gap-2 rounded-md border px-3 py-2 text-sm",
                          selected.target === LETTERS[i] && "border-emerald-500/40 bg-emerald-500/10",
                        )}
                      >
                        <span className="text-muted-foreground font-mono">{LETTERS[i]}.</span>
                        <span>{c}</span>
                        {selected.target === LETTERS[i] && <Badge className="ml-auto bg-emerald-600">Answer</Badge>}
                      </div>
                    ))}
                  </div>
                )}
                {selected.choices.length === 0 && !selected.entry_point && !selected.constraints.length && (
                  <Block label="Expected">{expected(selected)}</Block>
                )}
                {selected.constraints.length > 0 && <Block label="Checks" mono>{JSON.stringify(selected.constraints, null, 2)}</Block>}
                {selected.tests && <Block label="Unit tests" mono>{selected.tests}</Block>}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
