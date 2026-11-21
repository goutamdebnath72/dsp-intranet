// src/lib/errorLog/scrub.ts
//
// WHAT AN ERROR RECORD MAY CONTAIN (22 Nov 2026). An error message is written by code, but it can carry what the code was holding: an e-mail address, a ticket number, a phone number, a database's "Key (name)=(...) already exists",
// a token in a link. Nothing like that is kept or sent anywhere: it is masked HERE, before the record is stored, grouped, shown to the developer or put in a notice. The text for the AI model is masked further (maskForModel):
// the manual promises that names never go to the model, so quoted words that could be a name are hidden too, and only code locations of the stack are sent.
// Pure functions.

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const BEARER = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi;
const PG_KEY = /Key \(([^)]*)\)=\(([^)]*)\)/g;
const LINK_QUERY = /(https?:\/\/[^\s"'<>)]+?)\?[^\s"'<>)]*/g;
const LONG_DIGITS = /\b\d{7,}\b/g; // phone numbers, long ids
const SIX_DIGITS = /\b[1-9]\d{5}\b/g; // a ticket number, a P.No., a PIN code
const SECRETISH = /\b[A-Za-z0-9_-]{32,}\b/g; // a key, a token, a hash

/** the text with e-mail addresses, numbers that identify a person, link queries, tokens and "Key (x)=(value)" details masked */
export function scrubText(text: unknown, max = 2000): string {
  let t = String(text ?? "");
  t = t.replace(BEARER, "$1 [token]")
    .replace(PG_KEY, "Key ($1)=(#)")
    .replace(EMAIL, "[email]")
    .replace(LINK_QUERY, "$1?…")
    .replace(LONG_DIGITS, "#")
    .replace(SIX_DIGITS, "#")
    .replace(SECRETISH, "[secret]");
  return t.length > max ? t.slice(0, max) + "…" : t;
}

/** a path with no query string and no fragment, at most 200 characters ("/search?q=goutam" becomes "/search") */
export function pathOnly(page: unknown): string {
  const s = String(page ?? "");
  let p = s;
  try { p = /^https?:\/\//i.test(s) ? new URL(s).pathname : s; } catch { p = s; }
  return p.split(/[?#]/)[0].slice(0, 200) || "/";
}

/** quoted words that could be a name, a value or a sentence are hidden; a plain identifier ('map', 'pg-pool', './x') stays, it is what makes an error readable */
export function maskForModel(text: string): string {
  return scrubText(text, 1500).replace(/(['"`])((?:(?!\1).){1,200})\1/g, (m, q: string, inner: string) => {
    const identifier = /^[\w$./@:#-]{1,40}$/.test(inner) && !/^[A-Z]{3,}$/.test(inner) && !/\d{3,}/.test(inner);
    return identifier ? m : `${q}…${q}`;
  });
}

/** the code locations of a stack, without line numbers, hashes or the machine's folders: "at fn (app/api/x/route.js)". At most `n` frames. */
export function stackFrames(stack: unknown, n = 5): string[] {
  const out: string[] = [];
  for (const line of String(stack ?? "").split("\n")) {
    const m = line.match(/^\s*at\s+(?:(.+?)\s+\()?(.+?)(?::\d+){0,2}\)?\s*$/);
    if (!m) continue;
    const fn = (m[1] ?? "").slice(0, 80);
    const file = m[2]
      .replace(/^.*?(?:\.next\/server\/|_next\/static\/|node_modules\/|\/src\/|webpack-internal:\/\/\/\(?[^)]*?\)?\/)/, "")
      .replace(/\?.*$/, "")
      .replace(/-[0-9a-f]{8,}(?=\.|$)/g, "")
      .replace(/^file:\/\//, "")
      .slice(0, 120);
    if (!file || /^node:/.test(file)) continue;
    out.push(fn ? `at ${fn} (${file})` : `at ${file}`);
    if (out.length >= n) break;
  }
  return out;
}

/** what makes two records "the same error": the message without its numbers and quoted values, and the first code location. Hashed by the caller. */
export function fingerprintSource(source: string, message: string, stack?: string): string {
  const m = String(message ?? "")
    .toLowerCase()
    .replace(/(['"`])(?:(?!\1).)*\1/g, "$1…$1")
    .replace(/\d+/g, "#")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
  const top = stackFrames(stack, 1)[0] ?? "";
  return `${source}|${m}|${top}`;
}
