import type { DramaState } from "../types";
import type { LLMMessage } from "../../llm/types";
import { SYSTEM_PERSONA, contextBlock, refsBlock } from "./_shared";

export function buildPlanMessages(state: DramaState, startCard: string, refs: string): LLMMessage[] {
  const user = [
    "【任务】基于已完成的立项卡，给出本剧的**节奏与付费规划**。",
    "",
    "【立项信息】",
    contextBlock(state),
    "",
    "【立项卡全文】",
    startCard || "（尚未生成立项卡）",
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
    "要求：",
    "1) 起势段集数占比约 15%、攀升段 30%、风暴段 35%、决战段 20%。允许 ±1 集误差。",
    "2) 首个付费卡点必须落在起势段结尾或攀升段前两集。",
    "3) 每个爽点/卡点必须给出具体集号，禁止「大约第 X 集」。",
  ].join("\n");

  return [
    { role: "system", content: SYSTEM_PERSONA },
    { role: "user", content: user },
  ];
}
