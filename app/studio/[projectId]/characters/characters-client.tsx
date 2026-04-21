"use client";
import * as React from "react";
import Link from "next/link";
import { Users, Play, Square, ArrowRight, Network, IdCard, FileText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { StreamingConsole } from "@/components/wizard/streaming-console";
import { useStreamingCommand } from "@/hooks/use-streaming-command";
import { extractMermaid } from "@/lib/drama/parsers/extract-mermaid";
import { MermaidGraph } from "@/components/drama/mermaid-graph";
import { CharacterCardsMarkdown } from "@/components/drama/character-cards";
import { ReviseDrawer } from "@/components/drama/revise/revise-drawer";

export function CharactersStepClient({
  projectId,
  initialArtifact,
}: {
  projectId: string;
  initialArtifact: { content: string; version: number } | null;
}) {
  const [savedContent, setSavedContent] = React.useState<string | null>(initialArtifact?.content ?? null);
  const [canAdvance, setCanAdvance] = React.useState<boolean>(!!initialArtifact);
  const [tab, setTab] = React.useState<"cards" | "graph" | "raw">("cards");

  const refreshArtifact = React.useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/artifacts/characters`);
      if (!res.ok) return;
      const json = await res.json();
      const item = json?.data?.item ?? json?.item;
      if (typeof item?.content === "string") {
        setSavedContent(item.content);
      }
    } catch {
      /* ignore */
    }
  }, [projectId]);

  const { run, stop, running, partial, events, error } = useStreamingCommand({
    projectId,
    command: "characters",
    onDone: async () => {
      await refreshArtifact();
      toast.success("人物设计已生成");
      setCanAdvance(true);
    },
  });

  const displayContent = running ? partial : savedContent ?? partial;
  const mermaid = React.useMemo(
    () => extractMermaid(displayContent ?? ""),
    [displayContent]
  );

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <Users className="h-5 w-5 text-[color:var(--color-primary)]" />
            第 3 步 · 角色与关系图
          </h1>
          <p className="mt-1 text-sm text-[color:var(--color-muted)]">
            产出 4–6 张人物卡 + Mermaid 人物关系图（主角 / 中反派 / 大反派 / 配角）。
          </p>
        </div>
        <div className="flex items-center gap-2">
          {savedContent && (
            <ReviseDrawer
              projectId={projectId}
              artifactName="characters"
              disabled={running}
              onUpdated={refreshArtifact}
            />
          )}
          {canAdvance && !running && (
            <Link href={`/studio/${projectId}/outline`}>
              <Button variant="secondary">
                进入下一步 · 分集
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          )}
        </div>
      </header>

      <section className="panel flex items-center justify-between gap-2 p-4">
        <div className="text-xs text-[color:var(--color-muted)]">
          参考：<code>villain-design</code>（反派层级、可信动机）
        </div>
        {running ? (
          <Button variant="danger" onClick={stop}>
            <Square className="h-4 w-4" /> 终止
          </Button>
        ) : (
          <Button onClick={() => run()}>
            <Play className="h-4 w-4" /> {savedContent ? "重新生成角色" : "生成角色与关系图"}
          </Button>
        )}
      </section>

      <StreamingConsole running={running} partial={partial} events={events} error={error} />

      {displayContent && !running && (
        <section className="panel p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-1 rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-1 text-xs">
              <TabButton active={tab === "cards"} onClick={() => setTab("cards")} icon={<IdCard className="h-3.5 w-3.5" />}>
                人物卡
              </TabButton>
              <TabButton active={tab === "graph"} onClick={() => setTab("graph")} icon={<Network className="h-3.5 w-3.5" />}>
                关系图
              </TabButton>
              <TabButton active={tab === "raw"} onClick={() => setTab("raw")} icon={<FileText className="h-3.5 w-3.5" />}>
                原文
              </TabButton>
            </div>
          </div>

          {tab === "cards" && (
            <CharacterCardsMarkdown markdown={mermaid.textWithoutBlock || displayContent} />
          )}
          {tab === "graph" && (
            mermaid.code ? (
              <MermaidGraph code={mermaid.code} />
            ) : (
              <div className="panel-2 p-6 text-center text-sm text-[color:var(--color-muted)]">
                未检测到 mermaid 关系图。可重新生成。
              </div>
            )
          )}
          {tab === "raw" && (
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
