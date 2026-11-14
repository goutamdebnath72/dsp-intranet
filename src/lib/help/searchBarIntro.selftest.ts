// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/lib/help/searchBarIntro.selftest.ts
// The introduction to the search bar must not fall behind the search: every tool the registry knows is named in it, and it says plainly what cannot be answered.
import { AREAS, CALCULATORS_LINE, INTRO_LEAD, LIMITS, START } from "./searchBarIntro";
import { TOPIC_UIS } from "@/tools/registry.ui";
import { TOPICS } from "@/tools/registry";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };
const text = AREAS.map((a) => `${a.label} ${a.detail}`).join(" ").toLowerCase();

// the word of the introduction that names each topic of the registry (a new topic with no word here fails: add it to AREAS and to this table)
const NAMED_BY: Record<string, string> = { calc: "calculator", emi: "emi", pf: "pf", gratuity: "gratuity", encashment: "encashment", dates: "dates", converter: "converters", tyre: "tyre", rim: "rim", ev: "ev ", vin: "vin", bh: "bh-series", gold: "gold", markets: "sensex", fuel: "petrol", news: "news", sports: "sports", weather: "weather", flights: "flights", railway: "trains", aicpi: "inflation" };
const unmapped = TOPICS.map((t) => t.id).filter((id) => !NAMED_BY[id]);
ok("every topic of the registry has a word in the table below (so a new tool cannot be forgotten)", unmapped.length === 0, unmapped.join());
ok("every topic of the registry is named in the introduction", TOPICS.every((t) => !NAMED_BY[t.id] || text.includes(NAMED_BY[t.id])), TOPICS.filter((t) => !text.includes(NAMED_BY[t.id])).map((t) => t.id).join());
ok("the introduction covers the intranet's own data: circulars, holidays, employees, departments, hospital, doctors, PAX numbers, announcements, sites", ["circulars", "holiday", "employees", "departments", "hospital", "doctors", "pax", "announcements", "intranet sites"].every((w) => text.includes(w)));
ok("it says the one-year graphs exist (fuel, gold and silver, dollar-rupee) and that Deep Synthesis is for executives", (text.match(/one-year/g) ?? []).length >= 3 && /deep synthesis \(executives\)/.test(text));
ok("it says what the bar is, and how to start in three steps", /click it/.test(INTRO_LEAD) && /ctrl \+ k/i.test(INTRO_LEAD) && /omnibar/.test(INTRO_LEAD) && /backed by ai/i.test(INTRO_LEAD) && START.length === 3);
ok("it says plainly that plant production data cannot be answered yet, that AI can be wrong, and that nothing typed in a tool is saved", LIMITS.some((l) => /plant production data is not answered yet/i.test(l)) && LIMITS.some((l) => /ai can make mistakes/i.test(l)) && LIMITS.some((l) => /not saved or sent/i.test(l)));
ok("it says plainly what is not there yet (nearby EV charging stations) and that the flights are a timetable, not live status", LIMITS.some((l) => /ev charging stations are not available yet/i.test(l)) && LIMITS.some((l) => /timetable, not live status/i.test(l)));
ok("every area has a name and a detail, and none is listed twice", AREAS.every((a) => a.label.length > 3 && a.detail.length > 10) && new Set(AREAS.map((a) => a.label)).size === AREAS.length);
// the one line about the Calculators command names every tool of the menu the command really opens
const menuTitles = TOPIC_UIS.flatMap((u) => (u.form ? [u.form.menu.title] : []));
const lineText = CALCULATORS_LINE.tools.join(" ").toLowerCase();
const wordOf = (title: string) => title.toLowerCase().replace(/ \(.*$/, "").split(" ")[0];
ok("the Calculators line names the command and says Enter opens a menu", CALCULATORS_LINE.command === "calculators" && /Enter/.test(CALCULATORS_LINE.after) && /menu/.test(CALCULATORS_LINE.after));
ok("every tool of the calculators menu is named in that line (a new tool cannot be forgotten)", menuTitles.length >= 11 && menuTitles.every((m) => lineText.includes(wordOf(m))), menuTitles.filter((m) => !lineText.includes(wordOf(m))).join(" | "));
ok("the line lists no tool the menu does not have", CALCULATORS_LINE.tools.length === menuTitles.length, `${CALCULATORS_LINE.tools.length} vs ${menuTitles.length}`);
ok("the limits say train fares are approximate and saved, and that CPI and inflation are MoSPI's saved data", LIMITS.some((l) => /fares are approximate/i.test(l) && /13 December 2026/.test(l)) && LIMITS.some((l) => /MoSPI/.test(l)));
console.log(`searchBarIntro: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
