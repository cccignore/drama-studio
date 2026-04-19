# Drama Studio · M1 骨架

短剧创作工作台。当前代码对应方案文档的 **M1 · 基座与骨架**，实现了：

- Next 15 + TS + Tailwind 4 + Radix + sonner 等基础
- SQLite 持久化（`projects / artifacts / events / llm_configs / project_llm_bindings`）
- AES-256-GCM 加密存储 LLM api_key（密钥来自 `APP_SECRET`）
- LLM 适配层：OpenAI 兼容（DeepSeek / OpenAI / SiliconFlow 等）+ Anthropic 兼容
- LLM 路由（按命令绑定 / 全局默认）
- 统一 SSE 工具（`lib/api/sse.ts`）+ 心跳
- REST API：
  - `GET/POST /api/llm-configs` · `GET/PATCH/DELETE /api/llm-configs/:id` · `POST /api/llm-configs/:id/test`
  - `GET/POST /api/projects` · `GET/PATCH/DELETE /api/projects/:id` · `POST /api/projects/:id/run`
- 页面：首页、项目列表、项目详情 SSE Playground、模型设置
- 暗色工作台视觉

M2 起接入真实的 `/start → /export` 创作流程。

## 本地启动

```bash
cd drama-studio
cp .env.example .env
# 生成 APP_SECRET 并写入 .env
openssl rand -hex 32

npm install
npm run dev
```

打开 <http://localhost:3000>。

## 验收清单（M1）

1. **模型配置**
   - 访问 `/settings/models`，点「新增配置」，选 DeepSeek 预设，粘贴 key，保存
   - 点「测试」应 toast 成功并返回 PONG 或简短回复
2. **项目管理**
   - 访问 `/studio`，新建一个项目，列表出现
3. **SSE 流式验收**
   - 打开项目 → 在 SSE Playground 点「运行 ping」
   - 中间面板 partial 实时拼接 LLM 输出；右面板 SSE 事件流记录 `start / progress / partial × N / usage / done`
4. **API curl 验收**

   ```bash
   # 创建项目
   PID=$(curl -s -X POST localhost:3000/api/projects \
     -H 'content-type: application/json' -d '{}' | jq -r .data.item.id)

   # 流式 ping
   curl -N -X POST "localhost:3000/api/projects/$PID/run" \
     -H 'content-type: application/json' \
     -d '{"command":"ping","args":{"message":"hi"}}'
   ```

   终端应看到 `data: {...}` 逐条输出。

## 目录

```
app/
  layout.tsx  page.tsx            # 落地
  settings/models/                # LLM 配置
  studio/                         # 项目列表
  studio/[projectId]/             # 项目详情 + SSE Playground
  api/llm-configs/ …              # LLM 配置 CRUD + /test
  api/projects/ …                 # 项目 CRUD + /run SSE
components/
  layout/dashboard-shell.tsx
  ui/ (button/input/label/dialog/badge)
lib/
  api/ (errors / read-json-body / sse)
  crypto/ aes.ts
  db/ (sqlite + schema.sql)
  drama/ (types / store)
  llm/ (types / store / router / stream + providers/)
scripts/init-db.ts
```

## 环境变量

见 `.env.example`。关键：

- `APP_SECRET`：**必填**。32 字节 hex（`openssl rand -hex 32`）。用于加密 api_key。
- `DRAMA_DATA_DIR`：可选。数据库与运行期产物落点，默认 `./.data`。
- `DEFAULT_LLM_*`：可选。`npm run init-db` 会读取并写入默认配置。
