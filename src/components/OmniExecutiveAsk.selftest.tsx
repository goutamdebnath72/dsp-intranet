// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/components/OmniExecutiveAsk.selftest.tsx
// The question "Are you an executive?" for a signed-out visitor who asks an EDS-kind question: two answers, and what each shows.
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { OmniExecutiveAsk } from "./OmniExecutiveAsk";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };
const noop = () => {};
const text = (s: string) => s.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");

const asked = renderToStaticMarkup(<OmniExecutiveAsk ask={{ query: "q", said: null }} onYes={noop} onNo={noop} onSignIn={noop} />);
ok("it asks 'Are you an executive?' in a labelled group, says what kind of question it is (several circulars into one written summary, with sources), and offers Yes and No", /role="group"[^>]*aria-label="Are you an executive\?"/.test(asked) && /Are you an executive\?/.test(text(asked)) && /several circulars into one written summary, with sources/.test(text(asked)) && /data-ask-yes/.test(asked) && /data-ask-no/.test(asked) && />Yes, I am an executive</.test(asked) && />No</.test(asked));
ok("before the answer there is no sign-in message and no Sign in button", !/data-ask-signin/.test(asked) && !/Please sign in/.test(text(asked)));
ok("it says what No gives: the simple answer", /No: you get the simple answer\./.test(text(asked)));
const yes = renderToStaticMarkup(<OmniExecutiveAsk ask={{ query: "q", said: "yes" }} onYes={noop} onNo={noop} onSignIn={noop} />);
ok("after Yes it tells him to sign in with his own account to get the reply as EDS, says it starts by itself after sign-in, and shows the Sign in button; Yes is shown as chosen and No stays available", /Please sign in with your own account to get the reply of this question as EDS\./.test(text(yes)) && /It starts by itself as soon as you have signed in\./.test(text(yes)) && /data-ask-signin-button/.test(yes) && /aria-pressed="true"/.test(yes) && /data-ask-no/.test(yes));
console.log(`OmniExecutiveAsk: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
