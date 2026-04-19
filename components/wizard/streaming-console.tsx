"use client";
import * as React from "react";
import { Activity, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { SSEEvent } from "@/hooks/use-streaming-command";

export function StreamingConsole({
  running,
  partial,
  events,
  error,
  heightClass = "max-h-[520px]",
}: {
  running: boolean;
  partial: string;
  events: SSEEvent[];
  error?: string | null;
  heightClass?: string;
}) {
  const [open, setOpen] = React.useState(true);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [partial, events.length]);

  return (
    <div className="panel overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between border-b border-[color:var(--color-border)] px-4 py-2.5 text-sm"
      >
        <div className="flex items-center gap-2">
          <Activity className={cn("h-4 w-4", running ? "animate-pulse text-[color:var(--color-accent)]" : "text-[color:var(--color-muted)]")} />
          <span className="font-medium">生成控制台</span>
          <Badge tone={running ? "primary" : error ? "danger" : events.length ? "success" : "muted"}>
            {running ? "streaming" : error ? "error" : events.length ? "done" : "idle"}
          </Badge>
          <span className="text-xs text-[color:var(--color-muted)]">
            {events.length} 事件 · {partial.length.toLocaleString()} 字
          </span>
        </div>
        <ChevronRight className={cn("h-4 w-4 transition-transform", open && "rotate-90")} />
      </button>

      {open && (
        <div className={cn("grid gap-0 md:grid-cols-[1fr_280px]", heightClass, "overflow-hidden")}>
          <div ref={scrollRef} className="overflow-y-auto border-r border-[color:var(--color-border)] p-4 text-sm leading-relaxed">
            {partial ? (
              <pre className="whitespace-pre-wrap break-words font-sans text-[13px] leading-[1.7]">{partial}</pre>
            ) : (
              <div className="flex h-full min-h-[200px] items-center justify-center text-xs text-[color:var(--color-muted)]">
                {running ? "等待首个增量 …" : "尚未开始"}
              </div>
            )}
          </div>
          <div className="overflow-y-auto bg-[color:var(--color-surface-2)]/40 p-3 font-mono text-[11px]">
            {events.length === 0 ? (
              <div className="text-[color:var(--color-muted)]">事件流将在此显示</div>
            ) : (
              <div className="space-y-1">
                {events.map((ev, i) => (
                  <div key={i} className="flex gap-2">
                    <span className={cn("shrink-0", eventColor(ev.type))}>{ev.type}</span>
                    <span className="flex-1 truncate text-[color:var(--color-muted)]">{summarize(ev)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function eventColor(t: string) {
  switch (t) {
    case "start":
      return "text-[color:var(--color-primary)]";
    case "progress":
      return "text-[color:var(--color-accent)]";
    case "partial":
      return "text-[color:var(--color-foreground)]/70";
    case "usage":
    case "state":
      return "text-[color:var(--color-muted)]";
    case "artifact":
    case "done":
      return "text-[color:var(--color-success)]";
    case "error":
      return "text-[color:var(--color-danger)]";
    default:
      return "text-[color:var(--color-muted)]";
  }
}

function summarize(ev: SSEEvent): string {
  const { type, ...rest } = ev;
  void type;
  if (typeof rest.text === "string") return `"${rest.text.slice(0, 40)}"`;
  const s = JSON.stringify(rest);
  return s.length > 100 ? s.slice(0, 100) + "…" : s;
}
