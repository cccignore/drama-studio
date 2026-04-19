import { notFound, redirect } from "next/navigation";
import { getProject } from "@/lib/drama/store";
import { getLatestArtifact } from "@/lib/drama/artifacts";
import { stepIndex } from "@/lib/drama/state-machine";
import { OutlineStepClient } from "./outline-client";

export const dynamic = "force-dynamic";

export default async function OutlinePage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = getProject(projectId);
  if (!project) notFound();
  if (stepIndex(project.state.currentStep) < stepIndex("outline")) {
    redirect(`/studio/${projectId}/${project.state.currentStep}`);
  }
  const artifact = getLatestArtifact(projectId, "outline");
  return (
    <OutlineStepClient
      projectId={projectId}
      totalEpisodes={project.state.totalEpisodes}
      initialArtifact={artifact ? { content: artifact.content, version: artifact.version } : null}
    />
  );
}
