// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/components/FormerNameNotice.selftest.tsx
// Step 59a: the note above the answer when the question used a former name of a department; and its place in the query modal (above the results of ANY answer, from the question that was searched).

import React from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { FormerNameNotice } from "./FormerNameNotice";
import { formerNameNotice } from "@/lib/search/formerNames";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) pass++;
  else { fail++; console.log(`FAIL ${name} ${extra}`); }
};
const html = (q: string) => renderToStaticMarkup(<FormerNameNotice notice={formerNameNotice(q)} />);

ok("nothing for a question without a former name", html("list of employees in cl&d") === "" && html("") === "");
const h = html("list of employees in chrd");
ok("a note (role=note) with the sentence and the history line", /<div role="note" data-former-name="true"/.test(h) && />“CHRD” is now called Centre for L &amp; D \(CL&amp;D\)\.<\/p>/.test(h) && />Training Department → CHRD → Centre for L &amp; D \(CL&amp;D\)<\/p>/.test(h), h);
ok("the sentence is the bold line, the history the small one", /<p class="text-sm font-semibold" data-former-sentence="true">/.test(h) && /<p class="text-xs text-sky-800" data-former-history="true">/.test(h));
ok("it is a quiet note, not a warning: sky-coloured, no red or amber", /border-sky-200 bg-sky-50/.test(h) && !/red-|amber-/.test(h));
ok("the Training Department form", />“Training Department” is now called Centre for L &amp; D \(CL&amp;D\)\.<\/p>/.test(html("executives in the training department")));

// ---- the place in the query modal
const modal = readFileSync("src/components/OmnibarModal.tsx", "utf8");
ok("the modal computes the notice from the SEARCHED question (submittedQuery), not from the text being typed", /const nameNotice = useMemo\(\(\) => formerNameNotice\(submittedQuery \|\| ""\), \[submittedQuery\]\);/.test(modal));
const at = (needle: string) => modal.indexOf(needle);
ok("it is drawn ABOVE the results area (and above the login hint), so it stands before any answer", at("{nameNotice && <FormerNameNotice notice={nameNotice} />}") > 0 && at("{nameNotice && <FormerNameNotice") < at("{loginHint && <OmniLoginHint") && at("{loginHint && <OmniLoginHint") < at('scrollbar-thin overflow-y-auto overscroll-contain p-2 flex-1'), JSON.stringify([at("{nameNotice && <FormerNameNotice"), at("{loginHint && <OmniLoginHint"), at('scrollbar-thin overflow-y-auto overscroll-contain p-2 flex-1')]));
ok("it is not inside one kind of answer: the line occurs once in the modal", (modal.match(/<FormerNameNotice notice=/g) ?? []).length === 1);
console.log(`FormerNameNotice selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
