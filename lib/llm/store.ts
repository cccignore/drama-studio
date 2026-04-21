import { nanoid } from "nanoid";
import { getDb } from "../db/sqlite";
import { encrypt, decrypt, maskKey } from "../crypto/aes";
import type { LLMConfig, LLMConfigRow, LLMProtocol, ProjectLLMCommand } from "./types";

function rowToConfig(row: LLMConfigRow, options: { includePlainKey?: boolean } = {}): LLMConfig {
  const apiKey = row.api_key ? decrypt(row.api_key) : "";
  return {
    id: row.id,
    name: row.name,
    protocol: row.protocol as LLMProtocol,
    baseUrl: row.base_url,
    apiKey: options.includePlainKey ? apiKey : maskKey(apiKey),
    model: row.model,
    extraHeaders: row.extra_headers ? JSON.parse(row.extra_headers) : undefined,
    isDefault: row.is_default === 1,
    createdAt: row.created_at,
  };
}

export function listLLMConfigs(): LLMConfig[] {
  const db = getDb();
  const rows = db
    .prepare(`SELECT * FROM llm_configs ORDER BY is_default DESC, created_at DESC`)
    .all() as LLMConfigRow[];
  return rows.map((r) => rowToConfig(r));
}

export function getLLMConfig(id: string, includePlainKey = false): LLMConfig | null {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM llm_configs WHERE id = ?`).get(id) as LLMConfigRow | undefined;
  return row ? rowToConfig(row, { includePlainKey }) : null;
}

export function getDefaultLLMConfig(includePlainKey = false): LLMConfig | null {
  const db = getDb();
  const row = db
    .prepare(`SELECT * FROM llm_configs WHERE is_default = 1 ORDER BY created_at DESC LIMIT 1`)
    .get() as LLMConfigRow | undefined;
  if (!row) {
    const any = db.prepare(`SELECT * FROM llm_configs ORDER BY created_at DESC LIMIT 1`).get() as
      | LLMConfigRow
      | undefined;
    return any ? rowToConfig(any, { includePlainKey }) : null;
  }
  return rowToConfig(row, { includePlainKey });
}

export interface CreateLLMConfigInput {
  id?: string;
  name: string;
  protocol: LLMProtocol;
  baseUrl: string;
  apiKey: string;
  model: string;
  extraHeaders?: Record<string, string>;
  isDefault?: boolean;
}

export function createLLMConfig(input: CreateLLMConfigInput): LLMConfig {
  return insertLLMConfig(input);
}

export function insertLLMConfig(input: CreateLLMConfigInput): LLMConfig {
  const db = getDb();
  const id = input.id ?? `cfg_${nanoid(10)}`;
  const now = Date.now();
  const tx = db.transaction(() => {
    if (input.isDefault) {
      db.prepare(`UPDATE llm_configs SET is_default = 0`).run();
    }
    db.prepare(
      `INSERT INTO llm_configs (id, name, protocol, base_url, api_key, model, extra_headers, is_default, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         protocol = excluded.protocol,
         base_url = excluded.base_url,
         api_key = excluded.api_key,
         model = excluded.model,
         extra_headers = excluded.extra_headers,
         is_default = excluded.is_default`
    ).run(
      id,
      input.name,
      input.protocol,
      input.baseUrl,
      encrypt(input.apiKey),
      input.model,
      input.extraHeaders ? JSON.stringify(input.extraHeaders) : null,
      input.isDefault ? 1 : 0,
      now
    );
  });
  tx();
  return getLLMConfig(id)!;
}

export interface UpdateLLMConfigInput {
  name?: string;
  protocol?: LLMProtocol;
  baseUrl?: string;
  apiKey?: string; // 传空字符串表示不改；传非空表示覆盖
  model?: string;
  extraHeaders?: Record<string, string> | null;
  isDefault?: boolean;
}

export function updateLLMConfig(id: string, input: UpdateLLMConfigInput): LLMConfig | null {
  const db = getDb();
  const existing = db.prepare(`SELECT * FROM llm_configs WHERE id = ?`).get(id) as LLMConfigRow | undefined;
  if (!existing) return null;
  const tx = db.transaction(() => {
    if (input.isDefault) {
      db.prepare(`UPDATE llm_configs SET is_default = 0`).run();
    }
    const apiKey = input.apiKey && input.apiKey.length > 0 ? encrypt(input.apiKey) : existing.api_key;
    const extra =
      input.extraHeaders === null
        ? null
        : input.extraHeaders
          ? JSON.stringify(input.extraHeaders)
          : existing.extra_headers;
    db.prepare(
      `UPDATE llm_configs SET name=?, protocol=?, base_url=?, api_key=?, model=?, extra_headers=?, is_default=? WHERE id=?`
    ).run(
      input.name ?? existing.name,
      input.protocol ?? existing.protocol,
      input.baseUrl ?? existing.base_url,
      apiKey,
      input.model ?? existing.model,
      extra,
      input.isDefault === undefined ? existing.is_default : input.isDefault ? 1 : 0,
      id
    );
  });
  tx();
  return getLLMConfig(id);
}

export function deleteLLMConfig(id: string): boolean {
  const db = getDb();
  const result = db.prepare(`DELETE FROM llm_configs WHERE id = ?`).run(id);
  return result.changes > 0;
}

export interface ProjectLLMBinding {
  projectId: string;
  command: ProjectLLMCommand;
  configId: string;
  config: LLMConfig | null;
}

const VALID_COMMANDS: ProjectLLMCommand[] = [
  "default",
  "start",
  "plan",
  "characters",
  "outline",
  "episode",
  "review",
  "export",
  "overseas",
  "compliance",
];

export function isProjectLLMCommand(input: string): input is ProjectLLMCommand {
  return VALID_COMMANDS.includes(input as ProjectLLMCommand);
}

export function listProjectLLMBindings(projectId: string): ProjectLLMBinding[] {
  const rows = getDb()
    .prepare(
      `SELECT project_id, command, config_id FROM project_llm_bindings WHERE project_id = ? ORDER BY command ASC`
    )
    .all(projectId) as Array<{ project_id: string; command: string; config_id: string }>;
  return rows.map((row) => ({
    projectId: row.project_id,
    command: row.command as ProjectLLMCommand,
    configId: row.config_id,
    config: getLLMConfig(row.config_id),
  }));
}

export function upsertProjectLLMBinding(
  projectId: string,
  command: ProjectLLMCommand,
  configId: string
): ProjectLLMBinding {
  getDb()
    .prepare(
      `INSERT INTO project_llm_bindings (project_id, command, config_id)
       VALUES (?, ?, ?)
       ON CONFLICT(project_id, command) DO UPDATE SET config_id = excluded.config_id`
    )
    .run(projectId, command, configId);
  return {
    projectId,
    command,
    configId,
    config: getLLMConfig(configId),
  };
}

export function deleteProjectLLMBinding(projectId: string, command: ProjectLLMCommand): boolean {
  const result = getDb()
    .prepare(`DELETE FROM project_llm_bindings WHERE project_id = ? AND command = ?`)
    .run(projectId, command);
  return result.changes > 0;
}
