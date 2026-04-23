/**
 * 分镜脚本 Markdown 表格解析器。
 *
 * 设计目标：
 * - 把每条镜头解析成结构化对象，方便前端渲染和导出 CSV/Excel
 * - 容错：LLM 偶尔多/少一列时，按列名而不是列位置识别
 * - 汇总统计镜头数、总时长，作为 artifact meta
 */

export interface StoryboardShot {
  /** 镜号字符串，保留前导 0（001 / 012） */
  shotId: string;
  /** 所属场次编号 */
  scene: number;
  /** 景别（原始字符串，如 "特写(ECU)"） */
  shotType: string;
  /** 机位/运动 */
  camera: string;
  /** 画面描述 */
  description: string;
  /** 台词或 SFX 原始字符串 */
  dialogueOrSfx: string;
  /** 时长（秒），解析失败为 null */
  durationSec: number | null;
  /** 备注 */
  note?: string;
}

export interface StoryboardDoc {
  episodeIndex?: number;
  title?: string;
  shots: StoryboardShot[];
}

export interface StoryboardStats {
  shotCount: number;
  sceneCount: number;
  totalDurationSec: number;
  avgDurationSec: number;
  dialogueShots: number;
  silentShots: number;
}

const HEADER_ALIASES: Record<string, string[]> = {
  shotId: ["镜号", "镜头", "shot", "no", "#"],
  scene: ["场", "场次", "scene"],
  shotType: ["景别", "shot type", "shot-type"],
  camera: ["机位", "机位/运动", "运动", "camera"],
  description: ["画面", "画面描述", "description"],
  dialogueOrSfx: ["台词", "台词/sfx", "sfx", "对白", "dialogue"],
  durationSec: ["时长", "时长(s)", "时长（s）", "duration", "sec"],
  note: ["备注", "note", "notes", "remark"],
};

export function parseStoryboard(markdown: string): StoryboardDoc {
  const lines = markdown.split(/\r?\n/);
  const doc: StoryboardDoc = { shots: [] };

  // 抽剧集标题
  for (const l of lines) {
    const m = l.match(/^#\s+第\s*(\d+)\s*集\s*[·•\-]?\s*(.*)$/);
    if (m) {
      doc.episodeIndex = Number(m[1]);
      const title = m[2].replace(/·?\s*分镜脚本\s*$/u, "").trim();
      if (title) doc.title = title;
      break;
    }
  }

  // 找所有表格区块
  let currentScene = 0;
  let inTable = false;
  let headerCols: string[] = [];
  let colMap: Record<keyof StoryboardShot, number> = {
    shotId: -1,
    scene: -1,
    shotType: -1,
    camera: -1,
    description: -1,
    dialogueOrSfx: -1,
    durationSec: -1,
    note: -1,
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    const sceneMatch = line.match(/^##\s+场\s*(\d+)\s*[·•\-]/);
    if (sceneMatch) {
      currentScene = Number(sceneMatch[1]);
      inTable = false;
      continue;
    }

    if (!line.startsWith("|")) {
      inTable = false;
      continue;
    }

    const cells = splitRow(line);
    // 分隔行 |---|---|...
    if (cells.every((c) => /^:?-{2,}:?$/.test(c.trim()))) continue;

    if (!inTable) {
      headerCols = cells.map((c) => c.trim().toLowerCase());
      colMap = buildColMap(headerCols);
      inTable = true;
      continue;
    }

    const shot = rowToShot(cells, colMap, currentScene);
    if (shot) doc.shots.push(shot);
  }

  return doc;
}

export function summarizeStoryboard(doc: StoryboardDoc): StoryboardStats {
  const shotCount = doc.shots.length;
  const scenes = new Set(doc.shots.map((s) => s.scene));
  const totalDurationSec = doc.shots.reduce((acc, s) => acc + (s.durationSec ?? 0), 0);
  const dialogueShots = doc.shots.filter(
    (s) => s.dialogueOrSfx && !/^(—|-|—|\s*)$/.test(s.dialogueOrSfx) && !/^sfx[：:]/i.test(s.dialogueOrSfx)
  ).length;
  const silentShots = shotCount - dialogueShots;
  return {
    shotCount,
    sceneCount: scenes.size,
    totalDurationSec: Math.round(totalDurationSec * 10) / 10,
    avgDurationSec: shotCount ? Math.round((totalDurationSec / shotCount) * 10) / 10 : 0,
    dialogueShots,
    silentShots,
  };
}

// ---------- helpers ----------

function splitRow(line: string): string[] {
  // 去掉首尾的 |，中间按 | 切
  const trimmed = line.replace(/^\||\|$/g, "");
  return trimmed.split("|").map((c) => c.trim());
}

function buildColMap(headers: string[]): Record<keyof StoryboardShot, number> {
  const map: Record<keyof StoryboardShot, number> = {
    shotId: -1,
    scene: -1,
    shotType: -1,
    camera: -1,
    description: -1,
    dialogueOrSfx: -1,
    durationSec: -1,
    note: -1,
  };
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i];
    for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
      if (aliases.some((a) => h === a || h.includes(a))) {
        const k = key as keyof StoryboardShot;
        if (map[k] === -1) map[k] = i;
      }
    }
  }
  return map;
}

function rowToShot(
  cells: string[],
  map: Record<keyof StoryboardShot, number>,
  currentScene: number
): StoryboardShot | null {
  const pick = (k: keyof StoryboardShot): string => {
    const i = map[k];
    if (i < 0 || i >= cells.length) return "";
    return cells[i];
  };

  const shotIdRaw = pick("shotId");
  if (!shotIdRaw) return null;
  // 镜号得是数字或 001 这类；否则可能是个残留的 heading 行
  if (!/^\d+$/.test(shotIdRaw.replace(/^0+/, "") || "0") && !/^\d+$/.test(shotIdRaw)) {
    return null;
  }

  const sceneCell = pick("scene");
  const scene = Number(sceneCell) || currentScene || 0;

  const durCell = pick("durationSec").replace(/[sS秒]/g, "").trim();
  const duration = Number(durCell);

  return {
    shotId: shotIdRaw,
    scene,
    shotType: pick("shotType"),
    camera: pick("camera"),
    description: pick("description"),
    dialogueOrSfx: pick("dialogueOrSfx"),
    durationSec: Number.isFinite(duration) && duration > 0 ? duration : null,
    note: pick("note") || undefined,
  };
}
