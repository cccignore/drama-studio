import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb } from "../lib/db/sqlite";
import { insertLLMConfig, upsertProjectLLMBinding } from "../lib/llm/store";
import { upsertLLMRoleBinding } from "../lib/llm/role-store";
import { resolveConfigForCommand } from "../lib/llm/router";

let tmpDir = "";

describe("slot based llm router", () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "drama-router-"));
    process.env.DRAMA_DATA_DIR = tmpDir;
    process.env.APP_SECRET = "test-secret";
    closeDb();
  });

  afterEach(() => {
    closeDb();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.DRAMA_DATA_DIR;
  });

  it("resolves slot binding before falling back to default", () => {
    insertLLMConfig({
      id: "default-model",
      name: "Default",
      protocol: "openai",
      baseUrl: "https://example.com/v1",
      apiKey: "sk-default",
      model: "default",
      isDefault: true,
    });
    insertLLMConfig({
      id: "primary-model",
      name: "Primary",
      protocol: "openai",
      baseUrl: "https://example.com/v1",
      apiKey: "sk-primary",
      model: "gpt-5.4",
    });
    upsertLLMRoleBinding("primary", "primary-model");
    upsertProjectLLMBinding("project-1", "episode", "slot:primary");

    expect(resolveConfigForCommand("episode", "project-1")?.model).toBe("gpt-5.4");
    expect(resolveConfigForCommand("plan", "project-1")?.model).toBe("default");
  });
});
