import JSZip from "jszip";
import type { BatchItem, BatchProject, BatchStage } from "./types";
import { itemsToCsv } from "./csv";
import { marketLabel } from "./prompts";

export function renderBatchMarkdown(project: BatchProject, items: BatchItem[], stage: BatchStage): string {
  const parts = [
    `# ${project.title}`,
    "",
    `> 来源：红果热榜/剧名/关键词`,
    `> 目标市场：${marketLabel(project.targetMarket)}`,
    `> 总集数：${project.totalEpisodes}`,
    "",
  ];
  for (const item of items) {
    parts.push(`## ${item.title || item.id}`);
    parts.push("");
    if (stage === "sources") {
      parts.push(`源剧名：${item.sourceTitle || item.title || "（空）"}`);
      if (item.sourceKeywords) parts.push(`关键词：${item.sourceKeywords}`);
      if (item.sourceSummary) parts.push(`简介：${item.sourceSummary}`);
      if (item.oneLiner) parts.push(`新一句话题材：${item.oneLiner}`);
    } else if (stage === "creative") {
      parts.push(item.creativeMd || item.oneLiner || "（空）");
    } else if (stage === "screenplay") {
      parts.push(item.screenplayMd || "（未生成完整剧本）");
    } else {
      parts.push(item.storyboardMd || "（未生成分镜脚本）");
    }
    parts.push("");
  }
  return parts.join("\n");
}

export async function buildBatchZip(project: BatchProject, items: BatchItem[]): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file("source-dramas.csv", itemsToCsv(items));
  zip.file("source-dramas.md", renderBatchMarkdown(project, items, "sources"));
  zip.file("creative.md", renderBatchMarkdown(project, items, "creative"));
  zip.file("screenplays.md", renderBatchMarkdown(project, items, "screenplay"));
  zip.file("storyboards.md", renderBatchMarkdown(project, items, "storyboard"));
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}
