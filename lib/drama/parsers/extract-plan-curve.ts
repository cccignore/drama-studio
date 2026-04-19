export interface PlanCurvePoint {
  episode: number;
  intensity: number;
  payoff: number;
  hook: number;
  paywall: boolean;
  note: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeEpisode(cell: string): number | null {
  const match = cell.match(/(\d+)/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function normalizeScore(cell: string): number | null {
  const value = Number(cell.match(/(\d+)/)?.[1] ?? "");
  if (!Number.isFinite(value)) return null;
  return clamp(value, 1, 5);
}

function splitMarkdownRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function parseCurveTable(markdown: string): PlanCurvePoint[] {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => /##\s*五、节奏波形数据/.test(line));
  if (start < 0) return [];

  const points: PlanCurvePoint[] = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line) continue;
    if (line.startsWith("## ")) break;
    if (!line.startsWith("|")) continue;
    if (/^(\|\s*-+\s*)+\|?$/.test(line)) continue;

    const cells = splitMarkdownRow(line);
    if (cells.length < 6 || /集数/.test(cells[0])) continue;
    const episode = normalizeEpisode(cells[0]);
    const intensity = normalizeScore(cells[1]);
    const payoff = normalizeScore(cells[2]);
    const hook = normalizeScore(cells[3]);
    if (!episode || !intensity || !payoff || !hook) continue;
    points.push({
      episode,
      intensity,
      payoff,
      hook,
      paywall: /^(是|yes|y|true|1|💰)$/i.test(cells[4]),
      note: cells[5] ?? "",
    });
  }

  return points.sort((a, b) => a.episode - b.episode);
}

function countStars(text: string): number {
  return clamp((text.match(/★/g) ?? []).length || 0, 1, 5);
}

function extractStageSection(markdown: string): string[] {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => /##\s*一、四段节奏划分/.test(line));
  if (start < 0) return [];
  const out: string[] = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line) continue;
    if (line.startsWith("## ")) break;
    if (line.startsWith("|")) out.push(line);
  }
  return out;
}

function parseRange(cell: string): [number, number] | null {
  const match = cell.match(/(\d+)\s*[-~～—]+\s*(\d+)/);
  if (!match) return null;
  const from = Number(match[1]);
  const to = Number(match[2]);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  return [Math.min(from, to), Math.max(from, to)];
}

function parsePaywallEpisodes(markdown: string): Set<number> {
  const set = new Set<number>();
  const section = markdown.match(/##\s*三、付费卡点([\s\S]*?)(?:\n##\s|$)/);
  const body = section?.[1] ?? markdown;
  const re = /第\s*(\d+)\s*集/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(body))) {
    set.add(Number(match[1]));
  }
  return set;
}

function parseHighlightEpisodes(markdown: string): Map<number, string> {
  const map = new Map<number, string>();
  const section = markdown.match(/##\s*二、爽点地图([\s\S]*?)(?:\n##\s|$)/);
  const body = section?.[1] ?? markdown;
  const lines = body.split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/第\s*(\d+)\s*集\s*[·•\-]\s*[「"]?([^·」"]+)/);
    if (!match) continue;
    map.set(Number(match[1]), match[2].trim());
  }
  return map;
}

function buildFallbackCurve(markdown: string): PlanCurvePoint[] {
  const stageLines = extractStageSection(markdown);
  const paywalls = parsePaywallEpisodes(markdown);
  const highlights = parseHighlightEpisodes(markdown);
  const points = new Map<number, PlanCurvePoint>();

  for (const line of stageLines) {
    const cells = splitMarkdownRow(line);
    if (cells.length < 4 || /阶段/.test(cells[0])) continue;
    const range = parseRange(cells[1]);
    if (!range) continue;
    const [from, to] = range;
    const intensity = countStars(cells[2]);
    for (let episode = from; episode <= to; episode += 1) {
      const isPaywall = paywalls.has(episode);
      const highlight = highlights.has(episode);
      points.set(episode, {
        episode,
        intensity,
        payoff: clamp(intensity + (highlight ? 1 : 0), 1, 5),
        hook: clamp(intensity + (isPaywall ? 1 : 0), 1, 5),
        paywall: isPaywall,
        note: highlights.get(episode) ?? (isPaywall ? "付费卡点" : cells[3] ?? ""),
      });
    }
  }

  return [...points.values()].sort((a, b) => a.episode - b.episode);
}

export function extractPlanCurve(markdown: string): PlanCurvePoint[] {
  const explicit = parseCurveTable(markdown);
  if (explicit.length > 0) return explicit;
  return buildFallbackCurve(markdown);
}
