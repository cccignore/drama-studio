"use client";
import * as React from "react";
import type { PlanCurvePoint } from "@/lib/drama/parsers/extract-plan-curve";

interface Props {
  points: PlanCurvePoint[];
  height?: number;
}

export function PaceWaveform({ points, height = 240 }: Props) {
  const width = 820;
  const padding = { top: 18, right: 18, bottom: 34, left: 18 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  const normalized = React.useMemo(() => {
    if (!points.length) return [];
    const maxEpisode = Math.max(...points.map((point) => point.episode));
    return points.map((point, index) => {
      const x =
        padding.left +
        (maxEpisode <= 1 ? 0 : ((point.episode - 1) / (maxEpisode - 1)) * innerWidth);
      const y =
        padding.top + (1 - (point.intensity - 1) / 4) * innerHeight;
      return {
        ...point,
        x,
        y,
        labelX: index === 0 || index === points.length - 1 || point.episode % 5 === 0,
      };
    });
  }, [innerHeight, innerWidth, points, padding.left, padding.top]);

  const polyline = normalized.map((point) => `${point.x},${point.y}`).join(" ");
  const area = normalized.length
    ? [
        `${padding.left},${height - padding.bottom}`,
        ...normalized.map((point) => `${point.x},${point.y}`),
        `${normalized[normalized.length - 1].x},${height - padding.bottom}`,
      ].join(" ")
    : "";

  return (
    <div className="overflow-x-auto rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3">
      {normalized.length === 0 ? (
        <div className="flex h-[180px] items-center justify-center text-sm text-[color:var(--color-muted)]">
          当前节奏规划还没有可视化数据。
        </div>
      ) : (
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-auto min-w-[720px] w-full"
          role="img"
          aria-label="节奏波形图"
        >
          <defs>
            <linearGradient id="pace-area" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {[1, 2, 3, 4, 5].map((level) => {
            const y = padding.top + (1 - (level - 1) / 4) * innerHeight;
            return (
              <g key={level}>
                <line
                  x1={padding.left}
                  x2={width - padding.right}
                  y1={y}
                  y2={y}
                  stroke="rgba(255,255,255,0.08)"
                  strokeDasharray="4 4"
                />
                <text
                  x={6}
                  y={y + 4}
                  fill="rgba(255,255,255,0.48)"
                  fontSize="11"
                >
                  {level}
                </text>
              </g>
            );
          })}

          <polygon points={area} fill="url(#pace-area)" />
          <polyline
            points={polyline}
            fill="none"
            stroke="var(--color-primary)"
            strokeWidth="3"
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {normalized.map((point) => (
            <g key={point.episode}>
              <circle
                cx={point.x}
                cy={point.y}
                r={point.paywall ? 6 : 4.5}
                fill={point.paywall ? "var(--color-accent)" : "var(--color-primary)"}
                stroke="rgba(10,10,18,0.72)"
                strokeWidth="2"
              >
                <title>
                  {`第 ${point.episode} 集 · 强度 ${point.intensity} / 爽点 ${point.payoff} / 钩子 ${point.hook}${
                    point.note ? ` · ${point.note}` : ""
                  }`}
                </title>
              </circle>
              {point.labelX && (
                <text
                  x={point.x}
                  y={height - 10}
                  textAnchor="middle"
                  fill="rgba(255,255,255,0.48)"
                  fontSize="11"
                >
                  {point.episode}
                </text>
              )}
            </g>
          ))}
        </svg>
      )}
    </div>
  );
}
