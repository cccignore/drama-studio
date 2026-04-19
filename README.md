# Drama Studio

把 CLI 上的 `0xsline/short-drama` Claude Skill 包装成面向**非技术用户**的短剧创作 Web 工作台。

打开网页后，不用懂命令行，也不用会 Markdown，就能按向导一步一步完成：

**立项 → 节奏规划 → 角色与关系图 → 分集目录 → 分集剧本 → 单集复盘 → 导出成品**

当前交付以 [`../interview-task.md`](../interview-task.md) 为准。

> 面向创作者的极简使用指南，请看 [USAGE.md](./USAGE.md)。

---

## 功能清单

### 主流程（MVP）

- 7 步创作链路：`start / plan / characters / outline / episode / review / export`
- 向导式 UI：卡片选择、自由输入、浏览器语音输入
- **真实 LLM 调用**，无 mock；SSE 流式输出
- 角色关系图：Mermaid 渲染，异常字符自动清洗
- 分集目录：`🔥 爽点` / `💰 付费卡点` 标记
- 剧本渲染：`△` 镜头提示、`♪` 音乐提示、`**角色**（情绪）：台词` 语法
- 5 维评分（节奏/爽感/台词/格式/连贯）+ 问题清单 + 雷达图
- 导出：Markdown / Word / 完整工程 Zip
- SQLite 持久化：项目 / 产物 / 事件 / 模型配置
- 多项目隔离 + 状态机前向校验
- 5 集试玩模式：一键填入案例数据，陌生用户 5 分钟跑通闭环

### 加分能力（已实现）

- **`/overseas` 出海模式**：一键切英文剧本 + Hollywood 标准格式
- **`/compliance` 合规检查**：基于已写剧本生成红线 / 风险 / 通过三色面板
- **MoE 多模型路由**：按命令绑定不同模型（例如 `plan` 用更贵的推理模型，`episode` 用便宜的长文本模型），内置三种预设（均衡 / 质量 / 经济）
- **Multi-agent 协同**：Planner → Critic → Writer 三角色协同，可按命令启用（`plan` / `episode`）
- **References 按需加载**：第 1-3 集自动加上 `opening-rules`，出海流程走英文 references
- **Docker / Compose 一键部署**：standalone build + outputFileTracingIncludes 把 references 打进镜像

### 取舍说明

为了让主流程足够稳、让面试可以按 `interview-task.md` 逐条答辩，以下能力**有意识**没做：

- 账号系统 / 登录（当前按 `projectId` 隔离）
- 多用户并发协作
- 更复杂的 MoE（流式 token 级路由）
- 自动化端到端测试（Playwright / Cypress）

---

## 技术栈

Next.js 15 · React 19 · TypeScript · Tailwind 4 · better-sqlite3 · Mermaid · Recharts · docx · JSZip · sonner · framer-motion · vitest

LLM 协议：OpenAI 兼容 & Anthropic 兼容（默认推荐 DeepSeek）

---

## 本地启动（3 步）

```bash
cd drama-studio
npm install
cp .env.example .env                   # 把 APP_SECRET 换成 openssl rand -hex 32 的结果
npm run init-db                        # 初始化 SQLite + 默认模型
npm run dev                            # http://localhost:3000
```

第一次打开 → `/settings/models` 配一个模型（OpenAI 兼容 + DeepSeek 最省事）→ `/studio` 新建项目 → 点 **「一键填入 5 集试玩案例」** → 跑完 `start → plan → characters → outline → episode 1 → review → export`。

---

## Docker 部署

### 一键起服务

```bash
cp .env.example .env                   # 填好 APP_SECRET 和（可选）DEFAULT_LLM_*
docker compose up -d --build
```

服务默认监听 `127.0.0.1:3000`，数据持久化到宿主机 `./data` 目录。

### 放到公网（nginx 反代示例）

`/etc/nginx/conf.d/drama-studio.conf`：

```nginx
server {
    listen 80;
    server_name your-domain.example.com;

    client_max_body_size 4m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # SSE 流式输出必需
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 3600s;
    }
}
```

上线清单：

```bash
# 1. 构建 & 启动
docker compose up -d --build

# 2. nginx 配置
sudo cp nginx/drama-studio.conf /etc/nginx/conf.d/
sudo nginx -t && sudo systemctl reload nginx

# 3. 证书（可选）
sudo certbot --nginx -d your-domain.example.com

# 4. 查看日志
docker compose logs -f drama-studio
```

---

## 环境变量

详见 [`.env.example`](./.env.example)。

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `APP_SECRET` | ✅ | 加密存储模型 `apiKey`，32 字节 hex |
| `APP_URL` | | 站点外显 URL，默认 `http://localhost:3000` |
| `DRAMA_DATA_DIR` | | SQLite 与产物目录，默认 `./.data`，Docker 下为 `/app/.data` |
| `LOG_LEVEL` | | 日志级别，默认 `info` |
| `DEFAULT_LLM_*` | | 可选，部署时自动预置一条默认 LLM 配置；留空则到 UI 手动添加 |

---

## 目录结构

```text
app/
  page.tsx                            首页
  studio/                             项目列表 + 工作台
  studio/[projectId]/*                7 步创作页面 + overseas / compliance
  settings/models/                    模型配置管理
  api/projects/[id]/run               SSE 流式命令分发
  api/projects/[id]/events            事件回放（重进页面复原进度）
  api/projects/[id]/artifacts|export  产物 / 导出
  api/projects/[id]/llm-bindings      每命令模型绑定
  api/llm-configs                     模型配置 CRUD
components/
  drama/                              关系图 / 目录 / 剧本 / 复盘 / 导出 / 新手引导
  drama/controls/                     项目增强面板（MoE / 绑定 / 出海 / multi-agent）
  layout/                             Dashboard 壳层
  ui/                                 基础 UI
  wizard/                             进度条、语音输入、流式控制台
lib/
  db/                                 SQLite 与 schema
  llm/                                Provider / 路由 / 流式
  drama/                              状态机 / prompt / references / parsers / export
references/                           从 short-drama Skill 引入的方法论文档
tests/                                vitest：状态机 / references / parsers
scripts/init-db.ts                    初始化数据库 + 默认模型
Dockerfile, docker-compose.yml        容器化部署
```

---

## Prompt 工程

**不把 `references/*.md` 一股脑塞 system prompt**。每条命令按需加载：

| 命令 | 加载的 references |
| --- | --- |
| `start` | 题材指南 |
| `plan` | 开篇规则 · 付费卡点 · 节奏曲线 · 爽点矩阵 |
| `characters` | 反派设计 |
| `outline` | 付费卡点 · 节奏曲线 · 钩子设计 |
| `episode` | 第 1-3 集：开篇规则；之后：节奏曲线 · 爽点矩阵 · 钩子设计 |
| `review` | 节奏曲线 · 钩子设计 · 爽点矩阵 |
| `overseas` | Hollywood 标准 · 文化本地化 · 海外节奏 |
| `compliance` | 红线清单 · 风险库 · 合规指南 |

核心实现：[`lib/drama/references.ts`](./lib/drama/references.ts) · [`lib/drama/prompts/`](./lib/drama/prompts/) · [`app/api/projects/[id]/run/route.ts`](./app/api/projects/[id]/run/route.ts)

---

## 测试

```bash
npx vitest run                         # 状态机 / references 加载 / JSON 解析 / Mermaid 清洗 / 剧本解析
npx tsc --noEmit                       # 类型检查
npm run build                          # 生产构建（standalone 模式）
```

---

## 验收演示路径

1. 配置模型（`/settings/models`）
2. 新建项目（`/studio`）
3. **「一键填入 5 集试玩案例」**
4. `start → plan → characters → outline` 一路点「下一步」
5. 生成第 1 集
6. 立即复盘第 1 集（5 维雷达图 + 问题清单）
7. 导出 Markdown / Word
8. 可选：回到项目设置打开 `项目增强` → 切换出海模式 / 启用 multi-agent / 绑定不同模型

这条路径覆盖 `interview-task.md` 全部硬性要求，也展示了 `overseas / compliance / MoE / multi-agent` 四项加分能力。
