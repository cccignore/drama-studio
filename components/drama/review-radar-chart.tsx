"use client";
import * as React from "react";
import {
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from "recharts";
import type { ReviewScores } from "@/lib/drama/parsers/extract-review-json";

interface Props {
  scores: ReviewScores;
  compact?: boolean;
}

const LABELS: Record<keyof ReviewScores, string> = {
  pace: "节奏",
  satisfy: "爽点",
  dialogue: "台词",
  format: "格式",
  coherence: "一致",
};

export function ReviewRadarChart({ scores, compact }: Props) {
  const data = (Object.keys(LABELS) as (keyof ReviewScores)[]).map((key) => ({
    axis: LABELS[key],
    value: scores[key],
  }));
  const height = compact ? 180 : 260;
  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <RadarChart data={data} outerRadius="72%">
          <PolarGrid stroke="rgba(255,255,255,0.12)" />
          <PolarAngleAxis
            dataKey="axis"
            tick={{ fill: "rgba(255,255,255,0.75)", fontSize: 12 }}
          />
          <Radar
            dataKey="value"
            stroke="var(--color-primary)"
            fill="var(--color-primary)"
            fillOpacity={0.35}
            isAnimationActive={false}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
