"use client";
import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Play,
  ShieldAlert,
  ShieldCheck,
  Square,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { StreamingConsole } from "@/components/wizard/streaming-console";
import { useStreamingCommand } from "@/hooks/use-streaming-command";
import {
  extractComplianceJson,
  type ComplianceItem,
  type ComplianceReport,
} from "@/lib/drama/parsers/extract-compliance-json";

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const json = await res.json();
  if (!res.ok || json.success === false) {
    throw new Error(json?.error?.message ?? `请求失败：${res.status}`);
  }
  return json.data as T;
}

export function ComplianceClient({
  projectId,
  writtenEpisodes,
  initialReport,
}: {
  projectId: string;
  writtenEpisodes: number;
  initialReport: ComplianceReport | null;
}) {
  const [report, setReport] = React.useState<ComplianceReport | null>(initialReport);

  const refreshReport = React.useCallback(async () => {
    try {
      const data = await api<{ item: { content: string } }>(
        `/api/projects/${projectId}/artifacts/compliance-report`
      );
      const parsed = extractComplianceJson(data.item.content);
      if (parsed.ok) setReport(parsed.data);
    } catch {
      /* ignore */
    }
  }, [projectId]);

  const { run, stop, running, partial, events, error } = useStreamingCommand({
    projectId,
    command: "compliance",
    onDone: async () => {
      await refreshReport();
      toast.success("合规检查已完成");
    },
  });

  const grouped = React.useMemo(() => {
    const items = report?.items ?? [];
    return {
      blocker: items.filter((item) => item.level === "blocker"),
      risk: items.filter((item) => item.level === "risk"),
      pass: items.filter((item) => item.level === "pass"),
    };
  }, [report]);

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <ShieldCheck className="h-5 w-5 text-[color:var(--color-primary)]" />
            合规检查
          </h1>
          <p className="mt-1 text-sm text-[color:var(--color-muted)]">
            批量读取已写剧本，输出红线 / 风险 / 通过项三色面板，便于在导出前快速处理。
          </p>
        </div>
        <Link href={`/studio/${projectId}/export`}>
          <Button variant="secondary">
            去导出 <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </header>

      <section className="panel flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="text-sm text-[color:var(--color-muted)]">
          当前可审查 {writtenEpisodes} 集剧本。合规报告会保存为项目 artifact，后续可重复刷新。
        </div>
        {running ? (
          <Button variant="danger" onClick={stop}>
            <Square className="h-4 w-4" />
            终止
          </Button>
        ) : (
          <Button onClick={() => run()}>
            <Play className="h-4 w-4" />
            {report ? "重新检查合规" : "开始合规检查"}
          </Button>
        )}
      </section>

      <StreamingConsole running={running} partial={partial} events={events} error={error} />

      {report && (
        <>
          <section className="grid gap-3 md:grid-cols-3">
            <MetricCard
              title="红线 / 阻断"
              icon={<ShieldAlert className="h-4 w-4" />}
              tone="danger"
              value={report.totals.blocker}
            />
            <MetricCard
              title="可改风险"
              icon={<TriangleAlert className="h-4 w-4" />}
              tone="warning"
              value={report.totals.risk}
            />
            <MetricCard
              title="通过项"
              icon={<CheckCircle2 className="h-4 w-4" />}
              tone="success"
              value={report.totals.pass}
            />
          </section>

          <section className="panel p-5">
            <h3 className="text-sm font-semibold">总体结论</h3>
            <p className="mt-2 text-sm leading-7 text-[color:var(--color-muted-foreground)]">
              {report.summary}
            </p>
            <div className="mt-4 space-y-2">
              <div className="text-xs font-semibold text-[color:var(--color-muted)]">
                全局建议
              </div>
              <div className="grid gap-2">
                {report.globalAdvice.map((advice, index) => (
                  <div
                    key={`${advice}-${index}`}
                    className="rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] px-3 py-2 text-sm"
                  >
                    {advice}
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="grid gap-4 xl:grid-cols-3">
            <ComplianceColumn
              title="红线 / 阻断"
              description="必须先改，再进入正式导出。"
              tone="danger"
              items={grouped.blocker}
            />
            <ComplianceColumn
              title="可改风险"
              description="建议优先改写，降低审核和价值观风险。"
              tone="warning"
              items={grouped.risk}
            />
            <ComplianceColumn
              title="通过项"
              description="目前处理合规，可作为保留依据。"
              tone="success"
              items={grouped.pass}
            />
          </section>
        </>
      )}
    </div>
  );
}

function MetricCard({
  title,
  icon,
  value,
  tone,
}: {
  title: string;
  icon: React.ReactNode;
  value: number;
  tone: "danger" | "warning" | "success";
}) {
  const palette =
    tone === "danger"
      ? "border-red-500/30 bg-red-500/10 text-red-200"
      : tone === "warning"
        ? "border-amber-400/30 bg-amber-400/10 text-amber-100"
        : "border-emerald-500/30 bg-emerald-500/10 text-emerald-100";
  return (
    <div className={`rounded-2xl border p-4 ${palette}`}>
      <div className="flex items-center gap-2 text-sm font-medium">
        {icon}
        {title}
      </div>
      <div className="mt-3 text-3xl font-semibold">{value}</div>
    </div>
  );
}

function ComplianceColumn({
  title,
  description,
  tone,
  items,
}: {
  title: string;
  description: string;
  tone: "danger" | "warning" | "success";
  items: ComplianceItem[];
}) {
  const palette =
    tone === "danger"
      ? "border-red-500/30"
      : tone === "warning"
        ? "border-amber-400/30"
        : "border-emerald-500/30";
  return (
    <section className={`panel p-4 ${palette}`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="mt-1 text-xs text-[color:var(--color-muted)]">{description}</p>
        </div>
        <span className="text-xs text-[color:var(--color-muted)]">{items.length} 条</span>
      </div>
      <div className="mt-4 space-y-3">
        {items.length === 0 ? (
          <div className="rounded-md border border-dashed border-[color:var(--color-border)] px-3 py-4 text-sm text-[color:var(--color-muted)]">
            暂无条目
          </div>
        ) : (
          items.map((item, index) => (
            <article
              key={`${item.episode}-${item.rule}-${index}`}
              className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3"
            >
              <div className="text-xs text-[color:var(--color-muted)]">
                第 {item.episode} 集 · {item.category}
              </div>
              <div className="mt-1 text-sm font-medium">{item.rule}</div>
              <div className="mt-2 text-sm leading-6 text-[color:var(--color-muted-foreground)]">
                {item.finding}
              </div>
              <div className="mt-2 rounded-md bg-black/15 px-3 py-2 text-sm">
                建议：{item.suggestion}
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
