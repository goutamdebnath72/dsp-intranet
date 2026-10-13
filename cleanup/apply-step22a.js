// cleanup/apply-step22a.js
//
// Edits six existing source files IN PLACE (plus cleanup/check-fixes.sh), all-or-nothing and safe to run twice.
// If any expected spot cannot be found exactly once, NOTHING is changed and it says which file differs.
//
//   src/lib/employees/analytics.ts      year comparison carries the card data; "no data for that year" says which
//                                       years exist (and, in a comparison, WHICH year is missing); the notification
//                                       answer describes the working login reminder
//   src/lib/employees/compareSentence.ts  exports diffInWords (the card uses the same wording)
//   src/hooks/useOmniSearch.ts          the screen's copy of the payload gets the new field
//   src/components/OmnibarModal.tsx     draws the comparison card
//   cleanup/check-fixes.sh              two report lines
// New files come in the zip itself: HolidayCompareCard.tsx, compareView.ts, yearList.ts (+ a self-test).
//
// Run from the project root:   node cleanup/apply-step22a.js

const fs = require("fs");

const EDITS = [
 {
  "file": "src/lib/employees/compareSentence.ts",
  "marker": "export function diffInWords",
  "old": "function diffInWords(a: number, b: number, yearB: number): string {",
  "new": "export function diffInWords(a: number, b: number, yearB: number): string {"
 },
 {
  "file": "src/lib/employees/analytics.ts",
  "marker": "import { buildHolidayCompareView",
  "old": "import { queryHolidays, type HolidayRow } from \"@/lib/holidays/analytics\";\n",
  "new": "import { availableHolidayYears, queryHolidays, type HolidayRow } from \"@/lib/holidays/analytics\";\nimport { buildHolidayCompareView, type HolidayCompareView } from \"@/lib/holidays/compareView\";\nimport { formatYearList } from \"@/lib/holidays/yearList\";\n"
 },
 {
  "file": "src/lib/employees/analytics.ts",
  "marker": "holidayCompare?: HolidayCompareView",
  "old": "  /** Stage 2: holiday rows for a holiday list query (rendered like People). */\n  holidays?: HolidayRow[];\n",
  "new": "  /** Stage 2: holiday rows for a holiday list query (rendered like People). */\n  holidays?: HolidayRow[];\n  /** Structured year comparison; the screen draws a card from it (HolidayCompareCard). `answer` still carries the\n   *  same facts as plain text. Mirrors AnalyticsAnswer.holidayCompare in src/hooks/useOmniSearch.ts. */\n  holidayCompare?: HolidayCompareView;\n"
 },
 {
  "file": "src/lib/employees/analytics.ts",
  "marker": "Years available:",
  "old": "  const holidayYearNotLoaded = (year: number): AnalyticsPayload => ({\n    kind: \"pending\",\n    answer: `I don't have holiday data loaded for ${year} yet.`,\n  });\n",
  "new": "  const holidayYearNotLoaded = async (year: number): Promise<AnalyticsPayload> => {\n    const years = await availableHolidayYears();\n    const available = years.length ? ` Years available: ${formatYearList(years)}.` : \"\";\n    return { kind: \"pending\", answer: `I don't have holiday data loaded for ${year} yet.${available}` };\n  };\n"
 },
 {
  "file": "src/lib/employees/analytics.ts",
  "marker": "so I can't compare",
  "old": "      if (res.yearAvailable === false) {\n        return {\n          kind: \"pending\",\n          answer: `I can only compare years already loaded in the holiday calendar; ${intent.yearA} or ${intent.yearB} isn't loaded yet.`,\n        };\n      }\n",
  "new": "      if (res.yearAvailable === false) {\n        // Say exactly WHICH year has no data, and which years do, instead of \"A or B isn't loaded\".\n        const years = await availableHolidayYears();\n        const missing = [intent.yearA, intent.yearB].filter((y, i, all) => !years.includes(y) && all.indexOf(y) === i);\n        const available = years.length ? ` Years available: ${formatYearList(years)}.` : \"\";\n        const other = missing[0] === intent.yearA ? intent.yearB : intent.yearA;\n        const answer =\n          missing.length === 0\n            ? `I can only compare years already loaded in the holiday calendar.${available}`\n            : missing.length === 1\n              ? `I don't have holiday data loaded for ${missing[0]} yet, so I can't compare it with ${other}.${available}`\n              : `I don't have holiday data loaded for ${missing[0]} or ${missing[1]} yet, so I can't compare them.${available}`;\n        return { kind: \"pending\", answer };\n      }\n"
 },
 {
  "file": "src/lib/employees/analytics.ts",
  "marker": "byType: c.byType, type: intent.type, nowYear",
  "old": "          answer: compareTypeSentence(row.label, c.yearA, row.a, c.yearB, row.b, DateTime.now().year),\n        };\n",
  "new": "          answer: compareTypeSentence(row.label, c.yearA, row.a, c.yearB, row.b, DateTime.now().year),\n          holidayCompare: buildHolidayCompareView({\n            yearA: c.yearA, yearB: c.yearB, totalA: c.totalA, totalB: c.totalB, byType: c.byType, type: intent.type, nowYear: DateTime.now().year,\n          }),\n        };\n"
 },
 {
  "file": "src/lib/employees/analytics.ts",
  "marker": "byType: c.byType, nowYear: DateTime.now().year",
  "old": "        answer: compareTotalSentence(c.yearA, c.totalA, c.yearB, c.totalB, DateTime.now().year, parts.join(\"; \") + dualNote),\n      };\n",
  "new": "        answer: compareTotalSentence(c.yearA, c.totalA, c.yearB, c.totalB, DateTime.now().year, parts.join(\"; \") + dualNote),\n        holidayCompare: buildHolidayCompareView({\n          yearA: c.yearA, yearB: c.yearB, totalA: c.totalA, totalB: c.totalB, byType: c.byType, nowYear: DateTime.now().year,\n        }),\n      };\n"
 },
 {
  "file": "src/lib/employees/analytics.ts",
  "marker": "Holiday reminders already exist",
  "old": "      // Deliberately NOT a data answer, and deliberately NOT routed to\n      // circular/semantic search either -- \"holiday notification 2025\" is\n      // asking for a standing alert (something shown at login, going\n      // forward), not a one-off lookup this parser can serve. Being honest\n      // that this doesn't exist yet is better than silently answering the\n      // word \"notification\" as if it meant \"list.\"\n      return {\n        kind: \"pending\",\n        answer:\n          \"I can't set up notifications yet -- that would need its own feature: a reminder shown when you log in, with its own subscribe and unsubscribe controls. I can tell you the upcoming holidays right now if that helps in the meantime -- just ask \\\"upcoming holidays.\\\"\",\n      };\n",
  "new": "      // Deliberately NOT a data answer, and deliberately NOT routed to circular/semantic search either --\n      // \"holiday notification 2025\" asks about the standing login reminder (HolidayNotificationToast, the card at\n      // the bottom-right of the screen), not for a one-off lookup. The reminder is built and working, so this\n      // explains how it behaves: what the card offers and where to unsubscribe. Keep the wording in step with\n      // the labels in src/components/HolidayNotificationToast.tsx.\n      return {\n        kind: \"pending\",\n        answer:\n          \"Holiday reminders already exist. At login, a card at the bottom-right of the screen offers to show the upcoming holidays: choose Subscribe, and tick \\\"Only show me this once\\\" if you want just one reminder. After you subscribe, the same card lets you switch between \\\"Show only once\\\" and \\\"Show every login\\\", or Unsubscribe. To see the upcoming holidays now, ask \\\"upcoming holidays\\\".\",\n      };\n"
 },
 {
  "file": "src/hooks/useOmniSearch.ts",
  "marker": "import type { HolidayCompareView }",
  "old": "import type { HolidayDetail } from \"@/lib/holidays/format\";\n",
  "new": "import type { HolidayDetail } from \"@/lib/holidays/format\";\nimport type { HolidayCompareView } from \"@/lib/holidays/compareView\";\n"
 },
 {
  "file": "src/hooks/useOmniSearch.ts",
  "marker": "holidayCompare?: HolidayCompareView",
  "old": "  holidayDetails?: HolidayDetail[];\n  /** One-line lead above the holiday card. Mirrors AnalyticsPayload.lead. */\n",
  "new": "  holidayDetails?: HolidayDetail[];\n  /** Structured year comparison, drawn as a card. Mirrors AnalyticsPayload.holidayCompare. */\n  holidayCompare?: HolidayCompareView;\n  /** One-line lead above the holiday card. Mirrors AnalyticsPayload.lead. */\n"
 },
 {
  "file": "src/components/OmnibarModal.tsx",
  "marker": "import { HolidayCompareCard }",
  "old": "import { HolidayAnswerCard } from \"@/components/HolidayAnswerCard\";\n",
  "new": "import { HolidayAnswerCard } from \"@/components/HolidayAnswerCard\";\nimport { HolidayCompareCard } from \"@/components/HolidayCompareCard\";\n"
 },
 {
  "file": "src/components/OmnibarModal.tsx",
  "marker": "|| !!analytics?.holidayCompare;",
  "old": "  const hideCountNumber = hideRowCount || !!analytics?.nl2sql?.plainAnswer;\n",
  "new": "  const hideCountNumber = hideRowCount || !!analytics?.nl2sql?.plainAnswer || !!analytics?.holidayCompare;\n"
 },
 {
  "file": "src/components/OmnibarModal.tsx",
  "marker": "<HolidayCompareCard view={analytics.holidayCompare} />",
  "old": "                            {analytics.holidayDetails && analytics.holidayDetails.length > 0 ? (\n                              <HolidayAnswerCard details={analytics.holidayDetails} />\n                            ) : hideRowCount ? null : (\n",
  "new": "                            {analytics.holidayCompare ? (\n                              <HolidayCompareCard view={analytics.holidayCompare} />\n                            ) : analytics.holidayDetails && analytics.holidayDetails.length > 0 ? (\n                              <HolidayAnswerCard details={analytics.holidayDetails} />\n                            ) : hideRowCount ? null : (\n"
 }
];
const CHECKS = [
 {
  "marker": "year comparisons are drawn as a card, and name the year that has no data",
  "line": "{ grep -q \"buildHolidayCompareView\" src/lib/employees/analytics.ts && grep -q \"HolidayCompareCard\" src/components/OmnibarModal.tsx && test -f src/components/HolidayCompareCard.tsx; } 2>/dev/null; report \"year comparisons are drawn as a card, and name the year that has no data\" $?"
 },
 {
  "marker": "the notification answer describes the working login reminder",
  "line": "{ grep -q \"Holiday reminders already exist\" src/lib/employees/analytics.ts; } 2>/dev/null; report \"the notification answer describes the working login reminder\" $?"
 }
];
const CF = "cleanup/check-fixes.sh";
const NEW_FILES = [
  "src/components/HolidayCompareCard.tsx",
  "src/lib/holidays/compareView.ts",
  "src/lib/holidays/yearList.ts",
];

function read(p) {
  if (!fs.existsSync(p)) {
    console.error(`NOT APPLIED: ${p} not found. Run this from the project root (the folder with package.json), after unzipping the patch.`);
    process.exit(1);
  }
  return fs.readFileSync(p, "utf8");
}
const countOf = (hay, needle) => (needle ? hay.split(needle).length - 1 : 0);

// ---- 1. verify EVERYTHING before writing anything
for (const f of NEW_FILES) read(f); // the unzip must have put them there

const plan = [];
const byFile = new Map();
for (const e of EDITS) byFile.set(e.file, byFile.get(e.file) ?? read(e.file));

for (const e of EDITS) {
  let text = byFile.get(e.file);
  if (text.includes(e.marker)) { console.log(`already  ${e.file}  (${e.marker.slice(0, 48).replace(/\n/g, " ")}...)`); continue; }
  const n = countOf(text, e.old);
  if (n !== 1) {
    console.error(`NOT APPLIED: ${e.file} does not contain the expected code exactly once (found ${n}). Nothing was changed. This file differs from the one the patch was made for: send it to me.`);
    process.exit(1);
  }
  text = text.replace(e.old, () => e.new);
  byFile.set(e.file, text);
  plan.push(e.file);
}

let cf = read(CF);
const ANCHOR = '\necho\nif [ "$bad" -eq 0 ]';
const missingChecks = CHECKS.filter((c) => !cf.includes(c.marker));
if (missingChecks.length) {
  const first = cf.indexOf(ANCHOR);
  if (first === -1 || cf.indexOf(ANCHOR, first + 1) !== -1) {
    console.error(`NOT APPLIED: ${CF} does not have the expected ending (a bare "echo" line followed by the "if [ \\"$bad\\" ..." line, exactly once). Nothing was changed. Send me the last 8 lines of that file.`);
    process.exit(1);
  }
  cf = cf.slice(0, first) + "\n" + missingChecks.map((c) => c.line).join("\n") + cf.slice(first);
}

// ---- 2. write (every anchor was verified above)
let changed = 0;
for (const f of new Set(plan)) { fs.writeFileSync(f, byFile.get(f)); changed++; console.log(`edited   ${f}`); }
if (missingChecks.length) { fs.writeFileSync(CF, cf); changed++; console.log(`edited   ${CF}  (+ ${missingChecks.length} report line(s))`); }
console.log(changed ? "Applied." : "Nothing to do: already applied.");
