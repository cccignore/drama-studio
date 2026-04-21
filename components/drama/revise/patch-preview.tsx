"use client";
import { Badge } from "@/components/ui/badge";

export interface PatchData {
  summary?: string;
  patches?: Array<{ old: string; new: string; anchor_before?: string }>;
  fallback?: string | null;
}

export function PatchPreview({ patch }: { patch: PatchData }) {
  const patches = patch.patches ?? [];
  return (
    <div className="rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 text-xs">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="font-medium">{patch.summary ?? "修改预览"}</span>
        <Badge tone={patch.fallback === "REWRITE" ? "warning" : "success"}>
          {patch.fallback === "REWRITE" ? "全量改写" : `${patches.length} 处`}
        </Badge>
      </div>
      <div className="space-y-2">
        {patches.map((item, index) => (
          <details key={index} className="rounded border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-2">
            <summary className="cursor-pointer text-[color:var(--color-muted)]">
              Patch {index + 1} · {item.anchor_before?.slice(0, 40) || "无锚点"}
            </summary>
            <div className="mt-2 grid gap-2">
              <pre className="whitespace-pre-wrap break-words rounded bg-red-500/10 p-2 text-red-200">
                - {item.old}
              </pre>
              <pre className="whitespace-pre-wrap break-words rounded bg-emerald-500/10 p-2 text-emerald-200">
                + {item.new}
              </pre>
            </div>
          </details>
        ))}
        {patches.length === 0 && (
          <div className="text-[color:var(--color-muted)]">本次由模型执行整体改写。</div>
        )}
      </div>
    </div>
  );
}
