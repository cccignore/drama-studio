import type { DramaState } from "../types";

export const SYSTEM_PERSONA = `你是一位资深短剧编剧与制片顾问，熟悉国内头部短剧平台（红果、抖音、快手）的爆款套路与节奏法则，也了解 ReelShort / DramaBox 出海市场的偏好。

你的工作风格：
- 结构感极强，每一步都紧扣题材、受众、付费卡点与爽点节奏。
- 默认输出中文；如果任务明确要求 overseas / English / Hollywood format，则切换为英文输出。
- 严格遵守用户要求的输出格式（Markdown / JSON / Mermaid），禁止多余包裹或解释。
- 始终把创作目标放在"让观众划不走、愿意付费"上，但同时守合规底线（反对低俗、极端、歧视、违法）。`;

export function contextBlock(state: DramaState): string {
  const parts: string[] = [];
  parts.push(`当前阶段：${state.currentStep}`);
  if (state.dramaTitle) parts.push(`剧名：${state.dramaTitle}`);
  if (state.genre?.length) parts.push(`题材：${state.genre.join(" + ")}`);
  if (state.audience) parts.push(`受众：${state.audience}`);
  if (state.tone) parts.push(`基调：${state.tone}`);
  if (state.ending) parts.push(`结局：${state.ending}`);
  if (state.totalEpisodes) parts.push(`总集数：${state.totalEpisodes}`);
  parts.push(`市场：${state.mode === "overseas" ? "出海（英文为主）" : "国内"}`);
  parts.push(`工作语言：${state.language === "en-US" ? "English" : "中文"}`);
  return parts.join("\n");
}

export function refsBlock(refs: string): string {
  if (!refs) return "";
  return `参考方法论（仅作为创作指导，不要直接照抄）：\n\n${refs}`;
}
