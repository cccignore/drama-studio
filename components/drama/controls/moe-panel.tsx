"use client";
import { Sparkles } from "lucide-react";
import { ROUTING_PRESETS } from "@/lib/llm/presets";
import { FieldSelect } from "./field-select";
import type { LLMConfig, PresetForm } from "./use-project-controls";
import { BINDING_COMMANDS } from "./binding-panel";

export function MoEPresetPanel({
  configs,
  presetForm,
  setPresetForm,
  onApply,
  resolvedBindings,
}: {
  configs: LLMConfig[];
  presetForm: PresetForm;
  setPresetForm: React.Dispatch<React.SetStateAction<PresetForm>>;
  onApply: (presetId: string) => void;
  resolvedBindings?: Record<string, LLMConfig | null>;
}) {
  return (
    <div className="panel-2 p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <Sparkles className="h-4 w-4 text-[color:var(--color-primary)]" />
        MoE 路由预设
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        <FieldSelect
          label="默认模型"
          value={presetForm.defaultConfigId}
          onChange={(value) => setPresetForm((prev) => ({ ...prev, defaultConfigId: value }))}
          options={configs}
          allowEmpty={false}
        />
        <FieldSelect
          label="主模型"
          value={presetForm.primaryConfigId}
          onChange={(value) => setPresetForm((prev) => ({ ...prev, primaryConfigId: value }))}
          options={configs}
          allowEmpty={false}
        />
        <FieldSelect
          label="第二模型"
          value={presetForm.secondaryConfigId}
          onChange={(value) => setPresetForm((prev) => ({ ...prev, secondaryConfigId: value }))}
          options={configs}
        />
        <FieldSelect
          label="第三模型"
          value={presetForm.tertiaryConfigId}
          onChange={(value) => setPresetForm((prev) => ({ ...prev, tertiaryConfigId: value }))}
          options={configs}
        />
        <FieldSelect
          label="出海模型"
          value={presetForm.overseasConfigId}
          onChange={(value) => setPresetForm((prev) => ({ ...prev, overseasConfigId: value }))}
          options={configs}
        />
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-3">
        {ROUTING_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => onApply(preset.id)}
            className="rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 py-3 text-left text-sm transition hover:border-[color:var(--color-primary)]/50"
          >
            <div className="font-medium">{preset.name}</div>
            <div className="mt-1 text-xs text-[color:var(--color-muted)]">
              {preset.description}
            </div>
          </button>
        ))}
      </div>
      {resolvedBindings && Object.keys(resolvedBindings).length > 0 && (
        <div className="mt-4 rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-3">
          <div className="mb-2 text-xs font-medium text-[color:var(--color-muted)]">
            当前项目实际路由
          </div>
          <div className="grid gap-1.5 text-xs md:grid-cols-2">
            {BINDING_COMMANDS.filter((item) => item.id !== "default").map((item) => {
              const cfg = resolvedBindings[item.id];
              return (
                <div key={item.id} className="flex items-center justify-between gap-2">
                  <span className="text-[color:var(--color-muted)]">{item.label}</span>
                  <span className="truncate text-[color:var(--color-foreground)]">
                    {cfg ? `${cfg.name} · ${cfg.model}` : "使用默认模型"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
