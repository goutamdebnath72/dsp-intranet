/**
 * Self-test of the omnibar's login/summary hints after the Executive Deep Synthesis BUTTON was removed (step 41a).
 * Run: npx tsx --tsconfig tsconfig.json src/lib/search/loginHints.selftest.ts
 */
import { decideLoginHint, resumeAsEds, EDS_SIGNIN_TEXT, looksAnalytical, looksLikeLookup, type HintInput } from "./loginHints";
import { readFileSync } from "node:fs";
import { detectSynthesisIntent } from "./synthesisIntent";

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
// ---- the EDS sign-in advice: a SIGNED-OUT visitor whose question is in the EDS category (the same detector that routes an executive's question)
const EDS_QUESTIONS = [
  "Under the revised Zero Tolerance Safety Rules, what consequence follows each violation at each stage, and through whom is it issued?",
  "How do the public holidays notified for DSP employees in 2024, 2025 and 2026 compare, and which festival dates differ between the years?",
  "Compare how face-recognition attendance was introduced for executives in 2023 and for contractor workers in 2024.",
  "What changed between the 2024 and 2025 Hindi Teaching Scheme?",
];
for (const q of EDS_QUESTIONS) {
  ok(`the question is in the EDS category: ${q.slice(0, 60)}`, detectSynthesisIntent(q).synthesis);
  const h = hint({ query: q, authStatus: "unauthenticated", authenticated: false, circularShown: true, answerCardShown: false });
  ok(`a signed-out visitor is advised to sign in as an executive: ${q.slice(0, 60)}`, h?.kind === "eds-signin" && h.action === "signin" && h.text === EDS_SIGNIN_TEXT);
}
ok("the advice says what it is (EDS), who it is for (executives), what to do (sign in with credentials) and to ask again", /Executive Deep Synthesis \(EDS\)/.test(EDS_SIGNIN_TEXT) && /executives/i.test(EDS_SIGNIN_TEXT) && /sign in with your credentials/i.test(EDS_SIGNIN_TEXT) && /ask this question again/i.test(EDS_SIGNIN_TEXT));
ok("the advice does not claim the visitor is an executive", /If you are an executive/.test(EDS_SIGNIN_TEXT));
const q0 = EDS_QUESTIONS[0];
ok("it is given even when no circular card was shown and when an answer card was", hint({ query: q0, authStatus: "unauthenticated", circularShown: false, answerCardShown: false })?.kind === "eds-signin" && hint({ query: q0, authStatus: "unauthenticated", circularShown: true, answerCardShown: true })?.kind === "eds-signin");
ok("not while the session is still being checked (loading)", hint({ query: q0, authStatus: "loading", authenticated: false })?.kind !== "eds-signin");
ok("not to a signed-in executive", hint({ query: q0, authStatus: "authenticated", authenticated: true, isExecutive: true }) === null || hint({ query: q0, authStatus: "authenticated", authenticated: true, isExecutive: true })?.kind !== "eds-signin");
ok("not to a signed-in non-executive (signing in again would change nothing)", hint({ query: q0, authStatus: "authenticated", authenticated: true, isExecutive: false })?.kind !== "eds-signin");
ok("not once the synthesis has run", hint({ query: q0, authStatus: "unauthenticated", mode: "intellectual" }) === null);
ok("not when EDS is switched off (the kill switch)", hint({ query: q0, authStatus: "unauthenticated", edsEnabled: false })?.kind !== "eds-signin");
ok("when authStatus is not passed it is derived from `authenticated`", hint({ query: q0, authenticated: false })?.kind === "eds-signin" && hint({ query: q0, authenticated: true, isExecutive: true })?.kind !== "eds-signin");
// ordinary questions of a signed-out visitor are never told to sign in for EDS
for (const q of ["How do I return my provident fund advance?", "who is the head of C&IT", "holiday list 2026", "Mediclaim renewal last date", "Compare the seniority of Mohd Anwar Ullah and Rana Saha"]) {
  const h = hint({ query: q, authStatus: "unauthenticated", authenticated: false });
  ok(`an ordinary / directory question gets no EDS advice: ${q.slice(0, 50)}`, h?.kind !== "eds-signin", JSON.stringify(h));
}
// the Sign in button is part of the bar, and it uses the app's own sign-in opener
const bar = readFileSync("src/components/OmniLoginHint.tsx", "utf8");
const modal = readFileSync("src/components/OmnibarModal.tsx", "utf8");
ok("the bar shows a Sign in button for an action 'signin'", /hint\.action === "signin" && onSignIn/.test(bar) && /Sign in/.test(bar));
ok("the screen passes the session status (not just a yes/no) and opens the sign-in window with the app's own opener", /authStatus: authStatus as "authenticated" \| "unauthenticated" \| "loading"/.test(modal) && /<OmniLoginHint hint=\{loginHint\} onSignIn=\{openModal\} \/>/.test(modal));
ok("the screen passes the EDS kill switch to the advice", /edsEnabled: autoEdsEnabled\(/.test(modal));


// signing in from the advice: the same question then runs through EDS by itself
{
  const zt = "Under the revised Zero Tolerance Safety Rules, what consequence follows each violation at each stage, and through whom is it issued?";
  const r = (o: Partial<Parameters<typeof resumeAsEds>[0]> = {}) => resumeAsEds({ wasExecutive: false, isExecutive: true, isOpen: true, mode: "semantic", query: zt, submittedQuery: zt, edsEnabled: true, ...o });
  ok("signed in as an executive with the EDS question on screen: it re-runs through EDS", r());
  ok("the kill switch off: nothing is re-run", !r({ edsEnabled: false }));
  ok("a visit that was already an executive: nothing is re-run", !r({ wasExecutive: true }));
  ok("still not an executive (signed in as someone else): nothing is re-run", !r({ isExecutive: false }));
  ok("the window is closed: nothing is re-run", !r({ isOpen: false }));
  ok("EDS is already running or shown: not run twice", !r({ mode: "intellectual" }) && !r({ mode: null }));
  ok("the question was edited in the box since: not re-run", !r({ query: zt + " and more" }));
  ok("an ordinary question is never sent to EDS by signing in", !r({ query: "holiday list 2026", submittedQuery: "holiday list 2026" }));
  ok("a directory question is never sent to EDS by signing in", !r({ query: "who is the head of C&IT", submittedQuery: "who is the head of C&IT" }));
  ok("nothing submitted yet: nothing is re-run", !r({ submittedQuery: "", query: "" }));
}
ok("the screen runs the question through EDS when the visitor becomes an executive", /resumeAsEds\(\{/.test(modal) && /triggerSearch\("intellectual", \{ auto: true, query: submittedQuery \}\)/.test(modal) && /\[isExecutive\]\)/.test(modal));

const all = [guest, exec].map((h) => h?.text ?? "");
ok("no hint text sends anyone to a button", all.every((t) => t.length > 0 && !/button/i.test(t)), all.join(" | "));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
