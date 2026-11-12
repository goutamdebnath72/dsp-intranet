// src/lib/live/http.ts
//
// THE SERVER'S WAY OF ASKING A PUBLIC WEBSITE FOR ITS NUMBERS (gold rates, fuel prices, news feeds, share indices). Used only by the /api/live routes, which read nothing from the user:
// the question put to the other site is always the same fixed address, never anything typed in the search window.
// A time limit on every call, an honest browser-like User-Agent, no cookies kept, and any answer that is not a success is an error (the routes then fall back to the last good answer).

export const BROWSER_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export interface GetOptions {
  timeoutMs?: number;
  headers?: Record<string, string>;
}

export class UpstreamError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

export async function getText(url: string, opts: GetOptions = {}): Promise<string> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), opts.timeoutMs ?? 8000);
  try {
    const r = await fetch(url, { cache: "no-store", signal: ctl.signal, headers: { "User-Agent": BROWSER_UA, Accept: "*/*", ...(opts.headers ?? {}) }, redirect: "follow" });
    if (!r.ok) throw new UpstreamError(`${new URL(url).host} answered ${r.status}`, r.status);
    return await r.text();
  } catch (e) {
    if (e instanceof UpstreamError) throw e;
    throw new UpstreamError(`${new URL(url).host} could not be reached`);
  } finally {
    clearTimeout(timer);
  }
}

export async function getJson<T>(url: string, opts: GetOptions = {}): Promise<T> {
  const text = await getText(url, { ...opts, headers: { Accept: "application/json, text/plain, */*", ...(opts.headers ?? {}) } });
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new UpstreamError(`${new URL(url).host} did not send JSON`);
  }
}
