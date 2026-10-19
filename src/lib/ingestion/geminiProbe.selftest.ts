/**
 * Self-test of the Gemini probe. Run: npx tsx --tsconfig tsconfig.json src/lib/ingestion/geminiProbe.selftest.ts
 * No real network: a fake fetch for the library, and a local stand-in server for the script itself.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PAGE_READER_PROMPT } from "./pageReader";
import { DEFAULT_BASE_URL, formatProbe, probePage } from "./geminiProbe";

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

  // ---- the script itself, end to end, against a local stand-in for the service
  const root = join(__dirname, "..", "..", "..");
  const dir = mkdtempSync(join(tmpdir(), "probe-"));
  const file = join(dir, "page.png");
  writeFileSync(file, png);
  let lastBody: any = null;
  let mode: "answer" | "hang" = "answer";
  const server = createServer((req, resp) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      lastBody = JSON.parse(data || "{}");
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
