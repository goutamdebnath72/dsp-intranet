// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/lib/perf/switches.selftest.ts </dev/null
// This tests the speed switches (switches.js): every switch must be typed, explained, and READ by the code; and the small cache (ttlMemo.ts) must remember, forget and never keep a failure.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { PERF } from "./switches";
import { ttlMap, ttlMemo } from "./ttlMemo";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };

const js = readFileSync("src/lib/perf/switches.js", "utf8");
const dts = readFileSync("src/lib/perf/switches.d.ts", "utf8");
const keys = Object.keys(PERF);
const declared = [...dts.matchAll(/^\s+(\w+):/gm)].map((m) => m[1]);

ok("every switch has a type in switches.d.ts, and no type is left without a switch", keys.slice().sort().join() === declared.slice().sort().join(), `${keys.join()} | ${declared.join()}`);
ok("every switch is explained by a comment line just above it (what the new way does, and what the previous way was)", keys.every((k) => new RegExp(`/\\*\\*[^\\n]*\\*/\\n\\s+${k}:`).test(js)));
ok("the numbers are not negative and the choices are among those the types allow", ["feedFocusThrottleSeconds", "routerCacheSeconds", "nl2sqlExamplesCacheSeconds", "peopleEventsCacheSeconds"].every((k) => (PERF as any)[k] >= 0) && ["idle", "now"].includes(PERF.searchWindowLoad) && ["pointer", "now"].includes(PERF.guideLoad) && ["pointer", "idle", "now"].includes(PERF.managementPanelsLoad) && ["idle", "now"].includes(PERF.homeWidgetsLoad));

// Every switch must be read somewhere: a switch nobody reads would promise a way back that does nothing.
const files: string[] = [];
const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.(ts|tsx|js)$/.test(f) && !/selftest|switches\.(js|d\.ts)$/.test(f)) files.push(p); } };
walk("src"); files.push("next.config.js");
const text = files.map((f) => readFileSync(f, "utf8")).join("\n");
const unread = keys.filter((k) => !new RegExp(`PERF\\.${k}\\b`).test(text));
ok("every switch is read by the code (next.config.js or src)", unread.length === 0, unread.join());
ok("next.config.js reads the same file as the app (CommonJS require), and the browser minify switch is the one it reads", /require\("\.\/src\/lib\/perf\/switches\.js"\)/.test(readFileSync("next.config.js", "utf8")) && /isServer \|\| !PERF\.minifyBrowserCode/.test(readFileSync("next.config.js", "utf8")));

// ttlMemo
(async () => {
  let loads = 0; let ttl = 60;
  const memo = ttlMemo(() => ttl, async (x: number) => { loads++; return x * 2; });
  await memo(1); await memo(2);
  ok("a remembered value is returned without loading again", loads === 1);
  ttl = 0; await memo(3); await memo(3);
  ok("0 seconds = no memory at all: every call loads (the previous way)", loads === 3);
  let n = 0; const flaky = ttlMemo(() => 60, async () => { n++; if (n === 1) throw new Error("down"); return n; });
  let threw = false; try { await flaky(); } catch { threw = true; }
  ok("a failed load is never kept: the next call tries again and is then remembered", threw && (await flaky()) === 2 && (await flaky()) === 2);
  const short = ttlMemo(() => 0.05, async () => ++loads);
  const a = await short(); await new Promise((r) => setTimeout(r, 90)); const b = await short();
  ok("an old value is loaded again", a !== b);

  // ttlMap
  let seconds = 60; const map = ttlMap<string>(() => seconds, 3);
  map.set("a", "1"); map.set("b", "2"); map.set("c", "3"); map.set("d", "4");
  ok("the map keeps at most `max` values, the oldest leaving first", map.get("a") === undefined && map.get("d") === "4" && map.get("b") === "2");
  seconds = 0; map.set("e", "5");
  ok("0 seconds = nothing is kept or returned", map.get("e") === undefined && map.get("d") === undefined);
  seconds = 0.05; map.set("f", "6"); await new Promise((r) => setTimeout(r, 90));
  ok("an old entry is forgotten", map.get("f") === undefined);

  // The router: a test's own model text is never answered from memory.
  const { parseQueryWithLlm } = await import("@/lib/search/pureAiEngine");
  let calls = 0;
  const llm = async () => { calls++; return JSON.stringify({ tool: "circulars", params: {}, reasoning: "x" }); };
  await parseQueryWithLlm("leave rules for contract workers please", { llm });
  await parseQueryWithLlm("leave rules for contract workers please", { llm });
  ok("a question routed with a supplied model text is asked each time (the memory is only for the real model)", calls === 2, String(calls));

  console.log(`perf switches selftest: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
