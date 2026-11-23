// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/components/EdsExamples.selftest.tsx </dev/null
// The shelf of proven questions under Executive Deep Search: every proven question is on it once, each reaches EDS as typed, each is a link that runs when pressed, and the window shows it only to an executive who has asked nothing yet.
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EdsExamples } from "./EdsExamples";
import { edsShelf, edsShelfQuestions, KEYWORD_GROUPS, SHELF_TEMPLATES } from "@/lib/help/edsExamples";
import { TEST_QUERIES, TEMPLATES } from "@/lib/help/edsGuide";
import { detectSynthesisIntent } from "@/lib/search/synthesisIntent";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;"); // how React writes text into HTML
const items = edsShelfQuestions();
const ids = items.map((i) => i.id);
ok("every question of the guide is on the shelf, exactly once, and the shelf adds A-C3 (plain words, verified on screen) and H01-H08 (the 'hidden' type, tried on 23 Nov 2026)", TEST_QUERIES.every((t) => ids.filter((i) => i === t.id).length === 1) && ids.length === TEST_QUERIES.length + 1 + 8 && ["A-C3", "H01", "H02", "H03", "H04", "H05", "H06", "H07", "H08"].every((i) => ids.includes(i)) && new Set(ids).size === ids.length, ids.join());
ok("the shelf holds the guide's questions word for word (one source)", TEST_QUERIES.every((t) => items.find((i) => i.id === t.id)?.q === t.q));
const notDeep = items.filter((i) => !detectSynthesisIntent(i.q).synthesis);
ok("every question reaches Executive Deep Search as typed (the real detector says synthesis)", notDeep.length === 0, notDeep.map((i) => i.id).join());
ok("the shelf has the FOUR TYPES of the keywords, in the same order and under the same titles (hidden, action words, what changed, stage by stage)", edsShelf().map((g) => g.id).join() === KEYWORD_GROUPS.map((k) => k.id).join() && edsShelf().every((g, i) => g.title === KEYWORD_GROUPS[i].title && g.blurb.length > 10));
const typeOf = (id: string) => edsShelf().find((g) => g.items.some((i) => i.id === id))?.id;
ok("every question is filed under exactly one type; 32 questions in all", items.every((i) => edsShelf().filter((g) => g.items.some((x) => x.id === i.id)).length === 1) && items.length === 32);
ok("every type has questions (the 'hidden' type has eight), none shows a template, and the guide's wording is untouched", edsShelf().every((g) => g.items.length > 0 && !g.templates) && edsShelf()[0].items.length === 8);
const HID = /\b(correlat\w+|hidden|overlooked|inconsisten\w+|contradict\w*|discrepanc\w+|implications?|insights?|anomal\w+|big picture)\b/i;
const hiddenBad = edsShelf()[0].items.filter((i) => !HID.test(i.q) || detectSynthesisIntent(i.q).score < 5);
ok("each 'hidden' question is built on a word of the 'enough on their own' list and reaches EDS on that word alone (5 points or more from discovery language)", hiddenBad.length === 0 && edsShelf()[0].items.every((i) => detectSynthesisIntent(i.q).reasons.some((r) => /discovery language/.test(r))), hiddenBad.map((i) => i.id).join());
ok("each 'hidden' question says what it found when tried, in the shelf's own note", edsShelf()[0].items.every((i) => /^Found when tried:/.test(i.note ?? "")));
const rest = items.filter((i) => !i.id.startsWith("H")); // the "hidden" questions are filed first: their word carries the question alone
ok("a question that contains a keyword stands under that keyword's type (hidden words > stage-by-stage words > what-changed words > action words)", rest.filter((i) => /\bat each stage|for each level|for every category|grade-wise/i.test(i.q)).every((i) => typeOf(i.id) === "stages") && rest.filter((i) => /\b(differ\w*|change between|first announced|corrected to|corrigendum changed|it changes)\b/i.test(i.q)).every((i) => typeOf(i.id) === "versions") && rest.filter((i) => /\b(compare|compare[sd]?)\b/i.test(i.q) && !/\b(differ\w*|at each stage)\b/i.test(i.q) && !/(corrigendum|amendment)/i.test(i.q) && !/football/i.test(i.q) === true).every((i) => ["verbs", "versions"].includes(typeOf(i.id) ?? "")));
ok("every question says what it teaches and which circulars it reads", items.every((i) => i.kind.length > 2 && i.needs.length > 10));
ok("the honesty test (E23) says so in plain words and reads 'nothing', not the project's test note; no developer note (scored / panel / went to the normal search) reaches a reader", /do not state/.test(items.find((i) => i.id === "E23")?.note ?? "") && /^nothing/.test(items.find((i) => i.id === "E23")?.needs ?? "") && items.every((i) => !/scored|panel|went to the normal search/i.test(`${i.note ?? ""} ${i.needs}`)));
ok("the templates at the foot are the guide's", SHELF_TEMPLATES === TEMPLATES && TEMPLATES.length >= 3);

// drawn
const picked: string[] = [];
const html = renderToStaticMarkup(<EdsExamples onPick={(q) => picked.push(q)} />);
ok("every question is drawn once as a link (an anchor with an address) with its text", items.every((i) => html.includes(`data-eds-example="${i.id}"`)) && (html.match(/data-eds-example=/g) ?? []).length === items.length && (html.match(/<a href="#eds-question"[^>]*data-eds-example=/g) ?? []).length === items.length && items.every((i) => html.includes(esc(i.q))));
ok("the groups are drawn in order, each with its heading", edsShelf().every((g) => html.includes(`data-eds-group="${g.id}"`) && html.includes(g.title)) && edsShelf().map((g) => html.indexOf(`data-eds-group="${g.id}"`)).every((p, i, a) => i === 0 || p > a[i - 1]));
ok("the panel is a labelled section (a landmark) with a header saying what EDS is and the count, and a 'Write your own' foot", /data-eds-shelf/.test(html) && /<section data-eds-shelf="true" aria-label="Executive Deep Search: questions to try"/.test(html) && /Executive Deep Search/.test(html) && /questions to try/.test(html) && /data-eds-own/.test(html) && /Write your own/.test(html));
ok("each question names the circulars it reads, and its kind", items.every((i) => html.includes(esc(i.kind)) && html.includes(esc(i.needs))));


// the keywords, scored by the real detector
const probe = (g: (typeof KEYWORD_GROUPS)[number], w: string) => g.probe.replace("{w}", w);
const aloneBad = KEYWORD_GROUPS.filter((g) => g.alone).flatMap((g) => g.words.filter((w) => detectSynthesisIntent(`What ${w} do the circulars show?`).score < 5));
ok("each word of the 'enough alone' list reaches 5 points by itself", aloneBad.length === 0, aloneBad.join());
const withBad = KEYWORD_GROUPS.filter((g) => !g.alone).flatMap((g) => g.words.filter((w) => !detectSynthesisIntent(probe(g, w)).synthesis));
ok("each other keyword makes a deep question once two years are named (3 + 2 points)", withBad.length === 0, withBad.join());
const notAloneBad = KEYWORD_GROUPS.filter((g) => !g.alone).flatMap((g) => g.words.filter((w) => detectSynthesisIntent(g.probe.replace("{w}", w).replace(" the 2023 and 2024 circulars", " the circulars").replace(" in the 2023 and 2024 circulars", " in the circulars").replace(" in the 2023 and 2024 circulars?", " in the circulars?")).synthesis));
ok("...and does NOT reach EDS alone, so the text is right to say it needs one more clue", notAloneBad.length === 0, notAloneBad.join());
ok("the keywords are drawn, group by group, each word once", KEYWORD_GROUPS.every((g) => html.includes(`data-eds-keyword-group="${g.id}"`) && g.words.every((w) => html.includes(`data-eds-keyword="${w}"`))));
ok("the text above the questions says they are examples; the text above the keywords says a keyword makes the bar recognise it at once, that Enter runs one's own, and that under the button every question is already deep", /Examples, to show what a deep question looks like/.test(html) && /recognised as a deep question at once/.test(html) && /Press Enter to run it/.test(html) && /every question already runs as a deep question/.test(html));
ok("the keywords come BEFORE the questions (the user asked for the explanation above the list)", html.indexOf("data-eds-keywords") > 0 && html.indexOf("data-eds-keywords") < html.indexOf("data-eds-group="));
ok("brief: the intro lines are one or two short sentences (under 200 characters each)", [/Examples, to show[^<]*/, /Keep one of these keywords[^<]*/, /With this button chosen[^<]*/].every((r) => (html.match(r)?.[0].length ?? 999) < 200));

// the source: pressing runs it
const comp = readFileSync("src/components/EdsExamples.tsx", "utf8");
ok("pressing a question calls onPick with that question's own text, and the page does not jump (preventDefault)", /onClick=\{\(e\) => \{ e\.preventDefault\(\); onPick\(it\.q\); \}\}/.test(comp));
ok("it can be reached and used from the keyboard (an anchor with an address, a visible focus ring)", /href="#eds-question"/.test(comp) && /focus-visible:ring-2/.test(comp));

const modal = readFileSync("src/components/OmnibarModal.tsx", "utf8");
ok("the window runs a pressed question as Executive Deep Search at once (runEds: the text goes into the box and the search starts; no Enter)", /\{edsShelfOpen && <EdsExamples onPick=\{\(q\) => runEds\(q, true\)\} \/>\}/.test(modal) && /const runEds = \(line: string, picked = false\) => \{[\s\S]*?triggerSearch\("intellectual", \{ query: text \}\);/.test(modal));
ok("the shelf shows only to an executive who chose the button and has asked nothing (no search made, not loading, no 'Are you an executive?', no notice, no utility page open)", /const edsExecutive = selection\.scope === "eds" && authStatus === "authenticated" && isExecutive;/.test(modal) && /const edsShelfOpen = edsExecutive && mode === null && !isLoading && !executiveAsk && !edsNote && !toolForm;/.test(modal));
ok("above an answer, 'All sample questions' brings the shelf back and empties the box", /edsBackLink = edsExecutive && mode !== null && !isLoading && edsPicked !== null/.test(modal) && /data-eds-back/.test(modal) && /const backToEdsShelf = \(\) => \{[^}]*clearSearch\(\); setQuery\(""\)/.test(modal));
ok("a question the person types still needs Enter (the Enter handler is the only other way into runEds)", /runEds\(qTrim\);/.test(modal));
const bar = readFileSync("src/components/RecordsScopeBar.tsx", "utf8");
ok("the bar shows no example buttons under Executive Deep Search any more (the shelf is the examples)", /scope === "eds" \? \[\] : scope === "admin"/.test(bar) && !/EDS_CHOICE\.examples/.test(bar));

ok("once a deep answer is on screen the row of buttons (RecordsScopeBar) is taken away for room, and it is drawn again with the way back (or when the box text changes: isStale)", /const deepAnswerShown = mode === "intellectual" && !isLoading && !isStale && !!synthesis;/.test(modal) && /\{!deepAnswerShown && \(\s*<RecordsScopeBar/.test(modal));
ok("a question PRESSED from the samples has 'All sample questions' (back to the shelf and the buttons); a question TYPED (or sent to the deep search by Enter in Everything) has a plain 'Back' to the ordinary window: Everything, empty box", /const deepBack = deepAnswerShown && !edsBackLink;/.test(modal) && /data-eds-back-default onClick=\{backToDefault\}/.test(modal) && /const backToDefault = \(\) => \{[^}]*setSelection\(AUTO_SELECTION\); clearSearch\(\); setQuery\(""\)/.test(modal) && /setEdsPicked\(picked \? text : null\)/.test(modal));
console.log(`EdsExamples selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
