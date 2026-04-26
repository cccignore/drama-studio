import fs from "node:fs";
import path from "node:path";

const REF_DIR = path.join(process.cwd(), "references");

export const REF_MAP: Record<string, string[]> = {
  start: ["genre-guide"],
  creative: ["genre-guide", "hook-design"],
  plan: ["opening-rules", "paywall-design", "rhythm-curve", "satisfaction-matrix"],
  characters: ["villain-design"],
  outline: ["paywall-design", "rhythm-curve", "hook-design"],
  episode: ["rhythm-curve", "satisfaction-matrix", "hook-design"],
  review: ["rhythm-curve", "hook-design", "satisfaction-matrix"],
  storyboard: [],
  overseas: ["genre-guide", "hook-design", "hollywood-bilingual"],
  compliance: ["compliance-checklist"],
};

export interface LoadRefsOptions {
  episodeIndex?: number;
  maxCharsPerRef?: number;
  /** 额外按需追加的 reference slug（去重，附加在命令默认列表之后） */
  extraSlugs?: string[];
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
  let slugs: string[];
  if (command === "episode") {
    const base = [...(REF_MAP.episode ?? [])];
    slugs = (opts?.episodeIndex ?? 999) <= 3 ? ["opening-rules", ...base] : base;
  } else {
    slugs = [...(REF_MAP[command] ?? [])];
  }
  if (opts?.extraSlugs?.length) {
    for (const slug of opts.extraSlugs) {
      if (slug && !slugs.includes(slug)) slugs.push(slug);
    }
  }
  return slugs;
}
