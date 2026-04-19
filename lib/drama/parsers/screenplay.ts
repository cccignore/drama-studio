export type ScreenplayBlock =
  | { kind: "action"; text: string; camera?: string }
  | { kind: "music"; text: string }
  | { kind: "dialogue"; role: string; emotion?: string; line: string }
  | { kind: "note"; text: string };

export interface ScreenplayScene {
  index: number;
  name: string;
  location?: string;
  time?: string;
  blocks: ScreenplayBlock[];
}

export interface ScreenplayAST {
  episodeIndex: number | null;
  title: string;
  scenes: ScreenplayScene[];
  closed: boolean;
  charCount: number;
}

const EP_RE = /^#\s+第?\s*(\d+)\s*集\s*[·•\-]\s*(.+?)\s*$/;
const SCENE_RE = /^##\s+场?\s*(\d+)\s*[·•\-]\s*(.+?)\s*$/;
const ACTION_RE = /^△\s*(.+?)\s*$/;
const MUSIC_RE = /^[♪♫🎵]\s*(?:音乐提示\s*[:：]\s*)?(.+?)\s*$/;
const DIALOGUE_RE = /^\*\*([^*\n]+?)\*\*\s*(?:[（(]([^）)]*)[）)])?\s*[：:]\s*(.+?)\s*$/;
const CAMERA_RE = /^[（(]([^）)]+?)[）)]\s*(.+)$/;

export function parseScreenplay(markdown: string): ScreenplayAST {
  const lines = markdown.split(/\r?\n/);
  const ast: ScreenplayAST = {
    episodeIndex: null,
    title: "",
    scenes: [],
    closed: false,
    charCount: markdown.length,
  };
  let currentScene: ScreenplayScene | null = null;

  const flushScene = () => {
    if (currentScene) ast.scenes.push(currentScene);
    currentScene = null;
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    if (line.includes("【本集完】")) {
      ast.closed = true;
      continue;
    }

    const epM = line.match(EP_RE);
    if (epM) {
      ast.episodeIndex = parseInt(epM[1], 10);
      ast.title = epM[2].trim();
      continue;
    }

    const sceneM = line.match(SCENE_RE);
    if (sceneM) {
      flushScene();
      const full = sceneM[2].trim();
      const locMatch = full.match(/^(.+?)\s*[（(]\s*(.+?)\s*[)）]\s*$/);
      currentScene = {
        index: parseInt(sceneM[1], 10),
        name: locMatch ? locMatch[1].trim() : full,
        location: locMatch ? locMatch[2].split(/[\/／]/)[0]?.trim() : undefined,
        time: locMatch ? locMatch[2].split(/[\/／]/)[1]?.trim() : undefined,
        blocks: [],
      };
      continue;
    }

    if (!currentScene) continue;

    const actionM = line.match(ACTION_RE);
    if (actionM) {
      const body = actionM[1];
      const camM = body.match(CAMERA_RE);
      if (camM) {
        currentScene.blocks.push({ kind: "action", text: camM[2].trim(), camera: camM[1].trim() });
      } else {
        currentScene.blocks.push({ kind: "action", text: body });
      }
      continue;
    }

    const musicM = line.match(MUSIC_RE);
    if (musicM) {
      currentScene.blocks.push({ kind: "music", text: musicM[1] });
      continue;
    }

    const dlgM = line.match(DIALOGUE_RE);
    if (dlgM) {
      const rawLine = dlgM[3].replace(/^["""「]|["""」]$/g, "").trim();
      currentScene.blocks.push({
        kind: "dialogue",
        role: dlgM[1].trim(),
        emotion: dlgM[2]?.trim() || undefined,
        line: rawLine,
      });
      continue;
    }

    currentScene.blocks.push({ kind: "note", text: line });
  }
  flushScene();

  return ast;
}

export interface ScreenplayStats {
  sceneCount: number;
  dialogueCount: number;
  actionCount: number;
  musicCount: number;
  longLines: number;
  avgSceneLen: number;
}

export function summarizeScreenplay(ast: ScreenplayAST): ScreenplayStats {
  let dialogue = 0;
  let action = 0;
  let music = 0;
  let longLines = 0;
  for (const s of ast.scenes) {
    for (const b of s.blocks) {
      if (b.kind === "dialogue") {
        dialogue += 1;
        if (b.line.length > 25) longLines += 1;
      } else if (b.kind === "action") action += 1;
      else if (b.kind === "music") music += 1;
    }
  }
  return {
    sceneCount: ast.scenes.length,
    dialogueCount: dialogue,
    actionCount: action,
    musicCount: music,
    longLines,
    avgSceneLen: ast.scenes.length
      ? Math.round((ast.charCount / ast.scenes.length) * 10) / 10
      : 0,
  };
}

export function extractEpisodeTail(screenplay: string, maxChars = 800): string {
  const trimmed = screenplay.trim();
  if (trimmed.length <= maxChars) return trimmed;
  return trimmed.slice(-maxChars);
}
