# Drama Studio · 下一轮优化实施计划

本轮目标：把项目从「能跑通流程」推进到「可以当正式创作工具用」。四个模块：

1. **云雾网关接入**：把 `https://api.yunwu.ai/v1` 作为默认上游，开箱即用 GPT-5.4。
2. **质量优先 MoE**：跨厂商混用 GPT-5.4 / DeepSeek-v3.2 / Grok-4.2，不同 step 绑不同模型。
3. **海外模式双语**：场景描写与舞台提示用中文，角色台词用英文。
4. **Step 级编辑**：每个 step 产物都能「和 AI 对话式局部改写」+「手动编辑 Markdown 源码」，带版本历史与回滚。

---

## 模块 1 · 云雾网关与默认模型接入

### 决策

- 云雾是标准 OpenAI 兼容网关，现有 [lib/llm/providers/openai-compatible.ts](./lib/llm/providers/openai-compatible.ts) 直接复用，不需要新 provider。
- API key **不进 git**：仓库里只留 `.env.example` 占位，真实 key 只写本地 `.env` 与服务器 `.env`。
- 首次启动如果检测到 `YUNWU_API_KEY` 就自动预置三条配置（GPT-5.4 / DeepSeek-v3.2 / Grok-4.2）；否则保持现状让用户手动在 `/settings/models` 加。

### 具体改动

**[.env.example](./.env.example)** 新增：

```bash
# 云雾一站式网关（可选，填了会自动预置三条模型）
YUNWU_API_KEY=
YUNWU_BASE_URL=https://api.yunwu.ai/v1
```

**[scripts/init-db.ts](./scripts/init-db.ts)** 增加 `seedYunwuConfigs()`：

```ts
function seedYunwuConfigs() {
  const key = process.env.YUNWU_API_KEY;
  if (!key) return;
  const baseUrl = process.env.YUNWU_BASE_URL || "https://api.yunwu.ai/v1";
  const db = getDb();
  const existing = db.prepare(`SELECT id FROM llm_configs WHERE base_url = ?`).all(baseUrl);
  if (existing.length > 0) return; // 已种过

  const configs = [
    { id: "yunwu-gpt54",   name: "GPT-5.4 (云雾)",       model: "gpt-5.4",         isDefault: 1 },
    { id: "yunwu-ds32",    name: "DeepSeek-V3.2 (云雾)", model: "deepseek-v3.2",   isDefault: 0 },
    { id: "yunwu-grok42",  name: "Grok-4.2 (云雾)",      model: "grok-4.2",        isDefault: 0 },
  ];
  for (const c of configs) {
    insertLLMConfig({
      id: c.id, name: c.name, protocol: "openai", baseUrl, apiKey: key, model: c.model,
      isDefault: c.isDefault,
    });
  }
}
```

**[README.md](./README.md)** 本地启动章节增加一行：
> 想一键用上 GPT-5.4 / DeepSeek / Grok？在 `.env` 里填 `YUNWU_API_KEY`，然后 `npm run init-db` 会自动预置三条模型。

### 验收点

- `rm -rf .data && YUNWU_API_KEY=xxx npm run init-db` 后，`/settings/models` 里出现三条配置，GPT-5.4 为默认。
- 不填 `YUNWU_API_KEY` 跑 init-db，仍然不种任何模型，保持现状。

---

## 模块 2 · 质量优先 MoE 绑定

### 现状问题

[lib/llm/presets.ts](./lib/llm/presets.ts) 里的 `primary / secondary / tertiary` 是抽象槽位，但**没有任何地方把槽位映射到真实 config_id**；[lib/llm/router.ts](./lib/llm/router.ts) 只读 `project_llm_bindings(project_id, command, config_id)`。结果：切预设相当于没切。

### 方案

**新表** `llm_role_bindings`：全局「槽位 → 模型」映射。

```sql
CREATE TABLE IF NOT EXISTS llm_role_bindings (
  slot       TEXT PRIMARY KEY,      -- 'primary' | 'secondary' | 'tertiary' | 'overseas'
  config_id  TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
```

初始化时 seed：

| slot | config_id | 对应模型 |
|---|---|---|
| primary | `yunwu-gpt54` | GPT-5.4 |
| secondary | `yunwu-ds32` | DeepSeek-V3.2 |
| tertiary | `yunwu-grok42` | Grok-4.2 |
| overseas | `yunwu-gpt54` | GPT-5.4（跟 primary 同） |

**新预设** `quality-moe`（在 [lib/llm/presets.ts](./lib/llm/presets.ts) 追加，并设为新项目默认）：

```ts
{
  id: "quality-moe",
  name: "质量优先 MoE（推荐）",
  description: "GPT-5.4 负责结构化，DeepSeek-V3.2 写长剧本，Grok-4.2 审校。",
  commands: {
    start: "primary",        // GPT-5.4
    plan: "primary",
    characters: "primary",
    outline: "primary",
    episode: "secondary",    // DeepSeek-V3.2
    review: "tertiary",      // Grok-4.2
    compliance: "tertiary",
    overseas: "overseas",    // GPT-5.4
    export: "default",
  },
}
```

**router 改造** ([lib/llm/router.ts](./lib/llm/router.ts))：在 `resolveConfigForCommand` 增加一层解析。解析顺序：

1. `project_llm_bindings(project_id, command)` → 用项目级绑定
2. 若命中但 `config_id` 以 `slot:` 开头（例如 `slot:primary`），去 `llm_role_bindings` 查真实 config_id
3. 否则回落到全局默认

换言之：「应用预设」= 把预设的 `command → slot` 写成 `project_llm_bindings(project_id, command, "slot:"+slot)`；真实解析在运行时发生。这样用户换了 primary 槽的模型，所有项目自动跟上。

**UI 改造**（[components/drama/controls/*](./components/drama/controls/)）：

- 模型设置页 `/settings/models` 新增「模型角色」tab：三行下拉，分别绑 primary / secondary / tertiary / overseas 槽到某条 config。
- 项目增强面板的「MoE 路由」区块：预设选项增加「质量优先 MoE」并默认勾选；展示当前每个 command 实际会用的模型名（从槽解析出来）。

**新项目默认**：在 [lib/drama/store.ts:createProject](./lib/drama/store.ts) 里，创建项目同时写入 quality-moe 预设的 bindings。

### 验收点

- 新建项目 → 项目增强面板看到每个 step 已自动分配 GPT/DeepSeek/Grok。
- 运行 `episode` 时 `events` 表里记录的模型名应是 `deepseek-v3.2`。
- 在模型角色页把 secondary 从 DeepSeek-V3.2 改成 DeepSeek-V3.2-Fast，所有项目 episode 步骤立刻跟着变，不需要重新应用预设。

---

## 模块 3 · 海外模式双语改造

### 目标格式

```
## 场 1 · Café at 5th Avenue（纽约咖啡馆 / 日）

△ （特写）林夏（Lin Xia）推门而入，风衣被风吹得贴在身上
♪ 轻柔钢琴曲
**林夏 / Lin Xia**（惊讶）: Chen? What are you doing here?
**陈辰 / Chen Morrison**（冷静）: I've been waiting for you. For three years.
```

规则：
- **中文**：场次编号、场景标题（中英并列 / 日夜）、`△` 动作与镜头、`♪` 音乐提示、角色情绪括号
- **英文**：对白本体
- **双语并列**：角色名首次出现写 `中文名 / English Name`，后续用英文主名（`Chen Morrison`）即可，避免台词前长名字看着乱
- 目录/剧情摘要保持现有出海 brief（中文描述）

### 具体改动

**[lib/drama/prompts/overseas.ts](./lib/drama/prompts/overseas.ts)** 重写产出规则：

- Brief 本身改回中文（市场定位、改编策略、风险提示都用中文）
- 新增 `## 6. 剧本语言规范`，强制约束 Writer：
  - 场记/动作/音乐/情绪 → 中文
  - 对白 → English only，口语化，不要把中文思路硬翻
  - 角色名首现中英并列，之后用英文
  - 不允许出现 "I am very 生气" 这类中英混杂对白

**[lib/drama/prompts/episode.ts](./lib/drama/prompts/episode.ts)** 的 overseas 分支：

```ts
if (ctx.overseasBrief) {
  lines.push("【双语格式硬约束】");
  lines.push("- 场景标题、△ 镜头提示、♪ 音乐提示、（情绪）括号 → 一律中文");
  lines.push("- 每句对白 → English only，不允许中英混杂");
  lines.push("- 角色名：首次出场 `林夏 / Lin Xia`，之后统一用英文主名");
  lines.push("- 禁止用 'she said' / 'he replied' 这类叙事描述，台词必须是纯对白");
}
```

**[components/drama/screenplay-renderer.tsx](./components/drama/screenplay-renderer.tsx)** 确认渲染兼容：

- 当前解析器按 `**名字**（情绪）：台词` 匹配。需同时接受：
  - `**中文 / English**（情绪）: 英文台词`
  - `: ` 英文冒号 + 空格（英文环境常见）
- 加对应单测 [tests/screenplay-parse.test.ts](./tests/screenplay-parse.test.ts)。

**[references/](./references/)** 新增一份 `hollywood-bilingual.md` 取代现有 `hollywood-standard.md` 在 overseas 场景下的加载（[lib/drama/references.ts](./lib/drama/references.ts) 里的加载表改一下）。

### 验收点

- 已有项目切出海 → 重跑 `episode 1` → 输出应满足：场记中文 / 台词英文 / 无中英混杂
- 旧的「整集纯英文」行为彻底消失
- `overseas` brief 输出语言是中文（读着不累）

---

## 模块 4 · Step 级对话式编辑 + 手动编辑

**这是本轮最大块，也是最影响体验的改动。**

### 核心决策

- **版本历史复用现有 `artifacts.version`**。不建新表。新增 `source` 与 `parent_version` 两列区分来源。
- **对话历史**落一张新表 `step_conversations`，和 artifact 版本链挂钩。
- **AI 改写**采用「锚点 + 替换」补丁格式，而非 unified diff（对长段散文更鲁棒，LLM 也更容易生成）。
- **手动编辑**直接给 Markdown 源码 textarea（Monaco 太重，这轮不上），保存即产生新版本。
- **局部改写**若 LLM 自判「改动 > 30%」，自动退化为整体重写。

### 数据库变更

在 [lib/db/schema.sql](./lib/db/schema.sql) 追加：

```sql
-- 给 artifacts 加来源标记
ALTER TABLE artifacts ADD COLUMN source TEXT NOT NULL DEFAULT 'generate';
-- generate | ai-edit | manual-edit | revert

ALTER TABLE artifacts ADD COLUMN parent_version INTEGER;
-- 这条版本基于哪一版改出来的；generate 为空，其它为对应 version

-- 对话式改写的多轮历史
CREATE TABLE IF NOT EXISTS step_conversations (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id     TEXT NOT NULL,
  artifact_name  TEXT NOT NULL,       -- 'start-card' | 'plan' | 'episode-3' 等
  role           TEXT NOT NULL,       -- 'user' | 'assistant' | 'system'
  content        TEXT NOT NULL,
  patch_json     TEXT,                -- assistant 消息若产出 patch，存这里
  applied_version INTEGER,            -- 应用后产生的 artifacts.version
  ts             INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_stepconv_project ON step_conversations(project_id, artifact_name, ts);
```

SQLite `ALTER TABLE` 对 `NOT NULL DEFAULT` 没问题。写一条迁移脚本 [scripts/migrate-m5.ts](./scripts/migrate-m5.ts) 幂等执行。

### 后端 API

#### `POST /api/projects/[id]/revise` — AI 对话式改写（SSE）

请求：
```json
{
  "artifact": "episode-3",
  "instruction": "第 2 场男二的台词太软，加一个摔杯子的动作",
  "mode": "patch"           // 'patch' 局部 | 'rewrite' 全量
}
```

响应（SSE 事件）：
- `progress` — 「正在定位要改的段落…」
- `delta` — LLM 流式输出
- `patch` — 单条 patch 对象（流式多条）
- `applied` — `{ version: 5, source: "ai-edit", patchCount: 2 }`
- `done` / `error`

实现步骤：
1. 取最新 artifact 内容
2. 取最近 N 条该 artifact 的 conversations
3. 调用 LLM（按路由 resolveConfigForCommand 选模型，step 本身是 `characters` / `episode` 等）
4. 解析 JSON patch → 应用到原文 → 写入新版本
5. 追加 conversation：user 消息 + assistant 消息（patch_json 填）

**Patch 格式**：
```json
{
  "summary": "第 2 场 陈辰 台词加了摔杯子动作",
  "patches": [
    {
      "anchor_before": "## 场 2 · 办公室",
      "old": "**陈辰**（冷静）：我不会放手。",
      "new": "△ 陈辰猛地摔下咖啡杯\n**陈辰**（怒）：我不会放手！"
    }
  ],
  "fallback": null
}
```

若某条 patch 的 `anchor_before + old` 在原文中不唯一或找不到 → 整条 patch 作废，走 `fallback` 字段（若为 `"REWRITE"` 则触发全量重写）。

核心实现文件：

- [lib/drama/revise/patch.ts](./lib/drama/revise/patch.ts) — patch 解析与应用
- [lib/drama/revise/prompts.ts](./lib/drama/revise/prompts.ts) — revise prompt 构造
- [app/api/projects/[id]/revise/route.ts](./app/api/projects/%5Bid%5D/revise/route.ts) — SSE 端点

#### `PUT /api/projects/[id]/artifacts/[name]` — 手动编辑

请求：
```json
{ "content": "...新的 markdown 源码..." }
```

行为：
- 校验不为空
- 对 `characters` 额外校验 Mermaid 块语法（若存在）
- `saveArtifact(..., source: "manual-edit", parent_version: 当前latest.version)`
- 回写 `events` 一条 `{ type: "manual-edit", version }`

#### `GET /api/projects/[id]/artifacts/[name]/history` — 版本列表

返回 `[{ version, source, parent_version, createdAt, preview: content前120字 }]`。

#### `POST /api/projects/[id]/artifacts/[name]/revert` — 回滚

请求：`{ version: 3 }`
行为：读 version=3 的 content → 以 `source: "revert"` 写一条新版本（不物理删除后续版本，只是把「latest」指回旧内容的一个拷贝）。

### Revise Prompt 模板

[lib/drama/revise/prompts.ts](./lib/drama/revise/prompts.ts)：

```ts
export function buildRevisePrompt(
  artifactName: string,
  currentContent: string,
  instruction: string,
  recentTurns: ConversationTurn[]
): LLMMessage[] {
  const system = [
    SYSTEM_PERSONA,
    "",
    "【当前任务】你是剧本工作台的局部改写助手。",
    "不要重写整篇，只针对用户指令修改相关段落。",
    "输出严格 JSON，不要任何解释。",
  ].join("\n");

  const user = [
    `【产物类型】${artifactDescriptionFor(artifactName)}`,
    "",
    "【当前产物】",
    "<<<CONTENT",
    currentContent,
    "CONTENT>>>",
    "",
    recentTurns.length ? "【最近对话】" : "",
    ...recentTurns.map((t) => `${t.role}: ${t.content}`),
    "",
    "【本次用户指令】",
    instruction,
    "",
    "【输出 JSON Schema】",
    `{
  "summary": "一句话描述本次改了什么",
  "patches": [
    {
      "anchor_before": "紧挨 old 之前 30-80 字的上下文，保证 anchor+old 在原文中唯一可定位",
      "old": "被替换的原文片段（要精确到字符）",
      "new": "替换后的新文本"
    }
  ],
  "fallback": null
}`,
    "",
    "【硬约束】",
    "- anchor_before + old 必须在原文中只出现 1 次",
    "- 不要改用户没要求的地方",
    "- 若改动会超过原文 30%，返回 patches=[] 且 fallback=\"REWRITE\"",
    "- Mermaid 代码块内部如需改，必须整块替换而非切进块内",
  ].filter(Boolean).join("\n");

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}
```

### Patch 应用算法

[lib/drama/revise/patch.ts](./lib/drama/revise/patch.ts)：

```ts
export function applyPatches(
  original: string,
  patches: { anchor_before: string; old: string; new: string }[]
): { content: string; applied: number; failures: string[] } {
  let text = original;
  let applied = 0;
  const failures: string[] = [];
  for (const p of patches) {
    const needle = p.anchor_before + p.old;
    const firstIdx = text.indexOf(needle);
    const lastIdx = text.lastIndexOf(needle);
    if (firstIdx === -1) { failures.push(`未找到锚点：${p.anchor_before.slice(0, 20)}…`); continue; }
    if (firstIdx !== lastIdx) { failures.push(`锚点不唯一：${p.anchor_before.slice(0, 20)}…`); continue; }
    text = text.slice(0, firstIdx) + p.anchor_before + p.new + text.slice(firstIdx + needle.length);
    applied++;
  }
  return { content: text, applied, failures };
}
```

### 前端改造

**新组件** [components/drama/revise/revise-panel.tsx](./components/drama/revise/revise-panel.tsx)：

- 右侧滑出抽屉，宽 420px，`sheet` 形式
- 顶部 tab：`对话` / `手动编辑` / `历史`
- 对话 tab：
  - 消息流（user / assistant），assistant 若带 patch 渲染为可展开的 diff 预览（old → new 红绿对照）
  - 底部输入框 + 「发送」按钮 + 快捷建议 chips（例："台词再狠一点"、"补一个摔杯子的动作"、"这段再砍一半"）
  - patch 到手后自动应用并刷新产物，显示 toast「已应用 N 处修改 · [撤销]」
- 手动编辑 tab：
  - textarea（`<Textarea>` + 等宽字体），高度占满抽屉
  - 底部「保存」按钮；未保存时切 tab 提示
- 历史 tab：
  - 时间线，每项显示 `v3 · AI 改写 · 4/21 22:30 · "台词加狠一点"`
  - 点击展开：全文预览 + 「回滚到这一版」按钮

**集成到每个 step 页面**：

```tsx
<ReviseDrawer
  projectId={projectId}
  artifactName="start-card"   // 或 plan / characters / outline / episode-3 / review-3
/>
```

挂载位置：每个 step 页面右上角加一个「编辑」按钮，点开抽屉。

涉及文件：
- [app/studio/[projectId]/start/start-client.tsx](./app/studio/%5BprojectId%5D/start/start-client.tsx)
- [app/studio/[projectId]/plan/plan-client.tsx](./app/studio/%5BprojectId%5D/plan/plan-client.tsx)
- [app/studio/[projectId]/characters/characters-client.tsx](./app/studio/%5BprojectId%5D/characters/characters-client.tsx)
- [app/studio/[projectId]/outline/outline-client.tsx](./app/studio/%5BprojectId%5D/outline/outline-client.tsx)
- [app/studio/[projectId]/episode/episode-client.tsx](./app/studio/%5BprojectId%5D/episode/episode-client.tsx)（按集号传 artifactName）
- [app/studio/[projectId]/review/review-client.tsx](./app/studio/%5BprojectId%5D/review/review-client.tsx)

### 边界与约束

- **正在 SSE 生成时禁用改写/编辑**：抽屉内按钮 disabled，显示「当前 step 正在生成，请稍候」
- **characters 的 Mermaid 块**：手动编辑保存前要 `sanitizeMermaid` 一遍；AI 改写 prompt 里已加硬约束「要改必须整块替换」
- **episode 的场次一致性**：手动编辑保存时不做自动重排（尊重用户），但校验「`## 场 N` 编号不能重复」
- **对话历史长度**：每次 revise 只带最近 4 轮，避免 token 膨胀；更早的仍留在 DB 可在「历史」tab 看
- **并发**：同一 artifact 同时只允许一次 revise 请求，后端用 `in-memory Set` 做 key `${projectId}:${artifactName}` 的互斥锁
- **失败降级**：若所有 patch 都 anchor 失配，SSE 推 `progress: 未能精确定位，正在整体重写…` 然后走 `rewrite` 分支

### 验收点

- 在 `episode 3` 产物页点「编辑」→ 输入「第 2 场台词加狠」→ 看到 diff 预览 → 接受 → 产物刷新，场 2 台词确实变了，其他场次不变
- 切到「手动编辑」tab，改一个字符，保存，历史 tab 出现 `manual-edit` 版本
- 回滚到 v1，产物内容变回初版，版本号变 v4（v1 的拷贝），v2/v3 仍在历史中可见
- 刷新页面，对话历史、版本历史都能复原
- 正在 stream 生成 episode 时点编辑按钮，应显示禁用态

---

## 数据库与 API 变更总览

### 新增/修改的表

```sql
-- 模块 2
CREATE TABLE llm_role_bindings (slot TEXT PRIMARY KEY, config_id TEXT NOT NULL, updated_at INTEGER NOT NULL);

-- 模块 4
ALTER TABLE artifacts ADD COLUMN source TEXT NOT NULL DEFAULT 'generate';
ALTER TABLE artifacts ADD COLUMN parent_version INTEGER;
CREATE TABLE step_conversations (...);
```

统一放 [scripts/migrate-m5.ts](./scripts/migrate-m5.ts)，幂等检查已存在的列/表。

### 新增 API 路由

| Method | Path | 说明 |
|---|---|---|
| POST | `/api/projects/[id]/revise` | SSE：对话式改写 |
| PUT | `/api/projects/[id]/artifacts/[name]` | 手动编辑保存 |
| GET | `/api/projects/[id]/artifacts/[name]/history` | 版本列表 |
| POST | `/api/projects/[id]/artifacts/[name]/revert` | 回滚 |
| GET | `/api/projects/[id]/artifacts/[name]/conversations` | 拉对话历史 |
| GET | `/api/llm-role-bindings` | 槽位绑定列表 |
| PUT | `/api/llm-role-bindings/[slot]` | 改槽位绑定 |

### 修改的 API 路由

- [app/api/projects/[id]/run/route.ts](./app/api/projects/%5Bid%5D/run/route.ts)：走新 router 解析（`slot:` 前缀）
- [app/api/llm-configs/*](./app/api/llm-configs/)：无修改

---

## 文件改动清单（按模块）

### 模块 1（7 个文件）
- `.env.example`（+2 行）
- `scripts/init-db.ts`（+30 行 seedYunwuConfigs）
- `README.md`（+1 行说明）
- `USAGE.md`（Q5 之后追加一段「如果部署者用云雾网关」）

### 模块 2（约 10 个文件）
- `lib/db/schema.sql`（+ `llm_role_bindings`）
- `scripts/migrate-m5.ts`（新）
- `scripts/init-db.ts`（seed 默认槽位）
- `lib/llm/role-store.ts`（新：CRUD）
- `lib/llm/router.ts`（改：slot 解析）
- `lib/llm/presets.ts`（+ `quality-moe`）
- `lib/drama/store.ts#createProject`（默认应用 quality-moe bindings）
- `app/api/llm-role-bindings/*`（新 2 个路由）
- `app/settings/models/*`（UI + 「模型角色」tab）
- `components/drama/controls/moe-panel.tsx`（显示槽解析结果）

### 模块 3（5 个文件）
- `lib/drama/prompts/overseas.ts`（重写）
- `lib/drama/prompts/episode.ts`（overseas 分支改约束）
- `lib/drama/references.ts`（加载表替换）
- `references/hollywood-bilingual.md`（新）
- `tests/screenplay-parse.test.ts`（+双语 case）

### 模块 4（约 18 个文件）
- `lib/db/schema.sql`（+ artifacts 两列 + step_conversations）
- `scripts/migrate-m5.ts`（合并）
- `lib/drama/artifacts.ts`（支持 source / parent_version）
- `lib/drama/conversations.ts`（新）
- `lib/drama/revise/patch.ts`（新）
- `lib/drama/revise/prompts.ts`（新）
- `app/api/projects/[id]/revise/route.ts`（新，SSE）
- `app/api/projects/[id]/artifacts/[name]/route.ts`（改：+PUT）
- `app/api/projects/[id]/artifacts/[name]/history/route.ts`（新）
- `app/api/projects/[id]/artifacts/[name]/revert/route.ts`（新）
- `app/api/projects/[id]/artifacts/[name]/conversations/route.ts`（新）
- `components/drama/revise/revise-drawer.tsx`（新）
- `components/drama/revise/conversation-list.tsx`（新）
- `components/drama/revise/patch-preview.tsx`（新，红绿 diff）
- `components/drama/revise/manual-editor.tsx`（新）
- `components/drama/revise/history-list.tsx`（新）
- `hooks/use-revise.ts`（新，封装 SSE）
- 6 个 step 客户端组件（挂抽屉入口）

---

## 测试策略

### 单元测试（vitest）

- `tests/revise-patch.test.ts`：锚点唯一 / 找不到 / 多处匹配 / fallback
- `tests/revise-prompt.test.ts`：上下文截断、对话历史拼接
- `tests/screenplay-parse.test.ts`：中英混合角色名、英文对白、纯中文对白
- `tests/llm-router-slot.test.ts`：`slot:primary` 解析优先级

### 手动回归

写一份 [tests/manual-regression-m5.md](./tests/manual-regression-m5.md) 清单：
- 冷启动 seed → 三条模型 + 默认项目绑定
- 创建项目 → MoE 面板显示 GPT/DS/Grok 三条
- 切 overseas → 跑 episode 1 → 中英混合格式正确
- 对 `plan` 产物做 3 次对话改写 → 历史显示 v1→v2→v3→v4
- 手动编辑 characters Mermaid → 保存 → 关系图仍能渲染
- 回滚到 v2 → 产物变回，v5 出现
- 流式生成中点「编辑」→ 按钮禁用

---

## 回滚与风险

### 兼容性

- 模块 4 的 schema 改动是**加列 + 新表**，老 artifacts 自动 `source = 'generate'`，不影响现有项目
- 模块 2 的 `slot:` 前缀 config_id 是新约定，老项目的 bindings 仍是普通 config_id，router 兼容两种
- 模块 3 的 overseas 格式改动：老项目已有的英文 episode 产物不自动重写，用户需自行触发 re-run

### 主要风险

| 风险 | 概率 | 应对 |
|---|---|---|
| 云雾网关不稳 / key 被滥用 | 中 | Key 只放服务器 `.env`；前端永远走掩码；可选后加 Basic Auth |
| Patch 锚点大面积失配 | 中 | 自动降级 rewrite；prompt 里强调 old 要够长 |
| Grok 限频 429 | 低 | router 增加「若模型返回 429，临时降级到 primary」兜底（本轮先不做，观察后再加） |
| 多轮对话 token 膨胀 | 低 | 最多带 4 轮历史；超过给出 summarize hint |

### 回滚预案

每个模块的改动都在单独的 PR（或 commit 组）里，遇问题可以独立回退。数据库 ALTER TABLE 加的列默认值兼容旧读路径，不需要 down-migration。

---

## 实施顺序建议

1. **模块 1**（最快，半小时，马上能用 GPT-5.4）
2. **模块 2**（基础设施，后面模块都会用到路由）
3. **模块 3**（独立改动，可并行但建议串行避免混淆）
4. **模块 4**（最大块，本身内部再拆：schema + revise API → 手动编辑 → 抽屉 UI → 每个 step 接入）

完成后把 MoE 面板、出海模式、step 编辑的截图更新进 README 对应章节。
