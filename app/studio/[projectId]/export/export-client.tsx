"use client";
import * as React from "react";
import Link from "next/link";
import { Package } from "lucide-react";
import { ExportPanel } from "@/components/drama/export-panel";

export interface ExportEpisodeSummary {
  index: number;
  title: string;
  charCount: number;
  avg: number | null;
  danger: number;
  warn: number;
}

interface Props {
  projectId: string;
  projectTitle: string;
  totalEpisodes: number;
  summaries: ExportEpisodeSummary[];
  stats: {
    totalChars: number;
    totalDanger: number;
    totalWarn: number;
    avgAll: number | null;
  };
}

export function ExportStepClient({
  projectId,
  projectTitle,
  totalEpisodes,
  summaries,
  stats,
}: Props) {
  const episodes = summaries.map((s) => s.index);
  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <Package className="h-5 w-5 text-[color:var(--color-primary)]" />
            第 7 步 · 导出成品
          </h1>
          <p className="mt-1 text-sm text-[color:var(--color-muted)]">
            将全剧打包成 Markdown / Word / Zip，一键交付。
          </p>
        </div>
        <Link
          href={`/studio/${projectId}/review`}
          className="text-xs text-[color:var(--color-muted)] underline-offset-4 hover:underline"
        >
          返回复盘
        </Link>
      </header>

      <section className="grid gap-4 md:grid-cols-4">
        <Metric label="集数进度" value={`${summaries.length} / ${totalEpisodes}`} />
        <Metric label="总字数" value={stats.totalChars.toLocaleString()} />
        <Metric label="全剧均分" value={stats.avgAll !== null ? String(stats.avgAll) : "—"} />
        <Metric
          label="严重/警告"
          value={`${stats.totalDanger} / ${stats.totalWarn}`}
          variant={stats.totalDanger > 0 ? "danger" : "default"}
        />
      </section>

      <ExportPanel projectId={projectId} projectTitle={projectTitle} episodes={episodes} />

      <section className="panel p-5">
        <h2 className="mb-3 text-sm font-semibold">分集概览</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="text-[11px] text-[color:var(--color-muted)]">
              <tr>
                <th className="py-2 text-left">集</th>
                <th className="py-2 text-left">标题</th>
                <th className="py-2 text-right">字数</th>
                <th className="py-2 text-right">均分</th>
                <th className="py-2 text-right">严重 / 警告</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--color-border)]">
              {summaries.map((s) => (
                <tr key={s.index}>
                  <td className="py-1.5">#{s.index}</td>
                  <td className="py-1.5">{s.title || "—"}</td>
                  <td className="py-1.5 text-right tabular-nums">{s.charCount.toLocaleString()}</td>
                  <td className="py-1.5 text-right tabular-nums">
                    {s.avg !== null ? s.avg.toFixed(1) : "—"}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">
                    <span className={s.danger > 0 ? "text-red-300" : ""}>{s.danger}</span>
                    <span className="mx-1 opacity-50">/</span>
                    <span className={s.warn > 0 ? "text-amber-300" : ""}>{s.warn}</span>
                  </td>
                </tr>
              ))}
              {summaries.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-[color:var(--color-muted)]">
                    尚无剧本可导出
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Metric({
  label,
  value,
  variant = "default",
}: {
  label: string;
  value: string;
  variant?: "default" | "danger";
}) {
  return (
    <div
      className={
        "panel p-4 " +
        (variant === "danger" ? "border-red-500/40 bg-red-500/10" : "")
      }
    >
      <div className="text-[11px] uppercase tracking-wide text-[color:var(--color-muted)]">
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}
