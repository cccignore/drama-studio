"use client";
import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { Download, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { DramaStep } from "@/lib/drama/types";

type StepArtifactSpec = {
  /** 下载时使用的 artifact 名称 */
  name: string;
  /** 友好显示文字 */
  label: string;
  /** 是否允许 import */
  importable: boolean;
  /** 文件扩展名提示，用于 accept */
  accept?: string;
};

/**
 * 产品要求：每一步都要能「下载本环节中间态」+「直接导入一份现成产物」
 * 这个组件只是一条薄条，根据 URL 里的 step 决定操作哪个 artifact。
 *
 * 对于 episode / review / storyboard 三个按集数的产物：
 * - 默认下载最新一集，或由 `episodeIndex` 明确指定
 * - import 时必须显式填写集号
 */
const STEP_ARTIFACT: Record<DramaStep, StepArtifactSpec | null> = {
  start: { name: "start-card", label: "立项卡", importable: true, accept: ".md,.txt" },
  creative: { name: "creative", label: "三幕创意", importable: true, accept: ".md,.txt" },
  plan: { name: "plan", label: "节奏规划", importable: true, accept: ".md,.txt" },
  characters: { name: "characters", label: "人物卡", importable: true, accept: ".md,.txt" },
  outline: { name: "outline", label: "分集目录", importable: true, accept: ".md,.txt" },
  // episode / review / storyboard 按集号，交由专用组件 <ArtifactIOBarForEpisode>
  episode: null,
  review: null,
  storyboard: null,
  export: null,
  done: null,
};

function stepFromPathname(pathname: string | null): DramaStep | null {
  if (!pathname) return null;
  const m = pathname.match(/\/studio\/[^/]+\/([^/?#]+)/);
  if (!m) return null;
  const step = m[1] as DramaStep;
  return step in STEP_ARTIFACT ? step : null;
}

export function ArtifactIOBar({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const step = stepFromPathname(pathname);
  const spec = step ? STEP_ARTIFACT[step] : null;
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);

  if (!spec) return null;

  const downloadUrl = `/api/projects/${projectId}/artifacts/${spec.name}?download=1`;

  const onImport = async (file: File) => {
    setBusy(true);
    try {
      const content = await file.text();
      const res = await fetch(`/api/projects/${projectId}/artifacts/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: spec.name, content }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = json?.error?.message || json?.message || `HTTP ${res.status}`;
        throw new Error(msg);
      }
      toast.success(`${spec.label} 已导入（v${json?.data?.item?.version ?? "?"}）`);
      router.refresh();
    } catch (err) {
      toast.error(`导入失败：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="panel flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs">
      <div className="flex items-center gap-2 text-[color:var(--color-muted)]">
        <span>本环节产物：</span>
        <code className="rounded bg-[color:var(--color-surface-2)] px-1.5 py-0.5 text-[11px]">
          {spec.label}
        </code>
      </div>
      <div className="flex items-center gap-2">
        <a href={downloadUrl}>
          <Button size="sm" variant="secondary" type="button">
            <Download className="h-3.5 w-3.5" /> 下载中间态
          </Button>
        </a>
        {spec.importable && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept={spec.accept}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onImport(file);
              }}
            />
            <Button
              size="sm"
              variant="secondary"
              type="button"
              disabled={busy}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-3.5 w-3.5" /> {busy ? "导入中…" : "导入本环节产物"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
