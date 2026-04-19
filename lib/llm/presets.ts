import type { ProjectLLMCommand } from "./types";

export interface RoutingPreset {
  id: string;
  name: string;
  description: string;
  commands: Partial<Record<ProjectLLMCommand, "default" | "primary" | "secondary" | "tertiary">>;
}

export const ROUTING_PRESETS: RoutingPreset[] = [
  {
    id: "single-default",
    name: "单模型默认",
    description: "所有步骤都使用默认模型，适合只有一个可用模型时。",
    commands: {
      default: "default",
    },
  },
  {
    id: "writer-reviewer",
    name: "结构化 + 长文本分工",
    description: "结构化步骤走主模型，长文本剧本与复盘可切换到第二模型。",
    commands: {
      start: "primary",
      plan: "primary",
      characters: "primary",
      outline: "primary",
      episode: "secondary",
      review: "secondary",
      export: "default",
      overseas: "secondary",
      compliance: "secondary",
    },
  },
  {
    id: "quality-first",
    name: "质量优先",
    description: "核心生成使用主模型，复盘和合规使用第三模型做审校。",
    commands: {
      start: "primary",
      plan: "primary",
      characters: "primary",
      outline: "primary",
      episode: "primary",
      review: "tertiary",
      compliance: "tertiary",
      overseas: "secondary",
    },
  },
];
