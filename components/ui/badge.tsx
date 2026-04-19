import * as React from "react";
import { cn } from "@/lib/utils";

type Tone = "default" | "primary" | "success" | "warning" | "danger" | "muted";

const toneMap: Record<Tone, string> = {
  default: "bg-[color:var(--color-surface-2)] text-[color:var(--color-foreground)] border-[color:var(--color-border)]",
  primary: "bg-[color:var(--color-primary)]/15 text-[color:var(--color-primary)] border-[color:var(--color-primary)]/30",
  success: "bg-[color:var(--color-success)]/12 text-[color:var(--color-success)] border-[color:var(--color-success)]/30",
  warning: "bg-[color:var(--color-warning)]/12 text-[color:var(--color-warning)] border-[color:var(--color-warning)]/30",
  danger: "bg-[color:var(--color-danger)]/12 text-[color:var(--color-danger)] border-[color:var(--color-danger)]/30",
  muted: "bg-transparent text-[color:var(--color-muted)] border-[color:var(--color-border)]",
};

export function Badge({ tone = "default", className, ...props }: { tone?: Tone } & React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
        toneMap[tone],
        className
      )}
      {...props}
    />
  );
}
