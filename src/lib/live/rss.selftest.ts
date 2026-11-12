// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/lib/live/rss.selftest.ts
import { readFileSync } from "node:fs";
import { DateTime } from "luxon";
import { parseRss, mergeFeeds, safeLink, decodeEntities, titleKey, parseDate } from "./rss";
import { buildNews, NEWS_SOURCES, isLang } from "./news";
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

const news = buildNews("en", [fx("rss-thehindu.xml"), null, null, null, null], NOW);
ok("news from the feeds that answer, naming the ones that did not", news.used.join() === "The Hindu" && news.failed.length === 4 && news.items.length === 4);
let threw = false; try { buildNews("hi", [null, null, null], NOW); } catch { threw = true; }
ok("when no feed answers, it is an error", threw);
ok("three languages, each with feeds, and a whitelist of the language", Object.keys(NEWS_SOURCES).join() === "en,hi,bn" && NEWS_SOURCES.en.length === 5 && isLang("bn") && !isLang("fr") && !isLang(null));

ok("sports: India is told from its words", classify({ title: "Rishabh Pant on his way to join India's Test squad in New Zealand", summary: "" }).includes("india") && classify({ title: "IPL auction: new records", summary: "" }).includes("india") && classify({ title: "Anderson signs for Surrey", summary: "" }).join() === "other");
ok("sports: a world event with or without India, and a story may be both", classify({ title: "Asian Games: hosts lead the table", summary: "" }).join() === "world" && classify({ title: "India beat Pakistan in the World Cup", summary: "" }).join() === "india,world" && classify({ title: "Wimbledon final set", summary: "" }).includes("world") && !/\bindia\b/i.test("Pakistan make U-19 Asia Cup final") && classify({ title: "Pakistan make U-19 Asia Cup final", summary: "" }).join() === "world");
const sp = buildSports([fx("rss-cricinfo.xml"), null, null], NOW);
ok("the sports list is classified, and names the feeds that did not answer", sp.items.length === 6 && sp.used.join() === "ESPNcricinfo" && sp.failed.length === 2 && sp.items.some((i) => i.groups.includes("india")) && sp.items.every((i) => i.groups.length >= 1));

console.log(`rss selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
