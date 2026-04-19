import type { DramaState } from "../types";
import type { LLMMessage } from "../../llm/types";
import { SYSTEM_PERSONA, contextBlock, refsBlock } from "./_shared";
import type { EpisodeContext } from "./episode";

export function buildPlanPlannerMessages(
  state: DramaState,
  startCard: string,
  refs: string
): LLMMessage[] {
  const user = [
    "【角色】你是 Planner。先不要输出最终交付稿，只负责给出节奏骨架草案。",
    "",
    "【项目信息】",
    contextBlock(state),
    "",
    "【立项卡】",
    startCard,
    "",
    refsBlock(refs),
    "",
    "【输出要求】输出简洁 Markdown，必须包含以下四部分：",
    "1) 四段节奏划分（标清集数区间 + 强度）",
    "2) 6-10 个爽点草案（集号 + 一句话）",
    "3) 5-7 个付费卡点草案（集号 + 一句话）",
    "4) 风险提示（3-5 条）",
    "",
    "要求：只给骨架，不要展开成长篇说明。",
  ].join("\n");

  return [
    { role: "system", content: SYSTEM_PERSONA },
    { role: "user", content: user },
  ];
}

export function buildPlanCriticMessages(
  state: DramaState,
  plannerBrief: string
): LLMMessage[] {
  const user = [
    "【角色】你是 Critic，负责挑出节奏草案的关键风险，并给出具体修正建议。",
    "",
    "【项目信息】",
    contextBlock(state),
    "",
    "【Planner 草案】",
    plannerBrief,
    "",
    "【输出要求】输出 4-6 条 bullets，每条都必须具体，重点检查：",
    "- 爽点间隔是否过长",
    "- 付费卡点是否来得过晚或不够狠",
    "- 中后段是否有塌陷风险",
    "- 是否存在明显合规/价值观风险",
  ].join("\n");

  return [
    { role: "system", content: SYSTEM_PERSONA },
    { role: "user", content: user },
  ];
}

export function buildEpisodePlannerMessages(
  state: DramaState,
  ctx: EpisodeContext,
  refs: string
): LLMMessage[] {
  const user = [
    "【角色】你是 Planner。先为本集写一个可拍摄的 beat sheet，而不是最终剧本。",
    "",
    "【项目信息】",
    contextBlock(state),
    "",
    "【节奏要点】",
    ctx.planSummary.slice(0, 1200),
    "",
    "【主要人物】",
    ctx.charactersSummary.slice(0, 1200),
    "",
    ctx.overseasBrief ? "【出海适配约束】" : "",
    ctx.overseasBrief ? ctx.overseasBrief.slice(0, 1200) : "",
    "",
    `【第 ${ctx.episodeIndex} 集目录】`,
    ctx.episodeOutline,
    "",
    ctx.prevEpisodeTail ? "【上一集结尾】" : "",
    ctx.prevEpisodeTail ? ctx.prevEpisodeTail.slice(-600) : "",
    "",
    refsBlock(refs),
    "",
    "【输出要求】输出 3-5 场的 beat sheet，每场都必须包含：",
    "- 场次序号",
    "- 本场目标",
    "- 冲突升级点",
    "- 结尾钩子/转折",
    "",
    "要求：总字数控制在 400-700 字，不要直接写成完整台词剧本。",
  ]
    .filter((line) => line !== "")
    .join("\n");

  return [
    { role: "system", content: SYSTEM_PERSONA },
    { role: "user", content: user },
  ];
}

export function buildEpisodeCriticMessages(
  state: DramaState,
  ctx: EpisodeContext,
  beatSheet: string
): LLMMessage[] {
  const user = [
    "【角色】你是 Critic，负责审校本集 beat sheet，并给 Writer 一组具体修正意见。",
    "",
    "【项目信息】",
    contextBlock(state),
    "",
    `【第 ${ctx.episodeIndex} 集目录】`,
    ctx.episodeOutline,
    "",
    "【Planner Beat Sheet】",
    beatSheet,
    "",
    "【输出要求】输出 4-6 条 bullets，每条都必须是 Writer 可以直接执行的修正指令。",
    "重点检查：开场 30 秒、场次推进效率、结尾硬切强度、人物一致性、合规风险。",
  ].join("\n");

  return [
    { role: "system", content: SYSTEM_PERSONA },
    { role: "user", content: user },
  ];
}
