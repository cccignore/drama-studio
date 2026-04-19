"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CheckCircle2,
  Circle,
  Coins,
  Flame,
  Play,
  Sparkles,
  Square,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AgentWorkflowPanel } from "@/components/drama/agent-workflow-panel";
import { StreamingConsole } from "@/components/wizard/streaming-console";
import { useStreamingCommand } from "@/hooks/use-streaming-command";
import { ScreenplayRenderer } from "@/components/drama/screenplay-renderer";

export interface EpisodeBrief {
  index: number;
  title: string;
  mainLine: string;
  hook: string;
  ending: string;
  hasHighlight: boolean;
  hasPaywall: boolean;
  actName: string;
}

export interface EpisodeEntry extends EpisodeBrief {
  written: boolean;
  reviewed: boolean;
}

interface Props {
  projectId: string;
  totalEpisodes: number;
  entries: EpisodeEntry[];
  initialIndex: number;
  multiAgentEnabled: boolean;
  initialContent: string | null;
}

export function EpisodeStepClient({
  projectId,
  totalEpisodes,
  entries: initialEntries,
  initialIndex,
  multiAgentEnabled,
  initialContent,
}: Props) {
  const router = useRouter();
  const [entries, setEntries] = React.useState(initialEntries);
  const [selected, setSelected] = React.useState<number>(initialIndex);
  const [content, setContent] = React.useState<string | null>(initialContent);
  const [mode, setMode] = React.useState<"single" | "next" | "range">("next");
  const [rangeFrom, setRangeFrom] = React.useState<number>(1);
  const [rangeTo, setRangeTo] = React.useState<number>(Math.min(5, totalEpisodes));
  const [rewriteHint, setRewriteHint] = React.useState("");

  const { run, stop, running, partial, events, error } = useStreamingCommand({
    projectId,
    command: "episode",
    onEvent: (ev) => {
      if (ev.type === "artifact" && typeof ev.episode === "number") {
        const epIdx = ev.episode as number;
        setEntries((prev) =>
          prev.map((e) => (e.index === epIdx ? { ...e, written: true } : e))
        );
      }
    },
    onDone: () => {
      toast.success("写作完成");
      refreshSelected();
    },
  });

  const refreshSelected = React.useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/artifacts/episode-${selected}`);
      if (!res.ok) return;
      const j = await res.json();
      const c = j?.data?.item?.content ?? j?.item?.content;
      if (typeof c === "string") setContent(c);
    } catch {}
  }, [projectId, selected]);

  React.useEffect(() => {
    refreshSelected();
  }, [selected, refreshSelected]);

  const writtenCount = entries.filter((e) => e.written).length;
  const canProceed = writtenCount > 0;
  const isMiniSeries = totalEpisodes <= 5;

  const startRun = () => {
    if (running) return;
    if (mode === "single") {
      run({ mode: "single", index: selected, rewriteHint: rewriteHint || undefined });
    } else if (mode === "next") {
      run({ mode: "next" });
    } else {
      const from = Math.max(1, Math.min(rangeFrom, rangeTo));
      const to = Math.min(totalEpisodes, Math.max(rangeFrom, rangeTo));
      run({ mode: "range", from, to });
    }
  };

  const selectedEntry = entries.find((e) => e.index === selected) ?? null;

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <Wand2 className="h-5 w-5 text-[color:var(--color-primary)]" />
            第 5 步 · 分集剧本
          </h1>
          <p className="mt-1 text-sm text-[color:var(--color-muted)]">
            逐集或批量生成剧本。已写 {writtenCount} / {totalEpisodes}。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/studio/${projectId}/outline`}
            className="text-xs text-[color:var(--color-muted)] underline-offset-4 hover:underline"
          >
            返回分集目录
          </Link>
          <Button
            variant="secondary"
            disabled={!canProceed}
            onClick={() => router.push(`/studio/${projectId}/review`)}
            title={canProceed ? "进入复盘" : "至少写完 1 集后可进入复盘"}
          >
            进入复盘 <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {isMiniSeries && (
        <section className="panel-2 flex items-center justify-between gap-3 p-4 text-sm">
          <div>
            <div className="font-medium">当前是 5 集试玩模式</div>
            <div className="mt-1 text-[color:var(--color-muted)]">
              建议先逐集生成并在每集完成后立即复盘，再决定是否扩展成长剧。
            </div>
          </div>
          <span className="rounded-full bg-[color:var(--color-primary)]/15 px-3 py-1 text-xs text-[color:var(--color-primary)]">
            试玩闭环
          </span>
        </section>
      )}

      <section className="panel grid gap-4 p-4 lg:grid-cols-[260px_1fr]">
        <div className="space-y-3">
          <div className="flex items-center gap-1 rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-1 text-xs">
            {(["next", "single", "range"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={
                  mode === m
                    ? "rounded bg-[color:var(--color-primary)]/20 px-2 py-1 text-[color:var(--color-primary)]"
                    : "rounded px-2 py-1 text-[color:var(--color-muted)] hover:bg-[color:var(--color-surface)]"
                }
              >
                {m === "next" ? "写下一集" : m === "single" ? "指定一集" : "批量区间"}
              </button>
            ))}
          </div>
          {mode === "single" && (
            <div className="space-y-2 text-xs text-[color:var(--color-muted)]">
              <label>目标集：第 {selected} 集</label>
              <textarea
                placeholder="重写指令（可选）：如『删除第 2 场闲聊，改为电话打断』"
                value={rewriteHint}
                onChange={(e) => setRewriteHint(e.target.value)}
                rows={3}
                className="w-full rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] px-2 py-1 text-xs"
              />
            </div>
          )}
          {mode === "range" && (
            <div className="grid grid-cols-2 gap-2 text-xs">
              <label className="space-y-1">
                <span className="block text-[color:var(--color-muted)]">起始</span>
                <input
                  type="number"
                  min={1}
                  max={totalEpisodes}
                  value={rangeFrom}
                  onChange={(e) => setRangeFrom(Number(e.target.value))}
                  className="w-full rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] px-2 py-1"
                />
              </label>
              <label className="space-y-1">
                <span className="block text-[color:var(--color-muted)]">结束</span>
                <input
                  type="number"
                  min={1}
                  max={totalEpisodes}
                  value={rangeTo}
                  onChange={(e) => setRangeTo(Number(e.target.value))}
                  className="w-full rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] px-2 py-1"
                />
              </label>
            </div>
          )}
          {running ? (
            <Button variant="danger" onClick={stop} className="w-full">
              <Square className="h-4 w-4" /> 终止
            </Button>
          ) : (
            <Button onClick={startRun} className="w-full">
              <Play className="h-4 w-4" />
              {mode === "next" ? "开始写下一集" : mode === "single" ? "生成本集" : "批量生成"}
            </Button>
          )}
          <p className="flex items-center gap-1 text-[11px] text-[color:var(--color-muted)]">
            <Sparkles className="h-3 w-3" /> 上下文自动压缩 · 付费集强制硬切
          </p>
        </div>

        <div className="space-y-2">
          <div className="text-xs text-[color:var(--color-muted)]">点击切换查看集</div>
          <div className="grid max-h-[360px] grid-cols-6 gap-1.5 overflow-auto md:grid-cols-8 xl:grid-cols-10">
            {entries.map((ep) => {
              const active = ep.index === selected;
              return (
                <button
                  key={ep.index}
                  type="button"
                  onClick={() => setSelected(ep.index)}
                  className={
                    "relative flex h-14 flex-col items-center justify-center rounded-md border text-[11px] transition " +
                    (active
                      ? "border-[color:var(--color-primary)] bg-[color:var(--color-primary)]/15"
                      : "border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] hover:border-[color:var(--color-primary)]/50")
                  }
                  title={ep.title}
                >
                  <span className="font-semibold">第{ep.index}集</span>
                  <span className="mt-0.5 flex items-center gap-1">
                    {ep.written ? (
                      <CheckCircle2 className="h-3 w-3 text-[color:var(--color-success)]" />
                    ) : (
                      <Circle className="h-3 w-3 text-[color:var(--color-muted)]" />
                    )}
                    {ep.hasHighlight && <Flame className="h-3 w-3 text-orange-400" />}
                    {ep.hasPaywall && <Coins className="h-3 w-3 text-yellow-300" />}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <AgentWorkflowPanel
        enabled={multiAgentEnabled}
        running={running}
        commandLabel="分集剧本"
        events={events}
      />

      <StreamingConsole
        running={running}
        partial={partial}
        events={events}
        error={error}
        heightClass="max-h-[480px]"
      />

      {selectedEntry && (
        <section className="panel p-5">
          <header className="mb-3 flex flex-wrap items-center gap-3 border-b border-[color:var(--color-border)] pb-3">
            <span className="text-sm font-semibold">
              第 {selectedEntry.index} 集 · {selectedEntry.title}
            </span>
            {selectedEntry.actName && (
              <span className="rounded bg-[color:var(--color-surface-2)] px-2 py-0.5 text-[11px] text-[color:var(--color-muted)]">
                {selectedEntry.actName}
              </span>
            )}
            {selectedEntry.hasHighlight && (
              <span className="inline-flex items-center gap-1 rounded bg-orange-500/15 px-2 py-0.5 text-[11px] text-orange-300">
                <Flame className="h-3 w-3" /> 大爽点
              </span>
            )}
            {selectedEntry.hasPaywall && (
              <span className="inline-flex items-center gap-1 rounded bg-yellow-500/15 px-2 py-0.5 text-[11px] text-yellow-300">
                <Coins className="h-3 w-3" /> 付费卡点
              </span>
            )}
          </header>
          <div className="grid gap-3 lg:grid-cols-[1fr_260px]">
            <div>
              {content ? (
                <ScreenplayRenderer markdown={content} />
              ) : running ? (
                <pre className="whitespace-pre-wrap break-words text-[13px] leading-[1.7] text-[color:var(--color-muted)]">
                  {partial || "正在生成 …"}
                </pre>
              ) : (
                <p className="text-sm text-[color:var(--color-muted)]">
                  本集尚未生成。使用左侧按钮开始写作。
                </p>
              )}
            </div>
            <aside className="space-y-2 rounded-md bg-[color:var(--color-surface-2)] p-3 text-xs text-[color:var(--color-muted)]">
              <div>
                <div className="font-medium text-[color:var(--color-foreground)]/80">本集线</div>
                <div>{selectedEntry.mainLine || "—"}</div>
              </div>
              <div>
                <div className="font-medium text-[color:var(--color-foreground)]/80">钩子</div>
                <div>{selectedEntry.hook || "—"}</div>
              </div>
              <div>
                <div className="font-medium text-[color:var(--color-foreground)]/80">结尾</div>
                <div>{selectedEntry.ending || "—"}</div>
              </div>
            </aside>
          </div>
        </section>
      )}
    </div>
  );
}
