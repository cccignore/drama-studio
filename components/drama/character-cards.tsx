"use client";
import * as React from "react";

export function CharacterCardsMarkdown({ markdown }: { markdown: string }) {
  const sections = React.useMemo(() => splitH3Sections(markdown), [markdown]);
  if (!sections.length) {
    return (
      <pre className="panel-2 whitespace-pre-wrap break-words p-4 text-sm leading-relaxed">
        {markdown}
      </pre>
    );
  }
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {sections.map((s, i) => (
        <article key={i} className="panel-2 p-4">
          <h4 className="mb-2 text-sm font-semibold text-[color:var(--color-foreground)]">
            {s.title}
          </h4>
          <div className="space-y-1 text-[13px] leading-[1.65] text-[color:var(--color-foreground)]/90">
            {s.bullets.map((b, j) => (
              <div key={j} className="flex gap-2">
                <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-[color:var(--color-primary)]" />
                <div>
                  {b.key && <span className="font-medium text-[color:var(--color-accent)]">{b.key}：</span>}
                  <span>{b.value}</span>
                </div>
              </div>
            ))}
          </div>
        </article>
      ))}
    </div>
  );
}

interface Section {
  title: string;
  bullets: { key?: string; value: string }[];
}

function splitH3Sections(md: string): Section[] {
  const stripped = md.replace(/```mermaid[\s\S]*?```/gi, "");
  const lines = stripped.split(/\r?\n/);
  const sections: Section[] = [];
  let cur: Section | null = null;
  for (const raw of lines) {
    const line = raw.trimEnd();
    const h3 = line.match(/^###\s+(.+?)\s*$/);
    if (h3) {
      if (cur) sections.push(cur);
      cur = { title: h3[1].replace(/\*\*/g, "").trim(), bullets: [] };
      continue;
    }
    if (!cur) continue;
    const b = line.match(/^[-*]\s+(.+?)\s*$/);
    if (!b) continue;
    const text = b[1].replace(/\*\*/g, "");
    const kv = text.match(/^([^：:]{1,20})[：:]\s*(.+)$/);
    if (kv) cur.bullets.push({ key: kv[1].trim(), value: kv[2].trim() });
    else cur.bullets.push({ value: text });
  }
  if (cur) sections.push(cur);
  return sections;
}
