import { notFound, redirect } from "next/navigation";
import { getProject } from "@/lib/drama/store";
import { getEpisodeIndices, getLatestArtifact, getReviewIndices } from "@/lib/drama/artifacts";
import { canRunCommand } from "@/lib/drama/state-machine";
import { OverseasClient } from "./overseas-client";

export const dynamic = "force-dynamic";

export default async function OverseasPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = getProject(projectId);
  if (!project) notFound();

  const writtenEpisodes = getEpisodeIndices(projectId).length;
  const reviewedEpisodes = getReviewIndices(projectId).length;
  const check = canRunCommand("overseas", project.state, {
    writtenEpisodes,
    reviewedEpisodes,
  });
  if (!check.ok) {
    redirect(`/studio/${projectId}/${project.state.currentStep}`);
  }

  const artifact = getLatestArtifact(projectId, "overseas-brief");

  return (
    <OverseasClient
      projectId={projectId}
      initialMode={project.state.mode}
      initialArtifact={
        artifact
          ? {
              content: artifact.content,
              version: artifact.version,
            }
          : null
      }
    />
  );
}
