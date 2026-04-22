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
      "rule":  <string>,          // 必须命中下方"硬规则清单"里的某一条编号 + 关键词，例如 "R1 局势变化"
      "desc":  <string>,          // 问题描述
      "fix":   <string>           // 一句话的具体修改建议
    }
  ],
  "summary": <string>             // 一段 2-3 句总评
}`;

const HARD_RULES = `【硬规则清单（issue.rule 必须引用其中一条）】
R1  局势变化：每场戏场头状态 ≠ 场尾状态（信息释放 / 情绪变化 / 权力转移 / 关系恶化或缓和 / 威胁升级 / 决策形成 / 谎言暴露 七选一）。
R2  台词承接：台词必须配合动作 / 打断 / 物件 / 反应 / 空间调度，禁止"一个人连续讲话"。
R3  动作短句化：过程描写必须短句、按动作节点分行；禁止长段散文。
R4  开场抓人：第 1 场前 30 秒必须抛冲突 / 危机 / 强动作 / 强信息；非首集需在 5 秒内承接上集悬念。
R5  集尾钩子：除最后一集外，必须形成强悬念硬切；付费卡点集必须情绪最高点切断。
R6  连续性承接：本集开头的妆发 / 服装 / 道具 / 伤痕 / 站位必须与上一集"连续性检查点"严格承接。
R7  连续性检查点：本集末必须有 \`## 连续性检查点\` 段，5 项齐全，否则下一集无法衔接。
R8  格式规范：场次用 \`## 场 N · …\`、动作用 \`△\`、音乐用 \`♪\`、对白用 \`**角色**（情绪）："…"\`，禁止其他特殊前缀。
R9  目录一致性：本集标题与 episode-directory 中本集条目一字不差；剧情主线不得擅自偏离。
R10 时长合理：单集应在 900-1400 字（中文）/ 600-900 词（英文）之间，明显超纲或不足都算问题。
R11 台词长度：每句台词原则上 ≤25 字（中文）/ ≤14 词（英文）；超长台词必须按 7 级拆解（拆句 / 加打断 / 配物件 / 切反应 / 改对抗 / 删废话 / 加位置变化）处理。`;

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
    HARD_RULES,
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
    "- 每条 issue 必须填 `rule` 字段，引用上方「硬规则清单」里的某一条编号 + 关键词，例如 `\"R1 局势变化\"` / `\"R6 连续性承接\"`；不允许凭空发明 rule。",
    "- issues 的 fix 必须是**具体可执行的改写指令**（如「删除第 2 场闲聊对话，改为手机来电打断」），禁止写「增加细节」「加强节奏」这种空话。",
    "- issues 数量 3-8 条为佳；按严重程度从 danger → warn → info 排列；同一条规则可被多次引用。",
  ]
    .filter((l) => l !== "")
    .join("\n");

  return [
    { role: "system", content: SYSTEM_PERSONA },
    { role: "user", content: user },
  ];
}
