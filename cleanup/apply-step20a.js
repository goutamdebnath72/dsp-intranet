// cleanup/apply-step20a.js
//
// Edits two existing files IN PLACE for the acceptance-harness patch, all-or-nothing and safe to run twice:
//   .gitignore             adds  eval/results/   (answers from the live directory must never be committed)
//   cleanup/check-fixes.sh adds one line that reports whether the harness files are present
// If an expected spot cannot be found exactly once, NOTHING is changed and it says which file differs.
//
// Run from the project root:   node cleanup/apply-step20a.js

const fs = require("fs");

const GI = ".gitignore";
const CF = "cleanup/check-fixes.sh";

function read(p) {
  if (!fs.existsSync(p)) {
    console.error(`NOT APPLIED: ${p} not found. Run this from the project root (the folder with package.json).`);
    process.exit(1);
  }
  return fs.readFileSync(p, "utf8");
}

const gi = read(GI);
const cf = read(CF);

// ---- .gitignore
const GI_LINE = "eval/results/";
const giHas = gi.split(/\r?\n/).some((l) => l.trim() === GI_LINE);
const giNew = giHas ? gi : gi.replace(/\s*$/, "\n") + "\n# acceptance-harness output: holds answers from the live directory, never commit\n" + GI_LINE + "\n";

// ---- cleanup/check-fixes.sh
const CHECK = `{ test -f scripts/omnibar-acceptance.mjs && test -f scripts/lib/acceptance-core.mjs && test -f eval/router-acceptance.json; } 2>/dev/null; report "omnibar acceptance harness (scripts and question set)" $?`;
const cfHas = cf.includes("omnibar acceptance harness");
const ANCHOR = '\necho\nif [ "$bad" -eq 0 ]';
let cfNew = cf;
if (!cfHas) {
  const first = cf.indexOf(ANCHOR);
  if (first === -1 || cf.indexOf(ANCHOR, first + 1) !== -1) {
    console.error(`NOT APPLIED: ${CF} does not have the expected ending (a bare "echo" line followed by the "if [ \\"$bad\\" ..." line, exactly once). Nothing was changed. Send me the last 8 lines of that file.`);
    process.exit(1);
  }
  cfNew = cf.slice(0, first) + "\n" + CHECK + cf.slice(first);
}

// ---- write (both, or neither: all anchors were verified above)
let changed = 0;
if (giNew !== gi) { fs.writeFileSync(GI, giNew); changed++; console.log(`edited  ${GI}  (+ ${GI_LINE})`); } else console.log(`already ${GI}`);
if (cfNew !== cf) { fs.writeFileSync(CF, cfNew); changed++; console.log(`edited  ${CF}  (+ the harness check)`); } else console.log(`already ${CF}`);
console.log(changed ? "Applied." : "Nothing to do: already applied.");
