import { getDb } from "../lib/db/sqlite";
import { listLLMConfigs, createLLMConfig } from "../lib/llm/store";

function main() {
  const db = getDb();
  const count = (db.prepare(`SELECT COUNT(*) as c FROM projects`).get() as { c: number }).c;
  console.log(`[init-db] projects 表就绪（现有 ${count} 条）`);

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
