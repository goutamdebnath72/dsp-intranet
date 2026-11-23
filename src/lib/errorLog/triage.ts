// src/lib/errorLog/triage.ts
//
// HOW SERIOUS IS THIS ERROR (22 Nov 2026). Three ranks: SERIOUS (something of the application is broken for people: the developer is told at once), MINOR (a real fault that does little harm, or a one-off: in the daily digest), NOISE (not the
// application's fault: a browser extension, a lost connection, a resize loop: kept, counted, never announced).
// First a fixed list of patterns decides what is certain (free, instant, the same every time). Only an error nobody has classified goes to the AI model, once per distinct error, at most 20 an hour, with the text masked
// (scrub.ts maskForModel: no names, numbers or e-mail, only code locations of the stack). If the model is not there or answers badly I leave the error UNRATED and show it in the digest, never dropped.
// Pure apart from the model call, which is passed in.

import { maskForModel, stackFrames } from "./scrub";

export type Severity = "serious" | "minor" | "noise";
export interface Verdict { severity: Severity; note: string; by: "rule" | "ai" }
export interface ErrorFacts { source: "browser" | "server"; message: string; stack?: string; page?: string }

const NOISE: Array<[RegExp, string]> = [
  [/ResizeObserver loop/i, "A harmless browser layout notice (ResizeObserver)."],
  [/^Script error\.?$/im, "A script error from another origin: the browser hides the detail; not the application's code."],
  [/(chrome|moz|safari|edge)-extension:\/\//i, "Raised by a browser extension on the person's machine."],
  [/Non-Error promise rejection captured/i, "A library rejected with a plain value; no fault of the application."],
  [/\b(Failed to fetch|NetworkError|Network request failed|Load failed|The network connection was lost|net::ERR_|AbortError|The operation was aborted|The user aborted)/i, "A lost or cancelled connection on the person's side."],
];
const MINOR: Array<[RegExp, string]> = [
  [/ChunkLoadError|Loading chunk [\w-]+ failed|Failed to fetch dynamically imported module|Importing a module script failed/i, "A page file could not be loaded, usually just after a new version went live; a reload fixes it."],
];
const SERIOUS: Array<[RegExp, string]> = [
  [/DriverPackageNotInstalled|Postgres package has not been found|Cannot find module/i, "A package is missing from the deployed function: part of the application is down."],
  [/ECONNREFUSED|ENOTFOUND|password authentication failed|too many clients|remaining connection slots|Connection terminated|connection timeout|timeout expired|sorry, too many clients/i, "The database cannot be reached or refuses the application."],
  [/relation ".*" does not exist|column ".*" does not exist|function .* does not exist|permission denied for/i, "The database is missing a table, column or function the code needs, or refuses it: a migration may not have been run."],
  [/JavaScript heap out of memory|ENOSPC|FUNCTION_INVOCATION_TIMEOUT|FUNCTION_INVOCATION_FAILED/i, "The server ran out of memory, disk or time."],
];

/** This is the pattern list: it gives a verdict when it is certain, and null when a person or the model has to look. */
export function ruleVerdict(e: ErrorFacts): Verdict | null {
  const text = `${e.message}\n${e.stack ?? ""}`;
  for (const [re, note] of SERIOUS) if (re.test(text)) return { severity: "serious", note, by: "rule" };
  for (const [re, note] of NOISE) if (re.test(text)) return { severity: "noise", note, by: "rule" };
  for (const [re, note] of MINOR) if (re.test(text)) return { severity: "minor", note, by: "rule" };
  return null;
}

export function triagePrompt(e: ErrorFacts): string {
  return [
    "You triage runtime errors of a company intranet web application (Next.js, React, PostgreSQL) for its one developer.",
    "Decide how serious ONE error is:",
    '  "serious": something of the application is broken for people (a page or feature fails, data cannot be read or saved, the server or database is failing, a crash on load);',
    '  "minor": a real fault with little harm, a rare edge case, or a one-off;',
    '  "noise": not the application\'s fault (a browser extension, a lost connection, a harmless browser notice).',
    "When unsure between two ranks, choose the MORE serious one. Do not guess a cause you cannot see.",
    'Answer with JSON only: {"severity":"serious|minor|noise","note":"ONE plain sentence for the developer: what it means and where to look"}.',
    "",
    `Where it happened: ${e.source === "browser" ? "in a person's browser" : "on the server"}${e.page ? `, page ${e.page}` : ""}`,
    `Message: ${maskForModel(e.message).split("\n")[0]}`,
    `Code locations: ${stackFrames(e.stack, 5).join(" | ") || "(none)"}`,
  ].join("\n");
}

/** Returns the model's reply as a verdict, or null when it is not one. */
export function parseVerdict(text: string): Verdict | null {
  try {
    const j = JSON.parse(String(text).replace(/^```(?:json)?|```$/gim, "").trim());
    const s = String(j?.severity ?? "").toLowerCase();
    if (s !== "serious" && s !== "minor" && s !== "noise") return null;
    const note = String(j?.note ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
    return { severity: s, note: note || "(no note)", by: "ai" };
  } catch {
    return null;
  }
}

export async function aiVerdict(e: ErrorFacts, ask: (prompt: string) => Promise<string>): Promise<Verdict | null> {
  try {
    return parseVerdict(await ask(triagePrompt(e)));
  } catch {
    return null;
  }
}
