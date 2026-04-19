import { notFound, redirect } from "next/navigation";
import { getProject } from "@/lib/drama/store";
import { getLatestArtifact } from "@/lib/drama/artifacts";
import { stepIndex } from "@/lib/drama/state-machine";
import { CharactersStepClient } from "./characters-client";

export const dynamic = "force-dynamic";

export default async function CharactersPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = getProject(projectId);
  if (!project) notFound();
  if (stepIndex(project.state.currentStep) < stepIndex("characters")) {
    redirect(`/studio/${projectId}/${project.state.currentStep}`);
  }
  const artifact = getLatestArtifact(projectId, "characters");
  return (
    <CharactersStepClient
      projectId={projectId}
      initialArtifact={artifact ? { content: artifact.content, version: artifact.version } : null}
    />
  );
}
