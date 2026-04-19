"use client";
import * as React from "react";
import {
  Legend,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from "recharts";
import type { ReviewScores } from "@/lib/drama/parsers/extract-review-json";

interface ReviewCompareEntry {
  index: number;
  scores: ReviewScores;
}

const AXES: Array<{ key: keyof ReviewScores; label: string }> = [
  { key: "pace", label: "节奏" },
  { key: "satisfy", label: "爽点" },
  { key: "dialogue", label: "台词" },
  { key: "format", label: "格式" },
  { key: "coherence", label: "一致" },
];

const COLORS = [
  "hsl(262 80% 62%)",
  "hsl(32 95% 60%)",
  "hsl(196 82% 58%)",
  "hsl(142 70% 50%)",
];

export function ReviewCompareRadar({
  entries,
}: {
  entries: ReviewCompareEntry[];
}) {
  const data = React.useMemo(
    () =>
      AXES.map((axis) => {
        const row: Record<string, number | string> = { axis: axis.label };
        for (const entry of entries) {
          row[`ep_${entry.index}`] = entry.scores[axis.key];
        }
        return row;
      }),
    [entries]
  );

  if (entries.length === 0) {
    return (
      <div className="flex h-[260px] items-center justify-center rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] text-sm text-[color:var(--color-muted)]">
        至少选择 1 集已复盘剧本后，才能查看多集雷达对比。
      </div>
    );
  }

  return (
    <div className="rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3">
      <div style={{ width: "100%", height: 280 }}>
        <ResponsiveContainer>
          <RadarChart data={data} outerRadius="72%">
            <PolarGrid stroke="rgba(255,255,255,0.12)" />
            <PolarAngleAxis
              dataKey="axis"
              tick={{ fill: "rgba(255,255,255,0.75)", fontSize: 12 }}
            />
            {entries.map((entry, index) => (
              <Radar
                key={entry.index}
                name={`第 ${entry.index} 集`}
                dataKey={`ep_${entry.index}`}
                stroke={COLORS[index % COLORS.length]}
                fill={COLORS[index % COLORS.length]}
                fillOpacity={0.12 + index * 0.04}
                isAnimationActive={false}
              />
            ))}
            <Legend
              wrapperStyle={{ fontSize: 12, color: "rgba(255,255,255,0.72)" }}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
