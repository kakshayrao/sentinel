"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ArrowUpIcon, BoxIcon, EraserIcon, SquareIcon } from "lucide-react";

import { Markdown } from "@/components/markdown";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { streamChat, useModels } from "@/lib/api";
import { ms, tps } from "@/lib/format";
import type { ChatMessage, ChatMetrics } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Turn extends ChatMessage {
  reasoning?: string; // thinking models stream their reasoning separately
  metrics?: ChatMetrics | null;
  error?: string;
}

const SUGGESTIONS = [
  "Explain the difference between TCP and UDP in three bullet points.",
  "Write a Python function that checks whether a string is a palindrome.",
  "A train leaves at 9:40 and arrives at 13:05. How long is the journey?",
  "మీ గురించి తెలుగులో రెండు వాక్యాలలో చెప్పండి.",
];

export function PlaygroundView() {
  const { data: models } = useModels();
  const params = useSearchParams();
  const [picked, setModelId] = useState<string>("");
  const [system, setSystem] = useState("");
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(1024);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  // ?model= (from the Models page) picks the default until the user chooses
  const modelId = picked || models?.find((m) => m.id === params.get("model"))?.id || models?.[0]?.id || "";

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || !modelId || streaming) return;
    const history: Turn[] = [...turns, { role: "user", content }];
    setTurns([...history, { role: "assistant", content: "" }]);
    setInput("");
    setStreaming(true);
    abort.current = new AbortController();
    const messages: ChatMessage[] = [
      ...(system.trim() ? [{ role: "system" as const, content: system.trim() }] : []),
      ...history.filter((t) => !t.error).map(({ role, content }) => ({ role, content })),
    ];
    // The reply being streamed is always the last turn
    const patchLast = (update: (turn: Turn) => Partial<Turn>) =>
      setTurns((prev) => [...prev.slice(0, -1), { ...prev[prev.length - 1], ...update(prev[prev.length - 1]) }]);
    try {
      const metrics = await streamChat(
        { model_id: modelId, messages, temperature, max_tokens: maxTokens },
        (delta) => patchLast((t) => ({ content: t.content + delta })),
        abort.current.signal,
        (thinking) => patchLast((t) => ({ reasoning: (t.reasoning ?? "") + thinking })),
      );
      patchLast(() => ({ metrics }));
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      const message = (e as Error).message;
      patchLast(() => ({ error: message }));
      toast.error(message);
    } finally {
      setStreaming(false);
      abort.current = null;
    }
  }

  const model = models?.find((m) => m.id === modelId);

  if (models && models.length === 0) {
    return (
      <>
        <PageHeader title="Playground" description="Chat with any of your models and watch its speed live." />
        <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
          <EmptyState icon={<BoxIcon />} title="No models yet" description="Add a model to start chatting with it.">
            <Button asChild>
              <Link href="/models?new=1">Add model</Link>
            </Button>
          </EmptyState>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Playground" description="Chat with any of your models and watch its speed live." />
      <div className="mx-auto grid w-full max-w-7xl flex-1 gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[18rem_1fr]">
        <Card className="h-fit lg:sticky lg:top-32">
          <CardHeader>
            <CardTitle>Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label>Model</Label>
              <Select value={modelId} onValueChange={setModelId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose a model" />
                </SelectTrigger>
                <SelectContent>
                  {models?.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {model?.model && <p className="text-muted-foreground truncate font-mono text-xs">{model.model}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="system">System prompt</Label>
              <Textarea id="system" rows={4} value={system} onChange={(e) => setSystem(e.target.value)} placeholder="You are a helpful assistant." />
            </div>
            <div className="space-y-3">
              <div className="flex justify-between">
                <Label>Temperature</Label>
                <span className="tabular text-muted-foreground text-sm">{temperature.toFixed(1)}</span>
              </div>
              <Slider value={[temperature]} min={0} max={2} step={0.1} onValueChange={([v]) => setTemperature(v)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="max-tokens">Max tokens</Label>
              <Input
                id="max-tokens"
                type="number"
                min={16}
                max={8192}
                value={maxTokens}
                onChange={(e) => setMaxTokens(Math.max(16, Math.min(8192, Number(e.target.value) || 1024)))}
              />
            </div>
            <Button variant="outline" className="w-full" onClick={() => setTurns([])} disabled={streaming || !turns.length}>
              <EraserIcon /> Clear conversation
            </Button>
          </CardContent>
        </Card>

        <Card className="flex min-h-[32rem] flex-col gap-0 py-0">
          <div className="flex-1 space-y-6 overflow-y-auto p-6">
            {turns.length === 0 && (
              <div className="bg-grid flex h-full min-h-72 flex-col items-center justify-center gap-4 rounded-lg p-6 text-center">
                <div>
                  <div className="font-medium">Start a conversation</div>
                  <p className="text-muted-foreground mt-1 text-sm">Each reply shows time to first token and tokens per second.</p>
                </div>
                <div className="grid w-full max-w-2xl gap-2 sm:grid-cols-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => send(s)}
                      className="bg-background hover:border-foreground/30 rounded-lg border p-3 text-left text-sm transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {turns.map((t, i) => (
              <div key={i} className={cn("flex", t.role === "user" ? "justify-end" : "justify-start")}>
                <div className={cn("max-w-[85%] min-w-0 space-y-1.5", t.role === "user" && "text-right")}>
                  {t.reasoning && (
                    <details className="text-muted-foreground group rounded-lg border px-3 py-2 text-left text-xs" open={!t.content}>
                      <summary className="cursor-pointer select-none font-medium">
                        {t.content || !streaming ? "Thought process" : "Thinking…"}
                      </summary>
                      <div className="mt-2 max-h-60 overflow-y-auto leading-relaxed whitespace-pre-wrap">{t.reasoning}</div>
                    </details>
                  )}
                  <div
                    className={cn(
                      "inline-block max-w-full rounded-2xl px-4 py-2.5 text-left text-sm leading-relaxed",
                      t.role === "user" ? "bg-foreground text-background rounded-br-sm whitespace-pre-wrap" : "bg-muted rounded-bl-sm",
                      t.error && "border-destructive/40 bg-destructive/10 text-destructive border",
                    )}
                  >
                    {t.error ??
                      (t.role === "assistant" && t.content ? (
                        <Markdown>{t.content}</Markdown>
                      ) : (
                        t.content || (streaming && i === turns.length - 1 ? <span className="animate-pulse">▍</span> : "")
                      ))}
                  </div>
                  {t.metrics && (
                    <div className="text-muted-foreground tabular flex flex-wrap gap-x-3 px-1 text-[11px]">
                      <span>first token {ms(t.metrics.ttft_ms)}</span>
                      <span>{tps(t.metrics.tokens_per_sec)}</span>
                      <span>
                        {t.metrics.output_tokens}
                        {t.metrics.tokens_estimated ? "~" : ""} tokens
                      </span>
                      <span>{ms(t.metrics.latency_ms)} total</span>
                      {t.metrics.truncated && <span className="text-amber-600 dark:text-amber-400">cut off at max tokens</span>}
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div ref={bottom} />
          </div>
          <form
            className="border-t p-4"
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
          >
            <div className="bg-background focus-within:ring-ring/50 flex items-end gap-2 rounded-xl border p-2 focus-within:ring-2">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send(input);
                  }
                }}
                rows={1}
                placeholder={model ? `Message ${model.name}… (Shift+Enter for a new line)` : "Choose a model first"}
                className="max-h-48 min-h-10 resize-none border-0 shadow-none focus-visible:ring-0"
              />
              {streaming ? (
                <Button type="button" size="icon" variant="outline" onClick={() => abort.current?.abort()} aria-label="Stop">
                  <SquareIcon />
                </Button>
              ) : (
                <Button type="submit" size="icon" disabled={!input.trim() || !modelId} aria-label="Send">
                  <ArrowUpIcon />
                </Button>
              )}
            </div>
          </form>
        </Card>
      </div>
    </>
  );
}
