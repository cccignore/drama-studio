"use client";
import * as React from "react";
import { parseScreenplay } from "@/lib/drama/parsers/screenplay";

interface Props {
  markdown: string;
  dense?: boolean;
}

export function ScreenplayRenderer({ markdown, dense }: Props) {
  const ast = React.useMemo(() => parseScreenplay(markdown), [markdown]);

  if (!ast.scenes.length) {
    return (
      <pre className="panel-2 whitespace-pre-wrap break-words p-4 text-sm leading-relaxed">
        {markdown || "（暂无内容）"}
      </pre>
    );
  }

  return (
    <article className={`space-y-${dense ? 3 : 5}`}>
      <header className="border-b border-[color:var(--color-border)] pb-2">
        {ast.episodeIndex !== null && (
          <div className="text-xs text-[color:var(--color-foreground)]/60">
            第 {ast.episodeIndex} 集
          </div>
        )}
        <h3 className="text-base font-semibold text-[color:var(--color-foreground)]">
          {ast.title || "（未命名）"}
        </h3>
      </header>
      {ast.scenes.map((scene) => (
        <section key={scene.index} className="space-y-2">
          <h4 className="text-sm font-semibold text-[color:var(--color-accent)]">
            场 {scene.index} · {scene.name}
            {(scene.location || scene.time) && (
              <span className="ml-2 text-xs font-normal text-[color:var(--color-foreground)]/55">
                （{[scene.location, scene.time].filter(Boolean).join(" / ")}）
              </span>
            )}
          </h4>
          <div className="space-y-1.5 text-[13.5px] leading-[1.7]">
            {scene.blocks.map((b, i) => {
              if (b.kind === "action") {
                return (
                  <p
                    key={i}
                    className="italic text-[color:var(--color-foreground)]/75"
                  >
                    <span className="mr-1 text-[color:var(--color-primary)]">△</span>
                    {b.camera ? (
                      <span className="mr-1 rounded bg-[color:var(--color-primary)]/15 px-1 text-[11px] text-[color:var(--color-primary)]">
                        {b.camera}
                      </span>
                    ) : null}
                    {b.text}
                  </p>
                );
              }
              if (b.kind === "music") {
                return (
                  <p
                    key={i}
                    className="italic text-[color:var(--color-foreground)]/55"
                  >
                    <span className="mr-1">♪</span>
                    {b.text}
                  </p>
                );
              }
              if (b.kind === "dialogue") {
                return (
                  <p key={i} className="pl-2">
                    <span className="font-semibold text-[color:var(--color-foreground)]">
                      {b.role}
                    </span>
                    {b.emotion && (
                      <span className="text-[12px] text-[color:var(--color-foreground)]/55">
                        （{b.emotion}）
                      </span>
                    )}
                    <span className="mx-1 text-[color:var(--color-foreground)]/55">
                      ：
                    </span>
                    <span>&ldquo;{b.line}&rdquo;</span>
                  </p>
                );
              }
              return (
                <p key={i} className="text-[color:var(--color-foreground)]/70">
                  {b.text}
                </p>
              );
            })}
          </div>
        </section>
      ))}
      {ast.closed && (
        <div className="pt-2 text-center text-xs font-semibold tracking-widest text-[color:var(--color-foreground)]/60">
          【本集完】
        </div>
      )}
    </article>
  );
}
