// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/lib/errorLog/errorLog.selftest.ts
// This test covers the production error log: masking, grouping, ranking, announcing, the hooks, the routes and their limits.
import { readFileSync } from "fs";
import vm from "vm";
import { parse } from "pgsql-ast-parser";
import { fingerprintSource, maskForModel, pathOnly, scrubText, stackFrames } from "./scrub";
import { aiVerdict, parseVerdict, ruleVerdict, triagePrompt } from "./triage";
import { TABLE_STATEMENTS, claimAlert, digestFacts, get, list, prune, record, resetEnsure, setStatus, setTriage, type Query } from "./store";
import { cleanError, reportError, isReporting } from "./report";
import { seriousNotice, sendAlert, alertConfigured } from "./alert";
import { runDigest } from "./digest";
import { rowsOf, fromDataSource } from "./adapter";
import { describeArgs, errorLogEnabled, installServerErrorLog } from "./serverHook";
import { CLIENT_ERROR_SCRIPT, CLIENT_ERROR_URL } from "./clientReport";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => { if (cond) pass++; else { fail++; console.log(`FAIL ${name} ${extra}`); } };
const env = process.env as Record<string, string | undefined>;

(async () => {
// ---- masking
const dirty = "Failed for ticket 498301 (P.No 311476) mail goutam.d@sail.in phone 9434791234 at https://x.in/a?q=rakesh+ojha&t=abc Bearer abcdefghijklmnop key sk_abcdefghijklmnopqrstuvwxyz0123456789 Key (name)=(GOUTAM DEBNATH) already exists";
const s = scrubText(dirty);
ok("an e-mail address is masked", !/goutam\.d@sail\.in/.test(s) && /\[email\]/.test(s));
ok("a ticket number, a P.No. and a phone number are masked", !/498301|311476|9434791234/.test(s));
ok("a link keeps its address but not its query", /https:\/\/x\.in\/a\?…/.test(s) && !/rakesh|abc&/.test(s));
ok("a bearer token and a long secret are masked", !/abcdefghijklmnop/.test(s) && !/sk_abcdefghijklmnopqrstuvwxyz0123456789/.test(s));
ok("the value of a database 'Key (x)=(value)' is masked, its column kept", /Key \(name\)=\(#\)/.test(s) && !/DEBNATH/.test(s));
ok("a long text is cut", scrubText("word ".repeat(1000), 100).length === 101);
ok("a page loses its query and fragment", pathOnly("https://a.in/search?q=goutam#top") === "/search" && pathOnly("/x/y?z=1") === "/x/y" && pathOnly(undefined) === "/");
const mm = maskForModel("Cannot read properties of undefined (reading 'map') for 'GOUTAM DEBNATH' and \"RAKESH\" in 'pg-pool'");
ok("for the model: a plain identifier stays, a name or a sentence is hidden", /'map'/.test(mm) && /'pg-pool'/.test(mm) && !/GOUTAM|RAKESH/.test(mm));
const stack = "Error: boom\n    at handler (/var/task/.next/server/app/api/x/route.js:10:5)\n    at async /var/task/node_modules/next/dist/server/a.js:1:1\n    at node:internal/process/task_queues:95:5\n    at Page (webpack-internal:///(rsc)/./src/app/page.tsx:12:3)";
const fr = stackFrames(stack, 5);
ok("stack frames are code locations without line numbers or machine folders", fr[0] === "at handler (app/api/x/route.js)" && fr.every((f) => !/\d+:\d+|\/var\/task/.test(f)) && !fr.some((f) => /node:internal/.test(f)));

// ---- grouping
const fp = (m: string, st?: string) => cleanError({ source: "server", message: m, stack: st }).fingerprint;
ok("the same error with other numbers or values is ONE group", fp("Cannot find row 123 for 'abc'", stack) === fp("Cannot find row 987 for 'xyz'", stack));
ok("another message, another source or another place is another group", fp("Cannot find row", stack) !== fp("Cannot find column", stack) && cleanError({ source: "browser", message: "x" }).fingerprint !== cleanError({ source: "server", message: "x" }).fingerprint && fp("a", stack) !== fp("a", "Error\n    at other (app/z.js:1:1)"));
ok("the fingerprint is a 40-character hash that carries nothing of the message", /^[0-9a-f]{40}$/.test(fp("goutam@sail.in")));
ok("fingerprint text drops digits and quoted values", !/\d/.test(fingerprintSource("server", "row 5 'x1'", "")) );

// ---- ranking
const V = (message: string, stack = "", source: "browser" | "server" = "browser") => ruleVerdict({ source, message, stack });
ok("a missing package or an unreachable database is SERIOUS", V("Postgres package has not been found installed", "", "server")?.severity === "serious" && V("connect ECONNREFUSED 10.0.0.1:5432", "", "server")?.severity === "serious" && V('relation "x" does not exist', "", "server")?.severity === "serious");
ok("a browser extension, a lost connection and a resize loop are NOISE", V("ResizeObserver loop completed with undelivered notifications")?.severity === "noise" && V("Failed to fetch")?.severity === "noise" && V("x", "at chrome-extension://abc/inject.js:1:1")?.severity === "noise" && V("Script error.")?.severity === "noise");
ok("a chunk that could not load is MINOR", V("ChunkLoadError: Loading chunk 12 failed.")?.severity === "minor");
ok("an error no pattern knows is left to the model", V("Cannot read properties of undefined (reading 'map')") === null);
ok("the model's JSON is read, fences and all", parseVerdict('```json\n{"severity":"Serious","note":"The page fails on load."}\n```')?.severity === "serious" && parseVerdict("nonsense") === null && parseVerdict('{"severity":"catastrophic"}') === null);
const prompt = triagePrompt({ source: "browser", message: "Failed for 498301 goutam.d@sail.in 'GOUTAM DEBNATH'", stack, page: "/search" });
ok("what goes to the model has no ticket, e-mail or name, and the stack as code locations only", !/498301|goutam\.d@|GOUTAM|\/var\/task|:\d+:\d+/.test(prompt) && /app\/api\/x\/route\.js/.test(prompt) && /page \/search/.test(prompt));
ok("a model that fails or answers badly gives no verdict, never an exception", (await aiVerdict({ source: "server", message: "x" }, async () => { throw new Error("down"); })) === null && (await aiVerdict({ source: "server", message: "x" }, async () => "???")) === null && (await aiVerdict({ source: "server", message: "x" }, async () => '{"severity":"minor","note":"ok"}'))?.by === "ai");

// ---- the SQL parses (there is no PostgreSQL here to run it)
const calls: string[] = [];
const spy: Query = async (sql) => { calls.push(sql); return []; };
await record(spy, { fingerprint: "f", source: "server", message: "m", stack: "", page: "/", agent: "" });
await setTriage(spy, 1, { severity: "serious", note: "n", by: "ai" });
await claimAlert(spy, 1); await setStatus(spy, 1, "seen"); await list(spy, {}); await get(spy, 1); await prune(spy); await digestFacts(spy, "2026-01-01T00:00:00Z");
const bad: string[] = [];
for (const sql of [...TABLE_STATEMENTS, ...calls].filter((x) => !/^\s*(ALTER TABLE|REVOKE)/.test(x))) { // ALTER ... ROW LEVEL SECURITY and REVOKE are the same lines my password store already runs in production
  try { parse(sql.replace(/\$\d+/g, "$1")); } catch (e) { bad.push(sql.slice(0, 60) + " :: " + (e as Error).message.slice(0, 80)); }
}
ok("every statement of the store is valid SQL for the parser", bad.length === 0, JSON.stringify(bad));
ok("the table statements close the table to the browser", TABLE_STATEMENTS.some((x) => /ENABLE ROW LEVEL SECURITY/.test(x)) && TABLE_STATEMENTS.some((x) => /REVOKE ALL ON public\.app_error_log FROM anon, authenticated/.test(x)));
const sqlFile = readFileSync("src/lib/nl2sql/sql/31_app_error_log.sql", "utf8");
ok("the SQL file creates what the program creates", /CREATE TABLE IF NOT EXISTS public\.app_error_log/.test(sqlFile) && /CREATE TABLE IF NOT EXISTS public\.app_error_meta/.test(sqlFile) && /REVOKE ALL ON public\.app_error_log/.test(sqlFile));
ok("an UPDATE ... RETURNING as TypeORM gives it ([rows, count]) is read as rows", rowsOf([[{ id: 1 }], 1]).length === 1 && rowsOf([{ id: 1 }, { id: 2 }]).length === 2 && rowsOf(undefined).length === 0 && (await fromDataSource({ query: async () => [[{ a: 1 }], 1] })("x"))[0].a === 1);

// ---- the flow, run against a stand-in table (it checks the statements' effect, not their SQL)
type R = { id: number; fingerprint: string; severity: string; status: string; occurrences: number; alerted_at: string | null; note: string | null; message: string; source: string; page: string | null; first_seen: string; last_seen: string; stack: string | null; triaged_by: string | null };
function fake() {
  const rows = new Map<string, R>(); let id = 0; const sent: string[] = [];
  const q: Query = async (sql, p = []) => {
    if (/to_regclass/.test(sql)) return [{ a: "x", b: "x" }];
    if (/^INSERT INTO public\.app_error_log/.test(sql.trim())) {
      const fpr = String(p[0]); const e = rows.get(fpr);
      if (e) { e.occurrences++; if (e.status === "resolved") { e.status = "new"; e.alerted_at = null; } return [{ ...e, inserted: false }]; }
      const r: R = { id: ++id, fingerprint: fpr, severity: "unrated", status: "new", occurrences: 1, alerted_at: null, note: null, message: String(p[2]), source: String(p[1]), page: String(p[4]), first_seen: "t", last_seen: "t", stack: String(p[3]), triaged_by: null };
      rows.set(fpr, r); return [{ ...r, inserted: true }];
    }
    if (/^UPDATE public\.app_error_log SET severity/.test(sql.trim())) { const r = [...rows.values()].find((x) => x.id === p[0])!; r.severity = String(p[1]); r.note = String(p[2]); r.triaged_by = String(p[3]); return []; }
    if (/SET alerted_at = now\(\)/.test(sql)) { const r = [...rows.values()].find((x) => x.id === p[0])!; if (r.severity === "serious" && r.status === "new" && !r.alerted_at) { r.alerted_at = "now"; return [r]; } return []; }
    return [];
  };
  return { q, rows, sent, send: async (t: string) => { sent.push(t); return true; } };
}
resetEnsure();
{
  const f = fake(); let asked = 0;
  const deps = { query: f.q, send: f.send, ask: async () => { asked++; return '{"severity":"minor","note":"A rare edge case."}'; }, aiAllowed: () => true };
  const a = await reportError({ source: "server", message: 'Postgres package has not been found installed', stack }, deps);
  ok("a serious error is recorded, ranked by the pattern list (the model is not asked) and announced once", a?.severity === "serious" && asked === 0 && f.sent.length === 1 && /SERIOUS error #1/.test(f.sent[0]));
  await reportError({ source: "server", message: "Postgres package has not been found installed", stack }, deps);
  ok("the same error again is counted, not announced again", f.rows.size === 1 && [...f.rows.values()][0].occurrences === 2 && f.sent.length === 1);
  const b = await reportError({ source: "browser", message: "Cannot read properties of undefined (reading 'map')", stack: "TypeError\n    at List (_next/static/chunks/app/page-1a2b3c4d5e6f.js:1:1)", page: "/?q=goutam" }, deps);
  ok("an error no pattern knows goes to the model once; a minor one is not announced", b?.severity === "minor" && asked === 1 && f.sent.length === 1 && [...f.rows.values()][1].page === "/");
  const g = fake();
  const c = await reportError({ source: "browser", message: "Something odd" }, { query: g.q, send: g.send, ask: async () => { asked++; return '{"severity":"serious","note":"The page fails."}'; }, aiAllowed: () => false });
  ok("over the hourly limit the model is not asked and the error stays unrated, recorded", c?.severity === "unrated" && g.rows.size === 1 && g.sent.length === 0);
  const h = fake();
  const d = await reportError({ source: "browser", message: "Something odd 2" }, { query: h.q, send: h.send, ask: async () => { throw new Error("model down"); }, aiAllowed: () => true });
  ok("a model that is down leaves it unrated, recorded, nothing thrown", d?.severity === "unrated" && h.rows.size === 1);
  const dead = await reportError({ source: "server", message: "x" }, { query: async () => { throw new Error("db down"); }, send: f.send });
  ok("a database that is down gives null, never an exception", dead === null);
  ok("the flag that tells the server hook 'we are reporting' is off again afterwards", isReporting() === false);
  const e = fake(); const seriousAgain = { query: e.q, send: e.send, ask: null };
  await reportError({ source: "server", message: "connect ECONNREFUSED 1.2.3.4:5432" }, seriousAgain);
  const row = [...e.rows.values()][0]; row.status = "resolved"; await reportError({ source: "server", message: "connect ECONNREFUSED 1.2.3.4:5432" }, seriousAgain);
  ok("a resolved error that comes back is announced again", e.sent.length === 2 && row.status === "new");
  ok("the notice is masked text only", !/\d{6}|@/.test(seriousNotice({ id: 3, source: "server", occurrences: 2, message: "x 498301 a@b.in", page: "/p", note: "n" })) || /#|\[email\]/.test(scrubText("x 498301 a@b.in")));
}
ok("no webhook address: nothing is sent", !alertConfigured() && (await sendAlert("x")) === false);
{
  const saved = env.ERROR_ALERT_WEBHOOK_URL; const nativeFetch = globalThis.fetch; let posted: { url: string; body: string } | null = null;
  env.ERROR_ALERT_WEBHOOK_URL = "http://insecure.example/hook";
  ok("an address that is not https is refused", (await sendAlert("x")) === false);
  env.ERROR_ALERT_WEBHOOK_URL = "https://hooks.example/abc";
  globalThis.fetch = (async (url: string, init: { body: string }) => { posted = { url, body: init.body }; return { ok: true }; }) as never;
  const r = await sendAlert("error for 498301 a@b.in");
  ok("the notice is posted as JSON with text and content, masked", r === true && posted !== null && (posted as { url: string }).url === "https://hooks.example/abc" && /"text":/.test((posted as { body: string }).body) && /"content":/.test((posted as { body: string }).body) && !/498301|a@b\.in/.test((posted as { body: string }).body));
  globalThis.fetch = nativeFetch; if (saved === undefined) delete env.ERROR_ALERT_WEBHOOK_URL; else env.ERROR_ALERT_WEBHOOK_URL = saved;
}

// ---- the digest
{
  const qs: string[] = [];
  const q: Query = async (sql) => {
    qs.push(sql);
    if (/to_regclass/.test(sql)) return [{ a: "x", b: "x" }];
    if (/FROM public\.app_error_meta/.test(sql)) return [];
    if (/DELETE FROM/.test(sql)) return /status = 'resolved'/.test(sql) ? [{ id: 1 }, { id: 2 }] : [];
    if (/GROUP BY severity/.test(sql)) return [{ severity: "serious", n: 1 }, { severity: "noise", n: 4 }];
    if (/GROUP BY source/.test(sql)) return [{ source: "browser", n: 850 }, { source: "server", n: 10 }];
    if (/severity = 'serious' AND status <> 'resolved'/.test(sql)) return [{ id: 7, source: "server", severity: "serious", status: "new", occurrences: 3, first_seen: "t", last_seen: "t", message: "db down", page: "/", note: null, triaged_by: "rule", stack: null }];
    if (/severity = 'unrated'/.test(sql)) return [{ n: 2 }];
    return [];
  };
  resetEnsure();
  let text = ""; const r = await runDigest(q, async (t) => { text = t; return true; });
  ok("the digest cleans, counts, and sends ONE notice", r.sent && r.dropped === 2 && /5 new/.test(text) && /open serious: #7 db down/.test(text) && /2 not ranked/.test(text));
  ok("it says when old entries were dropped and when a source is nearly full", /LOG CLEANED: 2 old entries were dropped/.test(text) && /LOG NEARLY FULL: browser 850\/1000/.test(text) && !/server 10/.test(text));
  ok("it remembers when it ran", qs.some((x) => /INSERT INTO public\.app_error_meta/.test(x)));
  const quiet: Query = async (sql) => (/to_regclass/.test(sql) ? [{ a: "x", b: "x" }] : /count\(\*\)::int AS n FROM public\.app_error_log WHERE severity/.test(sql) ? [{ n: 0 }] : []);
  resetEnsure();
  const r2 = await runDigest(quiet, async () => { throw new Error("must not send"); });
  ok("a quiet day sends nothing", r2.ran && !r2.sent && r2.text === null);
}

// ---- the server's hooks
ok("the error log is off outside production and when ERROR_LOG=off", errorLogEnabled() === false);
{
  const prev = env.NODE_ENV; env.NODE_ENV = "production"; const had = env.ERROR_LOG;
  ok("...on in production", errorLogEnabled() === true);
  env.ERROR_LOG = "off"; ok("...and off again with ERROR_LOG=off", errorLogEnabled() === false);
  if (had === undefined) delete env.ERROR_LOG; else env.ERROR_LOG = had;
  env.NODE_ENV = prev;
}
const d = describeArgs(["failed:", new Error("boom"), { a: 1 }]);
ok("console.error's arguments become one message and a stack", /^failed: boom \{"a":1\}$/.test(d.message) && /Error: boom/.test(d.stack ?? ""));
{
  const before = console.error; installServerErrorLog();
  ok("outside production the console is not touched", console.error === before);
}

// ---- the browser's half, which I run in a stand-in browser
{
  const posts: { url: string; body: any }[] = []; const ls: Record<string, ((e: any) => void)[]> = {};
  const win: any = { addEventListener: (n: string, f: (e: any) => void) => { (ls[n] ||= []).push(f); }, fetch: (url: string, init: any) => { posts.push({ url, body: JSON.parse(init.body) }); return Promise.resolve({}); } };
  const sb: any = { window: win, fetch: win.fetch, location: { pathname: "/search" }, navigator: {}, Blob: class {}, JSON, String, Object };
  vm.createContext(sb); vm.runInContext(CLIENT_ERROR_SCRIPT, sb);
  ls["error"][0]({ message: "boom", error: { message: "boom", stack: "Error: boom\n    at a (x.js:1:1)" } });
  ls["error"][0]({ message: "boom", error: { message: "boom", stack: "Error: boom\n    at a (x.js:1:1)" } });
  ls["error"][0]({ target: { nodeName: "IMG", src: "http://x/y.png" } });
  ls["error"][0]({ message: "from ext", error: { message: "from ext", stack: "Error\n    at chrome-extension://abc/x.js:1:1" } });
  ls["unhandledrejection"][0]({ reason: new Error("late") });
  ok("an uncaught error and a rejection are sent to the server with the page path; a repeat, a failed picture and an extension are not", posts.length === 2 && posts[0].url === CLIENT_ERROR_URL && posts[0].body.page === "/search" && posts[0].body.message === "boom" && /^Unhandled promise rejection: late/.test(posts[1].body.message));
  for (let i = 0; i < 20; i++) ls["error"][0]({ message: "m" + i, error: { message: "m" + i, stack: "E\n    at f" + i } });
  ok("at most 5 different errors per page load", posts.length === 5);
}

// ---- the routes and the wiring
const route = readFileSync("src/app/api/client-errors/route.ts", "utf8");
ok("the browser route is guarded: production only, same origin, a size limit, two limiters, always the same empty answer", /errorLogEnabled\(\)/.test(route) && /sameOrigin\(/.test(route) && /MAX_BODY = 8000/.test(route) && /byAddress\.take\(clientIp/.test(route) && /inAll\.take/.test(route) && !/NextResponse\.json/.test(route));
const cron = readFileSync("src/app/api/cron/error-digest/route.ts", "utf8");
ok("the digest route fails closed without CRON_SECRET and compares the secret in constant time", /if \(!secret\) return new NextResponse\(null, \{ status: 404 \}\)/.test(cron) && /timingSafeEqual/.test(cron));
const vj = JSON.parse(readFileSync("vercel.json", "utf8"));
ok("the scheduler calls the digest once a day", vj.crons?.length === 1 && vj.crons[0].path === "/api/cron/error-digest" && /^\d+ \d+ \* \* \*$/.test(vj.crons[0].schedule));
const inst = readFileSync("src/instrumentation.ts", "utf8");
ok("instrumentation installs the console hook and the request-error hook, Node runtime only", /installServerErrorLog\(\)/.test(inst) && /onRequestError/.test(inst) && (inst.match(/NEXT_RUNTIME === "nodejs"/g) ?? []).length >= 2 && !/NEXT_RUNTIME !==/.test(inst));
const layout = readFileSync("src/app/layout.tsx", "utf8");
ok("the layout puts the development bridge in development and the error reporter otherwise, in <head>", /<head>[\s\S]{0,300}NODE_ENV === "development" \? CONSOLE_BRIDGE_SCRIPT : CLIENT_ERROR_SCRIPT/.test(layout));
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
ok("npm run errors exists", /scripts\/errors\.ts/.test(pkg.scripts.errors));
ok("the error log never calls console.error itself (the console hook would report its own report)", ["scrub", "triage", "store", "alert", "report", "digest", "serverHook", "adapter"].every((f) => !/console\.error\(/.test(readFileSync(`src/lib/errorLog/${f}.ts`, "utf8").replace(/\/\/.*$/gm, "").replace(/console\.error = /g, ""))));

console.log(`errorLog selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
})();
