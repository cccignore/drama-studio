"use client";
import * as React from "react";
import { toast } from "sonner";
import { Play, Square, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface SSEEvent {
  type: string;
  [k: string]: unknown;
}

export function RunPlayground({ projectId }: { projectId: string }) {
  const [message, setMessage] = React.useState(
    "你好，请用 2 句话说明你擅长哪些题材的短剧创作。"
  );
  const [running, setRunning] = React.useState(false);
  const [partial, setPartial] = React.useState("");
  const [events, setEvents] = React.useState<SSEEvent[]>([]);
  const controllerRef = React.useRef<AbortController | null>(null);

  const appendEvent = (ev: SSEEvent) => setEvents((list) => [...list, ev]);

  async function run() {
    if (running) return;
    setRunning(true);
    setPartial("");
    setEvents([]);
    const ctl = new AbortController();
    controllerRef.current = ctl;
    try {
      const res = await fetch(`/api/projects/${projectId}/run`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ command: "ping", args: { message } }),
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
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf("\n\n")) >= 0) {
          const chunk = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const dataLines = chunk
            .split("\n")
            .filter((l) => l.startsWith("data:"))
            .map((l) => l.slice(5).trim());
          if (dataLines.length === 0) continue;
          const raw = dataLines.join("\n");
          try {
            const ev = JSON.parse(raw) as SSEEvent;
            appendEvent(ev);
            if (ev.type === "partial" && typeof ev.text === "string") {
              setPartial((p) => p + ev.text);
            } else if (ev.type === "error") {
              toast.error(String(ev.message ?? "上游错误"));
            } else if (ev.type === "done") {
              toast.success("完成");
            }
          } catch {
            // ignore malformed
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") toast.error((err as Error).message);
    } finally {
      setRunning(false);
      controllerRef.current = null;
    }
  }

  function stop() {
    controllerRef.current?.abort();
    setRunning(false);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="panel p-5">
        <div className="mb-2 flex items-center gap-2 text-sm font-medium">
          <Sparkles className="h-4 w-4 text-[color:var(--color-accent)]" />
          SSE 连通性测试（M1 · ping 命令）
        </div>
        <div className="mb-3 text-xs text-[color:var(--color-muted)]">
          本页用来验证：<code>POST /api/projects/:id/run</code> 能以 SSE 流式返回真实 LLM 输出。
          <br />
          完整向导（/start → /export）将在 M2+ 接入。
        </div>
        <Textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          placeholder="给模型的一句话"
        />
        <div className="mt-3 flex items-center gap-2">
          {running ? (
            <Button variant="danger" onClick={stop}>
              <Square className="h-4 w-4" /> 终止
            </Button>
          ) : (
            <Button onClick={run}>
              <Play className="h-4 w-4" /> 运行 ping
            </Button>
          )}
          <span className="text-xs text-[color:var(--color-muted)]">
            使用全局默认模型；未配置会返回错误。
          </span>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="panel p-5">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-medium">模型回答（partial 拼接）</div>
            <Badge tone={running ? "primary" : "muted"}>
              {running ? "streaming…" : "idle"}
            </Badge>
          </div>
          <pre className="min-h-[200px] whitespace-pre-wrap break-words rounded-md bg-[color:var(--color-surface-2)] p-3 text-sm leading-relaxed">
            {partial || <span className="text-[color:var(--color-muted)]">尚无输出</span>}
          </pre>
        </div>

        <div className="panel p-5">
          <div className="mb-2 text-sm font-medium">SSE 事件流</div>
          <div className="max-h-[320px] min-h-[200px] space-y-1 overflow-y-auto font-mono text-[11px]">
            {events.length === 0 ? (
              <div className="text-[color:var(--color-muted)]">尚无事件</div>
            ) : (
              events.map((ev, i) => (
                <div key={i} className="flex gap-2 rounded bg-[color:var(--color-surface-2)] px-2 py-1">
                  <span className="text-[color:var(--color-accent)]">{ev.type}</span>
                  <span className="flex-1 truncate text-[color:var(--color-muted)]">
                    {formatPayload(ev)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function formatPayload(ev: SSEEvent): string {
  const { type, ...rest } = ev;
  void type;
  if ("text" in rest && typeof rest.text === "string") return JSON.stringify(rest.text.slice(0, 40));
  const s = JSON.stringify(rest);
  return s.length > 120 ? s.slice(0, 120) + "…" : s;
}
