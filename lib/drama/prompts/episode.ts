import type { DramaState } from "../types";
import type { LLMMessage } from "../../llm/types";
import { SYSTEM_PERSONA, contextBlock, refsBlock } from "./_shared";

export interface EpisodeContext {
  episodeIndex: number;
  episodeOutline: string;           // 本集目录条目（标题/本集线/钩子/结尾/标签）
  planSummary: string;              // /plan 产出的精简（取爽点地图 + 卡点 + 四段节奏）
  charactersSummary: string;        // 人物卡压缩（只保留定位 / 标签 / 弧光 + 关系图）
  prevEpisodeTail?: string;         // 上一集末尾 600 字（用于衔接钩子）
  rewriteHint?: string;             // 复盘建议重写时的提示
  storyBeat?: string;               // multi-agent: Planner 产出的 beat sheet
  polishNotes?: string;             // multi-agent: Critic 产出的修正意见
  overseasBrief?: string;           // /overseas 产出的文化适配 brief
}

export function buildEpisodeMessages(
  state: DramaState,
  ctx: EpisodeContext,
  refs: string
): LLMMessage[] {
  const isFirst = ctx.episodeIndex === 1;
  const hasPrev = !isFirst && ctx.prevEpisodeTail;
  const isOverseas = state.mode === "overseas";

  const outputRequirements = isOverseas
    ? [
        "【输出要求】Write the full episode screenplay in English. Keep the structural markers exactly as specified so the system can parse/export it.",
        "",
        `# Episode ${ctx.episodeIndex} · Punchy Episode Title`,
        "",
        "## Scene 1 · Scene name (Location / Time)",
        "",
        "△ Action line. Start with a verb. Keep it visual and shootable.",
        "",
        '**CHARACTER NAME** (emotion/action): "Short, sharp line."',
        "",
        "△ Continue the conflict escalation...",
        "",
        "♪ Music cue: ... (max 2 times in the whole episode)",
        "",
        "## Scene 2 · ...",
        "",
        "… (3-5 scenes total, headings must use `## Scene N · ...`)",
        "",
        "【END OF EPISODE】",
      ]
    : [
        "【输出要求】严格按如下剧本格式，不要用 Markdown 标题之外的任何代码块；不要写解释、不要写「以下是第N集」开头。",
        "",
        `# 第 ${ctx.episodeIndex} 集 · 剧本标题（必须有冲击力）`,
        "",
        "## 场 1 · 场景名（地点 / 时间）",
        "",
        "△ 场面描述（镜头建议用括号前置，如「△ （特写）」。每条一行，动词开头）。",
        "",
        "**角色名**（情绪/动作）：\"台词内容，短而有力。\"",
        "",
        "△ 继续推进……",
        "",
        "♪ 音乐提示：…（仅在关键情绪节点使用，全集不超过 2 处）",
        "",
        "## 场 2 · ……",
        "",
        "…（本集共 3-5 场戏，场次用 `## 场 N · ...`）",
        "",
        "【本集完】",
      ];

  const user = [
    isOverseas
      ? `【任务】写第 ${ctx.episodeIndex} 集完整剧本（2-3 minute episode, about 850-1300 English words, Hollywood-friendly pacing).`
      : `【任务】写第 ${ctx.episodeIndex} 集完整剧本（单集时长 2-3 分钟，约 900-1400 字）。`,
    "",
    "【项目信息】",
    contextBlock(state),
    "",
    "【节奏要点（摘要）】",
    ctx.planSummary.slice(0, 1500) || "（暂缺）",
    "",
    "【主要人物（摘要）】",
    ctx.charactersSummary.slice(0, 1500) || "（暂缺）",
    "",
    ctx.overseasBrief ? "【出海适配约束】" : "",
    ctx.overseasBrief ? ctx.overseasBrief.slice(0, 1500) : "",
    "",
    ctx.storyBeat ? "【Planner Beat Sheet（优先遵循）】" : "",
    ctx.storyBeat ?? "",
    "",
    ctx.polishNotes ? "【Critic 修正意见（必须吸收）】" : "",
    ctx.polishNotes ?? "",
    "",
    `【本集目录（第 ${ctx.episodeIndex} 集）】`,
    ctx.episodeOutline || "（分集目录中未找到本集）",
    "",
    hasPrev ? "【上一集结尾（用于衔接钩子）】" : "",
    hasPrev ? ctx.prevEpisodeTail!.slice(-800) : "",
    "",
    ctx.rewriteHint ? "【重写指令（必须采纳）】" : "",
    ctx.rewriteHint ?? "",
    "",
    refsBlock(refs),
    "",
    ...outputRequirements,
    "",
    "写作铁律：",
    `1) 前 30 秒必须抓人：${isFirst ? "直接按开篇黄金法则起手（钩子 / 身份反差 / 极端困境三选一）" : "承接上一集的悬念（用 1 个动作/台词 5 秒内回应）然后立刻抛新钩"}。`,
    isOverseas
      ? "2) Mid-episode conflict must escalate scene by scene. No idle chatter, no recap padding."
      : "2) 中段冲突必须升级；每个场次必须推进剧情，不得「闲聊 / 回忆 / 铺垫」而无进展。",
    isOverseas
      ? "3) The last 30 seconds must either deliver a payoff and a new hook, or hard-cut on the paywall cliffhanger."
      : "3) 结尾 30 秒：" + (isPaywallEp(ctx.episodeOutline) ? "**必须**在情绪最高点硬切（付费卡点），结尾一行用 `【本集完】`。" : "释放一次小爽点 + 抛新悬念。"),
    isOverseas
      ? "4) Dialogue must be tight and platform-friendly. Avoid long monologues and culture-specific jargon that global viewers cannot decode."
      : "4) 台词短平快，禁止长独白。每句台词不超过 25 字。",
    "5) 禁止使用开发者注释 / 代码块 / 任何 JSON。",
    isOverseas
      ? "6) Keep character names, references and emotional beats globally legible. Reuse the overseas adaptation brief when choosing names, setting details and tone."
      : "6) 全集不得出现除 `△` `♪` 以外的特殊前缀；情绪用圆括号 `（…）` 包在角色名后。",
    isOverseas
      ? "7) Use `【END OF EPISODE】` as the final line."
      : "",
  ]
    .filter((l) => l !== "")
    .join("\n");

  return [
    { role: "system", content: SYSTEM_PERSONA },
    { role: "user", content: user },
  ];
}

function isPaywallEp(epOutline: string): boolean {
  return /💰|付费卡点/.test(epOutline);
}
