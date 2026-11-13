// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/lib/live/rss.selftest.ts
import { readFileSync } from "node:fs";
import { DateTime } from "luxon";
import { parseRss, mergeFeeds, safeLink, decodeEntities, titleKey, parseDate, newestFirst, diffStories, sameStory, storyWords, wordCounts, storyKey } from "./rss";
import { buildNews, NEWS_SOURCES, BUSINESS_SOURCES, NEWS_TABS, NEWS_LIMIT, SOURCES_OF, isLang, isTab, isPrintedPage } from "./news";
import { buildSports, classify } from "./sports";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };
const fx = (n: string) => readFileSync(`src/lib/live/fixtures/${n}`, "utf8");
const NOW = DateTime.fromISO("2026-11-12T12:00:00Z");

const hindu = parseRss(fx("rss-thehindu.xml"), "The Hindu");
ok("The Hindu: four stories, CDATA unwrapped, link and source set", hindu.length === 4 && hindu[0].title.startsWith("From press releases to Insta reels") && hindu[0].link.startsWith("https://www.thehindu.com/") && hindu[0].source === "The Hindu", JSON.stringify(hindu[0]));
ok("a +0530 date is read as the right instant (16:56 IST is 11:26 UTC)", hindu[0].publishedAt === "2026-11-12T11:26:27.000Z", hindu[0].publishedAt);
const hi = parseRss(fx("rss-bbc-hindi.xml"), "BBC हिंदी");
ok("Hindi headlines come through whole, with GMT dates", hi.length === 4 && /[ऀ-ॿ]/.test(hi[0].title) && hi[0].publishedAt.startsWith("2026-11-12T10:08"));
const bn = parseRss(fx("rss-sangbad.xml"), "সংবাদ প্রতিদিন");
ok("Bengali headlines: entities such as the curly quotes are decoded", bn.length === 3 && /[ঀ-৿]/.test(bn[0].title) && !/&#\d+;/.test(bn[0].title) && /‘.+’/.test(bn[0].title), bn[0].title);
const g = parseRss(fx("rss-google-news-en.xml"), "Google News", true);
ok("an aggregator's ' - Publisher' is moved from the headline to the source", g.length === 4 && g[0].source === "The Hindu" && !g[0].title.endsWith("The Hindu") && g[0].title.startsWith("Owaisi names"), JSON.stringify(g[0]));
ok("only <item> titles are read, not the channel's", parseRss(fx("rss-cricinfo.xml"), "ESPNcricinfo").length === 6 && !parseRss(fx("rss-cricinfo.xml"), "x").some((i) => /Cricket news from/.test(i.title)));

ok("only http(s) links are kept: javascript:, data: and nonsense are dropped", safeLink("https://a.com/x?y=1") === "https://a.com/x?y=1" && safeLink("javascript:alert(1)") === "" && safeLink("data:text/html,<b>") === "" && safeLink("not a link") === "" && parseRss("<rss><channel><item><title>T</title><link>javascript:alert(1)</link></item></channel></rss>", "S").length === 0);
ok("entities and dates", decodeEntities("A &amp; B &#8216;x&#8217; &#x20B9;5 &hellip;") === "A & B ‘x’ ₹5 …" && parseDate("Thu, 12 Nov 2026 11:19:42 +0530") === "2026-11-12T05:49:42.000Z" && parseDate("garbage") === "" && parseDate("") === "");
ok("an item without a title or a link is left out", parseRss("<rss><item><title>Only a title</title></item><item><link>https://a.com</link></item></rss>", "S").length === 0);

const mk = (src: string, titles: string[], at = "2026-11-12T10:00:00Z") => titles.map((t) => ({ title: t, link: "https://x.com/" + titleKey(t), publishedAt: at, source: src, summary: "" }));
const merged = mergeFeeds([mk("A", ["a1", "a2", "a3"]), mk("B", ["b1", "b2"]), mk("C", ["c1"])], 10, NOW);
ok("the merge is a round robin: the first story of each feed, then the second of each ...", merged.map((i) => i.title).join() === "a1,b1,c1,a2,b2,a3");
ok("the same story from two feeds is shown once, from the first", mergeFeeds([mk("A", ["Big Story Here!", "a2"]), mk("B", ["big story here", "b2"])], 10, NOW).map((i) => i.title).join() === "Big Story Here!,a2,b2");
ok("the limit holds, and stories older than 36 hours are dropped (a story with no date stays)", mergeFeeds([mk("A", ["a1", "a2", "a3", "a4"])], 2, NOW).length === 2 && mergeFeeds([mk("A", ["old"], "2026-11-09T10:00:00Z"), mk("B", ["new"])], 10, NOW).map((i) => i.title).join() === "new" && mergeFeeds([mk("A", ["nodate"], "")], 10, NOW).length === 1);

const news = buildNews("en", [null, fx("rss-thehindu.xml"), null, null, null, null, null], NOW);
ok("news from the feeds that answer, naming the ones that did not", news.used.join() === "The Hindu" && news.failed.length === 6 && news.items.length === 4);
let threw = false; try { buildNews("hi", [null, null, null], NOW); } catch { threw = true; }
ok("when no feed answers, it is an error", threw);
ok("three languages, each with feeds, and a whitelist of the language", Object.keys(NEWS_SOURCES).join() === "en,hi,bn" && NEWS_SOURCES.en.length === 7 && isLang("bn") && !isLang("fr") && !isLang(null));

// the business tab: four papers' own free feeds (saved slices of the real feeds of 13 Nov 2026)
const NOW_B = DateTime.fromISO("2026-11-13T08:00:00Z");
const et = parseRss(fx("rss-et-industry.xml"), "The Economic Times"), mint = parseRss(fx("rss-mint-companies.xml"), "Mint"), bl = parseRss(fx("rss-bl-business.xml"), "The Hindu BusinessLine"), wsj = parseRss(fx("rss-wsj-business.xml"), "The Wall Street Journal");
ok("each business feed gives its ten stories with a link on its own site and a time", [[et, "economictimes.indiatimes.com"], [mint, "www.livemint.com"], [bl, "www.thehindubusinessline.com"], [wsj, "www.wsj.com"]].every(([f, host]) => (f as typeof et).length === 10 && (f as typeof et).every((i) => new URL(i.link).hostname === host && i.publishedAt !== "")), [et, mint, bl, wsj].map((f) => f.length).join());
ok("Mint's and Business Line's CDATA links and dates are read; WSJ's GMT dates are read as GMT", mint[0].publishedAt === "2026-11-13T07:13:01.000Z" && bl[0].publishedAt === "2026-11-13T07:32:19.000Z" && wsj[0].publishedAt === "2026-11-13T03:00:00.000Z" && !/<!\[CDATA/.test(mint[0].link + bl[0].link), [mint[0].publishedAt, bl[0].publishedAt, wsj[0].publishedAt].join());
ok("WSJ's entities (&#x2014; and &#x2019;) are decoded in the headlines", wsj[0].title === "They Were the Indispensable CEOs—Until They Weren’t" && !wsj.some((i) => /&#x?\d+/i.test(i.title)), wsj[0].title);
const biz = buildNews("biz", [fx("rss-et-industry.xml"), fx("rss-mint-companies.xml"), fx("rss-bl-business.xml"), fx("rss-wsj-business.xml")], NOW_B);
ok("the business tab keeps 15 stories, shown by TIME, the latest at the top, like a wire (the time on the card is the order)", biz.lang === "biz" && NEWS_LIMIT === 15 && biz.items.length === 15 && biz.items.every((i, k) => k === 0 || i.publishedAt <= biz.items[k - 1].publishedAt), biz.items.map((i) => i.publishedAt.slice(11, 16)).join());
ok("they are CHOSEN a paper at a time, so every one of the four is among the stories (none fills the screen alone), and no story is shown twice", new Set(biz.items.map((i) => i.source)).size === 4 && BUSINESS_SOURCES.every((s) => biz.items.filter((i) => i.source === s.name).length >= 3) && new Set(biz.items.map((i) => titleKey(i.title))).size === biz.items.length);
const biz2 = buildNews("biz", [null, fx("rss-mint-companies.xml"), null, fx("rss-wsj-business.xml")], NOW_B);
ok("a paper that does not answer is left out and named; the others still show", biz2.used.join() === "Mint,The Wall Street Journal" && biz2.failed.join() === "The Economic Times,The Hindu BusinessLine");
let threwB = false; try { buildNews("biz", [null, null, null, null], NOW_B); } catch { threwB = true; }
ok("when none of the four answers, it is an error", threwB);
ok("the business sources are exactly the four free ones, each on its own https site; Business Standard and Financial Express are not asked (their servers refuse automated requests)", BUSINESS_SOURCES.map((s) => s.name).join() === "The Economic Times,Mint,The Hindu BusinessLine,The Wall Street Journal" && BUSINESS_SOURCES.every((s) => s.url.startsWith("https://")) && !BUSINESS_SOURCES.some((s) => /business-standard|financialexpress/.test(s.url)));
ok("the tabs are Business first, then the three languages; the route accepts biz and the languages, nothing else", NEWS_TABS.join() === "biz,en,hi,bn" && isTab("biz") && isTab("hi") && !isTab("sports") && !isTab(null) && !isLang("biz") && SOURCES_OF("biz") === BUSINESS_SOURCES && SOURCES_OF("en") === NEWS_SOURCES.en);

// the wire order and what a refresh changed
const st = (t: string, at: string) => ({ title: t, link: "https://x.com/" + t, publishedAt: at, source: "S", summary: "" });
ok("newest first; a story without a time goes last in its own order; ties keep their order", newestFirst([st("old", "2026-11-13T01:00:00Z"), st("none1", ""), st("new", "2026-11-13T05:00:00Z"), st("none2", ""), st("tie", "2026-11-13T05:00:00Z")]).map((i) => i.title).join() === "new,tie,old,none1,none2");
const before = [st("a", "2026-11-13T05:00:00Z"), st("b", "2026-11-13T04:00:00Z"), st("c", "2026-11-13T03:00:00Z")];
const after = [st("n1", "2026-11-13T06:00:00Z"), st("a", "2026-11-13T05:00:00Z"), st("b", "2026-11-13T04:00:00Z")];
const d = diffStories(before, after);
ok("a refresh's difference is only arrivals and departures, by link: n1 came, c left", d.added.map((i) => i.title).join() === "n1" && d.removed.map((i) => i.title).join() === "c");
ok("the same stories give no difference, whatever their order; an empty screen takes everything as new", diffStories(before, [...before].reverse()).added.length === 0 && diffStories(before, [...before].reverse()).removed.length === 0 && diffStories([], after).added.length === 3);

// ONE STORY, ONE ROW: the same event from different papers, worded differently (checked on the 474 real headlines of nine feeds on 13 Nov 2026)
const real = JSON.parse(fx("headlines-2026-11-13.json")) as Array<{ source: string; title: string }>;
const counts = wordCounts(real.map((r) => r.title)), total = real.length;
const same = (a: string, b: string) => sameStory(a, b, counts, total);
const T = (re: RegExp, nth = 0) => { const m = real.filter((r) => re.test(r.title)); if (!m[nth]) throw new Error("no headline for " + re); return m[nth].title; };
ok("the reader's own pair: The Hindu's 'Modi in Bengaluru: PM flags off ... Namma Metro Pink Line | LIVE' and Times of India's 'PM Modi inaugurates B'luru Metro Pink Line: Route, timings, cost ...' are one story", same(T(/flags off elevated stretch/), T(/inaugurates B.luru Metro Pink Line/)));
const dupes: Array<[RegExp, RegExp]> = [
  [/Zakir Naik.s Islamic Research Foundation unlawful/, /^Centre extends ban on Zakir Naik's/], [/^Centre extends ban on Zakir Naik's/, /Centre extends ban on Zakir Naik’s Islamic Research Foundation for 5 more/],
  [/Calcutta HC to Abhishek/, /Calcutta HC raps Abhishek/], [/Delhi overtakes Lahore as world's most polluted city as air quality/, /Delhi Overtakes Lahore As World's/],
  [/SpaceX announces over \$74 billion/, /SpaceX Plans More Than \$74 Billion/], [/Trump threatens Mexico with doubled tariffs/, /Trump Threatens To Double Tariffs On Mexico/],
  [/Wendy.s Rejects \$1.4 Billion Buyout/, /Wendy.s Rejects Trian/], [/^Jindal Power gets \$470 million loan/, /Jindal Power gets \$470-million loan/],
  [/Low-pressure area forms over southeast Bay/, /Low-pressure area forms over Bay of Bengal/], [/Who is Colette Kress\? From/, /Who Is Colette Kress\? Meet/],
  [/Kolkata-Sairang train derailment/, /Kolkata-Sairang train derailment/],
];
ok("the same event in different words is one story (Zakir Naik ban from three papers, the Calcutta HC order, Delhi's air, SpaceX, Mexico tariffs, Wendy's, Jindal Power, the low-pressure area, Colette Kress, the derailment)", dupes.every(([a, b], k) => { const x = real.filter((r) => a.test(r.title)), y = real.filter((r) => b.test(r.title)); return x.some((p) => y.some((q) => p !== q && p.source !== q.source ? same(p.title, q.title) : p !== q && same(p.title, q.title))) || (k === dupes.length - 1 && x.length >= 2 && same(x[0].title, x[1].title)); }), dupes.map(([a, b]) => same(real.find((r) => a.test(r.title))?.title ?? "", real.find((r) => b.test(r.title) && r.title !== real.find((q) => a.test(q.title))?.title)?.title ?? "")).join());
ok("the running story is NOT one story: 'Jensen Huang Has Been Ousted' / 'A Timeline of the Scandals' / 'What we know after Jensen Huang resigns' / 'Why Jensen Huang resigned ...' are four different pieces", !same(T(/^Jensen Huang Has Been Ousted as Nvidia CEO/), T(/Timeline of the Scandals/)) && !same(T(/^What we know after Jensen Huang resigns/), T(/^Why Jensen Huang resigned/)) && !same(T(/^What we know after Jensen Huang resigns/), T(/Former Nvidia CEO Jensen Huang agrees to testify/)) && !same(T(/^Jensen Huang Has Been Ousted as Nvidia CEO/), T(/3 Indian-origin CEOs in race/)));
ok("a section's template is not one story: 'Auto & Transport Roundup: Market Talk' and 'Health Care Roundup: Market Talk'; nor is one template with other figures: '$65 Billion' McCormick/Unilever and '$25 Billion' AkzoNobel/Axalta", !same(T(/^Auto & Transport Roundup/), T(/^Health Care Roundup/)) && !same(T(/McCormick.s \$65 Billion Unilever/), T(/AkzoNobel-Axalta \$25 Billion/)));
ok("two different things about one company are two stories (the words they share are only the company)", !same("Tata Motors Q2 profit rises 12% on strong demand", "Tata Motors launches new EV in India") && !same("SAIL Bokaro plant commissions new blast furnace", "SAIL Durgapur plant signs wage agreement") && !same("Reliance Jio launches 5G plan", "Reliance Retail opens 500 stores"));
ok("figures decide: the same words with different figures are two stories; the same figures with the same words are one", !sameStory("RBI cuts repo rate by 25 bps to 5.25%", "RBI cuts repo rate by 50 bps to 5.00%") && sameStory("RBI cuts repo rate by 25 bps to 5.25%", "RBI lowers repo rate by 25 bps to 5.25%: what it means for EMIs"));
ok("telling words: filler, months, years, plurals and apostrophes are left out", storyWords("Today's LIVE updates: What the Budget 2026 means in November").join() === "budget,mean" && storyWords("B'luru Metro’s Pink Lines").join() === "bluru,metro,pink,line");
ok("a hundred identical-template headlines do not make a story: the batch's common words do not count as distinctive", (() => { const c = wordCounts(Array.from({ length: 20 }, (_, k) => `Sensex Nifty close lower as IT stocks drag, story ${k}`)); return !sameStory("Sensex Nifty close lower as IT stocks drag today", "Sensex Nifty close higher as IT stocks lead", c, 20); })());

// the merge on the real batch: each story once, from the paper that had it first, the others named
const NOW_R = DateTime.fromISO("2026-11-13T08:00:00Z");
const bySource = new Map<string, Array<{ title: string; link: string; publishedAt: string; source: string; summary: string }>>();
real.forEach((r, k) => { const l = bySource.get(r.source) ?? []; l.push({ title: r.title, link: `https://x.com/${k}`, publishedAt: new Date(Date.parse("2026-11-13T07:00:00Z") - l.length * 4 * 60000 - [...r.source].length * 1000).toISOString(), source: r.source, summary: "" }); bySource.set(r.source, l); });
const mergedReal = mergeFeeds([...bySource.values()], 1000, NOW_R);
ok("the real batch gives fewer rows than headlines (the duplicates are gone), and no kept row is a same-story of another kept row from a DIFFERENT paper", mergedReal.length < real.length - 20 && (() => { const c = wordCounts(real.map((r) => r.title)); for (let i = 0; i < mergedReal.length; i++) for (let j = i + 1; j < mergedReal.length; j++) if (mergedReal[i].source !== mergedReal[j].source && sameStory(mergedReal[i].title, mergedReal[j].title, c, real.length)) return false; return true; })(), `${mergedReal.length} of ${real.length}`);
const modi = mergedReal.filter((i) => /Pink Line/.test(i.title) && /Modi/.test(i.title));
ok("the Pink Line flag-off, which The Hindu, Times of India and Hindustan Times all carried, is ONE card: it began with Hindustan Times (its identity), shows the LATEST headline (The Hindu's) and names the other two", modi.length === 1 && modi[0].firstSource === "Hindustan Times" && modi[0].source === "The Hindu" && modi[0].also?.length === 2 && modi[0].also.includes("Hindustan Times") && modi[0].also.includes("Times of India") && !!modi[0].id && modi[0].id !== modi[0].link, JSON.stringify(modi));
const zk = mergedReal.filter((i) => /Zakir Naik/.test(i.title));
ok("the Zakir Naik ban, which three papers carried, is one row naming the other two", zk.length === 1 && (zk[0].also?.length ?? 0) === 2, JSON.stringify(zk.map((z) => [z.source, z.also])));
const mkS = (src: string, t: string, at: string) => ({ title: t, link: "https://x.com/" + src, publishedAt: at, source: src, summary: "" });
const zEarly = mkS("Early", "MHA declares Zakir Naik's Islamic Research Foundation unlawful for another five years", "2026-11-13T06:10:00Z"), zLate = mkS("Late", "Centre extends ban on Zakir Naik's Islamic Research Foundation for 5 years", "2026-11-13T07:30:00Z");
const mz = mergeFeeds([[zLate], [zEarly]], 10, NOW_R);
ok("a story has the IDENTITY of its first report and is shown by its LATEST headline: Early began it, Late's headline shows, and the card says where it began", mz.length === 1 && mz[0].id === zEarly.link && mz[0].link === zLate.link && mz[0].source === "Late" && mz[0].firstSource === "Early" && mz[0].firstAt === zEarly.publishedAt && mz[0].also?.join() === "Early");
const mz2 = mergeFeeds([[zLate], [zEarly], [mkS("Later", "Zakir Naik's Islamic Research Foundation banned for five more years: MHA notification", "2026-11-13T07:50:00Z")]], 10, NOW_R);
ok("when a third paper adds to the story the identity (so the card and its place) does not change, only the headline shown does", mz2.length === 1 && storyKey(mz2[0]) === storyKey(mz[0]) && storyKey(mz2[0]) === zEarly.link && mz2[0].source === "Later" && mz2[0].also?.length === 2);
ok("a story told by one paper only has itself as identity and no 'also'", (() => { const m = mergeFeeds([[mkS("Solo", "Totally unrelated headline about a single paper's scoop", "2026-11-13T07:00:00Z")]], 10, NOW_R); return m.length === 1 && m[0].id === m[0].link && !m[0].also && m[0].firstSource === "Solo"; })());
// what a refresh changed, by identity
const dd = diffStories([{ link: "L1", id: "A" }, { link: "L2" }, { link: "L3" }], [{ link: "L1b", id: "A" }, { link: "L2" }, { link: "L4" }]);
ok("a refresh's difference by story identity: A is CHANGED (a later headline, same story), L4 came, L3 left, L2 is untouched", dd.changed.map((i) => i.link).join() === "L1b" && dd.added.map((i) => i.link).join() === "L4" && dd.removed.map((i) => i.link).join() === "L3");
ok("a story a paper repeats itself is shown once but names no 'also' (that paper is the one shown)", (() => { const mk = (n: number, t: string) => ({ title: t, link: "https://x.com/" + n, publishedAt: "2026-11-13T06:10:00Z", source: "Same", summary: "" }); const m = mergeFeeds([[mk(1, "Microsoft outage disrupts Outlook Teams Copilot services India"), mk(2, "Microsoft outage disrupts Outlook Teams Copilot services India US")]], 10, NOW_R); return m.length === 1 && !m[0].also; })());

// Bengali and Hindi: a word keeps its vowel signs (they are combining marks, not letters)
ok("Bengali and Hindi words are whole: 'সৌরভের' and 'পরিবর্তন' are one word each, not letters and fragments; the Devanagari 'प्रधानमंत्री' too", (() => { const b = storyWords("কেন সৌরভের সিএবি-তে ‘পরিবর্তন’ চান বিধায়ক সৌরভ"), h = storyWords("प्रधानमंत्री मोदी ने बेंगलुरु मेट्रो की पिंक लाइन का उद्घाटन किया"); return b.includes("সৌরভের") && b.includes("পরিবর্তন") && b.includes("বিধায়ক") && !b.some((w) => [...w].length < 2) && h.includes("प्रधानमंत्री") && h.includes("बेंगलुरु") && h.includes("उद्घाटन"); })());
ok("the same event worded alike in Bengali is one story; two different things about one person are not", sameStory("প্রধানমন্ত্রী মোদী পিঙ্ক লাইন মেট্রো উদ্বোধন করলেন বেঙ্গালুরু", "বেঙ্গালুরু মেট্রো পিঙ্ক লাইন উদ্বোধন প্রধানমন্ত্রী মোদী") && !sameStory("সৌরভ গঙ্গোপাধ্যায় সিএবি নির্বাচন প্রার্থী", "সৌরভ গঙ্গোপাধ্যায় বিজ্ঞাপন নতুন চুক্তি"));
const ab = parseRss(fx("rss-anandabazar-gn.xml"), "Anandabazar Patrika", true);
ok("Anandabazar through Google News: each headline has its paper split off ('Anandabazar Patrika') and a link on the way to the article", ab.length === 10 && ab.every((i) => i.source === "Anandabazar Patrika" && !/- Anandabazar Patrika$/.test(i.title) && /^https:\/\/news\.google\.com\//.test(i.link)), ab.map((i) => i.source).join());
ok("the printed edition's page listings ('... | রাজ্য - page 3') are told apart and left out; ordinary news and a plain 'page' word are not", ab.filter((i) => isPrintedPage(i.title)).length === 2 && ab.filter((i) => !isPrintedPage(i.title)).length === 8 && isPrintedPage("কলকাতা, Friday, 13 Nov, 2026 | রাজ্য - page 3") && !isPrintedPage("পাতার পর পাতা: নতুন বই") && !isPrintedPage("Homepage redesigned"));
const bnNews = buildNews("bn", [fx("rss-anandabazar-gn.xml"), null, fx("rss-sangbad.xml"), null], NOW_B);
ok("the Bengali tab: Anandabazar is the FIRST source, its printed-page listings never reach the card, and it names itself", NEWS_SOURCES.bn[0].name === "Anandabazar Patrika" && NEWS_SOURCES.bn[0].splitSource === true && bnNews.used.includes("Anandabazar Patrika") && !bnNews.items.some((i) => isPrintedPage(i.title)) && bnNews.items.some((i) => i.source === "Anandabazar Patrika"), bnNews.items.map((i) => i.source + ":" + i.title.slice(0, 20)).join(" | "));

// Hindi: the five papers of the owner's list, in his order of priority, each from its own online edition's free feed
const hiNames = ["दैनिक भास्कर", "दैनिक जागरण", "अमर उजाला", "हिन्दुस्तान", "नवभारत टाइम्स"];
ok("the Hindi tab is exactly the owner's five papers in his order: Dainik Bhaskar, Dainik Jagran, Amar Ujala, Hindustan, Navbharat Times; every address is https, none is BBC or an aggregator", NEWS_SOURCES.hi.map((s) => s.name).join() === hiNames.join() && NEWS_SOURCES.hi.every((s) => s.url.startsWith("https://") && !s.splitSource) && /bhaskar\.com/.test(NEWS_SOURCES.hi[0].url) && /jagran\.com/.test(NEWS_SOURCES.hi[1].url) && /amarujala\.com/.test(NEWS_SOURCES.hi[2].url) && /livehindustan\.com/.test(NEWS_SOURCES.hi[3].url) && /navbharattimes\.indiatimes\.com/.test(NEWS_SOURCES.hi[4].url));
const hiFeeds = ["rss-bhaskar.xml", "rss-jagran.xml", "rss-amarujala.xml", "rss-hindustan.xml", "rss-navbharattimes.xml"].map((f, k) => parseRss(fx(f), hiNames[k]));
ok("each of the five Hindi feeds is read: ten (Amar Ujala eleven) dated Devanagari headlines with an https link on its own site", hiFeeds.every((f, k) => f.length >= 10 && f.every((i) => /[ऀ-ॿ]/.test(i.title) && i.publishedAt !== "" && i.link.startsWith("https://") && i.source === hiNames[k])), hiFeeds.map((f) => f.length).join());
const NOW_H = DateTime.fromISO("2026-11-13T10:00:00Z");
const hiNews = buildNews("hi", ["rss-bhaskar.xml", "rss-jagran.xml", "rss-amarujala.xml", "rss-hindustan.xml", "rss-navbharattimes.xml"].map(fx), NOW_H);
ok("the Hindi tab: all five papers are used, in the owner's order, and none failed", hiNews.used.join() === hiNames.join() && hiNews.failed.length === 0 && hiNews.lang === "hi");
ok("the Hindi tab shows 15 stories and every paper has some of them", hiNews.items.length === 15 && hiNames.every((n) => hiNews.items.some((i) => i.source === n || i.also?.includes(n))), hiNews.items.map((i) => i.source).join());
const rahul = hiNews.items.filter((i) => /फोन टैप/.test(i.title));
ok("the one story that several Hindi papers carried (Rahul Gandhi's phone-tapping claim) is ONE card, not one per paper", rahul.length <= 1, String(rahul.length));
ok("the papers a card names are in the owner's order of priority, whatever the order they came in", (() => { const mk = (src: string, t: string, at: string) => ({ title: t, link: "https://x.com/" + src, publishedAt: at, source: src, summary: "" }); const t = "राहुल गांधी का फोन टैपिंग का आरोप सबूत मोदी सरकार बहस"; const m = mergeFeeds([[mk("पहला", t + " एक", "2026-11-13T09:50:00Z")], [mk("दूसरा", t + " दो", "2026-11-13T09:10:00Z")], [mk("तीसरा", t + " तीन", "2026-11-13T09:30:00Z")]], 5, NOW_H); return m.length === 1 && m[0].firstSource === "दूसरा" && m[0].source === "पहला" && m[0].also?.join() === "दूसरा,तीसरा"; })());

// English: the owner's priority. The Telegraph, The Hindu and The Times of India are the top level (the same), Hindustan Times and The Indian Express the second, the rest after them.
const enNames = ["The Telegraph", "The Hindu", "Times of India", "Hindustan Times", "The Indian Express", "NDTV", "BBC News India"];
ok("the English tab is in the owner's order: The Telegraph, The Hindu, Times of India, Hindustan Times, The Indian Express, then NDTV and BBC News India", NEWS_SOURCES.en.map((s) => s.name).join() === enNames.join() && NEWS_SOURCES.en.every((s) => s.url.startsWith("https://")));
ok("their PRIORITY is a weight: the top three are equal at 3 (the same level), Hindustan Times and The Indian Express equal at 2, the others 1", NEWS_SOURCES.en.map((s) => s.weight ?? 1).join() === "3,3,3,2,2,1,1");
ok("The Telegraph is read through Google News' public feed of telegraphindia.com (its own site refuses automated requests), its stories named 'The Telegraph' whatever Google calls it", NEWS_SOURCES.en[0].splitSource === true && NEWS_SOURCES.en[0].keepName === true && /news\.google\.com\/rss\/search\?q=site:telegraphindia\.com/.test(NEWS_SOURCES.en[0].url) && !/telegraphindia\.com\/(rss|feed)/.test(NEWS_SOURCES.en[0].url));
const tg = parseRss(fx("rss-telegraph-gn.xml"), "The Telegraph", true);
ok("Telegraph through Google: twelve headlines with ' - Telegraph India' taken off, each with a time and a link on the way to the article", tg.length === 12 && tg.every((i) => !/ - Telegraph India$/.test(i.title) && i.publishedAt !== "" && /^https:\/\/news\.google\.com\//.test(i.link)), tg.map((i) => i.title.slice(-14)).join("|"));
const ie = parseRss(fx("rss-indianexpress.xml"), "The Indian Express");
ok("The Indian Express's own free feed is read: ten dated headlines with an https link on indianexpress.com", ie.length === 10 && ie.every((i) => i.publishedAt !== "" && new URL(i.link).hostname === "indianexpress.com"));
const enAll = ["rss-telegraph-gn.xml", "rss-thehindu.xml", "rss-thehindu.xml", "rss-thehindu.xml", "rss-indianexpress.xml", null, null].map((f) => (f ? fx(f) : null));
const enNews = buildNews("en", enAll, DateTime.fromISO("2026-11-13T09:30:00Z"));
ok("every Telegraph story on the card is named 'The Telegraph' (not 'Telegraph India')", enNews.items.filter((i) => /telegraph/i.test(i.source)).every((i) => i.source === "The Telegraph") && enNews.used.includes("The Telegraph"));
// the weights, on feeds long enough to show the shares
const lots = (src: string, n: number) => Array.from({ length: n }, (_, k) => ({ title: `${src} unique story number ${k} about topic${src}${k} alpha${k}${src}`, link: `https://x.com/${src}/${k}`, publishedAt: "2026-11-13T07:00:00Z", source: src, summary: "" }));
const tiered = mergeFeeds([lots("A", 20), lots("B", 20), lots("C", 20), lots("D", 20), lots("E", 20), lots("F", 20), lots("G", 20)], 15, DateTime.fromISO("2026-11-13T09:30:00Z"), 36, [3, 3, 3, 2, 2, 1, 1]);
const share = (s: string) => tiered.filter((i) => i.source === s).length;
ok("with the weights the first fifteen stories are 3 from each top paper, 2 from each second-rank paper, 1 from each of the rest: 3,3,3,2,2,1,1", ["A", "B", "C", "D", "E", "F", "G"].map(share).join() === "3,3,3,2,2,1,1", ["A", "B", "C", "D", "E", "F", "G"].map(share).join());
ok("equal weights are equal shares: the three top papers never get different numbers of stories", share("A") === share("B") && share("B") === share("C") && share("D") === share("E"));
ok("a story BELONGS to the paper of highest priority that carried it: first reported by a low-priority paper, carried later by a top one, it counts as the top paper's (named as 'first reported by' the other)", (() => {
  const mk = (src: string, k: string, t: string, at: string) => ({ title: t, link: `https://x.com/${src}/${k}`, publishedAt: at, source: src, summary: "" });
  const story = "रेल मंत्रालय ने नई वंदे भारत ट्रेन चलाने की घोषणा की सबसे लंबे रूट पर";
  const top = [mk("Top", "s", story + " शुरू", "2026-11-13T08:30:00Z"), mk("Top", "2", "Top unique second alpha beta gamma delta", "2026-11-13T08:00:00Z"), mk("Top", "3", "Top unique third epsilon zeta eta theta", "2026-11-13T07:50:00Z")];
  const low = [mk("Low", "s", story + " आज", "2026-11-13T07:00:00Z"), mk("Low", "2", "Low unique second iota kappa lambda mu", "2026-11-13T07:10:00Z"), mk("Low", "3", "Low unique third nu xi omicron pi", "2026-11-13T07:20:00Z")];
  const m = mergeFeeds([top, low], 4, DateTime.fromISO("2026-11-13T09:30:00Z"), 36, [3, 1]);
  const st = m.find((i) => i.id === "https://x.com/Low/s");
  return m.length === 4 && !!st && st.source === "Top" && st.firstSource === "Low" && m.filter((i) => i.source === "Top").length === 3 && m.filter((i) => i.source === "Low").length === 1;
})());
ok("without weights the merge is the plain round robin as before (one from each in turn)", mergeFeeds([lots("A", 3), lots("B", 3)], 6, DateTime.fromISO("2026-11-13T09:30:00Z")).map((i) => i.source).join("") === "ABABAB");
ok("a paper whose list is short does not stop the others: the rest fill the places", mergeFeeds([lots("A", 1), lots("B", 20)], 6, DateTime.fromISO("2026-11-13T09:30:00Z"), 36, [3, 3]).length === 6);

ok("sports: India is told from its words", classify({ title: "Rishabh Pant on his way to join India's Test squad in New Zealand", summary: "" }).includes("india") && classify({ title: "IPL auction: new records", summary: "" }).includes("india") && classify({ title: "Anderson signs for Surrey", summary: "" }).join() === "other");
ok("sports: a world event with or without India, and a story may be both", classify({ title: "Asian Games: hosts lead the table", summary: "" }).join() === "world" && classify({ title: "India beat Pakistan in the World Cup", summary: "" }).join() === "india,world" && classify({ title: "Wimbledon final set", summary: "" }).includes("world") && !/\bindia\b/i.test("Pakistan make U-19 Asia Cup final") && classify({ title: "Pakistan make U-19 Asia Cup final", summary: "" }).join() === "world");
const sp = buildSports([fx("rss-cricinfo.xml"), null, null], NOW);
ok("the sports list is classified, and names the feeds that did not answer", sp.items.length === 6 && sp.used.join() === "ESPNcricinfo" && sp.failed.length === 2 && sp.items.some((i) => i.groups.includes("india")) && sp.items.every((i) => i.groups.length >= 1));

const spXml = (rows: Array<[string, string]>) => `<rss><channel>${rows.map(([t, d]) => `<item><title>${t}</title><link>https://x.com/${encodeURIComponent(t)}</link><pubDate>${d}</pubDate></item>`).join("")}</channel></rss>`;
const spMixed = buildSports([
  spXml([["India beat Australia in the first Test", "Fri, 13 Nov 2026 06:00:00 GMT"], ["Olympics: a record in the pool", "Fri, 13 Nov 2026 04:00:00 GMT"]]),
  spXml([["Kohli scores a hundred for India", "Fri, 13 Nov 2026 09:30:00 GMT"], ["Ranji Trophy: Bengal win the toss", "Fri, 13 Nov 2026 07:10:00 GMT"]]),
  spXml([["World Cup: a late goal decides the tie", "Fri, 13 Nov 2026 08:20:00 GMT"], ["Grand Slam draw announced", "Fri, 13 Nov 2026 05:05:00 GMT"]]),
], DateTime.fromISO("2026-11-13T10:00:00Z"));
const spTimes = spMixed.items.map((i) => i.publishedAt);
const spOnly = (g: "india" | "world") => spMixed.items.filter((i) => i.groups.includes(g)).map((i) => i.publishedAt);
const desc = (a: string[]) => a.every((t, k) => k === 0 || t <= a[k - 1]);
ok("the sports list is in TIME order, the latest at the top, though the papers are chosen by turns (Kohli 09:30 first, the 04:00 story last)", spMixed.items.length === 6 && desc(spTimes) && spMixed.items[0].title.startsWith("Kohli") && spMixed.items[5].title.startsWith("Olympics"), spTimes.join());
ok("each sports tab (India, World events) is a filter of that one list, so it is in time order too", spOnly("india").length >= 2 && desc(spOnly("india")) && desc(spOnly("world")), spOnly("india").join() + " | " + spOnly("world").join());

console.log(`rss selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
