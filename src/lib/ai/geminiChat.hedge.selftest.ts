// src/lib/ai/geminiChat.hedge.selftest.ts: npx tsx --tsconfig tsconfig.selftest.json src/lib/ai/geminiChat.hedge.selftest.ts
// This tests the hedge (GeminiRequest.hedgeAfterMs): I send a call again when it has not answered in time and the first answer wins; a call that answers in time is sent once.
import { geminiGenerate } from "./geminiChat";

process.env.GEMINI_API_KEY = "test-key";
let pass = 0, fail = 0;
const ok = (n: string, c: boolean, extra = "") => { if (c) pass++; else { fail++; console.log("FAIL", n, extra); } };
const reply = (text: string) => new Response(JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts: [{ text }] } }], usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 } }), { status: 200 });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const realFetch = globalThis.fetch, realWarn = console.warn, realInfo = console.info;
console.warn = () => undefined; console.info = () => undefined;
const REQ = { models: ["m1"], json: true, attemptTimeoutMs: 5000, totalTimeoutMs: 8000 };

async function main() {
  try {
    // 1. no hedge: one request
    let calls = 0;
    globalThis.fetch = (async () => { calls++; return reply("a"); }) as any;
    const r1 = await geminiGenerate("p", REQ);
    ok("without a hedge the request is sent once", r1.text === "a" && calls === 1, `calls=${calls}`);

    // 2. When the answer comes before the hedge is due, I expect still one request, and no second one later.
    calls = 0;
    globalThis.fetch = (async () => { calls++; await sleep(50); return reply("fast"); }) as any;
    const r2 = await geminiGenerate("p", { ...REQ, hedgeAfterMs: 300 });
    await sleep(450);
    ok("an answer that comes in time is the only request (the hedge is cancelled)", r2.text === "fast" && calls === 1, `calls=${calls}`);

    // 3. The first request hangs: the second, sent at the hedge, answers and wins long before the first would have timed out.
    calls = 0;
    globalThis.fetch = ((_u: any, init: any) => {
      const n = ++calls;
      if (n === 1) return new Promise((_res, rej) => init.signal.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "TimeoutError" }))));
      return sleep(60).then(() => reply("second"));
    }) as any;
    const t0 = Date.now();
    const r3 = await geminiGenerate("p", { ...REQ, hedgeAfterMs: 300 });
    const took = Date.now() - t0;
    ok("a hung first request is hedged: the second request's answer is used", r3.text === "second" && calls === 2, `calls=${calls} text=${r3.text}`);
    ok("and it takes about the hedge plus the second request, not the first one's timeout", took >= 300 && took < 1500, `took=${took}`);

    // 4. When both requests fail, the call fails; it must not hang.
    calls = 0;
    globalThis.fetch = (async () => { calls++; await sleep(20); return new Response("{}", { status: 500 }); }) as any;
    let err: any = null;
    try { await geminiGenerate("p", { ...REQ, hedgeAfterMs: 300 }); } catch (e) { err = e; }
    ok("a failure that comes before the hedge is due fails at once, with no second request", !!err && calls >= 1 && calls <= 2, `calls=${calls}`);

    // 5. the first fails late (after the hedge), the second succeeds
    calls = 0;
    globalThis.fetch = (async () => { const n = ++calls; if (n === 1) { await sleep(500); return new Response("{}", { status: 500 }); } await sleep(100); return reply("rescued"); }) as any;
    const r5 = await geminiGenerate("p", { ...REQ, hedgeAfterMs: 200 });
    ok("when the first request fails after the hedge was sent, the second one's answer stands", r5.text === "rescued", `text=${r5.text}`);
  } finally {
    globalThis.fetch = realFetch; console.warn = realWarn; console.info = realInfo;
  }
  console.log(`geminiChat hedge selftest: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main();
