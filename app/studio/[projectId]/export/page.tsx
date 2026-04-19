import { notFound, redirect } from "next/navigation";
import { getProject } from "@/lib/drama/store";
import {
  getEpisodeIndices,
  getLatestArtifact,
  getReviewIndices,
} from "@/lib/drama/artifacts";
import { canAccessStep } from "@/lib/drama/state-machine";
import { extractReviewJson } from "@/lib/drama/parsers/extract-review-json";
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
  const reviewed = new Set(getReviewIndices(projectId));
  const summaries: ExportEpisodeSummary[] = [];
  let totalChars = 0;
  let totalDanger = 0;
  let totalWarn = 0;
  let sumAvg = 0;
  let reviewCount = 0;

  for (const idx of epIdxs) {
    const ep = getLatestArtifact(projectId, `episode-${idx}`);
    const rv = reviewed.has(idx) ? getLatestArtifact(projectId, `review-${idx}`) : null;
    let avg: number | null = null;
    let danger = 0;
    let warn = 0;
    if (rv) {
      const parsed = extractReviewJson(rv.content);
      if (parsed.ok) {
        const s = parsed.data.scores;
        avg = Math.round(((s.pace + s.satisfy + s.dialogue + s.format + s.coherence) / 5) * 10) / 10;
        danger = parsed.data.issues.filter((i) => i.level === "danger").length;
        warn = parsed.data.issues.filter((i) => i.level === "warn").length;
        sumAvg += avg;
        reviewCount += 1;
      }
    }
    totalChars += ep?.content.length ?? 0;
    totalDanger += danger;
    totalWarn += warn;
    summaries.push({
      index: idx,
      title: (ep?.meta?.title as string | undefined) ?? "",
      charCount: ep?.content.length ?? 0,
      avg,
      danger,
      warn,
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
        totalDanger,
        totalWarn,
        avgAll: reviewCount ? Math.round((sumAvg / reviewCount) * 10) / 10 : null,
      }}
    />
  );
}
