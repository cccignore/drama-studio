import type { DramaState } from "../types";
import type { LLMMessage } from "../../llm/types";
import { SYSTEM_PERSONA, contextBlock, refsBlock } from "./_shared";

export function buildOutlineMessages(
  state: DramaState,
  startCard: string,
  plan: string,
  characters: string,
  refs: string
): LLMMessage[] {
  const user = [
    "【任务】产出完整的**分集目录**（全剧）。",
    "",
    "【立项信息】",
    contextBlock(state),
    "",
    "【立项卡摘要】",
    startCard.slice(0, 1200),
    "",
    "【节奏规划摘要】",
    plan.slice(0, 1500),
    "",
    "【人物设计摘要】",
    characters.slice(0, 1500),
    "",
    refsBlock(refs),
    "",
    `【输出要求】输出全剧 ${state.totalEpisodes} 集的分集目录。`,
    "严格按如下 Markdown 格式，不要包裹在代码块里。",
    "",
    "# 分集目录",
    "",
    "## 起势段（第 X-X 集）",
    "### 第 1 集 · 集标题",
    "- 本集线：一句话本集核心冲突",
    "- 钩子：开篇 30 秒抛出的悬念",
    "- 结尾：结尾 30 秒的爽点/悬念",
    "- 标签：🔥 大爽点 / 💰 付费卡点（只在对应集出现时才写；普通集留空或写「-」）",
    "",
    "### 第 2 集 · 集标题",
    "…",
    "",
    "## 攀升段（第 X-X 集）",
    "…（同上格式，逐集列出）",
    "",
    "## 风暴段（第 X-X 集）",
    "…",
    "",
    "## 决战段（第 X-X 集）",
    "…",
    "",
    "要求：",
    `1) 必须且只能输出 ${state.totalEpisodes} 集，集号连续，不得跳号或重复。`,
    "2) 付费卡点集数必须与节奏规划中的卡点集号完全一致，标记 💰。",
    "3) 大爽点（节奏规划爽点地图中的）对应集标记 🔥。",
    "4) 三幕分段用二级标题 `## …段`，每集用三级标题 `### 第 N 集 · 标题`。",
    "5) 每集 4 个 bullet（本集线 / 钩子 / 结尾 / 标签）。禁止加第 5 个 bullet 或其他多余内容。",
    "6) 集标题必须有冲击力，禁止平淡的「相遇」「初见」这种字眼（除非是反差后缀）。",
  ].join("\n");

  return [
    { role: "system", content: SYSTEM_PERSONA },
    { role: "user", content: user },
  ];
}
