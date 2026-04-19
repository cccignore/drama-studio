import { notFound } from "next/navigation";
import { getProject } from "@/lib/drama/store";
import { getLatestArtifact } from "@/lib/drama/artifacts";
import { StartStepClient } from "./start-client";

export const dynamic = "force-dynamic";

export default async function StartPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = getProject(projectId);
  if (!project) notFound();
  const artifact = getLatestArtifact(projectId, "start-card");
  return (
    <StartStepClient
      projectId={projectId}
      initialState={project.state}
      initialArtifact={artifact ? { content: artifact.content, version: artifact.version } : null}
    />
  );
}
