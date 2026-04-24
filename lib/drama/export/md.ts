import type { ExportBundle } from "./collect";

export interface ExportRange {
  from?: number;
  to?: number;
}

function section(title: string, body: string | null | undefined): string {
  if (!body || !body.trim()) return "";
  return `## ${title}\n\n${body.trim()}\n`;
}

function inRange(index: number, range: ExportRange = {}): boolean {
  return index >= (range.from ?? -Infinity) && index <= (range.to ?? Infinity);
}

function projectHeader(bundle: ExportBundle, titleSuffix = ""): string {
  const { project, episodes } = bundle;
  const state = project.state;
  return [
    `# ${project.title || state.dramaTitle || "未命名短剧"}${titleSuffix}`,
    "",
    `> 题材：${state.genre.join(" / ") || "-"}　|　受众：${state.audience ?? "-"}　|　基调：${state.tone ?? "-"}　|　结局：${state.ending ?? "-"}`,
    `> 总集数：${state.totalEpisodes}　|　已写：${episodes.length}`,
    "",
    `> 导出时间：${new Date().toLocaleString("zh-CN")}`,
    "",
    "---",
    "",
  ].join("\n");
}

export function renderScreenplayMarkdown(bundle: ExportBundle, range: ExportRange = {}): string {
  const episodes = bundle.episodes.filter((item) => inRange(item.index, range));
  const parts = [projectHeader(bundle, " · 完整剧本"), "## 剧本正文\n"];

  for (const { index, artifact } of episodes) {
    parts.push(`### 第 ${index} 集\n`);
    parts.push(artifact.content.trim());
    parts.push("");
  }

  return parts.filter(Boolean).join("\n");
}

export function renderStoryboardMarkdown(bundle: ExportBundle, range: ExportRange = {}): string {
  const storyboards = bundle.storyboards.filter((item) => inRange(item.index, range));
  const parts = [projectHeader(bundle, " · 分镜脚本"), "## 分镜正文\n"];

  for (const { index, artifact } of storyboards) {
    parts.push(`### 第 ${index} 集 · 分镜脚本\n`);
    parts.push(artifact.content.trim());
    parts.push("");
  }

  return parts.filter(Boolean).join("\n");
}

export function renderProjectMarkdown(bundle: ExportBundle): string {
  const { startCard, creative, plan, characters, outline } = bundle;

  const parts = [
    projectHeader(bundle, " · 项目资料"),
    section("立项卡", startCard?.content),
    section("三幕创意方案", creative?.content),
    section("节奏规划", plan?.content),
    section("人物设计", characters?.content),
    section("分集目录", outline?.content),
  ];

  return parts.filter(Boolean).join("\n");
}

export function renderEpisodeMarkdown(
  bundle: ExportBundle,
  episodeIndex: number
): string {
  const ep = bundle.episodes.find((e) => e.index === episodeIndex);
  if (!ep) return `# 第 ${episodeIndex} 集\n\n（尚未写成）\n`;
  const out = [`# ${bundle.project.title} · 第 ${episodeIndex} 集\n`, ep.artifact.content.trim()];
  return out.join("\n");
}

export function renderEpisodeStoryboardMarkdown(
  bundle: ExportBundle,
  episodeIndex: number
): string {
  const sb = bundle.storyboards.find((s) => s.index === episodeIndex);
  if (!sb) return `# 第 ${episodeIndex} 集 · 分镜脚本\n\n（尚未拆分镜）\n`;
  return [`# ${bundle.project.title} · 第 ${episodeIndex} 集 · 分镜脚本\n`, sb.artifact.content.trim()].join("\n");
}
