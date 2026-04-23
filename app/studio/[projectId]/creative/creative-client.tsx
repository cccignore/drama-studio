"use client";
import * as React from "react";
import Link from "next/link";
import { ArrowRight, ChevronDown, ChevronRight, FileText, Play, Square, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { StreamingConsole } from "@/components/wizard/streaming-console";
import { useStreamingCommand } from "@/hooks/use-streaming-command";
import { ReviseDrawer } from "@/components/drama/revise/revise-drawer";

interface Props {
  projectId: string;
  freeText: string;
  startCard: string;
  initialArtifact: { content: string; version: number } | null;
}

export function CreativeStepClient({ projectId, freeText, startCard, initialArtifact }: Props) {
  const [savedContent, setSavedContent] = React.useState<string | null>(initialArtifact?.content ?? null);
  const [canAdvance, setCanAdvance] = React.useState<boolean>(!!initialArtifact);
  const [briefOpen, setBriefOpen] = React.useState(!startCard);
  const [brief, setBrief] = React.useState<string>(freeText);

  const refreshArtifact = React.useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/artifacts/creative`);
      if (!res.ok) return;
      const json = await res.json();
      const item = json?.data?.item ?? json?.item;
      if (typeof item?.content === "string") setSavedContent(item.content);
    } catch {
      /* ignore */
    }
  }, [projectId]);

  const { run, stop, running, partial, events, error } = useStreamingCommand({
    projectId,
    command: "creative",
    onDone: async () => {
      await refreshArtifact();
      toast.success("三幕创意方案已生成");
      setCanAdvance(true);
    },
  });

  const displayContent = running ? partial : savedContent ?? partial;

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <Wand2 className="h-5 w-5 text-[color:var(--color-primary)]" />
            第 2 步 · 三幕创意
          </h1>
          <p className="mt-1 text-sm text-[color:var(--color-muted)]">
            给合作伙伴确认的中间态：一句话题材 → Act1 / Act2 / Act3 + 世界观 + 视觉 + 核心主题。
          </p>
        </div>
        <div className="flex items-center gap-2">
          {savedContent && (
            <ReviseDrawer
              projectId={projectId}
              artifactName="creative"
              disabled={running}
              onUpdated={refreshArtifact}
            />
          )}
          {canAdvance && !running && (
            <Link href={`/studio/${projectId}/plan`}>
              <Button variant="secondary">
                进入下一步 · 节奏
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          )}
        </div>
      </header>

      <section className="panel">
        <button
          type="button"
          onClick={() => setBriefOpen((v) => !v)}
          className="flex w-full items-center gap-2 border-b border-[color:var(--color-border)] px-4 py-2.5 text-left text-sm"
        >
          {briefOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <span className="font-medium">一句话题材 / 立项参考</span>
          <span className="text-xs text-[color:var(--color-muted)]">
            {startCard ? `立项卡 ${startCard.length.toLocaleString()} 字` : "暂未立项卡（可直接一句话起手）"}
          </span>
        </button>
        {briefOpen && (
          <div className="space-y-3 p-4">
            <textarea
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              placeholder="例：先婚后爱 + 职场双强 + 年下；女主名「河智苑」；女频；节奏要像 ReelShort 爆款……"
              rows={3}
              className="w-full rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] px-3 py-2 text-sm leading-[1.6]"
            />
            {startCard && (
              <details className="text-[12px] text-[color:var(--color-muted)]">
                <summary className="cursor-pointer">已有立项卡预览（点击展开）</summary>
                <pre className="mt-2 max-h-[320px] overflow-auto whitespace-pre-wrap break-words rounded-md bg-[color:var(--color-surface-2)] p-3 leading-[1.7]">
                  {startCard}
                </pre>
              </details>
            )}
          </div>
        )}
      </section>

      <section className="panel flex items-center justify-between gap-2 p-4">
        <div className="text-xs text-[color:var(--color-muted)]">
          输出：Act1 / Act2 / Act3 + 世界观 + 视觉基调 + 核心主题 + Optional Upgrade
        </div>
        {running ? (
          <Button variant="danger" onClick={stop}>
            <Square className="h-4 w-4" /> 终止
          </Button>
        ) : (
          <Button onClick={() => run({ brief })}>
            <Play className="h-4 w-4" /> {savedContent ? "重新生成创意" : "生成三幕创意方案"}
          </Button>
        )}
      </section>

      <StreamingConsole running={running} partial={partial} events={events} error={error} />

      {displayContent && !running && (
        <section className="panel p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium">
            <FileText className="h-4 w-4 text-[color:var(--color-success)]" />
            三幕创意方案
          </div>
          <pre className="whitespace-pre-wrap break-words rounded-md bg-[color:var(--color-surface-2)] p-4 text-[13px] leading-[1.75]">
            {displayContent}
          </pre>
        </section>
      )}
    </div>
  );
}
