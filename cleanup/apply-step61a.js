#!/usr/bin/env node
// cleanup/apply-step61a.js -- Step 61a: degree questions answered from the table, the clean answer first for holiday and health check-up answers, no wasted people search on sentences,
// a document that does not answer the question loses its percentage, an empty health check-up date says why.
//   - nl2sql/omnibar.ts: the degree route (step 0c), the health check-up headline, the empty-date explanation
//   - employees/analytics.ts and hooks/useOmniSearch.ts: the shared `headline` type; the holiday answers carry their headline
//   - components/OmnibarModal.tsx: the headline above the answer, the name-search gate, the one honest line above weak results
//   - hooks/useOmniSearch.ts: weak results are marked once per answer
// Four existing files change in place; everything else of the patch is a new file (unzip). Each change is checked on its own: already there: skipped; missing: made; place not recognised: nothing is written. Safe to run again.
const fs = require("fs");
const path = require("path");
const root = process.cwd();
const NEEDS = ["src/lib/qualifications/degreeAnswer.ts", "src/lib/ui/answerHeadline.ts", "src/components/AnswerHeadline.tsx", "src/lib/nl2sql/healthHeadline.ts", "src/lib/nl2sql/healthDates.ts", "src/lib/search/nameSearchGate.ts", "src/lib/search/weakMatch.ts"];
const EDITS = {
 "src/lib/nl2sql/omnibar.ts": [
  [
   "import { answerPhd } from \"./phdHolders\";\n",
   "import { answerPhd } from \"./phdHolders\";\nimport { answerDegreeQuestion } from \"@/lib/qualifications/degreeAnswer\";\n",
   "import { answerDegreeQuestion } from \"@/lib/qualifications/degreeAnswer\";"
  ],
  [
   "    if (phd?.kind === \"people\") return okToPayload(phd.res, userKey, deps, attempt, phd.note);\n",
   "    if (phd?.kind === \"people\") return okToPayload(phd.res, userKey, deps, attempt, phd.note);\n\n    // 0c. a question about the DEGREES themselves (\"what are the post graduate degrees in engineering\", \"is MD a postgraduate degree\", \"what is mtech\"): answered from the table of degrees, no model call, never about people (step 61a)\n    const degrees = answerDegreeQuestion(q);\n    if (degrees) return { kind: \"count\", answer: degrees.summary, hospital: degrees.card, source: \"nl2sql\", attempt };\n",
   "const degrees = answerDegreeQuestion(q);"
  ],
  [
   "import { answerPhd } from \"./phdHolders\";\n",
   "import { answerPhd } from \"./phdHolders\";\nimport { healthHeadline } from \"./healthHeadline\";\n",
   "import { healthHeadline } from \"./healthHeadline\";"
  ],
  [
   "      people: withExtraFields(people, display, rows),\n      listTruncated: truncated,\n",
   "      people: withExtraFields(people, display, rows),\n      ...(() => { const h = healthHeadline(String((res as any).question ?? \"\"), res.data.columns, rawRows as any); return h ? { headline: h } : {}; })(),\n      listTruncated: truncated,\n",
   "...(() => { const h = healthHeadline("
  ],
  [
   "import { answerPhd } from \"./phdHolders\";\n",
   "import { answerPhd } from \"./phdHolders\";\nimport { dateAsked, emptyDateNote } from \"./healthDates\";\n",
   "import { dateAsked, emptyDateNote } from \"./healthDates\";"
  ],
  [
   "    if (have && pending) payload.answer += ` ${pending}`;\n",
   "    if (have && pending) payload.answer += ` ${pending}`;\n    // a DATE with no check-up: say what kind of day it was and which dates the month's list has (step 61a)\n    const dayAsked = dateAsked(String(res.sql ?? \"\"));\n    if (have && dayAsked) {\n      const dayNote = await emptyDateNote((sql, params) => deps.withClient(async (c) => (await c.query(sql, params)).rows as Array<Record<string, unknown>>), dayAsked);\n      if (dayNote) payload.answer = payload.answer.replace(/^Nothing was found\\.\\s*/, \"\") ? `${dayNote} ${payload.answer.replace(/^Nothing was found\\.\\s*/, \"\")}` : dayNote;\n    }\n",
   "const dayAsked = dateAsked(String(res.sql"
  ]
 ],
 "src/lib/employees/analytics.ts": [
  [
   "  hospital?: import(\"@/lib/hospital/types\").HospitalAnswer;\n",
   "  hospital?: import(\"@/lib/hospital/types\").HospitalAnswer;\n  /** The ONE clean answer, shown first, big and bold (step 61a): a Yes or No (holiday verdicts), the date asked for, the department asked for. The same type in AnalyticsPayload (backend) and AnalyticsAnswer (frontend). */\n  headline?: import(\"@/lib/ui/answerHeadline\").AnswerHeadline;\n",
   "headline?: import(\"@/lib/ui/answerHeadline\").AnswerHeadline;"
  ],
  [
   "        return { kind: \"count\", answer: `No, ${dateLabel} is not a holiday.` };\n",
   "        return { kind: \"count\", answer: `No, ${dateLabel} is not a holiday.`, headline: { text: \"No\", tone: \"no\" } };\n",
   "headline: { text: \"No\", tone: \"no\" }"
  ],
  [
   "        lead: `Yes — ${dateLabel} is a holiday.`,\n",
   "        lead: `Yes — ${dateLabel} is a holiday.`,\n        headline: { text: \"Yes\", tone: \"yes\" },\n",
   "headline: { text: \"Yes\", tone: \"yes\" }"
  ],
  [
   "          answer: `${r.name} falls on ${d.toFormat(\"d LLLL yyyy\")} (${labelWithCategories(HOLIDAY_TYPE_LABEL[r.type], r.categories)}).${noteText}`,\n          holidayDetails: buildHolidayDetails(rows, HOLIDAY_TYPE_LABELS),\n",
   "          answer: `${r.name} falls on ${d.toFormat(\"d LLLL yyyy\")} (${labelWithCategories(HOLIDAY_TYPE_LABEL[r.type], r.categories)}).${noteText}`,\n          headline: { text: d.toFormat(\"cccc, d LLLL yyyy\"), tone: \"info\" },\n          holidayDetails: buildHolidayDetails(rows, HOLIDAY_TYPE_LABELS),\n",
   "headline: { text: d.toFormat(\"cccc, d LLLL yyyy\"), tone: \"info\" }"
  ],
  [
   "        answer: `${lines.join(\" and \")}.${notesSuffix(rows.map((r) => r.note))}`,\n        holidayDetails: buildHolidayDetails(rows, HOLIDAY_TYPE_LABELS),\n",
   "        answer: `${lines.join(\" and \")}.${notesSuffix(rows.map((r) => r.note))}`,\n        headline: { text: [...new Set(rows.map((r) => labelWithCategories(HOLIDAY_TYPE_LABEL[r.type], r.categories)))].join(\" and \"), tone: \"info\" },\n        holidayDetails: buildHolidayDetails(rows, HOLIDAY_TYPE_LABELS),\n",
   "headline: { text: [...new Set(rows.map((r) => labelWithCategories("
  ]
 ],
 "src/hooks/useOmniSearch.ts": [
  [
   "  hospital?: import(\"@/lib/hospital/types\").HospitalAnswer;\n",
   "  hospital?: import(\"@/lib/hospital/types\").HospitalAnswer;\n  /** The ONE clean answer shown first, big and bold (step 61a). The same type in AnalyticsPayload (backend) and AnalyticsAnswer (frontend). */\n  headline?: import(\"@/lib/ui/answerHeadline\").AnswerHeadline;\n",
   "headline?: import(\"@/lib/ui/answerHeadline\").AnswerHeadline;"
  ],
  [
   "import { useState, useEffect } from \"react\";\n",
   "import { useState, useEffect, useMemo } from \"react\";\n",
   "import { useState, useEffect, useMemo } from \"react\";"
  ],
  [
   "import type { Nl2SqlExtras } from \"@/lib/nl2sql/clientTypes\";\n",
   "import type { Nl2SqlExtras } from \"@/lib/nl2sql/clientTypes\";\nimport { markWeakMatches } from \"@/lib/search/weakMatch\";\n",
   "import { markWeakMatches } from \"@/lib/search/weakMatch\";"
  ],
  [
   "  const results: OmniSearchResult[] = Array.isArray(data)\n    ? data\n    : data?.results || [];\n",
   "  const rawResults: OmniSearchResult[] = Array.isArray(data)\n    ? data\n    : data?.results || [];\n  // a document that shares nothing with the question must not wear a confident percentage (step 61a; ledger item 57): marked once per answer, from the question that was searched\n  const results: OmniSearchResult[] = useMemo(() => markWeakMatches(submittedQuery, rawResults), [submittedQuery, data]); // eslint-disable-line react-hooks/exhaustive-deps\n",
   "markWeakMatches(submittedQuery, rawResults)"
  ]
 ],
 "src/components/OmnibarModal.tsx": [
  [
   "import { OmniLoginHint } from \"@/components/OmniLoginHint\";\n",
   "import { OmniLoginHint } from \"@/components/OmniLoginHint\";\nimport { AnswerHeadline } from \"@/components/AnswerHeadline\";\nimport { afterVerdict } from \"@/lib/ui/answerHeadline\";\n",
   "import { afterVerdict } from \"@/lib/ui/answerHeadline\";"
  ],
  [
   "                            {typeof analytics.count === \"number\" &&\n                              analytics.kind !== \"breakdown\" &&\n                              !hideCountNumber && (",
   "                            <AnswerHeadline headline={analytics.headline} />\n                            {typeof analytics.count === \"number\" &&\n                              analytics.kind !== \"breakdown\" &&\n                              !hideCountNumber &&\n                              !analytics.headline && (",
   "<AnswerHeadline headline={analytics.headline} />"
  ],
  [
   "                              <p className=\"mb-2 text-sm font-semibold text-neutral-800\">{analytics.lead}</p>\n",
   "                              <p className=\"mb-2 text-sm font-semibold text-neutral-800\">{analytics.headline ? afterVerdict(analytics.lead) : analytics.lead}</p>\n",
   "analytics.headline ? afterVerdict(analytics.lead) : analytics.lead"
  ],
  [
   "                                {analytics.kind === \"error\" && \"Bad query: \"}\n                                {analytics.answer}\n",
   "                                {analytics.kind === \"error\" && \"Bad query: \"}\n                                {analytics.headline ? afterVerdict(analytics.answer) : analytics.answer}\n",
   "analytics.headline ? afterVerdict(analytics.answer) : analytics.answer"
  ],
  [
   "import { OmniLoginHint } from \"@/components/OmniLoginHint\";\n",
   "import { OmniLoginHint } from \"@/components/OmniLoginHint\";\nimport { looksLikeNameSearch } from \"@/lib/search/nameSearchGate\";\n",
   "import { looksLikeNameSearch } from \"@/lib/search/nameSearchGate\";"
  ],
  [
   "                        if (query.trim().length >= 2) {\n                          runEmployeeNameSearch();\n                        }\n",
   "                        // the people name search is for what can be a NAME (one to four words, not a question): a sentence only burned 1 to 7 s of database time (step 61a)\n                        if (query.trim().length >= 2 && looksLikeNameSearch(query)) {\n                          runEmployeeNameSearch();\n                        }\n",
   "query.trim().length >= 2 && looksLikeNameSearch(query)"
  ],
  [
   "import { OmniLoginHint } from \"@/components/OmniLoginHint\";\n",
   "import { OmniLoginHint } from \"@/components/OmniLoginHint\";\nimport { WEAK_NOTE } from \"@/lib/search/weakMatch\";\n",
   "import { WEAK_NOTE } from \"@/lib/search/weakMatch\";"
  ],
  [
   "                          {mode === \"intellectual\" ? (\n                            <h4 className=\"mb-1 text-[11px] font-bold uppercase tracking-wider text-slate-400 px-2\">\n                              Primary Sources\n",
   "                          {mode !== \"intellectual\" && results.length > 0 && results.every((r) => (r as any).weakMatch) && (\n                            <p className=\"mb-1 px-2 text-xs font-medium text-amber-700\" data-weak-note=\"true\">\n                              {WEAK_NOTE}\n                            </p>\n                          )}\n                          {mode === \"intellectual\" ? (\n                            <h4 className=\"mb-1 text-[11px] font-bold uppercase tracking-wider text-slate-400 px-2\">\n                              Primary Sources\n",
   "data-weak-note=\"true\""
  ]
 ]
};
const refuse = (why) => { console.log("NOT APPLIED: " + why + "\nNothing was changed."); process.exit(1); };
for (const f of NEEDS) if (!fs.existsSync(path.join(root, f))) refuse("the file " + f + " is missing (unzip the patch first)");
const plan = [];
let todo = 0;
for (const [file, edits] of Object.entries(EDITS)) {
  const p = path.join(root, file);
  if (!fs.existsSync(p)) refuse("cannot find " + file + " (run this from the project root)");
  const src = fs.readFileSync(p, "utf8");
  const make = [];
  for (const [from, to, marker, optional, upgradeFrom] of edits) {
    if (src.includes(marker)) continue; // already there
    if (upgradeFrom && src.split(upgradeFrom).length === 2) { make.push([upgradeFrom, to]); continue; } // the earlier version of this change (step 60b)
    if (src.split(from).length === 2) { make.push([from, to]); continue; }
    if (optional) continue; // a place that only exists in some trees
    refuse(file + " differs from what I expect (a place to change is not there exactly once: " + JSON.stringify(from.slice(0, 70)) + ")");
  }
  todo += make.length;
  plan.push([p, src, make]);
}
if (!todo) { console.log("Nothing to do: step 61a is already applied."); process.exit(0); }
let files = 0;
for (const [p, src, make] of plan) {
  if (!make.length) continue;
  let s = src;
  for (const [from, to] of make) s = s.replace(from, () => to);
  fs.writeFileSync(p, s);
  files++;
}
console.log("APPLIED: step 61a (" + todo + " changes in " + files + " files).");
