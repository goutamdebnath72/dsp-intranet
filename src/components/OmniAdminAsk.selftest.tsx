// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/components/OmniAdminAsk.selftest.tsx
// The ADMIN button of More tools: a signed-out visitor is asked "Are you authorised to access them?" (Yes opens the sign-in window and, once signed in, the authority is checked; No goes back to Everything);
// a signed-in person goes straight to the check; a person who is not authorised sees the red card of the management page.
import React from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { OmniAdminAsk } from "./OmniAdminAsk";
import { ManagementGatePanel } from "./ManagementHubPanel";
import { ADMIN_CHOICE } from "@/records/domains";
import { GATE_TEXT } from "@/lib/facility/hub";
import { nothingInScope, parseScope, selectionQuery, stepAllowed } from "@/records/scope";
import { detectManagementHubIntent } from "@/lib/facility/hub";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };
const noop = () => {};
const text = (s: string) => s.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&rsquo;|’/g, "'").replace(/\s+/g, " ");

const asked = renderToStaticMarkup(<OmniAdminAsk said={null} onYes={noop} onNo={noop} />);
ok("it asks 'Are you authorised to access them?' in a labelled group, says what the pages are (they change the plant's data; the HOD of C&IT and the people he has authorised), and offers Yes and a separate No", /role="group"[^>]*aria-label="Are you authorised to access the admin pages\?"/.test(asked) && /data-admin-ask/.test(asked) && /Are you authorised to access them\?/.test(text(asked)) && /change the plant's data/.test(text(asked)) && /HOD of C&IT/.test(text(asked)) && /data-ask-yes/.test(asked) && /data-ask-no/.test(asked) && />No</.test(asked));
ok("it says what each answer does: Yes signs you in and your authority is checked, No returns to the ordinary search", /Yes: you sign in, and your authority is checked/.test(text(asked)) && /No: you go back to the ordinary search/.test(text(asked)));
ok("it is a sibling of the executive question, not the same words (it does not mention EDS, a deep search or a summary)", !/EDS|Deep Search|summary/i.test(text(asked)));
const yes = renderToStaticMarkup(<OmniAdminAsk said="yes" onYes={noop} onNo={noop} />);
ok("after Yes there is no sign-in card and no Sign in button (Yes itself opens the login window): Yes is shown as chosen and No stays", !/data-ask-signin|data-gate-signin/.test(yes) && /aria-pressed="true"[^>]*data-ask-yes/.test(yes) && /data-ask-no/.test(yes));
ok("the component takes no sign-in handler (Yes is the click on Sign in)", !/onSignIn/.test(readFileSync("src/components/OmniAdminAsk.tsx", "utf8")));

// the refusal after sign-in is the management page's own red card, in the owner's words
const denied = renderToStaticMarkup(<ManagementGatePanel gate={{ state: "denied" }} onClose={noop} />);
ok("a signed-in person who may not have the page sees a red alert saying they are not authorised to access this page", /role="alert"/.test(denied) && /data-management-gate="denied"/.test(denied) && /border-rose/.test(denied) && text(denied).includes(GATE_TEXT.deniedTitle) && /You are not authorised to access this page/.test(GATE_TEXT.deniedTitle));

// the choice itself
ok("Admin is a choice of the bar, named 'Admin', that the server knows as a scope but is never a record; only the management step may run under it", ADMIN_CHOICE.label === "Admin" && parseScope("admin") === "admin" && stepAllowed("admin", "admin") && !(["dates", "pax", "hospital", "phd", "degrees", "holiday", "departmentWords", "verified", "model"] as const).some((s) => stepAllowed("admin", s)));
ok("it travels in the search address as scope=admin, and a line that is no management request says nothing was found under Admin and how to ask", selectionQuery({ scope: "admin", facet: "find", dept: "", grade: "", nm: "" }) === "&scope=admin" && /under Admin/.test(nothingInScope("admin", "fire service")) && /management/.test(nothingInScope("admin", "fire service")));
ok("its examples are management words: the first is the management page itself, which the server reads as such", ADMIN_CHOICE.examples[0] === "management" && detectManagementHubIntent(ADMIN_CHOICE.examples[0]));

// the wiring of the Omnibar, read from its source
const modal = readFileSync("src/components/OmnibarModal.tsx", "utf8");
ok("a signed-in person who presses Admin goes straight to the check; anyone else is asked first", /if \(next\.scope === "admin"\) \{\s*if \(authStatus === "authenticated"\) setAdminWant\(true\);\s*else setAdminAsk\(\(cur\) => cur \?\? \{ said: null \}\);/.test(modal));
ok("Yes opens the login window at once (and is remembered as said); No goes back to Everything", /onYes=\{\(\) => \{ setAdminAsk\(\{ said: "yes" \}\); openModal\(\); \}\}/.test(modal) && /onNo=\{\(\) => changeSelection\(\{ \.\.\.AUTO_SELECTION \}\)\}/.test(modal));
ok("once signed in under Admin the question goes and the management page is asked of the server by the login (the server ignores any ticket sent by the browser): triggerSearch('semantic', { query: 'management' })", /if \(selection\.scope === "admin" && authStatus === "authenticated" && adminAsk\) \{ setAdminAsk\(null\); setAdminWant\(true\); \}/.test(modal) && /if \(adminWant && selection\.scope === "admin" && authStatus === "authenticated"\) \{ setAdminWant\(false\); triggerSearch\("semantic", \{ query: "management" \}\); \}/.test(modal));
ok("pressing any other button, opening the Utility Services, or closing the window drops the question", /setExecutiveAsk\(null\);\s*setAdminAsk\(null\);\s*\/\/ Executive Deep Search pressed/.test(modal) && /setEdsNote\(null\);\s*setExecutiveAsk\(null\);\s*setAdminAsk\(null\);\s*forgetRoute\(\);\s*setSelection\(AUTO_SELECTION\);/.test(modal) && /setAdminAsk\(null\); setAdminWant\(false\);/.test(modal));
ok("under Admin a typed line is sent with the Admin selection (the route answers the management words first and says nothing found for any other line); no utility, record or circular is looked at", /selection\.scope !== "auto" && selection\.scope !== "documents"\) \{[\s\S]{0,200}runScoped\(qTrim\)/.test(modal) && /if \(r\.scope === "admin"\) return none\(r\.scope, r\.q\);/.test(readFileSync("src/lib/records/scoped.ts", "utf8")));
ok("the cross of the management page and of its refusal card, when they came from Admin, wipes the box and returns the choice to Everything (and the old way, clearSearch, stays for the typed word 'management' under Everything)", (modal.match(/onClose=\{closeManagement\}/g) ?? []).length === 2 && /const closeManagement = \(\) => \{ if \(selection\.scope === "admin"\) changeSelection\(\{ \.\.\.AUTO_SELECTION \}\); else clearSearch\(\); \};/.test(modal) && /moved[\s\S]{0,400}setQuery\(""\)/.test(modal));
ok("a management tool's page stands alone like the Utility Services page: the box and the choices are left out while one of the six pages is on the screen (a pure function of the answer, so it ends when Back brings the management page), and Escape goes back to the management page", /const adminFocus = !isLoading && !!analytics && !!\(analytics\.employeeAdmin \|\| analytics\.paxAdmin \|\| analytics\.holidayAdmin \|\| analytics\.circularAdmin \|\| analytics\.announcementAdmin \|\| analytics\.accessLogAdmin\);/.test(modal) && /const pageAlone = utilityFocus \|\| adminFocus;/.test(modal) && /\{!pageAlone && \(/.test(modal) && /e\.key === "Escape"\) \{ e\.preventDefault\(\); e\.stopImmediatePropagation\(\); triggerSearch\("semantic", \{ query: "management" \}\); \}/.test(modal) && /<ManagementBack onBack=\{\(\) => triggerSearch\("semantic", \{ query: "management" \}\)\} \/>/.test(modal));
ok("the Admin button fetches the management page ahead when it is pointed at, touched or focused by a signed-in person (under the Admin address, the one the press will ask for), so the page appears at once", /onPointerEnter=\{onAdminHint\} onPointerDown=\{onAdminHint\} onFocus=\{onAdminHint\}/.test(readFileSync("src/components/RecordsScopeBar.tsx", "utf8")) && /prefetchSearch\("semantic", "management", \{ \.\.\.AUTO_SELECTION, scope: "admin" \}\)/.test(modal) && /sel: Selection = selection\) =>/.test(readFileSync("src/hooks/useOmniSearch.ts", "utf8")));
const route = readFileSync("src/app/api/ai-search/route.ts", "utf8");
ok("the route answers the management words before any scope is applied (so Admin sees the same page and the same refusals as the typed word 'management'), and the authority is the session's", route.indexOf("answerAdminFast(q, userTicket ?? null)") > 0 && route.indexOf("answerAdminFast(q, userTicket ?? null)") < route.indexOf('parseScope(searchParams.get("scope"))'));
console.log(`OmniAdminAsk: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
