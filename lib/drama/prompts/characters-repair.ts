import type { DramaState } from "../types";
import type { LLMMessage } from "../../llm/types";
import { SYSTEM_PERSONA, contextBlock } from "./_shared";

export function buildCharactersRepairMessages(
  state: DramaState,
  charactersDraft: string
): LLMMessage[] {
  const user = [
    "【任务】上一步人物设计缺少 Mermaid 人物关系图。请基于下面已经生成的人物卡，补写一份合法 Mermaid 关系图。",
    "",
    "【项目上下文】",
    contextBlock(state),
    "",
    "【已生成人物卡】",
    charactersDraft.trim() || "（暂缺）",
    "",
    "【输出要求】",
    "1) 只输出一个 ```mermaid 代码块，不要输出任何解释、标题或额外 Markdown。",
    "2) 使用 `graph TD` 或 `flowchart TD`。",
    "3) 节点只能引用人物卡里实际出现的角色，数量与已出现的人物卡一致，不得新增未出场角色。",
    "4) 节点格式：`A1[中文姓名（定位）]`。",
    "5) 普通关系统一使用 `A1 -- 关系 --> B1`；隐藏关系统一使用 `A1 -. 隐藏关系 .-> B1`。",
    "6) 边标签只能是纯中文或英文字母，不得包含 `()（）/\\\\\"'|` 等符号，也不要换行。",
    "7) 如果人物卡内容本身不完整，就仅基于已出现的人物信息建立最合理的关系图，不要补充解释。",
  ].join("\n");

  return [
    { role: "system", content: SYSTEM_PERSONA },
    { role: "user", content: user },
  ];
}
