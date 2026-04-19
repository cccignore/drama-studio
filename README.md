# Drama Studio

把 `0xsline/short-drama` Skill 包装成面向非技术用户的 Web 工作台。

用户不需要懂命令行，也不需要理解 markdown 或文件系统。打开网页后，可以通过向导式界面完成：

- 立项
- 节奏规划
- 角色设计与关系图
- 分集目录
- 逐集剧本生成
- 单集复盘打分
- 导出成品

当前交付目标以根目录的 [interview-task.md](../interview-task.md) 为准。

---

## 当前完成度

已完成的主流程能力：

- 7 步创作链路：`start -> plan -> characters -> outline -> episode -> review -> export`
- 向导式 UI，支持卡片选择 + 自由输入 + 语音输入
- 角色关系图 Mermaid 渲染
- 分集目录可视化，支持 `🔥` / `💰` 标记
- 剧本格式化预览，支持 `△` 镜头提示和 `♪` 音乐提示
- 5 维评分 + 问题清单 + 雷达图
- Markdown / Word / Zip 导出
- 真实 LLM 调用，不使用 mock
- SQLite 持久化项目、产物、事件和模型配置
- SSE 流式输出
- 多项目隔离（基于 `projectId`）
- references 按命令按需加载
- 5 集试玩模式入口，便于陌生用户快速跑通闭环

当前未实现的加分项：

- `/overseas`
- `/compliance`
- 多模型 MoE 自动编排
- multi-agent system

---

## 技术栈

- Next.js 15
- React 19
- TypeScript
- Tailwind CSS 4
- better-sqlite3
- Mermaid
- Recharts
- docx
- JSZip
- sonner

LLM 协议支持：

- OpenAI 兼容接口
- Anthropic 兼容接口

默认推荐：

- DeepSeek（OpenAI 兼容）

---

## 目录结构

```text
app/
  page.tsx                          首页
  studio/                           项目列表 + 项目工作台
  studio/[projectId]/*              7 步创作页面
  settings/models/                  模型配置管理
  api/projects/*                    项目 / 产物 / 运行 / 导出接口
  api/llm-configs/*                 模型配置接口
components/
  drama/                            关系图、目录、剧本、复盘、导出组件
  layout/                           Dashboard 壳层
  ui/                               基础 UI 组件
  wizard/                           进度条、语音输入、流式控制台
lib/
  db/                               SQLite 与 schema
  llm/                              Provider、路由、流式
  drama/                            状态机、prompt、references、parsers、export
references/                         从 short-drama 引入的方法论文档
scripts/init-db.ts                  初始化数据库与默认模型
```

---

## 本地启动

### 1. 安装依赖

```bash
cd drama-studio
npm install
```

### 2. 配置环境变量

```bash
cp .env.example .env
```

生成 `APP_SECRET`：

```bash
openssl rand -hex 32
```

把生成结果写入 `.env` 的 `APP_SECRET`。

### 3. 初始化数据库

```bash
npm run init-db
```

### 4. 启动开发环境

```bash
npm run dev
```

默认地址：

- [http://localhost:3000](http://localhost:3000)

---

## 环境变量

关键变量见 `.env.example`。

必填：

- `APP_SECRET`

可选：

- `DRAMA_DATA_DIR`
- `DEFAULT_LLM_NAME`
- `DEFAULT_LLM_PROTOCOL`
- `DEFAULT_LLM_BASE_URL`
- `DEFAULT_LLM_MODEL`
- `DEFAULT_LLM_API_KEY`

说明：

- `APP_SECRET` 用于加密存储模型 `apiKey`
- `DRAMA_DATA_DIR` 默认落在 `./.data`

---

## 使用流程

### 1. 配置模型

打开：

- `/settings/models`

添加任意可用模型配置：

- OpenAI 兼容
- Anthropic 兼容

推荐先配置一个 DeepSeek。

### 2. 创建项目

打开：

- `/studio`

新建项目后进入工作台。

### 3. 先跑通 5 集试玩模式

在 `start` 页点击：

- `一键填入 5 集试玩案例`

这样可以更快验证：

- 立项
- 分集目录
- 单集生成
- 单集复盘
- 导出

### 4. 正式生成

按顺序完成：

1. 立项卡
2. 节奏规划
3. 角色与关系图
4. 分集目录
5. 分集剧本
6. 复盘打分
7. 导出成品

当前实现支持：

- 写完任意 1 集后即可进入复盘
- 至少完成部分剧本后即可导出

---

## 导出格式

支持：

- Markdown `.md`
- Word `.docx`
- 完整工程 `.zip`

其中：

- `.md` 适合继续编辑
- `.docx` 适合直接提交或分享
- `.zip` 会打包主要原始产物和 Word 文件

---

## Prompt 工程说明

项目没有把 `references/*.md` 一股脑塞进上下文，而是按步骤按需加载：

- `start`：题材指南
- `plan`：开篇规则、付费卡点、节奏曲线、爽点矩阵
- `characters`：反派设计
- `outline`：付费卡点、节奏曲线、钩子设计
- `episode`：
  - 第 1-3 集额外加载开篇规则
  - 其余集数加载节奏曲线、爽点矩阵、钩子设计
- `review`：节奏曲线、钩子设计、爽点矩阵

这部分核心代码在：

- `lib/drama/references.ts`
- `lib/drama/prompts/*`
- `app/api/projects/[id]/run/route.ts`

---

## 取舍说明

本项目优先保证：

- 主流程闭环能真实跑通
- 非技术用户能理解步骤
- 生成过程和产物可见
- 面试要求中的状态机、流式、持久化、可视化和导出能答辩

因此暂时没有优先实现：

- `/overseas`
- `/compliance`
- 更复杂的 MoE / multi-agent
- 登录系统

---

## 验收建议

建议按以下路径演示：

1. 配置模型
2. 新建项目
3. 一键填入 5 集试玩案例
4. 跑通 `start -> plan -> characters -> outline`
5. 先写第 1 集
6. 立即复盘第 1 集
7. 导出 Markdown 或 Word

这条路径最符合 `interview-task.md` 中“陌生用户打开 URL 无指导完成一部 5 集迷你剧”的要求。
