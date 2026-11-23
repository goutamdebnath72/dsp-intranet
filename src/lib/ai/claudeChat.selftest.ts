// src/lib/ai/claudeChat.selftest.ts: npx tsx --tsconfig tsconfig.selftest.json src/lib/ai/claudeChat.selftest.ts
// This tests my Claude connection (claudeChat.ts, reached through geminiGenerate by a model name that starts with "claude"): what is sent, what is read back, what a failure does. No network: fetch is replaced.
import { geminiGenerate, synthesisModels, verifyModels } from "./geminiChat";
import { isClaudeModel } from "./claudeChat";
import { readFileSync } from "node:fs";

process.env.GEMINI_API_KEY = "g-test";
let pass = 0, fail = 0;
const ok = (n: string, c: boolean, extra = "") => { if (c) pass++; else { fail++; console.log("FAIL", n, extra); } };
const claudeReply = (text: string, extra: any = {}) => new Response(JSON.stringify({ content: [{ type: "text", text }], stop_reason: "end_turn", usage: { input_tokens: 1000, output_tokens: 200, cache_read_input_tokens: 500 }, ...extra }), { status: 200 });
const geminiReply = (text: string) => new Response(JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts: [{ text }] } }], usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 } }), { status: 200 });
const realFetch = globalThis.fetch, realWarn = console.warn, realInfo = console.info;
console.warn = () => undefined; console.info = () => undefined;
const REQ = { json: true, system: "SYS", maxOutputTokens: 777, temperature: 0, attemptTimeoutMs: 5000, totalTimeoutMs: 9000 };

async function main() {
  try {
    ok("names that belong to Anthropic are recognised, others are not", isClaudeModel("claude-haiku-5-5") && isClaudeModel("Claude-Sonnet-5-5") && !isClaudeModel("gemini-3.8-flash") && !isClaudeModel("my-claude"));

    // 1. what is sent
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    let url = "", headers: any = {}, body: any = {}, calls = 0;
    globalThis.fetch = (async (u: any, init: any) => { calls++; url = String(u); headers = init.headers; body = JSON.parse(init.body); return claudeReply('{"a":1}'); }) as any;
    const r = await geminiGenerate("PROMPT", { ...REQ, models: ["claude-haiku-5-5", "gemini-3.8-flash"] });
    ok("a claude model is sent to the Messages API, once, with the key in a header and the version header", url === "https://api.anthropic.com/v1/messages" && headers["x-api-key"] === "sk-ant-test" && !!headers["anthropic-version"] && calls === 1);
    ok("the body carries the model, the token budget (twice the caller's: Claude counts more tokens), the temperature, the prompt as the user message", body.model === "claude-haiku-5-5" && body.max_tokens === 1554 && body.temperature === 0 && body.messages?.[0]?.role === "user" && body.messages[0].content === "PROMPT");
    ok("the system prompt is sent with the JSON-only instruction after it", body.system.startsWith("SYS") && /JSON object only/.test(body.system));
    ok("the key is never in the address or the body", !url.includes("sk-ant") && !JSON.stringify(body).includes("sk-ant"));
    ok("the reply is the joined text, the model that answered, and the usage in the shape the engine reads (prompt includes cached)", r.text === '{"a":1}' && r.model === "claude-haiku-5-5" && r.usage.prompt === 1500 && r.usage.completion === 200 && r.usage.cached === 500);

    // 2. I let a failure that another model survives move on to the next model of the chain (Gemini).
    for (const status of [429, 529, 500]) {
      globalThis.fetch = (async (u: any) => (String(u).includes("anthropic") ? new Response("{}", { status }) : geminiReply("from gemini"))) as any;
      const g = await geminiGenerate("p", { ...REQ, models: ["claude-haiku-5-5", "gemini-3.8-flash"] });
      ok(`HTTP ${status} from Claude: the next model answers`, g.text === "from gemini" && g.model === "gemini-3.8-flash", g.text);
    }
    // 3. A bad key or no credit stops at once, because the next model would not fix it.
    globalThis.fetch = (async () => new Response('{"error":{"message":"Your credit balance is too low to access the Anthropic API"}}', { status: 400 })) as any;
    let err: any = null;
    try { await geminiGenerate("p", { ...REQ, models: ["claude-haiku-5-5", "gemini-3.8-flash"] }); } catch (e) { err = e; }
    ok("no credit stops at once, with a message for the administrator", !!err && /top up the Anthropic billing/.test(err.message) && err.retryable === false, String(err?.message));
    globalThis.fetch = (async () => new Response("{}", { status: 401 })) as any;
    err = null;
    try { await geminiGenerate("p", { ...REQ, models: ["claude-haiku-5-5", "gemini-3.8-flash"] }); } catch (e) { err = e; }
    ok("a refused key stops at once", !!err && /refused/.test(err.message) && err.retryable === false);
    // 4. When a model rejects the temperature, I ask it again once without it.
    calls = 0; const sent: any[] = [];
    globalThis.fetch = (async (_u: any, init: any) => { calls++; const b = JSON.parse(init.body); sent.push(b); return b.temperature !== undefined ? new Response('{"error":{"message":"temperature is not supported for this model"}}', { status: 400 }) : claudeReply("{}"); }) as any;
    const t = await geminiGenerate("p", { ...REQ, models: ["claude-opus-x"] });
    ok("a rejected temperature is retried without it", t.text === "{}" && calls === 2 && sent[1].temperature === undefined);
    // 5. I treat cut-off and empty answers as errors.
    globalThis.fetch = (async () => claudeReply("{", { stop_reason: "max_tokens" })) as any;
    err = null; try { await geminiGenerate("p", { ...REQ, models: ["claude-haiku-5-5"] }); } catch (e) { err = e; }
    ok("a cut-off answer is an error, never returned as if complete", !!err && /cut off/.test(err.message));
    // 6. no key: the chain moves on
    delete process.env.ANTHROPIC_API_KEY;
    globalThis.fetch = (async () => geminiReply("gemini only")) as any;
    const nk = await geminiGenerate("p", { ...REQ, models: ["claude-haiku-5-5", "gemini-3.8-flash"] });
    ok("without ANTHROPIC_API_KEY the chain moves on to the next model", nk.text === "gemini only");

    // 7. All I need to switch the writer or the checker to Claude is to name it.
    process.env.GEMINI_SYNTHESIS_MODEL = "claude-haiku-5-5"; process.env.GEMINI_VERIFY_MODEL = "claude-haiku-5-5";
    ok("GEMINI_SYNTHESIS_MODEL / GEMINI_VERIFY_MODEL = claude-haiku-5-5 make Claude the first model of the writer and of the checker, Gemini the fallbacks", synthesisModels()[0] === "claude-haiku-5-5" && verifyModels()[0] === "claude-haiku-5-5" && synthesisModels().length === 2 && synthesisModels().some((m) => m.startsWith("gemini-")));
    delete process.env.GEMINI_SYNTHESIS_MODEL; delete process.env.GEMINI_VERIFY_MODEL;
    ok("the key is read only from the environment, and never printed by this module", !/console\.\w+\([^)]*apiKey/.test(readFileSync("src/lib/ai/claudeChat.ts", "utf8")));
  } finally {
    globalThis.fetch = realFetch; console.warn = realWarn; console.info = realInfo;
  }
  console.log(`claudeChat selftest: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main();
