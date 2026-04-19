import {
  getEpisodeIndices,
  getLatestArtifact,
  type Artifact,
} from "../artifacts";
import type { Project } from "../types";

export interface ExportBundle {
  project: Project;
  startCard: Artifact | null;
  plan: Artifact | null;
  characters: Artifact | null;
  outline: Artifact | null;
  episodes: { index: number; artifact: Artifact }[];
  reviews: { index: number; artifact: Artifact }[];
}

export function collectExportBundle(project: Project): ExportBundle {
  const startCard = getLatestArtifact(project.id, "start-card");
  const plan = getLatestArtifact(project.id, "plan");
  const characters = getLatestArtifact(project.id, "characters");
  const outline = getLatestArtifact(project.id, "outline");
  const indices = getEpisodeIndices(project.id);
  const episodes: { index: number; artifact: Artifact }[] = [];
  const reviews: { index: number; artifact: Artifact }[] = [];
  for (const idx of indices) {
    const ep = getLatestArtifact(project.id, `episode-${idx}`);
    if (ep) episodes.push({ index: idx, artifact: ep });
    const rv = getLatestArtifact(project.id, `review-${idx}`);
    if (rv) reviews.push({ index: idx, artifact: rv });
  }
  return { project, startCard, plan, characters, outline, episodes, reviews };
}
