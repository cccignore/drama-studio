"use client";
import * as React from "react";
import { MessageSquareText, PencilLine, Send, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useRevise } from "@/hooks/use-revise";
import { ConversationList, type ConversationItem } from "./conversation-list";
import { HistoryList, type ArtifactHistoryItem } from "./history-list";
import { ManualEditor } from "./manual-editor";
import { PatchPreview, type PatchData } from "./patch-preview";

type Tab = "chat" | "manual" | "history";

const SUGGESTIONS = ["台词再狠一点", "补一个强动作", "这段砍掉三分之一", "结尾钩子再强"];

async function api<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const json = await res.json();
  if (!res.ok || json.success === false) {
    throw new Error(json?.error?.message ?? `请求失败：${res.status}`);
  }
  return json.data as T;
}

export function ReviseDrawer({
  projectId,
  artifactName,
  disabled,
  onUpdated,
}: {
  projectId: string;
  artifactName: string;
  disabled?: boolean;
  onUpdated?: () => void | Promise<void>;
}) {
  const [open, setOpen] = React.useState(false);
  const [tab, setTab] = React.useState<Tab>("chat");
  const [content, setContent] = React.useState("");
  const [conversation, setConversation] = React.useState<ConversationItem[]>([]);
  const [history, setHistory] = React.useState<ArtifactHistoryItem[]>([]);
  const [instruction, setInstruction] = React.useState("");

  const refresh = React.useCallback(async () => {
    if (!artifactName) return;
    const [artifact, turns, versions] = await Promise.all([
      api<{ item: { content: string } }>(`/api/projects/${projectId}/artifacts/${artifactName}`),
      api<{ items: ConversationItem[] }>(`/api/projects/${projectId}/artifacts/${artifactName}/conversations`),
      api<{ items: ArtifactHistoryItem[] }>(`/api/projects/${projectId}/artifacts/${artifactName}/history`),
    ]);
    setContent(artifact.item.content);
    setConversation(turns.items);
    setHistory(versions.items);
  }, [artifactName, projectId]);

  React.useEffect(() => {
    if (open) {
      void refresh().catch(() => {});
    }
  }, [open, refresh]);

  const afterUpdate = React.useCallback(async () => {
    await refresh().catch(() => {});
    await onUpdated?.();
  }, [onUpdated, refresh]);

  const revise = useRevise({
    projectId,
    artifactName,
    onApplied: afterUpdate,
  });

  const latestPatch = [...revise.events].reverse().find((event) => event.type === "patch")?.patch;
  const busy = disabled || revise.running;

  const send = (mode: "patch" | "rewrite" = "patch") => {
    const text = instruction.trim();
    if (!text) return;
    setConversation((prev) => [
      ...prev,
      {
        id: Date.now(),
        role: "user",
        content: text,
        patch: null,
        appliedVersion: null,
        ts: Date.now(),
      },
    ]);
    setInstruction("");
    void revise.run(text, mode);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary" disabled={disabled || !artifactName}>
          <PencilLine className="h-4 w-4" />
          编辑
        </Button>
      </DialogTrigger>
      <DialogContent className="left-auto right-0 top-0 h-screen max-h-screen w-[min(460px,100vw)] max-w-none translate-x-0 translate-y-0 rounded-none p-0">
        <div className="flex h-full min-h-0 flex-col">
          <DialogHeader className="border-b border-[color:var(--color-border)] p-4 pr-12">
            <DialogTitle className="flex items-center gap-2">
              <MessageSquareText className="h-4 w-4 text-[color:var(--color-primary)]" />
              Step 编辑
            </DialogTitle>
            <DialogDescription>
              {artifactName} · AI 对话式改写 / 手动编辑 / 版本历史
            </DialogDescription>
          </DialogHeader>

          <div className="flex border-b border-[color:var(--color-border)] p-2 text-xs">
            {[
              ["chat", "对话"],
              ["manual", "手动编辑"],
              ["history", "历史"],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id as Tab)}
                className={
                  tab === id
                    ? "rounded bg-[color:var(--color-primary)]/20 px-3 py-1.5 text-[color:var(--color-primary)]"
                    : "rounded px-3 py-1.5 text-[color:var(--color-muted)] hover:bg-[color:var(--color-surface-2)]"
                }
              >
                {label}
              </button>
            ))}
          </div>

          {disabled && (
            <div className="border-b border-[color:var(--color-warning)]/30 bg-[color:var(--color-warning)]/10 px-4 py-2 text-xs text-[color:var(--color-warning)]">
              当前 step 正在生成，请稍候再编辑。
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {tab === "chat" && (
              <div className="space-y-4">
                <ConversationList items={conversation} />
                {latestPatch && typeof latestPatch === "object" ? (
                  <PatchPreview patch={latestPatch as PatchData} />
                ) : null}
                {revise.partial && (
                  <pre className="max-h-52 overflow-auto whitespace-pre-wrap break-words rounded-md bg-[color:var(--color-surface-2)] p-3 text-xs text-[color:var(--color-muted)]">
                    {revise.partial}
                  </pre>
                )}
                {revise.error && (
                  <div className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-200">
                    {revise.error}
                  </div>
                )}
              </div>
            )}
            {tab === "manual" && (
              <ManualEditor
                projectId={projectId}
                artifactName={artifactName}
                content={content}
                disabled={busy}
                onSaved={afterUpdate}
              />
            )}
            {tab === "history" && (
              <HistoryList
                projectId={projectId}
                artifactName={artifactName}
                items={history}
                disabled={busy}
                onReverted={afterUpdate}
              />
            )}
          </div>

          {tab === "chat" && (
            <div className="border-t border-[color:var(--color-border)] p-4">
              <div className="mb-2 flex flex-wrap gap-1.5">
                {SUGGESTIONS.map((item) => (
                  <button
                    key={item}
                    type="button"
                    disabled={busy}
                    onClick={() => setInstruction(item)}
                    className="rounded-full border border-[color:var(--color-border)] px-2.5 py-1 text-[11px] text-[color:var(--color-muted)] hover:border-[color:var(--color-primary)]/50"
                  >
                    {item}
                  </button>
                ))}
              </div>
              <Textarea
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                disabled={busy}
                placeholder="例如：第 2 场男二的台词太软，加一个摔杯子的动作"
                rows={3}
              />
              <div className="mt-2 flex items-center justify-end gap-2">
                {revise.running ? (
                  <Button variant="danger" onClick={revise.stop}>
                    <Square className="h-4 w-4" />
                    停止
                  </Button>
                ) : (
                  <>
                    <Button variant="secondary" disabled={busy || !instruction.trim()} onClick={() => send("rewrite")}>
                      整体重写
                    </Button>
                    <Button disabled={busy || !instruction.trim()} onClick={() => send("patch")}>
                      <Send className="h-4 w-4" />
                      发送
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
