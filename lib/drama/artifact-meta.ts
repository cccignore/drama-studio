import { extractMermaid } from "./parsers/extract-mermaid";
import { sanitizeMermaid } from "./parsers/sanitize-mermaid";
import { extractPlanCurve } from "./parsers/extract-plan-curve";
import { parseScreenplay, summarizeScreenplay } from "./parsers/screenplay";
import { extractReviewJson } from "./parsers/extract-review-json";
import { extractComplianceJson } from "./parsers/extract-compliance-json";
import { extractCreative, summarizeCreative } from "./parsers/extract-creative";
import { parseStoryboard, summarizeStoryboard } from "./parsers/storyboard";

export function normalizeArtifactContent(name: string, content: string): string {
  if (name !== "characters") return content;
  const mm = extractMermaid(content);
  if (!mm.code) return content;
  return content.replace(
    /```mermaid\s*\n([\s\S]*?)```/i,
    `\`\`\`mermaid\n${sanitizeMermaid(mm.code).trim()}\n\`\`\``
  );
}

export function validateArtifactContent(name: string, content: string) {
  if (!content.trim()) throw new Error("内容不能为空");
  if (/^episode-\d+$/.test(name)) {
    const seen = new Set<number>();
    const dupes = new Set<number>();
    for (const m of content.matchAll(/^##\s+(?:场?\s*(\d+)|Scene\s*(\d+))\s*[·•\-]/gim)) {
      const n = Number(m[1] || m[2]);
      if (!Number.isFinite(n)) continue;
      if (seen.has(n)) dupes.add(n);
      seen.add(n);
    }
    if (dupes.size) throw new Error(`场次编号重复：${Array.from(dupes).join(", ")}`);
  }
}

export function buildArtifactMeta(name: string, content: string): Record<string, unknown> | null {
  if (name === "plan") {
    const curve = extractPlanCurve(content);
    return {
      curve,
      pointCount: curve.length,
      paywallEpisodes: curve.filter((item) => item.paywall).map((item) => item.episode),
    };
  }
  if (name === "characters") {
    const mm = extractMermaid(content);
    return { hasMermaid: !!mm.code, mermaidChars: mm.code?.length ?? 0 };
  }
  const episodeMatch = name.match(/^episode-(\d+)$/);
  if (episodeMatch) {
    const ast = parseScreenplay(content);
    return {
      episodeIndex: Number(episodeMatch[1]),
      title: ast.title,
      closed: ast.closed,
      ...summarizeScreenplay(ast),
    };
  }
  const reviewMatch = name.match(/^review-(\d+)$/);
  if (reviewMatch) {
    const parsed = extractReviewJson(content);
    if (!parsed.ok) return { episodeIndex: Number(reviewMatch[1]), parseError: parsed.error };
    const data = parsed.data;
    const avg =
      (data.scores.pace +
        data.scores.satisfy +
        data.scores.dialogue +
        data.scores.format +
        data.scores.coherence) /
      5;
    return {
      episodeIndex: Number(reviewMatch[1]),
      avg: Math.round(avg * 10) / 10,
      scores: data.scores,
      danger: data.issues.filter((i) => i.level === "danger").length,
      warn: data.issues.filter((i) => i.level === "warn").length,
      info: data.issues.filter((i) => i.level === "info").length,
    };
  }
  if (name === "compliance-report") {
    const parsed = extractComplianceJson(content);
    if (!parsed.ok) return { parseError: parsed.error };
    return {
      totals: parsed.data.totals,
      itemCount: parsed.data.items.length,
    };
  }
  if (name === "overseas-brief") return { mode: "overseas", language: "bilingual" };
  if (name === "creative") {
    const art = extractCreative(content);
    return {
      title: art.title,
      audience: art.audience,
      genre: art.genre,
      coreTheme: art.coreTheme,
      ...summarizeCreative(art),
    };
  }
  const storyboardMatch = name.match(/^storyboard-(\d+)$/);
  if (storyboardMatch) {
    const doc = parseStoryboard(content);
    return {
      episodeIndex: Number(storyboardMatch[1]),
      ...summarizeStoryboard(doc),
    };
  }
  return null;
}
