const SPECIAL = /[()（）/\\"'|{}\[\]]/;

function quoteIfNeeded(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  if (/^".*"$/.test(trimmed)) return trimmed;
  if (!SPECIAL.test(trimmed)) return trimmed;
  return `"${trimmed.replace(/"/g, "'")}"`;
}

export function sanitizeMermaid(code: string): string {
  if (!code) return code;
  let out = code;

  // Normalize arrows that the model sometimes breaks apart as `-- >` / `- . ->` / `== >`
  out = out
    .replace(/-\s*-\s*>/g, "-->")
    .replace(/-\s*\.\s*-\s*>/g, "-.->")
    .replace(/=\s*=\s*>/g, "==>");

  // |label| form on edges like -.->|label| or -->|label|
  out = out.replace(/([-=.]{2,3}>?)\|([^|\n]*)\|/g, (_m, arrow, label) => {
    return `${arrow}|${quoteIfNeeded(label)}|`;
  });

  // -- label --> / -. label .-> forms
  out = out.replace(
    /(--|-\.|==)\s+([^\n\-=>.][^\n\-=>.]*?)\s+(--|\.-|==)>/g,
    (_m, left, label, right) => {
      return `${left} ${quoteIfNeeded(label)} ${right}>`;
    }
  );

  return out;
}
