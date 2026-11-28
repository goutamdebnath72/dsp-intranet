// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/lib/live/steel.selftest.ts
// The Steel tab, tested on saved slices of the REAL searches of 27 Nov 2026 (Google News and Bing News, in English and Hindi) and on headlines that are not steel news.
import { readFileSync } from "node:fs";
import { DateTime } from "luxon";
import { parseRss, storyKey, type FeedItem } from "./rss";
import { buildNews, BUSINESS_SOURCES, SOURCES_OF } from "./news";
import { bingTarget, clusterTopics, orgsOf, specificNumbers, isSteelStory, parseBing, selectSteel, steelItemsOf, steelPapers, STEEL_HOURS, STEEL_LIMIT, STEEL_SEARCHES } from "./steel";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };
const fx = (n: string) => readFileSync(`src/lib/live/fixtures/${n}`, "utf8");
const NOW = DateTime.fromISO("2026-11-27T15:00:00Z");
const search = (kind: "google" | "bing", at: number) => STEEL_SEARCHES.filter((s) => s.format === kind)[at];

// ---- which headline is steel news
const yes = [
  "SAIL pays Rs 53.88 crore for HR facelift, price 288% higher than estimated cost",
  "SAIL Rourkela Steel Plant launches safety initiative for contractual workers",
  "Two Labourers Killed in Accident at SAIL's IISCO Steel Plant",
  "Tata Steel sells Steel Tubes and Colour Coated business",
  "India's Finished Steel Consumption Rises 7.5% to 99.4 MT in April-October",
  "Baldota steel plant row: Karnataka CM seeks feasibility report on lake",
  "5 workers critically burnt as hot furnace dust falls on them at Chhattisgarh steel plant",
  "Jindal Steel eyes ₹15,000 crore investment by 2035, targets coated steel",
  "भिलाई इस्पात संयंत्र हादसा: इलाज के दौरान दो घायलों की मौत",
  "सेल ने 39 माह के एरियर से इनकार किया यूनियनों ने आंदोलन पर जाने चेतावनी दी",
  "बोकारो स्टील प्लांट की जमीन पर अवैध कब्जा, 45 से अधिक प्लाटों की सूची जारी",
  "बीएसपी के ब्लास्ट फर्नेस- 6 ने हॉट मेटल उत्पादन का कीर्तिमान बनाया",
  "अक्टूबर में भारत का इस्पात उत्पादन 5.2 प्रतिशत बढ़ा",
  // share-price news is kept: many professionals follow it
  "4,233 Call Contracts at Rs 160 Strike on Tata Steel Ltd Signal Near-Term Directional Interest",
  "JSWSTEEL Share Price Today - JSW Steel on NSE/BSE",
  "SAIL vs Jindal Steel: Steel Stocks Compared 2027",
  "Tata Steel का शेयर जाएगा ₹200 के पार, ब्रोकरेज फर्म ने दी BUY की रेटिंग",
  "Stocks to watch, Nov 26: LG Electronics, Tata Steel, APL Apollo Tubes, Fino Payments, PNB, Lupin",
];
const no = [
  "Vard Sets Sail Orient Trailblazer for Norway",
  "Nominations open for 2026 YJA Sailor and Young Sailor of the Year",
  "Fourth-generation heir Jang Sun-ik promoted to president of Dongkuk Steel Mill",
  "Hoa Phat to expand solar power capacity at Hung Yen coated steel plant to 7.5 MWp",
  "Kyoei Steel says a cyberattack hit its Vinton Steel mill in Texas",
  "Gig Review: Ricky Warwick & the Fighting Hearts – KK's Steel Mill, Wolverhampton",
  "Kolkata to host eighth Tata Steel Chess India from January 7-10",
  "Lasoi and defending champion Azimeraw lead elite fields at Tata Steel World 25K Kolkata",
  "टाटा स्टील चेस इंडिया की फिर होगी वापसी, जानें आठवें संस्करण की तारीख",
  "दिवाली सेल में भारी छूट, कपड़ों पर 50 प्रतिशत तक ऑफर",
  "बीएसपी ने पार्टी की बैठक में रणनीति तय की",
  "Karnataka Govt transfers senior IAS officers",
  "Nifty Metal soars 2% as Hindustan Zinc, Vedanta, NALCO shares lead gains",
];
ok("steel news: SAIL (in capitals), its units, other steel plants and companies, the industry, and the news of their shares, in English and in Hindi", yes.every(isSteelStory), yes.filter((t) => !isSteelStory(t)).join(" | "));
ok("not steel news: a ship's 'sets sail', a sailor, a foreign mill with no word of India, sponsored sports, a sale, a political party, other metals", no.every((t) => !isSteelStory(t)), no.filter(isSteelStory).join(" | "));

// ---- reading the two engines
const bing = parseBing(fx("rss-steel-bing-en-2026-11-27.xml"));
ok("Bing News: twelve stories, each linked STRAIGHT to the paper (no redirect of Bing's), the paper named from its own tag", bing.length === 12 && bing.every((b) => !/bing\.com/.test(b.link) && /^https:\/\//.test(b.link)) && bing[0].link.startsWith("https://psuwatch.com/") && bing[0].source === "PSU Watch", bing.slice(0, 2).map((b) => `${b.source} ${b.link}`).join(" | "));
ok("a Bing redirect gives back the paper's address; anything that is not http(s) is dropped", bingTarget("http://www.bing.com/news/apiclick.aspx?ref=FexRss&aid=&tid=1&url=https%3a%2f%2fpsuwatch.com%2fa%2fb&c=2&mkt=en-in") === "https://psuwatch.com/a/b" && bingTarget("http://www.bing.com/news/apiclick.aspx?url=javascript%3aalert(1)") === "" && bingTarget("nonsense") === "");
const bingHi = parseBing(fx("rss-steel-bing-hi-2026-11-27.xml"));
ok("Bing in Hindi: Hindi headlines come whole; a headline Bing cuts with '…' is kept as it is", bingHi.length === 11 && bingHi.some((b) => /[ऀ-ॿ]/.test(b.title)) && bingHi.some((b) => b.title.endsWith("...")));
const g = steelItemsOf(search("google", 0), fx("rss-steel-google-en-2026-11-27.xml"));
ok("Google News: only the steel headlines of the answer are kept, the paper moved out of the headline", g.length > 8 && g.length < 32 && g.every(isSteelStoryItem) && g.some((i) => i.source === "The New Indian Express" && i.title.startsWith("SAIL pays Rs 53.88 crore")), String(g.length));
function isSteelStoryItem(i: FeedItem) { return isSteelStory(i.title); }
ok("a search that did not answer gives nothing, and a paper Google names by its address is shown by its host", steelItemsOf(search("google", 0), null).length === 0 && steelItemsOf(search("google", 0), `<rss><channel><item><title>New role at Tata Steel for Indian head - https://hrtoday.in/</title><link>https://news.google.com/rss/articles/x</link><pubDate>Fri, 27 Nov 2026 10:00:00 GMT</pubDate></item></channel></rss>`)[0]?.source === "hrtoday.in");
const world = steelItemsOf(search("google", 2), fx("rss-steel-google-world-2026-11-27.xml"));
ok("a search of 'steel plant' brings the world's mills; only the ones about India stay", parseRss(fx("rss-steel-google-world-2026-11-27.xml"), "G", true).length === 20 && world.length < 8 && !world.some((i) => /Dongkuk|Hoa Phat|Kyoei|Stegra|DEACERO|HABA|Voestalpine|Galati|SSAB|Arrium/i.test(i.title)) && world.some((i) => /Chhattisgarh/.test(i.title)), world.map((i) => i.title).join(" | "));

// ---- the steel list
const pool = [
  ...steelItemsOf(search("google", 0), fx("rss-steel-google-en-2026-11-27.xml")),
  ...steelItemsOf(search("google", 5), fx("rss-steel-google-hi-2026-11-27.xml")),
  ...steelItemsOf(search("google", 6), fx("rss-steel-google-hi2-2026-11-27.xml")),
  ...steelItemsOf(search("bing", 0), fx("rss-steel-bing-en-2026-11-27.xml")),
  ...steelItemsOf(search("bing", 3), fx("rss-steel-bing-hi-2026-11-27.xml")),
];
const block = selectSteel(pool, NOW);
const t = (i: FeedItem) => DateTime.fromISO(i.publishedAt).toMillis();
ok("the steel list has stories, none more than 48 hours old, none undated", block.length > 15 && block.every((i) => !!i.publishedAt && NOW.diff(DateTime.fromISO(i.publishedAt), "hours").hours <= STEEL_HOURS), String(block.length));
ok("the NEWEST is at the top and they sink with age: the times on the cards only ever go down the list", block.every((i, k) => k === 0 || t(i) <= t(block[k - 1])));
const nie = block.find((i) => i.title.startsWith("SAIL pays Rs 53.88 crore"));
ok("the story that began this feature (SAIL pays Rs 53.88 crore for an HR facelift) is in the list, linked and dated", !!nie && nie.source === "The New Indian Express" && /^https?:\/\//.test(nie.link) && nie.publishedAt.startsWith("2026-11-27"), String(nie?.publishedAt));
ok("SAIL's own units' stories from Hindi papers (Bhilai) and English ones (Rourkela, through Google and Bing) are in it; the old ones Bing also returns (2014, 2018, May 2026) are not", block.some((i) => /भिलाई/.test(i.title) && /सेल/.test(i.title)) && block.some((i) => /Rourkela/.test(i.title)) && !block.some((i) => /gas leak tragedy|11 हुई|रिकॉर्ड मुनाफा/.test(i.title)));
ok("no story twice: one row per link, and the same story from Google and Bing is one row", new Set(block.map((i) => i.link)).size === block.length && new Set(block.map(storyKey)).size === block.length);
ok("a story with no time is left out; one older than 48 hours is left out; one an hour old stays", selectSteel([{ title: "SAIL Bhilai Steel Plant record output", link: "https://a.example/1", publishedAt: "", source: "A", summary: "" }, { title: "SAIL Bokaro Steel Plant old news", link: "https://a.example/2", publishedAt: "2026-11-25T10:00:00Z", source: "A", summary: "" }, { title: "SAIL Rourkela Steel Plant new unit", link: "https://a.example/3", publishedAt: "2026-11-27T13:00:00Z", source: "A", summary: "" }], NOW).map((i) => i.link).join() === "https://a.example/3");
ok("the ceiling holds", selectSteel(pool, NOW, 5).length === 5 && STEEL_LIMIT === 60);
ok("the papers that carried the list are named once each", steelPapers(block).length > 10 && new Set(steelPapers(block)).size === steelPapers(block).length);

// ---- one news, one row: the same news in other words and other languages (the headlines are real, of 27 Nov 2026)
const ts = (h: number) => NOW.minus({ hours: h }).toISO()!;
const row = (title: string, source: string, h: number, n: number): FeedItem => ({ title, link: `https://${source.replace(/\W+/g, "")}.example/${n}`, publishedAt: ts(h), source, summary: "" });
const DEAL: FeedItem[] = [
  row("Sebi reviews Tata Steel-APL Apollo deal with focus on minority interests: Pandey", "FlipItMoney", 1, 1),
  row("Tata Steel–APL Apollo Deal: SEBI Extends Public Statement Deadline To Dec. 8 For Open Offer", "NDTV Profit", 2, 2),
  row("टाटा स्टील-एपीएल अपोलो डील: 28 हजार करोड़ के सौदे की जांच कर रहा सेबी, जानें क्या है पूरा मामला", "Udit Vani", 3, 3),
  row("Tata Steel APL Apollo Deal: टाटा स्टील के 26% हिस्सेदारी खरीदने वाले ऑफर को सेबी की मिली मंजूरी", "CNBC TV18", 4, 4),
  row("APL's feisty shareholders hold key to Tata Steel deal | Hindustan Times Noida - newspaper", "Magzter", 5, 5),
  row("टाटा स्टील और अपोलो की प्रस्तावित डील पर सेबी की नजर", "mahamedianews", 6, 6),
  row("Tata Steel Reworks Rs. 28,000 Crore APL Apollo Deal After Investor Backlash", "ChemAnalyst", 30, 7),
  row("APL अपोलो को अपने 2 कारोबार बेचेगी टाटा स्टील, 28000 करोड़ रुपये में हुआ सौदा", "Business Standard", 22, 8),
];
const OTHER: FeedItem[] = [
  row("SAIL Rourkela Steel Plant launches safety initiative for contractual workers", "PSU Watch", 10, 20),
  row("5 workers critically burnt as hot furnace dust falls on them at Chhattisgarh steel plant", "The Times of India", 25, 21),
  row("Jindal Steel launches branded portfolio of coated products for construction sector", "megaproject.co", 20, 22),
  row("NMDC battles weak offtake despite strong steel demand", "Livemint", 31, 23),
  row("SAIL pays Rs 53.88 crore for HR facelift, price 288% higher than estimated cost", "The New Indian Express", 12, 24),
  row("Tata Steel sells Steel Tubes and Colour Coated business", "MediaBrief", 6, 25),
];
const STATS: FeedItem[] = [
  row("India's Finished Steel Consumption Rises 7.5% to 99.4 Million Tonnes in April-October FY27", "KNN India", 12, 30),
  row("भारत की तैयार इस्पात खपत में 7.5% की वृद्धि, आयात में लगभग 29% की उछाल", "Lokmat News Hindi", 25, 31),
  row("India Steel Demand Grows 7.5 pc to 99.4 MT in April-October 2026; Imports Rise 28.9 pc", "Content Media Solutions", 27, 32),
  row("India’s steel production clocks 5.2 per cent growth to 13.8 million tonnes in October", "ET Now", 27, 33),
  row("अक्टूबर में भारत का तैयार स्टील उत्पादन 5.2 प्रतिशत बढ़कर 13.8 मिलियन टन पहुंचा, मांग में भी जोरदार बढ़ोतरी", "देशबन्धु", 27, 34),
];
const clustered = clusterTopics([...DEAL, ...OTHER, ...STATS]);
const dealRow = clustered.find((i) => /Sebi reviews Tata Steel-APL Apollo/.test(i.title));
ok("EIGHT headlines of one deal (Tata Steel and APL Apollo), in English and Hindi, in many wordings, from eight papers, are ONE row: the latest headline, where it began, the other seven papers named", !!dealRow && (dealRow.also?.length ?? 0) === 7 && dealRow.firstSource === "ChemAnalyst" && dealRow.id === DEAL[6].link && dealRow.publishedAt === DEAL[0].publishedAt && clustered.filter((i) => /Tata Steel|APL|अपोलो|टाटा स्टील/.test(i.title) && /deal|Deal|डील|सौदे|Apollo/.test(i.title)).length === 1, clustered.map((i) => i.title.slice(0, 40)).join(" | "));
ok("five headlines of two statistics (7.5% of consumption; 5.2% of output) become TWO rows, each across the two languages, by the figures they share", (() => { const c = clusterTopics(STATS); return c.length === 2 && c.every((x) => (x.also?.length ?? 0) >= 1); })());
ok("different news is never joined: two SAIL/steel-plant safety stories, Jindal and NMDC, SAIL's HR bill and Tata Steel's sale stand as rows of their own", OTHER.every((o) => clustered.some((c) => c.link === o.link && (c.also?.length ?? 0) === 0)));
ok("the companies of a headline, in three scripts, are one name each; Sebi and APL Apollo too; a plant is not a company", orgsOf("टाटा स्टील-एपीएल अपोलो डील पर सेबी की नजर").join() === "TATA_STEEL,APL_APOLLO,SEBI" && orgsOf("Sebi reviews Tata Steel-APL Apollo deal").join() === "TATA_STEEL,APL_APOLLO,SEBI" && orgsOf("টাটা স্টিল ও সেবি").join() === "TATA_STEEL,SEBI" && orgsOf("SAIL Bhilai Steel Plant record").join() === "SAIL" && orgsOf("भिलाई इस्पात संयंत्र हादसा").length === 0);
ok("figures that mean the same in any language: 7.5, 99.4, 28,000 and 28000; a year and a small whole number are not figures to match on", specificNumbers("Rs 28,000 crore deal").join() === "28000" && specificNumbers("28000 करोड़ रुपये").join() === "28000" && specificNumbers("7.5% to 99.4 MT in 2026 on Dec. 8, 3 papers").join() === "7.5,99.4" && specificNumbers("৭.৫ শতাংশ").join() === "7.5");
ok("one story whose reports are several keeps the identity of the first and the time of the latest, and names the papers once each", dealRow !== undefined && new Set(dealRow.also).size === dealRow.also?.length && !dealRow.also?.includes(dealRow.source));

// ---- the Steel tab, and the Business tab as it was
const NOW_B = DateTime.fromISO("2026-11-13T08:00:00Z");
const nS = STEEL_SEARCHES.length;
const feedTexts = [fx("rss-et-industry.xml"), fx("rss-mint-companies.xml"), fx("rss-bl-business.xml"), fx("rss-wsj-business.xml")];
// The Steel tab's sources are the searches first, then the four business papers.
const steelTab = (extra: Array<string | null>, papers: Array<string | null> = feedTexts): Array<string | null> => [...STEEL_SEARCHES.map((_, j) => extra[j] ?? null), ...papers];
// The papers' fixtures are of 13 Nov, so the steel answers for this part are made at that date too: Google News items and one Bing item, in the real formats.
const g13 = (rows: Array<[string, string, string]>) => `<rss><channel><title>x</title>${rows.map(([title, paper, at]) => `<item><title>${title} - ${paper}</title><link>https://news.google.com/rss/articles/${encodeURIComponent(title).slice(0, 20)}</link><pubDate>${at}</pubDate></item>`).join("")}</channel></rss>`;
const googleAnswer = g13([["SAIL Bhilai Steel Plant sets a new record of hot metal", "Dainik Test", "Fri, 13 Nov 2026 06:00:00 GMT"], ["Rolling mill of Bokaro Steel Plant restarts after repair", "Paper Two", "Thu, 12 Nov 2026 20:00:00 GMT"], ["SAIL Durgapur Steel Plant old story", "Paper Three", "Mon, 09 Nov 2026 20:00:00 GMT"], ["RBI keeps repo rate unchanged", "Paper Four", "Fri, 13 Nov 2026 06:30:00 GMT"], ["Tata Steel share price jumps 3% on Sebi nod, brokerages raise target to Rs 200", "Paper Six", "Fri, 13 Nov 2026 05:00:00 GMT"]]);
const bingAnswer = `<rss><channel><title>x</title><item><title>Tata Steel Kalinganagar plant expansion cleared</title><link>http://www.bing.com/news/apiclick.aspx?ref=FexRss&amp;aid=&amp;url=https%3a%2f%2fpaper-five.example%2fa&amp;c=1</link><pubDate>Fri, 13 Nov 2026 07:30:00 GMT</pubDate><News:Source>Paper Five</News:Source></item></channel></rss>`;
const steelTexts: Array<string | null> = STEEL_SEARCHES.map((_s, j) => (j === 0 ? googleAnswer : j === 8 ? bingAnswer : null));
const tab = buildNews("steel", steelTab(steelTexts, [null, null, null, null]), NOW_B);
ok("the Steel tab: the steel stories newest first (Tata Steel Kalinganagar 07:30, SAIL Bhilai 06:00, the Tata Steel share-price story 05:00, Bokaro 12 Nov 20:00); the 4-day-old Durgapur story and the RBI one are not in it", tab.lang === "steel" && tab.items.map((i) => i.source).join() === "Paper Five,Dainik Test,Paper Six,Paper Two" && tab.items[0].link === "https://paper-five.example/a" && !tab.items.some((i) => /Durgapur|RBI/.test(i.title)), tab.items.map((i) => i.source).join());
ok("share-price news of a steel company is KEPT on the Steel tab", tab.items.some((i) => /Tata Steel share price jumps 3%/.test(i.title)));
ok("the sources of the Steel tab are the searches, then the four business papers; the Business tab's are the four papers only", SOURCES_OF("steel").length === nS + BUSINESS_SOURCES.length && SOURCES_OF("steel").slice(0, nS).every((s, k) => s === STEEL_SEARCHES[k]) && SOURCES_OF("steel").slice(nS).every((s, k) => s === BUSINESS_SOURCES[k]) && SOURCES_OF("biz").slice(0, BUSINESS_SOURCES.length).every((x, k) => x === BUSINESS_SOURCES[k]) && STEEL_SEARCHES.every((s) => s.ttlMs === 5 * 60_000));
ok("both engines answered: they are named as used, none as failing, and the papers that carried the stories are listed", tab.failed.join() === "The Economic Times,Mint,The Hindu BusinessLine,The Wall Street Journal" && tab.used.join() === "Google News,Bing News" && tab.steelPapers?.join() === "Paper Five,Dainik Test,Paper Six,Paper Two", `${tab.used.join()} | ${tab.failed.join()}`);
const noBing = buildNews("steel", steelTab(steelTexts.map((x, j) => (STEEL_SEARCHES[j].format === "bing" ? null : x)), feedTexts), NOW_B);
ok("an engine none of whose searches answered is named as not answering, and the other still gives stories", noBing.failed.join() === "Bing News" && noBing.used.includes("Google News") && noBing.items.some((i) => i.source === "Dainik Test"));
let threw = false; try { buildNews("steel", steelTab([], [null, null, null, null]), NOW_B); } catch { threw = true; }
ok("when nothing answers at all, it is an error; when feeds answer but no steel story is in them, the list is empty, not an error", threw && buildNews("steel", steelTab(steelTexts.map(() => null), [fx("rss-wsj-business.xml"), null, null, null]), NOW_B).items.every((i) => isSteelStory(i.title)));
const steelInPaper = `<rss><channel><item><title>SAIL Bhilai Steel Plant sets a new record of hot metal</title><link>https://economictimes.indiatimes.com/a</link><pubDate>Fri, 13 Nov 2026 07:00:00 GMT</pubDate></item><item><title>RBI keeps repo rate unchanged</title><link>https://economictimes.indiatimes.com/b</link><pubDate>Fri, 13 Nov 2026 06:00:00 GMT</pubDate></item></channel></rss>`;
const pulled = buildNews("steel", steelTab([], [steelInPaper, null, null, null]), NOW_B);
ok("a steel story in a business paper's own feed is on the Steel tab, and only that one", pulled.items.length === 1 && pulled.items[0].title.startsWith("SAIL Bhilai") && pulled.used.join() === "The Economic Times");
// The Business tab is as it was before the steel work: the four papers, nothing taken out of it
const biz = buildNews("biz", [steelInPaper, fx("rss-mint-companies.xml"), null, null], NOW_B);
ok("the Business tab keeps EVERY story of the papers, a steel story and share-price news included (nothing is moved to the Steel tab)", biz.lang === "biz" && biz.items.some((i) => /SAIL Bhilai/.test(i.title)) && biz.items.some((i) => /RBI keeps repo rate/.test(i.title)) && biz.steelPapers === undefined);
const shareNews = `<rss><channel><item><title>Tata Steel shares fall 3% as brokerages cut target price</title><link>https://economictimes.indiatimes.com/s</link><pubDate>Fri, 13 Nov 2026 07:10:00 GMT</pubDate></item><item><title>Sensex, Nifty end lower; HDFC Bank share price slips</title><link>https://economictimes.indiatimes.com/t</link><pubDate>Fri, 13 Nov 2026 07:05:00 GMT</pubDate></item></channel></rss>`;
const bizShares = buildNews("biz", [shareNews, null, null, null], NOW_B);
ok("share-price news stays on the Business tab, and the steel company's own is on the Steel tab as well", bizShares.items.length === 2 && buildNews("steel", steelTab([], [shareNews, null, null, null]), NOW_B).items.map((i) => i.link).join() === "https://economictimes.indiatimes.com/s");
ok("the searches are fixed addresses of Google News and Bing News only, https, asking for India, and in both English and Hindi", STEEL_SEARCHES.every((s) => /^https:\/\/(news\.google\.com\/rss\/search|www\.bing\.com\/news\/search)\?/.test(s.url)) && STEEL_SEARCHES.some((s) => /hl=hi/.test(s.url) || /setlang=hi/.test(s.url)) && STEEL_SEARCHES.some((s) => /hl=en-IN/.test(s.url)) && STEEL_SEARCHES.every((s) => /gl=IN|cc=in/.test(s.url)) && STEEL_SEARCHES.length >= 10);

console.log(`steel selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
