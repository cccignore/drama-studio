import { describe, expect, it } from "vitest";
import {
  canAccessStep,
  canRunCommand,
  deriveMaxAccessibleStep,
  promoteStep,
} from "../lib/drama/state-machine";
import { mergeStateWithoutRollback } from "../lib/drama/store";
import { defaultDramaState } from "../lib/drama/types";

describe("state-machine", () => {
  it("allows review and export access after at least one episode is written", () => {
    const state = { ...defaultDramaState(), currentStep: "episode" as const };
    expect(canRunCommand("review", state, { writtenEpisodes: 1 })).toEqual({ ok: true });
    expect(canAccessStep("export", state, { writtenEpisodes: 1 })).toBe(true);
    expect(deriveMaxAccessibleStep(state, { writtenEpisodes: 1 })).toBe("export");
  });

  it("blocks compliance before any episode exists and allows it after writing", () => {
    const state = { ...defaultDramaState(), currentStep: "episode" as const };
    expect(canRunCommand("compliance", state, { writtenEpisodes: 0 })).toMatchObject({
      ok: false,
    });
    expect(canRunCommand("compliance", state, { writtenEpisodes: 2 })).toEqual({ ok: true });
  });

  it("allows overseas after start and promotes review forward only", () => {
    const state = { ...defaultDramaState(), currentStep: "start" as const };
    expect(canRunCommand("overseas", state)).toEqual({ ok: true });
    expect(promoteStep(state, "review").currentStep).toBe("review");
    expect(promoteStep({ ...state, currentStep: "review" }, "plan").currentStep).toBe("review");
  });

  it("allows creative command after start is complete", () => {
    const atStart = { ...defaultDramaState(), currentStep: "start" as const };
    // currentStep=start, target=creative (idx 1) > current (idx 0) → blocked
    expect(canRunCommand("creative", atStart)).toMatchObject({ ok: false });
    const atCreative = { ...defaultDramaState(), currentStep: "creative" as const };
    expect(canRunCommand("creative", atCreative)).toEqual({ ok: true });
  });

  it("allows storyboard after at least one episode is written, regardless of step", () => {
    const midWrite = { ...defaultDramaState(), currentStep: "episode" as const };
    expect(canRunCommand("storyboard", midWrite, { writtenEpisodes: 1 })).toEqual({ ok: true });
    // before any episode is written, storyboard should still be blocked unless currentStep reaches storyboard
    expect(canRunCommand("storyboard", midWrite, { writtenEpisodes: 0 })).toMatchObject({ ok: false });
  });

  it("prevents project state patches from rolling back currentStep", () => {
    const state = { ...defaultDramaState(), currentStep: "episode" as const };
    expect(mergeStateWithoutRollback(state, { currentStep: "start" }).currentStep).toBe("episode");
    expect(mergeStateWithoutRollback(state, { currentStep: "review" }).currentStep).toBe("review");
  });
});
