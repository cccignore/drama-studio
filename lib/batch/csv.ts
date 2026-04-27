import type { BatchItem } from "./types";

// New canonical CSV schema. Each row = one creative.
// Order is chosen so that the most useful columns are leftmost in spreadsheets.
const HEADERS = [
  "id",
  "source_title",
  "source_summary",
  "target_title",
  "audience",
  "narrative_pov",
  "story_type",
  "setting",
  "protagonist",
  "act1",
  "act2",
  "act3",
  "one_liner",
  "status",
  "error",
  "source_keywords",
  "source_text",
  "creative_md",
  "screenplay_md",
  "storyboard_md",
];

export function itemsToCsv(items: BatchItem[]): string {
  const rows = [HEADERS, ...items.map(itemToRow)];
  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}

function itemToRow(item: BatchItem): string[] {
  return [
    item.id,
    item.sourceTitle,
    item.sourceSummary,
    item.title,
    item.audience,
    item.narrativePov,
    item.storyType,
    item.setting,
    item.protagonist,
    item.act1,
    item.act2,
    item.act3,
    item.oneLiner,
    item.status,
    item.error,
    item.sourceKeywords,
    item.sourceText,
    item.creativeMd,
    item.screenplayMd,
    item.storyboardMd,
  ];
}

function csvCell(value: string): string {
  const text = value ?? "";
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

export function csvToItems(csv: string): Array<Partial<BatchItem> & { id?: string }> {
  const rows = parseCsv(csv).filter((row) => row.some((cell) => cell.trim()));
  if (rows.length === 0) return [];
  const header = rows[0].map((cell) => cell.trim());
  const index = (...names: string[]): number => {
    for (const name of names) {
      const idx = header.indexOf(name);
      if (idx >= 0) return idx;
    }
    return -1;
  };
  return rows.slice(1).map((row) => {
    const result: Partial<BatchItem> & { id?: string } = {
      id: value(row, index("id")),
      sourceTitle: value(row, index("source_title"), index("title")),
      sourceKeywords: value(row, index("source_keywords")),
      sourceSummary: value(row, index("source_summary")),
      title: value(row, index("target_title"), index("title")),
      oneLiner: value(row, index("one_liner")),
      sourceText: value(row, index("source_text")),
      protagonist: value(row, index("protagonist")),
      narrativePov: value(row, index("narrative_pov")),
      audience: value(row, index("audience")),
      storyType: value(row, index("story_type")),
      setting: value(row, index("setting"), index("setting_text")),
      act1: value(row, index("act1")),
      act2: value(row, index("act2")),
      act3: value(row, index("act3")),
      creativeMd: value(row, index("creative_md")),
      screenplayMd: value(row, index("screenplay_md")),
      storyboardMd: value(row, index("storyboard_md")),
      error: value(row, index("error")),
    };
    const status = value(row, index("status"));
    if (status) result.status = status as BatchItem["status"];

    // Backward-compat: tolerate the old *_selected columns. They no longer
    // drive the workflow (CSV-is-truth replaces selection), but if present we
    // honor them so legacy CSVs round-trip cleanly.
    const ideaSel = value(row, index("idea_selected"));
    const creativeSel = value(row, index("creative_selected"));
    const screenplaySel = value(row, index("screenplay_selected"));
    if (ideaSel) result.ideaSelected = parseBool(ideaSel, true);
    if (creativeSel) result.creativeSelected = parseBool(creativeSel, true);
    if (screenplaySel) result.screenplaySelected = parseBool(screenplaySel, true);

    return result;
  });
}

function value(row: string[], ...indices: number[]): string {
  for (const idx of indices) {
    if (idx >= 0) {
      const v = row[idx];
      if (v != null && v !== "") return v;
    }
  }
  return "";
}

function parseBool(input: string, fallback: boolean): boolean {
  if (!input) return fallback;
  return /^(1|true|yes|y|入选|selected)$/i.test(input.trim());
}

function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    const next = input[i + 1];
    if (quoted) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (ch !== "\r") {
      cell += ch;
    }
  }
  row.push(cell);
  rows.push(row);
  return rows;
}
