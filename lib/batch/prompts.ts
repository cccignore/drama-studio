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
    "请基于这 1 部红果源剧，生成 1 个全新的短剧方案。只能借鉴母题、冲突结构、爽点机制，不能照搬剧名、人物名、关键桥段。",
    "格式必须为 Markdown，包含：",
    "1. 新剧名",
    "2. 一句话题材",
    complex ? "3. 第一主角描述（5 要素：年龄 / 外貌 / 穿着 / 气质 / 整体印象一句话）" : "",
    "4. Act 1 / Act 2 / Act 3（每段 ≥ 250 字，含具体场景、对白、反转揭晓时刻）",
    "5. 世界观与人物关系",
    "6. 核心爽点与付费卡点",
    "7. 国内/海外本土化注意事项",
    "",
    "硬性标准：",
    "- 前 30 秒必须有开场爆点。",
    complex ? "- 三幕合计写出 5–7 层反转的具体揭晓时刻。" : "- Act 2 必须有足以推动付费的大反转。",
    "- Act 3 必须闭环，反派处罚明确，核心谜团全部揭晓。",
    "- 输出的新剧名、一句话题材和三幕方案必须服务同一条主线，不能只是源剧简介改写。",
  ].filter((line) => line !== "");

  if (complex) {
    baseLines.push("", COMPLEX_REVERSAL_BATCH_RULES);
  }

  return [
    { role: "system", content: systemPrompt },
    { role: "user", content: baseLines.join("\n") },
  ];
}

export function buildScreenplayMessages(project: BatchProject, item: BatchItem): LLMMessage[] {
  return [
    {
      role: "system",
      content:
        "你是 Drama Studio 主链路里的专业 Writer。请沿用 /episode 的剧本标准：场次清晰、动作可拍、台词短狠、每场必须发生局势变化，结尾必须有钩子和连续性检查点。",
    },
    {
      role: "user",
      content: [
        `【目标市场】${marketLabel(project.targetMarket)}`,
        marketRules(project.targetMarket),
        `【目标集数】${project.totalEpisodes}`,
        "",
        "【三幕创意】",
        item.creativeMd || item.oneLiner || item.sourceText,
        "",
        "请生成完整剧本 Markdown。要求：",
        "- 按集输出，从第 1 集到目标集数。",
        "- 每集包含标题、3-5 个场次、动作提示、台词和本集结尾钩子。",
        "- 海外本土化不是整篇英文：人名使用英文名，地名/职业/关系表达做海外化，但完整剧本文本、动作提示和台词均用中文，便于审核。",
        "- 国内版使用中文短剧表达。",
        "- 每集最后必须包含「## 连续性检查点」，列出妆发、服装、关键道具、伤痕、站位。",
        "- 每个场次必须至少发生一种变化：信息释放、情绪转折、权力转移、关系变化、威胁升级、决策形成或谎言暴露。",
        "- 不要输出复盘，不要输出分镜。",
      ].join("\n"),
    },
  ];
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
