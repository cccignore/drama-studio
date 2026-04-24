import { getEpisodeIndices, getLatestArtifact, getReviewIndices, listArtifactsByPrefix } from "./artifacts";
import { promoteStep, stepIndex } from "./state-machine";
import { updateProject } from "./store";
import type { DramaState, Project } from "./types";

export function inferStepFromArtifacts(projectId: string, state: DramaState): DramaState["currentStep"] {
  let inferred: DramaState["currentStep"] = "start";
  if (getLatestArtifact(projectId, "start-card")) inferred = "creative";
  if (getLatestArtifact(projectId, "creative")) inferred = "plan";
  if (getLatestArtifact(projectId, "plan")) inferred = "characters";
  if (getLatestArtifact(projectId, "characters")) inferred = "outline";
  if (getLatestArtifact(projectId, "outline")) inferred = "episode";
  if (getEpisodeIndices(projectId).length > 0) inferred = "episode";
  if (getReviewIndices(projectId).length > 0) inferred = "storyboard";
  if (listArtifactsByPrefix(projectId, "storyboard-").length > 0) inferred = "export";

  return stepIndex(inferred) > stepIndex(state.currentStep) ? inferred : state.currentStep;
}

export function repairProjectProgress(project: Project): Project {
  const inferred = inferStepFromArtifacts(project.id, project.state);
  const nextState = promoteStep(project.state, inferred);
  if (nextState === project.state) return project;
  return updateProject(project.id, { state: nextState }) ?? project;
}
