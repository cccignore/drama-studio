"use client";
import type { LLMConfig } from "./use-project-controls";

export function FieldSelect({
  label,
  value,
  onChange,
  options,
  allowEmpty = true,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: LLMConfig[];
  allowEmpty?: boolean;
}) {
  return (
    <label className="space-y-1 text-xs text-[color:var(--color-muted)]">
      {label ? <span className="block">{label}</span> : null}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] px-3 text-sm text-[color:var(--color-foreground)]"
      >
        {allowEmpty && <option value="">使用默认模型</option>}
        {options.map((cfg) => (
          <option key={cfg.id} value={cfg.id}>
            {cfg.name} · {cfg.model}
          </option>
        ))}
      </select>
    </label>
  );
}
