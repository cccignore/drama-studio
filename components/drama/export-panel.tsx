"use client";
import * as React from "react";
import { Download, FileArchive, FileCode2, FileText } from "lucide-react";
import { toast } from "sonner";

interface Props {
  projectId: string;
  projectTitle: string;
  episodes: number[];
}

type Format = "md" | "docx" | "zip";

const FORMATS: { value: Format; label: string; icon: typeof FileText }[] = [
  { value: "md", label: "Markdown (.md)", icon: FileCode2 },
  { value: "docx", label: "Word (.docx)", icon: FileText },
  { value: "zip", label: "完整工程 (.zip)", icon: FileArchive },
];

export function ExportPanel({ projectId, projectTitle, episodes }: Props) {
  const [busy, setBusy] = React.useState<Format | null>(null);
  const [episode, setEpisode] = React.useState<"all" | number>("all");

  async function download(format: Format) {
    setBusy(format);
    try {
      const params = new URLSearchParams({ format });
      if (episode !== "all") params.set("episode", String(episode));
      const url = `/api/projects/${projectId}/export?${params.toString()}`;
      const res = await fetch(url);
      if (!res.ok) {
        let msg = "导出失败";
        try {
          const j = await res.json();
          msg = j?.error?.message || msg;
        } catch {}
        throw new Error(msg);
      }
      const blob = await res.blob();
      const dispo = res.headers.get("content-disposition") || "";
      const nameMatch = dispo.match(/filename\*=UTF-8''([^;]+)/i);
      const fallback = `${projectTitle || "drama"}.${format}`;
      const filename = nameMatch ? decodeURIComponent(nameMatch[1]) : fallback;
      const a = document.createElement("a");
      const href = URL.createObjectURL(blob);
      a.href = href;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(href);
      toast.success(`已下载 ${filename}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="panel-2 space-y-4 p-5">
      <div>
        <h3 className="text-sm font-semibold text-[color:var(--color-foreground)]">
          导出设置
        </h3>
        <p className="mt-1 text-xs text-[color:var(--color-foreground)]/60">
          选择导出范围与格式。Markdown 纯文本便于继续改写；Word 保留剧本排版；Zip 打包全部素材（含 Word）。
        </p>
      </div>

      <div className="space-y-2">
        <label className="text-xs text-[color:var(--color-foreground)]/70">导出范围</label>
        <select
          value={episode === "all" ? "all" : String(episode)}
          onChange={(e) => setEpisode(e.target.value === "all" ? "all" : Number(e.target.value))}
          className="w-full rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-background-2)] px-2 py-1.5 text-sm outline-none focus:border-[color:var(--color-primary)]"
        >
          <option value="all">全部（{episodes.length} 集）</option>
          {episodes.map((ep) => (
            <option key={ep} value={ep}>
              仅第 {ep} 集
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        {FORMATS.map(({ value, label, icon: Icon }) => {
          const disabled = busy !== null || (value === "zip" && episode !== "all");
          return (
            <button
              key={value}
              type="button"
              disabled={disabled}
              onClick={() => download(value)}
              className="btn flex items-center justify-center gap-2 rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-background-2)] px-3 py-2 text-sm text-[color:var(--color-foreground)] transition hover:border-[color:var(--color-primary)]/60 disabled:cursor-not-allowed disabled:opacity-50"
              title={value === "zip" && episode !== "all" ? "Zip 仅支持全量导出" : label}
            >
              {busy === value ? (
                <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                <Icon className="h-4 w-4" />
              )}
              <span>{label}</span>
              <Download className="h-3 w-3 opacity-60" />
            </button>
          );
        })}
      </div>
    </section>
  );
}
