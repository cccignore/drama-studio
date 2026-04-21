import type { LLMMessage } from "../../llm/types";
import { SYSTEM_PERSONA } from "../prompts/_shared";
import type { StepConversation } from "../conversations";

export function artifactCommandFor(name: string): string {
  if (name === "start-card") return "start";
  if (name === "plan") return "plan";
  if (name === "characters") return "characters";
  if (name === "outline") return "outline";
  if (/^episode-\d+$/.test(name)) return "episode";
  if (/^review-\d+$/.test(name)) return "review";
  if (name === "overseas-brief") return "overseas";
  if (name === "compliance-report") return "compliance";
  return "default";
}

export function artifactDescriptionFor(name: string): string {
  if (name === "start-card") return "立项卡：题材、卖点、受众、主角与核心冲突";
  if (name === "plan") return "节奏规划：四段结构、爽点、付费卡点、节奏波形";
  if (name === "characters") return "人物设计：人物卡与 Mermaid 人物关系图";
  if (name === "outline") return "分集目录：每集标题、主线、钩子、爽点与结尾";
  if (/^episode-\d+$/.test(name)) return "单集剧本：场次、动作、音乐提示与台词";
  if (/^review-\d+$/.test(name)) return "单集复盘 JSON：评分、问题清单与修改建议";
  if (name === "overseas-brief") return "出海适配 brief：海外市场定位、改编策略与双语剧本规则";
  if (name === "compliance-report") return "合规检查 JSON：红线、风险、通过项与全局建议";
  return "Markdown 产物";
}

export function buildRevisePrompt(
  artifactName: string,
  currentContent: string,
  instruction: string,
  recentTurns: StepConversation[],
  mode: "patch" | "rewrite"
): LLMMessage[] {
  if (mode === "rewrite") {
    return buildRewritePrompt(artifactName, currentContent, instruction, recentTurns);
  }
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
    ...recentTurns.slice(-8).map((t) => `${t.role}: ${t.content}`),
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
    "- anchor_before + old 必须在原文中只出现 1 次。",
    "- 不要改用户没要求的地方。",
    "- 若改动会超过原文 30%，返回 patches=[] 且 fallback=\"REWRITE\"。",
    "- Mermaid 代码块内部如需改，必须整块替换而非切进块内。",
    "- JSON 字符串里的换行用 \\n 转义，禁止输出 Markdown 代码块之外的解释。",
  ]
    .filter(Boolean)
    .join("\n");

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

export function buildRewritePrompt(
  artifactName: string,
  currentContent: string,
  instruction: string,
  recentTurns: StepConversation[]
): LLMMessage[] {
  const system = [
    SYSTEM_PERSONA,
    "",
    "【当前任务】你是剧本工作台的全量改写助手。",
    "你必须输出修改后的完整产物正文，不要解释，不要 JSON，不要包裹代码块。",
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
    ...recentTurns.slice(-8).map((t) => `${t.role}: ${t.content}`),
    "",
    "【本次用户指令】",
    instruction,
    "",
    "请输出修改后的完整 Markdown / JSON 正文。保持原产物格式、标题层级和必要结构不变。",
  ]
    .filter(Boolean)
    .join("\n");
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}
