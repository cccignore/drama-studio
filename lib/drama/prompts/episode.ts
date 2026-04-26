import type { DramaState } from "../types";
import type { LLMMessage } from "../../llm/types";
import { SYSTEM_PERSONA, contextBlock, refsBlock } from "./_shared";
import { getEpisodeBudget } from "../episode-budget";

export interface EpisodeContext {
  episodeIndex: number;
  episodeOutline: string;           // 本集目录条目（标题/本集线/钩子/结尾/标签）
  planSummary: string;              // /plan 产出的精简（取爽点地图 + 卡点 + 四段节奏）
  charactersSummary: string;        // 人物卡压缩（只保留定位 / 标签 / 弧光 + 关系图）
  prevEpisodeTail?: string;         // 上一集末尾 600 字（用于衔接钩子）
  prevContinuity?: string;          // 上一集的"连续性检查点"5 项摘要（妆发/服装/道具/伤痕/站位）
  rewriteHint?: string;             // 复盘建议重写时的提示
  storyBeat?: string;               // multi-agent: Planner 产出的 beat sheet
  polishNotes?: string;             // multi-agent: Critic 产出的修正意见
  overseasBrief?: string;           // /overseas 产出的文化适配 brief
  creativeBrief?: string;           // /creative 三幕方案摘要（世界观 + Act 拐点 + 核心主题）
}

export function buildEpisodeMessages(
  state: DramaState,
  ctx: EpisodeContext,
  refs: string
): LLMMessage[] {
  const isFirst = ctx.episodeIndex === 1;
  const hasPrev = !isFirst && ctx.prevEpisodeTail;
  const isOverseas = state.mode === "overseas";
  const budget = getEpisodeBudget(state.mode);

  const outputRequirements = isOverseas
    ? [
        "【输出要求】写完整单集剧本，采用「中文场记 + 英文对白」双语格式。保持结构标记，便于系统解析/导出。",
        "",
        `# 第 ${ctx.episodeIndex} 集 · Punchy Episode Title（中文释义）`,
        "",
        "## 场 1 · Café at 5th Avenue（纽约咖啡馆 / 日）",
        "",
        "△ （特写）林夏（Lin Xia）推门而入，风衣被风吹得贴在身上。",
        "",
        '**林夏 / Lin Xia**（惊讶）: "Chen? What are you doing here?"',
        '**陈辰 / Chen Morrison**（冷静）: "I have been waiting for you. For three years."',
        "",
        "△ 继续用中文写动作与镜头提示，推动冲突升级。",
        "",
        "♪ 低沉钢琴声压住两人的呼吸。",
        "",
        "## 场 2 · ……",
        "",
        "…（本集共 3-5 场戏，场次用 `## 场 N · ...`）",
        "",
        "【本集完】",
        "",
        "## 连续性检查点",
        "- 妆发：用 1 句话写完结尾状态（例：Lin Xia 头发被雨水打湿、眼妆晕开）",
        "- 服装：用 1 句话（例：黑风衣沾泥、右袖扯开）",
        "- 关键道具：用 1 句话（例：手中仍攥着那张撕了半边的合同）",
        "- 伤痕：用 1 句话（例：左手虎口新擦伤，未包扎）",
        "- 站位：用 1 句话（例：站在 Café 门口台阶上，背对 Chen）",
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
        "",
        "## 连续性检查点",
        "- 妆发：用 1 句话写完结尾状态（例：女主头发微乱、口红被蹭）",
        "- 服装：用 1 句话（例：白衬衫右袖口沾到咖啡污渍）",
        "- 关键道具：用 1 句话（例：手中仍握着那半张撕烂的合同）",
        "- 伤痕：用 1 句话（例：左手虎口新擦伤，尚未包扎）",
        "- 站位：用 1 句话（例：站在办公室门口，背对陆辰）",
      ];

  const user = [
    isOverseas
      ? `【任务】写第 ${ctx.episodeIndex} 集完整剧本（单集 ${budget.secMin}-${budget.secMax} 秒，中文场记 + 英文对白约 ${budget.enMin}-${budget.enMax} 词，海外平台节奏）。`
      : `【任务】写第 ${ctx.episodeIndex} 集完整剧本（单集 ${budget.secMin}-${budget.secMax} 秒，约 ${budget.cnMin}-${budget.cnMax} 字）。`,
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
    ctx.creativeBrief ? "【三幕创意方案（本集必须落在正确的 Act 与核心主题里）】" : "",
    ctx.creativeBrief ?? "",
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
    ctx.prevContinuity ? `【上一集连续性检查点（第 ${ctx.episodeIndex - 1} 集结尾）】` : "",
    ctx.prevContinuity
      ? ctx.prevContinuity + "\n（本集开场第 1 场必须与以上妆发/服装/道具/伤痕/站位严格承接，不得出现未说明的跳变。）"
      : "",
    "",
    hasPrev ? "【上一集结尾（用于衔接钩子）】" : "",
    hasPrev ? ctx.prevEpisodeTail!.slice(-800) : "",
    "",
    ctx.rewriteHint ? "【重写指令（必须采纳）】" : "",
    ctx.rewriteHint ?? "",
    "",
    refsBlock(refs),
    "",
    isOverseas
      ? [
          "【双语格式硬约束】",
          "- 场景标题、△ 镜头提示、♪ 音乐提示、（情绪）括号 → 一律中文。",
          "- 每句对白 → English only，不允许中英混杂。",
          "- 角色名：**只用单一英文主名**（例如 `**Mia**`、`**Damian**`），首次出场 + 后续都用同一个英文名。**禁止**写 `林夏 / Lin Xia`、`Mia / 米娅` 这类双名格式；**禁止**任何亚裔人名（中文 / 拼音 / Chen / Wang / Park / Kim 等姓氏）。如果上游 brief 带亚裔名字，立刻替换成西方名字。",
          "- 角色形象不得带「黑长直 / 杏眼 / 东方面孔 / 旗袍 / 汉服 / 韩服」等亚裔/东方暗示；族裔与外貌按西方角色刻画。",
          "- 禁止用 `she said` / `he replied` 这类叙事描述，台词必须是纯对白。",
          "- 不允许出现 `I am very 生气`、`Don't 骗我` 这类混杂对白。",
        ].join("\n")
      : "",
    "",
    ...outputRequirements,
    "",
    "【场级硬约束 · 局势变化（7 选 1，必须至少一项）】",
    "每一场戏，场头状态 → 场尾状态必须发生以下至少 1 种变化；禁止写「两人争吵 / 她很愤怒」之类空泛描写：",
    "  a. 信息释放（本场观众或角色获得此前不知道的关键信息）",
    "  b. 情绪变化（角色的主要情绪从 X 转到 Y，且转折在本场内发生）",
    "  c. 权力转移（谁在说了算、谁被压制，本场内逆转）",
    "  d. 关系恶化或缓和（两人关系的强度/方向在本场发生变化）",
    "  e. 威胁升级（外部危机或内部压力的量级被抬高）",
    "  f. 决策形成（角色在本场末做出一个此前未做的选择）",
    "  g. 谎言暴露（之前建立的假象/伪装被部分或全部揭穿）",
    "",
    "【台词硬约束 · 7 级拆解优先级】",
    "若一段台词偏长或信息量过满，按以下顺序从上往下处理，直到满足「短、狠、口语化」为止：",
    "  1) 拆句（把一句切成两到三句）",
    "  2) 加打断（被另一角色/物件/声音打断）",
    "  3) 配物件（让角色一边说一边操作关键道具）",
    "  4) 切反应（把说话的一半改成对方的反应镜头）",
    "  5) 改成对抗（把陈述改为质问 / 反问 / 威胁）",
    "  6) 删废话（客套、解释、铺垫一律删）",
    "  7) 加位置变化（一边走一边说 / 转身离开 / 近身逼问）",
    "",
    "写作铁律：",
    `1) 前 30 秒必须抓人：${isFirst ? "直接按开篇黄金法则起手（钩子 / 身份反差 / 极端困境三选一）" : "承接上一集的悬念（用 1 个动作/台词 5 秒内回应）然后立刻抛新钩"}。`,
    isOverseas
      ? "2) 中段冲突必须逐场升级。中文动作短、可拍；英文对白短、狠、口语化。"
      : "2) 中段冲突必须升级；每个场次必须推进剧情，不得「闲聊 / 回忆 / 铺垫」而无进展。",
    isOverseas
      ? "3) 结尾 30 秒必须释放小爽点并抛新悬念，或在付费卡点情绪最高处硬切。"
      : "3) 结尾 30 秒：" + (isPaywallEp(ctx.episodeOutline) ? "**必须**在情绪最高点硬切（付费卡点），结尾一行用 `【本集完】`。" : "释放一次小爽点 + 抛新悬念。"),
    isOverseas
      ? `4) 英文对白必须 tight and platform-friendly；每句台词原则上 ≤${budget.lineMaxEn} 词；禁止长独白；避免海外观众无法理解的本土梗。`
      : `4) 台词短平快，禁止长独白。每句台词原则上不超过 ${budget.lineMaxCn} 字，超过必须走上面的 7 级拆解。`,
    "5) 禁止使用开发者注释 / 代码块 / 任何 JSON。",
    isOverseas
      ? "6) 人名、关系与情绪动机必须对全球观众清晰。严格吸收出海适配 brief 的命名、场景和对白风格要求。"
      : "6) 全集不得出现除 `△` `♪` 以外的特殊前缀；情绪用圆括号 `（…）` 包在角色名后。",
    "7) 本集最后一行必须是 `【本集完】`；其后紧接 `## 连续性检查点` 段（5 项逐行短句），**不得省略**，否则下一集无法衔接。",
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
