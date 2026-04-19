import type { DramaState } from "../types";
import type { LLMMessage } from "../../llm/types";
import { SYSTEM_PERSONA, contextBlock, refsBlock } from "./_shared";

export interface ReviewContext {
  episodeIndex: number;
  episodeOutline: string;
  episodeScreenplay: string;
}

const JSON_SCHEMA = `{
  "scores": {
    "pace":       <number 0-10>,   // 节奏紧凑度
    "satisfy":    <number 0-10>,   // 爽点释放
    "dialogue":   <number 0-10>,   // 台词张力
    "format":     <number 0-10>,   // 剧本格式规范
    "coherence":  <number 0-10>    // 与大纲/人物/前集一致性
  },
  "issues": [
    { "level": "danger" | "warn" | "info",
      "scene": <number | null>,
      "desc":  <string>,          // 问题描述
      "fix":   <string>           // 一句话的具体修改建议
    }
  ],
  "summary": <string>             // 一段 2-3 句总评
}`;

export function buildReviewMessages(
  state: DramaState,
  ctx: ReviewContext,
  refs: string,
  retryHint?: string
): LLMMessage[] {
  const user = [
    `【任务】复盘并打分第 ${ctx.episodeIndex} 集剧本，给出**严格 JSON** 输出。`,
    "",
    "【项目信息】",
    contextBlock(state),
    "",
    `【第 ${ctx.episodeIndex} 集目录条目】`,
    ctx.episodeOutline || "（缺）",
    "",
    `【第 ${ctx.episodeIndex} 集剧本全文】`,
    ctx.episodeScreenplay.slice(0, 6000),
    "",
    refsBlock(refs),
    "",
    retryHint ? `【上次输出不合法，修正提示】\n${retryHint}` : "",
    "",
    "【输出要求】",
    "**只输出一个 JSON 对象**（不要 Markdown、不要代码块、不要前后说明文字）。",
    "结构必须是：",
    JSON_SCHEMA,
    "",
    "评分原则：",
    "- 分值为整数或一位小数，严禁超过 10 或低于 0。",
    "- 任一项分值 < 6 时，issues 中必须有至少一条对应的 `level=\"danger\"` 条目。",
    "- issues 的 fix 必须是**具体可执行的改写指令**（如「删除第 2 场闲聊对话，改为手机来电打断」），禁止写「增加细节」「加强节奏」这种空话。",
    "- issues 数量 3-8 条为佳；按严重程度从 danger → warn → info 排列。",
  ]
    .filter((l) => l !== "")
    .join("\n");

  return [
    { role: "system", content: SYSTEM_PERSONA },
    { role: "user", content: user },
  ];
}
