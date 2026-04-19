"use client";
import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
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
  const agentEvents = React.useMemo(() => {
    const items = events
      .filter((event) => event.type === "agent")
      .slice(-6) as Array<
      SSEEvent & {
        status?: string;
        title?: string;
        role?: string;
        preview?: string;
        episode?: number;
      }
    >;
    if (running) return items;
    return items.map((event, index) => {
      if (event.status !== "start") return event;
      const hasDone = items.slice(index + 1).some((next) => {
        return (
          next.status === "done" &&
          next.role === event.role &&
          next.title === event.title &&
          next.episode === event.episode
        );
      });
      if (hasDone) return event;
      return { ...event, status: "stopped" };
    });
  }, [events, running]);
  const latestAgent = agentEvents[agentEvents.length - 1];

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
          {agentEvents.length > 0 && (
            <span className="hidden truncate text-xs text-[color:var(--color-success)] md:inline-block">
              · multi-agent {agentEvents.length} 条 · {latestAgent?.title ?? latestAgent?.role ?? "active"}
            </span>
          )}
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
            {agentEvents.length > 0 && (
              <div className="mb-4 grid gap-2">
                {agentEvents.map((event, index) => (
                  <motion.div
                    key={`${event.role}-${event.title}-${event.status}-${index}`}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] px-3 py-2 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">
                        {event.title ?? event.role ?? "agent"}
                        {typeof event.episode === "number" ? ` · 第 ${event.episode} 集` : ""}
                      </span>
                      <span className="text-[color:var(--color-muted)]">
                        {event.status === "done"
                          ? "done"
                          : event.status === "stopped"
                            ? "stopped"
                            : "running"}
                      </span>
                    </div>
                    {typeof event.preview === "string" && event.preview ? (
                      <div className="mt-1 max-h-10 overflow-hidden text-[color:var(--color-muted)]">
                        {event.preview}
                      </div>
                    ) : null}
                  </motion.div>
                ))}
              </div>
            )}
            {partial ? (
              <div className="relative">
                <pre className="whitespace-pre-wrap break-words font-sans text-[13.5px] leading-[1.75]">
                  {partial}
                </pre>
                <AnimatePresence>
                  {running && (
                    <motion.span
                      initial={{ opacity: 0 }}
                      animate={{ opacity: [0.25, 1, 0.25] }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 1.1, repeat: Infinity }}
                      className="pointer-events-none absolute bottom-0 right-0 rounded bg-[color:var(--color-primary)]/20 px-2 py-0.5 text-[10px] text-[color:var(--color-primary)]"
                    >
                      typing…
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
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
            <div className="absolute bottom-0 left-0 right-0 whitespace-pre-wrap border-t border-red-500/40 bg-red-500/10 px-4 py-2 text-[12px] text-red-200">
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
