"use client";
import * as React from "react";
import Link from "next/link";
import { Sparkles, Play, Square, ArrowRight, FileText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { GenrePicker } from "@/components/wizard/genre-picker";
import { VoiceInput } from "@/components/wizard/voice-input";
import { StreamingConsole } from "@/components/wizard/streaming-console";
import { useStreamingCommand } from "@/hooks/use-streaming-command";
import type { DramaState } from "@/lib/drama/types";

const AUDIENCES = ["男频", "女频", "全年龄"] as const;
const TONES = ["爽燃", "甜虐", "搞笑", "暗黑", "温情"] as const;
const ENDINGS = ["HE", "BE", "OE", "反转"] as const;
const MODES = [
  { id: "domestic", label: "国内市场" },
  { id: "overseas", label: "出海 (ReelShort / DramaBox)" },
] as const;

export function StartStepClient({
  projectId,
  initialState,
  initialArtifact,
}: {
  projectId: string;
  initialState: DramaState;
  initialArtifact: { content: string; version: number } | null;
}) {
  const [title, setTitle] = React.useState(initialState.dramaTitle);
  const [genre, setGenre] = React.useState<string[]>(initialState.genre);
  const [audience, setAudience] = React.useState<string>(initialState.audience ?? "");
  const [tone, setTone] = React.useState<string>(initialState.tone ?? "");
  const [ending, setEnding] = React.useState<string>(initialState.ending ?? "HE");
  const [totalEpisodes, setTotalEpisodes] = React.useState<number>(initialState.totalEpisodes || 60);
  const [mode, setMode] = React.useState<"domestic" | "overseas">(initialState.mode);
  const [freeText, setFreeText] = React.useState(initialState.freeText ?? "");
  const [savedContent, setSavedContent] = React.useState<string | null>(initialArtifact?.content ?? null);
  const [canAdvance, setCanAdvance] = React.useState<boolean>(!!initialArtifact);

  const { run, stop, running, partial, events, error } = useStreamingCommand({
    projectId,
    command: "start",
    onDone: () => {
      toast.success("立项卡已生成");
      setCanAdvance(true);
    },
    onEvent: (ev) => {
      if (ev.type === "artifact") {
        // 生成结束后 partial 累加的内容就是正文；直接用 partial 保存
      }
    },
  });

  React.useEffect(() => {
    if (!running && partial && events.some((e) => e.type === "done")) {
      setSavedContent(partial);
    }
  }, [running, partial, events]);

  const onGenerate = async () => {
    if (genre.length === 0) {
      toast.error("请先选择至少 1 个题材");
      return;
    }
    if (!audience) {
      toast.error("请选择核心受众");
      return;
    }
    await run({
      dramaTitle: title || undefined,
      genre,
      audience,
      tone: tone || undefined,
      ending,
      totalEpisodes,
      mode,
      freeText: freeText || undefined,
    });
  };

  const displayContent = running ? partial : savedContent ?? partial;

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <Sparkles className="h-5 w-5 text-[color:var(--color-primary)]" />
            第 1 步 · 立项卡
          </h1>
          <p className="mt-1 text-sm text-[color:var(--color-muted)]">
            决定题材、受众、基调、总集数与核心创意。AI 将产出一份完整的立项卡。
          </p>
        </div>
        {canAdvance && !running && (
          <Link href={`/studio/${projectId}/plan`}>
            <Button variant="secondary">
              进入下一步 · 节奏
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        )}
      </header>

      <section className="panel space-y-5 p-5">
        <div className="grid gap-3 md:grid-cols-[1fr_180px_160px]">
          <div>
            <label className="mb-1 block text-xs font-medium text-[color:var(--color-muted)]">剧名（可选，AI 会给建议）</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例如：战神奶爸归来 / 重生豪门 / Alpha's Secret Baby"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[color:var(--color-muted)]">总集数</label>
            <Input
              type="number"
              min={30}
              max={120}
              value={totalEpisodes}
              onChange={(e) => setTotalEpisodes(Math.max(20, Math.min(120, parseInt(e.target.value) || 60)))}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[color:var(--color-muted)]">市场</label>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as "domestic" | "overseas")}
              className="h-9 w-full rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] px-3 text-sm"
            >
              {MODES.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="mb-2 block text-xs font-medium text-[color:var(--color-muted)]">
            题材（最多 3 个，顺序=主副）
          </label>
          <GenrePicker value={genre} onChange={setGenre} max={3} />
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <ChipGroup label="核心受众" value={audience} options={[...AUDIENCES]} onChange={setAudience} />
          <ChipGroup label="基调" value={tone} options={[...TONES]} onChange={setTone} />
          <ChipGroup label="结局" value={ending} options={[...ENDINGS]} onChange={setEnding} />
        </div>

        <div>
          <label className="mb-1 flex items-center justify-between text-xs font-medium text-[color:var(--color-muted)]">
            <span>核心创意 / 用户想法（可选，支持语音）</span>
            <VoiceInput
              disabled={running}
              lang={mode === "overseas" ? "en-US" : "zh-CN"}
              onTranscript={(t) => setFreeText((prev) => (prev ? prev + " " + t : t))}
            />
          </label>
          <Textarea
            rows={4}
            value={freeText}
            onChange={(e) => setFreeText(e.target.value)}
            placeholder="例如：男主是退伍特种兵，女主是被家族抛弃的设计师，两人因为一次乌龙闪婚，三年后重逢时女主已经是业内顶流……"
          />
        </div>

        <div className="flex items-center gap-2">
          {running ? (
            <Button variant="danger" onClick={stop}>
              <Square className="h-4 w-4" /> 终止
            </Button>
          ) : (
            <Button onClick={onGenerate} disabled={genre.length === 0 || !audience}>
              <Play className="h-4 w-4" /> {savedContent ? "重新生成立项卡" : "生成立项卡"}
            </Button>
          )}
          {error && <span className="text-xs text-[color:var(--color-danger)]">{error}</span>}
        </div>
      </section>

      <StreamingConsole running={running} partial={partial} events={events} error={error} />

      {displayContent && !running && (
        <section className="panel p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium">
            <FileText className="h-4 w-4 text-[color:var(--color-success)]" />
            已保存的立项卡
          </div>
          <pre className="whitespace-pre-wrap break-words rounded-md bg-[color:var(--color-surface-2)] p-4 text-[13px] leading-[1.75]">
            {displayContent}
          </pre>
        </section>
      )}
    </div>
  );
}

function ChipGroup({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-[color:var(--color-muted)]">{label}</label>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(value === opt ? "" : opt)}
            className={
              value === opt
                ? "rounded-full border border-[color:var(--color-primary)] bg-[color:var(--color-primary)]/15 px-3 py-1 text-xs text-[color:var(--color-primary)]"
                : "rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] px-3 py-1 text-xs text-[color:var(--color-muted)] hover:border-[color:var(--color-border-strong)]"
            }
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}
