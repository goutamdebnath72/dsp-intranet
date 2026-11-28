// src/lib/live/steel.ts
//
// STEEL NEWS, ON A TAB OF ITS OWN. The owner's rule: any news of SAIL or any of its units, or of any other steel plant, is hunted for in every paper of India, well known or little known, English or Hindi. (It was first the top block of the Business tab; it
// was 64 stories in 48 hours, far more than ten or fifteen a day, so on 27 Nov the owner had it moved to a tab of its own, and the Business tab went back to the business papers' own stories, share-price news included.)
// No one paper's feed can do that, so I ask two public news SEARCHES instead (Google News and Bing News each gather the stories of thousands of publishers) with a fixed set of steel questions, in English and in Hindi, and I keep a story
// only when its own headline is about steel (isSteelStory). I take headline, paper, time and link only, as everywhere else; the reader goes to the paper's page.
// A steel story stays for 48 hours after it was reported; the newest is at the top, and as it gets older it sinks, until it leaves. Share-price news of a steel company is steel news: many professionals follow it, so I do not filter it out. Pure: the feeds' texts in, the stories out (tested on saved slices of the real searches).
//   What I do NOT do: I read no paper's page, I do not look behind a paywall, and a search that does not answer is only named, never worked around.
import { DateTime } from "luxon";
import { bingPictureOf } from "./bingImages";
import { decodeEntities, mergeFeeds, newestFirst, parseRss, safeLink, storyWords, type FeedItem } from "./rss";
import { skeleton } from "./priority";

/** How long a steel story stays after it was reported, in hours. */
export const STEEL_HOURS = 48;
/** The most steel stories shown: a ceiling for a very busy two days (the tab has the whole page to itself). */
export const STEEL_LIMIT = 60;
/** One steel search: the engine, a fixed address, and how its answer is read. Nothing a user typed ever goes into these addresses. */
export interface SteelSearch {
  name: string;
  url: string;
  home: string;
  /** How the answer is read: Google News is plain RSS with " - Paper" at the end of each headline; Bing News names the paper in its own tag and links through its own redirect. */
  format: "google" | "bing";
  /** How long one answer is kept before I ask again: these searches are asked every five minutes at the most, not every minute like a paper's own feed. */
  ttlMs: number;
}

export const googleNews = (q: string, hl: "en-IN" | "hi"): SteelSearch => ({
  name: "Google News",
  url: `https://news.google.com/rss/search?q=${encodeURIComponent(`${q} when:2d`)}&hl=${hl}&gl=IN&ceid=IN:${hl === "hi" ? "hi" : "en"}`,
  home: "https://news.google.com/",
  format: "google",
  ttlMs: 5 * 60_000,
});
export const bingNews = (q: string, lang: "en" | "hi"): SteelSearch => ({
  name: "Bing News",
  url: `https://www.bing.com/news/search?q=${encodeURIComponent(q)}&format=rss&cc=in&setlang=${lang}`,
  home: "https://www.bing.com/news",
  format: "bing",
  ttlMs: 5 * 60_000,
});

/**
 * The hunt: SAIL and its units, every other steel plant and company, and the steel industry as a whole (ministry, prices, imports), each asked in more than one way, in English and in Hindi, in the two engines.
 * A search of many words finds what a search of few does not, and the two engines do not know the same papers.
 */
export const STEEL_SEARCHES: SteelSearch[] = [
  googleNews('"Steel Authority of India" OR "SAIL" steel', "en-IN"),
  googleNews('Bhilai OR Bokaro OR Rourkela OR Durgapur OR Burnpur OR IISCO "steel plant"', "en-IN"),
  googleNews('"steel plant" OR "steel mill" OR steelmaker', "en-IN"),
  googleNews('"Tata Steel" OR "JSW Steel" OR "Jindal Steel" OR JSPL OR RINL OR "Vizag Steel" OR "ArcelorMittal Nippon Steel"', "en-IN"),
  googleNews('"Ministry of Steel" OR "steel industry" OR "steel imports" OR "steel prices" OR "steel output" India', "en-IN"),
  googleNews('सेल इस्पात संयंत्र OR "स्टील प्लांट" OR "स्टील अथॉरिटी" OR SAIL', "hi"),
  googleNews("भिलाई OR बोकारो OR राउरकेला OR दुर्गापुर OR बर्नपुर इस्पात OR स्टील", "hi"),
  googleNews('इस्पात OR "टाटा स्टील" OR "जेएसडब्ल्यू स्टील" OR "जिंदल स्टील"', "hi"),
  bingNews("SAIL steel plant", "en"),
  bingNews("steel plant India", "en"),
  bingNews("Tata Steel JSW Steel Jindal Steel", "en"),
  bingNews("इस्पात संयंत्र सेल", "hi"),
];

/* ------------------------------------- which headline is steel news ------------------------------------- */

const L = "[\\p{L}\\p{M}]";
/** A word that stands alone in any script (\b does not work for Hindi). */
const alone = (w: string) => `(?<!${L})(?:${w})(?!${L})`;
const re = (parts: string[], flags = "iu") => new RegExp(parts.join("|"), flags);

/** Words that make a headline steel news by themselves: steel and its makers, the steel plant's own words, and the companies that are only steel. SAIL is tested apart, in capitals only, because "sail" is also what a ship does. */
const STEEL = new RegExp(
  [
    "steel(?:s|maker|makers|making|works|mill|mills)?\\b",
    "ispat\\b", "इस्पात", "स्टील", "स्टेनलेस",
    alone("RINL|VISL|JSPL|NMDC Steel"),
    "arcelor", alone("posco"), "jindal stainless", "shyam metalics", "godawari power", "electrosteel", "uttam galva",
    "blast furnace", "sponge iron", "pig iron", "coking coal", "rolling mill", "ferro ?alloy", "टीएमटी",
  ].join("|"),
  "iu",
);
const SAIL = /\bSAIL\b/;
/** Hindi writes SAIL as "सेल", which is also "sale". So "सेल" (and the Hindi shorthand of the units) counts only beside a word of the steel works and its people. */
const HINDI_UNIT = new RegExp(alone("सेल|बीएसएल|आईएसपी|आरएसपी|बीएसपी") + "|भिलाई|बोकारो|राउरकेला|बर्नपुर|दुर्गापुर|सलेम", "u");
const HINDI_WORKS = new RegExp("संयंत्र|प्लांट|भट्ठी|भट्ठियों|कर्मचारी|यूनियन|एरियर|श्रमिक|मजदूर|ठेकेदार|चेयरमैन|निविदा|इस्पात|स्टील|लोहा|उत्पादन|हादसा|हादसे", "u");
/** Not steel news: a ship, a band, a bottle, and the sports a steel company sponsors (a chess tournament, a marathon, an athletics meet). Share-price news is NOT here: it is kept. */
const NOT = new RegExp(
  [
    "\\b(steelers|steelton|man of steel|steel magnolias|steel drum|steel guitar|steel pan)\\b", "\\bsteel (bottle|utensil|cookware|jewel)", "stainless steel (bottle|water|lunch|cup|vessel)", "\\bsets? sail\\b",
    "\\bchess\\b", "\\bmarathon\\b", "\\b25k\\b", "\\bathletics\\b", "\\bsteel-?a-?thon\\b", "शतरंज", "चेस", "मैराथन", "एथलीट", "स्टील-ए-थॉन",
  ].join("|"),
  "i",
);
/** The English headline must be about INDIA: its own name, a company or place of steel in India, a state, or an Indian way of writing money. A Korean mill's new president is not news for this board. Hindi headlines come from searches of India's own papers, so they are taken as they are. */
const INDIA = new RegExp(
  [
    "\\bindia\\b", "\\bindian\\b", "\\bbharat\\b", "₹", "\\bRs\\.? ?[\\d,]", "\\bcrores?\\b", "\\blakh\\b", "\\bcr\\b",
    "\\bSAIL\\b", "tata steel", "\\bjsw\\b", "jindal", "\\bjspl\\b", "\\brinl\\b", "vizag", "visakhapatnam", "\\bnmdc\\b", "essar", "kalyani", "bhushan", "apl apollo", "sunflag", "mukand", "lloyds metals", "shyam metalics", "godawari", "electrosteel", "rashtriya ispat",
    "bhilai", "bokaro", "rourkela", "durgapur", "burnpur", "iisco", "salem", "jamshedpur", "kalinganagar", "dolvi", "hazira", "raigarh", "angul", "joda", "barbil",
    "odisha", "orissa", "jharkhand", "chhattisgarh", "bengal", "kolkata", "karnataka", "bellary", "ballari", "andhra", "telangana", "tamil nadu", "maharashtra", "gujarat", "rajasthan", "bihar", "uttar pradesh", "madhya pradesh", "assam", "delhi", "mumbai",
    "kumaraswamy", "ministry of steel", "union minister",
  ].join("|"),
  "i",
);

/** Is this headline steel news for the board: about steel (a plant, a company, the industry) and, in English, about India? */
export function isSteelStory(title: string): boolean {
  if (NOT.test(title)) return false;
  const hindi = /[ऀ-ॿ]/.test(title);
  const aboutSteel = STEEL.test(title) || SAIL.test(title) || (hindi && HINDI_UNIT.test(title) && HINDI_WORKS.test(title));
  if (!aboutSteel) return false;
  return hindi || INDIA.test(title);
}

/* ------------------------------------------ reading the answers ------------------------------------------ */

/** Bing News links every story through its own redirect that carries the paper's address in `url`; I link straight to the paper (the redirect would only add tracking). Anything that is not http(s) is dropped. */
export function bingTarget(link: string): string {
  try {
    const direct = new URL(decodeEntities(link)).searchParams.get("url");
    return direct ? safeLink(direct) : safeLink(link);
  } catch {
    return "";
  }
}

/** Returns the items of a Bing News RSS answer: the paper is named in <News:Source>, the link goes straight to the paper. */
export function parseBing(xml: string): FeedItem[] {
  const out: FeedItem[] = [];
  const fromRss = parseRss(xml, "Bing News");
  // parseRss reads title, link and date; the paper's name is in a tag of its own, which I take from the same block, in the same order.
  const blocks = [...xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)].map((m) => m[0]);
  const named = blocks.filter((b) => /<title[\s>]/i.test(b) && /<link[\s>]/i.test(b));
  fromRss.forEach((it, i) => {
    const link = bingTarget(it.link);
    if (!link) return;
    const src = /<News:Source>([\s\S]*?)<\/News:Source>/i.exec(named[i] ?? "")?.[1];
    const image = bingPictureOf(named[i] ?? "");
    out.push({ ...it, link, source: src ? decodeEntities(src.trim()) || "Bing News" : "Bing News", ...(image ? { image } : {}) });
  });
  return out;
}

/** Returns the stories of one search answer, whatever they are about (null: the search did not answer). */
export function searchItems(search: SteelSearch, text: string | null): FeedItem[] {
  if (!text) return [];
  const items = search.format === "bing" ? parseBing(text) : parseRss(text, search.name, true);
  // A paper that Google names by its address ("https://hrtoday.in/") is shown by its host.
  const named = items.map((it) => (/^https?:\/\//i.test(it.source) ? { ...it, source: (safeLink(it.source) ? new URL(it.source).hostname : it.source).replace(/^www\./, "") } : it));
  return named;
}

/** Returns the steel stories of one search answer (null: the search did not answer). */
export function steelItemsOf(search: SteelSearch, text: string | null): FeedItem[] {
  return searchItems(search, text).filter((it) => isSteelStory(it.title));
}

/**
 * The steel block: the pool of steel stories from every search (and from the business papers' own feeds), the same story from several papers shown once, only stories REPORTED within the last 48 hours (a story with no
 * time is left out: I cannot say when it arrived), the newest at the top by the time on the card (the latest report of the story, as on the other tabs), so that a story sinks as it ages, and a new paper's report of it brings it up again.
 */
export function selectSteel(pool: FeedItem[], now: DateTime, limit = STEEL_LIMIT, meaning?: (a: string, b: string) => boolean): FeedItem[] {
  const dated = pool.filter((i) => i.publishedAt && DateTime.fromISO(i.publishedAt).isValid);
  // The limit of the merge is high on purpose: every story is clustered first, and the age and the ceiling are applied after, in time order.
  const merged = mergeFeeds([dated], 1000, now, STEEL_HOURS);
  return newestFirst(clusterTopics(merged, meaning), (i) => i.publishedAt).slice(0, limit);
}

/* ------------------------- one news, one row: the same news in other words and other languages ------------------------- */

/**
 * THE COMPANIES AND BODIES that steel news is about, in English, Hindi and Bengali, as ONE name each. Two headlines that name the same two of them (Tata Steel and APL Apollo; Tata Steel and Sebi) are about one thing. I list only
 * companies and bodies, not places: two stories of SAIL at Bhilai are not one story because they name the same plant. A name that is not here is simply not used for matching.
 */
const ORGS: Array<[string, RegExp]> = [
  ["TATA_STEEL", re([alone("tata steel(?:'s|’s)?"), "टाटा स्टील", "টাটা স্টিল"])],
  ["APL_APOLLO", re([alone("apl apollo|apollo tubes|apollo|apl(?:'s|’s)?"), "एपीएल अपोलो", "अपोलो", "অ্যাপোলো", "এপিএল"])],
  ["SEBI", re([alone("sebi"), "सेबी", "সেবি"])],
  ["JSW", re([alone("jsw steel|jsw"), "जेएसडब्ल्यू", "জেএসডব্লিউ"])],
  ["JINDAL_STEEL", re([alone("jindal steel(?: (?:and|&) power)?|jspl"), "जिंदल स्टील", "জিন্দাল স্টিল"])],
  ["JINDAL_STAINLESS", re([alone("jindal stainless|jsl"), "जिंदल स्टेनलेस", "জিন্দাল স্টেইনলেস"])],
  ["SAIL", re([alone("steel authority of india"), "स्टील अथॉरिटी", "ইস্পাত কর্তৃপক্ষ"])],
  ["RINL", re([alone("rinl|rashtriya ispat nigam|vizag steel|visakhapatnam steel"), "आरआईएनएल", "राष्ट्रीय इस्पात निगम"])],
  ["NMDC", re([alone("nmdc"), "एनएमडीसी"])],
  ["ARCELOR", re([alone("arcelormittal|arcelor|nippon steel|aperam"), "आर्सेलर", "निप्पॉन"])],
  ["MIN_STEEL", re([alone("ministry of steel|steel ministry"), "इस्पात मंत्रालय", "ইস্পাত মন্ত্রক"])],
  ["SHYAM", re([alone("shyam metalics"), "श्याम मेटालिक्स"])],
  ["ESSAR", re([alone("essar|aion"), "एस्सार"])],
];
/** SAIL itself: the capitals, or the Hindi "sel" beside a word of the works (the same test as isSteelStory). */
const SAIL_NAME = /\bSAIL\b/;

/** The companies and bodies a headline names. */
export function orgsOf(title: string): string[] {
  const out = ORGS.filter(([, r]) => r.test(title)).map(([id]) => id);
  if (SAIL_NAME.test(title) || (HINDI_UNIT.test(title) && HINDI_WORKS.test(title) && /(?<![\p{L}\p{M}])सेल(?![\p{L}\p{M}])/u.test(title))) out.push("SAIL");
  return [...new Set(out)];
}

/** The figures of a headline that do not depend on the language: a decimal (7.5, 99.4) or a whole number of 100 or more (28,000; 13.8), in any digits, but not a year. "Rs 28,000 crore" and "28000 करोड़" carry the same one. */
export function specificNumbers(title: string): string[] {
  const t = title.replace(/[०-९]/g, (c) => String(c.charCodeAt(0) - 0x0966)).replace(/[০-৯]/g, (c) => String(c.charCodeAt(0) - 0x09e6)).replace(/(\d),(?=\d{3}\b)/g, "$1");
  const out = new Set<string>();
  for (const m of t.matchAll(/(?<![\d.])(\d+(?:\.\d+)?)(?![\d])/g)) {
    const v = m[1];
    if (/^(19|20)\d\d$/.test(v)) continue;
    if (v.includes(".") ? Number(v) > 0 : Number(v) >= 100) out.add(String(Number(v)));
  }
  return [...out];
}

/** The sound-skeletons of a headline's telling words (three consonants or two): the same word in the three scripts gives one; I use them only to back up a figure. */
function soundKeys(title: string): string[] {
  return [...new Set(storyWords(title).map(skeleton).filter((k) => k.length >= 2))];
}

interface TopicFacts { orgs: string[]; nums: string[]; keys: string[] }

/**
 * Are these two headlines ONE NEWS, whatever the words and the language? Any of these:
 *   - they name the same two (or more) companies or bodies (Tata Steel and APL Apollo, Tata Steel and Sebi);
 *   - they carry the same two figures that are not a year (7.5 and 99.4);
 *   - they carry the same DECIMAL figure (7.5, 99.4: a figure with a decimal point is rarely two coincidences in two days of steel news);
 *   - they carry the same whole figure of 100 or more and name the same company or body, or share a telling word (told in sound, so that a Hindi and an English word match) that is not a word every headline of the batch has.
 * Headlines of one language that are one story are already merged (sameStory); this joins the ones of different languages and the ones worded too differently for that.
 */
export function sameTopic(a: TopicFacts, b: TopicFacts, generic: (k: string) => boolean): boolean {
  const orgs = a.orgs.filter((o) => b.orgs.includes(o));
  if (orgs.length >= 2) return true;
  const nums = a.nums.filter((n) => b.nums.includes(n));
  if (nums.length >= 2) return true;
  if (nums.some((n) => n.includes("."))) return true;
  if (nums.length === 1) {
    if (orgs.length >= 1) return true;
    if (a.keys.some((k) => b.keys.includes(k) && !generic(k))) return true;
  }
  return false;
}

/**
 * ONE ROW FOR ONE NEWS. The stories that are one news (sameTopic, or `meaning`: the judge of sameNews.ts has said so; and a story that bridges two is one) become one story: shown by the latest headline (the card says "Updated", where it began and which first paper reported it), its time the
 * latest report's, the other papers named. The Steel tab had sixty rows of one deal of Tata Steel, in two languages and many wordings; now it has one.
 */
export function clusterTopics(stories: FeedItem[], meaning?: (a: string, b: string) => boolean): FeedItem[] {
  const facts: TopicFacts[] = stories.map((s) => ({ orgs: orgsOf(s.title), nums: specificNumbers(s.title), keys: soundKeys(s.title) }));
  const df = new Map<string, number>();
  for (const f of facts) for (const k of f.keys) df.set(k, (df.get(k) ?? 0) + 1);
  const limit = Math.max(8, Math.round(0.3 * stories.length));
  const generic = (k: string) => (df.get(k) ?? 0) > limit;
  const parent = stories.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < stories.length; i++) for (let j = i + 1; j < stories.length; j++) if (sameTopic(facts[i], facts[j], generic) || meaning?.(stories[i].title, stories[j].title)) parent[find(i)] = find(j);
  const groups = new Map<number, number[]>();
  stories.forEach((_, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), i]));
  const t = (i: FeedItem) => (i.publishedAt ? DateTime.fromISO(i.publishedAt).toMillis() : NaN);
  const out: FeedItem[] = [];
  for (const idx of groups.values()) {
    const members = idx.map((i) => stories[i]);
    if (members.length === 1) { out.push(members[0]); continue; }
    const byTime = [...members].sort((a, b) => (Number.isNaN(t(a)) ? 0 : t(a)) - (Number.isNaN(t(b)) ? 0 : t(b)));
    const first = byTime[0], latest = byTime[byTime.length - 1];
    const names = [...new Set(byTime.flatMap((m) => [m.source, ...(m.also ?? [])]))].filter((n) => n !== latest.source);
    out.push({ ...latest, id: first.id ?? first.link, firstAt: first.firstAt ?? first.publishedAt, firstSource: first.firstSource ?? first.source, ...(names.length ? { also: names } : {}) });
  }
  return out;
}

/** The papers that carried the shown steel stories, each named once, in the order of their first appearance. */
export function steelPapers(stories: FeedItem[]): string[] {
  return [...new Set(stories.flatMap((s) => [s.source, ...(s.also ?? [])]))];
}
