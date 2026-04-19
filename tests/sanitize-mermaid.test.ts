import { describe, expect, it } from "vitest";
import { sanitizeMermaid } from "../lib/drama/parsers/sanitize-mermaid";

describe("sanitizeMermaid", () => {
  it("normalizes broken arrows split by spaces", () => {
    const input = [
      "graph TD",
      "  A2 -- 暗中保护与支持 -- > A1",
      "  B1 == 资源倾斜 == > A1",
    ].join("\n");

    expect(sanitizeMermaid(input)).toContain("A2 -- 暗中保护与支持 --> A1");
    expect(sanitizeMermaid(input)).toContain("B1 == 资源倾斜 ==> A1");
  });
});
