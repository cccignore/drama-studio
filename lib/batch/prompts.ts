import type { BatchItem, BatchMarket, BatchProject, ParsedSourceDrama } from "./types";
import type { LLMMessage } from "../llm/types";

export function marketLabel(market: BatchMarket): string {
  return market === "domestic" ? "国内短剧市场（红果/抖音/快手）" : "海外本土化市场（TikTok/ReelShort/DramaBox）";
}

function marketRules(market: BatchMarket): string {
  if (market === "domestic") {
    return [
      "面向国内短剧用户：强冲突、强反转、强爽点、强付费卡点。",
      "可使用身份反转、复仇逆袭、家庭伦理、豪门情感、悬疑怪谈等红果高转化母题。",
      "不得照搬输入剧名、人物、关键桥段，只提炼爆款结构。",
    ].join("\n");
  }
  return [
    "面向海外短剧用户：TikTok / ReelShort / DramaBox 语境。",
    "",
    "【出海本土化硬性约束（不可违反）】",
    "- 故事必须**完全本土化**为面向英语母语圈（北美 / 欧洲 / 大洋洲 / 拉美）的海外短剧，**严禁任何亚裔元素**：禁止华裔 / 韩裔 / 日裔 / 越南裔 / 泰国裔 / 菲律宾裔等亚裔角色、人名、外貌描写或文化符号。",
    "- 所有人名**只用纯英文名**（First + Last，例：Mia Carter / Lucas Reed / Ethan Walker）。**禁止**中文名、拼音名（Lin Xia / Wang Wei）、半中半英的双名格式（如「林夏 / Lin Xia」）、以及任何 Chen / Wang / Li / Park / Kim / Nguyen 这类亚裔常见姓氏。如果上游红果源剧带亚裔名字，必须替换为西方名字。",
    "- 角色外貌不得使用「黑长直 / 杏眼 / 东方面孔 / 旗袍 / 汉服 / 韩服」等亚裔/东方暗示；演员体型、肤色、发色、瞳色、服装风格全部按西方角色刻画。",
    "- 城市、职业、阶层冲突、家庭结构、节庆、饮食、教育体系全部本土化为海外语境（NYC / LA / Chicago / London / Sydney / Toronto / São Paulo），**禁止**出现「沪上 / 京城 / 华尔街相亲角 / 春节回家 / 高考 / 体制内」这类中国语境。",
    "- 关系冲突使用海外平台验证过的母题（契约婚姻 / 豪门继承 / 黑帮 / 校园 / 狼人 / 吸血鬼 / 复仇 / 身份秘密 / 单亲妈妈），不要照搬「门当户对 / 家族联姻 / 长辈逼婚 / 婆媳矛盾」。",
    "- 新剧名必须为全英文（推荐 4 词以内全大写）。",
    "",
    "审核交付语言规则：上述本土化是关于**人物与世界设定**；输出格式仍为中文场记 + 英文对白，只有最终分镜脚本的台词/SFX 用英文，其余说明、三幕创意、完整剧本文本都用中文便于中文审核。",
    "不得保留强中国地域依赖设定，不能照搬输入剧名、人物、关键桥段。",
  ].join("\n");
}

export function parseSourceDramas(raw: string): ParsedSourceDrama[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line
        .split(/\s*[|｜]\s*/)
        .map((part) => part.trim())
        .filter(Boolean);
      if (parts.length >= 3) {
        return {
          sourceTitle: parts[0],
          sourceKeywords: parts[1],
          sourceSummary: parts.slice(2).join(" | "),
          sourceText: line,
        };
      }
      if (parts.length === 2) {
        return {
          sourceTitle: parts[0],
          sourceKeywords: "",
          sourceSummary: parts[1],
          sourceText: line,
        };
      }
      const match = line.match(/^(.{2,40}?)[：:,\s]+(.+)$/);
      return {
        sourceTitle: (match?.[1] ?? line).trim(),
        sourceKeywords: "",
        sourceSummary: (match?.[2] ?? "").trim(),
        sourceText: line,
      };
    });
}

const COMPLEX_REVERSAL_BATCH_RULES = [
  "【复杂反转模式（必须遵守）】",
  "- 三幕合计写出 5–7 层反转的具体揭晓时刻；少于 5 层视为不及格。",
  "- 不要在文中标「第 X 层反转」，反转必须通过情节自然展开。",
  "- 反转必须分别来自下面任一类型，不允许同类反转连续叠：",
  "  身份反转 / 关系反转 / 动机反转 / 现实反转（梦境/模拟/回忆）/ 存在反转（AI/循环/已死亡）/ 世界观反转 / 元叙事反转。",
  "- Act 1 至少 1 层小反转；Act 2 至少 2 层（含一次重大颠覆——重新定义观众对前面剧情的理解）；Act 3 至少 1 层终极反转。",
  "- 终极反转**不得让观众觉得前面都白看了**：要让人想重看，而不是被骗。",
  "- 第一主角必须严格写出 5 要素（年龄 / 外貌 / 穿着 / 气质 / 整体印象一句话）。",
  "- 海外向：剧名必须为全大写英文，4 词以内最稳。",
].join("\n");

export function buildCreativeMessages(project: BatchProject, item: BatchItem): LLMMessage[] {
  const complex = project.useComplexReversal;
  const systemPrompt = complex
    ? "你是 Drama Studio 红果批量工厂里负责高反转密度短剧的商业编剧策划，长期为 ReelShort / DramaBox / Dreame 等海外平台开发**含 5–7 层反转**的短剧创意。请按主链路 /creative 的质量标准 + 复杂反转模式输出：Act1/Act2/Act3 清晰，世界观与核心主题闭环。"
    : "你是 Drama Studio 主链路里的资深短剧编剧与制片顾问。请按主链路 /creative 的质量标准执行：强投流感、强付费感、强反转，Act1/Act2/Act3 清晰，世界观、核心主题、爽点和付费钩子可执行。";

  const sampleTitle = project.targetMarket === "overseas" ? "GLASS PRISON" : "玄医逆凡尘";
  const sampleProtagonist =
    project.targetMarket === "overseas"
      ? "Lucas——28 岁，瘦削敏感的记忆架构师，黑框眼镜下藏着忧郁的眼神，总是穿着灰色毛衣，手指修长适合键盘操作，看起来既脆弱又坚韧"
      : "林夏——27 岁，清冷利落的女法医，齐肩短发束成低马尾，常穿白色衬衫与黑色西裤，眼神锋利却藏着克制的善意，看起来沉稳到近乎冷漠";

  const baseLines = [
    `【目标市场】${marketLabel(project.targetMarket)}`,
    marketRules(project.targetMarket),
    `【总集数】${project.totalEpisodes}`,
    "",
    "【红果源剧】",
    `剧名：${item.sourceTitle || item.title}`,
    item.sourceKeywords ? `关键词/标签：${item.sourceKeywords}` : "",
    item.sourceSummary ? `简介：${item.sourceSummary}` : "",
    `原始素材：${item.sourceText}`,
    "",
    "请基于这 1 部红果源剧，输出 1 个全新的短剧方案。只能借鉴母题、冲突结构、爽点机制，不能照搬剧名、人物名、关键桥段。",
    "",
    "【输出格式：严格 7 段，必须使用以下中文 label，每段一行，缺一不可，禁止额外的 Markdown 标题、序号、加粗】",
    "新剧名: <一句话剧名>",
    "第一主角: <主角姓名——年龄、外貌、穿着、气质、整体印象一句话，五要素必须齐全且写在同一段>",
    "叙事视角: <第几人称 + 限制/全知/多视角，括号注明跟随谁>",
    "受众: <男性/女性/全年龄>",
    "故事类型: <用 + 连接 3–4 个核心标签，例如 科幻+记忆+身份质疑>",
    "故事背景: <用 + 连接 2–3 个设定要素，例如 2050年+记忆科技+监狱系统>",
    "故事梗概: Act 1: <≥250 字，含具体场景、对白、第一次反转揭晓时刻>",
    "Act 2: <≥250 字，含中段大反转的具体揭晓时刻>",
    "Act 3: <≥250 字，闭环结局，反派处罚明确、核心谜团全部揭晓>",
    "",
    "【格式示例（仅供格式参照，内容请重新构思，禁止抄袭）】",
    `新剧名: ${sampleTitle}`,
    `第一主角: ${sampleProtagonist}`,
    "叙事视角: 第三人称限制视角（跟随主角）",
    project.targetMarket === "overseas" ? "受众: 男性" : "受众: 全年龄",
    "故事类型: <类型1>+<类型2>+<类型3>",
    "故事背景: <要素1>+<要素2>+<要素3>",
    "故事梗概: Act 1: ……（具体情节）",
    "Act 2: ……（具体情节）",
    "Act 3: ……（具体情节）",
    "",
    "【硬性标准】",
    "- 新剧名必须独立成行，不要 Markdown 标题、不要书名号、不要数字序号。",
    project.targetMarket === "overseas"
      ? "- 海外向：新剧名必须为全英文（推荐 4 个单词以内全大写）；主角姓名一律纯英文。"
      : "- 国内向：新剧名建议 4-6 字中文、强冲突感。",
    "- 前 30 秒必须有开场爆点。",
    complex ? "- 三幕合计写出 5–7 层反转的具体揭晓时刻。" : "- Act 2 必须有足以推动付费的大反转。",
    "- Act 3 必须闭环，反派处罚明确，核心谜团全部揭晓。",
    "- 7 段都必须有内容，不允许写「待补充」「TBD」或留空。",
  ];

  if (complex) {
    baseLines.push("", COMPLEX_REVERSAL_BATCH_RULES);
  }

  return [
    { role: "system", content: systemPrompt },
    { role: "user", content: baseLines.join("\n") },
  ];
}

export function buildScreenplayMessages(project: BatchProject, item: BatchItem): LLMMessage[] {
  const creativeBlock = renderCreativeBlockForPrompt(item);
  return [
    {
      role: "system",
      content:
        "你是 Drama Studio 红果批量工厂里的专业短剧 Writer。请严格按 docx 交付格式输出剧本：每集若干个 N-M 子场次，每个子场次必须包含「场景 / 人物 / 画面 / 台词」四个 label，本集最后一个子场次必须额外加「钩子」。语言克制、台词短狠，每场至少发生一次局势变化（信息释放/情绪转折/权力转移/关系变化/威胁升级/决策形成/谎言暴露）。",
    },
    {
      role: "user",
      content: [
        `【目标市场】${marketLabel(project.targetMarket)}`,
        marketRules(project.targetMarket),
        `【目标集数】${project.totalEpisodes}`,
        "",
        "【三幕创意】",
        creativeBlock,
        "",
        "【输出格式：严格按以下结构，禁止任何额外 Markdown 标题或编号】",
        "第 1 集",
        "",
        "1-1",
        "",
        "场景：<具体地点 + 时段（日/夜/黄昏） + 内/外>",
        "人物：<本场出场人物，逗号分隔>",
        "画面：",
        "△<可拍的动作或镜头描述，每行一个 △>",
        "△<可拍的动作或镜头描述>",
        "台词：",
        "<角色>（情绪）：<台词>",
        "<角色>：<台词>",
        "",
        "1-2",
        "（同上结构）",
        "",
        "1-3",
        "（同上结构）",
        "",
        "钩子：",
        "<本集结尾钩子，1-2 句，留悬念到下一集>",
        "",
        "第 2 集",
        "（同上结构，子场次编号 2-1, 2-2, 2-3 ...）",
        "",
        "【硬性标准】",
        `- 必须从第 1 集写到第 ${project.totalEpisodes} 集，集数不能少。`,
        "- 每集 3-6 个子场次，子场次编号必须为「集号-序号」（如 3-1, 3-2），不能用「第 X 场」或其他形式。",
        "- 每个子场次必须 4 个 label 齐全：场景 / 人物 / 画面 / 台词。",
        "- 「画面」每行以 △ 开头；「台词」每行以「<角色>（情绪）：」或「<角色>：」开头。",
        "- 「钩子：」只在每集最后一个子场次后面出现一次，是本集收束悬念。",
        "- 不要输出连续性检查点、复盘、分镜，也不要输出场记之外的旁白说明。",
        project.targetMarket === "overseas"
          ? "- 海外向：人物使用纯英文姓名，地名/职业/品牌做海外化（NYC / LA / London / Sydney / Toronto 等）；但所有 label 和台词、画面文本仍用中文便于中文审核，禁止整段英文。"
          : "- 国内向：全部中文，使用国内短剧表达；地点用国内城市/小镇。",
      ].join("\n"),
    },
  ];
}

function renderCreativeBlockForPrompt(item: BatchItem): string {
  const structured = [
    item.title ? `新剧名: ${item.title}` : "",
    item.protagonist ? `第一主角: ${item.protagonist}` : "",
    item.narrativePov ? `叙事视角: ${item.narrativePov}` : "",
    item.audience ? `受众: ${item.audience}` : "",
    item.storyType ? `故事类型: ${item.storyType}` : "",
    item.setting ? `故事背景: ${item.setting}` : "",
    item.act1 ? `故事梗概: Act 1: ${item.act1}` : "",
    item.act2 ? `Act 2: ${item.act2}` : "",
    item.act3 ? `Act 3: ${item.act3}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  if (structured) return structured;
  return item.creativeMd || item.oneLiner || item.sourceText || item.title || "";
}

export function buildStoryboardMessages(project: BatchProject, item: BatchItem): LLMMessage[] {
  return [
    {
      role: "system",
      content:
        "你是 Drama Studio 主链路里的分镜导演。请沿用 /storyboard 的分镜标准：逐场拆镜、镜号连续、景别和机位明确、台词/SFX 可拍可剪。",
    },
    {
      role: "user",
      content: [
        `【目标市场】${marketLabel(project.targetMarket)}`,
        "【完整剧本】",
        item.screenplayMd,
        "",
        "请生成分镜脚本 Markdown。每集按镜头编号输出，字段包含：镜号、场次、景别、机位/运动、画面、台词/SFX、时长、备注。",
        project.targetMarket === "overseas"
          ? "海外本土化语言规则：只有「台词/SFX」字段使用英文；镜号、场次、景别、机位/运动、画面、时长、备注全部使用中文。人名继续使用英文名。"
          : "国内短剧语言规则：全部使用中文。",
        "每集镜号从 001 起连号；每场至少 4 个镜头；不要合并多个镜头到一行。",
      ].join("\n"),
    },
  ];
}
