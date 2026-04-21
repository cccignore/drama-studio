"use client";
import * as React from "react";
import { toast } from "sonner";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export interface ArtifactHistoryItem {
  version: number;
  source: string;
  parentVersion: number | null;
  createdAt: number;
  preview: string;
  length: number;
}

const SOURCE_LABEL: Record<string, string> = {
  generate: "生成",
  "ai-edit": "AI 改写",
  "manual-edit": "手动编辑",
  revert: "回滚",
};

export function HistoryList({
  projectId,
  artifactName,
  items,
  disabled,
  onReverted,
}: {
  projectId: string;
  artifactName: string;
  items: ArtifactHistoryItem[];
  disabled?: boolean;
  onReverted: () => void | Promise<void>;
}) {
  const [reverting, setReverting] = React.useState<number | null>(null);

  const revert = async (version: number) => {
    if (!confirm(`确定回滚到 v${version}？会生成一个新的回滚版本，不会删除历史。`)) return;
    setReverting(version);
    try {
      const res = await fetch(`/api/projects/${projectId}/artifacts/${artifactName}/revert`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ version }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || json?.success === false) {
        throw new Error(json?.error?.message ?? `回滚失败：${res.status}`);
      }
      toast.success(`已回滚为新版本 · v${json?.data?.item?.version ?? ""}`);
      await onReverted();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setReverting(null);
    }
  };

  if (items.length === 0) {
    return <div className="p-6 text-center text-sm text-[color:var(--color-muted)]">暂无版本历史</div>;
  }

  return (
    <div className="space-y-3">
      {items.map((item, index) => (
        <div
          key={`${item.version}-${index}`}
          className="rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3"
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              v{item.version}
              <Badge tone={item.source === "generate" ? "muted" : item.source === "revert" ? "warning" : "primary"}>
                {SOURCE_LABEL[item.source] ?? item.source}
              </Badge>
            </div>
            <Button
              size="sm"
              variant="ghost"
              disabled={disabled || reverting === item.version || index === 0}
              onClick={() => revert(item.version)}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              回滚
            </Button>
          </div>
          <div className="text-xs text-[color:var(--color-muted)]">
            {new Date(item.createdAt).toLocaleString()} · {item.length.toLocaleString()} 字
            {item.parentVersion ? ` · parent v${item.parentVersion}` : ""}
          </div>
          <div className="mt-2 line-clamp-3 text-xs leading-relaxed text-[color:var(--color-foreground)]/80">
            {item.preview || "（空）"}
          </div>
        </div>
      ))}
    </div>
  );
}
