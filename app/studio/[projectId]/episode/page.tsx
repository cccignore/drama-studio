import { notFound, redirect } from "next/navigation";
import { getProject } from "@/lib/drama/store";
import {
  getEpisodeIndices,
  getLatestArtifact,
  getReviewIndices,
} from "@/lib/drama/artifacts";
import { stepIndex } from "@/lib/drama/state-machine";
import { parseDirectory } from "@/lib/drama/parsers/extract-directory";
import { EpisodeStepClient, type EpisodeEntry, type EpisodeBrief } from "./episode-client";

export const dynamic = "force-dynamic";

export default async function EpisodePage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = getProject(projectId);
  if (!project) notFound();
  if (stepIndex(project.state.currentStep) < stepIndex("episode")) {
    redirect(`/studio/${projectId}/${project.state.currentStep}`);
  }
  const outline = getLatestArtifact(projectId, "outline");
  if (!outline) redirect(`/studio/${projectId}/outline`);

  const parsed = parseDirectory(outline.content);
  const total = project.state.totalEpisodes || parsed.total;

  const writtenIdxs = getEpisodeIndices(projectId);
  const reviewedIdxs = new Set(getReviewIndices(projectId));

  const byIdx = new Map<number, EpisodeBrief>();
  for (const act of parsed.acts) {
    for (const ep of act.episodes) {
      byIdx.set(ep.index, {
        index: ep.index,
        title: ep.title,
        mainLine: ep.mainLine,
        hook: ep.hook,
        ending: ep.ending,
        hasHighlight: ep.hasHighlight,
        hasPaywall: ep.hasPaywall,
        actName: act.name,
      });
    }
  }

  const entries: EpisodeEntry[] = [];
  for (let i = 1; i <= total; i++) {
    const brief = byIdx.get(i) ?? {
      index: i,
      title: `第 ${i} 集`,
      mainLine: "",
      hook: "",
      ending: "",
      hasHighlight: false,
      hasPaywall: false,
      actName: "",
    };
    entries.push({
      ...brief,
      written: writtenIdxs.includes(i),
      reviewed: reviewedIdxs.has(i),
    });
  }

  const initialEpIndex = writtenIdxs.length
    ? Math.max(...writtenIdxs)
    : (entries.find((e) => !e.written)?.index ?? 1);
  const initialArtifact = initialEpIndex
    ? getLatestArtifact(projectId, `episode-${initialEpIndex}`)
    : null;

  return (
    <EpisodeStepClient
      projectId={projectId}
      totalEpisodes={total}
      entries={entries}
      initialIndex={initialEpIndex}
      multiAgentEnabled={Boolean(
        project.state.multiAgentEnabled && project.state.multiAgentCommands?.includes("episode")
      )}
      initialContent={initialArtifact?.content ?? null}
    />
  );
}
