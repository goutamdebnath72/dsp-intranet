// src/lib/live/bengali.ts
//
// THE BENGALI FRONT PAGE, HAND-CURATED. The Bengali tab is the one most of the plant's readers will stay on, so I do not make it a plain list of the newest headlines: I choose it like the front page of a newspaper,
// from SEVERAL Bengali dailies, with Anandabazar Patrika (the local paper, read section by section through Google News) at the top priority and the others mixed in with it:
//   Anandabazar Patrika, Sangbad Pratidin, Bartaman, Ei Samay, Aajkaal, and BBC বাংলা.
//
// WHAT COMES FIRST, in each paper's own stories, by DESKS in an order of importance:
//   TOP BAND (tier 1, chosen first)         attack   a militant attack      war   a war      demise   a death announced as one (প্রয়াত, প্রয়াণ)      trending   a story that THREE OR MORE papers carry
//   CORE (tier 2, in turns)                politics 4     sports 3     metro 2     business 2
//   FILL (tier 3, what is left)            the paper's other state, national and world news, entertainment
// I use the desks only to CHOOSE the stories; the card names no desk (the reader sees a headline, the paper and the time).
//
// HOW THE PAGE IS MIXED. The page has eighteen places, SHARED among the papers by their priority (SHARE below): Anandabazar six, Sangbad Pratidin, Bartaman and Ei Samay three each, Aajkaal two, BBC বাংলা one. Each paper
// puts forward its own stories in the order of the desks (one of each desk in turn, so its places are not all politics); I fill the places paper by paper in rounds, Anandabazar first in every round;
// a place a paper cannot fill (it has too few stories) goes to the papers in priority order, so Anandabazar is the first to take it. A story that two papers carry is ONE card, shown as the higher-priority paper's
// (src/lib/live/rss.ts), so the same news never appears twice. The top band holds at most six stories in all.
//
// WHAT A DESK IS. A story's section in the paper (Anandabazar's West Bengal, Kolkata, India, World, Sports and Business sections are read as separate feeds, src/lib/live/news.ts) is its default desk. The top-band
// desks and politics cut across sections, so I find them by words of the headline, and a few rules keep those words honest: a film or a sports headline is never "war" or "attack" (the real data had a film scene and
// a sports match said to be wars), "Maoist" is not a word of attack (a drug campaign was called that), and "missile" alone is not a word of war (a missile-building programme). For the papers read as a whole (no sections)
// I tell sports and business stories by plain words (ক্রিকেট cricket, ফুটবল football, সেনসেক্স Sensex ...). The words are in ONE place below, and were tested against real headlines
// (fixtures/bn-headlines-2026-11-13.json and the papers' feeds). They are plain Bengali words whose meaning is known; this is a heuristic, not understanding.
//
// METRO. I read it both ways: the Kolkata city section, and any headline about the metro railway (মেট্রো).
// DEMISE. The words say a death was announced; they cannot tell a famous person from an ordinary one, so I let the reader's own sections come first.
//
// SHOWN ORDER. By TIME alone, the latest at the top, like every other tab: the desks and the papers' shares only decide WHICH stories are on the page, never where they stand.
import { DateTime } from "luxon";
import type { FeedItem } from "./rss";

export type DeskId = "attack" | "war" | "demise" | "trending" | "politics" | "sports" | "metro" | "business" | "state" | "national" | "world" | "entertainment" | "other";

export interface Desk {
  id: DeskId;
  /** Tier: 1 is the top band, 2 the core, 3 the fill. */
  tier: 1 | 2 | 3;
  /** How many stories the desk puts forward in its turns (0 means only what is left, at the end). */
  quota: number;
}

/** Desks in the order of importance: the order the first pass takes them, and the order in which I settle a tie. */
export const DESKS: Desk[] = [
  { id: "attack", tier: 1, quota: 3 },
  { id: "war", tier: 1, quota: 3 },
  { id: "demise", tier: 1, quota: 2 },
  { id: "trending", tier: 1, quota: 3 },
  { id: "politics", tier: 2, quota: 4 },
  { id: "sports", tier: 2, quota: 3 },
  { id: "metro", tier: 2, quota: 2 },
  { id: "business", tier: 2, quota: 2 },
  { id: "state", tier: 3, quota: 0 },
  { id: "national", tier: 3, quota: 0 },
  { id: "world", tier: 3, quota: 0 },
  { id: "entertainment", tier: 3, quota: 0 },
  { id: "other", tier: 3, quota: 0 },
];
const DESK = new Map(DESKS.map((d) => [d.id, d]));
/** How many stories the Bengali front page holds. People stay on this tab, so I made it longer than the others (the places below add up to it). */
export const FRONT_PAGE = 18;
/** The places of each paper on the page, in the papers' PRIORITY: Anandabazar Patrika first, with the most. A paper not named here gets one. */
export const SHARE: Record<string, number> = { "Anandabazar Patrika": 6, "Sangbad Pratidin": 3, "Bartaman": 3, "Ei Samay": 3, "Aajkaal": 2, "BBC বাংলা": 1 };
/** The most the top band takes, all four desks and all papers together. */
export const TIER1_CAP = 6;
/** A story carried by this many papers (the one shown and the others named) counts as trending. */
export const TRENDING_PAPERS = 3;

/** A militant attack: militants, terrorists, a militant strike, a suicide attack. */
const ATTACK = /জঙ্গি|সন্ত্রাসবাদী|সন্ত্রাসী|আত্মঘাতী/;
/** An attack on the security forces. This is how I tell a militant attack when the word for militant is not used. */
const ATTACK_ON = /হামলা/, FORCES = /সেনা|জওয়ান|সিআরপিএফ|বিএসএফ|আধাসেনা|নিরাপত্তা বাহিনী|নিরাপত্তাবাহিনী|চৌকি|ক্যাম্প/;
/** A war: war, ceasefire, air and drone attacks, shelling, bombing. */
const WAR = /যুদ্ধ|বিমান হামলা|বিমানহামলা|ড্রোন হামলা|গোলাবর্ষণ|বোমাবর্ষণ|ক্ষেপণাস্ত্র হামলা/;
/** A death announced: late, demise, grief at a death. */
const DEMISE = /প্রয়াত|প্রয়াণ|মৃত্যুতে শোক/;
/** Politics: the parties, the offices, the elections and the secretariat. */
const POLITICS = /বিজেপি|তৃণমূল|কংগ্রেস|সিপিএম|সিপিআইএম|মুখ্যমন্ত্রী|প্রধানমন্ত্রী|মন্ত্রী|বিধায়ক|সাংসদ|ভোট|নির্বাচন|বিধানসভা|লোকসভা|রাজ্যসভা|রাজনীতি|নবান্ন|শাসকদল|বিরোধী|রাজ্যপাল|নির্বাচন কমিশন/;
/** the metro railway */
const METRO = /মেট্রো/;
/** Sports and business, told by plain words, for a paper I read as a whole (it has no sports or business section of its own): cricket, football, IPL, the clubs, a match; Sensex, Nifty, the share market, the price of gold, inflation, the RBI. */
const SPORTS = /ক্রিকেট|ফুটবল|আইপিএল|ওডিআই|ওয়ানডে|টি-টোয়েন্টি|ইস্টবেঙ্গল|মোহনবাগান|ম্যাচ/;
const BUSINESS = /শেয়ার বাজার|শেয়ারবাজার|সেনসেক্স|নিফটি|সোনার দাম|রুপোর দাম|মুদ্রাস্ফীতি|আরবিআই|জিডিপি|রেপো রেট/;

/** The sections of the paper where a headline's word for war or attack means what it says (not a film, a match, or a metaphor of local politics). */
const WAR_IN = new Set<string>(["world", "national", "business", "other"]);
const ATTACK_IN = new Set<string>(["state", "national", "metro", "world", "other"]);
/** The sections I never read for politics, war or attack by their words: a match and a film have their own talk. */
const NOT_NEWS_TALK = new Set<string>(["sports", "entertainment"]);

/** Gives the desk of a story: I look first at the top band by what the story says, then politics, then the section it came from. */
export function classify(s: FeedItem): DeskId {
  const t = s.title, section = (s.desk ?? "other") as DeskId;
  const own: DeskId = DESK.has(section) ? section : "other";
  if (!NOT_NEWS_TALK.has(own) && ATTACK_IN.has(own) && (ATTACK.test(t) || (ATTACK_ON.test(t) && FORCES.test(t)))) return "attack";
  if (WAR_IN.has(own) && WAR.test(t)) return "war";
  if (DEMISE.test(t)) return "demise";
  if (own !== "entertainment" && (s.also?.length ?? 0) + 1 >= TRENDING_PAPERS) return "trending";
  if (own === "other" && SPORTS.test(t)) return "sports";
  if (own === "other" && BUSINESS.test(t)) return "business";
  if (!NOT_NEWS_TALK.has(own) && POLITICS.test(t)) return "politics";
  if (own === "metro" || (!NOT_NEWS_TALK.has(own) && METRO.test(t))) return "metro";
  return own;
}

const at = (s: FeedItem): number => {
  const v = s.publishedAt || s.firstAt;
  const t = v ? DateTime.fromISO(v).toMillis() : NaN;
  return Number.isNaN(t) ? -Infinity : t;
};
const newest = (a: FeedItem, b: FeedItem) => at(b) - at(a);

/** The sections whose news is the reader's own: there a death announced weighs more than the same announcement from far away. */
const LOCAL = new Set<string>(["state", "metro", "national"]);

/** Puts forward a paper's stories of the core and the fill, from the most important down: the desks in turns (one of each, then a second of each, up to the quotas), then the rest, desk by desk. */
function putForward(list: FeedItem[]): FeedItem[] {
  const byDesk = new Map<DeskId, FeedItem[]>(DESKS.map((d) => [d.id, list.filter((s) => s.desk === d.id).sort(newest)]));
  const out: FeedItem[] = [], seen = new Set<FeedItem>();
  const take = (s: FeedItem | undefined) => { if (s && !seen.has(s)) { seen.add(s); out.push(s); } };
  const turns = Math.max(...DESKS.map((d) => d.quota));
  for (let r = 0; r < turns; r++) for (const d of DESKS) if (d.tier > 1 && r < d.quota) take(byDesk.get(d.id)?.[r]);
  // A top-band story that its paper had no more room for in the band (see curate) is still news, so I let it come before the rest of the core and the fill.
  for (const d of DESKS) if (d.tier === 1) for (const s of byDesk.get(d.id) ?? []) take(s);
  for (const d of DESKS) if (d.tier > 1) for (const s of byDesk.get(d.id) ?? []) take(s);
  return out;
}

/**
 * The front page: `limit` stories, shown by time, the latest first (the band only decides which stories are chosen).
 * (1) THE TOP BAND I choose first, across all the papers: each of its desks gives its best story (the higher-priority paper's first, a death in the reader's own sections before a foreign one, then the newest), then a
 *     second, and so on up to the desk's quota, until the band holds TIER1_CAP. A paper holds at most half its share of places in the band (Anandabazar three, Sangbad Pratidin, Bartaman and Ei Samay two, the
 *     others one), so that the top of the page is a mix of papers; the rest of its band stories go down to the core and are shown among the others.
 * (2) THE REST is shared among the papers by SHARE, with the band stories counting HALF against the share of their paper (so a paper with several attacks to report still has places for its metro and business stories): one place of each paper in turn, Anandabazar first, each paper putting forward its own stories by
 *     desk; a place a short paper leaves goes to the papers in priority order.
 */
export function curate(stories: FeedItem[], limit = FRONT_PAGE): FeedItem[] {
  const section = new Map<FeedItem, string>();
  const tagged = stories.map((s) => { const id = classify(s), d = DESK.get(id) as Desk; const t = { ...s, desk: id, tier: d.tier } as FeedItem; section.set(t, s.desk ?? "other"); return t; });
  const papers = [...new Set([...Object.keys(SHARE), ...tagged.map((s) => s.source)])];
  const rank = (s: FeedItem) => papers.indexOf(s.source);
  const share = (p: string) => SHARE[p] ?? 1;
  const local = (s: FeedItem) => Number(LOCAL.has(section.get(s) as string));
  const chosen: FeedItem[] = [];
  const bandOf = new Map<DeskId, FeedItem[]>(DESKS.filter((d) => d.tier === 1).map((d) => [d.id, tagged.filter((s) => s.desk === d.id).sort((a, b) => rank(a) - rank(b) || (d.id === "demise" ? local(b) - local(a) : 0) || newest(a, b))]));
  const turns = Math.max(...DESKS.map((d) => d.quota));
  const inBand = (p: string) => chosen.filter((x) => x.source === p).length;
  const queue = new Map(DESKS.filter((d) => d.tier === 1).map((d) => [d.id, [...(bandOf.get(d.id) ?? [])]]));
  // Each turn a desk gives its best story whose paper still has room in the band. I let a paper hold half its share of places there, so the top of the page is a mix of papers too.
  for (let r = 0; r < turns; r++) for (const d of DESKS) if (d.tier === 1 && r < d.quota) {
    const q = queue.get(d.id) as FeedItem[];
    // The desk's next place goes to the paper with the fewest of the desk's places so far (the higher-priority paper first on a tie). This way one paper does not take all of a desk's places while another has news of it.
    const inDesk = (x: FeedItem) => chosen.filter((c) => c.desk === d.id && c.source === x.source).length;
    let k = -1;
    q.forEach((x, i) => { if (inBand(x.source) < Math.ceil(share(x.source) / 2) && (k < 0 || inDesk(x) < inDesk(q[k]))) k = i; });
    if (k >= 0 && chosen.length < Math.min(limit, TIER1_CAP)) chosen.push(...q.splice(k, 1));
  }
  // The band stories that found no room go down to the core, where their own paper puts them forward before its other stories.
  for (const q of queue.values()) for (const x of q) x.tier = 2;
  const left = new Map(papers.map((p) => [p, Math.max(0, share(p) - Math.ceil(chosen.filter((s) => s.source === p).length / 2))]));
  const inPage = new Set(chosen);
  const lists = papers.map((p) => putForward(tagged.filter((s) => s.source === p && !inPage.has(s))));
  const next = papers.map(() => 0);
  const widest = Math.max(0, ...left.values());
  for (let r = 0; chosen.length < limit; r++) {
    let any = false;
    papers.forEach((p, i) => {
      if (r < widest && r >= (left.get(p) as number)) return;
      if (chosen.length < limit && next[i] < lists[i].length) { chosen.push(lists[i][next[i]++]); any = true; }
    });
    if (r >= widest && !any) break;
  }
  return chosen.sort(newest);
}
