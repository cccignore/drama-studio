"use client";
import { Sparkles } from "lucide-react";
import { ROUTING_PRESETS } from "@/lib/llm/presets";
import { FieldSelect } from "./field-select";
import type { LLMConfig, PresetForm } from "./use-project-controls";

export function MoEPresetPanel({
  configs,
  presetForm,
  setPresetForm,
  onApply,
}: {
  configs: LLMConfig[];
  presetForm: PresetForm;
  setPresetForm: React.Dispatch<React.SetStateAction<PresetForm>>;
  onApply: (presetId: string) => void;
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
    </div>
  );
}
