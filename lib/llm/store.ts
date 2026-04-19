import { nanoid } from "nanoid";
import { getDb } from "../db/sqlite";
import { encrypt, decrypt, maskKey } from "../crypto/aes";
import type { LLMConfig, LLMConfigRow, LLMProtocol } from "./types";

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
  name: string;
  protocol: LLMProtocol;
  baseUrl: string;
  apiKey: string;
  model: string;
  extraHeaders?: Record<string, string>;
  isDefault?: boolean;
}

export function createLLMConfig(input: CreateLLMConfigInput): LLMConfig {
  const db = getDb();
  const id = `cfg_${nanoid(10)}`;
  const now = Date.now();
  const tx = db.transaction(() => {
    if (input.isDefault) {
      db.prepare(`UPDATE llm_configs SET is_default = 0`).run();
    }
    db.prepare(
      `INSERT INTO llm_configs (id, name, protocol, base_url, api_key, model, extra_headers, is_default, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
