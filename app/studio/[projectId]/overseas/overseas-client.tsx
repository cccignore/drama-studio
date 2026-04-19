"use client";
import * as React from "react";
import Link from "next/link";
import { ArrowRight, Globe2, Languages, Play, RotateCcw, Square } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { StreamingConsole } from "@/components/wizard/streaming-console";
import { useStreamingCommand } from "@/hooks/use-streaming-command";

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const json = await res.json();
  if (!res.ok || json.success === false) {
    throw new Error(json?.error?.message ?? `请求失败：${res.status}`);
  }
  return json.data as T;
}

export function OverseasClient({
  projectId,
  initialMode,
  initialArtifact,
}: {
  projectId: string;
  initialMode: "domestic" | "overseas";
  initialArtifact: { content: string; version: number } | null;
}) {
  const [mode, setMode] = React.useState(initialMode);
  const [savedContent, setSavedContent] = React.useState(initialArtifact?.content ?? "");

  const refreshArtifact = React.useCallback(async () => {
    try {
      const data = await api<{ item: { content: string } }>(
        `/api/projects/${projectId}/artifacts/overseas-brief`
      );
      setSavedContent(data.item.content);
    } catch {
      /* ignore */
    }
  }, [projectId]);

  const { run, stop, running, partial, events, error } = useStreamingCommand({
    projectId,
    command: "overseas",
    onEvent: (event) => {
      if (event.type === "state" && typeof event.state === "object" && event.state) {
        const nextMode = (event.state as { mode?: "domestic" | "overseas" }).mode;
        if (nextMode) setMode(nextMode);
      }
    },
    onDone: async () => {
      await refreshArtifact();
      toast.success("已生成 overseas adaptation brief");
    },
  });

  const displayContent = running ? partial : savedContent || partial;

  const switchBack = async () => {
    try {
      await api(`/api/projects/${projectId}`, {
        method: "PATCH",
        body: JSON.stringify({ state: { mode: "domestic", language: "zh-CN" } }),
      });
      setMode("domestic");
      toast.success("已切回国内模式");
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <Globe2 className="h-5 w-5 text-[color:var(--color-primary)]" />
            出海模式
          </h1>
          <p className="mt-1 text-sm text-[color:var(--color-muted)]">
            生成英文 adaptation brief，并把后续 `/episode` 写作切到英文、Hollywood-friendly 格式。
          </p>
        </div>
        <Link href={`/studio/${projectId}/episode`}>
          <Button variant="secondary">
            返回剧本 <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </header>

      <section className="panel grid gap-4 p-5 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Languages className="h-4 w-4 text-[color:var(--color-accent)]" />
            当前市场模式
          </div>
          <div className="rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-4 text-sm">
            <div className="font-medium">{mode === "overseas" ? "Overseas / English" : "Domestic / 中文"}</div>
            <div className="mt-2 text-[color:var(--color-muted)]">
              出海模式会优先使用全球观众更容易理解的关系冲突、英文对白，以及更靠近 ReelShort / DramaBox 的开场钩子与 cliffhanger。
            </div>
          </div>
        </div>
        <div className="space-y-3">
          {running ? (
            <Button variant="danger" onClick={stop} className="w-full">
              <Square className="h-4 w-4" />
              终止
            </Button>
          ) : (
            <Button onClick={() => run()} className="w-full">
              <Play className="h-4 w-4" />
              {savedContent ? "重新生成适配 brief" : "生成 overseas brief"}
            </Button>
          )}
          {mode === "overseas" && (
            <Button variant="ghost" onClick={switchBack} className="w-full">
              <RotateCcw className="h-4 w-4" />
              切回国内模式
            </Button>
          )}
        </div>
      </section>

      <StreamingConsole running={running} partial={partial} events={events} error={error} />

      {displayContent && !running && (
        <section className="panel p-5">
          <div className="mb-3 text-sm font-semibold">Overseas Adaptation Brief</div>
          <pre className="whitespace-pre-wrap break-words rounded-md bg-[color:var(--color-surface-2)] p-4 text-[13px] leading-[1.75]">
            {displayContent}
          </pre>
        </section>
      )}
    </div>
  );
}
