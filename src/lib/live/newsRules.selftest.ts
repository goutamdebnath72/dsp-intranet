// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/lib/live/newsRules.selftest.ts
// This tests the owner's rules for what a card may show, as the tab builders apply them (news.ts applyFacts): a story with no picture is not shown; a story its paper marks as paid is not shown; with two exceptions (priority news, and the Steel tab's pictures).
// Also the new sources (the news sitemaps of Bartaman and Ei Samay, saved as they were on 28 Nov 2026), Bing's pictures for the papers that refuse to be read, and which stories' pages are looked at next.
import { readFileSync } from "node:fs";
import { DateTime } from "luxon";
import { applyFacts, looksLikeNewsAnswer, needPictures, buildNews, buildTab, candidateLinks, hasRecentPriority, IMAGE_HELPERS, NEWS_SOURCES, PAID_STORIES_SHOWN, PICTURE_REQUIRED, READ_OF, STEEL_TAB_SOURCES, BUSINESS_SOURCES, type NewsLang } from "./news";
import { attachPictures, bingHeadlineSearch, bingPictureOf, bingSite, parseBingPictures, pictureByHeadline, pictureFound, sameHeadline } from "./bingImages";
import { different, dropSamePhoto, looksLikeLogo } from "./photoHash";
import sharp from "sharp";
import { rejectPicture, usableImage } from "./thumb";
import { mergeFeeds, onePerPicture, parseSitemap, pictureKey, samePictureStory } from "./rss";
import type { PageFacts } from "./pageFacts";
import type { FeedItem } from "./rss";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };
const fx = (n: string) => readFileSync(`src/lib/live/fixtures/${n}`, "utf8");
const NOW = DateTime.fromISO("2026-11-28T08:00:00Z");
const facts = (rows: Record<string, Partial<PageFacts>>): Map<string, PageFacts> => new Map(Object.entries(rows).map(([k, v]) => [k, { image: null, paid: false, read: true, ...v }]));
const rss = (rows: Array<{ t: string; h: number; img?: string; id: string }>) => `<rss><channel><title>x</title>${rows.map((r) => `<item><title>${r.t}</title><link>https://www.thehindu.com/news/${r.id}.ece</link><pubDate>${NOW.minus({ hours: r.h }).toRFC2822()}</pubDate>${r.img ? `<media:content url="${r.img}" medium="image"/>` : ""}</item>`).join("")}</channel></rss>`;
const PIC = (n: string) => `https://th-i.thgim.com/public/${n}.jpg`;
const only = (lang: NewsLang, text: string): Array<string | null> => NEWS_SOURCES[lang].map((_s, k) => (k === 0 ? text : null));

ok("the policy lines say what they are: pictures required (no exception), paid stories not shown", PICTURE_REQUIRED === true && PAID_STORIES_SHOWN === false);

// --- applyFacts
const A: FeedItem[] = [
  { title: "Alpha story with its picture in the feed", link: "https://www.thehindu.com/news/a.ece", publishedAt: "2026-11-28T06:00:00Z", source: "P", summary: "", image: PIC("a") },
  { title: "Bravo story whose paper marks it paid", link: "https://www.thehindu.com/news/b.ece", publishedAt: "2026-11-28T06:00:00Z", source: "P", summary: "", image: PIC("b") },
  { title: "Charlie story with no picture anywhere", link: "https://www.jagran.com/news/c.html", publishedAt: "2026-11-28T06:00:00Z", source: "P", summary: "" },
  { title: "Delta story whose page gave the picture", link: "https://www.jagran.com/news/d.html", publishedAt: "2026-11-28T06:00:00Z", source: "P", summary: "" },
  { title: "Veteran actor dies in Mumbai, PM condoles", link: "https://www.jagran.com/news/e.html", publishedAt: "2026-11-28T06:00:00Z", source: "P", summary: "" },
];
const f = facts({ "https://www.thehindu.com/news/b.ece": { paid: true }, "https://www.jagran.com/news/d.html": { image: "https://www.jagranimages.com/images/d.webp" } });
const kept = applyFacts(A, f);
ok("no facts at all (the pages were not asked): the list as it is", applyFacts(A, undefined) === A);
ok("a story with its picture stays; a paid story goes; a story with no picture goes; a story whose page gave the picture stays with it; a priority story (a death) with no picture goes too: no exception", kept.map((x) => x.title.split(" ")[0]).join() === "Alpha,Delta" && kept[1].image === "https://www.jagranimages.com/images/d.webp", kept.map((x) => x.title.split(" ")[0]).join());
ok("a caller that does not need pictures (requirePicture false) keeps a story with no picture, and a paid one still goes", applyFacts(A, f, { requirePicture: false }).map((x) => x.title.split(" ")[0]).join() === "Alpha,Charlie,Delta,Veteran");
ok("a story not yet looked at keeps what its feed gave: with a picture it stays (not known to be paid), without one it goes", applyFacts([A[0], A[2]], new Map()).map((x) => x.title.split(" ")[0]).join() === "Alpha");
ok("a picture too large to be a thumbnail (a 17 MB animated GIF of the Times of India, its size in the address) is no picture: the story goes unless its page gives a usable one", (() => { const big = { title: "Watch: man shot at on a highway abroad, video shows", link: "https://timesofindia.indiatimes.com/a/1.cms", publishedAt: "2026-11-28T06:00:00Z", source: "P", summary: "", image: "https://static.toiimg.com/photo/msid-136238951,imgsize-17121652.cms" }; return applyFacts([big], new Map()).length === 0 && applyFacts([big], facts({ [big.link]: { image: "https://static.toiimg.com/photo/msid-1,imgsize-90000.cms" } }))[0]?.image === "https://static.toiimg.com/photo/msid-1,imgsize-90000.cms" && applyFacts([{ ...big, title: "Veteran actor dies in Mumbai, PM condoles" }], new Map())[0]?.image === undefined; })());
ok("a paid priority story is not shown either (the paywall rule has no exception)", applyFacts([A[4]], facts({ [A[4].link]: { paid: true } })).length === 0);



// --- one picture, one story
{
  const B1 = "https://www.bing.com/th?id=ONUT.AAA&pid=News&w=720&h=480&c=7", B2 = "https://www.bing.com/th?id=ONUT.AAA&pid=News&w=300&h=200";
  const mk = (title: string, source: string, image: string, h: number): FeedItem => ({ title, link: `https://example.org/${encodeURIComponent(title).slice(0, 20)}${source}`, publishedAt: NOW.minus({ hours: h }).toISO()!, source, summary: "", image });
  const a = mk("SAIL Rourkela Steel Plant launches safety initiative for contractual workers", "PSU Watch", B1, 16);
  const b = mk("SAIL's Rourkela Steel Plant Launches First Department-Level 'Surakshya Charcha' to Promote Workplace Safety", "Indian Masterminds", B2, 20);
  ok("a picture has one identity whatever size Bing was asked for it in", pictureKey(B1) === pictureKey(B2) && pictureKey(B1) === "bing:ONUT.AAA" && pictureKey("https://a.example/i/1.jpg?w=100") === pictureKey("https://a.example/i/1.jpg?w=900") && pictureKey(undefined) === "");
  ok("two reports with the same picture and three shared words are one story; the same picture with nothing in common is not (a stock picture)", samePictureStory(a, b) && !samePictureStory(a, mk("Tata Steel plans new blast furnace at Kalinganagar", "X", B1, 3)));
  ok("onePerPicture keeps the first and names the other paper", (() => { const o = onePerPicture([a, b]); return o.length === 1 && o[0].source === "PSU Watch" && o[0].also?.join() === "Indian Masterminds"; })());
  ok("mergeFeeds joins them too, so the Steel tab shows the story once", mergeFeeds([[a, b]], 10, NOW, 48).length === 1);
  ok("a different picture keeps two reports of different words apart", onePerPicture([a, { ...b, image: "https://www.bing.com/th?id=ONUT.ZZZ&pid=News" }]).length === 2);
}


// --- the saved copy of a tab (the database): only a copy of the right shape, with a picture on every story, is taken
{
  const it = (extra: object = {}) => ({ title: "A story", link: "https://x.org/a", source: "P", publishedAt: "2026-11-28T06:00:00Z", summary: "", image: "https://th.bing.com/th?id=ONUT.A", ...extra });
  const tab = (items: object[], extra: object = {}) => ({ lang: "steel", items, used: ["P"], failed: [], ...extra });
  ok("a saved tab of the right shape, every story with its picture, is taken (all five tabs' names)", looksLikeNewsAnswer(tab([it()])) && ["en", "hi", "bn", "biz", "steel"].every((l) => looksLikeNewsAnswer(tab([it()], { lang: l }))));
  ok("a saved tab is refused when a story has no picture (a copy of an older build), no list, a wrong tab name, a link that is not http(s), or a picture that is not https", !looksLikeNewsAnswer(tab([it(), it({ image: undefined })])) && !looksLikeNewsAnswer(tab([])) && !looksLikeNewsAnswer(tab([it()], { lang: "xx" })) && !looksLikeNewsAnswer(tab([it({ link: "javascript:alert(1)" })])) && !looksLikeNewsAnswer(tab([it({ image: "http://x.org/a.jpg" })])) && !looksLikeNewsAnswer(null) && !looksLikeNewsAnswer("x") && !looksLikeNewsAnswer({ lang: "en" }));
}

let later: Promise<void> = Promise.resolve();

// --- the same photograph under two addresses (photoHash.ts)
{
  const p1 = "https://www.bing.com/th?id=ONUT.P1&pid=News", p2 = "https://www.bing.com/th?id=ONUT.P2&pid=News", p3 = "https://www.bing.com/th?id=ONUT.P3&pid=News";
  const mk = (title: string, source: string, image: string): FeedItem => ({ title, link: `https://e.org/${source}`, publishedAt: NOW.toISO()!, source, summary: "", image });
  const a = mk("SAIL Rourkela Steel Plant launches safety initiative for contractual workers", "A", p1), b = mk("SAIL Rourkela Steel Plant launches safety review with contractors workers", "B", p2), c = mk("SAIL Rourkela Steel Plant launches safety initiative for officers", "C", p3);
  const fake = async (u: string) => (u === p1 ? 0b1010n : u === p2 ? 0b1011n : u === p3 ? 0xffffffffffffffffn : null);
  later = later.then(async () => {
    ok("the bits that differ between two fingerprints are counted", different(0b1010n, 0b1011n) === 1 && different(0n, 0xffffffffffffffffn) === 64);
    const out = await dropSamePhoto([a, b, c], 1000, 8, fake);
    ok("of two stories with three shared words and one photograph (fingerprints 1 bit apart) the first stays and names the other paper; a different photograph keeps its story", out.length === 2 && out[0].source === "A" && out[0].also?.join() === "B" && out[1].source === "C");
    ok("a picture that cannot be read leaves both stories", (await dropSamePhoto([a, mk(b.title, "D", "https://www.bing.com/th?id=ONUT.NONE&pid=News")], 1000, 8, fake)).length === 2);
  });
}

// --- no relevant picture, no story: a logo is no picture
{
  const svg = (inner: string) => sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">${inner}</svg>`)).png().toBuffer();
  later = later.then(async () => {
    const logo = await svg('<rect width="200" height="200" fill="#fff"/><circle cx="100" cy="60" r="18" fill="#f80"/><rect x="60" y="110" width="80" height="40" fill="#111"/>');
    const photo = await svg('<rect width="200" height="200" fill="#357"/><rect x="20" y="20" width="160" height="90" fill="#c84"/><rect x="0" y="130" width="200" height="70" fill="#4a6"/>');
    const framed = await svg('<rect width="200" height="200" fill="#fff"/><rect x="20" y="60" width="160" height="110" fill="#357"/><rect x="40" y="90" width="60" height="60" fill="#c84"/>');
    ok("a mostly white flat graphic (a paper's logo) is a logo; a photograph, and a photograph with white margins, are not", (await looksLikeLogo(logo)) === true && (await looksLikeLogo(photo)) === false && (await looksLikeLogo(framed)) === false);
    const bad = "https://www.bing.com/th?id=ONUT.LOGO1&pid=News&w=720&h=480";
    ok("a picture rejected as a logo is no usable picture from then on, whatever size it is asked in; another is still usable", usableImage(bad) && (rejectPicture(bad), !usableImage(bad) && !usableImage("https://www.bing.com/th?id=ONUT.LOGO1&pid=News&w=300")) && usableImage("https://www.bing.com/th?id=ONUT.OTHER&pid=News"));
    ok("a stock picture by its address (HT's ht-generic, a placeholder, a default image) is no usable picture; Mint's /logo/ folder of real story pictures is", !usableImage("https://www.hindustantimes.com/ht-img/img/2025/06/30/1600x900/logo/ht-generic_india3_1751287297962.jpg") && !usableImage("https://x.example/img/placeholder.png") && !usableImage("https://x.example/img/default.jpg") && usableImage("https://www.livemint.com/lm-img/img/2026/11/28/1600x900/logo/Apple_OpenAI.jpg"));
    const a = [{ title: "Story with a logo for a picture", link: "https://www.jagran.com/a", publishedAt: "2026-11-28T06:00:00Z", source: "P", summary: "", image: bad }];
    ok("a story whose only picture is a rejected logo goes from the list", applyFacts(a, new Map()).length === 0);
  });
}
// --- the second source of a picture: Bing News searched for the headline, taken only for the SAME headline
ok("the same headline with the paper's name or an ellipsis is the same story", sameHeadline("5 workers critically burnt as hot furnace dust falls on them at Chhattisgarh steel plant", "5 workers critically burnt as hot furnace dust falls on them at Chhattisgarh steel plant...") && sameHeadline("SAIL pays Rs 53.88 crore for HR facelift, price 288% higher than estimated cost", "SAIL pays Rs 53.88 crore for HR facelift, price 288% higher than estimated cost"));
ok("two different stories of the same companies are NOT the same headline (a stock comparison, a price-target piece; a launch and a safety initiative)", !sameHeadline("SAIL vs Jindal Steel: Steel Stocks Compared 2027", "Tata Steel, JSW Steel, SAIL, Jindal Steel: Check fresh targets") && !sameHeadline("SAIL Rourkela Steel Plant launches safety initiative for contractual workers", "SAIL's Rourkela Steel Plant Launches First Department-Level Review") && !sameHeadline("Five workers suffer severe burns in hot dust accident at steel plant", "Sebi to look into Tata Steel-Apollo APL deal over minority shareholders"));
ok("two headlines of one template with different figures are not the same", !sameHeadline("India steel output rises 7.5 pc to 99.4 MT in April-October", "India steel output rises 4.1 pc to 61.2 MT in April-October"));
ok("the headline search asks Bing for the first nine words, without the paper's name, as RSS for India", (() => { const u = new URL(bingHeadlineSearch("Tata Steel Share Price Target at Rs 200 after the ICICI Securities call on the deal - topnews.in")); return u.hostname === "www.bing.com" && u.searchParams.get("format") === "rss" && u.searchParams.get("q") === "Tata Steel Share Price Target at Rs 200 after" && u.searchParams.get("cc") === "in"; })());
{
  const xml = (t: string) => `<rss><channel><item><title>${t}</title><link>https://x/y</link><News:Image>https://www.bing.com/th?id=ON.abc&amp;pid=News</News:Image></item></channel></rss>`;
  let calls = 0;
  const reader = (body: string | null) => async () => { calls++; return body; };
  const T = "Zebra mill fire at the Quagga steel plant injures workers";
  later = later.then(async () => {
    const hit = await pictureByHeadline(T, reader(xml(T)));
    ok("a picture is taken from the Bing item of the same headline, at 720 x 480", /^https:\/\/www\.bing\.com\/th\?/.test(hit ?? "") && /w=720/.test(hit ?? "") && /h=480/.test(hit ?? ""), String(hit));
    const again = await pictureByHeadline(T, reader(null));
    ok("the answer is kept: the same headline is not asked twice", again === hit && calls === 1 && pictureFound(T) === hit);
    const U = "Yak foundry strike at the Lemur steel works ends after talks";
    ok("an item of another headline gives no picture, and 'none' is kept", (await pictureByHeadline(U, reader(xml("Giraffe rolling mill outage at Okapi steel works delays orders")))) === null && pictureFound(U) === null);
    const V = "Tapir blast furnace relining begins at the Ibex steel plant";
    ok("a search that failed keeps nothing, so that it is asked again", (await pictureByHeadline(V, reader(null))) === null && pictureFound(V) === undefined);
  }).catch((e) => ok("headline search tests ran", false, String(e)));
}

// --- the language tab with the rules
{
  const rows = [
    { t: "Budget session of Parliament to begin on Monday", h: 1, img: PIC("1"), id: "1" },
    { t: "Metro services hit in Kolkata after power failure", h: 2, id: "2" },
    { t: "Court reserves verdict in the mining lease case", h: 3, img: PIC("3"), id: "3" },
    { t: "Veteran actor Dharmendra dies in Mumbai, PM condoles", h: 4, id: "4" },
  ];
  const by = { en: only("en", rss(rows)), hi: only("hi", rss([])), bn: only("bn", rss([])) };
  const plain = buildTab("en", by, NOW).items.map((i) => i.id ?? i.link);
  const ruled = buildTab("en", by, NOW, undefined, undefined, undefined, facts({ "https://www.thehindu.com/news/3.ece": { paid: true }, "https://www.thehindu.com/news/2.ece": { image: PIC("2") } }));
  const names = ruled.items.map((i) => i.title.split(" ")[0]);
  ok("without facts the tab is as before (all four stories)", plain.length === 4);
  ok("with facts: the paid story (Court) is left out; the story whose page gave a picture (Metro) is in; the death with no picture is out like any other (no exception)", !names.includes("Court") && names.includes("Metro") && !names.includes("Veteran") && ruled.items.find((i) => i.title.startsWith("Metro"))?.image === PIC("2") && names.includes("Budget"), names.join());
  const withPic = buildTab("en", by, NOW, undefined, undefined, undefined, facts({ "https://www.thehindu.com/news/4.ece": { image: PIC("4") } }));
  ok("the same death, once a picture is found for it, is shown first with its flag", withPic.items[0].title.startsWith("Veteran") && withPic.items[0].flag?.kind === "demise" && withPic.items[0].image === PIC("4"), withPic.items.map((i) => i.title.split(" ")[0]).join());
}

// --- the new Bengali sources: the news sitemaps, and Bing's pictures
const bn = NEWS_SOURCES.bn;
const iBart = bn.findIndex((s) => s.name === "Bartaman"), iEi = bn.findIndex((s) => s.name === "Ei Samay"), iAaj = bn.findIndex((s) => s.name === "Aajkaal");
ok("Bartaman and Ei Samay are read from their news sitemaps (not Google News); Aajkaal, whose sitemap has English headlines only, still comes through Google News", bn[iBart].sitemap === true && bn[iBart].url === "https://bartamanpatrika.com/news-sitemap.xml" && bn[iEi].sitemap === true && bn[iEi].url === "https://eisamay.com/news_sitemap.xml" && !bn[iAaj].sitemap && /news\.google\.com/.test(bn[iAaj].url));
const ei = parseSitemap(fx("sitemap-eisamay-2026-11-28.xml"), "Ei Samay"), bt = parseSitemap(fx("sitemap-bartaman-2026-11-28.xml"), "Bartaman");
ok("a news sitemap gives each story's address, Bengali headline, time and (Ei Samay's) picture, newest first; Bartaman's has no pictures (the fixture has 5 entries each, Ei Samay's fifth is a short video)", ei.length === 5 && bt.length === 5 && ei.every((x) => x.link.startsWith("https://eisamay.com/") && /[ঀ-৿]/.test(x.title) && x.publishedAt && /^https:\/\/cf-images\.assettype\.com\//.test(x.image ?? "")) && bt.every((x) => x.link.startsWith("https://bartamanpatrika.com/news/") && !x.image) && ei[0].publishedAt >= ei[4].publishedAt, JSON.stringify(ei.map((x) => x.image)));
{
  const texts = bn.map((_s, k) => (k === iBart ? fx("sitemap-bartaman-2026-11-28.xml") : k === iEi ? fx("sitemap-eisamay-2026-11-28.xml") : null));
  const d = buildNews("bn", texts, DateTime.fromISO("2026-11-28T08:00:00Z"));
  const names = d.items.map((i) => i.source);
  ok("the Bengali tab built from the sitemaps holds Bartaman's and Ei Samay's stories, and not Ei Samay's short videos (left out by their address)", d.items.length >= 8 && names.includes("Bartaman") && names.includes("Ei Samay") && !d.items.some((i) => /samay-shorts|shorts-video/.test(i.link)), `${d.items.length} ${[...new Set(names)]}`);
  const withFacts = buildNews("bn", texts, DateTime.fromISO("2026-11-28T08:00:00Z"), undefined, undefined, facts({ [bt[0].link]: { image: "https://cdn.bartamanpatrika.com/images/a_og.png" } }));
  ok("with the facts: a Bartaman story shows once its page has given the picture, the others of Bartaman (not looked at, no picture) are not shown, Ei Samay's four stories stay (their picture is in the sitemap; the fifth entry is a short video, left out)", withFacts.items.filter((i) => i.source === "Bartaman").length === 1 && withFacts.items.filter((i) => i.source === "Ei Samay").length === 4, JSON.stringify(withFacts.items.map((i) => i.source)));
}
const bing = fx("bing-site-anandabazar-2026-11-28.xml");
const hints = parseBingPictures(bing);
ok("Bing's feed gives each item's headline and a 3:2 picture on Bing's own host, asked at 720 x 480, over https (an item with no picture gives no hint: 3 of the 4)", hints.length === 3 && hints.every((h) => /^https:\/\/www\.bing\.com\/th\?id=ONUT\./.test(h.image) && /w=720/.test(h.image) && /h=480/.test(h.image) && /c=7/.test(h.image) && /[ঀ-৿]/.test(h.title)) && bingPictureOf("<News:Image>http://evil.example/a.jpg</News:Image>") === "" && bingPictureOf("<x/>") === "");
ok("the two papers that refuse automated reading and Aajkaal are asked at Bing for pictures only: Anandabazar four ways, the Telegraph once, Aajkaal once; the helper feeds are read after the sources and are never shown as stories", IMAGE_HELPERS.bn.length === 5 && IMAGE_HELPERS.en.length === 1 && READ_OF("bn").length === NEWS_SOURCES.bn.length + 5 && READ_OF("en")[NEWS_SOURCES.en.length].name === "Bing News (pictures)" && bingSite("anandabazar.com", "bn").url.includes("sortbydate") && READ_OF("steel").length === STEEL_TAB_SOURCES.length);
{
  const g: FeedItem = { title: hints[0].title.replace(/[.…]+$/, ""), link: "https://news.google.com/rss/articles/CBMi", publishedAt: "2026-11-28T06:00:00Z", source: "Anandabazar Patrika", summary: "" };
  const miss = { ...g, title: "একটি একেবারেই অন্য খবর যা বিংয়ে নেই", link: "https://news.google.com/rss/articles/CBMj" };
  const out = attachPictures([g, miss], hints);
  ok("a Google-News story of Anandabazar gets the picture of the Bing item that is the same story (Bing may cut the headline with ...); one that Bing does not have gets none", out[0].image === hints[0].image && !out[1].image && sameHeadline(hints[0].title, g.title) && !sameHeadline(hints[0].title, miss.title));
  // through the tab: texts = sources then helpers; the story is shown with the picture, an ABP story with none is not
  const feedRows = `<rss><channel><title>x</title><item><title>${g.title} - Anandabazar Patrika</title><link>https://news.google.com/rss/articles/CBMi</link><pubDate>${NOW.minus({ hours: 2 }).toRFC2822()}</pubDate></item><item><title>${miss.title} - Anandabazar Patrika</title><link>https://news.google.com/rss/articles/CBMj</link><pubDate>${NOW.minus({ hours: 1 }).toRFC2822()}</pubDate></item></channel></rss>`;
  const texts = [feedRows, ...bn.slice(1).map(() => null), bing, null, null, null, null];
  const d = buildNews("bn", texts, NOW, undefined, undefined, new Map());
  ok("through the Bengali tab: the story with Bing's picture is shown with it, the one Bing has not is left out (no picture)", d.items.length === 1 && d.items[0].image === hints[0].image && d.items[0].source === "Anandabazar Patrika", JSON.stringify(d.items.map((i) => [i.title.slice(0, 20), i.image])));
}

// --- Business and Steel
{
  const BL = BUSINESS_SOURCES.findIndex((s) => s.name === "The Hindu BusinessLine"), ET = BUSINESS_SOURCES.findIndex((s) => s.name === "The Economic Times");
  const biz = (rows: string) => BUSINESS_SOURCES.map((_s, k) => (k === BL ? rows : null));
  const mk = (id: string, t: string, img?: string) => `<item><title>${t}</title><link>https://www.thehindubusinessline.com/economy/${id}.ece</link><pubDate>${NOW.minus({ hours: 1 }).toRFC2822()}</pubDate>${img ? `<media:content url="${img}" medium="image"/>` : ""}</item>`;
  const text = `<rss><channel><title>x</title>${mk("free", "Free story about the economy and trade", PIC("f"))}${mk("paid", "Premium story about the economy and exports", PIC("p"))}${mk("nopic", "Story about the rupee outlook with no picture")}</channel></rss>`;
  const d = buildNews("biz", biz(text), NOW, undefined, undefined, facts({ "https://www.thehindubusinessline.com/economy/paid.ece": { paid: true } }));
  ok("the Business tab shows the free story with its picture, not the premium one, not the one without a picture", d.items.map((i) => i.title.split(" ")[0]).join() === "Free", d.items.map((i) => i.title).join("|"));
  ok("the Business tab built without facts is as before (all three)", buildNews("biz", biz(text), NOW).items.length === 3);
  const st = STEEL_TAB_SOURCES.map((_s, k) => (k === STEEL_TAB_SOURCES.length - BUSINESS_SOURCES.length + ET ? `<rss><channel><title>x</title><item><title>SAIL Durgapur steel plant output rises in November</title><link>https://economictimes.indiatimes.com/industry/a/articleshow/1.cms</link><pubDate>${NOW.minus({ hours: 1 }).toRFC2822()}</pubDate></item><item><title>Tata Steel plant expansion in Odisha approved</title><link>https://economictimes.indiatimes.com/prime/b/primearticleshow/2.cms</link><pubDate>${NOW.minus({ hours: 2 }).toRFC2822()}</pubDate></item></channel></rss>` : null));
  const sd = buildNews("steel", st, NOW, undefined, undefined, facts({ "https://economictimes.indiatimes.com/prime/b/primearticleshow/2.cms": { paid: true } }));
  ok("the Steel tab leaves out a steel story that has no picture, and one the paper marks as paid", sd.items.length === 0, JSON.stringify(sd.items.map((i) => i.title)));
  const sd2 = buildNews("steel", st, NOW, undefined, undefined, facts({ "https://economictimes.indiatimes.com/industry/a/articleshow/1.cms": { image: PIC("s") }, "https://economictimes.indiatimes.com/prime/b/primearticleshow/2.cms": { paid: true } }));
  ok("the Steel tab shows a steel story once a picture has been found for it (its page, or the headline search)", sd2.items.length === 1 && sd2.items[0].image === PIC("s"), JSON.stringify(sd2.items.map((i) => i.title)));
  const need = needPictures("steel", {}, st, NOW, new Map([["https://economictimes.indiatimes.com/industry/a/articleshow/1.cms", { image: null, paid: false, read: true }], ["https://economictimes.indiatimes.com/prime/b/primearticleshow/2.cms", { image: null, paid: true, read: true }]]));
  ok("needPictures names the steel story whose page was read and gave none, not the paid one, and not one whose page has not been read yet", need.length === 1 && /SAIL Durgapur/.test(need[0].title) && needPictures("steel", {}, st, NOW, new Map()).length === 0, JSON.stringify(need));
}

// --- which pages are looked at next
{
  const rows = Array.from({ length: 8 }, (_, k) => ({ t: `Story number ${k} with enough words to count ${"abcdefgh"[k]}${k}`, h: k + 1, img: PIC(String(k)), id: String(k) }));
  const by = { en: only("en", rss(rows)), hi: only("hi", rss([])), bn: only("bn", rss([])) };
  const first = candidateLinks("en", by, [], NOW, undefined, 5);
  const seen = new Map(first.map((l) => [l, { image: null, paid: false, read: true } as PageFacts]));
  const next = candidateLinks("en", by, [], NOW, seen, 5);
  ok("the stories to look at next are the first five in the tab's order; asked again with those looked at, the next ones, none twice", first.length === 5 && next.length === 3 && first.every((l) => !next.includes(l)) && [...first, ...next].every((l) => /thehindu\.com/.test(l)));
  const google = "<rss><channel><item><title>A Telegraph story from Google News with words enough</title><link>https://news.google.com/rss/articles/CBMi</link></item></channel></rss>";
  ok("the links of papers whose pages are not read (a Google link) are never in the list", candidateLinks("en", { en: only("en", google), hi: only("hi", rss([])), bn: only("bn", rss([])) }, [], NOW, undefined, 30).length === 0);
  const item = (flag: boolean, at: string) => ({ title: "t", link: "https://x/a", publishedAt: at, source: "P", summary: "", ...(flag ? { flag: { kind: "demise" as const, scope: "india" as const } } : {}) });
  ok("a tab is hot while it holds a priority story of the last three hours, not for an old one or none", hasRecentPriority({ lang: "en", items: [item(true, "2026-11-28T06:00:00Z")], used: [], failed: [] }, NOW) && !hasRecentPriority({ lang: "en", items: [item(true, "2026-11-28T01:00:00Z")], used: [], failed: [] }, NOW) && !hasRecentPriority({ lang: "en", items: [item(false, "2026-11-28T07:00:00Z")], used: [], failed: [] }, NOW));
}
later.then(() => { console.log(`newsRules: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0); });
