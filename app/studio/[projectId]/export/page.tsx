import { notFound, redirect } from "next/navigation";
import { getProject } from "@/lib/drama/store";
import {
  getEpisodeIndices,
  getLatestArtifact,
  getReviewIndices,
  listArtifactsByPrefix,
} from "@/lib/drama/artifacts";
import { canAccessStep } from "@/lib/drama/state-machine";
import { ExportStepClient, type ExportEpisodeSummary } from "./export-client";

export const dynamic = "force-dynamic";

export default async function ExportPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = getProject(projectId);
  if (!project) notFound();
  const epIdxs = getEpisodeIndices(projectId);
  if (
    !canAccessStep("export", project.state, {
      writtenEpisodes: epIdxs.length,
      reviewedEpisodes: getReviewIndices(projectId).length,
    })
  ) {
    redirect(`/studio/${projectId}/${project.state.currentStep}`);
  }
  const storyboardSet = new Set(
    listArtifactsByPrefix(projectId, "storyboard-")
      .map((item) => item.name.match(/^storyboard-(\d+)$/)?.[1])
      .filter(Boolean)
      .map(Number)
  );
  const summaries: ExportEpisodeSummary[] = [];
  let totalChars = 0;

  for (const idx of epIdxs) {
    const ep = getLatestArtifact(projectId, `episode-${idx}`);
    totalChars += ep?.content.length ?? 0;
    summaries.push({
      index: idx,
      title: (ep?.meta?.title as string | undefined) ?? "",
      charCount: ep?.content.length ?? 0,
      hasStoryboard: storyboardSet.has(idx),
    });
  }

  return (
    <ExportStepClient
      projectId={projectId}
      projectTitle={project.title || project.state.dramaTitle}
      totalEpisodes={project.state.totalEpisodes}
      summaries={summaries}
      stats={{
        totalChars,
        storyboardCount: storyboardSet.size,
      }}
    />
  );
}
