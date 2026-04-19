import type { DramaState } from "../types";
import type { LLMMessage } from "../../llm/types";
import { SYSTEM_PERSONA, contextBlock, refsBlock } from "./_shared";

export interface StartArgs {
  freeText?: string;
  dramaTitle?: string;
  genre?: string[];
  audience?: string;
  tone?: string;
  ending?: string;
  totalEpisodes?: number;
  mode?: "domestic" | "overseas";
}

export function buildStartMessages(state: DramaState, args: StartArgs, refs: string): LLMMessage[] {
  const mode = args.mode ?? state.mode;
  const context = contextBlock({
    ...state,
    dramaTitle: args.dramaTitle || state.dramaTitle,
    genre: args.genre?.length ? args.genre : state.genre,
    audience: (args.audience as DramaState["audience"]) ?? state.audience,
    tone: (args.tone as DramaState["tone"]) ?? state.tone,
    ending: (args.ending as DramaState["ending"]) ?? state.ending,
    totalEpisodes: args.totalEpisodes ?? state.totalEpisodes,
    mode,
  });

  const userIdea = (args.freeText ?? "").trim() || "（用户未提供额外想法，请你基于以上题材与受众自行发挥。）";

  const user = [
    "【任务】为一部新的微短剧建立项目档案（立项卡）。",
    "",
    "【立项信息】",
    context,
    "",
    "【用户原始想法】",
    userIdea,
    "",
    refsBlock(refs),
    "",
    "【输出要求】严格按照下列 Markdown 模板输出，不要包裹在代码块里，不要多余解释：",
    "",
    "# 立项卡 · {一句话点出最大看点的剧名}",
    "",
    "## 一、核心亮点（Pitch）",
    "- 一句话 logline（30 字内，必须包含主角身份 + 核心冲突 + 爽点方向）",
    "- 三个最吸引人的卖点（每条 ≤ 20 字）",
    "",
    "## 二、题材与市场",
    "- 主题材 / 副题材：",
    "- 核心受众画像：",
    "- 对标爆款（至少 2 部同题材代表作）：",
    "- 差异化：我们比它们多了什么？",
    "",
    "## 三、世界观与设定",
    "- 时代 / 地域 / 行业：",
    "- 关键设定（金手指 / 特殊规则 / 反差身份）：",
    "- 开场钩子雏形（对应开篇黄金 5 秒要抛出什么）：",
    "",
    "## 四、情感与爽感基调",
    "- 主情感线：",
    "- 主爽点类型与副爽点类型：",
    "- 结局类型与情绪落点：",
    "",
    "## 五、风险与红线",
    "- 2-3 条潜在审核/合规风险，以及规避方案。",
    "",
    "要求：",
    "1) 如果用户提供的想法和题材/受众冲突，以「题材与受众」为主轴，**温和地**调整想法方向，并在对应位置用一句「调整说明」体现。",
    "2) 所有条目必须具体、可落地，禁止「根据需要」这种空话。",
    mode === "overseas"
      ? "3) 当前是出海模式：设定、职业、爽点和关系冲突要尽量国际化，避免高度依赖本土语境才能理解。必要时在合适位置补充英文剧名或海外平台对标。": "3) 当前是国内模式：优先贴合中文短剧用户的情绪节奏与付费卡点。",
  ].join("\n");

  return [
    { role: "system", content: SYSTEM_PERSONA },
    { role: "user", content: user },
  ];
}
