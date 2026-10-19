/**
 * Self-test of the omnibar's login/summary hints after the Executive Deep Synthesis BUTTON was removed (step 41a).
 * Run: npx tsx --tsconfig tsconfig.json src/lib/search/loginHints.selftest.ts
 */
import { decideLoginHint, looksAnalytical, looksLikeLookup, type HintInput } from "./loginHints";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };

const base: HintInput = { query: "why was the gift card amount corrected after the first announcement", authenticated: false, isExecutive: false, mode: "semantic", circularShown: true, answerCardShown: false };
const hint = (o: Partial<HintInput>) => decideLoginHint({ ...base, ...o });

// the question really is an explanatory one for these cases
ok("the sample question is explanatory", looksAnalytical(base.query));

// signed out: told to sign in if an executive
const guest = hint({});
ok("a signed-out visitor with an explanatory question answered by circular cards is told to sign in if an executive", guest?.kind === "synthesis" && /sign in/i.test(guest.text) && /executive/i.test(guest.text), JSON.stringify(guest));

// signed-in executive whose question the Enter key did NOT send to synthesis: told how to ask for a summary
const exec = hint({ authenticated: true, isExecutive: true });
ok("a signed-in executive is told how to ask for a written summary", exec?.kind === "synthesis" && /ask for it directly/i.test(exec.text) && /compare/i.test(exec.text) && /what changed/i.test(exec.text) && /summarise/i.test(exec.text), JSON.stringify(exec));

// a signed-in non-executive: nothing
ok("a signed-in non-executive is told nothing", hint({ authenticated: true, isExecutive: false }) === null);

// once the synthesis has run: nothing, even for a lookup (the old 'use plain search' tip pointed at a button that no longer exists)
ok("nothing is advised once the synthesis has run", hint({ authenticated: true, isExecutive: true, mode: "intellectual" }) === null);
ok("nothing is advised after the synthesis even when the question looks like a lookup", looksLikeLookup("how many executives in C&IT") && hint({ authenticated: true, isExecutive: true, mode: "intellectual", query: "how many executives in C&IT" }) === null);

// the cases that never got a hint still get none
ok("no hint when no circular was shown", hint({ circularShown: false }) === null);
ok("no hint when an answer card was shown", hint({ answerCardShown: true }) === null);
ok("no hint for a quoted exact phrase", hint({ query: "\u201cwhy was the gift card amount corrected\u201d" }) === null);
ok("no hint for a short question", hint({ query: "why gift card" }) === null);
ok("no hint for a plain people lookup", hint({ query: "how many executives work in each section of C&IT" }) === null);

// no hint, whoever it is for, mentions a button
const all = [guest, exec].map((h) => h?.text ?? "");
ok("no hint text sends anyone to a button", all.every((t) => t.length > 0 && !/button/i.test(t)), all.join(" | "));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
