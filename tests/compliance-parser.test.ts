import { describe, expect, it } from "vitest";
import { extractComplianceJson } from "../lib/drama/parsers/extract-compliance-json";

describe("extractComplianceJson", () => {
  it("extracts a fenced JSON report", () => {
    const raw = `
\`\`\`json
{
  "summary": "Overall safe after minor rewrites.",
  "totals": { "blocker": 1, "risk": 1, "pass": 2 },
  "items": [
    {
      "episode": 1,
      "level": "blocker",
      "category": "violence",
      "rule": "Avoid extreme gore",
      "finding": "The scene implies explicit torture.",
      "suggestion": "Cut the torture detail and keep only the threat."
    },
    {
      "episode": 2,
      "level": "pass",
      "category": "values",
      "rule": "Healthy value expression",
      "finding": "The protagonist rejects fraud temptation.",
      "suggestion": "Keep this moral choice explicit."
    }
  ],
  "globalAdvice": ["Keep romance PG-13.", "Avoid procedural how-to crime detail."]
}
\`\`\`
`;
    const parsed = extractComplianceJson(raw);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.data.totals.blocker).toBe(1);
      expect(parsed.data.globalAdvice).toHaveLength(2);
    }
  });

  it("returns a useful error on malformed payload", () => {
    const parsed = extractComplianceJson('{"summary":"x","totals":{}}');
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error).toContain("结构不符合要求");
    }
  });
});
