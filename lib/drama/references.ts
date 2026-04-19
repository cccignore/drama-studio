import fs from "node:fs";
import path from "node:path";

const REF_DIR = path.join(process.cwd(), "references");

export const REF_MAP: Record<string, string[]> = {
  start: ["genre-guide"],
  plan: ["opening-rules", "paywall-design", "rhythm-curve", "satisfaction-matrix"],
  characters: ["villain-design"],
  outline: ["paywall-design", "rhythm-curve", "hook-design"],
  episode: ["rhythm-curve", "satisfaction-matrix", "hook-design"],
  review: ["rhythm-curve", "hook-design", "satisfaction-matrix"],
  overseas: ["genre-guide", "hook-design"],
  compliance: ["compliance-checklist"],
};

export interface LoadRefsOptions {
  episodeIndex?: number;
  maxCharsPerRef?: number;
}

const cache = new Map<string, string>();

function readRef(slug: string): string {
  const cached = cache.get(slug);
  if (cached !== undefined) return cached;
  const file = path.join(REF_DIR, `${slug}.md`);
  try {
    const text = fs.readFileSync(file, "utf8");
    cache.set(slug, text);
    return text;
  } catch {
    return `# ${slug} (not found)\n`;
  }
}

function summarize(text: string, maxChars = 3500): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + "\n\n[…参考文档已截断]";
}

export function loadRefsForCommand(command: string, opts?: LoadRefsOptions): string {
  const slugs = resolveRefSlugs(command, opts);
  if (slugs.length === 0) return "";
  const max = opts?.maxCharsPerRef ?? 3500;
  const blocks = slugs.map((slug) => {
    const body = summarize(readRef(slug), max);
    return `<<<REF:${slug}>>>\n${body}\n<<<END:${slug}>>>`;
  });
  return blocks.join("\n\n");
}

function resolveRefSlugs(command: string, opts?: LoadRefsOptions): string[] {
  if (command === "episode") {
    const base = [...(REF_MAP.episode ?? [])];
    if ((opts?.episodeIndex ?? 999) <= 3) {
      return ["opening-rules", ...base];
    }
    return base;
  }
  return REF_MAP[command] ?? [];
}
