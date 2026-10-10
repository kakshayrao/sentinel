"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { DownloadIcon, FlaskConicalIcon, PlayIcon, SearchIcon, UploadIcon } from "lucide-react";

import { CategoryBadge, SourceBadge } from "@/components/badges";
import { ImportDialog } from "@/components/benchmarks/import-dialog";
import { UploadDialog } from "@/components/benchmarks/upload-dialog";
import { PageBody, PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState, LoadingRows } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useSuites } from "@/lib/api";
import { num } from "@/lib/format";
import { SCORER_LABELS } from "@/lib/labels";
import type { SuiteSource } from "@/lib/types";

type SourceFilter = "all" | SuiteSource;

export function BenchmarksView() {
  const { data: suites, error, isLoading, mutate } = useSuites();
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<SourceFilter>("all");
  const [uploadOpen, setUploadOpen] = useState(false);
  const params = useSearchParams();
  const router = useRouter();
  // The import dialog is URL state, so the command menu can open it with /benchmarks?import=1
  const importOpen = params.get("import") === "1";
  const setImportOpen = (open: boolean) => router.replace(open ? "/benchmarks?import=1" : "/benchmarks", { scroll: false });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (suites ?? []).filter(
      (s) =>
        (source === "all" || s.source === source) &&
        (!q || `${s.name} ${s.description} ${s.category}`.toLowerCase().includes(q)),
    );
  }, [suites, query, source]);

  const installed = new Set(suites?.map((s) => s.id));
  const totalItems = suites?.reduce((a, s) => a + s.item_count, 0) ?? 0;

  return (
    <>
      <PageHeader
        title="Benchmarks"
        description={
          suites
            ? `${suites.length} benchmark suites with ${num(totalItems)} test items. Import standard datasets or upload your own.`
            : "Test sets your models are scored on."
        }
        actions={
          <>
            <Button variant="outline" onClick={() => setUploadOpen(true)}>
              <UploadIcon /> Upload custom
            </Button>
            <Button onClick={() => setImportOpen(true)}>
              <DownloadIcon /> Import from Hugging Face
            </Button>
          </>
        }
      />
      <PageBody>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-xs">
            <SearchIcon className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search benchmarks" className="pl-9" />
          </div>
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={source}
            onValueChange={(v) => v && setSource(v as SourceFilter)}
          >
            <ToggleGroupItem value="all">All</ToggleGroupItem>
            <ToggleGroupItem value="builtin">Built-in</ToggleGroupItem>
            <ToggleGroupItem value="hub">Hugging Face</ToggleGroupItem>
            <ToggleGroupItem value="custom">Custom</ToggleGroupItem>
          </ToggleGroup>
        </div>

        {error && <ErrorState error={error} />}
        {isLoading && <LoadingRows rows={4} />}
        {suites && filtered.length === 0 && (
          <EmptyState
            icon={<FlaskConicalIcon />}
            title="No benchmarks match"
            description={source === "hub" ? "Import MMLU, GSM8K, HumanEval and more from Hugging Face." : "Try a different search."}
          >
            {source === "hub" && (
              <Button onClick={() => setImportOpen(true)}>
                <DownloadIcon /> Import a benchmark
              </Button>
            )}
          </EmptyState>
        )}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((s) => (
            <Card key={s.id} className="group hover:border-foreground/20 relative gap-4 transition-colors">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <CategoryBadge category={s.category} />
                  <SourceBadge source={s.source} />
                </div>
                <CardTitle className="pt-1">
                  <Link href={`/benchmarks/${s.id}`} className="after:absolute after:inset-0">
                    {s.name}
                  </Link>
                </CardTitle>
                <CardDescription className="line-clamp-2">{s.description}</CardDescription>
              </CardHeader>
              <CardContent className="text-muted-foreground mt-auto flex gap-4 text-xs">
                <span>
                  <span className="text-foreground tabular font-medium">{num(s.item_count)}</span> items
                </span>
                <span>{SCORER_LABELS[s.scorer].label}</span>
              </CardContent>
              <CardFooter className="relative z-10 border-t pt-4">
                <Button asChild size="sm" variant="ghost" className="-ml-2">
                  <Link href={`/runs/new?suite=${s.id}`}>
                    <PlayIcon /> Run
                  </Link>
                </Button>
                {s.scorer === "code" && <span className="text-muted-foreground ml-auto text-xs">Runs generated code</span>}
                {s.scorer === "judge" && <span className="text-muted-foreground ml-auto text-xs">Needs a judge model</span>}
              </CardFooter>
            </Card>
          ))}
        </div>
      </PageBody>
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} installed={installed} onImported={() => mutate()} />
      <UploadDialog open={uploadOpen} onOpenChange={setUploadOpen} onUploaded={() => mutate()} />
    </>
  );
}
