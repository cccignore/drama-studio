import { describe, expect, it } from "vitest";
import { loadRefsForCommand } from "../lib/drama/references";

describe("loadRefsForCommand", () => {
  it("loads opening rules for the first three episodes only", () => {
    const firstEpisodeRefs = loadRefsForCommand("episode", { episodeIndex: 1 });
    const laterEpisodeRefs = loadRefsForCommand("episode", { episodeIndex: 5 });
    expect(firstEpisodeRefs).toContain("<<<REF:opening-rules>>>");
    expect(laterEpisodeRefs).not.toContain("<<<REF:opening-rules>>>");
  });

  it("loads hook design for outline and compliance checklist for compliance", () => {
    expect(loadRefsForCommand("outline")).toContain("hook-design");
    expect(loadRefsForCommand("compliance")).toContain("compliance-checklist");
  });
});
