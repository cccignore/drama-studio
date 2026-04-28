// Build a simple .docx from a batch item's screenplayMd / storyboardMd.
//
// Unlike lib/drama/export/docx.ts (which parses each episode into a structured
// AST), batch items store the whole 30-episode block as one big markdown
// string. For the feishu attachment use case we just want the full content
// browsable inside Word — so we render line-by-line, with light heading
// recognition so the document still has navigable structure.
//
// Storyboard takes a separate path (buildStoryboardDocx) that walks GFM
// markdown tables and emits real Word tables, because each episode block is
// shaped exactly like the 7-column shot list defined in lib/batch/prompts.ts.

import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";

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

// ---------- Storyboard rendering ----------
// Storyboard input is GFM Markdown. Each episode looks like:
//   ### 第 N 集分镜（约 64 s）
//   | 镜头号 | 逐秒分镜画面描述 | ... | 时长 |
//   | --- | --- | ... | --- |
//   | 1 | 0:00-0:04 ... | ... | 4 |
//   ...
// We walk lines, accumulate consecutive `| ... |` lines into a table block,
// emit Word tables for them, and fall back to paragraph rendering for
// everything else (titles, blank lines, etc.).

interface StoryboardCellRun {
  text: string;
  break?: boolean;
}

function parseCellRuns(cell: string): StoryboardCellRun[] {
  // Storyboard tables encode multi-line content as `<br>` (the prompt asks
  // for it explicitly). Split on it and surface as line breaks inside the
  // Word cell.
  const parts = cell.split(/<br\s*\/?>/i);
  const runs: StoryboardCellRun[] = [];
  parts.forEach((part, idx) => {
    if (idx > 0) runs.push({ text: "", break: true });
    runs.push({ text: part.trim() });
  });
  return runs;
}

function cellParagraph(cell: string, opts: { bold?: boolean } = {}): Paragraph {
  const runs = parseCellRuns(cell);
  const children: TextRun[] = [];
  for (const run of runs) {
    if (run.break) {
      children.push(new TextRun({ text: "", break: 1 }));
    } else if (run.text) {
      children.push(new TextRun({ text: run.text, bold: opts.bold }));
    }
  }
  if (!children.length) children.push(new TextRun({ text: "", bold: opts.bold }));
  return new Paragraph({ spacing: { before: 20, after: 20 }, children });
}

function makeCell(content: string, opts: { header?: boolean; widthPct?: number } = {}): TableCell {
  return new TableCell({
    width: opts.widthPct
      ? { size: opts.widthPct, type: WidthType.PERCENTAGE }
      : undefined,
    shading: opts.header
      ? { type: ShadingType.CLEAR, color: "auto", fill: "F2F2F2" }
      : undefined,
    children: [cellParagraph(content, { bold: opts.header })],
  });
}

const TABLE_LINE_RE = /^\s*\|.*\|\s*$/;
const SEPARATOR_LINE_RE = /^\s*\|?\s*:?-{3,}:?(\s*\|\s*:?-{3,}:?)*\s*\|?\s*$/;

function splitRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((c) => c.trim());
}

// Storyboard prompt fixes the column ordering. We give画面描述 / 台词 the
// most width since they hold the most text.
const COLUMN_WIDTH_PCT = [6, 28, 24, 12, 12, 12, 6];

function buildStoryboardTable(rows: string[][]): Table {
  const [header, ...body] = rows;
  const colCount = header.length;
  const widths =
    colCount === COLUMN_WIDTH_PCT.length
      ? COLUMN_WIDTH_PCT
      : new Array(colCount).fill(Math.floor(100 / colCount));
  const tableRows: TableRow[] = [];
  tableRows.push(
    new TableRow({
      tableHeader: true,
      children: header.map((c, i) => makeCell(c, { header: true, widthPct: widths[i] })),
    })
  );
  for (const cells of body) {
    // Ragged rows happen when the model misses a `|`. Pad with blanks so the
    // Word table doesn't crash; downstream readers will still see the data.
    const padded = cells.length === colCount ? cells : [...cells, ...new Array(Math.max(0, colCount - cells.length)).fill("")];
    tableRows.push(
      new TableRow({
        children: padded.slice(0, colCount).map((c, i) => makeCell(c, { widthPct: widths[i] })),
      })
    );
  }
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: tableRows,
  });
}

type Block = { kind: "para"; paragraph: Paragraph } | { kind: "table"; table: Table };

function renderStoryboardMarkdown(md: string): Block[] {
  const lines = md.split(/\r?\n/);
  const blocks: Block[] = [];
  let buffer: string[][] = [];

  const flushTable = () => {
    if (!buffer.length) return;
    // A valid table needs ≥ 1 header row + ≥ 1 body row. Otherwise drop the
    // markdown back to plain paragraphs so we don't lose content.
    if (buffer.length >= 2) {
      blocks.push({ kind: "table", table: buildStoryboardTable(buffer) });
    } else {
      for (const row of buffer) {
        blocks.push({
          kind: "para",
          paragraph: new Paragraph({ children: [new TextRun({ text: `| ${row.join(" | ")} |` })] }),
        });
      }
    }
    buffer = [];
  };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    if (TABLE_LINE_RE.test(line)) {
      if (SEPARATOR_LINE_RE.test(line)) continue; // skip the `| --- |` divider
      buffer.push(splitRow(line));
      continue;
    }
    flushTable();
    if (!line.trim()) {
      blocks.push({ kind: "para", paragraph: blank() });
      continue;
    }
    if (/^第\s*\d+\s*集/.test(line)) {
      blocks.push({ kind: "para", paragraph: heading(line.replace(/^#+\s*/, ""), HeadingLevel.HEADING_1) });
      continue;
    }
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
      blocks.push({ kind: "para", paragraph: heading(atx[2], lvl) });
      continue;
    }
    blocks.push({ kind: "para", paragraph: plain(line) });
  }
  flushTable();
  return blocks;
}

export async function buildStoryboardDocx(opts: {
  title: string;
  subtitle: string;
  body: string;
}): Promise<Uint8Array> {
  const head: Array<Paragraph | Table> = [
    new Paragraph({
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.LEFT,
      children: [new TextRun({ text: opts.title, bold: true, size: 36 })],
    }),
    new Paragraph({ children: [new TextRun({ text: opts.subtitle, italics: true, color: "666666" })] }),
    blank(),
  ];
  const blocks = renderStoryboardMarkdown(opts.body);
  const body: Array<Paragraph | Table> = blocks.map((b) => (b.kind === "table" ? b.table : b.paragraph));
  // Word doesn't allow a Table at the very end of a section without a
  // trailing paragraph, otherwise the cursor lands inside the last cell.
  if (body.length && body[body.length - 1] instanceof Table) body.push(blank());

  const doc = new Document({
    creator: "drama-studio",
    title: opts.title,
    sections: [{ children: [...head, ...body] }],
  });
  const buf = await Packer.toBuffer(doc);
  return new Uint8Array(buf);
}
