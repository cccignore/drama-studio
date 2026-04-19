"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ListOrdered,
  Play,
  Square,
  FileText,
  LayoutList,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { StreamingConsole } from "@/components/wizard/streaming-console";
import { useStreamingCommand } from "@/hooks/use-streaming-command";
import { parseDirectory, type DirectoryExtract } from "@/lib/drama/parsers/extract-directory";
import { EpisodeDirectory } from "@/components/drama/episode-directory";

export function OutlineStepClient({
  projectId,
  totalEpisodes,
  initialArtifact,
}: {
  projectId: string;
  totalEpisodes: number;
  initialArtifact: { content: string; version: number } | null;
}) {
  const [savedContent, setSavedContent] = React.useState<string | null>(initialArtifact?.content ?? null);
  const [tab, setTab] = React.useState<"tree" | "raw">("tree");
  const isMiniSeries = totalEpisodes <= 5;

  const router = useRouter();

  const { run, stop, running, partial, events, error } = useStreamingCommand({
    projectId,
    command: "outline",
    onDone: () => toast.success("分集目录已生成"),
  });

  React.useEffect(() => {
    if (!running && partial && events.some((e) => e.type === "done")) {
      setSavedContent(partial);
    }
  }, [running, partial, events]);

  const displayContent = running ? partial : savedContent ?? partial;

  const parsed: DirectoryExtract | null = React.useMemo(() => {
    if (!displayContent) return null;
    try {
      return parseDirectory(displayContent);
    } catch {
      return null;
    }
  }, [displayContent]);

  const epCount = parsed?.total ?? 0;
  const mismatch = !running && parsed && parsed.total > 0 && parsed.total !== totalEpisodes;

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <ListOrdered className="h-5 w-5 text-[color:var(--color-primary)]" />
            第 4 步 · 分集目录
          </h1>
          <p className="mt-1 text-sm text-[color:var(--color-muted)]">
            产出完整的 {totalEpisodes} 集目录，标记 🔥 大爽点与 💰 付费卡点。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/studio/${projectId}/characters`}
            className="text-xs text-[color:var(--color-muted)] underline-offset-4 hover:underline"
          >
            返回角色
          </Link>
          <Button
            variant="secondary"
            disabled={!savedContent || running}
            onClick={() => router.push(`/studio/${projectId}/episode`)}
            title={savedContent ? "进入剧本写作" : "请先生成分集目录"}
          >
            下一步：剧本 <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {isMiniSeries && (
        <section className="panel-2 flex items-center justify-between gap-3 p-4 text-sm">
          <div>
            <div className="font-medium">当前是 5 集试玩模式</div>
            <div className="mt-1 text-[color:var(--color-muted)]">
              请重点检查每集标题、钩子和结尾是否足够清晰，确认后就能直接进入写作闭环。
            </div>
          </div>
          <span className="rounded-full bg-[color:var(--color-primary)]/15 px-3 py-1 text-xs text-[color:var(--color-primary)]">
            快速通读
          </span>
        </section>
      )}

      <section className="panel flex items-center justify-between gap-2 p-4">
        <div className="text-xs text-[color:var(--color-muted)]">
          参考：<code>paywall-design</code> / <code>rhythm-curve</code>
        </div>
        {running ? (
          <Button variant="danger" onClick={stop}>
            <Square className="h-4 w-4" /> 终止
          </Button>
        ) : (
          <Button onClick={() => run()}>
            <Play className="h-4 w-4" /> {savedContent ? "重新生成目录" : "生成分集目录"}
          </Button>
        )}
      </section>

      <StreamingConsole running={running} partial={partial} events={events} error={error} heightClass="max-h-[620px]" />

      {displayContent && (
        <section className="panel p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-1 rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-1 text-xs">
              <TabButton active={tab === "tree"} onClick={() => setTab("tree")} icon={<LayoutList className="h-3.5 w-3.5" />}>
                目录视图
              </TabButton>
              <TabButton active={tab === "raw"} onClick={() => setTab("raw")} icon={<FileText className="h-3.5 w-3.5" />}>
                原文
              </TabButton>
            </div>
            {mismatch && (
              <div className="rounded-md border border-[color:var(--color-warning)]/40 bg-[color:var(--color-warning)]/10 px-2 py-1 text-[11px] text-[color:var(--color-warning)]">
                集数 {epCount} ≠ 预期 {totalEpisodes}，可重新生成
              </div>
            )}
          </div>

          {tab === "tree" && parsed && parsed.acts.length > 0 ? (
            <EpisodeDirectory data={parsed} />
          ) : tab === "tree" ? (
            <div className="panel-2 p-6 text-center text-sm text-[color:var(--color-muted)]">
              {running ? "正在生成 …" : "未能解析出分段目录，请查看原文或重新生成"}
            </div>
          ) : (
            <pre className="whitespace-pre-wrap break-words rounded-md bg-[color:var(--color-surface-2)] p-4 text-[13px] leading-[1.75]">
              {displayContent}
            </pre>
          )}
        </section>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "flex items-center gap-1 rounded bg-[color:var(--color-primary)]/20 px-3 py-1 text-[color:var(--color-primary)]"
          : "flex items-center gap-1 rounded px-3 py-1 text-[color:var(--color-muted)] hover:bg-[color:var(--color-surface)]"
      }
    >
      {icon}
      {children}
    </button>
  );
}
