"use client";
import * as React from "react";
import Link from "next/link";
import { Package } from "lucide-react";
import { ExportPanel } from "@/components/drama/export-panel";

export interface ExportEpisodeSummary {
  index: number;
  title: string;
  charCount: number;
  hasStoryboard: boolean;
}

interface Props {
  projectId: string;
  projectTitle: string;
  totalEpisodes: number;
  summaries: ExportEpisodeSummary[];
  stats: {
    totalChars: number;
    storyboardCount: number;
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
  const isMiniSeries = totalEpisodes <= 5;
  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <Package className="h-5 w-5 text-[color:var(--color-primary)]" />
            第 7 步 · 导出成品
          </h1>
          <p className="mt-1 text-sm text-[color:var(--color-muted)]">
            分别导出完整剧本、分镜脚本或交付包。
          </p>
        </div>
        <Link
          href={`/studio/${projectId}/storyboard`}
          className="text-xs text-[color:var(--color-muted)] underline-offset-4 hover:underline"
        >
          返回分镜
        </Link>
      </header>

      {isMiniSeries && (
        <section className="panel-2 flex items-center justify-between gap-3 p-4 text-sm">
          <div>
            <div className="font-medium">5 集试玩模式已进入导出阶段</div>
            <div className="mt-1 text-[color:var(--color-muted)]">
              可以先导出完整剧本或分镜脚本进行演示。
            </div>
          </div>
          <span className="rounded-full bg-[color:var(--color-primary)]/15 px-3 py-1 text-xs text-[color:var(--color-primary)]">
            轻量交付
          </span>
        </section>
      )}

      <section className="grid gap-4 md:grid-cols-4">
        <Metric label="集数进度" value={`${summaries.length} / ${totalEpisodes}`} />
        <Metric label="总字数" value={stats.totalChars.toLocaleString()} />
        <Metric label="分镜进度" value={`${stats.storyboardCount} / ${summaries.length}`} />
        <Metric label="交付格式" value="MD / Word / Zip" />
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
                <th className="py-2 text-right">分镜</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--color-border)]">
              {summaries.map((s) => (
                <tr key={s.index}>
                  <td className="py-1.5">#{s.index}</td>
                  <td className="py-1.5">{s.title || "—"}</td>
                  <td className="py-1.5 text-right tabular-nums">{s.charCount.toLocaleString()}</td>
                  <td className="py-1.5 text-right tabular-nums">
                    {s.hasStoryboard ? "已生成" : "未生成"}
                  </td>
                </tr>
              ))}
              {summaries.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-[color:var(--color-muted)]">
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
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="panel p-4">
      <div className="text-[11px] uppercase tracking-wide text-[color:var(--color-muted)]">
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}
