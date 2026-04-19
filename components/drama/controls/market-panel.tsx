"use client";
import * as React from "react";
import Link from "next/link";
import { Globe2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function MarketPanel({
  projectId,
  mode,
  onSetMode,
  onClose,
  patchState,
}: {
  projectId: string;
  mode: "domestic" | "overseas";
  onSetMode: (mode: "domestic" | "overseas") => void;
  onClose: () => void;
  patchState: (patch: Record<string, unknown>) => Promise<unknown>;
}) {
  return (
    <div className="panel-2 p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <Globe2 className="h-4 w-4 text-[color:var(--color-primary)]" />
        出海 / 合规快捷入口
      </div>
      <div className="space-y-3 text-sm">
        <div className="rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-3">
          <div className="font-medium">当前市场模式：{mode === "overseas" ? "出海" : "国内"}</div>
          <div className="mt-1 text-xs text-[color:var(--color-muted)]">
            出海模式会生成英文剧本，并切换到 Hollywood 标准格式。
          </div>
          <div className="mt-3 flex items-center gap-2">
            <Link href={`/studio/${projectId}/overseas`}>
              <Button size="sm" variant="secondary" onClick={onClose}>
                打开出海模式
              </Button>
            </Link>
            {mode === "overseas" && (
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  try {
                    await patchState({ mode: "domestic", language: "zh-CN" });
                    onSetMode("domestic");
                    toast.success("已切回国内模式");
                  } catch (err) {
                    toast.error((err as Error).message);
                  }
                }}
              >
                切回国内
              </Button>
            )}
          </div>
        </div>

        <div className="rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-3">
          <div className="font-medium">合规检查</div>
          <div className="mt-1 text-xs text-[color:var(--color-muted)]">
            基于已写剧本生成红线 / 风险 / 通过项三色面板。
          </div>
          <div className="mt-3">
            <Link href={`/studio/${projectId}/compliance`}>
              <Button size="sm" variant="secondary" onClick={onClose}>
                <ShieldCheck className="h-4 w-4" />
                打开合规检查
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
