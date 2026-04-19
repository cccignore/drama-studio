"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  Circle,
  Play,
  Square,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { StreamingConsole } from "@/components/wizard/streaming-console";
import { useStreamingCommand } from "@/hooks/use-streaming-command";
import { ReviewRadarChart } from "@/components/drama/review-radar-chart";
import { ReviewIssueList } from "@/components/drama/review-issue-list";
import {
  extractReviewJson,
  type ReviewResult,
} from "@/lib/drama/parsers/extract-review-json";

export interface ReviewEntry {
  index: number;
  reviewed: boolean;
  review: ReviewResult | null;
  avg: number | null;
}

interface Props {
  projectId: string;
  totalEpisodes: number;
  currentStep: string;
  entries: ReviewEntry[];
  initialIndex: number;
}

export function ReviewStepClient({
  projectId,
  totalEpisodes,
  currentStep,
  entries: initialEntries,
  initialIndex,
}: Props) {
  const router = useRouter();
  const [entries, setEntries] = React.useState(initialEntries);
  const [selected, setSelected] = React.useState(initialIndex);
  const [mode, setMode] = React.useState<"single" | "all" | "range">("single");
  const [rangeFrom, setRangeFrom] = React.useState<number>(initialEntries[0]?.index ?? 1);
  const [rangeTo, setRangeTo] = React.useState<number>(
    initialEntries[initialEntries.length - 1]?.index ?? 1
  );
  const [atState, setAtState] = React.useState(currentStep);

  const refreshEntry = React.useCallback(
    async (epIdx: number) => {
      try {
        const res = await fetch(`/api/projects/${projectId}/artifacts/review-${epIdx}`);
        if (!res.ok) return;
        const j = await res.json();
        const content = j?.data?.item?.content ?? j?.item?.content;
        if (typeof content !== "string") return;
        const parsed = extractReviewJson(content);
        if (!parsed.ok) return;
        const s = parsed.data.scores;
        const avg =
          Math.round(((s.pace + s.satisfy + s.dialogue + s.format + s.coherence) / 5) * 10) / 10;
        setEntries((prev) =>
          prev.map((e) =>
            e.index === epIdx ? { ...e, reviewed: true, review: parsed.data, avg } : e
          )
        );
      } catch {}
    },
    [projectId]
  );

  const { run, stop, running, partial, events, error } = useStreamingCommand({
    projectId,
    command: "review",
    onEvent: (ev) => {
      if (ev.type === "artifact" && typeof ev.episode === "number") {
        refreshEntry(ev.episode as number);
      }
      if (ev.type === "state" && ev.state && typeof ev.state === "object") {
        const s = ev.state as { currentStep?: string };
        if (s.currentStep) setAtState(s.currentStep);
      }
    },
    onDone: () => toast.success("复盘完成"),
  });

  const reviewedCount = entries.filter((e) => e.reviewed).length;
  const canProceed = atState !== "review" || reviewedCount >= totalEpisodes;

  const startRun = () => {
    if (running) return;
    if (mode === "all") run({ mode: "all" });
    else if (mode === "single") run({ mode: "single", index: selected });
    else run({ mode: "range", from: rangeFrom, to: rangeTo });
  };

  const selectedEntry = entries.find((e) => e.index === selected) ?? null;

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <ClipboardCheck className="h-5 w-5 text-[color:var(--color-primary)]" />
            第 6 步 · 复盘打分
          </h1>
          <p className="mt-1 text-sm text-[color:var(--color-muted)]">
            按集输出严格 JSON 评分与问题清单。已复盘 {reviewedCount} / {entries.length}。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/studio/${projectId}/episode`}
            className="text-xs text-[color:var(--color-muted)] underline-offset-4 hover:underline"
          >
            返回剧本
          </Link>
          <Button
            variant="secondary"
            disabled={!canProceed}
            onClick={() => router.push(`/studio/${projectId}/export`)}
          >
            进入导出 <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <section className="panel grid gap-4 p-4 lg:grid-cols-[260px_1fr]">
        <div className="space-y-3">
          <div className="flex items-center gap-1 rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-1 text-xs">
            {(["single", "range", "all"] as const).map((m) => (
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
                {m === "single" ? "单集" : m === "range" ? "区间" : "全部"}
              </button>
            ))}
          </div>
          {mode === "single" && (
            <p className="text-xs text-[color:var(--color-muted)]">当前选中：第 {selected} 集</p>
          )}
          {mode === "range" && (
            <div className="grid grid-cols-2 gap-2 text-xs">
              <label className="space-y-1">
                <span className="block text-[color:var(--color-muted)]">起始</span>
                <input
                  type="number"
                  value={rangeFrom}
                  onChange={(e) => setRangeFrom(Number(e.target.value))}
                  className="w-full rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] px-2 py-1"
                />
              </label>
              <label className="space-y-1">
                <span className="block text-[color:var(--color-muted)]">结束</span>
                <input
                  type="number"
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
            <Button onClick={startRun} className="w-full" disabled={entries.length === 0}>
              <Play className="h-4 w-4" /> 开始复盘
            </Button>
          )}
        </div>

        <div className="space-y-2">
          <div className="text-xs text-[color:var(--color-muted)]">选择要查看的集</div>
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
                >
                  <span className="font-semibold">第{ep.index}集</span>
                  <span className="mt-0.5 flex items-center gap-1">
                    {ep.reviewed ? (
                      <CheckCircle2 className="h-3 w-3 text-[color:var(--color-success)]" />
                    ) : (
                      <Circle className="h-3 w-3 text-[color:var(--color-muted)]" />
                    )}
                    {ep.avg !== null && (
                      <span className="text-[10px] text-[color:var(--color-foreground)]/70">
                        {ep.avg.toFixed(1)}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <StreamingConsole
        running={running}
        partial={partial}
        events={events}
        error={error}
        heightClass="max-h-[380px]"
      />

      {selectedEntry && (
        <section className="panel grid gap-5 p-5 lg:grid-cols-[minmax(0,300px)_1fr]">
          <aside>
            <h3 className="mb-2 text-sm font-semibold">
              第 {selectedEntry.index} 集 · 雷达
            </h3>
            {selectedEntry.review ? (
              <>
                <ReviewRadarChart scores={selectedEntry.review.scores} />
                <div className="mt-2 grid grid-cols-2 gap-1 text-[12px] text-[color:var(--color-muted)]">
                  <span>节奏 {selectedEntry.review.scores.pace}</span>
                  <span>爽点 {selectedEntry.review.scores.satisfy}</span>
                  <span>台词 {selectedEntry.review.scores.dialogue}</span>
                  <span>格式 {selectedEntry.review.scores.format}</span>
                  <span>一致 {selectedEntry.review.scores.coherence}</span>
                  <span>均分 {selectedEntry.avg ?? "-"}</span>
                </div>
              </>
            ) : (
              <p className="text-sm text-[color:var(--color-muted)]">本集尚未复盘</p>
            )}
          </aside>
          <div className="space-y-3">
            <div>
              <h3 className="mb-1 text-sm font-semibold">总评</h3>
              <p className="text-[13.5px] leading-[1.7] text-[color:var(--color-foreground)]/90">
                {selectedEntry.review?.summary ?? "—"}
              </p>
            </div>
            <div>
              <h3 className="mb-1 text-sm font-semibold">问题清单</h3>
              <ReviewIssueList issues={selectedEntry.review?.issues ?? []} />
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
