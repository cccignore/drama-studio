"use client";
import * as React from "react";
import {
  CheckCircle2,
  Download,
  Factory,
  FileUp,
  Globe2,
  Loader2,
  Play,
  RefreshCcw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";

type Market = "domestic" | "overseas";
type Stage = "creative" | "screenplay" | "storyboard";
type WorkflowStep = "sources" | Stage;
type ExportStage = WorkflowStep;
type ScrapeSource = "latest" | "rank";
type BusyState = Stage | "create" | "import" | "scrape";

interface BatchProject {
  id: string;
  title: string;
  sourceText: string;
  targetMarket: Market;
  totalEpisodes: number;
  status: string;
  useComplexReversal: boolean;
  updatedAt: number;
}

interface BatchItem {
  id: string;
  sourceTitle: string;
  sourceKeywords: string;
  sourceSummary: string;
  sourceText: string;
  title: string;
  oneLiner: string;
  protagonist: string;
  narrativePov: string;
  audience: string;
  storyType: string;
  setting: string;
  act1: string;
  act2: string;
  act3: string;
  creativeMd: string;
  screenplayMd: string;
  storyboardMd: string;
  ideaSelected: boolean;
  creativeSelected: boolean;
  screenplaySelected: boolean;
  status: string;
  error: string;
}

interface ScrapedDrama {
  sourceTitle: string;
  sourceKeywords: string;
  sourceSummary: string;
  sourceUrl: string;
}

interface RunInfo {
  stage: Stage;
  targetIds: string[];
  startedAt: number;
}

const STEPS: Array<{ key: WorkflowStep; title: string; note: string }> = [
  { key: "sources", title: "1. 源剧池", note: "抓取/粘贴红果源剧，删除不要的行后进入下一步。" },
  { key: "creative", title: "2. 三幕创意", note: "结构化输出：剧名/第一主角/视角/受众/类型/背景/Act1-3。" },
  { key: "screenplay", title: "3. 完整剧本", note: "按 docx 格式输出第N集 + N-M 子场次（场景/人物/画面/台词/钩子）。" },
  { key: "storyboard", title: "4. 分镜脚本", note: "逐场拆镜：镜号、景别、机位、画面、台词/SFX。" },
];

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const json = await res.json();
  if (!res.ok || json.success === false) {
    throw new Error(json?.error?.message ?? `请求失败：${res.status}`);
  }
  return json.data as T;
}

export function BatchFactoryClient() {
  const [batches, setBatches] = React.useState<BatchProject[]>([]);
  const [active, setActive] = React.useState<BatchProject | null>(null);
  const [items, setItems] = React.useState<BatchItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState<BusyState | null>(null);
  const [step, setStep] = React.useState<WorkflowStep>("sources");
  const [runInfo, setRunInfo] = React.useState<RunInfo | null>(null);
  const [title, setTitle] = React.useState("红果批量工厂");
  const [sourceText, setSourceText] = React.useState("");
  const [targetMarket, setTargetMarket] = React.useState<Market>("overseas");
  const [useComplexReversal, setUseComplexReversal] = React.useState(false);
  const [totalEpisodes, setTotalEpisodes] = React.useState(30);
  const [batchSize, setBatchSize] = React.useState(16);
  const [scrapeLimit, setScrapeLimit] = React.useState(12);
  const [scrapeSource, setScrapeSource] = React.useState<ScrapeSource>("latest");
  const [scraped, setScraped] = React.useState<ScrapedDrama[]>([]);
  const [importText, setImportText] = React.useState("");

  const refreshList = React.useCallback(async () => {
    try {
      const data = await api<{ items: BatchProject[] }>("/api/batches");
      setBatches(data.items);
      setActive((prev) => prev ?? data.items[0] ?? null);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshActive = React.useCallback(async (id: string) => {
    const data = await api<{ item: BatchProject; items: BatchItem[] }>(`/api/batches/${id}`);
    setActive((prev) => (prev && prev.id === data.item.id ? data.item : prev ?? data.item));
    setItems(data.items);
  }, []);

  React.useEffect(() => {
    void refreshList();
  }, [refreshList]);

  React.useEffect(() => {
    if (active) void refreshActive(active.id);
  }, [active?.id, refreshActive]);

  React.useEffect(() => {
    if (!active || !isRunStage(busy)) return;
    const timer = window.setInterval(() => {
      void refreshActive(active.id);
    }, 1500);
    return () => window.clearInterval(timer);
  }, [active?.id, busy, refreshActive]);

  // Reconcile `busy` and `runInfo` against database reality. This handles
  // page refresh during a run: the polling kicks in from server state and
  // BatchRunMonitor shows the correct stage/progress without the user having
  // to click "开始生成" again. It also clears `busy` once no item is still
  // in a `*_running` state (the run finished while the page was open).
  React.useEffect(() => {
    if (!active) return;
    const stages: Stage[] = ["creative", "screenplay", "storyboard"];
    const stageWithRunning = stages.find((stage) =>
      items.some((item) => item.status === `${stage}_running`)
    );
    if (stageWithRunning) {
      const ids = items.filter((item) => item.status === `${stageWithRunning}_running`).map((item) => item.id);
      setBusy((prev) => (prev === stageWithRunning ? prev : stageWithRunning));
      setRunInfo((prev) => {
        if (prev && prev.stage === stageWithRunning) return prev;
        return { stage: stageWithRunning, targetIds: ids, startedAt: Date.now() };
      });
    } else if (isRunStage(busy)) {
      // Nothing is running anymore; clear the spinner.
      setBusy(null);
    }
  }, [items, active?.id, busy]);

  async function createBatch() {
    setBusy("create");
    try {
      const data = await api<{ item: BatchProject; items: BatchItem[] }>("/api/batches", {
        method: "POST",
        body: JSON.stringify({ title, sourceText, targetMarket, totalEpisodes, useComplexReversal }),
      });
      toast.success(`已解析 ${data.items.length} 部红果源剧`);
      setActive(data.item);
      setItems(data.items);
      setBatches((prev) => [data.item, ...prev]);
      setStep("sources");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function scrapeSources() {
    setBusy("scrape");
    try {
      const data = await api<{ items: ScrapedDrama[]; text: string; source: string }>(
        `/api/batches/scrape?limit=${scrapeLimit}&source=${scrapeSource}`
      );
      setSourceText(data.text);
      setScraped(data.items);
      toast.success(`已抓取 ${data.items.length} 部公开短剧数据`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function run(stage: Stage) {
    if (!active || busy) return;
    const targetIds = selectTargetIds(items, stage);
    if (targetIds.length === 0) {
      toast.error("当前步骤没有可生成的入选项");
      return;
    }
    setRunInfo({ stage, targetIds, startedAt: Date.now() });
    setBusy(stage);
    try {
      // The API now hands the run off to a process-scope supervisor and
      // returns immediately. The polling effect picks up progress from the
      // database via /api/batches/{id}.
      const data = await api<{ run: { state: "started" | "already_running"; startedAt: number } }>(
        `/api/batches/${active.id}/run`,
        { method: "POST", body: JSON.stringify({ stage, selectedOnly: true, batchSize }) }
      );
      if (data.run.state === "already_running") {
        toast.message(`同名批次已在生成中，将继续显示进度`);
      } else {
        toast.success(`已派发到后端，刷新页面也不会中断`);
      }
      await refreshActive(active.id);
    } catch (err) {
      toast.error((err as Error).message);
      setBusy(null);
    }
    // NOTE: we do NOT clear `busy` here — the polling effect below clears it
    // once every targeted item has left its `*_running` status.
  }

  async function importCsv() {
    if (!active) return;
    setBusy("import");
    try {
      const data = await api<{ imported: number }>(`/api/batches/${active.id}/import`, {
        method: "POST",
        body: JSON.stringify({
          format: "csv",
          content: importText,
          mode: "replace",
        }),
      });
      setImportText("");
      toast.success(`导入完成：${data.imported} 行；CSV 未出现的行已从批次中删除`);
      await refreshActive(active.id);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function deleteItem(item: BatchItem) {
    if (!active) return;
    if (!window.confirm(`删除《${item.title || item.sourceTitle || item.id}》？此操作不可恢复。`)) return;
    try {
      await api(`/api/batches/${active.id}/items`, {
        method: "DELETE",
        body: JSON.stringify({ ids: [item.id] }),
      });
      toast.success("已删除");
      await refreshActive(active.id);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  const counts = getCounts(items);
  const visibleItems = filterItemsForStep(items, step);

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <section className="panel p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">红果批量工厂</div>
            <div className="mt-1 text-xs text-[color:var(--color-muted)]">
              导出 CSV 审核时，直接删除不想要的行；回到对应步骤导入，保留行会进入下一步。
            </div>
          </div>
          {active && (
            <Button variant="ghost" size="sm" onClick={() => refreshActive(active.id)}>
              <RefreshCcw className="h-4 w-4" /> 刷新
            </Button>
          )}
        </div>
        <div className="mt-4 grid gap-2 lg:grid-cols-4">
          {STEPS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setStep(item.key)}
              className={`rounded-md border px-3 py-3 text-left transition ${
                step === item.key
                  ? "border-[color:var(--color-primary)] bg-[color:var(--color-primary)]/10"
                  : "border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] hover:border-[color:var(--color-primary)]/40"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">{item.title}</span>
                <StepCount step={item.key} counts={counts} />
              </div>
              <div className="mt-1 text-xs leading-relaxed text-[color:var(--color-muted)]">{item.note}</div>
            </button>
          ))}
        </div>
      </section>

      <section className="panel grid gap-4 p-5 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Factory className="h-4 w-4 text-[color:var(--color-primary)]" />
            当前批次
          </div>
          {active ? (
            <div className="rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-medium">{active.title}</div>
                  <div className="mt-1 text-xs text-[color:var(--color-muted)]">
                    {active.targetMarket === "overseas" ? "海外本土化" : "国内短剧"} · 完整剧本 {active.totalEpisodes} 集 · 源剧任务 {items.length}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {active.useComplexReversal && <Badge tone="warning">复杂反转</Badge>}
                  <Badge tone="muted">{active.status}</Badge>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-sm text-[color:var(--color-muted)]">还没有批次，请先在“源剧池”步骤解析。</div>
          )}
        </div>
        <BatchPicker
          batches={batches}
          activeId={active?.id}
          loading={loading}
          onSelect={(batch) => {
            setActive(batch);
            setImportText("");
          }}
        />
      </section>

      {step === "sources" && (
        <SourcesStep
          title={title}
          sourceText={sourceText}
          targetMarket={targetMarket}
          useComplexReversal={useComplexReversal}
          totalEpisodes={totalEpisodes}
          batchSize={batchSize}
          scrapeLimit={scrapeLimit}
          scrapeSource={scrapeSource}
          scrapedCount={scraped.length}
          busy={busy}
          active={active}
          items={visibleItems}
          importText={importText}
          onTitle={setTitle}
          onSourceText={setSourceText}
          onTargetMarket={setTargetMarket}
          onUseComplexReversal={setUseComplexReversal}
          onTotalEpisodes={setTotalEpisodes}
          onBatchSize={setBatchSize}
          onScrapeLimit={setScrapeLimit}
          onScrapeSource={setScrapeSource}
          onScrape={scrapeSources}
          onCreate={createBatch}
          onImportText={setImportText}
          onImport={importCsv}
          onDelete={deleteItem}
        />
      )}

      {step === "creative" && active && (
        <GenerationStep
          step="creative"
          title="生成三幕创意"
          description="导出 CSV → 在 Excel 删掉不想要的行 → 导回，CSV 即真相，未出现的行从批次删除。"
          active={active}
          items={visibleItems}
          busy={busy}
          batchSize={batchSize}
          importText={importText}
          runInfo={runInfo}
          onBatchSize={setBatchSize}
          onRun={() => run("creative")}
          onImportText={setImportText}
          onImport={importCsv}
          onDelete={deleteItem}
          onRefresh={() => refreshActive(active.id)}
        />
      )}

      {step === "screenplay" && active && (
        <GenerationStep
          step="screenplay"
          title="生成完整剧本"
          description="按 docx 格式输出（第N集 / N-M 子场次 / 场景·人物·画面·台词 / 钩子）。导出 CSV → 删行 → 导回。"
          active={active}
          items={visibleItems}
          busy={busy}
          batchSize={batchSize}
          importText={importText}
          runInfo={runInfo}
          onBatchSize={setBatchSize}
          onRun={() => run("screenplay")}
          onImportText={setImportText}
          onImport={importCsv}
          onDelete={deleteItem}
          onRefresh={() => refreshActive(active.id)}
        />
      )}

      {step === "storyboard" && active && (
        <GenerationStep
          step="storyboard"
          title="生成分镜脚本"
          description="逐场拆镜。海外本土化时，只有分镜中的台词/SFX 用英文，其余字段中文。"
          active={active}
          items={visibleItems}
          busy={busy}
          batchSize={batchSize}
          importText={importText}
          runInfo={runInfo}
          onBatchSize={setBatchSize}
          onRun={() => run("storyboard")}
          onImportText={setImportText}
          onImport={null}
          onDelete={deleteItem}
          onRefresh={() => refreshActive(active.id)}
        />
      )}
    </div>
  );
}

function SourcesStep({
  title,
  sourceText,
  targetMarket,
  useComplexReversal,
  totalEpisodes,
  batchSize,
  scrapeLimit,
  scrapeSource,
  scrapedCount,
  busy,
  active,
  items,
  importText,
  onTitle,
  onSourceText,
  onTargetMarket,
  onUseComplexReversal,
  onTotalEpisodes,
  onBatchSize,
  onScrapeLimit,
  onScrapeSource,
  onScrape,
  onCreate,
  onImportText,
  onImport,
  onDelete,
}: {
  title: string;
  sourceText: string;
  targetMarket: Market;
  useComplexReversal: boolean;
  totalEpisodes: number;
  batchSize: number;
  scrapeLimit: number;
  scrapeSource: ScrapeSource;
  scrapedCount: number;
  busy: BusyState | null;
  active: BatchProject | null;
  items: BatchItem[];
  importText: string;
  onTitle: (value: string) => void;
  onSourceText: (value: string) => void;
  onTargetMarket: (value: Market) => void;
  onUseComplexReversal: (value: boolean) => void;
  onTotalEpisodes: (value: number) => void;
  onBatchSize: (value: number) => void;
  onScrapeLimit: (value: number) => void;
  onScrapeSource: (value: ScrapeSource) => void;
  onScrape: () => void;
  onCreate: () => void;
  onImportText: (value: string) => void;
  onImport: () => void;
  onDelete: (item: BatchItem) => void;
}) {
  return (
    <div className="space-y-5">
      <section className="panel grid gap-4 p-5 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-3">
          <div>
            <div className="text-sm font-semibold">源剧池输入</div>
            <div className="mt-1 text-xs leading-relaxed text-[color:var(--color-muted)]">
              每一行是一部红果源剧，对应后续一个新剧候选。公开抓取仅用于建立源剧池，准确性以人工审核后的 CSV 为准。
            </div>
          </div>
          <Input value={title} onChange={(e) => onTitle(e.target.value)} placeholder="批次名称" />
          <div className="grid gap-3 md:grid-cols-[1fr_140px_190px_150px]">
            <select
              value={scrapeSource}
              onChange={(e) => onScrapeSource(e.target.value as ScrapeSource)}
              className="h-9 rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] px-3 text-sm"
            >
              <option value="latest">最近更新（简介更完整）</option>
              <option value="rank">红果榜单（部分无简介）</option>
            </select>
            <Input
              type="number"
              min={1}
              max={30}
              value={scrapeLimit}
              onChange={(e) => onScrapeLimit(Number(e.target.value) || 12)}
              placeholder="抓取数量"
            />
            <Button type="button" variant="secondary" onClick={onScrape} disabled={busy === "scrape"}>
              {busy === "scrape" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe2 className="h-4 w-4" />}
              抓取公开数据
            </Button>
            <Badge tone={scrapedCount ? "success" : "muted"} className="justify-center rounded-md py-2">
              已抓取 {scrapedCount} 部
            </Badge>
          </div>
          <Textarea
            value={sourceText}
            onChange={(e) => onSourceText(e.target.value)}
            rows={9}
            placeholder={"示例：\n假冒千金后，我成了豪门真团宠 | 都市日常 / 家庭 / 反转 / 逆袭 | 市井女孩因长相相似被豪门选中假冒千金，卷入继承与真相危机。\n肥妻的涅槃反击 | 复仇 / 逆袭 / 婚姻背叛 | 女主遭丈夫和养妹合谋陷害，恢复视力后伪装反击。"}
          />
          <div className="grid gap-3 md:grid-cols-[160px_160px_160px_1fr]">
            <label className="space-y-1">
              <span className="text-xs text-[color:var(--color-muted)]">目标市场</span>
              <select
                value={targetMarket}
                onChange={(e) => onTargetMarket(e.target.value as Market)}
                className="h-9 w-full rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] px-3 text-sm"
              >
                <option value="overseas">海外本土化</option>
                <option value="domestic">国内短剧</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs text-[color:var(--color-muted)]">每部剧本集数</span>
              <Input type="number" min={1} max={120} value={totalEpisodes} onChange={(e) => onTotalEpisodes(Number(e.target.value) || 30)} />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-[color:var(--color-muted)]">生成并发数（最大 100）</span>
              <Input type="number" min={1} max={100} value={batchSize} onChange={(e) => onBatchSize(Number(e.target.value) || 16)} />
            </label>
            <Button className="self-end" onClick={onCreate} disabled={busy === "create" || !sourceText.trim()}>
              {busy === "create" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              解析为源剧任务池
            </Button>
          </div>
          <label className="flex items-start gap-2 rounded-md border border-dashed border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 text-xs leading-relaxed">
            <input
              type="checkbox"
              checked={useComplexReversal}
              onChange={(e) => onUseComplexReversal(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium text-[color:var(--color-text)]">启用复杂反转 concept 模式</span>
              <span className="ml-1 text-[color:var(--color-muted)]">
                · 三幕创意阶段使用 5–7 层反转密度模板，强制写出主角 5 要素视觉化描述。适合海外平台（ReelShort/DramaBox）或想做高反转质感的批次；普通爽剧批次不建议开启。
              </span>
            </span>
          </label>
        </div>
        <ReviewBox
          title="源剧池审核"
          text="解析后先导出源剧 CSV。审核时删除不想继续生成的源剧行，再粘贴回这里导入；保留行会用于下一步生成三幕创意。"
          active={active}
          stage="sources"
          importText={importText}
          busy={busy}
          onImportText={onImportText}
          onImport={onImport}
        />
      </section>
      <ItemsTable
        title="源剧任务"
        items={items}
        columns={["source", "status", "actions"]}
        onDelete={onDelete}
      />
    </div>
  );
}

function GenerationStep({
  step,
  title,
  description,
  active,
  items,
  busy,
  batchSize,
  importText,
  runInfo,
  onBatchSize,
  onRun,
  onImportText,
  onImport,
  onDelete,
  onRefresh,
}: {
  step: Stage;
  title: string;
  description: string;
  active: BatchProject;
  items: BatchItem[];
  busy: BusyState | null;
  batchSize: number;
  importText: string;
  runInfo: RunInfo | null;
  onBatchSize: (value: number) => void;
  onRun: () => void;
  onImportText: (value: string) => void;
  onImport: (() => void) | null;
  onDelete: ((item: BatchItem) => void) | null;
  onRefresh: () => void;
}) {
  const targetCount = selectTargetIds(items, step).length;
  // Detect resume context: a failed row that already has partial output for
  // the current stage. The label change tells the user "this won't restart
  // from scratch" so they're not afraid to click again.
  const hasResumablePartial = items.some((item) => {
    if (item.status !== "failed") return false;
    if (step === "screenplay") return Boolean(item.screenplayMd);
    if (step === "storyboard") return Boolean(item.storyboardMd);
    return false;
  });
  return (
    <div className="space-y-5">
      <section className="panel grid gap-4 p-5 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-3">
          <div>
            <div className="text-sm font-semibold">{title}</div>
            <div className="mt-1 text-xs leading-relaxed text-[color:var(--color-muted)]">{description}</div>
          </div>
          <div className="grid gap-3 md:grid-cols-[160px_1fr]">
            <label className="space-y-1">
              <span className="text-xs text-[color:var(--color-muted)]">生成并发数（最大 100）</span>
              <Input type="number" min={1} max={100} value={batchSize} onChange={(e) => onBatchSize(Number(e.target.value) || 16)} />
            </label>
            <Button className="self-end" onClick={onRun} disabled={Boolean(busy) || targetCount === 0}>
              {busy === step ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {hasResumablePartial ? `续跑 ${targetCount} 条（保留已生成集）` : `开始生成 ${targetCount} 条`}
            </Button>
          </div>
          {runInfo?.stage === step && (
            <BatchRunMonitor info={runInfo} items={items} running={busy === step} onRefresh={onRefresh} totalEpisodes={active.totalEpisodes} />
          )}
        </div>
        <ReviewBox
          title={step === "storyboard" ? "最终导出" : "导出 / 导入"}
          text={
            step === "storyboard"
              ? "分镜生成后可导出 Markdown 或 Zip 交付。海外本土化分镜只有台词/SFX 是英文。"
              : "导出 CSV → 在 Excel 删行 / 改字段 → 粘贴回这里导回。CSV 即真相：未出现的行从批次删除。"
          }
          active={active}
          stage={step}
          importText={importText}
          busy={busy}
          onImportText={onImportText}
          onImport={onImport}
        />
      </section>
      <ItemsTable
        title={stageTableTitle(step)}
        items={items}
        columns={
          step === "creative"
            ? ["source", "creative", "status", "actions"]
            : step === "screenplay"
              ? ["creative", "screenplay", "status", "actions"]
              : ["screenplay", "storyboard", "status", "actions"]
        }
        onDelete={onDelete ?? undefined}
        totalEpisodes={active.totalEpisodes}
      />
    </div>
  );
}

function ReviewBox({
  title,
  text,
  active,
  stage,
  importText,
  busy,
  onImportText,
  onImport,
}: {
  title: string;
  text: string;
  active: BatchProject | null;
  stage: ExportStage;
  importText: string;
  busy: BusyState | null;
  onImportText: (value: string) => void;
  onImport: (() => void) | null;
}) {
  const [dragging, setDragging] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const ingestFile = React.useCallback(
    async (file: File) => {
      if (!file) return;
      const name = file.name.toLowerCase();
      if (!name.endsWith(".csv") && file.type && !file.type.includes("csv") && !file.type.includes("text")) {
        toast.error("只支持 .csv 文件");
        return;
      }
      try {
        const text = await file.text();
        if (!text.trim()) {
          toast.error("文件内容为空");
          return;
        }
        onImportText(text);
        toast.success(`已读取 ${file.name}（${text.length} 字符），点「导入审核 CSV」继续`);
      } catch (err) {
        toast.error((err as Error).message ?? "读取文件失败");
      }
    },
    [onImportText]
  );

  return (
    <div className="space-y-3">
      <div>
        <div className="text-sm font-semibold">{title}</div>
        <div className="mt-1 text-xs leading-relaxed text-[color:var(--color-muted)]">{text}</div>
      </div>
      <div className="flex flex-wrap gap-2">
        {active && <DownloadLink id={active.id} stage={stage} format="csv" label="导出审核 CSV" />}
        {active && <DownloadLink id={active.id} stage={stage} format="md" label="导出 Markdown" />}
        {active && stage === "storyboard" && <DownloadLink id={active.id} stage="sources" format="zip" label="导出 Zip" />}
      </div>
      {onImport && (
        <>
          <div
            onDragEnter={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDragging(true);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDragging(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDragging(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDragging(false);
              const file = e.dataTransfer.files?.[0];
              if (file) void ingestFile(file);
            }}
            onClick={() => fileInputRef.current?.click()}
            className={`flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed px-3 py-3 text-xs transition ${
              dragging
                ? "border-[color:var(--color-primary)] bg-[color:var(--color-primary)]/10 text-[color:var(--color-text)]"
                : "border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] text-[color:var(--color-muted)] hover:border-[color:var(--color-primary)]/40"
            }`}
          >
            <FileUp className="h-4 w-4" />
            <span>{dragging ? "松开即可读取 CSV" : "拖拽 CSV 文件到这里，或点击选择文件"}</span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void ingestFile(file);
                e.target.value = "";
              }}
            />
          </div>
          <div className="grid gap-3 md:grid-cols-[1fr_170px]">
            <Textarea
              rows={5}
              value={importText}
              onChange={(e) => onImportText(e.target.value)}
              placeholder="或直接粘贴审核后的 CSV。删除的行会自动取消本步骤入选，保留的行进入下一步。"
            />
            <Button className="self-stretch" onClick={onImport} disabled={!importText.trim() || busy === "import"}>
              {busy === "import" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
              导入审核 CSV
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function BatchPicker({
  batches,
  activeId,
  loading,
  onSelect,
}: {
  batches: BatchProject[];
  activeId?: string;
  loading: boolean;
  onSelect: (batch: BatchProject) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="text-sm font-semibold">批次列表</div>
      <div className="max-h-[220px] space-y-2 overflow-auto">
        {loading ? (
          <div className="text-sm text-[color:var(--color-muted)]">加载中...</div>
        ) : batches.length === 0 ? (
          <div className="text-sm text-[color:var(--color-muted)]">暂无批次</div>
        ) : (
          batches.map((batch) => (
            <button
              key={batch.id}
              type="button"
              onClick={() => onSelect(batch)}
              className={`w-full rounded-md border px-3 py-2 text-left text-sm ${
                activeId === batch.id
                  ? "border-[color:var(--color-primary)] bg-[color:var(--color-primary)]/10"
                  : "border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{batch.title}</span>
                <Badge tone="muted">{batch.targetMarket === "overseas" ? "海外" : "国内"}</Badge>
              </div>
              <div className="mt-1 font-mono text-[11px] text-[color:var(--color-muted)]">{batch.id}</div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function ItemsTable({
  title,
  items,
  columns,
  onDelete,
  totalEpisodes,
}: {
  title: string;
  items: BatchItem[];
  columns: Array<"source" | "creative" | "screenplay" | "storyboard" | "status" | "actions">;
  onDelete?: (item: BatchItem) => void;
  totalEpisodes?: number;
}) {
  return (
    <section className="panel overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-[color:var(--color-border)] px-4 py-3">
        <div className="text-sm font-semibold">{title}</div>
        <Badge tone="muted">{items.length} 条</Badge>
      </div>
      <div className="overflow-auto">
        <table className="w-full min-w-[980px] text-[12px]">
          <thead className="bg-[color:var(--color-surface-2)] text-left text-[11px] text-[color:var(--color-muted)]">
            <tr>
              {columns.includes("source") && <th className="px-3 py-2">红果源剧</th>}
              {columns.includes("creative") && <th className="px-3 py-2">三幕创意</th>}
              {columns.includes("screenplay") && <th className="px-3 py-2">完整剧本</th>}
              {columns.includes("storyboard") && <th className="px-3 py-2">分镜脚本</th>}
              {columns.includes("status") && <th className="px-3 py-2">状态</th>}
              {columns.includes("actions") && <th className="px-3 py-2 w-[80px]">操作</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-[color:var(--color-border)]">
            {items.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-center text-[color:var(--color-muted)]" colSpan={columns.length}>
                  当前步骤暂无数据
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className="align-top">
                  {columns.includes("source") && (
                    <td className="max-w-[360px] px-3 py-2">
                      <div className="font-medium">{item.sourceTitle || "未命名源剧"}</div>
                      {item.sourceKeywords && <div className="mt-1 text-[color:var(--color-muted)]">{item.sourceKeywords}</div>}
                      <div className="mt-1 line-clamp-3 text-[color:var(--color-muted)]">{item.sourceSummary || item.sourceText || "-"}</div>
                    </td>
                  )}
                  {columns.includes("creative") && (
                    <td className="max-w-[420px] px-3 py-2">
                      <div className="font-medium">{item.title || "未生成新剧名"}</div>
                      {item.audience || item.storyType ? (
                        <div className="mt-1 text-[11px] text-[color:var(--color-muted)]">
                          {[item.audience, item.storyType].filter(Boolean).join(" · ")}
                        </div>
                      ) : null}
                      <div className="mt-1 line-clamp-3 text-[color:var(--color-muted)]">
                        {item.act1 || item.oneLiner || preview(item.creativeMd)}
                      </div>
                    </td>
                  )}
                  {columns.includes("screenplay") && (
                    <td className="max-w-[420px] px-3 py-2 text-[color:var(--color-muted)]">
                      {item.screenplayMd && totalEpisodes ? (
                        <div className="mb-1 inline-flex items-center gap-1 rounded border border-[color:var(--color-border)] px-1.5 py-0.5 text-[10px] font-mono text-[color:var(--color-text)]">
                          已生成 {countCompleteEpisodes(item.screenplayMd, "screenplay")}/{totalEpisodes} 集
                        </div>
                      ) : null}
                      {preview(item.screenplayMd)}
                    </td>
                  )}
                  {columns.includes("storyboard") && (
                    <td className="max-w-[420px] px-3 py-2 text-[color:var(--color-muted)]">
                      {item.storyboardMd && totalEpisodes ? (
                        <div className="mb-1 inline-flex items-center gap-1 rounded border border-[color:var(--color-border)] px-1.5 py-0.5 text-[10px] font-mono text-[color:var(--color-text)]">
                          已生成 {countCompleteEpisodes(item.storyboardMd, "storyboard")}/{totalEpisodes} 集
                        </div>
                      ) : null}
                      {preview(item.storyboardMd)}
                    </td>
                  )}
                  {columns.includes("status") && (
                    <td className="px-3 py-2">
                      <StatusBadge status={item.status} />
                      {item.error && <div className="mt-2 max-w-[260px] text-[color:var(--color-danger)]">{item.error}</div>}
                    </td>
                  )}
                  {columns.includes("actions") && (
                    <td className="px-3 py-2">
                      {onDelete && (
                        <button
                          type="button"
                          onClick={() => onDelete(item)}
                          title="删除该项"
                          className="inline-flex items-center gap-1 rounded border border-[color:var(--color-border)] px-2 py-1 text-[11px] text-[color:var(--color-muted)] hover:border-[color:var(--color-danger)]/50 hover:text-[color:var(--color-danger)]"
                        >
                          <Trash2 className="h-3 w-3" />
                          删除
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function DownloadLink({ id, stage, format, label }: { id: string; stage: ExportStage; format: "csv" | "md" | "zip"; label: string }) {
  return (
    <a href={`/api/batches/${id}/export?stage=${stage}&format=${format}`}>
      <Button type="button" size="sm" variant="secondary">
        <Download className="h-4 w-4" /> {label}
      </Button>
    </a>
  );
}

function StepCount({ step, counts }: { step: WorkflowStep; counts: ReturnType<typeof getCounts> }) {
  const value =
    step === "sources"
      ? `${counts.total}`
      : step === "creative"
        ? `${counts.creativeReady}/${counts.total}`
        : step === "screenplay"
          ? `${counts.screenplayReady}/${counts.creativeReady}`
          : `${counts.storyboardReady}/${counts.screenplayReady}`;
  return <Badge tone="muted">{value}</Badge>;
}

function BatchRunMonitor({
  info,
  items,
  running,
  onRefresh,
  totalEpisodes,
}: {
  info: RunInfo;
  items: BatchItem[];
  running: boolean;
  onRefresh: () => void;
  totalEpisodes: number;
}) {
  const stats = stageStats(info, items);
  const percent = stats.total === 0 ? 100 : Math.round(((stats.done + stats.failed) / stats.total) * 100);
  const elapsed = Math.max(0, Math.round((Date.now() - info.startedAt) / 1000));
  // Per-item episode progress (only meaningful for screenplay/storyboard).
  const perItemProgress: Array<{ item: BatchItem; completed: number }> = [];
  if (info.stage === "screenplay" || info.stage === "storyboard") {
    const stageNarrow = info.stage; // narrow once for TS
    for (const item of items) {
      if (!info.targetIds.includes(item.id)) continue;
      const md = stageNarrow === "screenplay" ? item.screenplayMd : item.storyboardMd;
      perItemProgress.push({ item, completed: countCompleteEpisodes(md, stageNarrow) });
    }
  }
  return (
    <div className="rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold">
            {running ? <Loader2 className="h-4 w-4 animate-spin text-[color:var(--color-primary)]" /> : <CheckCircle2 className="h-4 w-4 text-[color:var(--color-success)]" />}
            当前执行：{stageLabel(info.stage)}
          </div>
          <div className="mt-1 text-xs text-[color:var(--color-muted)]">
            目标 {stats.total} · 运行中 {stats.running} · 已完成 {stats.done} · 失败 {stats.failed} · 已用 {elapsed}s
          </div>
          <div className="mt-1 text-xs text-[color:var(--color-muted)]">
            生成期间可以刷新页面或关闭浏览器，任务在后端继续跑；回到页面会自动恢复进度显示。
          </div>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onRefresh}>
          <RefreshCcw className="h-4 w-4" /> 刷新状态
        </Button>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-[color:var(--color-surface)]">
        <div className="h-full bg-[color:var(--color-primary)] transition-all" style={{ width: `${percent}%` }} />
      </div>
      {perItemProgress.length > 0 && totalEpisodes > 0 && (
        <div className="mt-3 space-y-1.5 text-[11px]">
          {perItemProgress.map(({ item, completed }) => {
            const ratio = totalEpisodes > 0 ? Math.min(100, Math.round((completed / totalEpisodes) * 100)) : 0;
            return (
              <div key={item.id} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-[color:var(--color-muted)]">
                  {item.title || item.sourceTitle || item.id}
                </span>
                <span className="shrink-0 font-mono">
                  {completed}/{totalEpisodes} 集
                </span>
                <div className="h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-[color:var(--color-surface)]">
                  <div className="h-full bg-[color:var(--color-primary)]/70 transition-all" style={{ width: `${ratio}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Counts how many episodes in `md` are "complete" — for screenplay we look
// for the trailing `钩子：` block in each `第 N 集`; for storyboard we look
// for at least one row body under each `## 第 N 集分镜`.
function countCompleteEpisodes(md: string, stage: "screenplay" | "storyboard"): number {
  if (!md) return 0;
  if (stage === "screenplay") {
    // Each complete episode has one 钩子: line.
    return (md.match(/^钩子[:：]/gm) || []).length;
  }
  const lines = md.split(/\r?\n/);
  let count = 0;
  let currentEp: number | null = null;
  let currentEpHasRow = false;
  for (const line of lines) {
    const head = line.trim().match(/^##\s*第\s*(\d+)\s*集分镜/);
    if (head) {
      if (currentEp !== null && currentEpHasRow) count += 1;
      currentEp = Number(head[1]);
      currentEpHasRow = false;
      continue;
    }
    if (currentEp !== null && /^\|\s*\d+\s*\|/.test(line)) currentEpHasRow = true;
  }
  if (currentEp !== null && currentEpHasRow) count += 1;
  return count;
}

function StatusBadge({ status }: { status: string }) {
  const running = status.endsWith("_running");
  const failed = status === "failed";
  const ready = status.endsWith("_ready");
  return (
    <Badge tone={failed ? "danger" : running ? "primary" : ready ? "success" : "muted"}>
      {running && <Loader2 className="h-3 w-3 animate-spin" />}
      {statusLabel(status)}
    </Badge>
  );
}

function getCounts(items: BatchItem[]) {
  return {
    total: items.length,
    creativeReady: items.filter((item) => item.creativeMd || item.act1).length,
    screenplayReady: items.filter((item) => item.screenplayMd).length,
    storyboardReady: items.filter((item) => item.storyboardMd).length,
  };
}

function filterItemsForStep(items: BatchItem[], _step: WorkflowStep): BatchItem[] {
  // All items are visible at every step now — CSV is truth, not selection.
  return items;
}

function isRunStage(value: BusyState | null): value is Stage {
  return value === "creative" || value === "screenplay" || value === "storyboard";
}

function selectTargetIds(items: BatchItem[], stage: Stage): string[] {
  // CSV-is-truth: every row in the batch is "in". A row is targeted for a
  // stage iff (a) it has the prerequisite data and not yet the output for
  // it, (b) the previous run ended in `failed`, OR (c) the row is in the
  // matching `*_running` state — covers both "still running, hit retry to
  // resume" and "container restarted mid-run, status got stuck".
  const isResumable = (item: BatchItem, runningStatus: string): boolean =>
    item.status === "failed" || item.status === runningStatus;
  if (stage === "creative") {
    return items
      .filter((item) => item.sourceText && ((!item.creativeMd && !item.act1) || isResumable(item, "creative_running")))
      .map((item) => item.id);
  }
  if (stage === "screenplay") {
    return items
      .filter(
        (item) =>
          (item.creativeMd || item.act1) && (!item.screenplayMd || isResumable(item, "screenplay_running"))
      )
      .map((item) => item.id);
  }
  return items
    .filter((item) => item.screenplayMd && (!item.storyboardMd || isResumable(item, "storyboard_running")))
    .map((item) => item.id);
}

function stageStats(info: RunInfo, items: BatchItem[]) {
  const idSet = new Set(info.targetIds);
  const rows = items.filter((item) => idSet.has(item.id));
  return {
    rows,
    total: info.targetIds.length,
    running: rows.filter((item) => item.status === `${info.stage}_running`).length,
    failed: rows.filter((item) => item.status === "failed").length,
    done: rows.filter((item) =>
      info.stage === "creative"
        ? Boolean(item.creativeMd)
        : info.stage === "screenplay"
          ? Boolean(item.screenplayMd)
          : Boolean(item.storyboardMd)
    ).length,
  };
}

function stageLabel(stage: Stage): string {
  if (stage === "creative") return "批量生成三幕创意";
  if (stage === "screenplay") return "批量生成完整剧本";
  return "批量生成分镜脚本";
}

function stageTableTitle(stage: Stage): string {
  if (stage === "creative") return "三幕创意候选";
  if (stage === "screenplay") return "完整剧本候选";
  return "分镜脚本候选";
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    source_ready: "源剧就绪",
    creative_running: "创意生成中",
    creative_ready: "创意完成",
    screenplay_running: "剧本生成中",
    screenplay_ready: "剧本完成",
    storyboard_running: "分镜生成中",
    storyboard_ready: "分镜完成",
    failed: "失败",
  };
  return map[status] ?? status;
}

function preview(text: string): string {
  if (!text) return "-";
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length > 140 ? `${compact.slice(0, 140)}...` : compact;
}
