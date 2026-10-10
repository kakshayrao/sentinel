"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  BoxIcon,
  CheckIcon,
  Loader2Icon,
  MessageSquareIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlayIcon,
  PlugZapIcon,
  PlusIcon,
  RadarIcon,
  SparklesIcon,
  Trash2Icon,
} from "lucide-react";

import { CodeTag, TONE_TEXT } from "@/components/badges";
import { useConfirm } from "@/components/confirm";
import { ModelDialog } from "@/components/models/model-dialog";
import { PageBody, PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState, LoadingRows } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api, useDiscover, useModels, useRuns } from "@/lib/api";
import { ms, points, scoreTone, timeAgo, tps } from "@/lib/format";
import type { Model, ModelTestResult, Run } from "@/lib/types";
import { cn } from "@/lib/utils";

function ServerBadge({ model }: { model: Model }) {
  if (model.kind === "baseline") return <Badge variant="secondary">Offline baseline</Badge>;
  const port = model.base_url?.match(/:(\d+)/)?.[1];
  const name = { "11434": "Ollama", "1234": "LM Studio", "8080": "llama.cpp", "8000": "vLLM", "1337": "Jan" }[port ?? ""];
  return <Badge variant="outline">{name ?? "OpenAI-compatible"}</Badge>;
}

function Detected({ models, onAdded }: { models: Model[]; onAdded: () => void }) {
  const { data: servers, isLoading, isValidating, mutate } = useDiscover();
  // "name" and "name:latest" are the same Ollama model
  const key = (url: string | null, id: string | null) => `${url}|${(id ?? "").replace(/:latest$/, "")}`;
  const registered = new Set(models.map((m) => key(m.base_url, m.model)));

  async function add(server: string, base_url: string, model: string) {
    try {
      await api.post("/models", { name: model, kind: "openai", base_url, model, api_key_env: null, notes: `Detected on ${server}` });
      toast.success(`Added ${model}`);
      onAdded();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Local servers</CardTitle>
        <CardDescription>Sentinel checks the default ports of Ollama, LM Studio, llama.cpp, vLLM and Jan.</CardDescription>
        <CardAction>
          <Button variant="outline" size="sm" onClick={() => mutate()} disabled={isValidating}>
            {isValidating ? <Loader2Icon className="animate-spin" /> : <RadarIcon />} Scan again
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <LoadingRows rows={2} />
        ) : !servers?.length ? (
          <p className="text-muted-foreground text-sm">
            No servers found. Start one, for example <code className="bg-muted rounded px-1 font-mono text-xs">ollama serve</code> or the
            LM Studio local server, then scan again. You can also add any URL by hand.
          </p>
        ) : (
          <div className="space-y-4">
            {servers.map((s) => (
              <div key={s.base_url}>
                <div className="mb-2 flex items-center gap-2 text-sm">
                  <span className="bg-success size-2 rounded-full" />
                  <span className="font-medium">{s.name}</span>
                  <CodeTag>{s.base_url}</CodeTag>
                </div>
                {s.models.length === 0 ? (
                  <p className="text-muted-foreground text-sm">Running, but no models are loaded.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {s.models.map((m) => {
                      const added = registered.has(key(s.base_url, m));
                      return (
                        <Button
                          key={m}
                          size="sm"
                          variant="outline"
                          className="h-8 font-mono text-xs"
                          disabled={added}
                          onClick={() => add(s.name, s.base_url, m)}
                        >
                          {added ? <CheckIcon /> : <PlusIcon />}
                          {m}
                        </Button>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface ModelStats {
  runs: number;
  latest?: Run; // most recent completed run
}

function ModelCard({
  model,
  stats,
  onEdit,
  onChange,
}: {
  model: Model;
  stats: ModelStats;
  onEdit: () => void;
  onChange: () => void;
}) {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<ModelTestResult | null>(null);
  const [ask, confirmDialog] = useConfirm();

  async function test() {
    setTesting(true);
    try {
      const r = await api.post<ModelTestResult>(`/models/${model.id}/test`);
      setResult(r);
      if (r.ok) toast.success(`${model.name} responded in ${ms(r.latency_ms)}`);
      else toast.error(r.error ?? "Test failed");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setTesting(false);
    }
  }

  async function remove() {
    const ok = await ask({ title: `Delete ${model.name}?`, description: "Its runs stay in the history.", confirmLabel: "Delete", destructive: true });
    if (!ok) return;
    try {
      await api.del(`/models/${model.id}`);
      toast.success("Model deleted");
      onChange();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <Card className="gap-4">
      {confirmDialog}
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="bg-muted flex size-9 shrink-0 items-center justify-center rounded-md border">
            {model.kind === "baseline" ? <SparklesIcon className="size-4" /> : <BoxIcon className="size-4" />}
          </div>
          <div className="min-w-0">
            <CardTitle className="truncate">{model.name}</CardTitle>
            <CardDescription className="truncate font-mono text-xs">{model.model}</CardDescription>
          </div>
        </div>
        <CardAction>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8" aria-label="Model actions">
                <MoreHorizontalIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={onEdit}>
                <PencilIcon /> Edit
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/playground?model=${model.id}`}>
                  <MessageSquareIcon /> Open in playground
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={remove}>
                <Trash2Icon /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <ServerBadge model={model} />
          {model.base_url && <CodeTag>{model.base_url}</CodeTag>}
        </div>
        {model.notes && <p className="text-muted-foreground line-clamp-2">{model.notes}</p>}
        <div className="grid grid-cols-3 divide-x rounded-md border text-center">
          {[
            ["Runs", String(stats.runs)],
            ["Last score", stats.latest ? points(stats.latest.summary.score) : "—"],
            ["Speed", stats.latest ? tps(stats.latest.summary.perf.tokens_per_sec) : "—"],
          ].map(([label, value], i) => (
            <div key={label} className="px-2 py-2">
              <div className="text-muted-foreground text-[11px]">{label}</div>
              <div
                className={cn(
                  "tabular text-sm font-medium",
                  i === 1 && stats.latest && TONE_TEXT[scoreTone(stats.latest.summary.score)],
                )}
              >
                {i === 1 && stats.latest ? <Link href={`/runs/${stats.latest.id}`} className="hover:underline">{value}</Link> : value}
              </div>
            </div>
          ))}
        </div>
        {result && (
          <div className={result.ok ? "text-emerald-600 dark:text-emerald-400 text-xs" : "text-destructive text-xs"}>
            {result.ok ? `Replied "${(result.response ?? "").slice(0, 40)}" in ${ms(result.latency_ms)}` : result.error}
          </div>
        )}
        <div className="flex items-center gap-2 pt-1">
          <Button size="sm" variant="outline" onClick={test} disabled={testing}>
            {testing ? <Loader2Icon className="animate-spin" /> : <PlugZapIcon />} Test
          </Button>
          <Button size="sm" asChild>
            <Link href={`/runs/new?model=${model.id}`}>
              <PlayIcon /> Evaluate
            </Link>
          </Button>
          <span className="text-muted-foreground ml-auto text-xs">Added {timeAgo(model.created_at)}</span>
        </div>
      </CardContent>
    </Card>
  );
}

export function ModelsView() {
  const { data: models, error, isLoading, mutate } = useModels();
  const { data: runs } = useRuns();
  const statsFor = (id: string): ModelStats => {
    const mine = (runs ?? []).filter((r) => r.model_id === id);
    return { runs: mine.length, latest: mine.find((r) => r.status === "completed") };
  };
  const [editing, setEditing] = useState<Model | null>(null);
  const params = useSearchParams();
  const router = useRouter();
  // "Add model" is URL state (/models?new=1) so other pages can link straight to it
  const creating = params.get("new") === "1";
  const openCreate = () => router.replace("/models?new=1", { scroll: false });
  const closeDialog = () => {
    setEditing(null);
    if (creating) router.replace("/models", { scroll: false });
  };

  async function addBaseline() {
    try {
      await api.post("/models/baseline");
      toast.success("Random baseline added");
      mutate();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const hasBaseline = models?.some((m) => m.kind === "baseline");

  return (
    <>
      <PageHeader
        title="Models"
        description="The local models you evaluate. Sentinel talks to them through their OpenAI-compatible API."
        actions={
          <>
            {!hasBaseline && (
              <Button variant="outline" onClick={addBaseline}>
                <SparklesIcon /> Add random baseline
              </Button>
            )}
            <Button onClick={openCreate}>
              <PlusIcon /> Add model
            </Button>
          </>
        }
      />
      <PageBody>
        <Detected models={models ?? []} onAdded={() => mutate()} />
        {error && <ErrorState error={error} />}
        {isLoading && <LoadingRows rows={3} />}
        {models && models.length === 0 && (
          <EmptyState
            icon={<BoxIcon />}
            title="No models yet"
            description="Add a model by URL, pick one from a detected server above, or start with the offline random baseline."
          >
            <Button onClick={openCreate}>
              <PlusIcon /> Add model
            </Button>
          </EmptyState>
        )}
        {models && models.length > 0 && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {models.map((m) => (
              <ModelCard
                key={m.id}
                stats={statsFor(m.id)}
                model={m}
                onChange={() => mutate()}
                onEdit={() => setEditing(m)}
              />
            ))}
          </div>
        )}
      </PageBody>
      <ModelDialog
        open={creating || editing !== null}
        onOpenChange={(open) => !open && closeDialog()}
        model={creating ? null : editing}
        onSaved={() => mutate()}
      />
    </>
  );
}
