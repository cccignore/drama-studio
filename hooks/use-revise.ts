"use client";
import * as React from "react";
import { toast } from "sonner";

export interface ReviseEvent {
  type: string;
  [key: string]: unknown;
}

export function useRevise({
  projectId,
  artifactName,
  onApplied,
}: {
  projectId: string;
  artifactName: string;
  onApplied?: () => void | Promise<void>;
}) {
  const [running, setRunning] = React.useState(false);
  const [events, setEvents] = React.useState<ReviseEvent[]>([]);
  const [partial, setPartial] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const controllerRef = React.useRef<AbortController | null>(null);
  const onAppliedRef = React.useRef(onApplied);
  React.useEffect(() => {
    onAppliedRef.current = onApplied;
  }, [onApplied]);

  const run = React.useCallback(
    async (instruction: string, mode: "patch" | "rewrite" = "patch") => {
      if (controllerRef.current || !instruction.trim()) return;
      setRunning(true);
      setEvents([]);
      setPartial("");
      setError(null);
      const ctl = new AbortController();
      controllerRef.current = ctl;
      try {
        const res = await fetch(`/api/projects/${projectId}/revise`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ artifact: artifactName, instruction, mode }),
          signal: ctl.signal,
        });
        if (!res.ok || !res.body) {
          const text = await res.text().catch(() => "");
          throw new Error(text || `请求失败：${res.status}`);
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
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
              .filter((line) => line.startsWith("data:"))
              .map((line) => line.slice(5).trim())
              .join("\n");
            if (!raw) continue;
            const ev = JSON.parse(raw) as ReviseEvent;
            setEvents((prev) => [...prev, ev]);
            if (ev.type === "delta" && typeof ev.text === "string") {
              setPartial((prev) => prev + ev.text);
            } else if (ev.type === "applied") {
              toast.success(`已应用修改 · v${ev.version}`);
              await onAppliedRef.current?.();
            } else if (ev.type === "error") {
              const msg = String(ev.message ?? "改写失败");
              setError(msg);
              toast.error(msg);
            }
          }
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          const msg = (err as Error).message;
          setError(msg);
          toast.error(msg);
        }
      } finally {
        setRunning(false);
        controllerRef.current = null;
      }
    },
    [artifactName, projectId]
  );

  const stop = React.useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setRunning(false);
  }, []);

  return { run, stop, running, events, partial, error };
}
