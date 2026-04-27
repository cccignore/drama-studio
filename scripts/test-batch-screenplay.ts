/**
 * End-to-end smoke test for the batch-factory screenplay stage.
 * Imports the first row of result/ideas-from-docx.csv into a fresh batch and
 * runs the screenplay stage with a small totalEpisodes to keep cost bounded.
 *
 * Usage:
 *   npx tsx scripts/test-batch-screenplay.ts
 */
import fs from "node:fs";
import path from "node:path";

import { csvToItems } from "../lib/batch/csv";
import { renderCreativeMd, parseCreativeStructured } from "../lib/batch/runner";
import { runBatchStage } from "../lib/batch/runner";
import {
  createBatchProject,
  deleteBatchProject,
  listBatchItems,
  upsertImportedItems,
} from "../lib/batch/store";

async function main() {
  const csvPath = path.resolve(process.cwd(), "result/ideas-from-docx.csv");
  const csv = fs.readFileSync(csvPath, "utf8");
  const allRows = csvToItems(csv);
  if (allRows.length === 0) throw new Error("CSV 为空");
  const first = allRows[0];
  console.log(`[test] 选用创意: ${first.title}`);
  console.log(`[test]   audience=${first.audience}, story_type=${first.storyType}`);
  console.log(`[test]   act1.len=${(first.act1 ?? "").length}, act2.len=${(first.act2 ?? "").length}, act3.len=${(first.act3 ?? "").length}`);

  // 把 act1/act2/act3 渲染回 creative_md，方便剧本 prompt 用
  if (!first.creativeMd && (first.act1 || first.act2 || first.act3)) {
    first.creativeMd = renderCreativeMd({
      title: first.title ?? "",
      oneLiner: first.oneLiner ?? "",
      protagonist: first.protagonist ?? "",
      narrativePov: first.narrativePov ?? "",
      audience: first.audience ?? "",
      storyType: first.storyType ?? "",
      setting: first.setting ?? "",
      act1: first.act1 ?? "",
      act2: first.act2 ?? "",
      act3: first.act3 ?? "",
    });
  }

  // 1) 建一个临时 batch
  const batch = createBatchProject({
    title: `[smoke] ${first.title}`,
    targetMarket: "overseas",
    totalEpisodes: 3, // <-- 控制成本：只生成 3 集
    sourceText: "占位 - structured-import test",
    useComplexReversal: false,
  });
  console.log(`[test] 已建批次: ${batch.id}`);

  try {
    // 2) 导入这一条创意（作为唯一的行）
    upsertImportedItems(batch.id, [{ ...first, id: undefined }], { replaceAll: true });
    const items = listBatchItems(batch.id);
    if (items.length !== 1) throw new Error(`预期 1 条，实际 ${items.length}`);
    const inserted = items[0];
    console.log(`[test] 已导入: id=${inserted.id}, status=${inserted.status}`);
    console.log(`[test]   creative_md.len=${inserted.creativeMd.length}`);

    // 3) 跑剧本阶段
    console.log(`[test] 开始跑剧本 (totalEpisodes=${batch.totalEpisodes})...`);
    const t0 = Date.now();
    const result = await runBatchStage({
      batchId: batch.id,
      stage: "screenplay",
      batchSize: 1,
      selectedOnly: false,
    });
    const dt = Math.round((Date.now() - t0) / 100) / 10;
    console.log(`[test] 完成: updated=${result.updated}, failed=${result.failed}, 耗时 ${dt}s`);

    // 4) 打印输出
    const after = listBatchItems(batch.id);
    const out = after[0];
    if (out.error) console.error(`[test] error: ${out.error}`);
    console.log(`\n[test] ===== 剧本输出 (status=${out.status}) =====`);
    console.log(out.screenplayMd);
    console.log(`\n[test] ===== 输出结尾 =====`);
    console.log(`[test] screenplay_md 长度: ${out.screenplayMd.length}`);

    // 落盘方便人工查看
    const outDir = path.resolve(process.cwd(), "result");
    fs.writeFileSync(
      path.join(outDir, `smoke-${batch.id}.md`),
      `# Smoke test: ${first.title}\n\n## Creative\n${out.creativeMd}\n\n## Screenplay\n${out.screenplayMd}\n`
    );
    console.log(`[test] 已写: result/smoke-${batch.id}.md`);
  } finally {
    // 清理临时 batch（不污染列表）
    deleteBatchProject(batch.id);
    console.log(`[test] 已删除临时 batch ${batch.id}`);
  }
}

main().catch((err) => {
  console.error("[test] FAILED:", err);
  process.exit(1);
});
