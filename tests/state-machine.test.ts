import { describe, expect, it } from "vitest";
import {
  canAccessStep,
  canRunCommand,
  deriveMaxAccessibleStep,
  promoteStep,
} from "../lib/drama/state-machine";
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
});
