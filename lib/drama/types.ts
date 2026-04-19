export type DramaStep =
  | "start"
  | "plan"
  | "characters"
  | "outline"
  | "episode"
  | "review"
  | "export"
  | "done";

export interface DramaState {
  currentStep: DramaStep;
  genre: string[];
  audience?: "男频" | "女频" | "全年龄";
  tone?: "爽燃" | "甜虐" | "搞笑" | "暗黑" | "温情";
  ending?: "HE" | "BE" | "OE" | "反转";
  totalEpisodes: number;
  completedEpisodes: number[];
  reviewedEpisodes: number[];
  language: "zh-CN" | "en-US";
  mode: "domestic" | "overseas";
  dramaTitle: string;
  freeText?: string;
  multiAgentEnabled?: boolean;
  multiAgentCommands?: ("plan" | "episode")[];
}

export function defaultDramaState(): DramaState {
  return {
    currentStep: "start",
    genre: [],
    totalEpisodes: 60,
    completedEpisodes: [],
    reviewedEpisodes: [],
    language: "zh-CN",
    mode: "domestic",
    dramaTitle: "",
    multiAgentEnabled: false,
    multiAgentCommands: ["episode"],
  };
}

export interface ProjectRow {
  id: string;
  title: string;
  state_json: string;
  created_at: number;
  updated_at: number;
}

export interface Project {
  id: string;
  title: string;
  state: DramaState;
  createdAt: number;
  updatedAt: number;
}
