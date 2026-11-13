// src/lib/live/rss.ts
//
// HEADLINES FROM THE NEWS SITES' OWN RSS FEEDS (the feeds they publish for exactly this use): a headline, where it came from, when, and the link to the story, which the card opens in a new tab.
// Only the headline and the link are taken, never the story: the reader goes to the publisher for it. Pure: the feed's text in, the items out (tested on saved slices of real feeds).
import { DateTime } from "luxon";

export interface FeedItem {
  title: string;
  /** an http(s) link to the story, nothing else (a "javascript:" or "data:" link is dropped) */
  link: string;
  /** ISO time, or "" when the feed gave none that could be read */
  publishedAt: string;
  /** the publisher, from the feed or, for an aggregator, the name after the last " - " of the headline */
  source: string;
  /** the feed's own short description, tags removed (used only to sort sports stories, never shown) */
  summary: string;
  /** the other papers that carried the same story (the merge shows it once; these are the papers other than the one whose headline is shown) */
  also?: string[];
  /** THE STORY'S OWN IDENTITY, which stays the same while papers add to it: the link of the first report. A card is keyed by it, so that a development rolls the card instead of adding a new one. */
  id?: string;
  /** when, and by which paper, the story was first reported (the headline shown is the latest one; these say where it began) */
  firstAt?: string;
  firstSource?: string;
  /** the DESK of the feed the item came from (a section of a paper: "sports", "metro"), set by the source; a story takes the desk of the paper of highest priority that carried it */
  desk?: string;
  /** the rank of the story's desk on a curated tab (the Bengali one): 1 the most important; set by the curation, never by a feed, and never shown on a card */
  tier?: number;
}

const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", hellip: "…", ndash: "–", mdash: "—" };

export function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]{1,6});/gi, (_m, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d{1,7});/g, (_m, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n: string) => NAMED[n.toLowerCase()] ?? m);
}

/** the text of a tag: CDATA unwrapped, markup removed, entities decoded, white space collapsed */
function field(block: string, tag: string): string {
  const m = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i").exec(block);
  if (!m) return "";
  let v = m[1].trim();
  const cdata = /^<!\[CDATA\[([\s\S]*?)\]\]>$/.exec(v);
  v = cdata ? cdata[1] : v;
  v = decodeEntities(v.replace(/<[^>]+>/g, " ")).replace(/<[^>]+>/g, " ");
  return v.replace(/\s+/g, " ").trim();
}

export function parseDate(s: string): string {
  const t = s.trim();
  if (!t) return "";
  const d = DateTime.fromRFC2822(t, { setZone: true });
  if (d.isValid) return d.toUTC().toISO() ?? "";
  const iso = DateTime.fromISO(t, { setZone: true });
  return iso.isValid ? (iso.toUTC().toISO() ?? "") : "";
}

export function safeLink(raw: string): string {
  try {
    const u = new URL(raw.trim());
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : "";
  } catch {
    return "";
  }
}

/** The items of an RSS 2.0 feed. `defaultSource` names the publisher when the item does not; with `splitSource`, a trailing " - Publisher" is moved out of the headline (Google News). */
export function parseRss(xml: string, defaultSource: string, splitSource = false): FeedItem[] {
  const out: FeedItem[] = [];
  for (const m of xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)) {
    const block = m[0];
    let title = field(block, "title");
    const link = safeLink(field(block, "link") || field(block, "guid"));
    if (!title || !link) continue;
    let source = field(block, "source") || defaultSource;
    if (splitSource) {
      const i = title.lastIndexOf(" - ");
      if (i > 10) { source = title.slice(i + 3).trim() || source; title = title.slice(0, i).trim(); }
    }
    out.push({ title, link, publishedAt: parseDate(field(block, "pubDate") || field(block, "dc:date")), source, summary: field(block, "description").slice(0, 400) });
  }
  return out;
}

/** headline of two feeds that are the same story: lower case, only letters, marks (the vowel signs of Hindi and Bengali) and digits, the first 60 of them */
export const titleKey = (t: string): string => t.toLowerCase().replace(/[^\p{L}\p{N}\p{M}]+/gu, "").slice(0, 60);

/**
 * One list from several feeds, in the order of importance the feeds themselves give: the first story of each, then the second of each, and so on (a round robin; a feed of higher priority takes
 * more places in each round, see the weights argument), so that no one publisher fills the list; the same story from several papers (even worded differently) is shown once. Stories older than `maxAgeHours` are dropped when they carry a date.
 *
 * ONE STORY, ONE CARD. The same event is worded differently by every paper, so stories are grouped by what they are about (sameStory), not by their exact headline. A story keeps the IDENTITY of its
 * FIRST report (`id`, with `firstAt` and `firstSource`), and is shown by its LATEST headline, so that when a paper adds to the story the card's headline changes and the card does not move; the other
 * papers are named (`also`). A story bridged by a third paper joins two groups into one, the earlier first report staying.
 */
export function mergeFeeds(feeds: FeedItem[][], limit: number, now: DateTime, maxAgeHours = 36, weights: number[] = []): FeedItem[] {
  const fresh = (i: FeedItem) => {
    if (!i.publishedAt) return true;
    const d = DateTime.fromISO(i.publishedAt);
    return !d.isValid || now.diff(d, "hours").hours <= maxAgeHours;
  };
  const lists = feeds.map((f) => f.filter(fresh));

  // oldest first (the paper that had it first; undated last; a tie goes to the earlier feed)
  const flat = lists.flatMap((l, fi) => l.map((it, rank) => ({ it, fi, rank, t: it.publishedAt ? DateTime.fromISO(it.publishedAt).toMillis() : NaN })));
  const counts = wordCounts(flat.map((x) => x.it.title));
  const byFirst = [...flat].sort((a, b) => (Number.isNaN(a.t) && Number.isNaN(b.t) ? 0 : Number.isNaN(a.t) ? 1 : Number.isNaN(b.t) ? -1 : a.t - b.t) || a.fi - b.fi || a.rank - b.rank);
  const groups: Array<{ head: (typeof flat)[number]; members: Array<(typeof flat)[number]> }> = [];
  for (const x of byFirst) {
    // it joins every story that ANY of its headlines is the same as (the second paper may be nearer to the third than to the first); two stories it bridges become one, the earlier head staying
    const hits = groups.filter((q) => q.head.it.link === x.it.link || q.members.some((m) => titleKey(m.it.title) === titleKey(x.it.title) || sameStory(m.it.title, x.it.title, counts, flat.length)));
    if (!hits.length) { groups.push({ head: x, members: [x] }); continue; }
    const g = hits[0];
    for (const o of hits.slice(1)) { g.members.push(...o.members); groups.splice(groups.indexOf(o), 1); }
    g.members.push(x);
  }
  // a story is shown by its LATEST headline (so that a development shows), under the identity of its FIRST report, naming the other papers and where it began
  const stories = new Map<FeedItem, FeedItem>();
  for (const g of groups) {
    const at = (m: { t: number }) => (Number.isNaN(m.t) ? -Infinity : m.t);
    const latest = g.members.reduce((best, m) => (at(m) > at(best) ? m : best), g.head);
    // the other papers, in the order the feeds were given (the owner's order of priority), not the order they came in
    const also = [...new Set([...g.members].sort((a, b) => a.fi - b.fi).map((m) => m.it.source).filter((n) => n !== latest.it.source))];
    stories.set(g.head.it, { ...latest.it, id: g.head.it.link, firstAt: g.head.it.publishedAt, firstSource: g.head.it.source, ...(also.length ? { also } : {}) });
  }
  // A STORY BELONGS TO THE PAPER OF HIGHEST PRIORITY THAT CARRIED IT (the heaviest weight; among papers of the SAME level the one that reported it first, so that the order of the list favours none; then the earlier feed), at that paper's place in its feed: so a story that The Telegraph
  // and a paper of lower priority both had counts as The Telegraph's, however the two were first to report it. (Who reported first is the story's identity and is named on the card; it does not decide whose it is.)
  const weight = (fi: number) => Math.max(1, Math.floor(weights[fi] ?? 1));
  const slots: Array<Array<FeedItem | undefined>> = lists.map((l) => new Array<FeedItem | undefined>(l.length));
  for (const [head, story] of stories) {
    const g = groups.find((q) => q.head.it === head);
    if (!g) continue;
    const when = (m: { t: number }) => (Number.isNaN(m.t) ? Infinity : m.t);
    const better = (m: (typeof g.members)[number], b: (typeof g.members)[number]) => weight(m.fi) !== weight(b.fi) ? weight(m.fi) > weight(b.fi) : when(m) !== when(b) ? when(m) < when(b) : m.fi !== b.fi ? m.fi < b.fi : m.rank < b.rank;
    const owner = g.members.reduce((best, m) => (better(m, best) ? m : best), g.members[0]);
    if (owner.it.desk) story.desk = owner.it.desk;
    slots[owner.fi][owner.rank] = story;
  }
  // The round robin runs on these places (a story left out as a repeat does not move the others up). In each round a feed takes the next weights[i] places of its list (default 1): a paper of higher
  // priority is given more of the stories chosen, a paper of lower priority fewer, and equal weights are the same level.
  const out: FeedItem[] = [];
  for (let round = 0; out.length < limit && slots.some((l, i) => round * weight(i) < l.length); round++) {
    for (let i = 0; i < slots.length && out.length < limit; i++) {
      for (let pos = round * weight(i); pos < (round + 1) * weight(i) && pos < slots[i].length && out.length < limit; pos++) {
        const story = slots[i][pos];
        if (story) out.push(story);
      }
    }
  }
  return out;
}

/** The stories newest first, as a wire shows them (a story with no time goes last, in the order it had). `at` says which time counts. */
export function newestFirst<T extends { publishedAt: string }>(items: T[], at: (i: T) => string = (i) => i.publishedAt): T[] {
  const t = (i: T) => (at(i) ? DateTime.fromISO(at(i)).toMillis() : NaN);
  return items
    .map((it, k) => ({ it, k, t: t(it) }))
    .sort((a, b) => (Number.isNaN(a.t) && Number.isNaN(b.t) ? a.k - b.k : Number.isNaN(a.t) ? 1 : Number.isNaN(b.t) ? -1 : b.t - a.t || a.k - b.k))
    .map((x) => x.it);
}

/** a story's identity on the screen: the first report's link when the merge gave one, else its own link */
export const storyKey = (i: { link: string; id?: string }): string => i.id ?? i.link;

/**
 * What a refresh changed, by story identity: the stories that were not on the screen before (added), the ones that have left it (removed), and the ones that are still there but whose HEADLINE is now
 * another paper's, later one (changed: a development). Order does not count.
 */
export function diffStories<T extends { link: string; id?: string }>(before: T[], after: T[]): { added: T[]; removed: T[]; changed: T[] } {
  const had = new Map(before.map((i) => [storyKey(i), i])), has = new Set(after.map(storyKey));
  return {
    added: after.filter((i) => !had.has(storyKey(i))),
    removed: before.filter((i) => !has.has(storyKey(i))),
    changed: after.filter((i) => { const o = had.get(storyKey(i)); return !!o && o.link !== i.link; }),
  };
}

/* ---------------------------------- the same story from two papers ---------------------------------- */

/** words that every headline has and that tell nothing about WHICH story it is */
const FILLER = new Set(("a an the and or but of in on at to for from by with as is are was were be been it its this that these those not no than then so if into over after before about up out off per via vs " +
  "has have had will would can could may might do does did says said say amid new now just more most all you your we our they their he she his her who whom what when where why how which " +
  "live news today todays update updates latest breaking top key details detail explained know need here watch video videos photos photo see check read full list check opinion analysis " +
  "january february march april may june july august september october november december jan feb mar apr jun jul aug sep sept oct nov dec monday tuesday wednesday thursday friday saturday sunday " +
  // the small words of Hindi and of Bengali, which say nothing about which story it is
  "के की का को में से पर ने और कि यह वह भी तो था थे थी है हैं हो एक इस उस कर लिए साथ बाद अब जो कुछ रहे रहा रही गया गई दी दिया किया बोले " +
  "এবং ও এর এই সেই করে করা হয় হবে হল হয়েছে না তার যে কী কি থেকে জন্য সঙ্গে পর একটি").split(" "));

/** the telling words of a headline: lower case, apostrophes dropped, a trailing plural s removed, filler left out, each word once. Letters AND their combining marks make a word (Hindi and Bengali vowel signs). */
export function storyWords(title: string): string[] {
  const out = new Set<string>();
  for (const raw of title.toLowerCase().replace(/['’‘`]/g, "").split(/[^\p{L}\p{N}\p{M}]+/u)) {
    if (!raw) continue;
    const w = raw.length > 3 && raw.endsWith("s") && !raw.endsWith("ss") ? raw.slice(0, -1) : raw;
    if (w.length < 2 || FILLER.has(raw) || FILLER.has(w) || /^(19|20)\d\d$/.test(w)) continue; // a year says nothing about which story
    out.add(w);
  }
  return [...out];
}

/** how common each telling word is across a batch of headlines: the number of headlines it is in */
export function wordCounts(titles: string[]): Map<string, number> {
  const df = new Map<string, number>();
  for (const t of titles) for (const w of storyWords(t)) df.set(w, (df.get(w) ?? 0) + 1);
  return df;
}

const isNumber = (w: string) => /^\d/.test(w);

/** a word is DISTINCTIVE when few headlines of the batch use it: a name, a place, a figure; "Nvidia" in a week of Nvidia news is not, "Zakir" is */
export const DISTINCT_MAX = 6;

/** the share of the shorter headline's weight that two headlines must have in common to be one story */
export const SAME_SHARE = 0.4;

/**
 * Are these two headlines the same story? Three things must hold, and a fourth must not:
 *  - they share at least three telling words;
 *  - at least TWO of the shared words are distinctive (few headlines of the batch use them), so that a week's running story ("Jensen Huang", "Nvidia", "CEO"), a section's template ("Roundup: Market
 *    Talk") or common words alone never make two different stories one;
 *  - the shared words carry at least SAME_SHARE of the weight of the shorter headline, a word weighing more the fewer headlines use it;
 *  - and they do NOT disagree on figures: if both have numbers and share none ("$65 billion", "$25 billion"), they are two stories with one template.
 * `counts` is the batch's wordCounts and `total` its number of headlines; without them every word weighs the same and every word counts as distinctive.
 */
export function sameStory(a: string, b: string, counts?: Map<string, number>, total = 0): boolean {
  const A = storyWords(a), B = storyWords(b), inB = new Set(B);
  const shared = A.filter((w) => inB.has(w));
  if (shared.length < 3) return false;
  const na = A.filter(isNumber), nb = new Set(B.filter(isNumber));
  if (na.length && nb.size && !na.some((n) => nb.has(n))) return false;
  if (counts && shared.filter((w) => (counts.get(w) ?? 1) <= DISTINCT_MAX).length < 2) return false;
  const weight = (w: string) => (counts && total ? Math.log(1 + total / Math.max(1, counts.get(w) ?? 1)) : 1);
  const sum = (ws: string[]) => ws.reduce((x, w) => x + weight(w), 0);
  const min = Math.min(sum(A), sum(B));
  return min > 0 && sum(shared) / min >= SAME_SHARE;
}
