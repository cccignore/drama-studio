// Centralized output-token budgets for every LLM call site.
//
// `max_tokens` is an upper bound, not expected usage — raising it does not
// charge more when the model finishes earlier; it only matters when the model
// would otherwise be cut off mid-output. Calibrated for GPT-class providers
// with typical max_output 8k–16k. If a provider rejects a value here, narrow
// that single key rather than re-introducing literals at call sites.
//
// 中文产物 1 token ≈ 1.6–2 字。

export const TOKEN_BUDGETS = {
  // Connectivity probes — never returns user content.
  ping: 16,

  // Single-label classification, retitle, ping-style completions.
  classify: 256,

  // Tiny patches, repair fragments, critic micro-output.
  microEdit: 900,

  // One-liner, beat hint, agent-task default, planner micro-output.
  shortDraft: 1200,

  // 立项卡, 简短草稿.
  briefDraft: 1500,

  // plan / overseas-brief / characters-repair merge.
  outlineDraft: 2400,

  // Long primary deliverables: creative, episode, storyboard, characters,
  // long review, revise-rewrite, every batch-factory stage.
  longArtifact: 8000,

  // Outline (分集目录) — 80+ episode shows can legitimately need this.
  megaArtifact: 12000,

  // Structured JSON (review, compliance, revise-patch locator). JSON output
  // costs more tokens per character due to escaping, so keep extra headroom.
  reviewJson: 4000,
} as const;
