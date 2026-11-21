// src/lib/dev/consoleBridge.ts
//
// THE BROWSER'S CONSOLE, IN A FILE (the owner, 22 Nov 2026). While the app runs in DEVELOPMENT, everything the page writes to the browser's console (log, info, warn, error, debug), every uncaught error, every
// unhandled promise rejection and every picture or script that fails to load is sent to the server, which appends it to `.browser-console.log` in the project folder: the same idea as `.dev-server.log` for the terminal,
// so the whole picture (terminal AND browser) can be read from two files. The file is started afresh whenever the dev server starts (npm run dev:log empties it; the route empties it at its first write too).
// NOTHING OF THIS EXISTS IN PRODUCTION: the layout does not add the script, and the route answers 404.
//
// The script is plain text that the root layout puts in <head> (so it is running BEFORE React hydrates: a hydration error is written during hydration, a script that waits for a component would miss it).
// It keeps its own copy of the page's `console` methods and calls them first, so the browser's console looks exactly as before. Only Next's "[Fast Refresh]" and "[HMR]" lines are left out of the file (reload chatter).

import { DateTime } from "luxon";

export const CONSOLE_BRIDGE_URL = "/api/dev/console";

/** the script that goes into <head> (development only) */
export const CONSOLE_BRIDGE_SCRIPT = `(function(){
  if (window.__dspConsoleBridge) return; window.__dspConsoleBridge = true;
  var URL_ = ${JSON.stringify(CONSOLE_BRIDGE_URL)}, MAX_MSG = 4000, BATCH_CHARS = 30000;
  var nativeFetch = window.fetch ? window.fetch.bind(window) : null;
  var queue = [], timer = null;
  function one(v, depth) {
    try {
      if (typeof v === "string") return v;
      if (v === undefined) return "undefined";
      if (typeof v === "function") return "[Function " + (v.name || "anonymous") + "]";
      if (v instanceof Error) return v.stack || (v.name + ": " + v.message);
      if (v && typeof v === "object" && typeof v.nodeType === "number" && v.nodeName) return "[" + v.nodeName + (v.id ? "#" + v.id : "") + "]";
      if (v && typeof v === "object") {
        var seen = [];
        return JSON.stringify(v, function (k, x) {
          if (typeof x === "function") return "[Function]";
          if (x instanceof Error) return x.stack || x.message;
          if (x && typeof x === "object") { if (seen.indexOf(x) >= 0) return "[Circular]"; seen.push(x); }
          return x;
        });
      }
      return String(v);
    } catch (e) { try { return String(v); } catch (e2) { return "[unprintable]"; } }
  }
  function format(args) {
    var a = Array.prototype.slice.call(args), out = "", i = 1;
    if (typeof a[0] === "string" && /%[sdifoOjc]/.test(a[0])) {
      out = a[0].replace(/%([sdifoOjc%])/g, function (m, c) {
        if (c === "%") return "%";
        if (i >= a.length) return m;
        var x = a[i++];
        if (c === "c") return "";
        if (c === "d" || c === "i") return String(parseInt(x, 10));
        if (c === "f") return String(parseFloat(x));
        return one(x);
      });
    } else { out = a.length ? one(a[0]) : ""; }
    for (; i < a.length; i++) out += " " + one(a[i]);
    return out;
  }
  function flush() {
    timer = null;
    if (!queue.length || !nativeFetch) { queue = []; return; }
    var batch = [], size = 0;
    while (queue.length && size < BATCH_CHARS) { var e = queue.shift(); size += e.m.length + 60; batch.push(e); }
    try { nativeFetch(URL_, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ entries: batch }), keepalive: true }).catch(function () {}); } catch (e2) {}
    if (queue.length) timer = setTimeout(flush, 50);
  }
  function push(level, message) {
    try {
      if (/^\\[(Fast Refresh|HMR)\\]/.test(message)) return; // the framework's own reload chatter: nothing to diagnose, and it buries the rest
      if (queue.length > 500) queue.shift();
      queue.push({ t: Date.now(), l: level, p: location.pathname, m: String(message).slice(0, MAX_MSG) });
      if (!timer) timer = setTimeout(flush, 300);
    } catch (e) {}
  }
  ["log", "info", "warn", "error", "debug"].forEach(function (level) {
    var native = console[level];
    console[level] = function () { push(level, format(arguments)); return native.apply(console, arguments); };
  });
  window.addEventListener("error", function (ev) {
    var t = ev && ev.target;
    if (t && t !== window && t.nodeName) { push("error", "Failed to load <" + String(t.nodeName).toLowerCase() + "> " + (t.src || t.href || "")); return; }
    push("error", "Uncaught " + ((ev.error && (ev.error.stack || ev.error.message)) || ev.message) + (ev.filename ? " (" + ev.filename + ":" + ev.lineno + ")" : ""));
  }, true);
  window.addEventListener("unhandledrejection", function (ev) { push("error", "Unhandled promise rejection: " + one(ev.reason)); });
  window.addEventListener("pagehide", function () { if (timer) clearTimeout(timer); flush(); });
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") { if (timer) clearTimeout(timer); flush(); } });
})();`;

// ---- the server's half: what a request becomes in the file ----------------------------------------------------

export interface ConsoleEntry { t: number; l: string; p: string; m: string }
const LEVELS = new Set(["log", "info", "warn", "error", "debug"]);
export const MAX_ENTRIES_PER_REQUEST = 200;
export const MAX_MESSAGE_CHARS = 4000;
export const MAX_BODY_CHARS = 250_000;
/** the file is started afresh when it grows past this (about 5 MB) */
export const MAX_FILE_BYTES = 5 * 1024 * 1024;

/** the entries of a request body, checked and cut to size; anything that is not an entry is dropped */
export function cleanEntries(body: unknown): ConsoleEntry[] {
  const raw = body && typeof body === "object" ? (body as { entries?: unknown }).entries : null;
  if (!Array.isArray(raw)) return [];
  const out: ConsoleEntry[] = [];
  for (const e of raw.slice(0, MAX_ENTRIES_PER_REQUEST)) {
    if (!e || typeof e !== "object") continue;
    const { t, l, p, m } = e as Record<string, unknown>;
    if (typeof m !== "string" || typeof l !== "string" || !LEVELS.has(l)) continue;
    out.push({ t: typeof t === "number" && Number.isFinite(t) ? t : DateTime.now().toMillis(), l, p: typeof p === "string" ? p.slice(0, 200) : "", m: m.slice(0, MAX_MESSAGE_CHARS) });
  }
  return out;
}

/** one line per entry: the time, the level, the page, then the message (a message of several lines keeps its lines, indented, so the next entry is easy to find) */
export function formatEntries(entries: ConsoleEntry[]): string {
  return entries
    .map((e) => {
      const time = DateTime.fromMillis(e.t, { zone: "utc" }).toISO();
      const lines = e.m.split("\n");
      return `${time} [${e.l}] ${e.p || "/"}  ${lines[0]}${lines.length > 1 ? "\n" + lines.slice(1).map((x) => "    " + x).join("\n") : ""}`;
    })
    .join("\n") + (entries.length ? "\n" : "");
}
