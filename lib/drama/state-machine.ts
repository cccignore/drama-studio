import type { DramaStep, DramaState } from "./types";

export const STEP_ORDER: DramaStep[] = [
  "start",
  "plan",
  "characters",
  "outline",
  "episode",
  "review",
  "export",
  "done",
];

export const STEP_LABEL: Record<DramaStep, string> = {
  start: "立项",
  plan: "节奏",
  characters: "角色",
  outline: "分集",
  episode: "剧本",
  review: "复盘",
  export: "导出",
  done: "完成",
};

export const COMMAND_TO_STEP: Record<string, DramaStep> = {
  start: "start",
  plan: "plan",
  characters: "characters",
  outline: "outline",
  episode: "episode",
  review: "review",
  export: "export",
};

export function stepIndex(step: DramaStep): number {
  return STEP_ORDER.indexOf(step);
}

export function nextStep(step: DramaStep): DramaStep {
  const i = stepIndex(step);
  return STEP_ORDER[Math.min(i + 1, STEP_ORDER.length - 1)];
}

export function canRunCommand(command: string, state: DramaState): { ok: true } | { ok: false; reason: string } {
  if (command === "ping") return { ok: true };
  const target = COMMAND_TO_STEP[command];
  if (!target) return { ok: false, reason: `未知命令：${command}` };
  const required = stepIndex(target);
  const current = stepIndex(state.currentStep);
  if (current < required) {
    return { ok: false, reason: `请先完成「${STEP_LABEL[state.currentStep]}」再执行「${STEP_LABEL[target]}」` };
  }
  return { ok: true };
}

export function advanceAfter(command: string, state: DramaState): DramaState {
  const target = COMMAND_TO_STEP[command];
  if (!target) return state;
  const currentIdx = stepIndex(state.currentStep);
  const targetIdx = stepIndex(target);
  if (targetIdx < currentIdx) return state;
  return { ...state, currentStep: nextStep(target) };
}
