import { notFound, redirect } from "next/navigation";
import { getProject } from "@/lib/drama/store";
import { getEpisodeIndices, getLatestArtifact, getReviewIndices } from "@/lib/drama/artifacts";
import { canRunCommand } from "@/lib/drama/state-machine";
import { extractComplianceJson, type ComplianceReport } from "@/lib/drama/parsers/extract-compliance-json";
import { ComplianceClient } from "./compliance-client";

export const dynamic = "force-dynamic";

export default async function CompliancePage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = getProject(projectId);
  if (!project) notFound();

  const writtenEpisodes = getEpisodeIndices(projectId).length;
  const reviewedEpisodes = getReviewIndices(projectId).length;
  const check = canRunCommand("compliance", project.state, {
    writtenEpisodes,
    reviewedEpisodes,
  });
  if (!check.ok) {
    redirect(`/studio/${projectId}/${project.state.currentStep}`);
  }

  const artifact = getLatestArtifact(projectId, "compliance-report");
  let initialReport: ComplianceReport | null = null;
  if (artifact) {
    const parsed = extractComplianceJson(artifact.content);
    if (parsed.ok) initialReport = parsed.data;
  }

  return (
    <ComplianceClient
      projectId={projectId}
      writtenEpisodes={writtenEpisodes}
      initialReport={initialReport}
    />
  );
}
