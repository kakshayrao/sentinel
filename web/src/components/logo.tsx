import { cn } from "@/lib/utils";

/** Sentinel mark: a shield with a scanning eye. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={cn("size-6", className)}>
      <path
        d="M12 2.5 4 5.6v5.9c0 4.9 3.4 8.9 8 10 4.6-1.1 8-5.1 8-10V5.6L12 2.5Z"
        fill="currentColor"
      />
      <path
        d="M6.9 12.2c1.3-2 3-3 5.1-3s3.8 1 5.1 3c-1.3 2-3 3-5.1 3s-3.8-1-5.1-3Z"
        className="fill-background"
      />
      <circle cx="12" cy="12.2" r="1.6" fill="currentColor" />
    </svg>
  );
}
