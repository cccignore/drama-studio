import { notFound, redirect } from "next/navigation";
import { getProject } from "@/lib/drama/store";
import { getLatestArtifact } from "@/lib/drama/artifacts";
import { stepIndex } from "@/lib/drama/state-machine";
import { PlanStepClient } from "./plan-client";

export const dynamic = "force-dynamic";

export default async function PlanPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = getProject(projectId);
  if (!project) notFound();
  if (stepIndex(project.state.currentStep) < stepIndex("plan")) {
    redirect(`/studio/${projectId}/start`);
  }
  const startCard = getLatestArtifact(projectId, "start-card");
  const plan = getLatestArtifact(projectId, "plan");
  return (
    <PlanStepClient
      projectId={projectId}
      totalEpisodes={project.state.totalEpisodes}
      startCard={startCard?.content ?? ""}
      initialArtifact={plan ? { content: plan.content, version: plan.version } : null}
    />
  );
}
