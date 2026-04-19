"use client";
import * as React from "react";
import { toast } from "sonner";

export interface SSEEvent {
  type: string;
  [k: string]: unknown;
}

export interface UseStreamingCommandOptions {
  projectId: string;
  command: string;
  onEvent?: (ev: SSEEvent) => void;
  onDone?: () => void;
}

export function useStreamingCommand({ projectId, command, onEvent, onDone }: UseStreamingCommandOptions) {
  const [running, setRunning] = React.useState(false);
  const [partial, setPartial] = React.useState("");
  const [events, setEvents] = React.useState<SSEEvent[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const controllerRef = React.useRef<AbortController | null>(null);
  const onEventRef = React.useRef(onEvent);
  const onDoneRef = React.useRef(onDone);
  React.useEffect(() => {
    onEventRef.current = onEvent;
    onDoneRef.current = onDone;
  }, [onEvent, onDone]);

  const run = React.useCallback(
    async (args?: Record<string, unknown>) => {
      if (controllerRef.current) return;
      setRunning(true);
      setPartial("");
      setEvents([]);
      setError(null);
      const ctl = new AbortController();
      controllerRef.current = ctl;
      try {
        const res = await fetch(`/api/projects/${projectId}/run`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ command, args: args ?? {} }),
          signal: ctl.signal,
        });
        if (!res.ok || !res.body) {
          const text = await res.text().catch(() => "");
          try {
            const json = JSON.parse(text);
            throw new Error(json?.error?.message ?? `请求失败：${res.status}`);
          } catch {
            throw new Error(text || `请求失败：${res.status}`);
          }
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        let sawError = false;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let idx;
          while ((idx = buf.indexOf("\n\n")) >= 0) {
            const chunk = buf.slice(0, idx);
            buf = buf.slice(idx + 2);
            const raw = chunk
              .split("\n")
              .filter((l) => l.startsWith("data:"))
              .map((l) => l.slice(5).trim())
              .join("\n");
            if (!raw) continue;
            try {
              const ev = JSON.parse(raw) as SSEEvent;
              setEvents((list) => [...list, ev]);
              onEventRef.current?.(ev);
              if (ev.type === "partial" && typeof ev.text === "string") {
                setPartial((p) => p + (ev.text as string));
              } else if (ev.type === "error") {
                sawError = true;
                const msg = String(ev.message ?? "上游错误");
                setError(msg);
                toast.error(msg);
              }
            } catch {
              /* ignore */
            }
          }
        }
        if (!sawError) onDoneRef.current?.();
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setError((err as Error).message);
          toast.error((err as Error).message);
        }
      } finally {
        setRunning(false);
        controllerRef.current = null;
      }
    },
    [projectId, command]
  );

  const stop = React.useCallback(() => {
    controllerRef.current?.abort();
    setRunning(false);
    controllerRef.current = null;
  }, []);

  return { run, stop, running, partial, events, error, setPartial };
}
