import { notFound, redirect } from "next/navigation";
import { getProject } from "@/lib/drama/store";
import { getLatestArtifact } from "@/lib/drama/artifacts";
import { stepIndex } from "@/lib/drama/state-machine";
import { CreativeStepClient } from "./creative-client";

export const dynamic = "force-dynamic";

export default async function CreativePage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = getProject(projectId);
  if (!project) notFound();
  if (stepIndex(project.state.currentStep) < stepIndex("creative")) {
    redirect(`/studio/${projectId}/start`);
  }
  const startCard = getLatestArtifact(projectId, "start-card");
  const creative = getLatestArtifact(projectId, "creative");
  return (
    <CreativeStepClient
      projectId={projectId}
      freeText={project.state.freeText ?? ""}
      startCard={startCard?.content ?? ""}
      initialArtifact={
        creative ? { content: creative.content, version: creative.version } : null
      }
    />
  );
}
