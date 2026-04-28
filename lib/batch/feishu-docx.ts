// Build a simple .docx from a batch item's screenplayMd / storyboardMd.
//
// Unlike lib/drama/export/docx.ts (which parses each episode into a structured
// AST), batch items store the whole 30-episode block as one big markdown
// string. For the feishu attachment use case we just want the full content
// browsable inside Word — so we render line-by-line, with light heading
// recognition so the document still has navigable structure.

import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";

function heading(text: string, level: (typeof HeadingLevel)[keyof typeof HeadingLevel]): Paragraph {
  return new Paragraph({
    heading: level,
    spacing: { before: 200, after: 120 },
    children: [new TextRun({ text, bold: true })],
  });
}

function plain(text: string): Paragraph {
  return new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text })] });
}

function blank(): Paragraph {
  return new Paragraph({ children: [] });
}

function renderMarkdown(md: string): Paragraph[] {
  const out: Paragraph[] = [];
  const lines = md.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    if (!line.trim()) {
      out.push(blank());
      continue;
    }
    // 第 N 集 / 第 N 集 标题
    if (/^第\s*\d+\s*集/.test(line)) {
      out.push(heading(line.replace(/^#+\s*/, ""), HeadingLevel.HEADING_1));
      continue;
    }
    // 子场次 N-M
    if (/^\d+-\d+\b/.test(line)) {
      out.push(heading(line, HeadingLevel.HEADING_2));
      continue;
    }
    // ATX-style markdown headings as a fallback
    const atx = line.match(/^(#{1,6})\s+(.+)$/);
    if (atx) {
      const depth = atx[1].length;
      const lvl =
        depth <= 1
          ? HeadingLevel.HEADING_1
          : depth === 2
            ? HeadingLevel.HEADING_2
            : depth === 3
              ? HeadingLevel.HEADING_3
              : HeadingLevel.HEADING_4;
      out.push(heading(atx[2], lvl));
      continue;
    }
    out.push(plain(line));
  }
  return out;
}

export async function buildBatchArtifactDocx(opts: {
  title: string;
  subtitle: string;
  body: string;
}): Promise<Uint8Array> {
  const head: Paragraph[] = [
    new Paragraph({
      heading: HeadingLevel.TITLE,
      children: [new TextRun({ text: opts.title, bold: true, size: 36 })],
    }),
    new Paragraph({ children: [new TextRun({ text: opts.subtitle, italics: true, color: "666666" })] }),
    blank(),
  ];
  const doc = new Document({
    creator: "drama-studio",
    title: opts.title,
    sections: [{ children: [...head, ...renderMarkdown(opts.body)] }],
  });
  const buf = await Packer.toBuffer(doc);
  return new Uint8Array(buf);
}
