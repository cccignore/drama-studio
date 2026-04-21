import { getDb } from "../db/sqlite";
import { getDefaultLLMConfig, getLLMConfig } from "./store";
import type { LLMConfig, LLMRoleSlot } from "./types";

export const ROLE_SLOTS: LLMRoleSlot[] = ["primary", "secondary", "tertiary", "overseas"];

export interface LLMRoleBinding {
  slot: LLMRoleSlot;
  configId: string;
  config: LLMConfig | null;
  updatedAt: number;
}

function isRoleSlot(input: string): input is LLMRoleSlot {
  return ROLE_SLOTS.includes(input as LLMRoleSlot);
}

export function parseSlotConfigId(configId: string): LLMRoleSlot | null {
  const m = configId.match(/^slot:(primary|secondary|tertiary|overseas)$/);
  return m && isRoleSlot(m[1]) ? m[1] : null;
}

export function listLLMRoleBindings(): LLMRoleBinding[] {
  const rows = getDb()
    .prepare(`SELECT slot, config_id, updated_at FROM llm_role_bindings ORDER BY slot ASC`)
    .all() as Array<{ slot: string; config_id: string; updated_at: number }>;
  return rows
    .filter((row) => isRoleSlot(row.slot))
    .map((row) => ({
      slot: row.slot as LLMRoleSlot,
      configId: row.config_id,
      config: getLLMConfig(row.config_id),
      updatedAt: row.updated_at,
    }));
}

export function getLLMRoleBinding(slot: LLMRoleSlot): LLMRoleBinding | null {
  const row = getDb()
    .prepare(`SELECT slot, config_id, updated_at FROM llm_role_bindings WHERE slot = ?`)
    .get(slot) as { slot: string; config_id: string; updated_at: number } | undefined;
  if (!row || !isRoleSlot(row.slot)) return null;
  return {
    slot,
    configId: row.config_id,
    config: getLLMConfig(row.config_id),
    updatedAt: row.updated_at,
  };
}

export function upsertLLMRoleBinding(slot: LLMRoleSlot, configId: string): LLMRoleBinding {
  if (!getLLMConfig(configId)) throw new Error(`模型配置 ${configId} 不存在`);
  const now = Date.now();
  getDb()
    .prepare(
      `INSERT INTO llm_role_bindings (slot, config_id, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(slot) DO UPDATE SET config_id = excluded.config_id, updated_at = excluded.updated_at`
    )
    .run(slot, configId, now);
  return getLLMRoleBinding(slot)!;
}

export function resolveConfigFromSlot(slot: LLMRoleSlot, includePlainKey = true): LLMConfig | null {
  const binding = getLLMRoleBinding(slot);
  if (binding?.configId) {
    const cfg = getLLMConfig(binding.configId, includePlainKey);
    if (cfg) return cfg;
  }
  return getDefaultLLMConfig(includePlainKey);
}

export function seedRoleBindings(input: Partial<Record<LLMRoleSlot, string>>) {
  for (const slot of ROLE_SLOTS) {
    const configId = input[slot];
    if (!configId || !getLLMConfig(configId)) continue;
    upsertLLMRoleBinding(slot, configId);
  }
}
