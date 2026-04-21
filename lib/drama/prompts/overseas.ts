import type { DramaState } from "../types";
import type { LLMMessage } from "../../llm/types";
import { SYSTEM_PERSONA, contextBlock, refsBlock } from "./_shared";

export interface OverseasContext {
  startCard?: string;
  plan?: string;
  characters?: string;
  outline?: string;
}

export function buildOverseasMessages(
  state: DramaState,
  ctx: OverseasContext,
  refs: string
): LLMMessage[] {
  const user = [
    "【任务】把当前项目切换到出海模式，并产出一份真正可执行的出海适配 brief。",
    "",
    "【项目信息】",
    contextBlock({ ...state, mode: "overseas", language: "zh-CN" }),
    "",
    ctx.startCard ? "【立项卡】" : "",
    ctx.startCard ?? "",
    "",
    ctx.plan ? "【节奏规划摘要】" : "",
    ctx.plan ? ctx.plan.slice(0, 1600) : "",
    "",
    ctx.characters ? "【人物设计摘要】" : "",
    ctx.characters ? ctx.characters.slice(0, 1600) : "",
    "",
    ctx.outline ? "【分集目录摘要】" : "",
    ctx.outline ? ctx.outline.slice(0, 1600) : "",
    "",
    refsBlock(refs),
    "",
    "【输出要求】整份 brief 用中文撰写，保留必要英文剧名、人名和对白示例。输出纯 Markdown，不要代码块。",
    "",
    "# 出海适配 Brief",
    "",
    "## 1. 市场定位",
    "- 目标平台：",
    "- 核心受众：",
    "- 这个 premise 为什么适合海外观众：",
    "",
    "## 2. 英文包装",
    "- English series title:",
    "- One-sentence logline:",
    "- 3 条 thumbnail / caption hook phrase：",
    "",
    "## 3. 文化本地化策略",
    "- 场景与职业调整：",
    "- 角色命名策略：",
    "- 需要强化的关系动力：",
    "- 太本土化或海外观众难理解的元素：",
    "",
    "## 4. 海外短剧节奏规则",
    "- Cold open 要求：",
    "- 中段冲突升级方式：",
    "- Cliffhanger 要求：",
    "- ReelShort / DramaBox 风格注意事项：",
    "",
    "## 5. 风险提示",
    "- 3-5 条海外发行的安全 / 合规 / 文化敏感提醒。",
    "",
    "## 6. 剧本语言规范",
    "- 场景标题、`△` 镜头/动作提示、`♪` 音乐提示、角色括号情绪：一律中文。",
    "- 对白本体：English only，口语化、短句、平台友好，不要把中文思路硬翻。",
    "- 角色名首次出现写 `中文名 / English Name`，后续可使用英文主名。",
    "- 禁止出现 `I am very 生气` 这类中英混杂对白。",
    "- 禁止用 `she said` / `he replied` 这类叙事句代替台词，台词必须是角色直接说出口的话。",
    "",
    "要求：",
    "1) 必须可执行，避免空泛建议，例如「更国际化」。",
    "2) 如果当前项目已经接近海外口味，保留优势，只调整真正需要本地化的部分。",
    "3) 英文名和场景提案要自然，不要半翻译半拼音的混搭。",
  ]
    .filter((line) => line !== "")
    .join("\n");

  return [
    { role: "system", content: SYSTEM_PERSONA },
    { role: "user", content: user },
  ];
}
