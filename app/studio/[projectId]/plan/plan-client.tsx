"use client";
import * as React from "react";
import Link from "next/link";
import { Activity, Play, Square, ArrowRight, FileText, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AgentWorkflowPanel } from "@/components/drama/agent-workflow-panel";
import { PaceWaveform } from "@/components/drama/pace-waveform";
import { StreamingConsole } from "@/components/wizard/streaming-console";
import { useStreamingCommand } from "@/hooks/use-streaming-command";
import { extractPlanCurve, type PlanCurvePoint } from "@/lib/drama/parsers/extract-plan-curve";
import { ReviseDrawer } from "@/components/drama/revise/revise-drawer";

export function PlanStepClient({
  projectId,
  totalEpisodes,
  startCard,
  initialCurve,
  multiAgentEnabled,
  initialArtifact,
}: {
  projectId: string;
  totalEpisodes: number;
  startCard: string;
  initialCurve: PlanCurvePoint[];
  multiAgentEnabled: boolean;
  initialArtifact: { content: string; version: number } | null;
}) {
  const [savedContent, setSavedContent] = React.useState<string | null>(initialArtifact?.content ?? null);
  const [canAdvance, setCanAdvance] = React.useState<boolean>(!!initialArtifact);
  const [contextOpen, setContextOpen] = React.useState(false);
  const [curve, setCurve] = React.useState<PlanCurvePoint[]>(initialCurve);

  const refreshArtifact = React.useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/artifacts/plan`);
      if (!res.ok) return;
      const json = await res.json();
      const item = json?.data?.item ?? json?.item;
      if (typeof item?.content === "string") {
        setSavedContent(item.content);
        const metaCurve = Array.isArray(item?.meta?.curve)
          ? (item.meta.curve as PlanCurvePoint[])
          : extractPlanCurve(item.content);
        setCurve(metaCurve);
      }
    } catch {
      /* ignore */
    }
  }, [projectId]);

  const { run, stop, running, partial, events, error } = useStreamingCommand({
    projectId,
    command: "plan",
    onDone: async () => {
      await refreshArtifact();
      toast.success("节奏规划已生成");
      setCanAdvance(true);
    },
  });

  const displayContent = running ? partial : savedContent ?? partial;

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <Activity className="h-5 w-5 text-[color:var(--color-primary)]" />
            第 2 步 · 节奏规划
          </h1>
          <p className="mt-1 text-sm text-[color:var(--color-muted)]">
            基于立项卡，AI 规划四段节奏、爽点地图与 5–7 个付费卡点（共 {totalEpisodes} 集）。
          </p>
        </div>
        <div className="flex items-center gap-2">
          {savedContent && (
            <ReviseDrawer
              projectId={projectId}
              artifactName="plan"
              disabled={running}
              onUpdated={refreshArtifact}
            />
          )}
          {canAdvance && !running && (
            <Link href={`/studio/${projectId}/characters`}>
              <Button variant="secondary">
                进入下一步 · 角色
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          )}
        </div>
      </header>

      <section className="panel">
        <button
          type="button"
          onClick={() => setContextOpen((v) => !v)}
          className="flex w-full items-center gap-2 border-b border-[color:var(--color-border)] px-4 py-2.5 text-left text-sm"
        >
          {contextOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <span className="font-medium">上一步产出 · 立项卡</span>
          <span className="text-xs text-[color:var(--color-muted)]">{startCard.length.toLocaleString()} 字</span>
        </button>
        {contextOpen && (
          <pre className="max-h-[360px] overflow-auto whitespace-pre-wrap break-words p-4 text-[12px] leading-[1.7] text-[color:var(--color-foreground)]/90">
            {startCard || "（尚未生成立项卡）"}
          </pre>
        )}
      </section>

      <section className="panel flex items-center justify-between gap-2 p-4">
        <div className="text-xs text-[color:var(--color-muted)]">
          将自动加载参考：<code>rhythm-curve</code> / <code>paywall-design</code> / <code>satisfaction-matrix</code> / <code>opening-rules</code>
        </div>
        {running ? (
          <Button variant="danger" onClick={stop}>
            <Square className="h-4 w-4" /> 终止
          </Button>
        ) : (
          <Button onClick={() => run()}>
            <Play className="h-4 w-4" /> {savedContent ? "重新生成节奏" : "生成节奏规划"}
          </Button>
        )}
      </section>

      <AgentWorkflowPanel
        enabled={multiAgentEnabled}
        running={running}
        commandLabel="节奏规划"
        events={events}
      />

      <StreamingConsole running={running} partial={partial} events={events} error={error} />

      {displayContent && !running && (
        <>
          <section className="panel p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Activity className="h-4 w-4 text-[color:var(--color-accent)]" />
                节奏波形
              </div>
              <div className="text-xs text-[color:var(--color-muted)]">
                共 {curve.length || totalEpisodes} 个节点 · 付费卡点 {curve.filter((item) => item.paywall).length} 处
              </div>
            </div>
            <PaceWaveform points={curve} />
          </section>

          <section className="panel p-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium">
              <FileText className="h-4 w-4 text-[color:var(--color-success)]" />
              节奏规划
            </div>
            <pre className="whitespace-pre-wrap break-words rounded-md bg-[color:var(--color-surface-2)] p-4 text-[13px] leading-[1.75]">
              {displayContent}
            </pre>
          </section>
        </>
      )}
    </div>
  );
}
