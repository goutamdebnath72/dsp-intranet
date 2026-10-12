#!/usr/bin/env node
// Applies the "circular titles in running letters" change to the screens that SHOW a circular's title. Run from the project root, after unzipping the patch:
//
//     node cleanup/apply-title-normalizer.js
//
// It edits five files IN PLACE, changing only the lines that print a title (each is wrapped in formatCircularTitle(...)) and adding one import line.
// Everything else in those files stays byte for byte as it is. It is all-or-nothing: if any file does not look as expected it says which and changes NOTHING.
// Running it again is harmless ("already applied"). To undo: git checkout -- the five files (commit first).
const fs = require("fs");
const path = require("path");

const IMPORT_LINE = 'import { formatCircularTitle } from "@/lib/circularTitle";\n';
// [file, [[text now, text after, how many times the text must occur]]]
const EDITS = [
  ["src/components/CircularsModal.tsx", [["{circular.headline}", "{formatCircularTitle(circular.headline)}", 1]]],
  [
    "src/components/CircularViewerLightbox.tsx",
    [
      [': circular?.headline || "Circular"}', ': formatCircularTitle(circular?.headline) || "Circular"}', 1],
      ["alt={`Page ${pageNo} of ${circular.headline}`}", "alt={`Page ${pageNo} of ${formatCircularTitle(circular.headline)}`}", 1],
    ],
  ],
  [
    "src/components/SourceBar.tsx",
    [
      ['<span className="break-words">{s.title}</span>', '<span className="break-words">{formatCircularTitle(s.title)}</span>', 1],
      ["aria-label={`Open ${s.label}, ${s.title}${where", "aria-label={`Open ${s.label}, ${formatCircularTitle(s.title)}${where", 1],
    ],
  ],
  ["src/components/OmnibarModal.tsx", [["{result.headline}", "{formatCircularTitle(result.headline)}", 2]]],
  [
    "src/components/ExecutiveBriefing.tsx",
    [
      ["title={c.headline}", "title={formatCircularTitle(c.headline)}", 2],
      ['<span className="truncate">{c.headline}</span>', '<span className="truncate">{formatCircularTitle(c.headline)}</span>', 1],
    ],
  ],
];

const count = (text, piece) => text.split(piece).length - 1;
function fail(lines) {
  console.error("\nNOTHING WAS CHANGED.\n" + lines.map((l) => "  " + l).join("\n") + "\n");
  process.exit(1);
}

if (!fs.existsSync("package.json") || !fs.existsSync("src")) fail(["Run this from the project root (the folder that has package.json)."]);
if (!fs.existsSync("src/lib/circularTitle.ts")) fail(["src/lib/circularTitle.ts is missing: unzip the patch first (unzip -q -o ~/Downloads/patch_step10b.zip)."]);

// pass 1: check everything, change nothing
const plan = [];
const problems = [];
for (const [file, replacements] of EDITS) {
  if (!fs.existsSync(file)) {
    problems.push(`${file}: file not found`);
    continue;
  }
  const text = fs.readFileSync(file, "utf8");
  if (text.includes("formatCircularTitle")) {
    plan.push({ file, done: true });
    continue;
  }
  for (const [now, , expected] of replacements) {
    const found = count(text, now);
    if (found !== expected) problems.push(`${file}: expected to find  ${now}  ${expected} time(s), found ${found}`);
  }
  if (!/^import /m.test(text)) problems.push(`${file}: no import line found`);
  plan.push({ file, text, replacements });
}
if (problems.length) fail(["A file is not as this patch expects (it was probably edited since):", ...problems, "Send me these lines and I will adapt the patch."]);

// pass 2: write
let edited = 0;
for (const step of plan) {
  if (step.done) {
    console.log(`  already applied   ${step.file}`);
    continue;
  }
  let text = step.text;
  for (const [now, after] of step.replacements) text = text.split(now).join(after);
  const firstImport = text.search(/^import /m);
  text = text.slice(0, firstImport) + IMPORT_LINE + text.slice(firstImport);
  fs.writeFileSync(path.resolve(step.file), text);
  console.log(`  edited            ${step.file}`);
  edited++;
}
console.log(edited ? `\nDone: ${edited} file(s) edited. Restart the app (rm -rf .next && npm run dev).` : "\nNothing to do: the change is already in place.");
