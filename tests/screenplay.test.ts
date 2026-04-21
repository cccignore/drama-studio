import { describe, expect, it } from "vitest";
import {
  parseScreenplay,
  summarizeScreenplay,
  extractEpisodeTail,
} from "../lib/drama/parsers/screenplay";

const sample = `# 第 1 集 · 重逢

## 场 1 · 咖啡馆（上海外滩/日）

△ （特写）林夏推门而入，雨水顺着伞尖滴落。
♪ 轻柔钢琴曲铺底。
**林夏**（惊讶）：你怎么会在这里？
**陆辰**：我等了你三年。
这是一条普通备注，不属于任何块类型。

## 场 2 · 天台（顶楼/夜）

△ 两人并肩而立，城市灯火在身后铺开成河。
**陆辰**（低声）：这一次，我不会再放手。

【本集完】
`;

describe("parseScreenplay", () => {
  it("extracts episode index and title", () => {
    const ast = parseScreenplay(sample);
    expect(ast.episodeIndex).toBe(1);
    expect(ast.title).toBe("重逢");
    expect(ast.closed).toBe(true);
  });

  it("parses scenes with location and time", () => {
    const ast = parseScreenplay(sample);
    expect(ast.scenes).toHaveLength(2);
    expect(ast.scenes[0].name).toBe("咖啡馆");
    expect(ast.scenes[0].location).toBe("上海外滩");
    expect(ast.scenes[0].time).toBe("日");
    expect(ast.scenes[1].time).toBe("夜");
  });

  it("captures dialogue, action with camera, music, and note blocks", () => {
    const ast = parseScreenplay(sample);
    const scene1 = ast.scenes[0];
    const action = scene1.blocks.find((b) => b.kind === "action");
    const music = scene1.blocks.find((b) => b.kind === "music");
    const dialogues = scene1.blocks.filter((b) => b.kind === "dialogue");
    const note = scene1.blocks.find((b) => b.kind === "note");

    expect(action).toMatchObject({ kind: "action", camera: "特写" });
    expect(music?.kind).toBe("music");
    expect(dialogues).toHaveLength(2);
    expect(dialogues[0]).toMatchObject({ role: "林夏", emotion: "惊讶" });
    expect(note?.kind).toBe("note");
  });

  it("marks closed=false when episode-end marker is absent", () => {
    const ast = parseScreenplay("# 第 2 集 · 暂未完结\n\n## 场 1 · 空镜 / 晨\n\n△ 空。\n");
    expect(ast.closed).toBe(false);
  });

  it("parses bilingual overseas dialogue with English colon", () => {
    const ast = parseScreenplay(`# 第 1 集 · The Return（归来）

## 场 1 · Café at 5th Avenue（纽约咖啡馆 / 日）

△ （特写）林夏（Lin Xia）推门而入。
♪ 低沉钢琴声。
**林夏 / Lin Xia**（惊讶）: "Chen? What are you doing here?"
**Chen Morrison**（冷静）: "I have been waiting for you. For three years."

【本集完】`);
    expect(ast.scenes).toHaveLength(1);
    const dialogues = ast.scenes[0].blocks.filter((b) => b.kind === "dialogue");
    expect(dialogues[0]).toMatchObject({
      kind: "dialogue",
      role: "林夏 / Lin Xia",
      emotion: "惊讶",
      line: "Chen? What are you doing here?",
    });
    expect(dialogues[1]).toMatchObject({
      kind: "dialogue",
      role: "Chen Morrison",
      line: "I have been waiting for you. For three years.",
    });
  });
});

describe("summarizeScreenplay", () => {
  it("counts blocks and flags long dialogue lines", () => {
    const ast = parseScreenplay(sample);
    const stats = summarizeScreenplay(ast);
    expect(stats.sceneCount).toBe(2);
    expect(stats.dialogueCount).toBe(3);
    expect(stats.actionCount).toBe(2);
    expect(stats.musicCount).toBe(1);
    expect(stats.longLines).toBe(0);
    expect(stats.avgSceneLen).toBeGreaterThan(0);
  });

  it("returns zero avgSceneLen when there are no scenes", () => {
    const ast = parseScreenplay("");
    expect(summarizeScreenplay(ast).avgSceneLen).toBe(0);
  });
});

describe("extractEpisodeTail", () => {
  it("returns full text when shorter than maxChars", () => {
    expect(extractEpisodeTail("短剧本", 100)).toBe("短剧本");
  });

  it("returns the tail slice when longer than maxChars", () => {
    const long = "a".repeat(500) + "TAIL_MARKER";
    const tail = extractEpisodeTail(long, 20);
    expect(tail.length).toBe(20);
    expect(tail.endsWith("TAIL_MARKER")).toBe(true);
  });
});
