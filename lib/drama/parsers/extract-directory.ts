export interface EpisodeEntry {
  index: number;
  title: string;
  mainLine: string;
  hook: string;
  ending: string;
  tags: string[];
  hasHighlight: boolean;
  hasPaywall: boolean;
}

export interface ActSection {
  name: string;
  range: string;
  episodes: EpisodeEntry[];
}

export interface DirectoryExtract {
  acts: ActSection[];
  total: number;
}

const ACT_RE = /^##\s+([^（\n]+)\s*[（(]\s*第?\s*(\d+)\s*[-—]\s*(\d+)\s*集?\s*[)）]\s*$/;
const EP_RE = /^###\s+第?\s*(\d+)\s*集\s*[·•\-]\s*(.+?)\s*$/;
const BULLET_RE = /^[-*]\s*(?:\*\*)?([^:：*]+?)(?:\*\*)?[：:]\s*(.+?)\s*$/;

export function parseDirectory(markdown: string): DirectoryExtract {
  const lines = markdown.split(/\r?\n/);
  const acts: ActSection[] = [];
  let currentAct: ActSection | null = null;
  let currentEp: EpisodeEntry | null = null;

  const flushEp = () => {
    if (currentEp && currentAct) currentAct.episodes.push(currentEp);
    currentEp = null;
  };
  const flushAct = () => {
    flushEp();
    if (currentAct) acts.push(currentAct);
    currentAct = null;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const actM = line.match(ACT_RE);
    if (actM) {
      flushAct();
      currentAct = { name: actM[1].trim(), range: `${actM[2]}-${actM[3]}`, episodes: [] };
      continue;
    }
    const epM = line.match(EP_RE);
    if (epM) {
      flushEp();
      if (!currentAct) {
        currentAct = { name: "未分段", range: "", episodes: [] };
      }
      currentEp = {
        index: parseInt(epM[1], 10),
        title: epM[2].trim(),
        mainLine: "",
        hook: "",
        ending: "",
        tags: [],
        hasHighlight: false,
        hasPaywall: false,
      };
      continue;
    }
    if (currentEp) {
      const b = line.match(BULLET_RE);
      if (!b) continue;
      const key = b[1].replace(/\s/g, "");
      const val = b[2].trim();
      if (/本集线|主线|冲突/.test(key)) currentEp.mainLine = val;
      else if (/钩子|开篇|开场/.test(key)) currentEp.hook = val;
      else if (/结尾|落点|结束/.test(key)) currentEp.ending = val;
      else if (/标签|标记/.test(key)) {
        currentEp.tags = val
          .split(/[、,，/\s]+/)
          .map((s) => s.trim())
          .filter((s) => s && s !== "-" && s !== "—");
        if (val.includes("🔥")) currentEp.hasHighlight = true;
        if (val.includes("💰")) currentEp.hasPaywall = true;
      }
    }
  }
  flushAct();

  const total = acts.reduce((sum, a) => sum + a.episodes.length, 0);
  return { acts, total };
}
