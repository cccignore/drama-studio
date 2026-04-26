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
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";

type Market = "domestic" | "overseas";
type Stage = "creative" | "screenplay" | "storyboard";
type WorkflowStep = "sources" | Stage;
type ReviewStep = "sources" | "creative" | "screenplay";
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
  { key: "sources", title: "1. 源剧池", note: "抓取/粘贴红果源剧，审核后保留要继续生成的源剧。" },
  { key: "creative", title: "2. 三幕创意", note: "为入选源剧生成新剧名、一句话题材和三幕创意。" },
  { key: "screenplay", title: "3. 完整剧本", note: "审核创意后，只为保留项生成完整剧本。" },
  { key: "storyboard", title: "4. 分镜脚本", note: "审核剧本后，只为保留项生成最终分镜脚本。" },
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
  const [batchSize, setBatchSize] = React.useState(3);
  const [scrapeLimit, setScrapeLimit] = React.useState(12);
  const [scrapeSource, setScrapeSource] = React.useState<ScrapeSource>("latest");
  const [scraped, setScraped] = React.useState<ScrapedDrama[]>([]);
  const [importText, setImportText] = React.useState("");

  const refreshList = React.useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<{ items: BatchProject[] }>("/api/batches");
      setBatches(data.items);
      if (!active && data.items[0]) setActive(data.items[0]);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [active]);

  const refreshActive = React.useCallback(async (id: string) => {
    const data = await api<{ item: BatchProject; items: BatchItem[] }>(`/api/batches/${id}`);
    setActive(data.item);
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
      const data = await api<{ result: { created: number; updated: number; failed: number } }>(
        `/api/batches/${active.id}/run`,
        { method: "POST", body: JSON.stringify({ stage, selectedOnly: true, batchSize }) }
      );
      toast.success(`完成：更新 ${data.result.updated}，失败 ${data.result.failed}`);
      await refreshActive(active.id);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function toggle(item: BatchItem, key: "ideaSelected" | "creativeSelected" | "screenplaySelected") {
    if (!active) return;
    const next = { ...item, [key]: !item[key] };
    setItems((prev) => prev.map((row) => (row.id === item.id ? next : row)));
    try {
      await api(`/api/batches/${active.id}/items`, {
        method: "PATCH",
        body: JSON.stringify({ items: [{ id: item.id, [key]: next[key] }] }),
      });
    } catch (err) {
      toast.error((err as Error).message);
      await refreshActive(active.id);
    }
  }

  async function importCsv(reviewStep: ReviewStep) {
    if (!active) return;
    setBusy("import");
    try {
      await api(`/api/batches/${active.id}/import`, {
        method: "POST",
        body: JSON.stringify({
          format: "csv",
          content: importText,
          reviewStage: reviewStep,
          replaceSelection: true,
        }),
      });
      setImportText("");
      toast.success("审核 CSV 已导入，未保留的行已从下一阶段排除");
      await refreshActive(active.id);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
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
          onImport={() => importCsv("sources")}
          onToggle={(item) => toggle(item, "ideaSelected")}
        />
      )}

      {step === "creative" && active && (
        <GenerationStep
          step="creative"
          title="生成三幕创意"
          description="本步骤只处理源剧池审核后保留的行。生成后导出 CSV/Markdown，人工删除不想要的创意，再导入本步骤审核 CSV。"
          active={active}
          items={visibleItems}
          busy={busy}
          batchSize={batchSize}
          importText={importText}
          runInfo={runInfo}
          onBatchSize={setBatchSize}
          onRun={() => run("creative")}
          onImportText={setImportText}
          onImport={() => importCsv("creative")}
          onToggle={(item) => toggle(item, "creativeSelected")}
          onRefresh={() => refreshActive(active.id)}
        />
      )}

      {step === "screenplay" && active && (
        <GenerationStep
          step="screenplay"
          title="生成完整剧本"
          description="本步骤只处理三幕创意审核后保留的行。海外本土化只影响人名、设定和风格；剧本文本仍用中文，便于审核。"
          active={active}
          items={visibleItems}
          busy={busy}
          batchSize={batchSize}
          importText={importText}
          runInfo={runInfo}
          onBatchSize={setBatchSize}
          onRun={() => run("screenplay")}
          onImportText={setImportText}
          onImport={() => importCsv("screenplay")}
          onToggle={(item) => toggle(item, "screenplaySelected")}
          onRefresh={() => refreshActive(active.id)}
        />
      )}

      {step === "storyboard" && active && (
        <GenerationStep
          step="storyboard"
          title="生成分镜脚本"
          description="本步骤只处理完整剧本审核后保留的行。海外本土化时，只有分镜中的台词/SFX 用英文，其他字段继续中文。"
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
          onToggle={null}
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
  onToggle,
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
  onToggle: (item: BatchItem) => void;
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
              <span className="text-xs text-[color:var(--color-muted)]">生成并发数</span>
              <Input type="number" min={1} max={20} value={batchSize} onChange={(e) => onBatchSize(Number(e.target.value) || 3)} />
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
        columns={["source", "status", "review"]}
        reviewLabel="源剧入选"
        onToggle={onToggle}
        selectedKey="ideaSelected"
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
  onToggle,
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
  onToggle: ((item: BatchItem) => void) | null;
  onRefresh: () => void;
}) {
  const targetCount = selectTargetIds(items, step).length;
  const reviewStage = step === "storyboard" ? null : step;
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
              <span className="text-xs text-[color:var(--color-muted)]">生成并发数</span>
              <Input type="number" min={1} max={20} value={batchSize} onChange={(e) => onBatchSize(Number(e.target.value) || 3)} />
            </label>
            <Button className="self-end" onClick={onRun} disabled={Boolean(busy) || targetCount === 0}>
              {busy === step ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              开始生成 {targetCount} 条
            </Button>
          </div>
          {runInfo?.stage === step && (
            <BatchRunMonitor info={runInfo} items={items} running={busy === step} onRefresh={onRefresh} />
          )}
        </div>
        <ReviewBox
          title={step === "storyboard" ? "最终导出" : "本步骤审核"}
          text={
            step === "storyboard"
              ? "分镜生成后可导出 Markdown 或 Zip 交付。海外本土化分镜只有台词/SFX 是英文，其余字段中文。"
              : "生成后导出 CSV/Markdown。人工审核 CSV 时删除不想进入下一步的行，再粘贴回这里导入。"
          }
          active={active}
          stage={step}
          importText={importText}
          busy={busy}
          onImportText={onImportText}
          onImport={reviewStage ? onImport : null}
        />
      </section>
      <ItemsTable
        title={stageTableTitle(step)}
        items={items}
        columns={step === "creative" ? ["source", "creative", "status", "review"] : step === "screenplay" ? ["creative", "screenplay", "status", "review"] : ["screenplay", "storyboard", "status"]}
        reviewLabel={step === "creative" ? "创意入选" : step === "screenplay" ? "剧本入选" : ""}
        onToggle={onToggle ?? undefined}
        selectedKey={step === "creative" ? "creativeSelected" : step === "screenplay" ? "screenplaySelected" : undefined}
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
        <div className="grid gap-3 md:grid-cols-[1fr_170px]">
          <Textarea
            rows={5}
            value={importText}
            onChange={(e) => onImportText(e.target.value)}
            placeholder="粘贴审核后的 CSV。删除的行会自动取消本步骤入选，保留的行进入下一步。"
          />
          <Button className="self-stretch" onClick={onImport} disabled={!importText.trim() || busy === "import"}>
            {busy === "import" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
            导入审核 CSV
          </Button>
        </div>
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
  reviewLabel,
  onToggle,
  selectedKey,
}: {
  title: string;
  items: BatchItem[];
  columns: Array<"source" | "creative" | "screenplay" | "storyboard" | "status" | "review">;
  reviewLabel?: string;
  onToggle?: (item: BatchItem) => void;
  selectedKey?: "ideaSelected" | "creativeSelected" | "screenplaySelected";
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
              {columns.includes("review") && <th className="px-3 py-2">审核</th>}
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
                      <div className="mt-1 text-[color:var(--color-muted)]">{item.oneLiner || preview(item.creativeMd)}</div>
                    </td>
                  )}
                  {columns.includes("screenplay") && (
                    <td className="max-w-[420px] px-3 py-2 text-[color:var(--color-muted)]">{preview(item.screenplayMd)}</td>
                  )}
                  {columns.includes("storyboard") && (
                    <td className="max-w-[420px] px-3 py-2 text-[color:var(--color-muted)]">{preview(item.storyboardMd)}</td>
                  )}
                  {columns.includes("status") && (
                    <td className="px-3 py-2">
                      <StatusBadge status={item.status} />
                      {item.error && <div className="mt-2 max-w-[260px] text-[color:var(--color-danger)]">{item.error}</div>}
                    </td>
                  )}
                  {columns.includes("review") && selectedKey && onToggle && (
                    <td className="px-3 py-2">
                      <CheckButton active={item[selectedKey]} label={reviewLabel || "入选"} onClick={() => onToggle(item)} />
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

function CheckButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded border px-2 py-1 text-left text-[11px] ${
        active
          ? "border-[color:var(--color-success)]/40 text-[color:var(--color-success)]"
          : "border-[color:var(--color-border)] text-[color:var(--color-muted)]"
      }`}
    >
      {active ? "✓" : "○"} {label}
    </button>
  );
}

function StepCount({ step, counts }: { step: WorkflowStep; counts: ReturnType<typeof getCounts> }) {
  const value =
    step === "sources"
      ? `${counts.sourceSelected}/${counts.total}`
      : step === "creative"
        ? `${counts.creativeReady}/${counts.sourceSelected}`
        : step === "screenplay"
          ? `${counts.screenplayReady}/${counts.creativeSelected}`
          : `${counts.storyboardReady}/${counts.screenplaySelected}`;
  return <Badge tone="muted">{value}</Badge>;
}

function BatchRunMonitor({
  info,
  items,
  running,
  onRefresh,
}: {
  info: RunInfo;
  items: BatchItem[];
  running: boolean;
  onRefresh: () => void;
}) {
  const stats = stageStats(info, items);
  const percent = stats.total === 0 ? 100 : Math.round(((stats.done + stats.failed) / stats.total) * 100);
  const elapsed = Math.max(0, Math.round((Date.now() - info.startedAt) / 1000));
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
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onRefresh}>
          <RefreshCcw className="h-4 w-4" /> 刷新状态
        </Button>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-[color:var(--color-surface)]">
        <div className="h-full bg-[color:var(--color-primary)] transition-all" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
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
    sourceSelected: items.filter((item) => item.ideaSelected).length,
    creativeReady: items.filter((item) => item.creativeMd).length,
    creativeSelected: items.filter((item) => item.creativeSelected && item.creativeMd).length,
    screenplayReady: items.filter((item) => item.screenplayMd).length,
    screenplaySelected: items.filter((item) => item.screenplaySelected && item.screenplayMd).length,
    storyboardReady: items.filter((item) => item.storyboardMd).length,
  };
}

function filterItemsForStep(items: BatchItem[], step: WorkflowStep): BatchItem[] {
  if (step === "sources") return items;
  if (step === "creative") return items.filter((item) => item.ideaSelected || item.creativeMd);
  if (step === "screenplay") return items.filter((item) => item.creativeSelected || item.screenplayMd);
  return items.filter((item) => item.screenplaySelected || item.storyboardMd);
}

function isRunStage(value: BusyState | null): value is Stage {
  return value === "creative" || value === "screenplay" || value === "storyboard";
}

function selectTargetIds(items: BatchItem[], stage: Stage): string[] {
  if (stage === "creative") {
    return items.filter((item) => item.sourceText && !item.creativeMd && item.ideaSelected).map((item) => item.id);
  }
  if (stage === "screenplay") {
    return items.filter((item) => item.creativeMd && !item.screenplayMd && item.creativeSelected).map((item) => item.id);
  }
  return items.filter((item) => item.screenplayMd && !item.storyboardMd && item.screenplaySelected).map((item) => item.id);
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
