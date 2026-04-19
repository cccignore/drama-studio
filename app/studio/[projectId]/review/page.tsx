import { notFound, redirect } from "next/navigation";
import { getProject } from "@/lib/drama/store";
import {
  getEpisodeIndices,
  getLatestArtifact,
  getReviewIndices,
} from "@/lib/drama/artifacts";
import { canAccessStep, stepIndex } from "@/lib/drama/state-machine";
import {
  extractReviewJson,
  type ReviewResult,
} from "@/lib/drama/parsers/extract-review-json";
import { ReviewStepClient, type ReviewEntry } from "./review-client";

export const dynamic = "force-dynamic";

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = getProject(projectId);
  if (!project) notFound();
  const epIdxs = getEpisodeIndices(projectId);
  const reviewed = new Set(getReviewIndices(projectId));
  if (
    !canAccessStep("review", project.state, {
      writtenEpisodes: epIdxs.length,
      reviewedEpisodes: reviewed.size,
    })
  ) {
    redirect(`/studio/${projectId}/${project.state.currentStep}`);
  }

  const entries: ReviewEntry[] = [];
  for (const idx of epIdxs) {
    let review: ReviewResult | null = null;
    let avg: number | null = null;
    if (reviewed.has(idx)) {
      const rv = getLatestArtifact(projectId, `review-${idx}`);
      if (rv) {
        const parsed = extractReviewJson(rv.content);
        if (parsed.ok) {
          review = parsed.data;
          const s = parsed.data.scores;
          avg =
            Math.round(
              ((s.pace + s.satisfy + s.dialogue + s.format + s.coherence) / 5) * 10
            ) / 10;
        }
      }
    }
    entries.push({ index: idx, reviewed: reviewed.has(idx), review, avg });
  }

  const initialIndex = entries.find((e) => e.reviewed)?.index ?? entries[0]?.index ?? 1;

  return (
    <ReviewStepClient
      projectId={projectId}
      totalEpisodes={project.state.totalEpisodes}
      entries={entries}
      initialIndex={initialIndex}
    />
  );
}
