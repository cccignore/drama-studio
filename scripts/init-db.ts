import fs from "node:fs";
import path from "node:path";
import { getDb } from "../lib/db/sqlite";
import { listLLMConfigs, createLLMConfig, insertLLMConfig } from "../lib/llm/store";
import { seedRoleBindings } from "../lib/llm/role-store";

function loadEnvFile() {
  const file = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    if (process.env[key] !== undefined) continue;
    let value = line.slice(idx + 1).trim();
    value = value.replace(/^['"]|['"]$/g, "");
    process.env[key] = value;
  }
}

function seedYunwuConfigs() {
  const key = process.env.YUNWU_API_KEY;
  if (!key) {
    console.log("[init-db] 未检测到 YUNWU_API_KEY，跳过云雾模型预置");
    return;
  }
  const baseUrl = process.env.YUNWU_BASE_URL || "https://api.yunwu.ai/v1";
  const db = getDb();
  const existing = db
    .prepare(`SELECT id FROM llm_configs WHERE base_url = ?`)
    .all(baseUrl) as Array<{ id: string }>;
  if (existing.length > 0) {
    seedRoleBindings({
      primary: "yunwu-gpt54",
      secondary: "yunwu-ds32",
      tertiary: "yunwu-grok42",
      overseas: "yunwu-gpt54",
    });
    console.log(`[init-db] 云雾模型已存在 ${existing.length} 条，跳过重复预置`);
    return;
  }

  const configs = [
    { id: "yunwu-gpt54", name: "GPT-5.4 (云雾)", model: "gpt-5.4", isDefault: true },
    { id: "yunwu-ds32", name: "DeepSeek-V3.2 (云雾)", model: "deepseek-v3.2", isDefault: false },
    { id: "yunwu-grok42", name: "Grok-4.2 (云雾)", model: "grok-4.2", isDefault: false },
  ];
  for (const cfg of configs) {
    insertLLMConfig({
      id: cfg.id,
      name: cfg.name,
      protocol: "openai",
      baseUrl,
      apiKey: key,
      model: cfg.model,
      isDefault: cfg.isDefault,
    });
  }
  seedRoleBindings({
    primary: "yunwu-gpt54",
    secondary: "yunwu-ds32",
    tertiary: "yunwu-grok42",
    overseas: "yunwu-gpt54",
  });
  console.log("[init-db] ✓ 已预置云雾 GPT-5.4 / DeepSeek-V3.2 / Grok-4.2 与 MoE 角色槽位");
}

function main() {
  loadEnvFile();
  const db = getDb();
  const count = (db.prepare(`SELECT COUNT(*) as c FROM projects`).get() as { c: number }).c;
  console.log(`[init-db] projects 表就绪（现有 ${count} 条）`);
  seedYunwuConfigs();

  const existing = listLLMConfigs();
  if (existing.length === 0 && process.env.DEFAULT_LLM_API_KEY) {
    console.log("[init-db] 检测到 DEFAULT_LLM_API_KEY，正在写入默认 LLM 配置…");
    createLLMConfig({
      name: process.env.DEFAULT_LLM_NAME ?? "Default LLM",
      protocol: (process.env.DEFAULT_LLM_PROTOCOL as "openai" | "anthropic") ?? "openai",
      baseUrl: process.env.DEFAULT_LLM_BASE_URL ?? "https://api.deepseek.com/v1",
      apiKey: process.env.DEFAULT_LLM_API_KEY,
      model: process.env.DEFAULT_LLM_MODEL ?? "deepseek-chat",
      isDefault: true,
    });
    console.log("[init-db] ✓ 已写入默认配置");
  } else {
    console.log(`[init-db] llm_configs 已有 ${existing.length} 条，跳过默认初始化`);
  }
}

main();
