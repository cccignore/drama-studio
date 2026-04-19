"use client";
import * as React from "react";
import { cn } from "@/lib/utils";

export interface GenreOption {
  id: string;
  title: string;
  subtitle: string;
  audience: string;
  emoji: string;
  accent?: string;
}

export const GENRE_OPTIONS: GenreOption[] = [
  { id: "霸道总裁", title: "霸道总裁", subtitle: "冷面总裁遇不按常理出牌的她", audience: "女频 18-40", emoji: "💼" },
  { id: "战神归来", title: "战神归来", subtitle: "隐藏身份的强者重返都市", audience: "男频 25-45", emoji: "🗡️" },
  { id: "甜宠", title: "甜宠", subtitle: "从头甜到尾的高糖恋爱", audience: "女频 18-28", emoji: "🍬" },
  { id: "重生穿越", title: "重生穿越", subtitle: "带着记忆改写命运", audience: "全年龄", emoji: "🌀" },
  { id: "都市情感", title: "都市情感", subtitle: "都市男女的爱恨博弈", audience: "女频 20-35", emoji: "🌆" },
  { id: "古装宫廷", title: "古装宫廷", subtitle: "权谋博弈 · 帝王心术", audience: "女频 20-40", emoji: "👑" },
  { id: "家庭伦理", title: "家庭伦理", subtitle: "家长里短中的人性博弈", audience: "女频 30-50", emoji: "🏡" },
  { id: "萌宝", title: "萌宝", subtitle: "天才萌娃牵线姻缘", audience: "女频 25-40", emoji: "👶" },
  { id: "悬疑探案", title: "悬疑探案", subtitle: "层层迷雾追查真相", audience: "全年龄 22-40", emoji: "🔍" },
  { id: "励志逆袭", title: "励志逆袭", subtitle: "从底层走向巅峰", audience: "全年龄", emoji: "📈" },
  { id: "末日重生", title: "末日重生", subtitle: "末世降临 · 求生逆袭", audience: "男频 20-35", emoji: "☢️" },
  { id: "软科幻", title: "软科幻", subtitle: "轻设定下的冒险/情感", audience: "男频 20-35", emoji: "🛸" },
  { id: "喜剧", title: "喜剧", subtitle: "笑点密集的轻松故事", audience: "全年龄", emoji: "🎭" },
];

export function GenrePicker({
  value,
  onChange,
  max = 3,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  max?: number;
}) {
  const toggle = (id: string) => {
    if (value.includes(id)) onChange(value.filter((v) => v !== id));
    else if (value.length < max) onChange([...value, id]);
  };

  return (
    <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
      {GENRE_OPTIONS.map((g) => {
        const selected = value.includes(g.id);
        const order = value.indexOf(g.id);
        const full = !selected && value.length >= max;
        return (
          <button
            key={g.id}
            type="button"
            disabled={full}
            onClick={() => toggle(g.id)}
            className={cn(
              "group relative flex flex-col items-start gap-1 rounded-[var(--radius-md)] border p-3 text-left transition-all",
              selected
                ? "border-[color:var(--color-primary)] bg-[color:var(--color-primary)]/10 ring-1 ring-[color:var(--color-primary)]/50"
                : "border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] hover:border-[color:var(--color-border-strong)]",
              full && "cursor-not-allowed opacity-40"
            )}
          >
            {selected && (
              <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-[color:var(--color-primary)] text-[10px] font-semibold text-white">
                {order + 1}
              </span>
            )}
            <div className="flex items-center gap-2">
              <span className="text-xl">{g.emoji}</span>
              <span className="font-medium">{g.title}</span>
            </div>
            <div className="text-xs text-[color:var(--color-muted)]">{g.subtitle}</div>
            <div className="mt-0.5 text-[11px] text-[color:var(--color-muted)]/80">{g.audience}</div>
          </button>
        );
      })}
    </div>
  );
}
