import type { BatchItem } from "./types";

const HEADERS = [
  "id",
  "source_title",
  "source_keywords",
  "source_summary",
  "target_title",
  "one_liner",
  "idea_selected",
  "creative_selected",
  "screenplay_selected",
  "status",
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
    item.sourceKeywords,
    item.sourceSummary,
    item.title,
    item.oneLiner,
    item.ideaSelected ? "1" : "0",
    item.creativeSelected ? "1" : "0",
    item.screenplaySelected ? "1" : "0",
    item.status,
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
  const index = (name: string) => header.indexOf(name);
  return rows.slice(1).map((row) => ({
    id: value(row, index("id")),
    sourceTitle: value(row, index("source_title")) || value(row, index("title")),
    sourceKeywords: value(row, index("source_keywords")),
    sourceSummary: value(row, index("source_summary")),
    title: value(row, index("target_title")) || value(row, index("title")),
    oneLiner: value(row, index("one_liner")),
    sourceText: value(row, index("source_text")),
    creativeMd: value(row, index("creative_md")),
    screenplayMd: value(row, index("screenplay_md")),
    storyboardMd: value(row, index("storyboard_md")),
    ideaSelected: boolValue(value(row, index("idea_selected")), true),
    creativeSelected: boolValue(value(row, index("creative_selected")), true),
    screenplaySelected: boolValue(value(row, index("screenplay_selected")), true),
    status: value(row, index("status")) as BatchItem["status"],
  }));
}

function value(row: string[], idx: number): string {
  return idx >= 0 ? row[idx] ?? "" : "";
}

function boolValue(input: string, fallback: boolean): boolean {
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
