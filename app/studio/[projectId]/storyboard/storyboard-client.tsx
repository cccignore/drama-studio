"use client";
import * as React from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Circle, Download, Film, Play, Square, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { StreamingConsole } from "@/components/wizard/streaming-console";
import { useStreamingCommand } from "@/hooks/use-streaming-command";
import { parseStoryboard, summarizeStoryboard } from "@/lib/drama/parsers/storyboard";

export interface StoryboardEntry {
  index: number;
  done: boolean;
  content: string | null;
  version: number | null;
  hasEpisode: boolean;
}

interface Props {
  projectId: string;
  totalEpisodes: number;
  entries: StoryboardEntry[];
  initialIndex: number;
}

export function StoryboardStepClient({
  projectId,
  totalEpisodes,
  entries: initialEntries,
  initialIndex,
}: Props) {
  const [entries, setEntries] = React.useState(initialEntries);
  const [selected, setSelected] = React.useState(initialIndex);
  const [mode, setMode] = React.useState<"single" | "all" | "range">("single");
  const [rangeFrom, setRangeFrom] = React.useState<number>(initialEntries[0]?.index ?? 1);
  const [rangeTo, setRangeTo] = React.useState<number>(
    initialEntries[initialEntries.length - 1]?.index ?? 1
  );
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [importing, setImporting] = React.useState(false);

  const refreshEntry = React.useCallback(
    async (epIdx: number) => {
      try {
        const res = await fetch(`/api/projects/${projectId}/artifacts/storyboard-${epIdx}`);
        if (!res.ok) return;
        const j = await res.json();
        const item = j?.data?.item ?? j?.item;
        const content = item?.content;
        if (typeof content !== "string") return;
        setEntries((prev) =>
          prev.map((e) =>
            e.index === epIdx ? { ...e, done: true, content, version: item.version ?? null } : e
          )
        );
      } catch {
        /* ignore */
      }
    },
    [projectId]
  );

  const { run, stop, running, partial, events, error } = useStreamingCommand({
    projectId,
    command: "storyboard",
    onEvent: (ev) => {
      if (ev.type === "artifact" && typeof ev.episode === "number") {
        refreshEntry(ev.episode as number);
      }
    },
    onDone: () => toast.success("分镜已生成"),
  });

  const currentEntry = entries.find((e) => e.index === selected) ?? entries[0];
  const doneCount = entries.filter((e) => e.done).length;
  const canAdvance = doneCount > 0;

  const onRun = () => {
    if (!currentEntry?.hasEpisode && mode === "single") {
      toast.error(`第 ${selected} 集尚未写成，无法拆分镜`);
      return;
    }
    if (mode === "single") run({ index: selected });
    else if (mode === "all") run({ mode: "all" });
    else run({ mode: "range", from: rangeFrom, to: rangeTo });
  };

  const onImport = async (file: File) => {
    setImporting(true);
    try {
      const content = await file.text();
      const res = await fetch(`/api/projects/${projectId}/artifacts/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: `storyboard-${selected}`, content }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error?.message || `HTTP ${res.status}`);
      }
      toast.success(`第 ${selected} 集分镜已导入`);
      await refreshEntry(selected);
    } catch (err) {
      toast.error(`导入失败：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const summary = React.useMemo(() => {
    if (!currentEntry?.content) return null;
    const doc = parseStoryboard(currentEntry.content);
    return { doc, stats: summarizeStoryboard(doc) };
  }, [currentEntry]);

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <Film className="h-5 w-5 text-[color:var(--color-primary)]" />
            第 8 步 · 分镜脚本
          </h1>
          <p className="mt-1 text-sm text-[color:var(--color-muted)]">
            把完整剧本拆成可拍摄的分镜表（镜号 / 景别 / 机位 / 画面 / 台词 / 时长 / SFX）。
            可单集、可批量、也可以直接导入一份现成剧本再拆。
          </p>
        </div>
        {canAdvance && !running && (
          <Link href={`/studio/${projectId}/export`}>
            <Button variant="secondary">
              进入下一步 · 导出
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        )}
      </header>

      <section className="panel p-4">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="text-[color:var(--color-muted)]">运行模式：</span>
          {(["single", "range", "all"] as const).map((m) => (
            <label
              key={m}
              className={`cursor-pointer rounded border px-2.5 py-1 ${
                mode === m
                  ? "border-[color:var(--color-primary)] bg-[color:var(--color-primary)]/15 text-[color:var(--color-primary)]"
                  : "border-[color:var(--color-border)]"
              }`}
            >
              <input
                type="radio"
                name="sb-mode"
                className="hidden"
                checked={mode === m}
                onChange={() => setMode(m)}
              />
              {m === "single" ? "单集" : m === "range" ? "区间" : "全部"}
            </label>
          ))}
          {mode === "range" && (
            <span className="flex items-center gap-1">
              <span>第</span>
              <input
                type="number"
                min={1}
                max={totalEpisodes}
                value={rangeFrom}
                onChange={(e) => setRangeFrom(Number(e.target.value) || 1)}
                className="w-14 rounded border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] px-1.5 py-0.5"
              />
              <span>-</span>
              <input
                type="number"
                min={1}
                max={totalEpisodes}
                value={rangeTo}
                onChange={(e) => setRangeTo(Number(e.target.value) || rangeFrom)}
                className="w-14 rounded border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] px-1.5 py-0.5"
              />
              <span>集</span>
            </span>
          )}
          <div className="ml-auto flex gap-2">
            {running ? (
              <Button variant="danger" size="sm" onClick={stop}>
                <Square className="h-4 w-4" /> 终止
              </Button>
            ) : (
              <Button size="sm" onClick={onRun}>
                <Play className="h-4 w-4" /> 生成分镜
              </Button>
            )}
          </div>
        </div>
      </section>

      <section className="panel p-3">
        <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-8 md:grid-cols-10">
          {entries.map((entry) => {
            const active = entry.index === selected;
            return (
              <button
                key={entry.index}
                type="button"
                onClick={() => setSelected(entry.index)}
                className={`flex items-center justify-center gap-1 rounded border px-2 py-1 text-xs ${
                  active
                    ? "border-[color:var(--color-primary)] bg-[color:var(--color-primary)]/15 text-[color:var(--color-primary)]"
                    : entry.done
                    ? "border-[color:var(--color-success)]/40 text-[color:var(--color-success)]"
                    : "border-[color:var(--color-border)] text-[color:var(--color-muted)]"
                }`}
              >
                {entry.done ? <CheckCircle2 className="h-3 w-3" /> : <Circle className="h-3 w-3" />}
                {entry.index}
              </button>
            );
          })}
        </div>
        <div className="mt-2 text-[11px] text-[color:var(--color-muted)]">
          已拆分镜 {doneCount} / {entries.length} · 共 {totalEpisodes} 集
        </div>
      </section>

      <section className="panel flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs">
        <div className="flex items-center gap-2 text-[color:var(--color-muted)]">
          第 {selected} 集：
          {currentEntry?.done ? (
            <span className="text-[color:var(--color-success)]">已有分镜 v{currentEntry.version}</span>
          ) : (
            <span>{currentEntry?.hasEpisode ? "剧本已写，等待拆分镜" : "剧本未写"}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {currentEntry?.done && (
            <a href={`/api/projects/${projectId}/artifacts/storyboard-${selected}?download=1`}>
              <Button size="sm" variant="secondary" type="button">
                <Download className="h-3.5 w-3.5" /> 下载本集分镜
              </Button>
            </a>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".md,.txt"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onImport(f);
            }}
          />
          <Button
            size="sm"
            variant="secondary"
            type="button"
            disabled={importing}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-3.5 w-3.5" /> {importing ? "导入中…" : `导入第 ${selected} 集分镜`}
          </Button>
        </div>
      </section>

      <StreamingConsole running={running} partial={partial} events={events} error={error} />

      {summary && !running && (
        <section className="panel p-4">
          <div className="mb-2 flex flex-wrap items-center gap-3 text-xs text-[color:var(--color-muted)]">
            <span>
              镜头 <b className="text-[color:var(--color-foreground)]">{summary.stats.shotCount}</b>
            </span>
            <span>
              场次 <b className="text-[color:var(--color-foreground)]">{summary.stats.sceneCount}</b>
            </span>
            <span>
              总时长 <b className="text-[color:var(--color-foreground)]">{summary.stats.totalDurationSec}s</b>
            </span>
            <span>
              平均 <b className="text-[color:var(--color-foreground)]">{summary.stats.avgDurationSec}s</b>
            </span>
            <span>
              对白 {summary.stats.dialogueShots} / 无对白 {summary.stats.silentShots}
            </span>
          </div>
          <div className="overflow-auto">
            <table className="w-full min-w-[880px] border-collapse text-[12px]">
              <thead className="bg-[color:var(--color-surface-2)] text-left">
                <tr>
                  <th className="border border-[color:var(--color-border)] px-2 py-1">镜号</th>
                  <th className="border border-[color:var(--color-border)] px-2 py-1">场</th>
                  <th className="border border-[color:var(--color-border)] px-2 py-1">景别</th>
                  <th className="border border-[color:var(--color-border)] px-2 py-1">机位/运动</th>
                  <th className="border border-[color:var(--color-border)] px-2 py-1">画面描述</th>
                  <th className="border border-[color:var(--color-border)] px-2 py-1">台词/SFX</th>
                  <th className="border border-[color:var(--color-border)] px-2 py-1 text-right">时长(s)</th>
                  <th className="border border-[color:var(--color-border)] px-2 py-1">备注</th>
                </tr>
              </thead>
              <tbody>
                {summary.doc.shots.map((shot) => (
                  <tr key={shot.shotId} className="align-top">
                    <td className="border border-[color:var(--color-border)] px-2 py-1 font-mono">{shot.shotId}</td>
                    <td className="border border-[color:var(--color-border)] px-2 py-1">{shot.scene}</td>
                    <td className="border border-[color:var(--color-border)] px-2 py-1">{shot.shotType}</td>
                    <td className="border border-[color:var(--color-border)] px-2 py-1">{shot.camera}</td>
                    <td className="border border-[color:var(--color-border)] px-2 py-1 leading-[1.5]">{shot.description}</td>
                    <td className="border border-[color:var(--color-border)] px-2 py-1 leading-[1.5]">{shot.dialogueOrSfx}</td>
                    <td className="border border-[color:var(--color-border)] px-2 py-1 text-right font-mono">
                      {shot.durationSec ?? "—"}
                    </td>
                    <td className="border border-[color:var(--color-border)] px-2 py-1 text-[color:var(--color-muted)]">
                      {shot.note ?? ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {!summary && currentEntry?.content && !running && (
        <section className="panel p-4">
          <pre className="whitespace-pre-wrap break-words text-[12px] leading-[1.7]">
            {currentEntry.content}
          </pre>
        </section>
      )}
    </div>
  );
}
