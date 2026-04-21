"use client";
import { BrainCircuit } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ProjectLLMCommand } from "@/lib/llm/types";
import { FieldSelect } from "./field-select";
import type { LLMConfig } from "./use-project-controls";

export interface CommandMeta {
  id: ProjectLLMCommand;
  label: string;
  desc: string;
}

export const BINDING_COMMANDS: CommandMeta[] = [
  { id: "default", label: "默认", desc: "未单独绑定时使用" },
  { id: "start", label: "立项", desc: "立项卡与题材判断" },
  { id: "plan", label: "节奏", desc: "节奏、爽点与卡点规划" },
  { id: "characters", label: "角色", desc: "人物卡与关系图" },
  { id: "outline", label: "分集", desc: "完整目录与标记" },
  { id: "episode", label: "剧本", desc: "长文本生成" },
  { id: "review", label: "复盘", desc: "评分与问题清单" },
  { id: "overseas", label: "出海", desc: "英文与文化适配" },
  { id: "compliance", label: "合规", desc: "批量审查" },
];

export function BindingPanel({
  configs,
  bindings,
  setBindings,
  loading,
  savingCommand,
  onSave,
}: {
  configs: LLMConfig[];
  bindings: Record<string, string>;
  setBindings: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  loading: boolean;
  savingCommand: string | null;
  onSave: (command: ProjectLLMCommand, configId: string) => void;
}) {
  const options = [
    { id: "slot:primary", name: "Slot · Primary", protocol: "openai" as const, model: "结构主模型" },
    { id: "slot:secondary", name: "Slot · Secondary", protocol: "openai" as const, model: "长文本模型" },
    { id: "slot:tertiary", name: "Slot · Tertiary", protocol: "openai" as const, model: "审校模型" },
    { id: "slot:overseas", name: "Slot · Overseas", protocol: "openai" as const, model: "出海模型" },
    ...configs,
  ];
  return (
    <div className="panel-2 p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <BrainCircuit className="h-4 w-4 text-[color:var(--color-accent)]" />
        按命令绑定模型
      </div>
      <div className="space-y-3">
        {BINDING_COMMANDS.map((item) => (
          <div
            key={item.id}
            className="grid gap-2 rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-3 md:grid-cols-[160px_1fr_auto] md:items-center"
          >
            <div>
              <div className="text-sm font-medium">{item.label}</div>
              <div className="text-xs text-[color:var(--color-muted)]">{item.desc}</div>
            </div>
            <FieldSelect
              label=""
              value={bindings[item.id] ?? ""}
              onChange={(value) => setBindings((prev) => ({ ...prev, [item.id]: value }))}
              options={options}
            />
            <Button
              size="sm"
              variant="ghost"
              disabled={loading || savingCommand === item.id}
              onClick={() => onSave(item.id, bindings[item.id] ?? "")}
            >
              保存
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
