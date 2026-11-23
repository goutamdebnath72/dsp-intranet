// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/lib/dev/consoleBridge.selftest.ts
// This test covers the browser console written to .browser-console.log (development only).
import { readFileSync, writeFileSync, mkdtempSync, existsSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import vm from "vm";
import { CONSOLE_BRIDGE_SCRIPT, CONSOLE_BRIDGE_URL, cleanEntries, formatEntries, MAX_MESSAGE_CHARS } from "./consoleBridge";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => { if (cond) pass++; else { fail++; console.log(`FAIL ${name} ${extra}`); } };

// ---- the script, run in a stand-in browser
function browser() {
  const nativeCalls: string[] = [];
  const posts: { url: string; body: any; keepalive: boolean }[] = [];
  const timers: (() => void)[] = [];
  const listeners: Record<string, ((e: any) => void)[]> = {};
  const con: any = {};
  for (const l of ["log", "info", "warn", "error", "debug"]) con[l] = (...a: unknown[]) => { nativeCalls.push(l + ":" + a.join(" ")); };
  const win: any = {
    fetch: (url: string, init: any) => { posts.push({ url, body: JSON.parse(init.body), keepalive: init.keepalive }); return Promise.resolve({}); },
    addEventListener: (n: string, f: (e: any) => void) => { (listeners[n] ||= []).push(f); },
  };
  const sandbox: any = { window: win, console: con, document: { visibilityState: "visible", addEventListener: (n: string, f: (e: any) => void) => { (listeners["doc:" + n] ||= []).push(f); } }, location: { pathname: "/home" }, setTimeout: (f: () => void) => { timers.push(f); return timers.length; }, clearTimeout: () => {}, Error, JSON, Array, String, parseInt, parseFloat };
  vm.createContext(sandbox);
  vm.runInContext(CONSOLE_BRIDGE_SCRIPT, sandbox);
  const flush = () => { const t = timers.splice(0); t.forEach((f) => f()); };
  return { con, win, nativeCalls, posts, flush, listeners, sandbox };
}

const b = browser();
b.con.log("hello", 42, { a: 1 });
b.con.warn("careful");
b.con.error("In HTML, <%s> cannot be a descendant of <%s>.", "button", "button");
b.con.log("%cstyled%c text", "color:red", "");
const circ: any = { name: "x" }; circ.self = circ;
b.con.info(circ);
b.con.debug(new Error("boom"), undefined);
ok("the page's own console still works, as before", b.nativeCalls.length === 6 && b.nativeCalls[0] === "log:hello 42 [object Object]");
ok("nothing is sent before the short wait", b.posts.length === 0);
b.flush();
ok("then everything goes to the server in ONE request", b.posts.length === 1 && b.posts[0].url === CONSOLE_BRIDGE_URL && b.posts[0].keepalive === true && b.posts[0].body.entries.length === 6);
const m = b.posts[0].body.entries.map((e: any) => e.m);
const lv = b.posts[0].body.entries.map((e: any) => e.l);
ok("levels are kept", lv.join() === "log,warn,error,log,info,debug");
ok("the page is named", b.posts[0].body.entries.every((e: any) => e.p === "/home"));
ok("an object is written as JSON", m[0] === 'hello 42 {"a":1}');
ok("React's %s placeholders are filled in (the hydration message reads in full)", m[2] === "In HTML, <button> cannot be a descendant of <button>.");
ok("%c styling is dropped, its argument with it", m[3] === "styled text");
ok("a circular object does not break it", /\[Circular\]/.test(m[4]));
ok("an Error carries its stack", /Error: boom/.test(m[5]) && /undefined$/.test(m[5]));
b.listeners["error"][0]({ error: new Error("kaput"), message: "kaput", filename: "app.js", lineno: 7 });
b.listeners["error"][0]({ target: { nodeName: "IMG", src: "http://x/y.png" } });
b.listeners["unhandledrejection"][0]({ reason: new Error("late") });
b.flush();
const m2 = b.posts[1].body.entries.map((e: any) => e.m);
ok("an uncaught error is written with where it happened", /^Uncaught Error: kaput/.test(m2[0]) && /\(app\.js:7\)/.test(m2[0]));
ok("a picture that fails to load is written", m2[1] === "Failed to load <img> http://x/y.png");
ok("an unhandled rejection is written", /^Unhandled promise rejection: Error: late/.test(m2[2]));
b.con.log("[Fast Refresh] rebuilding"); b.con.log("[HMR] connected"); b.con.log("kept after the chatter"); b.flush();
ok("the framework's reload chatter is not written, everything else is", JSON.stringify(b.posts[b.posts.length - 1].body.entries.map((e: any) => e.m)) === JSON.stringify(["kept after the chatter"]));
const sizeBefore = b.posts.length;
b.con.log("x".repeat(20000)); b.flush();
ok("a very long message is cut", b.posts[sizeBefore].body.entries[0].m.length === 4000);
// I check that installing twice does not wrap the console twice
vm.runInContext(CONSOLE_BRIDGE_SCRIPT, b.sandbox);
b.nativeCalls.length = 0; b.con.log("once"); b.flush();
ok("a second install does nothing (a hot reload cannot double the lines)", b.nativeCalls.length === 1 && b.posts[b.posts.length - 1].body.entries.length === 1);

// ---- the server's half
const e1 = cleanEntries({ entries: [{ t: 1, l: "log", p: "/a", m: "ok" }, { t: 2, l: "evil", p: "/a", m: "no" }, { l: "warn", m: 5 }, null, "x", { t: 3, l: "error", p: "/b", m: "y".repeat(10000) }] });
ok("only real entries are kept, and cut to size", e1.length === 2 && e1[1].m.length === MAX_MESSAGE_CHARS);
ok("a body that is not an entry list gives nothing", cleanEntries(null).length === 0 && cleanEntries({ entries: "x" }).length === 0 && cleanEntries(7).length === 0);
const text = formatEntries([{ t: Date.UTC(2026, 10, 22, 10, 0, 0), l: "error", p: "/home", m: "first\nsecond" }, { t: Date.UTC(2026, 10, 22, 10, 0, 1), l: "log", p: "", m: "next" }]);
ok("one line per entry: time, level, page, message; more lines indented", text === "2026-11-22T10:00:00.000Z [error] /home  first\n    second\n2026-11-22T10:00:01.000Z [log] /  next\n");

(async () => {
  const root = process.cwd();
  const dir = mkdtempSync(path.join(tmpdir(), "bridge-"));
  process.chdir(dir);
  const { POST } = await import("@/app/api/dev/console/route");
  const env = process.env as Record<string, string | undefined>;
  const file = path.join(dir, ".browser-console.log");
  const send = (body: unknown) => POST(new Request("http://x/api/dev/console", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) }));
  const prev = env.NODE_ENV;
  env.NODE_ENV = "production";
  const prod = await send({ entries: [{ t: 1, l: "log", p: "/", m: "secret" }] });
  ok("in production the route answers 404 and writes nothing", prod.status === 404 && !existsSync(file));
  env.NODE_ENV = "development";
  writeFileSync(file, "OLD SESSION\n");
  const r1 = await send({ entries: [{ t: Date.UTC(2026, 10, 22), l: "log", p: "/", m: "first of this session" }] });
  ok("the first write of a server process starts the file afresh", r1.status === 204 && !/OLD SESSION/.test(readFileSync(file, "utf8")) && /first of this session/.test(readFileSync(file, "utf8")));
  await send({ entries: [{ t: Date.UTC(2026, 10, 22), l: "warn", p: "/", m: "second" }] });
  const after = readFileSync(file, "utf8");
  ok("later writes are added", /first of this session/.test(after) && /\[warn\] \/  second/.test(after));
  ok("a bad body is refused, not written", (await send("{not json")).status === 400 && (await send({ entries: [] })).status === 204);
  ok("a huge body is refused", (await send("x".repeat(300_000))).status === 413);
  env.NODE_ENV = prev;

  // wiring
  const layout = readFileSync(path.join(root, "src/app/layout.tsx"), "utf8");
  ok("the layout adds the console bridge in development only, in <head> (production gets the error reporter instead)", /<head>[\s\S]{0,300}NODE_ENV === "development" \? CONSOLE_BRIDGE_SCRIPT : CLIENT_ERROR_SCRIPT/.test(layout));
  const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
  ok("npm run dev:log empties the browser log when the server starts", /: > \.browser-console\.log && next dev/.test(pkg.scripts["dev:log"]));
  ok(".browser-console.log is git-ignored (*.log)", /^\*\.log$/m.test(readFileSync(path.join(root, ".gitignore"), "utf8")));
  console.log(`consoleBridge selftest: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
