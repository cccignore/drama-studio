import { describe, expect, it } from "vitest";
import { csvToItems, itemsToCsv } from "../lib/batch/csv";
import { renderBatchMarkdown } from "../lib/batch/export";
import { buildCreativeMessages, buildScreenplayMessages, buildStoryboardMessages, parseSourceDramas } from "../lib/batch/prompts";
import { extractCreativeHead, parseCreativeStructured } from "../lib/batch/runner";
import { extractDetailUrls, parsePayamiDetail, scrapedSourcesToText } from "../lib/batch/scrape";
import { closeDb } from "../lib/db/sqlite";
import { createBatchProject, listBatchItems, upsertImportedItems } from "../lib/batch/store";
import type { BatchItem, BatchProject } from "../lib/batch/types";

function project(overrides: Partial<BatchProject> = {}): BatchProject {
  return {
    id: "bat_1",
    title: "红果批量测试",
    sourceText: "红果热榜：闪婚后我成了豪门继承人",
    targetMarket: "overseas",
    totalEpisodes: 30,
    status: "draft",
    useComplexReversal: false,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function item(patch: Partial<BatchItem> = {}): BatchItem {
  return {
    id: "bit_1",
    batchId: "bat_1",
    sourceTitle: "闪婚后我成了豪门继承人",
    sourceKeywords: "闪婚 | 豪门 | 继承人",
    sourceSummary: "灰姑娘闪婚后卷入豪门继承权争夺。",
    sourceText: "闪婚",
    title: "The Contract Heiress",
    oneLiner: "A broke waitress signs a fake marriage contract, only to expose a billionaire family's buried heir.",
    protagonist: "",
    narrativePov: "",
    audience: "",
    storyType: "",
    setting: "",
    act1: "",
    act2: "",
    act3: "",
    creativeMd: "## Act 1\nFake marriage begins.",
    screenplayMd: "# 第 1 集\n剧本正文",
    storyboardMd: "# 第 1 集分镜\n#001 WS",
    ideaSelected: true,
    creativeSelected: true,
    screenplaySelected: true,
    status: "storyboard_ready",
    error: "",
    meta: null,
    createdAt: 1,
    updatedAt: 1,
    ...patch,
  };
}

describe("batch factory", () => {
  it("parses each Hongguo source line into one batch item source", () => {
    const sources = parseSourceDramas([
      "闪婚后我成了豪门继承人 | 闪婚,豪门 | 灰姑娘卷入继承权争夺",
      "离婚后前夫追悔莫及 | 追妻火葬场 | 女主逆袭复仇",
    ].join("\n"));
    expect(sources).toHaveLength(2);
    expect(sources[0]).toMatchObject({
      sourceTitle: "闪婚后我成了豪门继承人",
      sourceKeywords: "闪婚,豪门",
      sourceSummary: "灰姑娘卷入继承权争夺",
    });
  });

  it("builds a one-to-one creative prompt from a single source drama", () => {
    const messages = buildCreativeMessages(project(), item());
    expect(messages[1].content).toContain("基于这 1 部红果源剧");
    expect(messages[1].content).toContain("新剧名:");
    expect(messages[1].content).toContain("第一主角:");
    expect(messages[1].content).toContain("故事梗概: Act 1:");
    expect(messages[1].content).toContain("Act 2:");
    expect(messages[1].content).toContain("Act 3:");
  });

  it("keeps overseas review text in Chinese except storyboard dialogue/SFX", () => {
    const screenplayMessages = buildScreenplayMessages(project(), item());
    const storyboardMessages = buildStoryboardMessages(project(), item());
    expect(screenplayMessages[1].content).toContain("禁止整段英文");
    expect(screenplayMessages[1].content).toContain("台词、画面文本仍用中文");
    expect(storyboardMessages[1].content).toContain("只有「台词/SFX」字段使用英文");
    expect(storyboardMessages[1].content).toContain("备注全部使用中文");
  });

  it("extracts title and one-liner from numbered markdown creative output (legacy)", () => {
    const head = extractCreativeHead([
      "# 1. 新剧名",
      "**《The Heiress Decoy Married the Devil Heir》**",
      "",
      "# 2. 一句话题材",
      "一个女孩假扮豪门继承人并被迫签下契约婚姻。",
    ].join("\n"));
    expect(head.title).toBe("The Heiress Decoy Married the Devil Heir");
    expect(head.oneLiner).toBe("一个女孩假扮豪门继承人并被迫签下契约婚姻。");
  });

  it("parses structured creative output into 8 fields", () => {
    const sample = [
      "新剧名: GLASS PRISON",
      "第一主角: Lucas——28 岁，瘦削敏感的记忆架构师，黑框眼镜下藏着忧郁的眼神。",
      "叙事视角: 第三人称限制视角（跟随Lucas）",
      "受众: 男性",
      "故事类型: 科幻+记忆+身份质疑",
      "故事背景: 2050年+记忆科技+监狱系统",
      "故事梗概: Act 1: Lucas 在玻璃监狱工作，构建囚犯记忆。",
      "Act 2: Lucas 发现自己也是囚犯。",
      "Act 3: Lucas 在真实监狱中觉醒。",
    ].join("\n");
    const parsed = parseCreativeStructured(sample);
    expect(parsed.title).toBe("GLASS PRISON");
    expect(parsed.audience).toBe("男性");
    expect(parsed.storyType).toBe("科幻+记忆+身份质疑");
    expect(parsed.setting).toBe("2050年+记忆科技+监狱系统");
    expect(parsed.act1).toContain("玻璃监狱");
    expect(parsed.act2).toContain("Lucas 发现自己");
    expect(parsed.act3).toContain("真实监狱");
    expect(parsed.protagonist).toContain("Lucas");
  });

  it("round trips candidate CSV for human review", () => {
    const csv = itemsToCsv([item({ creativeMd: "Act, with comma" })]);
    expect(csv).toContain('"Act, with comma"');
    const rows = csvToItems(csv);
    expect(rows[0].title).toBe("The Contract Heiress");
    expect(rows[0].creativeMd).toBe("Act, with comma");
  });

  it("CSV-is-truth: importing with replaceAll deletes rows missing from CSV", () => {
    process.env.DRAMA_DATA_DIR = `/tmp/drama-batch-test-${Date.now()}-${Math.random()}`;
    closeDb();
    const batch = createBatchProject({
      title: "筛选测试",
      targetMarket: "overseas",
      totalEpisodes: 30,
      sourceText: [
        "源剧 A | 复仇 | A 简介",
        "源剧 B | 豪门 | B 简介",
      ].join("\n"),
    });
    const before = listBatchItems(batch.id);
    expect(before).toHaveLength(2);
    const keptCsv = itemsToCsv([before[0]]);
    upsertImportedItems(batch.id, csvToItems(keptCsv), { replaceAll: true });
    const after = listBatchItems(batch.id);
    expect(after).toHaveLength(1);
    expect(after[0].id).toBe(before[0].id);
    closeDb();
  });

  it("imports a structured creative CSV with no source rows (skip directly to screenplay)", () => {
    process.env.DRAMA_DATA_DIR = `/tmp/drama-batch-test-${Date.now()}-${Math.random()}`;
    closeDb();
    const batch = createBatchProject({
      title: "结构化导入",
      targetMarket: "overseas",
      totalEpisodes: 30,
      sourceText: "占位",
    });
    const ideasCsv = [
      "id,target_title,audience,narrative_pov,story_type,setting,protagonist,act1,act2,act3,status",
      ',GLASS PRISON,男性,第三人称限制视角,科幻+记忆+身份质疑,2050年+记忆科技+监狱系统,Lucas——28岁记忆架构师,Act1 内容,Act2 内容,Act3 内容,creative_ready',
    ].join("\n");
    const rows = csvToItems(ideasCsv);
    upsertImportedItems(batch.id, rows, { replaceAll: true });
    const after = listBatchItems(batch.id);
    expect(after).toHaveLength(1);
    expect(after[0].title).toBe("GLASS PRISON");
    expect(after[0].act1).toBe("Act1 内容");
    expect(after[0].status).toBe("creative_ready");
    closeDb();
  });

  it("exports each intermediate stage separately", () => {
    const screenplay = renderBatchMarkdown(project(), [item()], "screenplay");
    const storyboard = renderBatchMarkdown(project(), [item()], "storyboard");
    expect(screenplay).toContain("剧本正文");
    expect(screenplay).not.toContain("#001 WS");
    expect(storyboard).toContain("#001 WS");
  });

  it("extracts public Hongguo drama detail pages and normalizes source text", () => {
    const urls = extractDetailUrls(`<a href="/vq/122600.html">A</a><a href="/vq/122600.html">A</a>`);
    expect(urls).toEqual(["https://www.payami.cn/vq/122600.html"]);
    const detail = parsePayamiDetail(
      `<meta property="og:title" content="假冒千金后，我成了豪门真团宠">
       <meta property="og:description" content="市井女孩被豪门选中，假冒千金踏入危机。">
       <span class="video-info-itemtitle">TAG：</span><div><a>都市日常</a><a>反转</a><a>逆袭</a></div>
       <span class="video-info-itemtitle">连载：</span><div>更新到第 30 集</div>`,
      "https://www.payami.cn/vq/122600.html"
    );
    expect(detail?.sourceKeywords).toContain("都市日常");
    expect(detail?.sourceKeywords).toContain("更新到第 30 集");
    expect(scrapedSourcesToText(detail ? [detail] : [])).toContain("假冒千金后，我成了豪门真团宠 |");
  });
});
