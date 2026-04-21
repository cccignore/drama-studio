"use client";
import { Badge } from "@/components/ui/badge";
import { PatchPreview, type PatchData } from "./patch-preview";

export interface ConversationItem {
  id: number;
  role: "user" | "assistant" | "system";
  content: string;
  patch?: unknown;
  appliedVersion?: number | null;
  ts: number;
}

export function ConversationList({ items }: { items: ConversationItem[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-6 text-center text-sm text-[color:var(--color-muted)]">
        暂无改写对话
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div
          key={item.id}
          className={
            item.role === "user"
              ? "ml-8 rounded-md bg-[color:var(--color-primary)]/15 p-3 text-sm"
              : "mr-8 rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 text-sm"
          }
        >
          <div className="mb-1 flex items-center justify-between gap-2 text-xs text-[color:var(--color-muted)]">
            <span>{item.role === "user" ? "你" : "AI 编修"}</span>
            {item.appliedVersion ? <Badge tone="success">v{item.appliedVersion}</Badge> : null}
          </div>
          <div className="whitespace-pre-wrap break-words leading-relaxed">{item.content}</div>
          {item.patch && typeof item.patch === "object" ? (
            <div className="mt-2">
              <PatchPreview patch={item.patch as PatchData} />
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
