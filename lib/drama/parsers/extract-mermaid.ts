export interface MermaidExtract {
  code: string | null;
  textWithoutBlock: string;
}

export function extractMermaid(markdown: string): MermaidExtract {
  const re = /```mermaid\s*\n([\s\S]*?)```/i;
  const m = markdown.match(re);
  if (!m) return { code: null, textWithoutBlock: markdown };
  return {
    code: m[1].trim(),
    textWithoutBlock: markdown.replace(re, "").trim(),
  };
}
