"use client";
import * as React from "react";
import { ChevronDown, ChevronRight, Flame, Coins } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { DirectoryExtract } from "@/lib/drama/parsers/extract-directory";

export function EpisodeDirectory({ data }: { data: DirectoryExtract }) {
  const [open, setOpen] = React.useState<Record<number, boolean>>(() =>
    Object.fromEntries(data.acts.map((_, i) => [i, true]))
  );

  const paywallCount = data.acts
    .flatMap((a) => a.episodes)
    .filter((e) => e.hasPaywall).length;
  const highlightCount = data.acts
    .flatMap((a) => a.episodes)
    .filter((e) => e.hasHighlight).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge tone="primary">总计 {data.total} 集</Badge>
        <Badge tone="warning" className="gap-1">
          <Flame className="h-3 w-3" /> {highlightCount} 个爽点
        </Badge>
        <Badge tone="success" className="gap-1">
          <Coins className="h-3 w-3" /> {paywallCount} 个付费卡点
        </Badge>
      </div>

      {data.acts.map((act, i) => (
        <section key={i} className="panel overflow-hidden">
          <button
            type="button"
            onClick={() => setOpen((o) => ({ ...o, [i]: !o[i] }))}
            className="flex w-full items-center justify-between border-b border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/50 px-4 py-2.5 text-left"
          >
            <div className="flex items-center gap-2">
              {open[i] ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              <span className="font-semibold">{act.name}</span>
              <span className="text-xs text-[color:var(--color-muted)]">
                第 {act.range} 集 · {act.episodes.length} 集
              </span>
            </div>
          </button>
          {open[i] && (
            <ol className="divide-y divide-[color:var(--color-border)]">
              {act.episodes.map((ep) => (
                <li
                  key={ep.index}
                  className={cn(
                    "flex items-start gap-3 px-4 py-3 text-sm",
                    ep.hasPaywall && "bg-[color:var(--color-success)]/5",
                    ep.hasHighlight && !ep.hasPaywall && "bg-[color:var(--color-warning)]/5"
                  )}
                >
                  <div className="flex w-16 shrink-0 flex-col items-start gap-1">
                    <span className="rounded bg-[color:var(--color-surface-2)] px-2 py-0.5 font-mono text-[11px]">
                      第 {ep.index} 集
                    </span>
                    <div className="flex items-center gap-1">
                      {ep.hasHighlight && <Flame className="h-3.5 w-3.5 text-[color:var(--color-warning)]" />}
                      {ep.hasPaywall && <Coins className="h-3.5 w-3.5 text-[color:var(--color-success)]" />}
                    </div>
                  </div>
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="font-medium">{ep.title}</div>
                    {ep.mainLine && (
                      <div className="text-[13px] leading-snug text-[color:var(--color-foreground)]/85">
                        <span className="text-[color:var(--color-accent)]">线：</span> {ep.mainLine}
                      </div>
                    )}
                    {ep.hook && (
                      <div className="text-[12px] leading-snug text-[color:var(--color-muted)]">
                        钩子：{ep.hook}
                      </div>
                    )}
                    {ep.ending && (
                      <div className="text-[12px] leading-snug text-[color:var(--color-muted)]">
                        结尾：{ep.ending}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      ))}
    </div>
  );
}
