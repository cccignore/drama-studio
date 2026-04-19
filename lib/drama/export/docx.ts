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
import { parseScreenplay, type ScreenplayAST } from "../parsers/screenplay";
import type { ReviewResult } from "../parsers/extract-review-json";
import { extractReviewJson } from "../parsers/extract-review-json";

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

function renderReview(review: ReviewResult, episodeIndex: number): Paragraph[] {
  const out: Paragraph[] = [];
  out.push(h(`第 ${episodeIndex} 集 · 复盘`, HeadingLevel.HEADING_2));
  const s = review.scores;
  out.push(
    p(
      `评分：节奏 ${s.pace} / 爽点 ${s.satisfy} / 台词 ${s.dialogue} / 格式 ${s.format} / 一致性 ${s.coherence}`
    )
  );
  out.push(p(`总评：${review.summary}`));
  if (review.issues.length) {
    out.push(h("问题清单", HeadingLevel.HEADING_3));
    for (const issue of review.issues) {
      const levelLabel = issue.level === "danger" ? "⚠" : issue.level === "warn" ? "!" : "i";
      out.push(
        p(
          `[${levelLabel}] 场${issue.scene ?? "-"} · ${issue.desc}`,
          { bold: issue.level === "danger" }
        )
      );
      out.push(p(`改写建议：${issue.fix}`, { indent: 300 }));
    }
  }
  return out;
}

export async function buildProjectDocx(bundle: ExportBundle): Promise<Uint8Array> {
  const { project, outline, episodes, reviews } = bundle;
  const state = project.state;

  const body: Paragraph[] = [];
  body.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
      children: [new TextRun({ text: project.title || state.dramaTitle || "未命名短剧", bold: true, size: 40 })],
    })
  );
  body.push(
    p(
      `题材 ${state.genre.join("/") || "-"} · 受众 ${state.audience ?? "-"} · 基调 ${state.tone ?? "-"} · 结局 ${state.ending ?? "-"} · 总集数 ${state.totalEpisodes}`,
      { italic: true }
    )
  );
  body.push(p(`导出时间 ${new Date().toLocaleString("zh-CN")}`, { italic: true }));

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

  const reviewByIdx = new Map<number, ReviewResult>();
  for (const r of reviews) {
    const parsed = extractReviewJson(r.artifact.content);
    if (parsed.ok) reviewByIdx.set(r.index, parsed.data);
  }

  for (const { index, artifact } of episodes) {
    body.push(new Paragraph({ children: [new PageBreak()] }));
    const ast = parseScreenplay(artifact.content);
    body.push(...renderScreenplayAst(ast, index));
    const rv = reviewByIdx.get(index);
    if (rv) body.push(...renderReview(rv, index));
  }

  const doc = new Document({
    creator: "drama-studio",
    title: project.title || state.dramaTitle || "drama",
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
  }
  const rv = bundle.reviews.find((r) => r.index === episodeIndex);
  if (rv) {
    const parsed = extractReviewJson(rv.artifact.content);
    if (parsed.ok) body.push(...renderReview(parsed.data, episodeIndex));
  }
  const doc = new Document({ creator: "drama-studio", sections: [{ children: body }] });
  const buf = await Packer.toBuffer(doc);
  return new Uint8Array(buf);
}
