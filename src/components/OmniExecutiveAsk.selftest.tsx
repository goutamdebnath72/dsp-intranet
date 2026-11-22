// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/components/OmniExecutiveAsk.selftest.tsx
// The question "Are you an executive?" for a signed-out visitor who asks an EDS-kind question: two answers, and what each shows.
import React from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { OmniExecutiveAsk } from "./OmniExecutiveAsk";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };
const noop = () => {};
const text = (s: string) => s.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");

const asked = renderToStaticMarkup(<OmniExecutiveAsk ask={{ query: "q", said: null }} onYes={noop} onNo={noop} />);
ok("it asks 'Are you an executive?' in a labelled group, says what kind of question it is (several circulars into one written summary, with sources), and offers Yes and No", /role="group"[^>]*aria-label="Are you an executive\?"/.test(asked) && /Are you an executive\?/.test(text(asked)) && /several circulars into one written summary, with sources/.test(text(asked)) && /data-ask-yes/.test(asked) && /data-ask-no/.test(asked) && />Yes, I am an executive</.test(asked) && />No</.test(asked));
ok("before the answer there is no sign-in message and no Sign in button", !/data-ask-signin/.test(asked) && !/Please sign in/.test(text(asked)));
ok("it says what No gives: the simple answer", /No: you get the simple answer\./.test(text(asked)));
const yes = renderToStaticMarkup(<OmniExecutiveAsk ask={{ query: "q", said: "yes" }} onYes={noop} onNo={noop} />);
ok("after Yes there is NO second card and NO Sign in button (Yes itself opens the login window, the caller does that): Yes is shown as chosen and No stays available", !/data-ask-signin/.test(yes) && !/Please sign in/.test(text(yes)) && !/It starts by itself/.test(text(yes)) && /aria-pressed="true"/.test(yes) && /data-ask-no/.test(yes) && /data-ask-yes/.test(yes));
// the Executive Deep Search BUTTON pressed by a visitor (no question yet: an empty one)
const chosen = renderToStaticMarkup(<OmniExecutiveAsk ask={{ query: "", said: null }} onYes={noop} onNo={noop} />);
ok("pressed without a question it says what EDS is and that it is for executives, still asks 'Are you an executive?', and says No goes back to the ordinary search (not 'the simple answer', not the circulars)", /Executive Deep Search \(EDS\) builds one written summary/.test(text(chosen)) && /It is for executives\./.test(text(chosen)) && /Are you an executive\?/.test(text(chosen)) && /No: you go back to the ordinary search\./.test(text(chosen)) && !/circulars instead/.test(text(chosen)) && !/This is a deep question/.test(text(chosen)) && !/simple answer/.test(text(chosen)));
const chosenYes = renderToStaticMarkup(<OmniExecutiveAsk ask={{ query: "", said: "yes" }} onYes={noop} onNo={noop} />);
ok("the same for the pressed EDS button: after Yes no sign-in card either", !/data-ask-signin/.test(chosenYes) && !/Please sign in/.test(text(chosenYes)) && !/type your question here/.test(text(chosenYes)));
ok("the component takes no sign-in handler any more (Yes is the click on Sign in)", !/onSignIn/.test(readFileSync("src/components/OmniExecutiveAsk.tsx", "utf8")));
console.log(`OmniExecutiveAsk: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
