import { describe, expect, it } from "vitest";
import type { Artifact } from "../lib/drama/artifacts";
import type { ExportBundle } from "../lib/drama/export/collect";
import {
  renderEpisodeMarkdown,
  renderEpisodeStoryboardMarkdown,
  renderProjectMarkdown,
  renderScreenplayMarkdown,
  renderStoryboardMarkdown,
} from "../lib/drama/export/md";
import { defaultDramaState } from "../lib/drama/types";

function artifact(name: string, content: string): Artifact {
  return {
    id: 1,
    projectId: "p1",
    name,
    content,
    meta: null,
    version: 1,
    source: "generate",
    parentVersion: null,
    createdAt: 1,
  };
}

function bundle(): ExportBundle {
  return {
    project: {
      id: "p1",
      title: "测试短剧",
      state: { ...defaultDramaState(), totalEpisodes: 30, genre: ["悬疑"] },
      createdAt: 1,
      updatedAt: 1,
    },
    startCard: artifact("start-card", "立项卡正文"),
    creative: artifact("creative", "创意正文"),
    plan: artifact("plan", "节奏正文"),
    characters: artifact("characters", "人物正文"),
    outline: artifact("outline", "目录正文"),
    episodes: [
      { index: 1, artifact: artifact("episode-1", "第 1 集剧本") },
      { index: 2, artifact: artifact("episode-2", "第 2 集剧本") },
    ],
    reviews: [
      { index: 1, artifact: artifact("review-1", "{\"summary\":\"复盘结果\",\"issues\":[]}") },
    ],
    storyboards: [
      { index: 1, artifact: artifact("storyboard-1", "第 1 集分镜") },
      { index: 2, artifact: artifact("storyboard-2", "第 2 集分镜") },
    ],
  };
}

describe("export markdown", () => {
  it("renders screenplay without review or storyboard content", () => {
    const out = renderScreenplayMarkdown(bundle());
    expect(out).toContain("第 1 集剧本");
    expect(out).toContain("第 2 集剧本");
    expect(out).not.toContain("复盘结果");
    expect(out).not.toContain("第 1 集分镜");
  });

  it("renders storyboard as a separate deliverable", () => {
    const out = renderStoryboardMarkdown(bundle(), { from: 2, to: 2 });
    expect(out).toContain("第 2 集分镜");
    expect(out).not.toContain("第 1 集分镜");
    expect(out).not.toContain("第 1 集剧本");
  });

  it("keeps single episode downloads separated by kind", () => {
    expect(renderEpisodeMarkdown(bundle(), 1)).toContain("第 1 集剧本");
    expect(renderEpisodeMarkdown(bundle(), 1)).not.toContain("复盘结果");
    expect(renderEpisodeStoryboardMarkdown(bundle(), 1)).toContain("第 1 集分镜");
  });

  it("renders project materials without episode bodies", () => {
    const out = renderProjectMarkdown(bundle());
    expect(out).toContain("立项卡正文");
    expect(out).toContain("目录正文");
    expect(out).not.toContain("第 1 集剧本");
  });
});
