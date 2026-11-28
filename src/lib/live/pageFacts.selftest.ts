// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/lib/live/pageFacts.selftest.ts
// This tests what a story's own page says: its picture and whether the paper marks it as paid. The page texts are made in the forms the papers' pages had on 28 Nov 2026 (The Hindu: isAccessibleForFree false in the structured data; Mint: "True"/"False"
// as a word, far down the page; BusinessLine: true or false; Bartaman, Jagran and the Hindi and Bengali papers: no mark; The Wall Street Journal: 401). Network answers are made by a stand-in fetch.
import { factsOfPage, factsOfStory, forgetFacts, markedPaid, paidByAddress, readPage, resolveFacts } from "./pageFacts";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };
const ld = (v: string) => `<script type="application/ld+json">{"@context":"https://schema.org","@type":"NewsArticle","headline":"h","isAccessibleForFree":${v}}</script>`;
const page = (extra: string, og = "https://cdn.bartamanpatrika.com/images/a_og.png") => `<html><head><meta property="og:image" content="${og}">${extra}</head><body>text</body></html>`;

ok("a page whose structured data says isAccessibleForFree false is paid: false (The Hindu), \"False\" (Mint), and either of two entries being false", markedPaid(page(ld("false"))) && markedPaid(page(ld('"False"'))) && markedPaid(page(ld("true") + ld("false"))) && markedPaid('{"isAccessibleForFree": false}'));
ok("true, \"True\" or no mark at all is not paid (free, or nothing said: the card says that a missing mark is not a check)", !markedPaid(page(ld("true"))) && !markedPaid(page(ld('"True"'))) && !markedPaid(page("")) && !markedPaid("<p>Premium content, paywall, subscribe</p>"));
ok("an address that names a premium section is paid (its path, not its host): /premium/, /prime/, /subscriber-only/; an ordinary address and a host called premium are not", paidByAddress("https://www.thehindubusinessline.com/premium/story.ece") && paidByAddress("https://economictimes.indiatimes.com/prime/money-and-markets/a/primearticleshow/1.cms") && paidByAddress("https://x.example/news/subscriber-only/a") && !paidByAddress("https://www.livemint.com/companies/news/a.html") && !paidByAddress("https://premium.example.com/news/a") && !paidByAddress("not an address"));
ok("the facts of a page: its picture (og:image on an allowed server) and its paid mark together", (() => { const f = factsOfPage(page(ld("false")), "https://bartamanpatrika.com/news/a"); const g = factsOfPage(page(ld("true"), "https://evil.example/a.jpg"), "https://bartamanpatrika.com/news/a"); return f.image === "https://cdn.bartamanpatrika.com/images/a_og.png" && f.paid && f.read && g.image === null && !g.paid; })());

// reading a page: the head, and no more than needed
const streamOf = (chunks: string[]): Response => new Response(new ReadableStream({ start(c) { chunks.forEach((x) => c.enqueue(new TextEncoder().encode(x))); c.close(); } }), { status: 200 });
(async () => {
  const mintLike = "<html><head><meta property='og:image' content='https://www.livemint.com/lm-img/a.jpg'></head><body>" + "x".repeat(60_000) + ld('"False"') + "y".repeat(500_000) + "</body></html>";
  const r1 = await readPage(streamOf([mintLike.slice(0, 40_000), mintLike.slice(40_000, 90_000), mintLike.slice(90_000)]));
  ok("a page is read until the head has ended AND the mark has been seen (Mint's is far down the page, past the head), and not to its end", markedPaid(r1.text) && r1.text.length < mintLike.length - 100_000, String(r1.text.length));
  const noMark = "<html><head><meta property='og:image' content='https://cdn.aajkaal.in/a.webp'></head><body>" + "z".repeat(900_000) + "</body></html>";
  const r2 = await readPage(streamOf([noMark.slice(0, 100_000), noMark.slice(100_000, 200_000), noMark.slice(200_000)]));
  ok("a paper that puts no mark is read only to 150 KB past its head, never to the end of a megabyte page", r2.text.length <= 250_000 && /og:image/.test(r2.text), String(r2.text.length));

  // one story at a time, by a stand-in fetch
  const answer = (status: number, body = "", url?: string) => async (u: string) => { const r = new Response(body, { status }); Object.defineProperty(r, "url", { value: url ?? u }); return r; };
  const f200 = await factsOfStory("https://bartamanpatrika.com/news/a", answer(200, page(ld("true"))));
  ok("a free story gives its picture and is not paid", f200.read && !f200.paid && f200.image === "https://cdn.bartamanpatrika.com/images/a_og.png");
  const f401 = await factsOfStory("https://www.wsj.com/finance/a", answer(401));
  const f402 = await factsOfStory("https://www.wsj.com/finance/a", answer(402));
  ok("a page that answers 401 or 402 (The Wall Street Journal's does) wants a login: paid", f401.paid && f401.read && f402.paid);
  const f403 = await factsOfStory("https://www.jagran.com/news/a.html", answer(403));
  const fErr = await factsOfStory("https://www.jagran.com/news/a.html", async () => { throw new Error("down"); });
  ok("a page that refuses (403) or fails is UNKNOWN, neither paid nor free: not read", !f403.paid && !f403.read && f403.image === null && !fErr.paid && !fErr.read);
  const other = await factsOfStory("https://www.anandabazar.com/west-bengal/a/cid/1", answer(200, page(ld("false"))));
  ok("a paper whose pages are not read (Anandabazar Patrika, The Telegraph, a Google link) is never fetched", !other.read && other.image === null && (await factsOfStory("https://news.google.com/rss/articles/CBMi", answer(200, "x"))).read === false);
  const redirected = await factsOfStory("https://www.jagran.com/news/a.html", answer(200, page(ld("true")), "https://evil.example/landing"));
  ok("a redirect that leaves the papers' hosts is not followed into", !redirected.read && redirected.image === null);

  // many at once, kept
  forgetFacts();
  let calls = 0;
  const counting = async (u: string) => { calls++; return answer(200, page(ld(u.includes("paid") ? "false" : "true")))(u); };
  const links = ["https://bartamanpatrika.com/news/a", "https://bartamanpatrika.com/news/paid-b", "https://www.jagran.com/news/c.html", "https://www.anandabazar.com/x", "https://news.google.com/rss/articles/CBMi"];
  const got = await resolveFacts(links, { fetchImpl: counting });
  ok("the facts of several stories are had together; links of papers that are not read are left out", got.size === 3 && calls === 3 && got.get("https://bartamanpatrika.com/news/paid-b")?.paid === true && got.get("https://bartamanpatrika.com/news/a")?.paid === false, JSON.stringify([...got.keys()]));
  await resolveFacts(links, { fetchImpl: counting });
  ok("what has been read is kept: asking again costs no request", calls === 3);
  forgetFacts();
  let t = 0;
  const slow = async (u: string) => { await new Promise((r) => setTimeout(r, 120)); return answer(200, page(ld("true")))(u); };
  const many = Array.from({ length: 40 }, (_, i) => `https://www.jagran.com/news/${i}.html`);
  const t0 = Date.now();
  const part = await resolveFacts(many, { fetchImpl: slow, concurrency: 5, deadlineMs: 400, now: () => (t = Date.now()) });
  ok("a deadline stops the looking: with 40 slow pages, 5 at a time and 400 ms, only a part is read, and the answer comes at about the deadline, not after all of them", part.size > 0 && part.size < 40 && Date.now() - t0 < 1500 && t > 0, `${part.size} in ${Date.now() - t0} ms`);
  forgetFacts();
  console.log(`pageFacts: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
