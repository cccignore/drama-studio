import { describe, expect, it } from "vitest";
import { buildRevisePrompt } from "../lib/drama/revise/prompts";

describe("buildRevisePrompt", () => {
  it("includes artifact description, recent turns and strict JSON constraints", () => {
    const messages = buildRevisePrompt(
      "episode-3",
      "# 第 3 集 · 重逢\n\n## 场 1 · 咖啡馆\n\n△ 开门。",
      "第 1 场台词加狠",
      [
        {
          id: 1,
          projectId: "p",
          artifactName: "episode-3",
          role: "user",
          content: "先压缩一点",
          patch: null,
          appliedVersion: null,
          ts: Date.now(),
        },
      ],
      "patch"
    );
    const user = messages[1].content;
    expect(user).toContain("单集剧本");
    expect(user).toContain("先压缩一点");
    expect(user).toContain('"patches"');
    expect(user).toContain("anchor_before + old 必须");
  });
});
