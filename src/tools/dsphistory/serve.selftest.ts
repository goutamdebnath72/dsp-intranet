// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/tools/dsphistory/serve.selftest.ts
// This checks the route that serves a JO Manual: signed-in readers only; an unknown or not-yet-uploaded document is 404; ?info=1 is JSON; a Range request is passed on and answered 206; the Blob address never leaves the server.
import { DOCS, docPageHref, docRoute, isPublic } from "./docs";
import { serveDoc, type ServeDeps } from "./serve";
import { SRC, EVENTS, KEY_DATES, FACTS, MAKERS, FIRST_ITEMS, SAIL_STORY, UNITS, OTHER_BODIES, HEADS, PHOTOS, type Source } from "./history";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };

const PDF = Buffer.from("%PDF-1.4 0123456789 the rest of the file");
const BLOB = "https://abc123.public.blob.vercel-storage.com/history-docs/jo-089-Xy12.pdf";
const seen: Array<{ url: string; range?: string }> = [];
const deps = (signedIn: boolean, there = true): ServeDeps => ({
  ticket: async () => (signedIn ? "12345" : null),
  find: async (name) => (there && name === DOCS["jo-089"].blobName! ? { url: BLOB, size: PDF.length } : null),
  get: async (url, init) => {
    const r = init.headers.Range;
    seen.push({ url, range: r });
    if (r) { const [a, b] = r.replace("bytes=", "").split("-").map((x) => (x === "" ? NaN : Number(x))); const from = a, to = Number.isNaN(b) ? PDF.length - 1 : b; const part = PDF.subarray(from, to + 1); return new Response(part, { status: 206, headers: { "content-length": String(part.length), "content-range": `bytes ${from}-${to}/${PDF.length}` } }); }
    return new Response(PDF, { status: 200, headers: { "content-length": String(PDF.length) } });
  },
});
const req = (path: string, headers: Record<string, string> = {}) => new Request(`https://intranet.example${path}`, { headers });

async function run() {
  const unknown = await serveDoc(req("/api/history-docs/zzz"), "zzz", deps(true));
  ok("an unknown document is 404 (even for a signed-in reader), and a prototype name is not a document", unknown.status === 404 && (await serveDoc(req("/x"), "constructor", deps(true))).status === 404);
  const anon = await serveDoc(req(docRoute("jo-089")), "jo-089", deps(false));
  ok("not signed in: 401 with a message that says to sign in, and no file is fetched", anon.status === 401 && /sign in/i.test(await anon.text()) && seen.length === 0);
  const none = await serveDoc(req(docRoute("jo-086")), "jo-086", deps(true));
  ok("a document not uploaded yet is 404 with a message that says so", none.status === 404 && /not been uploaded/.test(await none.text()));
  const info = await serveDoc(req(`${docRoute("jo-089")}?info=1`), "jo-089", deps(true));
  const ij = await info.json() as { title: string; pages: number; bytes: number };
  ok("?info=1 answers the title, the pages (49) and the bytes as JSON; it fetches nothing", info.status === 200 && ij.pages === 49 && ij.bytes === PDF.length && /Revised Plant Specific Manual/.test(ij.title) && seen.length === 0);
  const whole = await serveDoc(req(docRoute("jo-089")), "jo-089", deps(true));
  const body = Buffer.from(await whole.arrayBuffer());
  ok("a signed-in reader gets the PDF inline, whole, as application/pdf, with Accept-Ranges and no caching", whole.status === 200 && body.equals(PDF) && whole.headers.get("content-type") === "application/pdf" && /^inline;/.test(whole.headers.get("content-disposition") ?? "") && whole.headers.get("accept-ranges") === "bytes" && /no-store/.test(whole.headers.get("cache-control") ?? ""));
  const part = await serveDoc(req(docRoute("jo-089"), { range: "bytes=5-14" }), "jo-089", deps(true));
  const pb = Buffer.from(await part.arrayBuffer());
  ok("a Range request is passed on and answered 206 with its Content-Range (so a far page opens without the whole file)", part.status === 206 && pb.toString() === PDF.subarray(5, 15).toString() && part.headers.get("content-range") === `bytes 5-14/${PDF.length}` && seen[seen.length - 1].range === "bytes=5-14");
  await serveDoc(req(docRoute("jo-089"), { range: "bytes=0-1,5-9" }), "jo-089", deps(true));
  ok("a Range the route does not understand (several ranges) is not passed on", seen[seen.length - 1].range === undefined);
  const dead: ServeDeps = { ...deps(true), get: async () => new Response("no", { status: 500 }) };
  ok("when Blob cannot be read: 502 and a message to try again", (await serveDoc(req(docRoute("jo-089")), "jo-089", dead)).status === 502);
  // A published PDF is public, and I test that: it is served to a reader who is not signed in, from its own copy in Blob, with ranges passed on. The route is not a general proxy.
  const pubSeen: string[] = [];
  const pdeps: ServeDeps = { ticket: async () => null, find: async (n) => (n === DOCS["steel-cities"].blobName ? { url: "https://x.public.blob.vercel-storage.com/history-docs/steel-cities-Ab.pdf", size: PDF.length } : null), get: async (url, init) => { pubSeen.push(url + (init.headers.Range ? " " + init.headers.Range : "")); const r = init.headers.Range; return r ? new Response(PDF.subarray(0, 10), { status: 206, headers: { "content-length": "10", "content-range": `bytes 0-9/${PDF.length}` } }) : new Response(PDF, { status: 200, headers: { "content-length": String(PDF.length) } }); } };
  const pub = await serveDoc(req(docRoute("steel-cities"), { range: "bytes=0-9" }), "steel-cities", pdeps);
  ok("a published PDF (Steel Cities) is served to a reader who is not signed in, from its copy in Blob, with the Range passed on (206)", pub.status === 206 && /history-docs\/steel-cities-Ab\.pdf bytes=0-9$/.test(pubSeen[0]) && pub.headers.get("content-range") === `bytes 0-9/${PDF.length}`);
  ok("an internal manual still needs the sign-in while a published PDF does not (the same route, the same answer to a reader who is not signed in: 401 against 206)", (await serveDoc(req(docRoute("jo-089")), "jo-089", { ...pdeps, find: deps(true).find })).status === 401 && isPublic(DOCS["steel-cities"]) && !isPublic(DOCS["jo-089"]));
  const pinfo = await (await serveDoc(req(`${docRoute("steel-cities")}?info=1`), "steel-cities", pdeps)).json() as { title: string; bytes: number };
  ok("?info=1 of a published PDF answers its title and its size", /Steel Cities/.test(pinfo.title) && pinfo.bytes === PDF.length);
  ok("only the documents listed in docs.ts can be served: an address typed as the id is 404 and fetches nothing", (await serveDoc(req("/api/history-docs/https%3A%2F%2Fexample.com%2Fx.pdf"), "https://example.com/x.pdf", pdeps)).status === 404 && pubSeen.length === 1);
  const all = [whole, part, info, anon, none];
  const texts = [JSON.stringify(ij), ...all.map((r) => [...r.headers.entries()].join("|"))].join("\n");
  ok("the address in Vercel Blob is in no header and no body the reader gets", !/blob\.vercel-storage|abc123/.test(texts));
}

// The cards' sources: every source that names a document must have its entry, and every cited page must be inside the document.
const sources: Source[] = [];
const walk = (v: unknown): void => { if (!v || typeof v !== "object") return; if (Array.isArray(v)) { v.forEach(walk); return; } const o = v as Record<string, unknown>; if (typeof o.name === "string" && typeof o.doc === "string") sources.push(o as unknown as Source); else Object.values(o).forEach(walk); };
walk([EVENTS, KEY_DATES, FACTS, MAKERS, FIRST_ITEMS, SAIL_STORY, UNITS, OTHER_BODIES, HEADS, Object.values(PHOTOS)]);
ok("the two manuals in the source table are the documents on file: jo-086 and jo-089 (and the page links are our route's); every published PDF the card cites has its entry, with its own address", SRC.sailManual.doc === "jo-086" && SRC.dspManual.doc === "jo-089" && Object.values(SRC).filter((x) => /\.pdf/i.test((x as Source).url ?? "")).every((x) => !(x as Source).doc || DOCS[(x as Source).doc!]?.remote === (x as Source).url) && SRC.cities.doc === "steel-cities" && docPageHref("jo-089", 12) === "/api/history-docs/jo-089#page=12" && docPageHref("jo-089", 0) === "/api/history-docs/jo-089#page=1");
ok("every cited manual page is a page of that manual (1 to its last)", sources.length > 20 && sources.every((s) => s.doc! in DOCS && (s.pages ?? []).every((p) => p >= 1 && p <= (DOCS[s.doc!].pages ?? Infinity))), String(sources.length));

run().then(() => { console.log(`history docs: ${pass} passed, ${fail} failed`); if (fail > 0) process.exit(1); });
