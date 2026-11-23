// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/components/RecordsScopeBar.selftest.tsx </dev/null
// This checks the fixed selections under the search box: what is drawn for each, and how the Omnibar is wired to them.

import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { RecordsScopeBar } from "./RecordsScopeBar";
import { AUTO_SELECTION, selectionQuery } from "@/records/scope";
import type { DomainId, Selection } from "@/records/types";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => { if (cond) pass++; else { fail++; console.log(`FAIL ${name} ${extra}`); } };
const draw = (sel: Partial<Selection>, suggestion: DomainId | null = null, extra: { utilitiesOpen?: boolean; notice?: string | null; edsReady?: boolean; adminReady?: boolean } = {}) =>
  renderToStaticMarkup(<RecordsScopeBar selection={{ ...AUTO_SELECTION, ...sel }} onChange={() => undefined} suggestion={suggestion} onExample={() => undefined} onRunFinder={() => undefined} utilitiesOpen={!!extra.utilitiesOpen} onUtilities={() => undefined} notice={extra.notice} edsReady={extra.edsReady} adminReady={extra.adminReady} />);
const count = (html: string, re: RegExp) => (html.match(re) ?? []).length;

const auto = draw({});
ok("two rows: the records' radio group named 'Search in' (Everything and six records) and, on their own row, titled 'More tools' (Utility Services, Executive Deep Search and Admin)", /role="radiogroup" aria-label="Search in"/.test(auto) && /role="radiogroup" aria-label="More tools"/.test(auto) && />More tools</.test(auto) && !/Or use/i.test(auto) && count(auto, /data-records-chip="/g) === 9 && count(auto, /role="radio"/g) === 10 && /data-records-more/.test(auto));
ok("the chips, in order: Everything, People, PAX, Hospital OPD, Holidays, Degrees, Circulars & Notices, then (More tools) Executive Deep Search and Admin", [...auto.matchAll(/data-records-chip="(\w+)"/g)].map((m) => m[1]).join() === "auto,people,pax,hospital,holidays,degrees,documents,eds,admin" && /Circulars &amp; Notices/.test(auto) && /Hospital OPD/.test(auto));
ok("the Utility Services button opens its page and is marked while the page is open; EDS is the choice that is not a record, with its own words", /data-records-utility="true"/.test(auto) && !/aria-checked="true"[^>]*data-records-utility/.test(auto) && /aria-checked="true"[^>]*data-records-utility/.test(draw({}, null, { utilitiesOpen: true })) && /Executive Deep Search/.test(auto) && /Utility Services/.test(auto));
ok("Everything is the chosen one at the start, and nothing else is", /aria-checked="true"[^>]*data-records-chip="auto"/.test(auto) && count(auto, /aria-checked="true"/g) === 1);
ok("under Everything there is no hint, no examples, no finder, no People facets", !/data-records-hint|data-records-examples|data-records-finder|data-records-facet/.test(auto));
ok("no suggestion unless the typed line earns one", !/data-suggested|data-records-suggestion/.test(auto));

const eds = draw({ scope: "eds" }, null, { edsReady: true });
const edsLocked = draw({ scope: "eds" });
ok("EDS chosen: it alone is checked, its hint is shown, no example buttons (the questions to try are the shelf in the window, src/components/EdsExamples.tsx), no records hint", /aria-checked="true"[^>]*data-records-chip="eds"/.test(eds) && count(eds, /aria-checked="true"/g) === 1 && /built from several circulars read together/.test(eds) && !/data-records-examples/.test(eds) && count(eds, /<button type="button" class="rounded-full border border-neutral-200 bg-white px-2\.5/g) === 0);
ok("EDS chosen by someone who may not use it (a visitor, or a signed-in non-executive): only the prompt or the notice stands, NOT the hint and the example questions (the words would repeat the prompt's first line)", /aria-checked="true"[^>]*data-records-chip="eds"/.test(edsLocked) && !/built from several circulars read together/.test(edsLocked) && !/data-records-examples/.test(edsLocked) && !/data-records-hint/.test(edsLocked));
ok("a notice (EDS asked by a signed-in person who is not an executive) is announced as a status; none otherwise", /role="status" data-records-notice/.test(draw({ scope: "eds" }, null, { notice: "for executives" })) && !/data-records-notice/.test(eds));
ok("the address of an EDS question carries no selection (it travels as mode=intellectual)", selectionQuery({ ...AUTO_SELECTION, scope: "eds" }) === "");

const sug = draw({}, "pax");
ok("a suggestion marks that chip and says so in words, without choosing it", /data-suggested=""/.test(sug) && /data-records-suggestion/.test(sug) && /Looks like a <strong>PAX<\/strong> question/.test(sug) && /aria-checked="true"[^>]*data-records-chip="auto"/.test(sug));

const pax = draw({ scope: "pax" });
ok("a chosen selection is the only checked chip, shows its hint and tap-to-fill examples", /aria-checked="true"[^>]*data-records-chip="pax"/.test(pax) && count(pax, /aria-checked="true"/g) === 1 && /data-records-hint/.test(pax) && /Telephone extensions/.test(pax) && count(pax, /<button type="button" class="rounded-full border border-neutral-200 bg-white px-2\.5/g) === 4);
ok("a suggestion is never shown once a selection is chosen", !/data-records-suggestion/.test(draw({ scope: "pax" }, "hospital")));

const people = draw({ scope: "people", facet: "find" });
ok("People shows its three ways to look, the first chosen, with its hint and examples", count(people, /data-records-facet="/g) === 3 && /aria-checked="true"[^>]*data-records-facet="find"/.test(people) && /Name or number/.test(people) && /Department &amp; designation/.test(people) && /Ask in words/.test(people) && /data-records-examples/.test(people) && /rakesh ojha/.test(people));
const roster = draw({ scope: "people", facet: "roster" });
ok("Department & designation shows the finder (two lists, a name box, a button) and no examples", /data-records-finder/.test(roster) && /aria-label="Department"/.test(roster) && /aria-label="Designation"/.test(roster) && /aria-label="Part of a name \(optional\)"/.test(roster) && /data-records-run/.test(roster) && !/data-records-examples/.test(roster));
ok("the finder's button is disabled until something is picked or typed, then enabled", /data-records-run="true" disabled=""/.test(roster) && /data-records-run="true" class=/.test(draw({ scope: "people", facet: "roster", dept: "12" })) && !/data-records-run="true" disabled=""/.test(draw({ scope: "people", facet: "roster", grade: "7" })) && !/data-records-run="true" disabled=""/.test(draw({ scope: "people", facet: "roster", nm: "roy" })));
ok("the other facet has no finder", !/data-records-finder/.test(draw({ scope: "people", facet: "ask" })) && /Ask in words/.test(draw({ scope: "people", facet: "ask" })));

// ---- the Omnibar's wiring (source guards, like the other selftests)
const modal = readFileSync("src/components/OmnibarModal.tsx", "utf8");
const enterAt = modal.indexOf('if (e.key === "Enter" && !e.shiftKey)');
const enter = modal.slice(enterAt, modal.indexOf("placeholder={placeholderText}"));
const at = (n: string) => enter.indexOf(n);
ok("the bar is drawn under the box, with the selection, a way to change it, the planner's suggestion (only under Everything), the examples and the finder's button", /<RecordsScopeBar selection=\{selection\} onChange=\{changeSelection\} suggestion=\{selection\.scope === "auto" \? suggestion : null\} onExample=\{selection\.scope === "eds" \? runEds : runScoped\} onRunFinder=\{runFinder\} utilitiesOpen=\{toolForm === "services"\} onUtilities=\{openUtilities\} notice=\{edsNote\} edsReady=\{authStatus === "authenticated" && isExecutive\} adminReady=\{authStatus === "authenticated"\} onAdminHint=\{\(\) => \{ if \(authStatus === "authenticated"\) preloadManagementPanels\(\); if \(authStatus === "authenticated"\) prefetchSearch\("semantic", "management", \{ \.\.\.AUTO_SELECTION, scope: "admin" \}\); \}\} \/>/.test(modal));
ok("Enter: a calculator or other tool line still returns first; then a chosen selection is answered by its own engines; only then the ID, management and guessing paths", at("detectTool(qTrim)") > 0 && at("runScoped(qTrim)") > at("detectTool(qTrim)") && at("isIdQuery(qTrim)") > at("runScoped(qTrim)") && /selection\.scope !== "auto" && selection\.scope !== "documents"/.test(enter));
ok("Circulars & Notices keep the ordinary path minus the people name search and the AI that guesses a utility", /selection\.scope === "auto" && query\.trim\(\)\.length >= 2 && looksLikeNameSearch\(query\)/.test(enter) && /worthAsking\(qTrim\) && selection\.scope === "auto"/.test(enter));
ok("Enter under EDS goes to runEds (an executive straight to the deep synthesis, a visitor asked 'Are you an executive?', a signed-in non-executive told so), before the other selections", at("runEds(qTrim)") > at("detectTool(qTrim)") && at("runEds(qTrim)") < at("runScoped(qTrim)") && /triggerSearch\("intellectual", \{ query: text \}\)/.test(modal) && /setExecutiveAsk\(\{ query: text, said: null \}\)/.test(modal) && /if \(!isExecutive\) \{\s*setEdsNote\(/.test(modal));
ok("the Utility Services button clears the box and any answer and opens the page of all the utilities", /const openUtilities = \(\) => \{[\s\S]*?setQuery\(""\);[\s\S]*?setSelection\(AUTO_SELECTION\);\s*setToolForm\("services"\);/.test(modal) && /utilitiesOpen=\{toolForm === "services"\} onUtilities=\{openUtilities\}/.test(modal));
ok("choosing another choice WIPES the words in the box", /const changeSelection = \(next: Selection\) => \{[\s\S]*?clearSearch\(\);\s*setQuery\(""\);/.test(modal));
ok("EDS pressed: a visitor is asked 'Are you an executive?' at once (Yes: opens the login window; No: back to Everything), a signed-in non-executive is told, an executive just gets the box", /if \(next\.scope === "eds"\) \{\s*if \(authStatus === "unauthenticated"\) \{ setExecutiveAsk\(\{ query: "", said: null \}\)/.test(modal) && /else if \(authStatus === "authenticated" && !isExecutive\) setEdsNote\(EDS_NOT_EXECUTIVE\)/.test(modal) && /if \(executiveAsk\.query === ""\) \{ changeSelection\(\{ \.\.\.AUTO_SELECTION \}\); return; \}/.test(modal) && !/scope: "documents"/.test(modal));
ok("...and a visitor who signs in as an executive after pressing the button has the card taken away (nothing waits to resume)", /if \(ask && ask\.query === "" && isExecutive\) setExecutiveAsk\(null\)/.test(modal));
ok("the Utility Services page stands ALONE: the box, the choices and what hangs under them are left out while it is open (and while a calculator opened from it is), it ends when the page is closed, and Escape goes back to the ordinary window", /const utilityFocus = utilityShellOn && toolForm !== null;/.test(modal) && /\{!pageAlone && \(\s*<>[\s\S]*Multiline Search Input Header[\s\S]*<RecordsScopeBar[\s\S]*\{loginHint && <OmniLoginHint[^\n]*\n\s*<\/>\s*\)\}/.test(modal) && /if \(toolForm === null\) setUtilityShellOn\(false\)/.test(modal) && /e\.key === "Escape" && toolForm === "services"/.test(modal));
ok("the top bar's own Escape (which closes the whole search window) stands aside while the page is alone: the modal marks itself with data-escape-back and the top bar returns early when it finds the mark", /\{pageAlone && <span data-escape-back="true" hidden \/>\}/.test(modal) && /const pageAlone = utilityFocus \|\| adminFocus;/.test(modal) && /document\.querySelector\('\[data-escape-back="true"\]'\)\) return;\s*setIsOmnibarOpen\(false\)/.test(readFileSync("src/components/TopBar.tsx", "utf8")));
ok("the Utility Services page has a Back button (to the search) at its top right, not a cross", /onBack=\{onClose\}\s*backLabel="Back to the search"/.test(readFileSync("src/components/tools/UtilityServicesPage.tsx", "utf8")));
ok("the Utility Services button turns the page-alone state on", /const openUtilities = \(\) => \{\s*setUtilityShellOn\(true\);/.test(modal));
ok("People > Department & designation: Enter in the main box does nothing (the lists and their button run it)", /selection\.facet === "roster"\) return;/.test(enter));
ok("choosing another selection leaves nothing of the old one (results, search, utility, question) and the selection is part of the live number lookup's condition", /const changeSelection = \(next: Selection\) => \{[\s\S]*?clearSearch\(\);[\s\S]*?setExecutiveAsk\(null\);/.test(modal) && /const idLive = selection\.scope === "auto" \|\| \(selection\.scope === "people" && selection\.facet === "find"\)/.test(modal));
ok("the finder labels the box with its own words and asks the server once with the selection in the address", /triggerSearch\("semantic", \{ query: finderLabel\(\{ \.\.\.labels, nm: selection\.nm \}\) \}\)/.test(modal));
ok("the as-you-type guesses (a utility, a name) and the Enter-time utility guess are off under every chosen selection, Circulars & Notices included", /return selection\.scope !== "auto" \|\| toolForm/.test(modal) && /if \(selection\.scope === "auto"\) \{\s*const understood = clearIntent\(qTrim\);/.test(modal) && /if \(selection\.scope !== "auto" \|\| NAME_HINT_MODE === "off"/.test(modal));
ok("intranet-site links are shown beside the answers of Everything only", /mode === "intellectual" \|\| selection\.scope !== "auto"\) return \[\]/.test(modal));
const hook = readFileSync("src/hooks/useOmniSearch.ts", "utf8");
ok("the selection is part of every search address (so an answer under one selection is never shown under another) and every opening starts on Everything", /\$\{selectionQuery\(sel\)\}/.test(hook) && /setSelection\(AUTO_SELECTION\)/.test(hook));
const route = readFileSync("src/app/api/ai-search/route.ts", "utf8");
ok("the route reads the selection from the address only, validated (anything unknown is Everything), and answers a chosen one before the name checks and the model router", /parseScope\(searchParams\.get\("scope"\)\)/.test(route) && route.indexOf("answerScoped(") > 0 && route.indexOf("answerScoped(") < route.indexOf("const endNameChecks") && route.indexOf("answerScoped(") < route.indexOf("parseQueryWithLlm(q)"));
ok("under Circulars & Notices no person, department or router is consulted", /const recordsOpen = scope === "auto"/.test(route) && /recordsOpen && looksLikeName\b/.test(route) && /const toolCall = recordsOpen && mode === "semantic"/.test(route) && /if \(recordsOpen && mode === "semantic" && !retrievalOnly\) \{\s*const endOmnibar/.test(route));
ok("a chosen selection that finds nothing never reaches the circular search (the scoped answer is returned, whatever it is)", /return NextResponse\.json\(\{ analytics: payload \}\);\s*\}\s*const recordsOpen/.test(route));

// ---- Admin (More tools)
const admin = draw({ scope: "admin" }, null, { adminReady: true });
const adminLocked = draw({ scope: "admin" });
ok("Admin sits in More tools after Executive Deep Search, with the label 'Admin'", /data-records-more[\s\S]*data-records-chip="eds"[\s\S]*data-records-chip="admin"[^>]*>[\s\S]*?Admin/.test(auto) && /aria-label="More tools"/.test(auto));
ok("Admin chosen: it alone is checked; its hint and examples show once a signed-in person has pressed it", /aria-checked="true"[^>]*data-records-chip="admin"/.test(admin) && count(admin, /aria-checked="true"/g) === 1 && /data-records-hint/.test(admin) && /management/.test(admin) && /employee|pax directory management/.test(admin));
ok("Admin chosen by a visitor: only the question stands (no hint, no examples, the words would repeat it)", /aria-checked="true"[^>]*data-records-chip="admin"/.test(adminLocked) && !/data-records-hint|data-records-examples/.test(adminLocked));
console.log(`RecordsScopeBar: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
