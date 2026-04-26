"use client";
import * as React from "react";
import { Layers } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function ConceptPanel({
  enabled,
  setEnabled,
  patchState,
}: {
  enabled: boolean;
  setEnabled: (next: boolean) => void;
  patchState: (patch: Record<string, unknown>) => Promise<unknown>;
}) {
  const save = async () => {
    try {
      await patchState({ complexReversalEnabled: enabled });
      toast.success(enabled ? "已启用复杂反转模式（下次跑 /creative 生效）" : "已关闭复杂反转模式");
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <div className="panel-2 p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <Layers className="h-4 w-4 text-[color:var(--color-warning)]" />
        复杂反转 concept 模式
      </div>
      <div className="space-y-3 text-sm">
        <div className="rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-3 text-xs leading-relaxed text-[color:var(--color-muted)]">
          仅作用于 <code className="rounded bg-[color:var(--color-surface-2)] px-1">/creative</code> 三幕创意阶段：
          切换到 5–7 层反转密度的输出模板，强制写出主角 5 要素视觉化模板，海外向使用全大写英文剧名。
          <span className="mt-1 block text-[color:var(--color-muted)]">适合海外平台（ReelShort/DramaBox）或想做"被反复颠覆"质感的高概念短剧。普通爽剧不建议开启。</span>
        </div>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          启用复杂反转（5–7 层反转密度 + 主角视觉模板）
        </label>
        <Button size="sm" variant="secondary" onClick={save}>
          保存复杂反转设置
        </Button>
      </div>
    </div>
  );
}
