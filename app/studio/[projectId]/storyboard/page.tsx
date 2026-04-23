import { notFound, redirect } from "next/navigation";
import { getProject } from "@/lib/drama/store";
import { getEpisodeIndices, getLatestArtifact, listArtifactsByPrefix } from "@/lib/drama/artifacts";
import { stepIndex } from "@/lib/drama/state-machine";
import { StoryboardStepClient, type StoryboardEntry } from "./storyboard-client";

export const dynamic = "force-dynamic";

export default async function StoryboardPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = getProject(projectId);
  if (!project) notFound();
  const episodeIdxs = getEpisodeIndices(projectId);
  if (episodeIdxs.length === 0) {
    // 还没写剧本，就退回 episode 页让他们先写
    if (stepIndex(project.state.currentStep) < stepIndex("episode")) {
      redirect(`/studio/${projectId}/episode`);
    }
  }
  const storyboards = listArtifactsByPrefix(projectId, "storyboard-");
  const sbByIdx = new Map<number, { content: string; version: number }>();
  for (const sb of storyboards) {
    const m = sb.name.match(/^storyboard-(\d+)$/);
    if (!m) continue;
    sbByIdx.set(Number(m[1]), { content: sb.content, version: sb.version });
  }

  const entries: StoryboardEntry[] = episodeIdxs.map((index) => {
    const sb = sbByIdx.get(index);
    const ep = getLatestArtifact(projectId, `episode-${index}`);
    return {
      index,
      done: !!sb,
      content: sb?.content ?? null,
      version: sb?.version ?? null,
      hasEpisode: !!ep,
    };
  });

  return (
    <StoryboardStepClient
      projectId={projectId}
      totalEpisodes={project.state.totalEpisodes}
      entries={entries}
      initialIndex={entries[0]?.index ?? 1}
    />
  );
}
