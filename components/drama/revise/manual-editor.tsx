"use client";
import * as React from "react";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";

export function ManualEditor({
  projectId,
  artifactName,
  content,
  disabled,
  onSaved,
}: {
  projectId: string;
  artifactName: string;
  content: string;
  disabled?: boolean;
  onSaved: () => void | Promise<void>;
}) {
  const [draft, setDraft] = React.useState(content);
  const [saving, setSaving] = React.useState(false);
  const baselineRef = React.useRef(content);

  React.useEffect(() => {
    setDraft(content);
    baselineRef.current = content;
  }, [artifactName]);

  React.useEffect(() => {
    setDraft((prev) => (prev === baselineRef.current ? content : prev));
    baselineRef.current = content;
  }, [content]);

  const dirty = draft !== content;

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/artifacts/${artifactName}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: draft }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || json?.success === false) {
        throw new Error(json?.error?.message ?? `保存失败：${res.status}`);
      }
      toast.success(`已保存手动编辑 · v${json?.data?.item?.version ?? ""}`);
      await onSaved();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <Textarea
        value={draft}
        disabled={disabled || saving}
        onChange={(e) => setDraft(e.target.value)}
        className="min-h-[420px] flex-1 resize-none font-mono text-xs leading-relaxed"
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-[color:var(--color-muted)]">
          {dirty ? "有未保存修改" : "当前内容已同步"}
        </span>
        <Button onClick={save} disabled={!dirty || disabled || saving}>
          <Save className="h-4 w-4" />
          保存为新版本
        </Button>
      </div>
    </div>
  );
}
