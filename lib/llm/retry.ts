/**
 * Fetch with bounded retries for transient upstream failures.
 *
 * Retries only on:
 *   - network errors (fetch throws)
 *   - HTTP 408 / 425 / 429 / 500 / 502 / 503 / 504
 *   - response bodies containing rate-limit / capacity / ResourceExhausted markers
 *
 * Does NOT retry:
 *   - 4xx other than the above (bad request / auth / context-too-long)
 *   - once the response body has started streaming — callers handle that themselves
 *   - after the caller's signal is aborted
 *
 * Backoff: 800ms / 2400ms / 6000ms (capped by Retry-After header when present).
 */

const RETRIABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const RETRIABLE_BODY_RE = /rate[\s-]?limit|too many requests|quota|capacity|resourceexhausted|admission denied|load_shed|overloaded/i;
const DEFAULT_DELAYS_MS = [800, 2400, 6000];

export interface FetchWithRetryOptions {
  maxAttempts?: number;
  delaysMs?: number[];
  onRetry?: (info: { attempt: number; delayMs: number; reason: string }) => void;
  signal?: AbortSignal;
}

export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  options: FetchWithRetryOptions = {}
): Promise<Response> {
  const delays = options.delaysMs ?? DEFAULT_DELAYS_MS;
  const maxAttempts = options.maxAttempts ?? delays.length + 1;
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (options.signal?.aborted) throw new DOMException("Aborted", "AbortError");

    let res: Response;
    try {
      res = await fetch(url, init);
    } catch (err) {
      lastError = err;
      if (!shouldRetryOnNetworkError(err)) throw err;
      const delay = pickDelay(delays, attempt);
      if (attempt >= maxAttempts) throw err;
      options.onRetry?.({
        attempt,
        delayMs: delay,
        reason: `network error: ${errorMessage(err)}`,
      });
      await sleep(delay, options.signal);
      continue;
    }

    if (res.ok) return res;

    if (!RETRIABLE_STATUSES.has(res.status)) {
      const peek = await peekBody(res);
      if (!(peek && RETRIABLE_BODY_RE.test(peek))) {
        return rebuildResponse(res, peek);
      }
      // fall through into the retry branch when body indicates transient overload
      if (attempt >= maxAttempts) return rebuildResponse(res, peek);
      const delay = resolveDelay(res, delays, attempt);
      options.onRetry?.({
        attempt,
        delayMs: delay,
        reason: `status ${res.status} · ${previewBody(peek)}`,
      });
      await sleep(delay, options.signal);
      continue;
    }

    if (attempt >= maxAttempts) return res;

    const peek = await peekBody(res);
    const delay = resolveDelay(res, delays, attempt);
    options.onRetry?.({
      attempt,
      delayMs: delay,
      reason: `status ${res.status}${peek ? ` · ${previewBody(peek)}` : ""}`,
    });
    await sleep(delay, options.signal);
  }

  // unreachable under normal control flow
  throw lastError ?? new Error("fetchWithRetry exhausted attempts");
}

function shouldRetryOnNetworkError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === "AbortError") return false;
  const msg = errorMessage(err).toLowerCase();
  return /fetch failed|network|socket|econn|etimedout|timeout/.test(msg);
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function pickDelay(delays: number[], attempt: number): number {
  if (attempt <= 0) return delays[0] ?? 1000;
  return delays[Math.min(attempt - 1, delays.length - 1)] ?? delays[delays.length - 1] ?? 1000;
}

function resolveDelay(res: Response, delays: number[], attempt: number): number {
  const fallback = pickDelay(delays, attempt);
  const header = res.headers.get("retry-after");
  if (!header) return fallback;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(Math.max(seconds * 1000, fallback), 30_000);
  }
  const date = Date.parse(header);
  if (Number.isFinite(date)) {
    const ms = date - Date.now();
    if (ms > 0) return Math.min(Math.max(ms, fallback), 30_000);
  }
  return fallback;
}

async function peekBody(res: Response): Promise<string | null> {
  try {
    return await res.clone().text();
  } catch {
    return null;
  }
}

function rebuildResponse(res: Response, body: string | null): Response {
  if (body === null) return res;
  return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
}

function previewBody(body: string | null): string {
  if (!body) return "";
  const compact = body.replace(/\s+/g, " ").trim();
  return compact.length > 80 ? `${compact.slice(0, 80)}…` : compact;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("Aborted", "AbortError"));
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
