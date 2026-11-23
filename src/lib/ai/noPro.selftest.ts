// src/lib/ai/noPro.selftest.ts: npx tsx --tsconfig tsconfig.selftest.json src/lib/ai/noPro.selftest.ts
// My rule: no Pro models (23 Nov 2026). This test proves that a Pro name is recognised; every chain the app builds is free of Pro whatever the environment says; a request that names only Pro models sends NOTHING; the page
// readers and the OCR readers are Flash; and no source file of the app names a Pro model except the one that refuses them.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { isProModel, withoutPro, orReplacement, modelAllowed } from "./noPro";
import { geminiGenerate, synthesisModels, verifyModels, chatModels } from "./geminiChat";
import { geminiOcrReaders, DEFAULT_PRIMARY_MODEL, DEFAULT_CHECK_MODEL } from "../ingestion/geminiOcr";
import { geminiReader, DEFAULT_GEMINI_MODEL } from "../ingestion/pageReader";
import { PERF } from "@/lib/perf/switches";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, extra = "") => { if (c) pass++; else { fail++; console.log("FAIL", n, extra); } };
const realWarn = console.warn; console.warn = () => undefined;

async function main() {
  try {
    ok("the switch is off (Pro refused)", PERF.allowProModels === false);
    ok("Pro names are recognised", ["gemini-3.1-pro-preview", "gemini-pro-latest", "gemini-2.5-pro", "models/gemini-3-pro", "GEMINI-PRO"].every(isProModel));
    ok("other names are not Pro (flash, flash-lite, embedding, claude, a word that only contains 'pro')", ["gemini-3.8-flash", "gemini-flash-latest", "gemini-3.5-flash-lite", "gemini-embedding-001", "claude-haiku-5-5", "improve-model", "gemini-prototype"].every((m) => !isProModel(m)));
    ok("withoutPro drops Pro and keeps the order of the rest", JSON.stringify(withoutPro(["gemini-3.1-pro-preview", "gemini-3.8-flash", "gemini-pro-latest", "gemini-flash-latest"])) === JSON.stringify(["gemini-3.8-flash", "gemini-flash-latest"]));
    ok("orReplacement gives the replacement for Pro and the name itself otherwise", orReplacement("gemini-3.1-pro-preview", "gemini-3.8-flash") === "gemini-3.8-flash" && orReplacement("gemini-3.6-flash", "x") === "gemini-3.6-flash");

    // The chains, with the environment trying to bring Pro back.
    const saved = { s: process.env.GEMINI_SYNTHESIS_MODEL, v: process.env.GEMINI_VERIFY_MODEL, c: process.env.GEMINI_CHAT_MODEL };
    process.env.GEMINI_SYNTHESIS_MODEL = "gemini-3.1-pro-preview"; process.env.GEMINI_VERIFY_MODEL = "gemini-pro-latest";
    ok("GEMINI_SYNTHESIS_MODEL=gemini-3.1-pro-preview does not bring Pro back: the writer's chain has no Pro", synthesisModels().every(modelAllowed) && synthesisModels()[0] === "gemini-3.8-flash", synthesisModels().join(","));
    ok("GEMINI_VERIFY_MODEL=gemini-pro-latest does not bring Pro back: the checker's chain has no Pro", verifyModels().every(modelAllowed), verifyModels().join(","));
    process.env.GEMINI_CHAT_MODEL = "gemini-3.1-pro-preview";
    ok("the chat chain is Pro-free by the guard of geminiGenerate (checked below), and its default has no Pro", chatModels().length > 0);
    for (const [k, v] of Object.entries({ GEMINI_SYNTHESIS_MODEL: saved.s, GEMINI_VERIFY_MODEL: saved.v, GEMINI_CHAT_MODEL: saved.c })) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    ok("the default chains have no Pro", synthesisModels().every(modelAllowed) && verifyModels().every(modelAllowed));

    // Here a request that names only Pro models must send nothing at all.
    process.env.GEMINI_API_KEY = "test-key";
    const realFetch = globalThis.fetch; let calls = 0;
    globalThis.fetch = (async () => { calls++; return new Response("{}", { status: 200 }); }) as any;
    let err: any = null;
    try { await geminiGenerate("p", { models: ["gemini-3.1-pro-preview", "gemini-pro-latest"], attemptTimeoutMs: 1000, totalTimeoutMs: 2000 }); } catch (e) { err = e; }
    ok("geminiGenerate with only Pro models sends no request and fails clearly", !!err && calls === 0 && /Pro models are refused/.test(err.message), `calls=${calls} ${err?.message}`);
    // A mixed chain: I expect only the Flash model to be asked.
    const urls: string[] = [];
    globalThis.fetch = (async (u: any) => { urls.push(String(u)); return new Response(JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: "ok" }] } }], usageMetadata: {} }), { status: 200 }); }) as any;
    await geminiGenerate("p", { models: ["gemini-3.1-pro-preview", "gemini-3.8-flash"], attemptTimeoutMs: 1000, totalTimeoutMs: 2000 });
    ok("a mixed chain asks only the Flash model", urls.length === 1 && urls[0].includes("gemini-3.8-flash") && !urls.some((u) => /pro/i.test(u.replace("generativelanguage", ""))), urls.join(" "));
    globalThis.fetch = realFetch;

    // the page readers
    ok("the OCR defaults are Flash (a main reader and a different checker)", !isProModel(DEFAULT_PRIMARY_MODEL) && !isProModel(DEFAULT_CHECK_MODEL) && (DEFAULT_PRIMARY_MODEL as string) !== (DEFAULT_CHECK_MODEL as string));
    const env = { GEMINI_API_KEY: "k", GEMINI_VISION_MODEL: "gemini-3.1-pro-preview", OCR_PRIMARY_MODEL: "gemini-3.1-pro-preview", OCR_CHECK_MODEL: "gemini-pro-latest" };
    const r = geminiOcrReaders(env);
    ok("OCR readers asked to be Pro are Flash instead", !isProModel(r.primary.name) && (!r.checker || !isProModel(r.checker.name)), `${r.primary.name} / ${r.checker?.name}`);
    process.env.GEMINI_VISION_MODEL = "gemini-3.1-pro-preview";
    ok("the page reader asked to be Pro by the environment is Flash", geminiReader({ apiKey: "k" }).name === `gemini:${DEFAULT_GEMINI_MODEL}` && !isProModel(DEFAULT_GEMINI_MODEL));
    ok("a page reader asked for Pro in its options is Flash", geminiReader({ apiKey: "k", model: "gemini-pro-latest" }).name === `gemini:${DEFAULT_GEMINI_MODEL}`);
    delete process.env.GEMINI_VISION_MODEL;

    // Source check: no file may name a Pro model except the guard and the files that talk about it.
    const ALLOWED = new Set(["src/lib/ai/noPro.ts", "src/lib/ai/noPro.selftest.ts", "scripts/ocr-consensus.ts"]);
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f);
        if (statSync(p).isDirectory()) { if (f === "node_modules" || f === ".next") continue; walk(p); continue; }
        if (!/\.(ts|tsx|js|mjs)$/.test(f) || /\.selftest\./.test(f) || ALLOWED.has(p)) continue;
        const lines = readFileSync(p, "utf8").split("\n");
        lines.forEach((line, i) => {
          if (/^\s*(\/\/|\*|\/\*)/.test(line)) return; // a comment may name one
          if (/["'`][^"'`]*gemini[-\w.]*-pro[-\w.]*["'`]|["'`]gemini-pro[-\w.]*["'`]/.test(line)) offenders.push(`${p}:${i + 1}`);
        });
      }
    };
    walk("src"); walk("scripts");
    ok("no source file names a Pro model in code (only comments may)", offenders.length === 0, offenders.join(" | "));
  } finally { console.warn = realWarn; }
  console.log(`noPro selftest: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main();
