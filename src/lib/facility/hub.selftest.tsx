// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/lib/facility/hub.selftest.tsx
// The management page: who gets it (signed in, and holding at least one management tool), what is listed (only what the person holds), what a title opens (its own tool, checked again by the tool), and the line that asks for it.
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GATE_TEXT, HUB_TOOLS, answerManagementHub, detectManagementHubIntent, toolsOf, type Authorities, type ManagementGate, type ManagementHubOpen } from "./hub";
import { FACILITIES, type FacilityKey } from "./registry";
import { authoritiesOfAll } from "./authority";
import { HOD_CIT_TICKET } from "@/lib/constants";
import { ManagementBack, ManagementGatePanel, ManagementHubPanel } from "@/components/ManagementHubPanel";
import { BackButton, CloseButton, ToolShell } from "@/components/tools/toolKit";
import { detectEmployeeAdminIntent } from "@/lib/employees/admin/intent";
import { detectPaxAdminIntent } from "@/lib/pax/admin/intent";
import { detectHolidayAdminIntent } from "@/lib/holidays/admin/intent";
import { detectCircularAdminIntent } from "@/lib/circulars/admin/intent";
import { detectAnnouncementAdminIntent } from "@/lib/announcements/admin/intent";
import { detectAccessLogAdminIntent } from "@/lib/accessLog/admin/intent";
import { detectTool } from "@/lib/tools/detect";
import { QUICK_REFERENCE, entryStrings } from "@/lib/help/quickReference";

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };
const KEYS = Object.keys(FACILITIES) as FacilityKey[];
const none = (): Authorities => Object.fromEntries(KEYS.map((k) => [k, null])) as Authorities;
const all = (a: "hod" | "delegate"): Authorities => Object.fromEntries(KEYS.map((k) => [k, a])) as Authorities;
const run = async (typed: string, ticket: string | null, held: Authorities | Error, name: string | null = "A Person") => {
  let asked = 0;
  const r = await answerManagementHub(typed, ticket, { authorities: async () => { asked++; if (held instanceof Error) throw held; return held; }, nameOf: async () => name });
  return { r, asked };
};
const hub = (r: unknown) => (r as { managementHub?: ManagementHubOpen } | null)?.managementHub;
const gateOf = (r: unknown) => (r as { managementGate?: ManagementGate } | null)?.managementGate;

async function main() {
  // the list of tools
  ok("every management tool of the kit has a line on the page (what it is for, the words that open it), and the page has no line for a tool that does not exist", KEYS.length === 6 && Object.keys(HUB_TOOLS).sort().join() === [...KEYS].sort().join() && KEYS.every((k) => HUB_TOOLS[k].text.length > 10 && HUB_TOOLS[k].phrase.length > 5));
  ok("the words that open the tools are all different", new Set(KEYS.map((k) => HUB_TOOLS[k].phrase)).size === KEYS.length);
  const own: Record<FacilityKey, (q: string) => unknown> = { employee: detectEmployeeAdminIntent, pax: detectPaxAdminIntent, holiday: detectHolidayAdminIntent, circular: detectCircularAdminIntent, announcement: detectAnnouncementAdminIntent, access_log: detectAccessLogAdminIntent };
  ok("a title opens its OWN tool: the words of each tool are read by that tool's own reader, and by no other tool's", KEYS.every((k) => KEYS.every((j) => (own[j](HUB_TOOLS[k].phrase) !== null) === (j === k))), JSON.stringify(KEYS.map((k) => KEYS.filter((j) => own[j](HUB_TOOLS[k].phrase) !== null))));
  ok("a tool's words are not taken for the management page, and the page's words are not taken by any tool", KEYS.every((k) => !detectManagementHubIntent(HUB_TOOLS[k].phrase)) && ["management", "management page", "admin", "managers"].every((q) => KEYS.every((k) => own[k](q) === null)));

  // the typed line
  const yes = ["management", "Management", "management page", "management pages", "managements", "manager", "managers", "admin", "admin page", "admin tools", "management tools", "open the management page", "show me all managers", "administration", "management menu", "please open management console"];
  const no = ["employee management", "pax directory management", "circular admin", "holiday manager", "how to become a manager", "manager of c&it", "who is the general manager", "admin office phone", "tools", "calculators", "management of change policy", "manage", "", "a", "management admin manager admin manager admin manager"];
  ok("the line that asks for the page: management, admin and the like, with only filler words", yes.every(detectManagementHubIntent), JSON.stringify(yes.filter((q) => !detectManagementHubIntent(q))));
  ok("any other line is not the page: a tool's own words, a question that has the word manager in it, a person's title, a lone 'tools'", no.every((q) => !detectManagementHubIntent(q)), JSON.stringify(no.filter(detectManagementHubIntent)));
  ok("the search line's own readers do not take these words first (no calculator hint, no other tool): the page is reached by Enter like any search", yes.every((q) => detectTool(q) === null), JSON.stringify(yes.filter((q) => detectTool(q) !== null)));

  // LOGIN
  const a = await run("management", null, all("hod"));
  ok("not signed in: the sign-in card (state login), no tool is named, and the database is not even asked", gateOf(a.r)?.state === "login" && !hub(a.r) && a.asked === 0 && !/employee|pax|holiday|circular|announcement/i.test(JSON.stringify(a.r)));
  const blank = await run("management", "   ", all("hod"));
  ok("a blank ticket is not signed in either: the sign-in card, and the database is not asked", gateOf(blank.r)?.state === "login" && blank.asked === 0);

  // AUTHORISATION
  const b = await run("management", "412345", none());
  ok("signed in but holding no tool: the refusal card (state denied), no tool is named", gateOf(b.r)?.state === "denied" && !hub(b.r) && !/Employee manager|PAX directory editor|Circular manager/.test(JSON.stringify(b.r)));
  const c = await run("management", HOD_CIT_TICKET, all("hod"), "The HOD");
  ok("the HOD of C&IT: all six tools, in the usual order, held as hod, with his name", hub(c.r)?.tools.map((t) => t.key).join() === KEYS.join() && hub(c.r)?.role === "hod" && hub(c.r)?.name === "The HOD" && hub(c.r)?.tools.every((t) => t.role === "hod") && c.asked === 1);
  const dl = none(); dl.circular = "delegate"; dl.holiday = "delegate";
  const d = await run("admin tools", "412345", dl);
  ok("a delegate sees ONLY what the HOD gave him: circular and holiday, not the other four; and he is shown as a delegate", hub(d.r)?.tools.map((t) => t.key).join() === "holiday,circular" && hub(d.r)?.role === "delegate" && !/employee|pax|access_log|announcement/.test(JSON.stringify(hub(d.r)?.tools.map((t) => t.key))));
  ok("a withdrawn delegation is gone at once: the same person, asked again after the HOD withdrew circular, sees holiday only", (await (async () => { dl.circular = null; return run("management", "412345", dl); })()).r !== null && hub((await run("management", "412345", dl)).r)?.tools.map((t) => t.key).join() === "holiday");
  const e = await run("management", "412345", new Error("db down"));
  ok("when the database cannot be asked, nobody gets in (closed, not open)", gateOf(e.r)?.state === "denied" && !hub(e.r));
  const f = await run("employee management", "412345", all("hod"));
  ok("a line that is not the page is not answered by it, and the database is not asked", f.r === null && f.asked === 0);
  ok("the name is optional (a person with no name found still gets the page)", !!hub((await run("management", HOD_CIT_TICKET, all("hod"), null)).r) && hub((await run("management", HOD_CIT_TICKET, all("hod"), null)).r)?.name === undefined);
  ok("toolsOf keeps the usual order whatever order the rights were given in", toolsOf({ ...none(), access_log: "delegate", employee: "delegate" }).map((t) => t.key).join() === "employee,access_log");

  // the database question: the same rule as every tool
  const calls: Array<[string, unknown[]]> = [];
  const fake = (rows: Array<Record<string, unknown>>) => async (sql: string, params?: unknown[]) => { calls.push([sql, params ?? []]); return rows; };
  const h1 = await authoritiesOfAll(fake([]), HOD_CIT_TICKET);
  ok("the HOD is known by ticket: all six as hod, and the delegate table is not asked", KEYS.every((k) => h1[k] === "hod") && calls.length === 0);
  const h2 = await authoritiesOfAll(fake([{ facility: "pax" }, { facility: "circular" }, { facility: "not_a_tool" }]), "412345");
  ok("a delegate holds the tools of his rows; a row for a tool that does not exist is ignored", h2.pax === "delegate" && h2.circular === "delegate" && h2.employee === null && Object.keys(h2).length === 6 && calls.length === 1);
  ok("the question leaves out withdrawn delegations (revoked_at IS NULL) and asks by the ticket given, not by anything else", /facility_delegate/.test(calls[0][0]) && /revoked_at IS NULL/.test(calls[0][0]) && calls[0][1].join() === "412345");
  const before = calls.length;
  const h3 = await authoritiesOfAll(fake([{ facility: "pax" }]), "  ");
  ok("a blank ticket holds nothing and asks nothing", KEYS.every((k) => h3[k] === null) && calls.length === before);

  // the panel
  const open: ManagementHubOpen = { ticket: "412345", name: "A Person", role: "delegate", tools: toolsOf({ ...none(), circular: "delegate", holiday: "delegate" }) };
  const html = renderToStaticMarkup(<ManagementHubPanel open={open} onOpen={() => undefined} onClose={() => undefined} />).replace(/<!-- -->/g, "");
  ok("the panel lists the titles as buttons, one for each tool held (and no other), each with what it is for; a delegate is told he sees only what he was given", (html.match(/data-hub-tool="/g) ?? []).length === 2 && /data-hub-tool="holiday"/.test(html) && /data-hub-tool="circular"/.test(html) && !/data-hub-tool="employee"/.test(html) && /<button[^>]*data-hub-tool="holiday"/.test(html) && html.includes("Holiday manager") && html.includes("Circular manager") && /Authorised delegate · A Person/.test(html) && /only the pages the HOD of C&amp;IT has given you/.test(html));
  const hodHtml = renderToStaticMarkup(<ManagementHubPanel open={{ ticket: HOD_CIT_TICKET, role: "hod", tools: toolsOf(all("hod")) }} onOpen={() => undefined} onClose={() => undefined} />).replace(/<!-- -->/g, "");
  ok("for the HOD it shows six titles and says he holds all of them", (hodHtml.match(/data-hub-tool="/g) ?? []).length === 6 && /you hold all of them/.test(hodHtml) && /HOD of C&amp;IT/.test(hodHtml));

  // the wiring
  const omni = readFileSync("src/lib/nl2sql/omnibar.ts", "utf8");
  const modal = readFileSync("src/components/OmnibarModal.tsx", "utf8");
  const iHub = omni.indexOf("deps.managementHub ?"), iEmp = omni.indexOf("deps.employeeAdmin ?");
  ok("the page is asked for before every tool's own request, so no tool's phrase can reach it first, and it is drawn first in the answer area", iHub > 0 && iHub < iEmp && modal.indexOf("analytics.managementHub ?") > 0 && modal.indexOf("analytics.managementHub ?") < modal.indexOf("analytics.paxAdmin ?"));
  ok("pressing a title searches for the tool's own words (the tool then checks the person again)", /ManagementHubPanel open=\{analytics\.managementHub\} onOpen=\{\(phrase\) => triggerSearch\("semantic", \{ query: phrase \}\)\}/.test(modal));
  ok("who is asking is the login's ticket: the responder is given the route's ticket and the page never reads one from the line", /managementHub: async \(qq, ticket\) =>/.test(omni) && !/ticket\s*=\s*\/\\b/.test(readFileSync("src/lib/facility/hub.ts", "utf8")));

  ok("typing any of the page's words shows 'Press Enter to open the management page' under the box, like the other keywords: the hint uses the SAME reader as the server (so every word that opens the page also shows it), and it goes once the line has been sent", /data-management-hint/.test(modal) && /detectManagementHubIntent\(q\) && \(submittedQuery \|\| ""\)\.trim\(\)\.toLowerCase\(\) !== q/.test(modal) && /\{hubTyped && \(/.test(modal) && /Press <kbd[^>]*>Enter<\/kbd> to open the management page\./.test(modal) && modal.indexOf("{hubTyped && (") < modal.indexOf("<ToolPanel query"));
  // the Back button of the management tools' pages
  const backHtml = renderToStaticMarkup(<ManagementBack onBack={() => undefined} />).replace(/<!-- -->/g, "");
  const shellHtml = renderToStaticMarkup(<ToolShell title="T" icon={<i />} onBack={() => undefined}><i /></ToolShell>).replace(/<!-- -->/g, "");
  const btn = (h: string): string => /<button[^>]*aria-label="Back to[^>]*>[\s\S]*?<\/button>/.exec(h)?.[0] ?? "";
  const cls = (h: string): string => /class="([^"]*)"/.exec(btn(h))?.[1] ?? "";
  ok("a management tool's page has a Back button, the SAME button as the calculators' pages (same arrow, same word, same classes: one component, BackButton), saying where it goes: the management page", /aria-label="Back to the management page"/.test(backHtml) && />Back<\/button>/.test(backHtml.replace(/<svg[\s\S]*?<\/svg>/g, "")) && cls(backHtml) !== "" && cls(backHtml) === cls(shellHtml) && /aria-label="Back to the calculators list"/.test(shellHtml));
  ok("BackButton says its destination to the screen reader and in the tooltip", /aria-label="Somewhere" title="Somewhere"/.test(renderToStaticMarkup(<BackButton label="Somewhere" onClick={() => undefined} />)));
  ok("the Back button is shown above every one of the six tools' pages and not on the management page, and it goes back by searching for 'management' (which the server answers with the page, after checking the login again)", /\(analytics\.paxAdmin \|\| analytics\.employeeAdmin \|\| analytics\.holidayAdmin \|\| analytics\.circularAdmin \|\| analytics\.announcementAdmin \|\| analytics\.accessLogAdmin\) && \(\s*<ManagementBack onBack=\{\(\) => triggerSearch\("semantic", \{ query: "management" \}\)\} \/>/.test(modal) && !/analytics\.managementHub[^\n]*\n[^\n]*ManagementBack/.test(modal) && detectManagementHubIntent("management") && modal.indexOf("<ManagementBack") < modal.indexOf("{analytics.managementGate ? ("));
  // the cross of the management page
  const shellClose = renderToStaticMarkup(<ToolShell title="T" icon={<i />} onClose={() => undefined}><i /></ToolShell>).replace(/<!-- -->/g, "");
  const closeBtn = (h: string): string => /<button[^>]*aria-label="Close[^>]*>[\s\S]*?<\/button>/.exec(h)?.[0] ?? "";
  const closeCls = (h: string): string => /class="([^"]*)"/.exec(closeBtn(h))?.[1] ?? "";
  ok("the management page has the cross of the calculators' pages: the SAME button (same classes, one component, CloseButton), at the right of the header, saying what it closes", /aria-label="Close the management page"/.test(html) && closeCls(html) !== "" && closeCls(html) === closeCls(shellClose) && /aria-label="Close this calculator"/.test(shellClose) && html.indexOf("Authorised delegate") < html.indexOf('aria-label="Close the management page"') && /aria-label="Somewhere"/.test(renderToStaticMarkup(<CloseButton label="Somewhere" onClick={() => undefined} />)));
  ok("the cross does what the calculators' cross does: it closes the page and leaves what was typed in the box (clearSearch drops the answer and the sent line, not the text), so 'Press Enter to open the management page' is there again", /<ManagementHubPanel open=\{analytics\.managementHub\}[\s\S]*?onClose=\{\(\) => clearSearch\(\)\} \/>/.test(modal) && /const clearSearch = useCallback\(\(\) => \{\s*setSubmittedQuery\(""\);\s*setMode\(null\);/.test(readFileSync("src/hooks/useOmniSearch.ts", "utf8")) && !/const clearSearch = useCallback\(\(\) => \{[^}]*setQuery\(/.test(readFileSync("src/hooks/useOmniSearch.ts", "utf8")));
  ok("the six tools' pages keep their Back button and have no cross of their own added (the management page's cross is on the page itself)", !/ManagementBack[^\n]*onClose/.test(modal));
  const guideEntry = QUICK_REFERENCE.flatMap((g) => g.entries).find((e) => /^Management pages/.test(e.feature));
  ok("the guide's What-to-type list has an entry for the management page, and every word it gives is one the page really answers to (the guide cannot promise a word that does nothing)", !!guideEntry && entryStrings(guideEntry).length >= 4 && entryStrings(guideEntry).every(detectManagementHubIntent), JSON.stringify(guideEntry ? entryStrings(guideEntry).filter((q) => !detectManagementHubIntent(q)) : "no entry"));
  ok("all the cards are the same size: the grid's rows share the height of the tallest card (auto-rows-fr), each cell holds its card at full height (li flex, button h-full w-full), and the card's own sizes are in rem and relative units only (no fixed pixel width or height)", /data-hub-grid[^>]*class="[^"]*auto-rows-fr/.test(hodHtml) && /<li class="flex"/.test(hodHtml) && (hodHtml.match(/<button[^>]*class="[^"]*\bh-full w-full\b/g) ?? []).length === 6 && !/style="[^"]*(?:width|height):\s*\d+px/.test(hodHtml) && !/\b(?:w|h)-\[\d+px\]/.test(hodHtml));
  // the frame: the gradient and the blurred lights behind the cross
  const frameOf = (h: string): { sec: string; lights: string[] } => ({ sec: /<section[^>]*class="([^"]*)"/.exec(h)?.[1] ?? "", lights: [...h.matchAll(/<span aria-hidden="true" class="pointer-events-none absolute inset-0 -z-10[^"]*"><span class="([^"]*)"><\/span><span class="([^"]*)"><\/span>/g)].flatMap((m) => [m[1], m[2]]) });
  const calcFrame = frameOf(renderToStaticMarkup(<ToolShell title="Calculators" tone="sky" icon={<i />} onClose={() => undefined}><i /></ToolShell>).replace(/<!-- -->/g, ""));
  const mgmtFrame = frameOf(html);
  ok("THE MANAGEMENT PAGE HAS THE CALCULATORS' FRAME: the same soft gradient and rounded corners, and the same two blurred lights (the bluish glow behind the top-right cross: a sky light at the top right), not a plain white card", mgmtFrame.sec !== "" && mgmtFrame.sec === calcFrame.sec && mgmtFrame.lights.length === 2 && mgmtFrame.lights.join("|") === calcFrame.lights.join("|") && /-right-24 -top-28/.test(html) && /from-sky-300\/40/.test(html) && /bg-gradient-to-br from-white via-slate-50 to-sky-50\/80/.test(html) && !/bg-white\/70 p-4 shadow-sm/.test(html));
  ok("the header is the calculators' too: the gradient icon tile with its white ring, the title, the line under it, the role chip, then the cross; and no privacy/approximation notice (the page has nothing to type into)", /ring-4 ring-white\/70/.test(html) && /<h3[^>]*>Management<\/h3>/.test(html) && html.indexOf("Management</h3>") < html.indexOf("Authorised delegate") && !/Nothing you type here is saved anywhere/.test(html) && !/approximations: please double-check/.test(html));

  // THE TWO KINDS OF VISITOR, signed out and signed in
  // signed out: everybody is asked to sign in, the HOD, a delegate and anybody else alike (the server cannot tell them apart and does not try)
  const out1 = await run("management", null, all("hod")), out2 = await run("admin", null, none()), out3 = await run("management page", "", dl);
  ok("SIGNED OUT: the HOD, a delegate and anybody else are all asked to sign in, by the same card, the database is not asked, and nobody is told who may or may not have the page", [out1, out2, out3].every((x) => gateOf(x.r)?.state === "login" && x.asked === 0) && JSON.stringify(out1.r) === JSON.stringify(out2.r) && JSON.stringify(out2.r) === JSON.stringify(out3.r));
  ok("SIGNED OUT card: the same payload for every signed-out line (login, no name, no tool, no role)", JSON.stringify(gateOf(out1.r)) === '{"state":"login"}' && JSON.stringify(gateOf(out2.r)) === '{"state":"login"}' && JSON.stringify(gateOf(out3.r)) === '{"state":"login"}');
  // after signing in the same question is asked again (the search key follows the login), now with a ticket: the page, or the refusal
  const after1 = await run("management", HOD_CIT_TICKET, all("hod")), after2 = await run("management", "498301", none()), after3 = await run("management", "412345", dl);
  ok("AFTER SIGNING IN the same line gives the page to the HOD and to a delegate, and the refusal to anybody else", !!hub(after1.r) && !!hub(after3.r) && gateOf(after2.r)?.state === "denied" && !hub(after2.r));
  ok("SIGNED IN and not authorised: the refusal; and it is the same refusal whether the person was signed in all along or has just signed in (the same payload for the same person)", JSON.stringify(after2.r) === JSON.stringify((await run("management", "498301", none())).r));
  ok("the refusal names the person to himself ('signed in as ...') and nobody else; a refusal with no name found is still the refusal", gateOf((await run("management", "498301", none(), "Some Employee")).r)?.name === "Some Employee" && gateOf((await run("management", "498301", none(), null)).r)?.name === undefined && gateOf((await run("management", "498301", none(), null)).r)?.state === "denied");
  // the cards
  const loginHtml = renderToStaticMarkup(<ManagementGatePanel gate={{ state: "login" }} onSignIn={() => undefined} onClose={() => undefined} />).replace(/<!-- -->/g, "");
  const deniedHtml = renderToStaticMarkup(<ManagementGatePanel gate={{ state: "denied", name: "Some Employee" }} onSignIn={() => undefined} onClose={() => undefined} />).replace(/<!-- -->/g, "");
  ok("the sign-in card: a lock, the title, the sentence, a Sign in BUTTON, and the line that an unauthorised person will be told so after signing in; it is in the calculators' frame, with the cross", /data-management-gate="login"/.test(loginHtml) && loginHtml.includes(GATE_TEXT.loginTitle) && loginHtml.includes(GATE_TEXT.login.replace(/&/g, "&amp;")) && /<button[^>]*data-gate-signin[^>]*>[\s\S]*?Sign in<\/button>/.test(loginHtml) && /you will be told so after you sign in/.test(loginHtml) && /aria-label="Close the management page"/.test(loginHtml) && frameOf(loginHtml).sec.includes("rounded-3xl") && frameOf(loginHtml).lights.length === 2);
  ok("the refusal card: 'You are not authorised to access this page' and the sentence, announced to a screen reader (role alert), NO Sign in button, the person's name; same frame and cross", /data-management-gate="denied"/.test(deniedHtml) && /role="alert"/.test(deniedHtml) && deniedHtml.includes(GATE_TEXT.deniedTitle) && deniedHtml.includes(GATE_TEXT.denied.replace(/&/g, "&amp;")) && !/data-gate-signin|>Sign in</.test(deniedHtml) && /signed in as <strong[^>]*>Some Employee/.test(deniedHtml) && /aria-label="Close the management page"/.test(deniedHtml) && frameOf(deniedHtml).lights.length === 2);
  ok("the sign-in card has no button when it cannot open the window (no handler given): it never shows a button that does nothing", !/data-gate-signin/.test(renderToStaticMarkup(<ManagementGatePanel gate={{ state: "login" }} onClose={() => undefined} />)));
  ok("neither card names a management tool, a role or who holds what", [loginHtml, deniedHtml].every((x) => !/Employee manager|PAX directory editor|Holiday manager|Circular manager|Announcement manager|Contact access log/.test(x)));
  ok("the Sign in button opens the app's login window (the same openModal the other sign-in prompts use), and the card is drawn before the page, so a refusal never shows the page", /<ManagementGatePanel gate=\{analytics\.managementGate\} onSignIn=\{openModal\} onClose=\{\(\) => clearSearch\(\)\} \/>/.test(modal) && modal.indexOf("analytics.managementGate ?") < modal.indexOf("analytics.managementHub ? ("));
  ok("signing in asks the question again by itself: the search's key includes the login's ticket, so a new login fetches the answer anew", /\$\{ticketNo \? `&ticket=\$\{ticketNo\}` : ""\}/.test(readFileSync("src/hooks/useOmniSearch.ts", "utf8")));
  console.log(`hub selftest: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
void main();
