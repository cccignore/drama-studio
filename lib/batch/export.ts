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
      const block = renderCreativeBlock(item);
      parts.push(block || "（空）");
    } else if (stage === "screenplay") {
      parts.push(item.screenplayMd || "（未生成完整剧本）");
    } else {
      parts.push(item.storyboardMd || "（未生成分镜脚本）");
    }
    parts.push("");
  }
  return parts.join("\n");
}

function renderCreativeBlock(item: BatchItem): string {
  const hasStructured = Boolean(item.act1 || item.protagonist || item.audience);
  if (!hasStructured) return item.creativeMd || item.oneLiner || "";
  const lines: string[] = [];
  if (item.protagonist) lines.push(`**第一主角**: ${item.protagonist}`);
  if (item.narrativePov) lines.push(`**叙事视角**: ${item.narrativePov}`);
  if (item.audience) lines.push(`**受众**: ${item.audience}`);
  if (item.storyType) lines.push(`**故事类型**: ${item.storyType}`);
  if (item.setting) lines.push(`**故事背景**: ${item.setting}`);
  if (item.act1 || item.act2 || item.act3) {
    lines.push("", "### 故事梗概");
    if (item.act1) lines.push("", "**Act 1**", "", item.act1);
    if (item.act2) lines.push("", "**Act 2**", "", item.act2);
    if (item.act3) lines.push("", "**Act 3**", "", item.act3);
  }
  return lines.join("\n").trim();
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
