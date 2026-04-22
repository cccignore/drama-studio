import { describe, expect, it, vi, afterEach } from "vitest";
import { fetchWithRetry } from "../lib/llm/retry";

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

function mockFetchSeq(responses: Array<Response | Error>) {
  let i = 0;
  global.fetch = vi.fn(async () => {
    const next = responses[Math.min(i, responses.length - 1)];
    i += 1;
    if (next instanceof Error) throw next;
    return next;
  }) as unknown as typeof global.fetch;
  return () => (global.fetch as unknown as { mock: { calls: unknown[] } }).mock.calls.length;
}

describe("fetchWithRetry", () => {
  it("returns immediately on 2xx without retrying", async () => {
    const getCalls = mockFetchSeq([new Response("ok", { status: 200 })]);
    const res = await fetchWithRetry("https://example.test", {}, { delaysMs: [1, 1, 1] });
    expect(res.status).toBe(200);
    expect(getCalls()).toBe(1);
  });

  it("retries 429 then succeeds without bubbling the first response", async () => {
    const getCalls = mockFetchSeq([
      new Response("rate limit", { status: 429 }),
      new Response("ok", { status: 200 }),
    ]);
    const res = await fetchWithRetry(
      "https://example.test",
      {},
      { delaysMs: [1, 1] }
    );
    expect(res.status).toBe(200);
    expect(getCalls()).toBe(2);
  });

  it("does not retry 401 (auth errors)", async () => {
    const getCalls = mockFetchSeq([
      new Response("Unauthorized", { status: 401 }),
      new Response("ok", { status: 200 }),
    ]);
    const res = await fetchWithRetry(
      "https://example.test",
      {},
      { delaysMs: [1, 1] }
    );
    expect(res.status).toBe(401);
    expect(getCalls()).toBe(1);
  });

  it("retries bodies with ResourceExhausted even on non-standard statuses", async () => {
    const getCalls = mockFetchSeq([
      new Response(
        JSON.stringify({ message: "Admission denied by perf_based_admission_controller: ResourceExhausted" }),
        { status: 400 }
      ),
      new Response("ok", { status: 200 }),
    ]);
    const res = await fetchWithRetry(
      "https://example.test",
      {},
      { delaysMs: [1, 1] }
    );
    expect(res.status).toBe(200);
    expect(getCalls()).toBe(2);
  });

  it("respects Retry-After header (seconds form, lower-bounded by fallback)", async () => {
    const getCalls = mockFetchSeq([
      new Response("busy", { status: 429, headers: { "retry-after": "0" } }),
      new Response("ok", { status: 200 }),
    ]);
    const start = Date.now();
    const res = await fetchWithRetry(
      "https://example.test",
      {},
      { delaysMs: [50] }
    );
    expect(res.status).toBe(200);
    expect(getCalls()).toBe(2);
    expect(Date.now() - start).toBeGreaterThanOrEqual(50);
  });

  it("surfaces the last response after exhausting attempts", async () => {
    const getCalls = mockFetchSeq([
      new Response("rl", { status: 429 }),
      new Response("rl", { status: 429 }),
      new Response("rl", { status: 429 }),
    ]);
    const res = await fetchWithRetry(
      "https://example.test",
      {},
      { delaysMs: [1, 1], maxAttempts: 3 }
    );
    expect(res.status).toBe(429);
    expect(getCalls()).toBe(3);
  });

  it("propagates AbortError immediately", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      fetchWithRetry("https://example.test", { signal: controller.signal }, { signal: controller.signal })
    ).rejects.toThrow();
  });
});
