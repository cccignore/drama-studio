"use client";
import * as React from "react";
import { AlertTriangle, Info, ShieldAlert } from "lucide-react";
import type { ReviewIssue } from "@/lib/drama/parsers/extract-review-json";

interface Props {
  issues: ReviewIssue[];
}

const LEVEL_META = {
  danger: {
    label: "严重",
    icon: ShieldAlert,
    className: "border-red-400/40 bg-red-500/10 text-red-200",
    iconClass: "text-red-300",
  },
  warn: {
    label: "警告",
    icon: AlertTriangle,
    className: "border-amber-400/40 bg-amber-500/10 text-amber-100",
    iconClass: "text-amber-300",
  },
  info: {
    label: "提示",
    icon: Info,
    className: "border-sky-400/40 bg-sky-500/10 text-sky-100",
    iconClass: "text-sky-300",
  },
} as const;

export function ReviewIssueList({ issues }: Props) {
  if (!issues.length) {
    return (
      <p className="text-sm text-[color:var(--color-foreground)]/60">
        （本集无需整改）
      </p>
    );
  }
  const sorted = [...issues].sort((a, b) => order(a.level) - order(b.level));
  return (
    <ul className="space-y-2">
      {sorted.map((issue, i) => {
        const meta = LEVEL_META[issue.level];
        const Icon = meta.icon;
        return (
          <li key={i} className={`rounded border px-3 py-2 ${meta.className}`}>
            <div className="flex items-start gap-2">
              <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${meta.iconClass}`} />
              <div className="flex-1 space-y-1 text-[13px]">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded bg-black/25 px-1.5 py-0.5 text-[11px] font-semibold">
                    {meta.label}
                  </span>
                  {issue.scene != null && (
                    <span className="text-[11px] opacity-75">场 {issue.scene}</span>
                  )}
                </div>
                <div className="leading-[1.6]">{issue.desc}</div>
                <div className="text-[12px] leading-[1.6] opacity-85">
                  <span className="font-medium">改写建议：</span>
                  {issue.fix}
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function order(level: ReviewIssue["level"]): number {
  return level === "danger" ? 0 : level === "warn" ? 1 : 2;
}
