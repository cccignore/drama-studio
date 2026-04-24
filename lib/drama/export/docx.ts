import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  PageBreak,
  Paragraph,
  TextRun,
} from "docx";
import type { ExportBundle } from "./collect";
import type { ExportRange } from "./md";
import { parseScreenplay, type ScreenplayAST } from "../parsers/screenplay";
import { parseStoryboard, type StoryboardDoc } from "../parsers/storyboard";

function h(text: string, level: (typeof HeadingLevel)[keyof typeof HeadingLevel]): Paragraph {
  return new Paragraph({
    heading: level,
    spacing: { before: 200, after: 120 },
    children: [new TextRun({ text, bold: true })],
  });
}

function p(text: string, opts?: { italic?: boolean; bold?: boolean; indent?: number }): Paragraph {
  return new Paragraph({
    indent: opts?.indent ? { left: opts.indent } : undefined,
    spacing: { after: 80 },
    children: [
      new TextRun({ text, italics: opts?.italic, bold: opts?.bold }),
    ],
  });
}

function renderScreenplayAst(ast: ScreenplayAST, episodeIndex: number): Paragraph[] {
  const out: Paragraph[] = [];
  out.push(h(`第 ${episodeIndex} 集 · ${ast.title || ""}`.trim(), HeadingLevel.HEADING_1));
  for (const scene of ast.scenes) {
    const tail = [scene.location, scene.time].filter(Boolean).join(" / ");
    out.push(
      h(`场 ${scene.index} · ${scene.name}${tail ? `（${tail}）` : ""}`, HeadingLevel.HEADING_2)
    );
    for (const block of scene.blocks) {
      if (block.kind === "action") {
        const prefix = block.camera ? `（${block.camera}） ` : "";
        out.push(
          new Paragraph({
            spacing: { after: 60 },
            children: [new TextRun({ text: `△ ${prefix}${block.text}`, italics: true })],
          })
        );
      } else if (block.kind === "music") {
        out.push(
          new Paragraph({
            spacing: { after: 60 },
            children: [new TextRun({ text: `♪ ${block.text}`, italics: true, color: "888888" })],
          })
        );
      } else if (block.kind === "dialogue") {
        out.push(
          new Paragraph({
            indent: { left: 400 },
            spacing: { after: 40 },
            alignment: AlignmentType.LEFT,
            children: [
              new TextRun({ text: block.role, bold: true }),
              new TextRun({
                text: block.emotion ? `（${block.emotion}）` : "",
                italics: true,
                color: "555555",
              }),
              new TextRun({ text: `： "${block.line}"` }),
            ],
          })
        );
      } else {
        out.push(p(block.text));
      }
    }
  }
  if (ast.closed) out.push(p("【本集完】", { bold: true }));
  return out;
}

function renderStoryboard(doc: StoryboardDoc, episodeIndex: number): Paragraph[] {
  const out: Paragraph[] = [];
  out.push(h(`第 ${episodeIndex} 集 · 分镜脚本`, HeadingLevel.HEADING_2));
  if (doc.shots.length === 0) {
    out.push(p("（未解析到分镜镜头）", { italic: true }));
    return out;
  }
  let lastScene = -1;
  for (const shot of doc.shots) {
    if (shot.scene !== lastScene) {
      out.push(h(`场 ${shot.scene}`, HeadingLevel.HEADING_3));
      lastScene = shot.scene;
    }
    const meta = [
      shot.shotType,
      shot.camera,
      shot.durationSec != null ? `${shot.durationSec}s` : null,
    ]
      .filter(Boolean)
      .join(" · ");
    out.push(
      new Paragraph({
        spacing: { after: 40 },
        children: [
          new TextRun({ text: `#${shot.shotId} `, bold: true }),
          new TextRun({ text: meta, italics: true, color: "555555" }),
        ],
      })
    );
    if (shot.description) out.push(p(`画面：${shot.description}`, { indent: 300 }));
    if (shot.dialogueOrSfx && !/^(—|-|\s*)$/.test(shot.dialogueOrSfx)) {
      out.push(p(`台词/SFX：${shot.dialogueOrSfx}`, { indent: 300 }));
    }
    if (shot.note) out.push(p(`备注：${shot.note}`, { indent: 300, italic: true }));
  }
  return out;
}

function inRange(index: number, range: ExportRange = {}): boolean {
  return index >= (range.from ?? -Infinity) && index <= (range.to ?? Infinity);
}

function titlePage(bundle: ExportBundle, subtitle: string): Paragraph[] {
  const { project } = bundle;
  const state = project.state;
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
      children: [new TextRun({ text: project.title || state.dramaTitle || "未命名短剧", bold: true, size: 40 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [new TextRun({ text: subtitle, bold: true, size: 28 })],
    }),
    p(
      `题材 ${state.genre.join("/") || "-"} · 受众 ${state.audience ?? "-"} · 基调 ${state.tone ?? "-"} · 结局 ${state.ending ?? "-"} · 总集数 ${state.totalEpisodes}`,
      { italic: true }
    ),
    p(`导出时间 ${new Date().toLocaleString("zh-CN")}`, { italic: true }),
  ];
}

export async function buildScreenplayDocx(
  bundle: ExportBundle,
  range: ExportRange = {}
): Promise<Uint8Array> {
  const { project, episodes } = bundle;
  const body: Paragraph[] = [...titlePage(bundle, "完整剧本")];

  for (const { index, artifact } of episodes.filter((item) => inRange(item.index, range))) {
    body.push(new Paragraph({ children: [new PageBreak()] }));
    const ast = parseScreenplay(artifact.content);
    body.push(...renderScreenplayAst(ast, index));
  }

  const doc = new Document({
    creator: "drama-studio",
    title: `${project.title || project.state.dramaTitle || "drama"} 完整剧本`,
    sections: [{ children: body }],
  });
  const buf = await Packer.toBuffer(doc);
  return new Uint8Array(buf);
}

export async function buildStoryboardDocx(
  bundle: ExportBundle,
  range: ExportRange = {}
): Promise<Uint8Array> {
  const { project, storyboards } = bundle;
  const body: Paragraph[] = [...titlePage(bundle, "分镜脚本")];

  for (const { index, artifact } of storyboards.filter((item) => inRange(item.index, range))) {
    body.push(new Paragraph({ children: [new PageBreak()] }));
    body.push(...renderStoryboard(parseStoryboard(artifact.content), index));
  }

  const doc = new Document({
    creator: "drama-studio",
    title: `${project.title || project.state.dramaTitle || "drama"} 分镜脚本`,
    sections: [{ children: body }],
  });
  const buf = await Packer.toBuffer(doc);
  return new Uint8Array(buf);
}

export async function buildProjectDocx(bundle: ExportBundle): Promise<Uint8Array> {
  const { project, creative, outline } = bundle;

  const body: Paragraph[] = [...titlePage(bundle, "项目资料")];

  if (creative) {
    body.push(new Paragraph({ children: [new PageBreak()] }));
    body.push(h("三幕创意方案", HeadingLevel.HEADING_1));
    for (const line of creative.content.split(/\r?\n/)) {
      if (!line.trim()) continue;
      if (/^##\s+/.test(line)) body.push(h(line.replace(/^##\s+/, ""), HeadingLevel.HEADING_2));
      else if (/^###\s+/.test(line)) body.push(h(line.replace(/^###\s+/, ""), HeadingLevel.HEADING_3));
      else body.push(p(line));
    }
  }

  if (outline) {
    body.push(new Paragraph({ children: [new PageBreak()] }));
    body.push(h("分集目录", HeadingLevel.HEADING_1));
    for (const line of outline.content.split(/\r?\n/)) {
      if (!line.trim()) continue;
      if (line.startsWith("## ")) body.push(h(line.replace(/^##\s+/, ""), HeadingLevel.HEADING_2));
      else if (line.startsWith("### "))
        body.push(h(line.replace(/^###\s+/, ""), HeadingLevel.HEADING_3));
      else body.push(p(line));
    }
  }

  const doc = new Document({
    creator: "drama-studio",
    title: `${project.title || project.state.dramaTitle || "drama"} 项目资料`,
    sections: [{ children: body }],
  });
  const buf = await Packer.toBuffer(doc);
  return new Uint8Array(buf);
}

export async function buildEpisodeDocx(
  bundle: ExportBundle,
  episodeIndex: number
): Promise<Uint8Array> {
  const ep = bundle.episodes.find((e) => e.index === episodeIndex);
  const body: Paragraph[] = [];
  body.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: `${bundle.project.title || "未命名"} · 第 ${episodeIndex} 集`,
          bold: true,
          size: 32,
        }),
      ],
    })
  );
  if (ep) {
    const ast = parseScreenplay(ep.artifact.content);
    body.push(...renderScreenplayAst(ast, episodeIndex));
  } else {
    body.push(p("（尚未写成）", { italic: true }));
  }
  const doc = new Document({ creator: "drama-studio", sections: [{ children: body }] });
  const buf = await Packer.toBuffer(doc);
  return new Uint8Array(buf);
}

export async function buildEpisodeStoryboardDocx(
  bundle: ExportBundle,
  episodeIndex: number
): Promise<Uint8Array> {
  const sb = bundle.storyboards.find((s) => s.index === episodeIndex);
  const body: Paragraph[] = [];
  body.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: `${bundle.project.title || "未命名"} · 第 ${episodeIndex} 集 · 分镜脚本`,
          bold: true,
          size: 32,
        }),
      ],
    })
  );
  if (sb) {
    body.push(...renderStoryboard(parseStoryboard(sb.artifact.content), episodeIndex));
  } else {
    body.push(p("（尚未拆分镜）", { italic: true }));
  }
  const doc = new Document({ creator: "drama-studio", sections: [{ children: body }] });
  const buf = await Packer.toBuffer(doc);
  return new Uint8Array(buf);
}
