// cleanup/apply-step38d.js
//
// Edits ONE existing source file IN PLACE (plus cleanup/check-fixes.sh), all-or-nothing and safe to run twice.
//   src/components/OmnibarModal.tsx    "Open circular" on an ANSWER card opens the viewer on the answer's own page and shows the answer's own words
//                                      as the banner (5 small edits). Before: the viewer used the search's best clause, which can be a different
//                                      one (the room for collecting the reports, not the room of the check-up).
//   cleanup/check-fixes.sh             one report line
// The card (src/components/CircularAnswerCard.tsx, with its self-test) comes whole in the zip.
//
// If any expected spot cannot be found exactly once, NOTHING is changed and it says which file differs.
// Run from the project root:   node cleanup/apply-step38d.js

const fs = require("fs");
const EDITS = [
 {
  "file": "src/components/OmnibarModal.tsx",
  "marker": "const [answerQuote, setAnswerQuote]",
  "old": "  const [sourceViewer, setSourceViewer] = useState<{ pages: number[] } | null>(null);\n",
  "new": "  const [sourceViewer, setSourceViewer] = useState<{ pages: number[] } | null>(null);\n  // Set when the circular was opened from the ANSWER card: the exact words of that answer, shown as the viewer's banner instead of the search's own\n  // best clause (which can be a different one: the room of the report collection, not the room of the check-up). Cleared when the viewer closes.\n  const [answerQuote, setAnswerQuote] = useState<string | null>(null);\n"
 },
 {
  "file": "src/components/OmnibarModal.tsx",
  "marker": "setAnswerQuote(null);",
  "old": "  const handleCloseLightbox = () => {\n    setSelectedCircularId(null);\n    setSourceViewer(null);\n    setBannerDismissed(false);\n  };\n",
  "new": "  const handleCloseLightbox = () => {\n    setSelectedCircularId(null);\n    setSourceViewer(null);\n    setAnswerQuote(null);\n    setBannerDismissed(false);\n  };\n"
 },
 {
  "file": "src/components/OmnibarModal.tsx",
  "marker": "onOpenSource={(id, target) =>",
  "old": "                            onOpenSource={(id) => {\n                              setBannerDismissed(false);\n                              setSelectedCircularId(id);\n                            }}\n",
  "new": "                            onOpenSource={(id, target) => {\n                              setBannerDismissed(false);\n                              // the viewer opens on the page of the answer and shows the answer's own words (not the search's best clause)\n                              setSourceViewer(target?.page ? { pages: [target.page] } : null);\n                              setAnswerQuote(target?.quote ? target.quote : null);\n                              setSelectedCircularId(id);\n                            }}\n"
 },
 {
  "file": "src/components/OmnibarModal.tsx",
  "marker": "(answerQuote || (activeMatchedCircular?.isPerfectMatch",
  "old": "        {selectedCircularId &&\n          !bannerDismissed &&\n          activeMatchedCircular?.isPerfectMatch &&\n          activeMatchedCircular?.chunkText &&\n          mode === \"semantic\" && (",
  "new": "        {selectedCircularId &&\n          !bannerDismissed &&\n          (answerQuote || (activeMatchedCircular?.isPerfectMatch && activeMatchedCircular?.chunkText)) &&\n          mode === \"semantic\" && ("
 },
 {
  "file": "src/components/OmnibarModal.tsx",
  "marker": "The words the answer is taken from:",
  "old": "                Target Clause Reference:\n              </div>\n              <div className=\"font-medium text-neutral-800 text-xs sm:text-sm leading-relaxed\">\n                {generateSmartSnippet(activeMatchedCircular.chunkText, query)}\n              </div>",
  "new": "                {answerQuote ? \"The words the answer is taken from:\" : \"Target Clause Reference:\"}\n              </div>\n              <div className=\"font-medium text-neutral-800 text-xs sm:text-sm leading-relaxed\">\n                {answerQuote ?? (activeMatchedCircular?.chunkText ? generateSmartSnippet(activeMatchedCircular.chunkText, query) : \"\")}\n              </div>"
 }
];
const CHECKS = [
 {
  "marker": "Open circular on an answer opens on the answer's page and words",
  "line": "{ grep -q \"setAnswerQuote\" src/components/OmnibarModal.tsx && grep -q \"openTargetFor\" src/components/CircularAnswerCard.tsx; } 2>/dev/null; report \"Open circular on an answer opens on the answer's page and words\" $?"
 }
];
const CF = "cleanup/check-fixes.sh";

function read(p) {
  if (!fs.existsSync(p)) {
    console.error(`NOT APPLIED: ${p} not found. Run this from the project root (the folder with package.json), after unzipping the patch.`);
    process.exit(1);
  }
  return fs.readFileSync(p, "utf8");
}
const countOf = (hay, needle) => (needle ? hay.split(needle).length - 1 : 0);

if (!read("src/components/CircularAnswerCard.tsx").includes("openTargetFor")) {
  console.error("NOT APPLIED: src/components/CircularAnswerCard.tsx is not the new one. Unzip patch_step38d.zip first. Nothing was changed.");
  process.exit(1);
}

const plan = [];
const byFile = new Map();
for (const e of EDITS) byFile.set(e.file, byFile.get(e.file) ?? read(e.file));
for (const e of EDITS) {
  let text = byFile.get(e.file);
  if (text.includes(e.marker)) { console.log(`already  ${e.file}  (${e.marker.slice(0, 48).replace(/\n/g, " ")}...)`); continue; }
  const n = countOf(text, e.old);
  if (n !== 1) {
    console.error(`NOT APPLIED: ${e.file} does not contain the expected code exactly once (found ${n}: ${JSON.stringify(e.old.slice(0, 70))}). Nothing was changed. This file differs from the one the patch was made for: send it to me.`);
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
    console.error(`NOT APPLIED: ${CF} does not have the expected ending. Nothing was changed. Send me the last 8 lines of that file.`);
    process.exit(1);
  }
  cf = cf.slice(0, first) + "\n" + missingChecks.map((c) => c.line).join("\n") + cf.slice(first);
}

let changed = 0;
for (const f of new Set(plan)) { fs.writeFileSync(f, byFile.get(f)); changed++; console.log(`edited   ${f}`); }
if (missingChecks.length) { fs.writeFileSync(CF, cf); changed++; console.log(`edited   ${CF}  (+ ${missingChecks.length} report line(s))`); }
console.log(changed ? "Applied. Restart npm run dev." : "Nothing to do: already applied.");
