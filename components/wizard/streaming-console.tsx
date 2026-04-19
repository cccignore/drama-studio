"use client";
import * as React from "react";
import { Activity, ArrowDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { SSEEvent } from "@/hooks/use-streaming-command";

export function StreamingConsole({
  running,
  partial,
  events,
  error,
  heightClass = "h-[420px]",
}: {
  running: boolean;
  partial: string;
  events: SSEEvent[];
  error?: string | null;
  heightClass?: string;
}) {
  const [open, setOpen] = React.useState(true);
  const [autoFollow, setAutoFollow] = React.useState(true);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el || !autoFollow) return;
    el.scrollTop = el.scrollHeight;
  }, [partial, events.length, autoFollow]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    if (atBottom !== autoFollow) setAutoFollow(atBottom);
  };

  const lastStage = [...events].reverse().find((e) => e.type === "progress");
  const stageLabel = lastStage ? (lastStage.message as string) || (lastStage.stage as string) : null;

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
          {stageLabel && running && (
            <span className="hidden truncate text-xs text-[color:var(--color-muted)] md:inline-block">
              · {stageLabel}
            </span>
          )}
        </div>
        <ChevronRight className={cn("h-4 w-4 transition-transform", open && "rotate-90")} />
      </button>

      {open && (
        <div className={cn("relative", heightClass)}>
          <div
            ref={scrollRef}
            onScroll={onScroll}
            className="h-full overflow-y-auto p-4"
          >
            {partial ? (
              <pre className="whitespace-pre-wrap break-words font-sans text-[13.5px] leading-[1.75]">
                {partial}
              </pre>
            ) : (
              <div className="flex h-full min-h-[200px] items-center justify-center text-xs text-[color:var(--color-muted)]">
                {running ? "等待首个增量 …" : "尚未开始"}
              </div>
            )}
          </div>
          {running && !autoFollow && (
            <button
              type="button"
              onClick={() => {
                setAutoFollow(true);
                const el = scrollRef.current;
                if (el) el.scrollTop = el.scrollHeight;
              }}
              className="absolute bottom-3 right-4 flex items-center gap-1 rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-background-2)] px-3 py-1 text-xs text-[color:var(--color-foreground)] shadow-lg hover:border-[color:var(--color-primary)]/60"
            >
              <ArrowDown className="h-3 w-3" /> 跟随最新
            </button>
          )}
          {error && (
            <div className="absolute bottom-0 left-0 right-0 border-t border-red-500/40 bg-red-500/10 px-4 py-2 text-[12px] text-red-200">
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
