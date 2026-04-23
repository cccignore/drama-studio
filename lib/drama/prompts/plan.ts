import type { DramaState } from "../types";
import type { LLMMessage } from "../../llm/types";
import { SYSTEM_PERSONA, contextBlock, refsBlock } from "./_shared";

export interface PlanAgentContext {
  plannerBrief?: string;
  criticNotes?: string;
  /** /creative 阶段产出的三幕方案摘要，优先遵循其世界观、Act 结构、核心主题 */
  creativeBrief?: string;
}

export function buildPlanMessages(
  state: DramaState,
  startCard: string,
  refs: string,
  agentContext?: PlanAgentContext
): LLMMessage[] {
  const user = [
    "【任务】基于已完成的立项卡，给出本剧的**节奏与付费规划**。",
    "",
    "【立项信息】",
    contextBlock(state),
    "",
    "【立项卡全文】",
    startCard || "（尚未生成立项卡）",
    "",
    agentContext?.creativeBrief ? "【三幕创意方案（必须贴合，不得偏离 Act 结构与核心主题）】" : "",
    agentContext?.creativeBrief ?? "",
    "",
    agentContext?.plannerBrief ? "【Planner 节奏骨架草案】" : "",
    agentContext?.plannerBrief ?? "",
    "",
    agentContext?.criticNotes ? "【Critic 风险修正意见】" : "",
    agentContext?.criticNotes ?? "",
    "",
    refsBlock(refs),
    "",
    `【输出要求】严格输出下列 Markdown，所有集数用阿拉伯数字；全剧总集数 = ${state.totalEpisodes}；不要包裹在代码块里。`,
    "",
    "# 节奏规划",
    "",
    "## 一、四段节奏划分",
    "| 阶段 | 集数区间 | 情绪强度 | 本段叙事使命 |",
    "|------|---------|---------|--------------|",
    "| 起势段 | X-X | ★★☆☆☆ | … |",
    "| 攀升段 | X-X | ★★★☆☆ | … |",
    "| 风暴段 | X-X | ★★★★☆ | … |",
    "| 决战段 | X-X | ★★★★★ | … |",
    "",
    "## 二、爽点地图",
    "按出现顺序列出 6–10 个关键爽点场景。每条格式：",
    "- 第 N 集 · 「爽点一句话命名」 · 类型（身份碾压 / 打脸复仇 / 逆袭翻盘 / 情感爆发 / 悬念揭秘） · 强度（★…） · 一句话描述",
    "",
    "## 三、付费卡点",
    "严格列 5–7 个卡点，按集数顺序。格式：",
    "- 🔒 第 N 集卡点 · 类型（身份即将揭露 / 生死一线 / 情感爆发中断 / 反派阴谋得逞 / 真相即将大白） · 一句话描述未解的悬念",
    "",
    "## 四、节奏自检",
    "用 3-5 条要点，说明本规划如何规避「信息真空 / 爽点间隔过长 / 虎头蛇尾」等风险。",
    "",
    "## 五、节奏波形数据",
    "严格输出 Markdown 表格，覆盖 1 到总集数的每一集，格式如下：",
    "| 集数 | 情绪强度(1-5) | 爽点释放(1-5) | 钩子强度(1-5) | 付费卡点 | 备注 |",
    "|------|---------------|---------------|---------------|----------|------|",
    "| 1 | 4 | 3 | 5 | 否 | 开场困境与身份反差 |",
    "",
    "要求：",
    "1) 起势段集数占比约 15%、攀升段 30%、风暴段 35%、决战段 20%。允许 ±1 集误差。",
    "2) 首个付费卡点必须落在起势段结尾或攀升段前两集。",
    "3) 每个爽点/卡点必须给出具体集号，禁止「大约第 X 集」。",
    "4) 第五部分必须完整覆盖 1 到总集数的所有集数，每集一行；数值只能填 1-5 的整数。",
    state.mode === "overseas"
      ? "5) 当前是出海模式：节奏应更强调开场 5 秒强钩子、关系反差与文化上更普适的冲突。": "5) 当前是国内模式：节奏应兼顾爽点堆叠和付费卡点密度。",
  ].join("\n");

  return [
    { role: "system", content: SYSTEM_PERSONA },
    { role: "user", content: user },
  ];
}
