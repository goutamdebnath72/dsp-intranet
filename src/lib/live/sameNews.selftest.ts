// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/lib/live/sameNews.selftest.ts
// The same news by MEANING: the embedding shortlist and the light judge, with fakes (no network). The real model was tried once on the headlines of 27 Nov 2026: see STATUS row 330.
import { readFileSync } from "node:fs";
import { DateTime } from "luxon";
import { dropSameMeaning, SHORTLIST, MAX_PAIRS, PAIRS_PER_ASKING, cosine, embedHeadlines, forgetHeadlines, geminiJudge, judgePrompt, meaningLinks, meaningOf, pairKey, parseJudge } from "./sameNews";
import { clusterTopics } from "./steel";
import { assignDesk, priorityOf, type DeskItem } from "./priority";
import type { FeedItem } from "./rss";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };

async function main() {
  // ---- the judge's words
  ok("the judge's answer is read from JSON, even inside other words; anything unreadable, or a number out of range, is 'none'", parseJudge('{"same":[1,3]}', 5).join() === "1,3" && parseJudge('Here you are: {"same":[2]} done', 5).join() === "2" && parseJudge("nonsense", 5).length === 0 && parseJudge('{"same":[0,9,"x",2,2]}', 5).join() === "2" && parseJudge('{"same":"all"}', 5).length === 0);
  const prompt = judgePrompt([["A one", "B one"], ["A two", "B two"]]);
  ok("the prompt numbers the pairs, says what 'same news' means (not merely the same company; different figures are different), and asks for JSON only", /1\.\nA: A one\nB: B one/.test(prompt) && /2\.\nA: A two/.test(prompt) && /SAME NEWS/.test(prompt) && /different figures/.test(prompt) && /JSON only/.test(prompt));

  // ---- the vectors, with a fake service
  forgetHeadlines();
  let calls = 0, sent = 0;
  const vec = (t: string): number[] => (/ALPHA/.test(t) ? [1, 0.05, 0] : /BETA/.test(t) ? [0.05, 1, 0] : [0, 0.05, 1]);
  const fakeFetch = (async (_u: unknown, init: { body: string }) => { calls++; const reqs = JSON.parse(init.body).requests as Array<{ content: { parts: Array<{ text: string }> } }>; sent += reqs.length; return new Response(JSON.stringify({ embeddings: reqs.map((r) => ({ values: vec(r.content.parts[0].text) })) }), { status: 200 }); }) as unknown as typeof fetch;
  const titles = Array.from({ length: 230 }, (_, i) => `ALPHA headline ${i}`);
  const v1 = await embedHeadlines(titles, { apiKey: "k", fetchImpl: fakeFetch });
  ok("230 headlines go in 3 calls of at most 100, each comes back as a vector of length one", v1.size === 230 && calls === 3 && sent === 230 && Math.abs(cosine(v1.get("ALPHA headline 0")!, v1.get("ALPHA headline 0")!) - 1) < 1e-6);
  const v2 = await embedHeadlines([...titles, "BETA new"], { apiKey: "k", fetchImpl: fakeFetch });
  ok("a headline already embedded is never sent again: the next asking sends only the one new headline", v2.size === 231 && calls === 4 && sent === 231);
  forgetHeadlines();
  const none = await embedHeadlines(["x y z"], { apiKey: null, fetchImpl: (async () => { throw new Error("must not be called"); }) as unknown as typeof fetch });
  const bad = await embedHeadlines(["a b c"], { apiKey: "k", fetchImpl: (async () => new Response("quota", { status: 429 })) as unknown as typeof fetch });
  const thrown = await embedHeadlines(["d e f"], { apiKey: "k", fetchImpl: (async () => { throw new Error("offline"); }) as unknown as typeof fetch });
  ok("with no key, or when the service refuses or is unreachable, it returns nothing and never throws", none.size === 0 && bad.size === 0 && thrown.size === 0);

  // ---- the shortlist and the judge
  forgetHeadlines();
  const embed = async (ts: string[]) => new Map(ts.map((t) => [t, Float32Array.from(vec(t).map((x) => x / Math.hypot(...vec(t))))]));
  let judged: Array<[string, string]> = [], judgeCalls = 0;
  const judge = async (pairs: Array<[string, string]>) => { judgeCalls++; judged = pairs; return pairs.map(([a, b], k) => (/LAUNCH/.test(a) && /LAUNCH/.test(b) ? k + 1 : 0)).filter(Boolean); };
  const set = ["ALPHA LAUNCH in English", "ALPHA LAUNCH in Hindi words", "ALPHA PRICE story", "BETA other news", "GAMMA third news"];
  const links = await meaningLinks(set, { embed, judge });
  ok(`only pairs at ${SHORTLIST} or nearer are put to the judge (the three ALPHA headlines, not BETA or GAMMA), and only the pair it calls the same comes back`, judged.length === 3 && judged.every(([a, b]) => /ALPHA/.test(a) && /ALPHA/.test(b)) && links.size === 1 && links.has(pairKey("ALPHA LAUNCH in English", "ALPHA LAUNCH in Hindi words")));
  ok("the verdict is kept: asked again, the judge is not called, and meaningOf answers at once, in either order; a pair never asked is not the same", (await meaningLinks(set, { embed, judge })).size === 1 && judgeCalls === 1 && meaningOf("ALPHA LAUNCH in Hindi words", "ALPHA LAUNCH in English") && !meaningOf("ALPHA PRICE story", "ALPHA LAUNCH in English") && !meaningOf("BETA other news", "GAMMA third news"));
  forgetHeadlines();
  ok("when the judge cannot answer (null), nothing is joined: the rules alone decide", (await meaningLinks(set, { embed, judge: async () => null })).size === 0 && !meaningOf("ALPHA LAUNCH in English", "ALPHA LAUNCH in Hindi words"));
  forgetHeadlines();
  const many = Array.from({ length: 60 }, (_, i) => `ALPHA item ${i}`);
  let asked = 0, askings = 0; await meaningLinks(many, { embed, judge: async (p) => { asked += p.length; askings++; return []; } });
  ok(`never more than ${MAX_PAIRS} pairs in all, however many headlines are close, split into askings of at most ${PAIRS_PER_ASKING}`, asked === MAX_PAIRS && askings === Math.ceil(MAX_PAIRS / PAIRS_PER_ASKING));
  forgetHeadlines();
  let n = 0; const flaky = async (p: Array<[string, string]>) => (++n === 1 ? null : p.map((_x, k) => k + 1));
  const part = await meaningLinks(many.slice(0, 8), { embed, judge: flaky });
  ok("one asking that fails leaves its pairs unasked (not 'different', and asked again next time); the other asking still counts: 28 pairs in two askings of 15 and 13, the first failing, 13 joined", part.size === 13);
  ok("no key: the judge says nothing and the call costs nothing", await geminiJudge([["a", "b"]]).then((x) => (process.env.GEMINI_API_KEY ? true : x === null)));

  // ---- the lists use the verdicts
  const row = (title: string, source: string, h: number, n: number): FeedItem => ({ title, link: `https://${n}.example/`, publishedAt: DateTime.fromISO("2026-11-27T12:00:00Z").minus({ hours: h }).toISO()!, source, summary: "" });
  const a = row("Jindal Steel targets Mar'27 completion for CO2-to-chemicals pilot", "Business Standard", 2, 1), b = row("जिंदल स्टील मार्च 2027 तक कार्बन उत्सर्जन रूपांतरण पायलट परियोजना पूरी करेगा", "Lokmat News Hindi", 3, 2);
  const c = row("NMDC battles weak offtake despite strong steel demand", "Livemint", 4, 3);
  ok("the steel list: two headlines that share no name and no figure stay two rows by the rules, and become one when the judge has said they are the same news", clusterTopics([a, b, c]).length === 3 && clusterTopics([a, b, c], (x, y) => pairKey(x, y) === pairKey(a.title, b.title)).length === 2);
  const mk = (lang: "en" | "hi" | "bn", title: string, h: number): DeskItem => ({ ...row(title, `P-${lang}`, h, Math.floor(Math.random() * 1e6)), lang, flag: priorityOf(title)! });
  const en = mk("en", "Veteran stage actor dies at 91 after a long illness", 5), hi = mk("hi", "दिग्गज रंगमंच कलाकार का लंबी बीमारी के बाद निधन", 4), acc = mk("en", "Six killed as bus overturns near Siliguri", 3);
  ok("the priority desk: the same death in English and Hindi with no name in either is told apart by the rules, and joined (one story, in the language that arrived first) when the judge says so; a death and an accident are never joined", (() => { const x = assignDesk([en, hi]); const y = assignDesk([en, hi], (p, q) => pairKey(p, q) === pairKey(en.title, hi.title)); const z = assignDesk([en, acc], () => true); return x.en.length + x.hi.length === 2 && y.en.length === 1 && y.hi.length === 0 && z.en.length === 2; })());

  // ---- where it is wired
  const route = readFileSync("src/app/api/live/news/route.ts", "utf8");
  ok("the route answers at once with what the judge has already said, and puts the new headlines to it AFTER the answer has gone (next/server after), never making a reader wait for the model", /import \{ after \} from "next\/server"/.test(route) && /after\(\(\) => job\)/.test(route) && /keep\(meaningLinks\(titles\)/.test(route) && /buildTab\(lang, textsByLang, now, undefined, meaningOf, later, facts\)/.test(route) && /buildNews\(lang, texts, now, undefined, meaningOf, facts\)/.test(route));
  const src = readFileSync("src/lib/live/sameNews.ts", "utf8");
  ok("only the headlines of public feeds are sent, nothing typed; the model is the chat chain (never a Pro one) and the embedding model the circular search uses", /gemini-embedding-001/.test(src) && /JUDGE_MODELS\(\)/.test(src) && /chatModels\(\)/.test(src) && /flash-lite/.test(src) && !/gemini[-\w.]*pro\b/i.test(src) && !/-pro/i.test(src));

  {
    // a long list of headlines of one trade, all near each other: the pair that shares words must still reach the judge within the cap
    const same = (x: string) => x.startsWith("SAIL Rourkela") || x.startsWith("SAIL's Rourkela");
    const titles = ["SAIL Rourkela Steel Plant launches safety initiative for contractual workers", ...Array.from({ length: 14 }, (_, i) => `Topic${i} alpha${i} beta${i} gamma${i} delta${i}`), "SAIL's Rourkela Steel Plant Launches First Department-Level Surakshya Charcha to Promote Workplace Safety"];
    const one = Float32Array.from([1, 0, 0, 0]);
    const embedAll = async (ts: string[]) => new Map(ts.map((t) => [t, one] as [string, Float32Array]));
    let asked: Array<[string, string]> = [];
    forgetHeadlines();
    const got = await meaningLinks(titles, { embed: embedAll as never, judge: async (pairs) => { asked = asked.concat(pairs); return pairs.map(([a, b], i) => (same(a) && same(b) ? i + 1 : 0)).filter(Boolean); } });
    ok("with more near pairs than the cap (all 136 pairs are at cosine 1), the pair that shares three words or more is put to the judge first and is not lost", asked.length === MAX_PAIRS && asked.some(([a, b]) => same(a) && same(b)) && got.size === 1 && asked.findIndex(([a, b]) => same(a) && same(b)) < PAIRS_PER_ASKING);
  }
  {
    const a = { title: "SAIL Rourkela Steel Plant launches safety initiative for contractual workers", source: "PSU Watch" }, b = { title: "SAIL's Rourkela Steel Plant Launches First Department-Level 'Surakshya Charcha' to Promote Workplace Safety", source: "Indian Masterminds" }, c = { title: "Tata Steel sells Steel Tubes and Colour Coated business", source: "MediaBrief" };
    const said = (x: string, y: string) => (x === a.title && y === b.title) || (x === b.title && y === a.title);
    const out = dropSameMeaning([a, c, b], said);
    ok("dropSameMeaning joins the two stories the judge called the same news (the first stays and names the other paper) and leaves the rest", out.length === 2 && out[0].title === a.title && (out[0] as { also?: string[] }).also?.join() === "Indian Masterminds" && out[1].title === c.title);
    ok("with no verdict (the judge never asked, or down) the list stays as it is", dropSameMeaning([a, b, c], () => false).length === 3);
    ok("the route asks the judge about the list's own headlines BEFORE the answer goes (not only afterwards), for at most 4 s, then joins", /meaningLinks\(data\.items\.map/.test(route) && /dropSameMeaning\(data\.items\)/.test(route) && /setTimeout\(resolve, 4000\)/.test(route) && /too late|THE JUDGE MAY BE TOO LATE/.test(route) && /result\.items = joined/.test(route));
  }

  console.log(`sameNews selftest: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main();
