"use client";
import * as React from "react";

export function MermaidGraph({ code }: { code: string }) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    if (!code) return;
    (async () => {
      try {
        const mod = await import("mermaid");
        const mermaid = mod.default;
        mermaid.initialize({
          startOnLoad: false,
          theme: "dark",
          themeVariables: {
            fontFamily: "inherit",
            primaryColor: "#2a2540",
            primaryTextColor: "#f3f4ff",
            lineColor: "#5b5f7b",
            edgeLabelBackground: "#16161f",
            tertiaryColor: "#1c1c28",
          },
        });
        const id = `m${Math.random().toString(36).slice(2, 9)}`;
        const { svg } = await mermaid.render(id, code);
        if (cancelled) return;
        if (ref.current) {
          ref.current.innerHTML = svg;
          setErr(null);
        }
      } catch (e) {
        if (!cancelled) setErr((e as Error).message || "mermaid 渲染失败");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code]);

  if (!code) return null;
  if (err) {
    return (
      <div className="panel-2 p-4 text-xs text-[color:var(--color-danger)]">
        人物关系图渲染失败：{err}
        <pre className="mt-2 max-h-[200px] overflow-auto whitespace-pre-wrap rounded bg-[color:var(--color-background)]/50 p-2 text-[color:var(--color-muted)]">
          {code}
        </pre>
      </div>
    );
  }
  return <div ref={ref} className="mermaid-container flex justify-center overflow-x-auto py-2" />;
}
