import { getDb } from "../db/sqlite";
import { getLLMConfig, getDefaultLLMConfig } from "./store";
import type { LLMConfig } from "./types";

/**
 * 命令到模型的路由：
 * 1. 若 project 明确绑定了该 command（或 'default'）→ 用绑定
 * 2. 否则用全局默认
 */
export function resolveConfigForCommand(command: string, projectId?: string): LLMConfig | null {
  const db = getDb();
  if (projectId) {
    const row = db
      .prepare(
        `SELECT config_id FROM project_llm_bindings WHERE project_id = ? AND (command = ? OR command = 'default')
         ORDER BY CASE WHEN command = ? THEN 0 ELSE 1 END LIMIT 1`
      )
      .get(projectId, command, command) as { config_id?: string } | undefined;
    if (row?.config_id) {
      const cfg = getLLMConfig(row.config_id, true);
      if (cfg) return cfg;
    }
  }
  return getDefaultLLMConfig(true);
}
