import type { ExportBundle } from "./collect";

function section(title: string, body: string | null | undefined): string {
  if (!body || !body.trim()) return "";
  return `## ${title}\n\n${body.trim()}\n`;
}

export function renderProjectMarkdown(bundle: ExportBundle): string {
  const { project, startCard, plan, characters, outline, episodes, reviews } = bundle;
  const state = project.state;
  const reviewByIdx = new Map(reviews.map((r) => [r.index, r.artifact]));

  const header = [
    `# ${project.title || state.dramaTitle || "未命名短剧"}`,
    "",
    `> 题材：${state.genre.join(" / ") || "-"}　|　受众：${state.audience ?? "-"}　|　基调：${state.tone ?? "-"}　|　结局：${state.ending ?? "-"}`,
    `> 总集数：${state.totalEpisodes}　|　已写：${episodes.length}　|　已复盘：${reviews.length}`,
    "",
    `> 导出时间：${new Date().toLocaleString("zh-CN")}`,
    "",
    "---",
    "",
  ].join("\n");

  const parts = [
    header,
    section("立项卡", startCard?.content),
    section("节奏规划", plan?.content),
    section("人物设计", characters?.content),
    section("分集目录", outline?.content),
    "## 剧本正文\n",
  ];

  for (const { index, artifact } of episodes) {
    parts.push(`### 第 ${index} 集\n`);
    parts.push(artifact.content.trim());
    parts.push("");
    const rv = reviewByIdx.get(index);
    if (rv) {
      parts.push(`#### 第 ${index} 集 · 复盘`);
      parts.push("```json");
      parts.push(rv.content.trim());
      parts.push("```");
      parts.push("");
    }
  }

  return parts.filter(Boolean).join("\n");
}

export function renderEpisodeMarkdown(
  bundle: ExportBundle,
  episodeIndex: number
): string {
  const ep = bundle.episodes.find((e) => e.index === episodeIndex);
  if (!ep) return `# 第 ${episodeIndex} 集\n\n（尚未写成）\n`;
  const rv = bundle.reviews.find((r) => r.index === episodeIndex);
  const out = [`# ${bundle.project.title} · 第 ${episodeIndex} 集\n`, ep.artifact.content.trim()];
  if (rv) {
    out.push("\n## 复盘结果", "```json", rv.artifact.content.trim(), "```");
  }
  return out.join("\n");
}
