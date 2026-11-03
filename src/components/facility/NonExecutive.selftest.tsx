// Run (from the project root):  npx tsx --tsconfig tsconfig.selftest.json src/components/facility/NonExecutive.selftest.tsx
// Step 69c: the two shared parts of "authorising a non-executive": the red question with a tick and a cross, and the amber chip / row look.

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { NONEXEC_ROW, NonExecutiveAsk, NonExecutiveChip } from "./NonExecutive";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => { if (cond) pass++; else { fail++; console.log(`FAIL ${name} ${extra}`); } };
const noop = () => undefined;
const h = (el: React.ReactElement) => renderToStaticMarkup(el);

const a = h(<NonExecutiveAsk name="A TECHNICIAN" ticket="123456" busy={false} onYes={noop} onNo={noop} />);
ok("the question is an alert, in RED, that names the person and his ticket and asks 'Are you sure you want to authorise a non-executive?'", /role="alert"/.test(a) && /rose/.test(a) && a.includes("Non-executive: A TECHNICIAN (123456).") && a.includes("Are you sure you want to authorise a non-executive?") && /data-nonexec-ask="true"/.test(a));
ok("it has a TICK (Yes, authorise) and a CROSS (No), each with its own mark, as buttons that do not submit anything", a.includes("Yes, authorise") && a.includes(">No<") && /data-nonexec-yes="true"/.test(a) && /data-nonexec-no="true"/.test(a) && (a.match(/type="button"/g) ?? []).length === 2 && (a.match(/<svg/g) ?? []).length === 2);
ok("both buttons are off while a request is on its way", (h(<NonExecutiveAsk name="X" ticket="1" busy={true} onYes={noop} onNo={noop} />).match(/disabled=""/g) ?? []).length === 2 && !/disabled=""/.test(a));
ok("what it prints is escaped (a tag in a name is text)", !h(<NonExecutiveAsk name="<img src=x onerror=1>" ticket="1" busy={false} onYes={noop} onNo={noop} />).includes("<img src=x"));
ok("the chip says 'Non-executive', in amber, with its mark", /data-nonexec-chip="true"/.test(h(<NonExecutiveChip />)) && h(<NonExecutiveChip />).includes("Non-executive") && /amber/.test(h(<NonExecutiveChip />)));
ok("the row look is amber (not the white of an executive's row)", /amber/.test(NONEXEC_ROW) && !/white/.test(NONEXEC_ROW));
const src = readFileSync("src/components/facility/NonExecutive.tsx", "utf8");
ok("the parts keep no state and make no request (they only draw, and call what they are given)", !/useState|useEffect|fetch\(/.test(src));

// ---- the two panels use them ----
const emp = readFileSync("src/components/EmployeeAdminPanel.tsx", "utf8");
const pax = readFileSync("src/components/PaxAdminPanel.tsx", "utf8");
const paxUi = readFileSync("src/components/PaxAdminUi.tsx", "utf8");
ok("employee panel: a non-executive found by ticket opens the question (not a direct authorise); only the tick sends the confirmation; the cross closes it; a withdrawal clears it", /onClick=\{\(\) => \(f\.nonExecutive \? setAsking\(f\.ticket\) : void grant\(f\.ticket\)\)\}/.test(emp) && /onYes=\{\(\) => void grant\(f\.ticket, true\)\}/.test(emp) && /onNo=\{\(\) => setAsking\(null\)\}/.test(emp) && /op: "grant", ticket, confirmNonExecutive/.test(emp));
ok("employee panel: the list marks a non-executive (amber row, chip) and an unknown ticket gets the red sentence", /data-emp-delegate=\{d\.nonExecutive \? "non-executive" : "executive"\}/.test(emp) && /\{d\.nonExecutive && <NonExecutiveChip \/>\}/.test(emp) && /No employee has this ticket number\./.test(emp));
ok("PAX panel: the same rules (question first, tick sends the confirmation, cross closes, amber row and chip, red sentence for an unknown ticket)", /onClick=\{\(\) => \(p\.nonExecutive \? setAsking\(p\.ticket\) : void grant\(p\.ticket\)\)\}/.test(pax) && /onYes=\{\(\) => void grant\(p\.ticket, true\)\}/.test(pax) && /onNo=\{\(\) => setAsking\(null\)\}/.test(pax) && /op: "grant", ticket, confirmNonExecutive/.test(pax) && /nonExecutive=\{d\.nonExecutive\}/.test(pax) && /No employee has this ticket number\./.test(pax));
ok("PAX person row: amber and a chip for a non-executive, white for an executive (the question sits under the row)", /NONEXEC_ROW : "border-slate-200 bg-white"/.test(paxUi) && /props\.nonExecutive && <NonExecutiveChip \/>/.test(paxUi) && /\{props\.below\}/.test(paxUi));
ok("both panels show the help text that says a non-executive needs the HOD's confirmation", /non-executive, found by his ticket number, only after you confirm/.test(emp) && /non-executive, found by his ticket number, only after you confirm/.test(pax));
console.log(`NonExecutive selftest: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
