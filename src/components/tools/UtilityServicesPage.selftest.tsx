// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/components/tools/UtilityServicesPage.selftest.tsx
// The page of all the utility services: one card for every topic of the registry, A to Z, opened by "utility services", with Back arrows and the guide pointing to it.
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { buildServiceCards, GROUP_FORMS, GROUP_INFO, pickType } from "./serviceCards";
import { UtilityServicesPage } from "./UtilityServicesPage";
import { ToolPanel } from "./ToolPanel";
import { TOPICS } from "@/tools/registry";
import { TOPIC_UIS } from "@/tools/registry.ui";
import { detectTool, isLive } from "@/lib/tools/detect";
import { SERVICES_LINE } from "@/lib/help/utilityServices";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };
const cards = buildServiceCards();
const html = renderToStaticMarkup(<UtilityServicesPage onClose={() => {}} onOpen={() => {}} />);
const titlesInPage = [...html.matchAll(/data-service-card="([^"]+)"/g)].map((m) => m[1]);

// ---- the cards come from the registry
const openable = (TOPICS as readonly { id: string }[]).filter((t) => { const u = TOPIC_UIS.find((x) => x.id === t.id); return !!u?.form || !!u?.live; }).map((t) => t.id);
ok("every topic that has a page or a live card is a card, and nothing else is", cards.length === openable.length && openable.every((id) => cards.some((c) => c.id === id)), `${cards.length} / ${openable.length}`);
ok("there are more than twenty cards", cards.length > 20, String(cards.length));
ok("the cards stand A to Z by title", cards.every((c, i) => i === 0 || cards[i - 1].title.localeCompare(c.title, "en", { sensitivity: "base", numeric: true }) <= 0), cards.map((c) => c.title).join(" | "));
ok("the page draws them in that order", JSON.stringify(titlesInPage) === JSON.stringify(cards.map((c) => c.id)));
ok("every card has a title, a sentence, an icon, a tone and the words that open it", cards.every((c) => c.title.length > 2 && c.text.length > 10 && !!c.icon && !!c.tone && c.type.trim().length >= 2));
ok("a calculator or reader is in the group of calculators and readers, a live card in information and guides", cards.every((c) => (c.kind === "form") === (c.group === GROUP_FORMS) && (c.kind === "live") === (c.group === GROUP_INFO)));
ok("both groups have cards", cards.some((c) => c.group === GROUP_FORMS) && cards.some((c) => c.group === GROUP_INFO));
ok("a calculator's card says what its tile in the list of calculators says (the two lists agree)", cards.filter((c) => c.kind === "form").every((c) => { const f = TOPIC_UIS.find((u) => u.id === c.id)!.form!; return c.title === f.menu.title && c.text === f.menu.text; }));
// the words on a card really open that topic
const words = cards.map((c) => [c.id, c.kind, detectTool(c.type)?.kind ?? "nothing"] as const).filter(([, kind, got]) => (kind === "live" ? got !== "live" : got === "nothing"));
ok("the words shown on every card are understood by the search bar (a live card opens a live card; a calculator opens its page or answers as you type)", words.length === 0, JSON.stringify(words));

ok("a card shows a short sample, never a long sentence", cards.every((c) => c.type.length <= 24) || cards.every((c) => c.type.length <= 40), cards.map((c) => c.type).join(" | "));
ok("the words on a card are the first sample of 5 to 24 characters, else the first", pickType([{ q: "durgapur weather report with forecast" }, { q: "weather" }], "x") === "weather" && pickType([{ q: "dgr" }, { q: "trains" }], "x") === "trains" && pickType([{ q: "a" }], "x") === "a" && pickType([], "fallback") === "fallback");

// ---- the page
ok("the page is called Utility Services and says how many there are", /Utility Services/.test(html) && new RegExp(`${cards.length} helpers beside the main search, A to Z`).test(html));
ok("three filters: all, calculators and readers, information and guides, with their counts", /data-service-filter="all"/.test(html) && html.includes(`data-service-filter="${GROUP_FORMS.replace("&", "&amp;")}"`) && html.includes(`data-service-filter="${GROUP_INFO.replace("&", "&amp;")}"`) && /aria-pressed="true"[^>]*data-service-filter="all"/.test(html));
ok("every card names the words that open it", (html.match(/data-service-type/g) ?? []).length === cards.length);
ok("a card is a button (the keyboard works)", (html.match(/<button[^>]*data-service-card/g) ?? []).length === cards.length);
ok("the page has a cross that closes it and points to the calculators list in its tip", /aria-label="Close the utility services"/.test(html) && /data-service-tip/.test(html) && /calculators<\/code>/.test(html));
ok("no privacy notice about typing (there is nothing to type into here)", !/data-tool-notice|approximate/i.test(html));

// ---- the search bar opens it
ok("'utility services' and its short forms open the page, 'calculators' still opens the list of calculators", ["utility services", "utilities", "all utilities", "list of utilities", "utility"].every((q) => detectTool(q)?.kind === "services") && detectTool("calculators")?.kind === "menu" && detectTool("tools")?.kind === "menu");
ok("an ordinary search that merely contains the word is not taken for it", ["utilities department", "utility bill circular", "services in c&it", "services", "electricity utility staff"].every((q) => detectTool(q)?.kind !== "services"));
const panel = (query: string, form: Parameters<typeof ToolPanel>[0]["form"] = null) => renderToStaticMarkup(<ToolPanel query={query} form={form} onForm={() => {}} />);
ok("typed, it shows 'Press Enter to open all the utility services'", /data-services-hint/.test(panel("utility services")) && /Press[\s\S]{0,200}Enter[\s\S]{0,60}utility services/.test(panel("utility services")));
ok("opened, the panel draws the page", /data-service-grid/.test(panel("", "services")) && !/data-services-hint/.test(panel("", "services")));
ok("a calculator page opened from the page goes back to it (the Back arrow says so), and one opened from the list of calculators goes back to that", (() => { const src = readFileSync("src/components/tools/ToolPanel.tsx", "utf8"); return /setFrom\("services"\)/.test(src) && /setFrom\("menu"\)/.test(src) && /onBack=\{\(\) => onForm\(from\)\}/.test(src) && /Back to the utility services/.test(src); })());
ok("a live card opened in place has its own Back arrow to the page and closes with the page", (() => { const src = readFileSync("src/components/tools/ToolPanel.tsx", "utf8"); return /onBack=\{\(\) => setLiveOpen\(null\)\}/.test(src) && /if \(form !== "services"\) setLiveOpen\(null\)/.test(src); })());
ok("the search window's Enter key opens it", /isListPage\(tool\.kind\)\) setToolForm\(tool\.kind\)/.test(readFileSync("src/components/OmnibarModal.tsx", "utf8")));

// ---- the guide points to it
const guide = readFileSync("src/components/help/UtilityServicesTab.tsx", "utf8");
ok("the Utility Services tab of the guide tells the reader about the page", /SERVICES_LINE/.test(guide) && /data-services-line/.test(guide) && SERVICES_LINE.command === "utility services" && detectTool(SERVICES_LINE.command)?.kind === "services");

console.log(`UtilityServicesPage selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
