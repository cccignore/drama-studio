import { describe, expect, it } from "vitest";
import { csvToItems, itemsToCsv } from "../lib/batch/csv";
import { renderBatchMarkdown } from "../lib/batch/export";
import { buildCreativeMessages, buildScreenplayMessages, buildStoryboardMessages, parseSourceDramas } from "../lib/batch/prompts";
import { extractCreativeHead, parseCreativeStructured, lastCompleteEpisodeNumber, trimToEpisode, lastStoryboardEpisode, trimToStoryboardEpisode } from "../lib/batch/runner";
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
    worldview: "",
    visualTone: "",
    coreTheme: "",
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

  it("builds a creative prompt from a one-line topic and enforces 12-label output", () => {
    const messages = buildCreativeMessages(project(), item());
    // The verified long system prompt (项目目标 / 防串味 / 写作原则) lives on
    // the system message; the user message is short and centers on the
    // one-liner plus the strict 12-label format the parser expects (matching
    // the 4 一级章节: 题材与三幕大纲 + 世界观设定 + 视觉基调 + 核心主题).
    expect(messages[0].role).toBe("system");
    expect(messages[0].content).toContain("强投流感");
    expect(messages[0].content).toContain("防串味要求");
    expect(messages[1].content).toContain("【一句话题材】");
    expect(messages[1].content).toContain("基于以上一句话题材");
    expect(messages[1].content).toContain("新剧名:");
    expect(messages[1].content).toContain("第一主角:");
    expect(messages[1].content).toContain("故事梗概: Act 1:");
    expect(messages[1].content).toContain("Act 2:");
    expect(messages[1].content).toContain("Act 3:");
    expect(messages[1].content).toContain("世界观设定:");
    expect(messages[1].content).toContain("视觉基调:");
    expect(messages[1].content).toContain("核心主题:");
    // The new prompt forbids the model from emitting Optional Upgrade — the
    // parser only knows the 12 canonical labels.
    expect(messages[1].content).toContain("严禁输出 Optional Upgrade");
  });

  it("keeps overseas review text in Chinese except dialogue & storyboard dialogue", () => {
    const screenplayMessages = buildScreenplayMessages(project(), item());
    const storyboardMessages = buildStoryboardMessages(project(), item());
    // Screenplay dialogue is bilingual (English + Chinese), but every other
    // label/scene/action stays in Chinese for the in-house reviewer.
    expect(screenplayMessages[1].content).toContain("过程描写");
    expect(screenplayMessages[1].content).toContain("先写一行英文台词");
    expect(screenplayMessages[1].content).toContain("再写一行中文翻译");
    // Storyboard: only the 中英双语台词 column carries English; other columns
    // (画面描述 / 景别 / 视觉锚点 / 备注) remain Chinese.
    expect(storyboardMessages[1].content).toContain("中英双语台词");
    expect(storyboardMessages[1].content).toContain("只有「中英双语台词」一列出现英文");
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

  it("parses structured creative output into 12 fields and stops Act 3 at post-act sections", () => {
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
      "世界观设定: 2050 年的极权国家用记忆作为流通货币，玻璃监狱是中央服务器。",
      "视觉基调: 高对比冷蓝 + 单点光面孔特写，参考《银翼杀手 2049》。",
      "核心主题: 身份是被剥夺的，最深的反抗是夺回记忆。",
    ].join("\n");
    const parsed = parseCreativeStructured(sample);
    expect(parsed.title).toBe("GLASS PRISON");
    expect(parsed.audience).toBe("男性");
    expect(parsed.storyType).toBe("科幻+记忆+身份质疑");
    expect(parsed.setting).toBe("2050年+记忆科技+监狱系统");
    expect(parsed.act1).toContain("玻璃监狱");
    expect(parsed.act2).toContain("Lucas 发现自己");
    expect(parsed.act3).toContain("真实监狱");
    // Critical: Act 3 must NOT swallow the three trailing sections.
    expect(parsed.act3).not.toContain("世界观");
    expect(parsed.act3).not.toContain("视觉基调");
    expect(parsed.protagonist).toContain("Lucas");
    expect(parsed.worldview).toContain("玻璃监狱");
    expect(parsed.visualTone).toContain("高对比冷蓝");
    expect(parsed.coreTheme).toContain("身份");
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

describe("chunked screenplay episode bookkeeping", () => {
  const sample = [
    "第 1 集",
    "1-1",
    "场景：A",
    "人物：X",
    "过程描写：",
    "△something",
    "X：hi",
    "钩子：",
    "悬念句。",
    "",
    "第 2 集",
    "2-1",
    "场景：B",
    "人物：Y",
    "过程描写：",
    "△something",
    "Y：hi",
    "钩子：",
    "悬念句。",
    "",
    "第 3 集",
    "3-1",
    "场景：half-written",
    "人物：Z",
    "过程描写：",
    "△something",
    // No 钩子: → episode 3 is incomplete (truncated mid-write).
  ].join("\n");

  it("treats only fully-hooked episodes as complete", () => {
    expect(lastCompleteEpisodeNumber(sample)).toBe(2);
  });

  it("returns null when nothing is complete yet", () => {
    expect(
      lastCompleteEpisodeNumber("第 1 集\n1-1\n场景：A\n（writing in progress…）")
    ).toBeNull();
  });

  it("trimToEpisode drops everything after the boundary", () => {
    const trimmed = trimToEpisode(sample, 2);
    expect(trimmed).toContain("第 1 集");
    expect(trimmed).toContain("第 2 集");
    expect(trimmed).not.toContain("第 3 集");
    expect(trimmed).not.toContain("half-written");
  });

  it("storyboard helpers count rows and trim correctly", () => {
    const sb = [
      "## 第 1 集分镜（约 60s）",
      "| 镜头号 | 逐秒分镜画面描述 | 中英双语台词 | 运镜方式/景别 | 人物图/场景图 | 备注 | 时长 |",
      "| --- | --- | --- | --- | --- | --- | --- |",
      "| 1 | 0:00-0:04 ... | A：hi | 近景 | x | y | 4 |",
      "",
      "## 第 2 集分镜（约 62s）",
      "| 镜头号 | 逐秒分镜画面描述 | 中英双语台词 | 运镜方式/景别 | 人物图/场景图 | 备注 | 时长 |",
      "| --- | --- | --- | --- | --- | --- | --- |",
      "| 1 | 0:00-0:04 ... | A：hi | 近景 | x | y | 4 |",
      "",
      "## 第 3 集分镜（约 60s）",
      // No row body — episode 3 is incomplete.
    ].join("\n");
    expect(lastStoryboardEpisode(sb)).toBe(2);
    const trimmed = trimToStoryboardEpisode(sb, 2);
    expect(trimmed).toContain("第 1 集分镜");
    expect(trimmed).toContain("第 2 集分镜");
    expect(trimmed).not.toContain("第 3 集分镜");
  });
});
