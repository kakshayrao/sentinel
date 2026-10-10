import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const TONES = {
  default: "",
  success: "text-success",
  warning: "text-warning",
  danger: "text-destructive",
} as const;

/** KPI tile: small label, large tabular value, optional hint line. */
export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "default",
  loading,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: keyof typeof TONES;
  loading?: boolean;
  className?: string;
}) {
  return (
    <Card className={cn("gap-0 p-5", className)}>
      <div className="text-muted-foreground flex items-center justify-between text-sm">
        <span>{label}</span>
        {icon && <span className="[&_svg]:size-4">{icon}</span>}
      </div>
      {loading ? (
        <Skeleton className="mt-3 h-8 w-24" />
      ) : (
        <div className={cn("tabular mt-2 text-3xl font-semibold tracking-tight", TONES[tone])}>{value}</div>
      )}
      {hint && <div className="text-muted-foreground mt-1 text-xs">{hint}</div>}
    </Card>
  );
}
