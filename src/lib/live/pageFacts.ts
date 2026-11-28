// src/lib/live/pageFacts.ts
//
// WHAT A STORY'S OWN PAGE SAYS: ITS PICTURE, AND WHETHER IT IS FREE TO READ. The owner's rules: a story with no picture is not shown, and a story that needs a subscription is not shown. Both are read from the story's page while a tab is being built.
//   THE PICTURE is the one the paper attaches (its og:image, what a link preview shows), taken from the page's <meta> tags.
//   PAID is what the paper itself says, in the way papers tell search engines about a paywall: the page's structured data (JSON-LD) says `"isAccessibleForFree": false` (or "False"). Seen on 28 Nov 2026: The Hindu says it of every story I read, Mint and The Hindu
//   BusinessLine of their premium ones only, Hindustan Times, Indian Express, NDTV and Times of India say true or nothing. A page that answers 401 or 402 (The Wall Street Journal's does) wants a login, so it is paid; an address that says it is a premium section
//   (/premium/, /prime/, /subscriber) is paid. A paper that says nothing is taken as free: the card says so, because that is not a check but the absence of a mark. A page that could not be read (403, a timeout) is UNKNOWN, not paid.
// Only a bounded amount of each page is read (400 KB, and not past the point where both the head has ended and the marker has been seen), the newest stories only, a few at a time, within a deadline, and every answer is kept (a day when read; five minutes when not), so that after the first
// build only the stories that have just appeared cost a request. Only the papers whose pages answer an ordinary request are read (ARTICLE_HOSTS in thumb.ts); one that refuses (Anandabazar Patrika, The Telegraph) is not worked around.
import { BROWSER_UA } from "./http";
import { isAllowedImage, isReadableArticle, MAX_PAGE_BYTES, pictureOfPage } from "./thumb";

export interface PageFacts {
  /** The picture the paper attaches to the story (an https address on an allowed image server), or null. */
  image: string | null;
  /** True when the paper marks the story as needing a subscription (or the page wants a login); false when it says free or says nothing. */
  paid: boolean;
  /** False when the page could not be read (the answer is then a guess to be asked again soon). */
  read: boolean;
}

type Fetch = (url: string, init: { signal: AbortSignal; headers: Record<string, string> }) => Promise<Response>;

/** A premium section named in the address (its path, not its host). */
export const paidByAddress = (link: string): boolean => { try { return /\/(?:premium|prime|subscriber[-\w]*)(?:\/|$)/i.test(new URL(link).pathname); } catch { return false; } };

/** The paper's own mark in a page's structured data: true when any `isAccessibleForFree` is false ("false", "False"), false otherwise. */
export function markedPaid(html: string): boolean {
  for (const m of html.matchAll(/["']?isAccessibleForFree["']?\s*[:=]\s*["']?(true|false)["']?/gi)) if (m[1].toLowerCase() === "false") return true;
  return false;
}

/** The page's facts from its text (what was read of it). */
export function factsOfPage(html: string, pageUrl: string): PageFacts {
  const pic = pictureOfPage(html, pageUrl);
  return { image: pic && isAllowedImage(pic) ? pic : null, paid: markedPaid(html) || paidByAddress(pageUrl), read: true };
}

/** Reads a page up to MAX_PAGE_BYTES, stopping early once the head has ended AND the paywall marker has been seen (or the head has ended and 150 KB are read: the papers that put no mark have none to find). */
export async function readPage(r: Response): Promise<{ text: string; url: string }> {
  const reader = r.body?.getReader();
  if (!reader) return { text: "", url: r.url };
  const dec = new TextDecoder("utf-8", { fatal: false });
  let text = "", bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      bytes += value.length;
      text += dec.decode(value, { stream: true });
      const headDone = /<\/head>/i.test(text);
      if (bytes >= MAX_PAGE_BYTES || (headDone && /isAccessibleForFree/i.test(text)) || (headDone && bytes >= 150 * 1024)) break;
    }
  } finally {
    reader.cancel().catch(() => undefined);
  }
  return { text, url: r.url };
}

/** The facts of one story page. Never throws. */
export async function factsOfStory(link: string, fetchImpl: Fetch = fetch as Fetch, timeoutMs = 4000): Promise<PageFacts> {
  const unknown: PageFacts = { image: null, paid: paidByAddress(link), read: false };
  if (!isReadableArticle(link)) return unknown;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetchImpl(link, { signal: ctl.signal, headers: { "User-Agent": BROWSER_UA, Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5" } });
    // a page that wants a login is paid; one that refuses or fails is unknown
    if (r.status === 401 || r.status === 402) return { image: null, paid: true, read: true };
    if (!r.ok || !isReadableArticle(r.url || link)) return unknown;
    const { text, url } = await readPage(r);
    return factsOfPage(text, url || link);
  } catch {
    return unknown;
  } finally {
    clearTimeout(timer);
  }
}

const kept = new Map<string, { facts: PageFacts; at: number }>();
const MAX_KEPT = 4000;
const READ_MS = 24 * 60 * 60 * 1000, UNREAD_MS = 5 * 60 * 1000;

/**
 * The facts of the stories at `links` (those of papers whose pages are read; other links are ignored): what is kept, else the pages, `concurrency` at a time, all within `deadlineMs` (a page not read in time is left for the next build and is UNKNOWN
 * this time). Returns link -> facts for every link that was looked at.
 */
export async function resolveFacts(links: string[], opts: { concurrency?: number; deadlineMs?: number; fetchImpl?: Fetch; now?: () => number } = {}): Promise<Map<string, PageFacts>> {
  const now = opts.now ?? Date.now;
  const out = new Map<string, PageFacts>();
  const todo: string[] = [];
  for (const l of new Set(links)) {
    if (!isReadableArticle(l)) continue;
    const hit = kept.get(l);
    if (hit && now() - hit.at < (hit.facts.read ? READ_MS : UNREAD_MS)) { out.set(l, hit.facts); continue; }
    todo.push(l);
  }
  if (todo.length) {
    const end = now() + (opts.deadlineMs ?? 3500);
    let next = 0;
    const worker = async () => {
      while (next < todo.length && now() < end) {
        const l = todo[next++];
        const facts = await factsOfStory(l, opts.fetchImpl, Math.max(500, Math.min(4000, end - now())));
        if (kept.size >= MAX_KEPT) kept.delete(kept.keys().next().value as string);
        kept.set(l, { facts, at: now() });
        out.set(l, facts);
      }
    };
    await Promise.all(Array.from({ length: Math.min(opts.concurrency ?? 10, todo.length) }, worker));
  }
  return out;
}

/** For the tests: forget what is kept. */
export function forgetFacts(): void { kept.clear(); }
