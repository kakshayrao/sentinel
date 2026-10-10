import { Badge } from "@/components/ui/badge";
import { pct, scoreTone } from "@/lib/format";
import { CATEGORY_LABELS, SOURCE_LABELS } from "@/lib/labels";
import type { RunStatus, Sample, SuiteCategory, SuiteSource } from "@/lib/types";
import { cn } from "@/lib/utils";

const tint = {
  red: "border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-400",
  amber: "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  green: "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  blue: "border-blue-500/25 bg-blue-500/10 text-blue-700 dark:text-blue-400",
  violet: "border-violet-500/25 bg-violet-500/10 text-violet-700 dark:text-violet-400",
  gray: "border-border bg-muted text-muted-foreground",
};

export const TONE_TEXT = {
  success: "text-emerald-600 dark:text-emerald-400",
  warning: "text-amber-600 dark:text-amber-400",
  danger: "text-red-600 dark:text-red-400",
};

export const TONE_BG = {
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  danger: "bg-red-500",
};

const STATUS: Record<RunStatus, { label: string; dot: string; pulse?: boolean }> = {
  queued: { label: "Queued", dot: "bg-amber-500" },
  running: { label: "Running", dot: "bg-blue-500", pulse: true },
  completed: { label: "Completed", dot: "bg-emerald-500" },
  failed: { label: "Failed", dot: "bg-red-500" },
  cancelled: { label: "Cancelled", dot: "bg-muted-foreground" },
};

/** Vercel deployment-style status: colored dot + label. */
export function StatusBadge({ status, className }: { status: RunStatus; className?: string }) {
  const s = STATUS[status];
  return (
    <span className={cn("inline-flex items-center gap-2 text-sm", className)}>
      <span className="relative flex size-2">
        {s.pulse && <span className={cn("absolute inline-flex size-full animate-ping rounded-full opacity-60", s.dot)} />}
        <span className={cn("relative inline-flex size-2 rounded-full", s.dot)} />
      </span>
      {s.label}
    </span>
  );
}

/** Outcome of a single evaluated item. */
export function PassBadge({ sample, className }: { sample: Pick<Sample, "passed" | "error">; className?: string }) {
  const [label, cls] = sample.error ? ["Error", tint.gray] : sample.passed ? ["Pass", tint.green] : ["Fail", tint.red];
  return (
    <Badge variant="outline" className={cn(cls, className)}>
      {label}
    </Badge>
  );
}

/** Score as a percentage, color coded (>=70% green, >=40% amber, else red). */
export function ScoreBadge({ score, className }: { score: number; className?: string }) {
  const tone = scoreTone(score);
  return (
    <Badge
      variant="outline"
      className={cn("tabular", tone === "success" ? tint.green : tone === "warning" ? tint.amber : tint.red, className)}
    >
      {pct(score)}
    </Badge>
  );
}

const CATEGORY_TINT: Partial<Record<SuiteCategory, string>> = {
  knowledge: tint.blue,
  reasoning: tint.violet,
  math: tint.amber,
  coding: tint.green,
  multilingual: tint.violet,
  chat: tint.blue,
};

export function CategoryBadge({ category, className }: { category: SuiteCategory; className?: string }) {
  return (
    <Badge variant="outline" className={cn(CATEGORY_TINT[category] ?? tint.gray, className)}>
      {CATEGORY_LABELS[category]}
    </Badge>
  );
}

export function SourceBadge({ source, className }: { source: SuiteSource; className?: string }) {
  return (
    <Badge variant="outline" className={cn(tint.gray, "font-normal", className)}>
      {SOURCE_LABELS[source]}
    </Badge>
  );
}

/** Small monospace tag for ids like model names or dataset paths. */
export function CodeTag({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("bg-muted text-muted-foreground rounded px-1.5 py-0.5 font-mono text-[11px]", className)}>
      {children}
    </span>
  );
}

/** Thin horizontal score bar. */
export function ScoreBar({ score, className }: { score: number; className?: string }) {
  return (
    <div className={cn("bg-muted h-1.5 w-full overflow-hidden rounded-full", className)}>
      <div
        className={cn("h-full rounded-full transition-all", TONE_BG[scoreTone(score)])}
        style={{ width: `${Math.max(2, Math.min(100, score * 100))}%` }}
      />
    </div>
  );
}
