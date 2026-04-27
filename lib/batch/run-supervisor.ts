// Supervisor for batch runs.
//
// Why this exists: Next.js binds an HTTP request to a single AbortSignal that
// fires when the client disconnects (page refresh, tab close, network blip).
// Our batch screenplay/storyboard generation needs 10–20 minutes per project,
// so we cannot tie its lifetime to a single fetch. Instead, the run API hands
// the work off to this supervisor, which keeps the runner alive in-process
// and exposes a `getRunState` for the polling UI.
//
// State lives in module-scope, so it's per-Node-process. A container restart
// drops in-flight runs — that's acceptable here, the partial output is
// already persisted in SQLite and the user can hit "开始生成" again to
// resume from the cursor (chunked runner picks up where the database left
// off).

import { runBatchStage } from "./runner";
import type { BatchStage } from "./types";

interface SupervisedRun {
  batchId: string;
  stage: BatchStage;
  startedAt: number;
  promise: Promise<void>;
  abortController: AbortController;
}

const RUNS = new Map<string, SupervisedRun>();

function key(batchId: string, stage: BatchStage): string {
  return `${batchId}:${stage}`;
}

export interface StartRunResult {
  state: "started" | "already_running";
  startedAt: number;
}

export function startBatchRun(input: {
  batchId: string;
  stage: BatchStage;
  batchSize?: number;
  selectedOnly?: boolean;
}): StartRunResult {
  const k = key(input.batchId, input.stage);
  const existing = RUNS.get(k);
  if (existing) {
    return { state: "already_running", startedAt: existing.startedAt };
  }
  const abortController = new AbortController();
  const startedAt = Date.now();
  const promise = (async () => {
    try {
      await runBatchStage({
        batchId: input.batchId,
        stage: input.stage,
        batchSize: input.batchSize,
        selectedOnly: input.selectedOnly,
        signal: abortController.signal,
      });
    } catch (err) {
      // runBatchStage already persists failure state to the DB; we just log
      // here so a forgotten promise doesn't surface as an unhandled rejection.
      console.error(
        `[batch-supervisor] ${input.batchId}/${input.stage} ended with error:`,
        err instanceof Error ? err.message : err
      );
    } finally {
      RUNS.delete(k);
    }
  })();
  RUNS.set(k, { ...input, startedAt, promise, abortController });
  return { state: "started", startedAt };
}

export function getRunState(batchId: string, stage: BatchStage): { running: boolean; startedAt?: number } {
  const run = RUNS.get(key(batchId, stage));
  if (!run) return { running: false };
  return { running: true, startedAt: run.startedAt };
}

export function listActiveRuns(): Array<{ batchId: string; stage: BatchStage; startedAt: number }> {
  return Array.from(RUNS.values()).map(({ batchId, stage, startedAt }) => ({ batchId, stage, startedAt }));
}

export function cancelBatchRun(batchId: string, stage: BatchStage): boolean {
  const run = RUNS.get(key(batchId, stage));
  if (!run) return false;
  run.abortController.abort(new Error("user_cancelled"));
  return true;
}
