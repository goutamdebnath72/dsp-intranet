// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/lib/help/searchBarIntro.selftest.ts
// The introduction to the search bar (first tab of the guide) lists the MAIN features; the Utility Services have a tab of their own (utilityServices.selftest.ts). It says plainly what cannot be answered.
import { AREAS, INTRO_LEAD, LIMITS, START, UTILITY_POINTER } from "./searchBarIntro";
import { UTILITY_SERVICES } from "./utilityServices";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };
const text = AREAS.map((a) => `${a.label} ${a.detail}`).join(" ").toLowerCase();

// ---- the main features, in the owner's order (17 Nov 2026)
ok("the main features come first and in this order: circulars (title and content), EDS (executives only), employees, departments, holidays; then hospital, PAX, announcements and sites", AREAS.map((a) => a.label).join("|") === "Circulars, by title and by content|Executive Deep Search (EDS) on circulars, for executives only|Employees, in many ways|Departments|Holidays|Hospital OPDs and doctors|PAX telephone numbers|Announcements and intranet sites", AREAS.map((a) => a.label).join("|"));
ok("the introduction covers the intranet's own data: circulars, holidays, employees, departments, hospital, doctors, PAX numbers, announcements, sites", ["circulars", "holiday", "employees", "departments", "hospital", "doctors", "pax", "announcements", "intranet sites"].every((w) => text.includes(w)));
ok("circulars are found by title and by content, the answer names the circular and opens it", /by the words of its heading/.test(text) && /inside the circulars/.test(text) && /names the circular and opens it/.test(text));
ok("employees: by ticket, CUG mobile (or the last 4 digits of an executive's) and SAIL personal number as you type, by name with a different spelling, with or without the department, and counts, designations and seniority", /ticket number/.test(text) && /cug mobile/.test(text) && /last 4 digits of an executive/.test(text) && /sail personal number/.test(text) && /as you type/.test(text) && /different spelling still finds the person/.test(text) && /with or without the department/.test(text) && /counts, designations and seniority/.test(text));
ok("departments: the site link, who is in charge, how many work there, the count by designation, the PAX numbers", /department's name/.test(text) && /intranet site link/.test(text) && /who is in charge/.test(text) && /how many people work there/.test(text) && /count by designation/.test(text) && /pax numbers/.test(text));
const eds = AREAS[1];
ok("EDS is named as a main feature: for signed-in executives only, a written summary across several circulars with the circulars it rests on, anyone else is asked and otherwise gets the ordinary answer, and the Deep search (EDS) tab tells all", /Executive Deep Search \(EDS\)/.test(eds.label) && /executives only/.test(eds.label) && /several circulars read together/.test(eds.detail) && /one written summary with the circulars it rests on/.test(eds.detail) && /signed-in executive/.test(eds.detail) && /anyone else is asked first/.test(eds.detail) && /Deep search \(EDS\) tab/.test(eds.detail));
ok("nothing else of the deep search is on this tab (no 'briefing', no 'Deep Synthesis', no score or model), and no Good-to-know point is about it", !/deep synthesis|briefing|score|gemini/i.test(AREAS.map((a) => a.detail).join(" ")) && !LIMITS.some((l) => /deep synthesis|\bEDS\b|deep search/i.test(l)));
ok("every area has a name and a detail, and none is listed twice", AREAS.every((a) => a.label.length > 3 && a.detail.length > 10) && new Set(AREAS.map((a) => a.label)).size === AREAS.length);

// ---- the utilities are not here: they have their own tab, and the pointer says so
ok("no Utility Service is listed among the main features (each is on the Utility Services tab)", !AREAS.some((a) => UTILITY_SERVICES.some((s) => s.label === a.label)) && !/\b(gold|petrol|sensex|weather|flights|trains|tyre|calculator|news)\b/.test(text), AREAS.map((a) => a.label).filter((l) => UTILITY_SERVICES.some((s) => s.label === l)).join());
ok("the pointer names the term Utility Services, says they help employees in different ways, are auxiliary, and have a tab of their own with the words that open each", UTILITY_POINTER.term === "Utility Services" && /help employees in different ways/.test(UTILITY_POINTER.before) && /a host of/.test(UTILITY_POINTER.before) && /auxiliary/.test(UTILITY_POINTER.after) && /tab of their own/.test(UTILITY_POINTER.after) && /words that open each one/.test(UTILITY_POINTER.after));

// ---- what the bar is, how to start, what it cannot do
ok("it says what the bar is, and how to start in three steps", /click it/.test(INTRO_LEAD) && /ctrl \+ k/i.test(INTRO_LEAD) && /omnibar/.test(INTRO_LEAD) && /backed by ai/i.test(INTRO_LEAD) && START.length === 3);
ok("the lead says the main work is finding things in the plant's own records and that a host of Utility Services has a tab of its own", /main work is to find things in the plant's own records/.test(INTRO_LEAD) && /host of Utility Services/.test(INTRO_LEAD) && /tab of their own/.test(INTRO_LEAD));
ok("it says plainly that plant production data cannot be answered yet, that AI can be wrong, and that the management pages are the HOD's to open", LIMITS.some((l) => /plant production data is not answered yet/i.test(l)) && LIMITS.some((l) => /ai can make mistakes/i.test(l)) && LIMITS.some((l) => /management pages/i.test(l)));
ok("the notes of this tab are the three general ones; the notes about the services (prices, shares, steel, flights, trains, fares, PIN codes, inflation, DA, PF, calculators) are on the Utility Services tab", LIMITS.length === 3 && !LIMITS.some((l) => /fares|flights|shares card|calculator|MoSPI|PIN codes/i.test(l)));
ok("no 'Good to know' point is long: each is under 400 characters", LIMITS.every((l) => l.length < 400), LIMITS.filter((l) => l.length >= 400).map((l) => `${l.length}: ${l.slice(0, 40)}`).join(" | "));
console.log(`searchBarIntro: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
