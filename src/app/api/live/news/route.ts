// src/app/api/live/news/route.ts
//
// The top headlines: business (The Economic Times, Mint, BusinessLine, WSJ), steel (hunted in many papers through news searches) or general news in English, Hindi or Bengali, from the publishers' own free feeds (src/lib/live/news.ts). The only thing I read
// from the caller is the tab, and only from a fixed list (biz, steel, en, hi, bn); anything else is English. Feeds that do not answer are left out and named.
// WHAT A CARD MAY SHOW (the owner's rules, news.ts applyFacts): a story with no picture is not shown, and a story that needs a subscription is not shown. Both are read from the story's own page (pageFacts.ts), for the stories at the top of the tab first,
// and further down the list only when too few stories are left.
// HOW IT STAYS QUICK:
//   * all feeds are asked AT THE SAME TIME, and one that has not answered in 3 seconds does not hold the others up: its last good answer is used (or it is left out and named) and it goes on loading in the background;
//   * a tab is FRESH for 30 minutes, or 5 while it holds a priority story reported in the last three hours; from 80% of that time, the first asking is answered at once from what is kept while the next is made in the background (memoSwr), up to three
//     hours old before anybody waits; the pages already read are kept a day, so a rebuild reads only the stories that have just appeared;
//   * BREAKING NEWS BREAKS THE RULE (newsWatch.ts): every three minutes, while somebody is looking, a few quick feeds are tested with the priority rules, and a new priority headline makes the language tabs old at once;
//   * THE OTHER FOUR TABS ARE WARMED (warmOthers): whoever opens the page, after the tab asked for is answered the other four are made ready in the background, two at a time, so that a click on any tab is answered at once from what the server keeps;
//   * THE FINISHED LISTS ARE SAVED in the database (persist, table live_snapshot: the list with its picture addresses, public headlines only) whenever a new one is had, and a server that starts empty (a restart, a new instance) takes them back as
//     what it keeps when they are less than three hours old, so the first visitor is answered at once too and a new list is made in the background;
//   * the host's shared cache may keep the response for a minute only, so that it never adds to that age.
import { after } from "next/server";
import { DateTime } from "luxon";
import { getText } from "@/lib/live/http";
import { liveRoute, liveValue } from "@/lib/live/envelope";
import { savedAnswers } from "@/lib/live/savedAnswers";
import { memo, memoExpire, recall } from "@/lib/live/memo";
import { NEWS_LANGS, NEWS_LIMIT, NEWS_SOURCES, READ_OF, SOURCES_OF, buildNews, buildTab, candidateLinks, hasRecentPriority, isLang, isTab, looksLikeNewsAnswer, needPictures, type NewsData, type NewsLang, type NewsTab } from "@/lib/live/news";
import { FRONT_PAGE } from "@/lib/live/bengali";
import { pictureByHeadline } from "@/lib/live/bingImages";
import { dropSamePhoto, isInspected, rejectLogos } from "@/lib/live/photoHash";
import { resolveFacts, type PageFacts } from "@/lib/live/pageFacts";
import { parseRss } from "@/lib/live/rss";
import { BreakingWatch, WATCHED } from "@/lib/live/newsWatch";
import { dropSameMeaning, meaningLinks, meaningOf } from "@/lib/live/sameNews";

export const dynamic = "force-dynamic";
export const maxDuration = 25;

/** How long a tab is fresh: thirty minutes, five while it holds a priority story of the last three hours. A feed is kept two minutes (so that a rebuild, which comes after at least 24 minutes, or after 4 when a tab is hot, always asks the papers again). */
const TAB_FRESH_MS = 30 * 60 * 1000;
const TAB_HOT_MS = 5 * 60 * 1000;
/** A tab that came out short (the time ran out before enough pictures were found; what was found is kept, so the next build gets further) is kept only two minutes. */
const TAB_SHORT_MS = 2 * 60 * 1000;
const wantOf = (lang: NewsTab) => (lang === "bn" ? FRONT_PAGE : NEWS_LIMIT);
const FEED_TTL_MS = 2 * 60 * 1000;
/** A feed that has not answered in this time is not waited for. */
const FEED_DEADLINE_MS = 3000;
/** How many stories' pages are read at a time, and at most how many times more are looked at when too few stories are left. */
const LOOK_AT = 30;
const MAX_ROUNDS = 3;

/** Keeps a background job alive after the response has gone (on the host); outside a request (a test) the job just runs. */
const keep = (job: Promise<unknown>) => { try { after(() => job); } catch { /* nothing to keep it for */ } };

const watch = new BreakingWatch();

/** One feed, kept by its address (so that a feed shared by tabs is asked once); one that has not answered in FEED_DEADLINE_MS gives what was kept of it (or nothing) and finishes by itself. */
async function readOne(s: ReturnType<typeof READ_OF>[number]): Promise<string | null> {
  const key = `news-src:${s.url}`;
  const loading = memo(key, s.ttlMs ?? FEED_TTL_MS, () => getText(s.url, { timeoutMs: 8000 })).then((m) => m.value, () => recall<string>(key)?.value ?? null);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<string | null>((resolve) => { timer = setTimeout(() => resolve(recall<string>(key)?.value ?? null), FEED_DEADLINE_MS); });
  const got = await Promise.race([loading, late]);
  clearTimeout(timer);
  keep(loading);
  return got;
}
const read = (list: ReturnType<typeof READ_OF>) => Promise.all(list.map(readOne));

/** The watch: when it is time, reads the quick feeds and, if a priority headline is new, makes the three language tabs old (they are rebuilt in the background at the next asking). */
function lookForBreaking() {
  if (!watch.due(Date.now())) return;
  keep((async () => {
    const quick = NEWS_LANGS.flatMap((l) => NEWS_SOURCES[l].filter((s) => WATCHED.includes(s.name)));
    const texts = await Promise.all(quick.map(readOne));
    const titles = texts.flatMap((t, i) => (t ? parseRss(t, quick[i].name, quick[i].splitSource).map((x) => x.title) : []));
    if (watch.look(titles).length) for (const l of NEWS_LANGS) memoExpire(`news-${l}`, TAB_FRESH_MS + 1000);
  })().catch(() => undefined));
}

/**
 * EVERYTHING A TAB NEEDS TO BE SERVED, in one place: serving a tab (GET) and warming one in the background (warmOthers) use these same options, so that they share one kept answer, one saved copy and one build in progress.
 * `persist` with `seed`: the finished list (with its picture addresses) is saved in the database whenever a new one is had, and a server that starts empty takes it back as what it keeps, so the first visitor is answered at once.
 */
function tabOptions(lang: NewsTab) {
  const sources = SOURCES_OF(lang);
  return {
    key: `news-${lang}`,
    persist: { store: savedAnswers, check: looksLikeNewsAnswer, seed: true },
    ttlMs: (kept: NewsData) => (hasRecentPriority(kept, DateTime.now()) ? TAB_HOT_MS : kept.items.length < Math.ceil(wantOf(lang) * 0.8) ? TAB_SHORT_MS : TAB_FRESH_MS),
    swr: { schedule: keep, cacheMs: 60 * 1000 },
    source: [...new Set(sources.map((s) => s.name))].join(", "),
    sourceUrl: sources[0].home ?? `${new URL(sources[0].url).origin}/`,
    // I name and link every paper that is read (each to its own site), not only the first
    sourceLinks: [...new Map(sources.map((s) => [s.name, { name: s.name, url: s.home ?? `${new URL(s.url).origin}/` }])).values()],
    load: async () => {
      // THE SAME NEWS BY MEANING (src/lib/live/sameNews.ts): the headlines the rules cannot join are put to a light model AFTER the answer has gone; the answer I give now uses what it has already said (meaningOf).
      const later = (titles: string[]) => keep(meaningLinks(titles).then(() => undefined));
      const want = wantOf(lang);
      const facts = new Map<string, PageFacts>();
      /** the stories whose headline has been searched for in this build */
      const searched = new Set<string>();
      // Looks at the stories' pages, 30 at a time, as many rounds as the tab needs to fill itself (the pages already read are kept, so a rebuild looks only at what is new). A story that is still without a picture after its page has been
      // looked at gets a second source: Bing News searched for its headline, a picture taken only from an item of the SAME headline (the owner's rule: a relevant picture or no story).
      const fill = async (more: () => string[], lacking: () => Array<{ title: string; link: string; same: string[] }>, make: () => NewsData): Promise<NewsData> => {
        const until = Date.now() + 4000;
        let data: NewsData | null = null;
        for (let round = 0; round < MAX_ROUNDS; round++) {
          const links = more();
          // the pages are read and, at the same time, the headlines of the stories whose pages cannot be read (needPictures leaves out the readable ones not yet looked at) are searched at Bing
          const [got] = await Promise.all([
            links.length ? resolveFacts(links, { deadlineMs: Math.max(800, Math.min(3500, until - Date.now())) }) : Promise.resolve(new Map<string, PageFacts>()),
            findPictures(lacking(), Math.max(600, until - Date.now())),
          ]);
          for (const [k, v] of got) facts.set(k, v);
          // then those whose pages were read and gave no picture
          const asked = lacking();
          if (asked.length && Date.now() < until) await findPictures(asked, Math.max(600, until - Date.now()));
          data = make();
          if ((!links.length && !asked.length) || data.items.length >= want || Date.now() >= until) break;
        }
        data = data ?? make();
        // NO RELEVANT PICTURE, NO STORY: a picture that is a logo (a paper's own, given by an image search for a story it has no picture of) is rejected, and the list is made again without those stories
        // EVERY PICTURE SHOWN HAS BEEN LOOKED AT: the pictures of the list are looked at (4 s at most); a logo is rejected and the list made again without its story (twice); a story whose picture could not be looked at in time is NOT shown (a logo
        // must never get through because the check was late), and the tab, short for it, is made again in two minutes, when the pictures looked at are remembered.
        for (let pass = 0; pass < 3 && (await rejectLogos(data.items.map((i) => i.image), 4000)) > 0; pass++) data = make();
        data = { ...data, items: data.items.filter((i) => isInspected(i.image)) };
        // ONE NEWS, ONE ROW, BEFORE THE ANSWER GOES: the judge of sameNews.ts (embeddings to shortlist, a light Gemini model to decide; only public headlines are sent) is asked about this list's own headlines, for at most 4 seconds, and the stories it calls
        // the same news are joined; what it said is kept, so a later build asks only about new headlines. Then one photograph, one story: two papers' copies of the same picture under stories of the same words are joined too.
        const asking = meaningLinks(data.items.map((i) => i.title)).catch(() => undefined);
        let timer: ReturnType<typeof setTimeout> | undefined;
        let late = true;
        await Promise.race([asking.then(() => { late = false; }), new Promise((resolve) => { timer = setTimeout(resolve, 4000); })]);
        clearTimeout(timer);
        // THE JUDGE MAY BE TOO LATE (its first asking on a server that has just started can take longer than the 4 seconds): the answer then goes out as it is, and when the judge does answer, a list that its verdicts would shorten is made old at once, so that the next asking gets it joined (the verdicts are kept, so the rebuild asks nothing)
        const result: NewsData = { ...data, verified: true, items: await dropSamePhoto(dropSameMeaning(data.items)) };
        if (late) {
          keep(asking.then(() => {
            const joined = dropSameMeaning(result.items);
            if (joined.length >= result.items.length) return;
            // the answer is what is kept under the tab's key: mended in place, so that the very next asking gets it joined; if it is not (a copy was made), it is made old instead
            if (recall<NewsData>(`news-${lang}`)?.value === result) result.items = joined; else memoExpire(`news-${lang}`, TAB_FRESH_MS + 1000);
          }));
        }
        return result;
      };
      /** Asks Bing News for the pictures of these headlines, all together; the answer waits at most `ms` for them. What is found is put with the story's page facts (and its other reports'). A search not finished in time goes on after the answer (it is kept, and the tab, which is then short, is rebuilt in two minutes). */
      const findPictures = async (asked: Array<{ title: string; link: string; same: string[] }>, ms: number) => {
        if (!asked.length) return;
        const reader = (u: string) => getText(u, { timeoutMs: 6000 }).catch(() => null);
        const jobs = Promise.allSettled(asked.map(async (a) => {
          const image = await pictureByHeadline(a.title, reader);
          searched.add(a.link);
          for (const link of [a.link, ...a.same]) {
            const had = facts.get(link);
            facts.set(link, { image: image ?? had?.image ?? null, paid: had?.paid ?? false, read: had?.read ?? false });
          }
        }));
        keep(jobs);
        let timer: ReturnType<typeof setTimeout> | undefined;
        await Promise.race([jobs, new Promise((resolve) => { timer = setTimeout(resolve, ms); })]);
        clearTimeout(timer);
      };
      if (isLang(lang)) {
        // A language tab also reads the feeds of the other two languages, so that the same death, accident or visit, told in three languages, stands in ONE tab only (the language it arrived in first; src/lib/live/priority.ts), unless it is a major one. ALL feeds are asked together.
        const all = await Promise.all(NEWS_LANGS.map(async (l: NewsLang) => [l, await read(READ_OF(l))] as const));
        const textsByLang = Object.fromEntries(all) as Partial<Record<NewsLang, Array<string | null>>>;
        const now = DateTime.now();
        return fill(() => candidateLinks(lang, textsByLang, [], now, facts, LOOK_AT), () => needPictures(lang, textsByLang, [], now, facts, 36, searched), () => buildTab(lang, textsByLang, now, undefined, meaningOf, later, facts));
      }
      const texts = await read(READ_OF(lang));
      const now = DateTime.now();
      const data = await fill(() => candidateLinks(lang, {}, texts, now, facts, LOOK_AT), () => needPictures(lang, {}, texts, now, facts, 36, searched), () => buildNews(lang, texts, now, undefined, meaningOf, facts));
      if (lang === "steel") later(data.items.map((i) => i.title));
      return data;
    },
  };
}

const ALL_TABS: NewsTab[] = ["en", "hi", "bn", "biz", "steel"];
const WARM_EVERY_MS = 20 * 1000;
let warmedAt = 0;
/**
 * WARMING: whoever opens the news page, the other four tabs are made ready in the background (after the tab asked for has been answered), two at a time, so that a click on any tab is answered at once from what the server keeps; a tab already fresh costs nothing
 * (and one past 80% of its time is refreshed ahead), one the database has a copy of is taken from there first. Asked at most every 20 seconds.
 */
function warmOthers(lang: NewsTab) {
  if (Date.now() - warmedAt < WARM_EVERY_MS) return;
  warmedAt = Date.now();
  const queue = ALL_TABS.filter((t) => t !== lang);
  keep(Promise.all([0, 1].map(async () => {
    for (let t = queue.shift(); t; t = queue.shift()) {
      try { await liveValue<NewsData>(tabOptions(t)); } catch { /* a tab that cannot be made now is asked again when it is opened */ }
    }
  })));
}

export async function GET(req: Request) {
  const asked = new URL(req.url).searchParams.get("lang");
  const lang: NewsTab = isTab(asked) ? asked : "en";
  lookForBreaking();
  const answer = await liveRoute<NewsData>(tabOptions(lang));
  warmOthers(lang);
  return answer;
}
