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
    "必须本土化人名、城市、职业、阶层冲突、亲密关系表达与对白风格。",
    "审核交付语言规则：人名使用英文名；除最终分镜脚本的台词/SFX 外，其余说明、三幕创意、完整剧本文本都用中文，便于中文审核。",
    "优先考虑契约婚姻、豪门继承、黑帮/校园/狼人/复仇/身份秘密等海外高转化元素。",
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

export function buildCreativeMessages(project: BatchProject, item: BatchItem): LLMMessage[] {
  return [
    {
      role: "system",
      content:
        "你是 Drama Studio 主链路里的资深短剧编剧与制片顾问。请按主链路 /creative 的质量标准执行：强投流感、强付费感、强反转，Act1/Act2/Act3 清晰，世界观、核心主题、爽点和付费钩子可执行。",
    },
    {
      role: "user",
      content: [
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
        "3. Act 1 / Act 2 / Act 3",
        "4. 世界观与人物关系",
        "5. 核心爽点与付费卡点",
        "6. 国内/海外本土化注意事项",
        "",
        "硬性标准：",
        "- 前 30 秒必须有开场爆点。",
        "- Act 2 必须有足以推动付费的大反转。",
        "- Act 3 必须闭环，反派处罚明确，核心谜团全部揭晓。",
        "- 输出的新剧名、一句话题材和三幕方案必须服务同一条主线，不能只是源剧简介改写。",
      ].join("\n"),
    },
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
