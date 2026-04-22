/**
 * Extract the "## 连续性检查点" block that the episode prompt now forces models to emit.
 *
 * Expected (lenient) shape, emitted after 【本集完】:
 *
 *   ## 连续性检查点
 *   - 妆发：…
 *   - 服装：…
 *   - 关键道具：…
 *   - 伤痕：…
 *   - 站位：…
 *
 * The parser is deliberately forgiving — models drift on:
 *   - heading level (##  vs #)
 *   - label punctuation (：vs : vs "、")
 *   - bullet char (- vs * vs ·)
 *   - Chinese/English keys for overseas scripts ("Hair"/"Costume"/...)
 *
 * Returns a short, normalized text block suitable for injecting into the next
 * episode's prompt, or null if no recognizable block was found.
 */

export interface ContinuityCheckpoint {
  makeup?: string;
  costume?: string;
  props?: string;
  injury?: string;
  position?: string;
  raw: string;
}

const HEADING_RE = /^#{1,4}\s*连续性检查点\s*$/m;
const FIELD_PATTERNS: Array<{ key: keyof Omit<ContinuityCheckpoint, "raw">; re: RegExp }> = [
  { key: "makeup",   re: /^[\s\-\*·•]*\*?\*?(?:妆发(?:状态)?|Hair(?:\s*&?\s*Makeup)?|Makeup)\*?\*?\s*[:：、]\s*(.+?)\s*$/im },
  { key: "costume",  re: /^[\s\-\*·•]*\*?\*?(?:服装(?:状态)?|Costume|Wardrobe)\*?\*?\s*[:：、]\s*(.+?)\s*$/im },
  { key: "props",    re: /^[\s\-\*·•]*\*?\*?(?:(?:关键)?道具(?:状态)?|Key\s*Props?|Props?)\*?\*?\s*[:：、]\s*(.+?)\s*$/im },
  { key: "injury",   re: /^[\s\-\*·•]*\*?\*?(?:伤痕(?:状态)?|Injur(?:y|ies))\*?\*?\s*[:：、]\s*(.+?)\s*$/im },
  { key: "position", re: /^[\s\-\*·•]*\*?\*?(?:站位|位置|Blocking|Position)\*?\*?\s*[:：、]\s*(.+?)\s*$/im },
];

export function extractContinuity(screenplay: string): ContinuityCheckpoint | null {
  if (!screenplay) return null;
  const headingMatch = HEADING_RE.exec(screenplay);
  if (!headingMatch) return null;

  // Slice from the heading to end-of-document or next H1/H2 (whichever comes first).
  const start = headingMatch.index;
  const rest = screenplay.slice(start);
  const nextBoundary = rest.slice(headingMatch[0].length).search(/^#{1,2}\s+\S/m);
  const block = nextBoundary < 0
    ? rest
    : rest.slice(0, headingMatch[0].length + nextBoundary);

  const out: ContinuityCheckpoint = { raw: block.trim() };
  for (const { key, re } of FIELD_PATTERNS) {
    const m = re.exec(block);
    if (m && m[1]) out[key] = m[1].trim();
  }

  // Require at least 2 recognized fields before declaring success — otherwise
  // we'd confuse unrelated "连续性" prose for a checkpoint.
  const recognized = FIELD_PATTERNS.reduce((n, { key }) => n + (out[key] ? 1 : 0), 0);
  if (recognized < 2) return null;
  return out;
}

/**
 * Format a checkpoint as a compact brief for prompt injection.
 * Caps at ~400 chars so it never explodes the context budget.
 */
export function formatContinuityBrief(cp: ContinuityCheckpoint): string {
  const lines: string[] = [];
  const push = (label: string, val?: string) => {
    if (val && val.trim()) lines.push(`- ${label}：${clip(val, 80)}`);
  };
  push("妆发", cp.makeup);
  push("服装", cp.costume);
  push("关键道具", cp.props);
  push("伤痕", cp.injury);
  push("站位", cp.position);
  return lines.join("\n");
}

function clip(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

/**
 * Convenience: extract + format in one call. Returns null if the source
 * screenplay has no usable checkpoint.
 */
export function extractContinuityBrief(screenplay: string): string | null {
  const cp = extractContinuity(screenplay);
  if (!cp) return null;
  const formatted = formatContinuityBrief(cp);
  return formatted || null;
}
