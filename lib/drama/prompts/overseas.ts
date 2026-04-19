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
    "【任务】把当前项目切换到出海模式，并产出一份真正可执行的 overseas adaptation brief。",
    "",
    "【项目信息】",
    contextBlock({ ...state, mode: "overseas", language: "en-US" }),
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
    "【输出要求】Write the entire brief in English. Output pure Markdown only, no code block.",
    "",
    "# Overseas Adaptation Brief",
    "",
    "## 1. Market Positioning",
    "- Primary target platform(s):",
    "- Core audience:",
    "- Why this premise travels internationally:",
    "",
    "## 2. English Packaging",
    "- English series title:",
    "- One-sentence logline:",
    "- Three hook phrases for thumbnail / caption usage:",
    "",
    "## 3. Cultural Localization",
    "- Setting adjustments:",
    "- Character naming strategy:",
    "- Relationship dynamics to emphasize:",
    "- Elements to avoid because they are too local / confusing:",
    "",
    "## 4. Script Rules For Overseas Episodes",
    "- Tone of dialogue:",
    "- Cold-open requirement:",
    "- Cliffhanger requirement:",
    "- Hollywood-format reminders for each episode:",
    "",
    "## 5. Risk Notes",
    "- 3-5 safety / compliance reminders for overseas release.",
    "",
    "要求：",
    "1) This must be actionable. Avoid generic advice like 'make it more global'.",
    "2) If the current project is already close to overseas taste, keep the strengths and only adjust the parts that truly need localization.",
    "3) Character names and setting proposals must be globally legible, not half-translated hybrids.",
  ]
    .filter((line) => line !== "")
    .join("\n");

  return [
    { role: "system", content: SYSTEM_PERSONA },
    { role: "user", content: user },
  ];
}
