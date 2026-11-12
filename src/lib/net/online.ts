// src/lib/net/online.ts
//
// IS THIS COMPUTER ONLINE? The browser's own flag (navigator.onLine) is only half the truth: it says "online" for a computer that is joined to a Wi-Fi or a LAN that has no way out, and it says
// nothing about the intranet itself being out of reach. So the check is a real, tiny request to our own /api/ping. Any answer at all from the server (even an error page) proves the way is open;
// no answer within the time, or a refusal to connect, proves it is not. Pure (the fetch is passed in), so that it can be tested.

export const PING_URL = "/api/ping";
export const PING_TIMEOUT_MS = 4000;
/** how often the window asks while it is open and all is well, and while it is waiting for the connection to come back */
export const PING_EVERY_MS = 20000;
export const PING_RETRY_MS = 4000;

type FetchLike = (url: string, init: { cache: "no-store"; signal: AbortSignal }) => Promise<{ status: number }>;

/** true when the server answered, false when it could not be reached (`browserSaysOnline` false short-cuts to false: nothing is sent). */
export async function probeOnline(fetchFn: FetchLike, browserSaysOnline = true, timeoutMs = PING_TIMEOUT_MS): Promise<boolean> {
  if (!browserSaysOnline) return false;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetchFn(PING_URL, { cache: "no-store", signal: ctl.signal });
    return typeof r.status === "number" && r.status > 0;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** The message under the red line, by what the window knows. */
export function offlineAdvice(browserSaysOnline: boolean): string {
  return browserSaysOnline
    ? "This computer is joined to a network, but the intranet cannot be reached through it. Please check that the Wi-Fi or cable has internet access."
    : "This computer is not connected to a network. Please connect to Wi-Fi or plug in the cable.";
}
