"use client";

import { PassBadge } from "@/components/badges";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ms } from "@/lib/format";
import type { Sample } from "@/lib/types";
import { cn } from "@/lib/utils";

function Block({ label, children, tone }: { label: string; children: React.ReactNode; tone?: "error" }) {
  return (
    <div className="space-y-1.5">
      <div className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{label}</div>
      <div
        className={cn(
          "bg-muted/50 max-h-96 overflow-auto rounded-md border p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap",
          tone === "error" && "border-destructive/30 bg-destructive/5 text-destructive",
        )}
      >
        {children}
      </div>
    </div>
  );
}

export function SampleSheet({
  sample,
  suiteName,
  onOpenChange,
}: {
  sample: Sample | null;
  suiteName?: string;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={!!sample} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        {sample && (
          <>
            <SheetHeader>
              <div className="flex items-center gap-2">
                <PassBadge sample={sample} />
                {sample.score != null && <span className="tabular text-muted-foreground text-sm">score {(sample.score * 100).toFixed(0)}%</span>}
              </div>
              <SheetTitle className="font-mono text-base">{sample.item_id}</SheetTitle>
              <SheetDescription>{suiteName ?? sample.suite_id}</SheetDescription>
            </SheetHeader>
            <div className="space-y-4 px-4 pb-8">
              <div className="grid grid-cols-3 gap-2 text-center">
                {[
                  ["Latency", ms(sample.latency_ms)],
                  ["First token", ms(sample.ttft_ms)],
                  ["Output tokens", sample.output_tokens ?? "—"],
                ].map(([label, value]) => (
                  <div key={label as string} className="rounded-md border p-2">
                    <div className="text-muted-foreground text-[11px]">{label}</div>
                    <div className="tabular text-sm font-medium">{value}</div>
                  </div>
                ))}
              </div>
              <Block label="Grading">{sample.detail || "—"}</Block>
              {sample.error && <Block label="Error" tone="error">{sample.error}</Block>}
              <Block label="Prompt">{sample.prompt}</Block>
              <Block label="Model response">{sample.response ?? "(no response)"}</Block>
              {sample.target && <Block label="Expected">{sample.target}</Block>}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
