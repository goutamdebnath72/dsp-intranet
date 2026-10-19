/**
 * Self-test of the Gemini probe. Run: npx tsx --tsconfig tsconfig.json src/lib/ingestion/geminiProbe.selftest.ts
 * No real network: a fake fetch for the library, and a local stand-in server for the script itself.
 */
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PAGE_READER_PROMPT } from "./pageReader";
import sharp from "sharp";
import { DEFAULT_BASE_URL, compareProbes, formatProbe, probePage, type ProbeResult } from "./geminiProbe";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4]);
const res = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body), json: async () => body });
const answer = (text: string, extra: Record<string, unknown> = {}) => ({
  candidates: [{ content: { parts: [{ text }] }, finishReason: "STOP" }],
  usageMetadata: { promptTokenCount: 1812, candidatesTokenCount: 1042, thoughtsTokenCount: 3611, totalTokenCount: 6465 },
  ...extra,
});

(async () => {
  // ---- a normal answer
  let seen: { url: string; body: any; headers: Record<string, string> } | null = null;
  const r1 = await probePage({ png, apiKey: "KEY", model: "m-test", fetchImpl: async (url, init) => { seen = { url, body: JSON.parse(init.body), headers: init.headers }; return res(200, answer("Line one\nLine two 20-08-2026")); } });
  ok("a normal answer: ok, HTTP 200, finish reason STOP, text kept", r1.ok && r1.status === 200 && r1.finishReason === "STOP" && /20-08-2026/.test(r1.text ?? ""), JSON.stringify(r1).slice(0, 200));
  ok("the tokens are reported: page, answer, thinking, total", r1.promptTokens === 1812 && r1.answerTokens === 1042 && r1.thinkingTokens === 3611 && r1.totalTokens === 6465);
  ok("no repetition is reported for a normal text", r1.looped === false);
  ok("the request is the upload's: the same instructions, temperature 0, the page as inline data, the key in a header", seen !== null && (seen as any).body.contents[0].parts[0].text === PAGE_READER_PROMPT && (seen as any).body.generationConfig.temperature === 0 && (seen as any).body.contents[0].parts[1].inline_data.mime_type === "image/png" && (seen as any).headers["x-goog-api-key"] === "KEY");
  ok("by default the answer limit is 8192 and no thinking setting is sent (the service's own default)", (seen as any).body.generationConfig.maxOutputTokens === 8192 && (seen as any).body.generationConfig.thinkingConfig === undefined && r1.request.thinkingBudget === null);
  ok("the address is the model's generateContent address", (seen as any).url === `${DEFAULT_BASE_URL}/models/m-test:generateContent`);

  // ---- the two knobs
  await probePage({ png, apiKey: "K", maxTokens: 3000, thinkingBudget: 0, baseUrl: "http://stand-in/v1", fetchImpl: async (url, init) => { seen = { url, body: JSON.parse(init.body), headers: init.headers }; return res(200, answer("x")); } });
  ok("--max-tokens sets the answer limit", (seen as any).body.generationConfig.maxOutputTokens === 3000);
  ok("--thinking-budget 0 is sent (0 is a real value, not 'unset')", (seen as any).body.generationConfig.thinkingConfig?.thinkingBudget === 0);
  ok("another address is used when given", /^http:\/\/stand-in\/v1\/models\//.test((seen as any).url));

  // ---- when it goes wrong
  const hung = await probePage({ png, apiKey: "K", timeoutMs: 40, fetchImpl: (_u, init) => new Promise((_r, reject) => init.signal?.addEventListener("abort", () => reject(new Error("This operation was aborted")))) as any });
  ok("a request that never answers is abandoned at the timeout and says so", !hung.ok && /no answer after/.test(hung.error ?? "") && hung.seconds >= 0 && hung.seconds < 2, JSON.stringify(hung));
  const bad = await probePage({ png, apiKey: "K", fetchImpl: async () => res(400, { error: { message: "Unknown field thinkingConfig" } }) });
  ok("an HTTP error is reported with its status and what the service said", !bad.ok && bad.status === 400 && /thinkingConfig/.test(bad.error ?? ""));
  const off = await probePage({ png, apiKey: "K", fetchImpl: async () => { throw new Error("offline"); } });
  ok("a network failure is reported", !off.ok && /request failed: offline/.test(off.error ?? ""));

  // ---- what the answer is like
  const looping = await probePage({ png, apiKey: "K", fetchImpl: async () => res(200, answer(Array.from({ length: 12 }, () => "Rs. 1500 per month").join("\n") + "\nEnd")) });
  ok("an answer that repeats one line is flagged", looping.looped === true);
  const cut = await probePage({ png, apiKey: "K", fetchImpl: async () => res(200, { candidates: [{ content: { parts: [{ text: "half a page" }] }, finishReason: "MAX_TOKENS" }] }) });
  ok("an answer cut at the length limit reports its finish reason, and missing token counts say so", cut.finishReason === "MAX_TOKENS" && cut.thinkingTokens === undefined && /stopped early: YES/.test(formatProbe(cut, "x")) && /thinking not reported/.test(formatProbe(cut, "x")));

  // ---- the text of the report
  const f = formatProbe(r1, "circular 85, page 2");
  ok("the report names the page, the request, the time, the tokens and the ends of the text", /^circular 85, page 2 \(12 bytes\)/.test(f) && /request: m-test \| wait up to 300 s \| answer limit 8192 tokens \| thinking budget the service's default/.test(f) && /RESULT: answered in [\d.]+ s \| HTTP 200 \| finish reason: STOP/.test(f) && /tokens: page 1,812 \| answer 1,042 \| thinking 3,611 \| total 6,465/.test(f) && /repeats itself: no \| stopped early: no/.test(f) && /starts: Line one/.test(f) && /ends:   .*20-08-2026/.test(f), f);
  ok("a failure is reported on one line with the time", /RESULT: FAILED after [\d.]+ s \| HTTP 400: /.test(formatProbe(bad, "x")) && /RESULT: FAILED after [\d.]+ s: no answer after/.test(formatProbe(hung, "x")));

  // ---- two reads of the same page side by side
  {
    const mk = (seconds: number, text: string, imageBytes: number, okFlag = true): ProbeResult => ({ ok: okFlag, seconds, text, status: 200, request: { model: "m", timeoutMs: 300_000, maxTokens: 8192, thinkingBudget: null, imageBytes } });
    const a = mk(60.2, "Dated 11-08-2026. Renewal up to 20-08-2026. Rs 14,999/-", 2_506_817);
    const same = compareProbes(a, mk(8.1, "Dated 11-08-2026. Renewal up to 20-08-2026. Rs 14,999/-", 380_000));
    ok("comparison: the times, the sizes sent, the speed-up and that the numbers agree", /A 60\.2 s \(2,506,817 bytes\) \| B 8\.1 s \(380,000 bytes\) \| B was 7\.4x faster \| numbers: all \d+ important numbers agree/.test(same), same);
    const diff = compareProbes(a, mk(9, "Dated 11-08-2026. Renewal up to 20-08-2026. Rs 15,000/-", 380_000));
    ok("comparison: a number that differs is named on both sides", /numbers: DIFFER \(only in A: 14999 \| only in B: 15000;/.test(diff), diff);
    ok("comparison: slower is said plainly", /B was [\d.]+x SLOWER/.test(compareProbes(mk(5, "x 1500", 100), mk(20, "x 1500", 50))));
    ok("comparison: a failed side makes it impossible, and says which", /not possible \(A answered, B failed\)/.test(compareProbes(a, mk(50, "", 1, false))));
  }

  // ---- the script itself, end to end, against a local stand-in for the service
  const root = join(__dirname, "..", "..", "..");
  const dir = mkdtempSync(join(tmpdir(), "probe-"));
  const file = join(dir, "page.png");
  writeFileSync(file, png);
  let lastBody: any = null;
  const bodies: any[] = [];
  let mode: "answer" | "hang" = "answer";
  const server = createServer((req, resp) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      lastBody = JSON.parse(data || "{}");
      bodies.push(lastBody);
      if (mode === "hang") return; // never answers
      resp.setHeader("Content-Type", "application/json");
      resp.end(JSON.stringify(answer("Reporting time: 8:30 AM, Room No. 15", { usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20, thoughtsTokenCount: 123, totalTokenCount: 153 } })));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  const run = (extra: string[], env: Record<string, string> = {}) =>
    new Promise<{ code: number | null; out: string }>((resolve) => {
      const p = spawn("npx", ["tsx", "--tsconfig", "tsconfig.json", "scripts/gemini-probe.ts", "--file", file, "--base-url", `http://127.0.0.1:${port}`, ...extra], { cwd: root, env: { ...process.env, GEMINI_API_KEY: "test-key", ...env } });
      let out = "";
      p.stdout.on("data", (c) => (out += c));
      p.stderr.on("data", (c) => (out += c));
      p.on("close", (code) => resolve({ code, out }));
    });
  const a = await run(["--timeout", "10", "--max-tokens", "1000", "--thinking-budget", "0"]);
  ok("the script: exits 0 and prints the report", a.code === 0 && /RESULT: answered in/.test(a.out) && /Room No\. 15/.test(a.out), a.out.slice(-400));
  ok("the script: the options reach the request and the report", /answer limit 1000 tokens \| thinking budget 0/.test(a.out) && /thinking 123/.test(a.out) && lastBody?.generationConfig?.maxOutputTokens === 1000 && lastBody?.generationConfig?.thinkingConfig?.thinkingBudget === 0, a.out.slice(-300));
  // a page image with real weight (noise does not compress), shrunk by the script
  const raw = randomBytes(1200 * 1600 * 3); // random pixels do not compress: a heavy page image
  const noisy = join(dir, "noisy.png");
  writeFileSync(noisy, await sharp(raw, { raw: { width: 1200, height: 1600, channels: 3 } }).png().toBuffer());
  const original = statSync(noisy).size;
  bodies.length = 0;
  const runOn = (f: string, extra: string[]) =>
    new Promise<{ code: number | null; out: string }>((resolve) => {
      const p = spawn("npx", ["tsx", "--tsconfig", "tsconfig.json", "scripts/gemini-probe.ts", "--file", f, "--base-url", `http://127.0.0.1:${port}`, ...extra], { cwd: root, env: { ...process.env, GEMINI_API_KEY: "test-key" } });
      let out = "";
      p.stdout.on("data", (c) => (out += c));
      p.stderr.on("data", (c) => (out += c));
      p.on("close", (code) => resolve({ code, out }));
    });
  const sh = await runOn(noisy, ["--timeout", "20", "--jpeg-edge", "800", "--jpeg-quality", "70"]);
  const sentPart = bodies[0]?.contents?.[0]?.parts?.[1]?.inline_data;
  const sent = sentPart ? Buffer.from(sentPart.data, "base64") : Buffer.alloc(0);
  const meta = sent.length ? await sharp(sent).metadata() : null;
  ok("the script: --jpeg-edge sends ONE read, a JPEG whose long side is at most 800 px and far smaller than the file", sh.code === 0 && bodies.length === 1 && sentPart?.mime_type === "image/jpeg" && !!meta && Math.max(meta.width ?? 0, meta.height ?? 0) <= 800 && sent.length < original / 3 && /shrunk to a JPEG \(long side 800 px, quality 70\)/.test(sh.out) && /RESULT: answered in/.test(sh.out), `${sh.out.slice(-300)} sent=${sent.length} original=${original}`);
  bodies.length = 0;
  const cmp = await runOn(noisy, ["--timeout", "20", "--compare", "--jpeg-edge", "600"]);
  const mimes = bodies.map((b) => b?.contents?.[0]?.parts?.[1]?.inline_data?.mime_type);
  ok("the script: --compare reads the page twice, as stored and then shrunk, and prints the comparison", cmp.code === 0 && mimes.join() === "image/png,image/jpeg" && /A: as stored/.test(cmp.out) && /B: shrunk to a JPEG \(long side 600 px, quality 85\)/.test(cmp.out) && /COMPARISON: A [\d.]+ s \(.* bytes\) \| B [\d.]+ s \(.* bytes\) \|/.test(cmp.out) && /numbers: all \d+ important numbers agree/.test(cmp.out), `${mimes.join()} ${cmp.out.slice(-400)}`);
  mode = "hang";
  const t0 = Date.now();
  const b = await run(["--timeout", "1"]);
  ok("the script: a service that never answers is abandoned at --timeout and reported as failed", b.code === 0 && /RESULT: FAILED after [\d.]+ s: no answer after 1 s/.test(b.out) && Date.now() - t0 < 15_000, b.out.slice(-300));
  const c = await run(["--timeout", "1"], { GEMINI_API_KEY: "" });
  ok("the script: without a key it says what to do", c.code === 1 && /GEMINI_API_KEY is not set/.test(c.out), c.out.slice(-200));
  server.closeAllConnections?.();
  server.close();
  rmSync(dir, { recursive: true, force: true });

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
