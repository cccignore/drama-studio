import type { DramaState } from "../types";
import type { LLMMessage } from "../../llm/types";
import { SYSTEM_PERSONA, contextBlock, refsBlock } from "./_shared";
import { getEpisodeBudget } from "../episode-budget";

export interface StoryboardContext {
  episodeIndex: number;
  /** 本集完整剧本（中文 / 双语都支持） */
  episodeScreenplay: string;
  /** 目录条目，便于把主题钩子带进画面描述 */
  episodeOutline?: string;
}

const TABLE_HEADER = `| 镜号 | 场 | 景别 | 机位/运动 | 画面描述 | 台词/SFX | 时长(s) | 备注 |
|------|----|------|-----------|----------|----------|---------|------|`;

const SHOT_TYPES = [
  "远景(WS)",
  "全景(FS)",
  "中景(MS)",
  "中近景(MCU)",
  "近景(CU)",
  "特写(ECU)",
  "大特写(BCU)",
  "过肩(OTS)",
  "POV",
  "俯拍(HA)",
  "仰拍(LA)",
].join(" / ");

const CAMERA_MOTIONS = "固定 / 推 / 拉 / 摇 / 移 / 跟 / 甩 / 升降 / 手持 / 环绕 / Whip Pan";

export function buildStoryboardMessages(
  state: DramaState,
  ctx: StoryboardContext,
  refs: string
): LLMMessage[] {
  const budget = getEpisodeBudget(state.mode);
  const isOverseas = state.mode === "overseas";

  const user = [
    `【任务】把第 ${ctx.episodeIndex} 集完整剧本，拆解为**可拍摄的分镜脚本**（storyboard）。`,
    `目标总时长：${budget.secMin}-${budget.secMax} 秒；总镜头数建议 ${state.mode === "overseas" ? "18-32" : "30-60"} 个。`,
    "",
    "【项目信息】",
    contextBlock(state),
    "",
    ctx.episodeOutline ? `【第 ${ctx.episodeIndex} 集目录条目】` : "",
    ctx.episodeOutline ?? "",
    "",
    `【第 ${ctx.episodeIndex} 集完整剧本】`,
    ctx.episodeScreenplay.slice(0, 6000),
    "",
    refsBlock(refs),
    "",
    "【分镜方法论】",
    "1) 每一「△ 动作块 / 每一句对白 / 每一个关键反应」通常各占 1 个镜头，情绪爆点必拆特写 + 反应 + 补镜。",
    "2) 每个对白镜头 1.5-3 秒、动作镜头 0.8-2 秒；付费卡点/情绪高点镜头可到 3-4 秒。",
    "3) 人物进入新场景或身份暴露时，必须有身份立牌镜头（近景特写或道具特写）。",
    "4) 连续对话禁止 2 个以上机位雷同；必须在正反打之间插至少 1 个反应 / 道具 / 环境镜头。",
    `5) 景别词汇限制在：${SHOT_TYPES}；机位/运动限制在：${CAMERA_MOTIONS}。`,
    "6) 台词列（台词/SFX）直接粘贴剧本台词；动作镜头此列可填 SFX（例：SFX：玻璃杯碎裂）或留「—」。",
    isOverseas
      ? "7) 海外模式：台词英文保留原文；SFX 仍用中文（方便后期），画面描述为中文。"
      : "7) 国内模式：全中文输出，保留剧本原台词。",
    "",
    "【输出格式】严格输出一个 Markdown 文档；不要外层代码块、不要前后说明文字；表格之前必须有本集大标题和每场的 H3 标题：",
    "",
    `# 第 ${ctx.episodeIndex} 集 · 分镜脚本`,
    "",
    "## 场 1 · 场景名（地点 / 时间）",
    "",
    TABLE_HEADER,
    "| 001 | 1 | 特写(ECU) | 推 | 她的指尖握紧钢笔，笔尖抵在合同签名栏。 | — | 1.5 | 建立道具 |",
    "| 002 | 1 | 中景(MS) | 固定 | 男主倚在落地窗前，逆光不可见表情。 | SFX：钢笔划纸 | 2.0 | 身份立牌 |",
    '| 003 | 1 | 近景(CU) | 甩 | 女主抬眼，与他对视。 | **林夏**（冷）："你输了。" | 2.2 | 情绪切点 |',
    "",
    "## 场 2 · ……",
    "",
    "（按剧本场次依序输出；每场至少 4 个镜头；时长总和须接近该场剧本预估时长）",
    "",
    "【校验铁律】",
    "- 镜号从 001 起连号，跨场不重置。",
    "- 景别和机位运动严格来自上面的词表，禁止自创「大特近」「后拉推」等合成词。",
    "- 禁止空行、禁止合并单元格、禁止把 2 个镜头写在同一行。",
    "- 每个对白行必须保留角色名 + 台词原文，允许在前面加「（情绪）」。",
  ]
    .filter((l) => l !== "")
    .join("\n");

  return [
    { role: "system", content: SYSTEM_PERSONA },
    { role: "user", content: user },
  ];
}
