/** 0.3821 -> "38.2%" */
export function pct(ratio: number, digits = 1): string {
  if (!Number.isFinite(ratio)) return "—";
  return `${(ratio * 100).toFixed(digits)}%`;
}

export function num(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31_536_000],
  ["month", 2_592_000],
  ["week", 604_800],
  ["day", 86_400],
  ["hour", 3_600],
  ["minute", 60],
];

/** ISO string -> "3 minutes ago" */
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const seconds = (new Date(iso).getTime() - Date.now()) / 1000;
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return "just now";
}

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Milliseconds as "45s", "3m 20s" or "1h 5m". */
export function span(milliseconds: number): string {
  const s = Math.max(0, Math.round(milliseconds / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

/** Duration between two ISO strings (end defaults to now): "1m 12s" */
export function duration(start: string | null | undefined, end?: string | null): string {
  if (!start) return "—";
  return span((end ? new Date(end).getTime() : Date.now()) - new Date(start).getTime());
}

export function ms(value: number | null | undefined): string {
  if (value == null) return "—";
  return value < 1000 ? `${Math.round(value)} ms` : `${(value / 1000).toFixed(1)} s`;
}

/** "grade_school_math" -> "Grade school math" */
export function humanize(id: string): string {
  const s = id.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Score color thresholds used everywhere (higher is better). */
export function scoreTone(score: number): "danger" | "warning" | "success" {
  if (score >= 0.7) return "success";
  if (score >= 0.4) return "warning";
  return "danger";
}

/** 0.8213 -> "82.1" (for compact tables) */
export function points(score: number, digits = 1): string {
  return Number.isFinite(score) ? (score * 100).toFixed(digits) : "—";
}

export function tps(value: number | null | undefined): string {
  return value == null ? "—" : `${value.toFixed(value < 10 ? 1 : 0)} tok/s`;
}
