// cleanup/apply-step25a.js
//
// Edits ONE existing source file IN PLACE (plus cleanup/check-fixes.sh), all-or-nothing and safe to run twice.
// SECURITY (audit #3 and #6) and the groundwork for removing the Executive Deep Synthesis button:
//
//   src/app/api/ai-search/route.ts   who is calling is read from the LOGIN SESSION, never from the browser's `ticket`
//                                    parameter; anybody who is not a verified executive gets the plain search (before,
//                                    a request WITHOUT a ticket went straight to synthesis, and any executive's ticket
//                                    typed into the URL passed)
//   cleanup/check-fixes.sh           one report line
//
// If any expected spot cannot be found exactly once, NOTHING is changed and it says which file differs.
// Needs steps 23a and 24a applied first. Run from the project root:   node cleanup/apply-step25a.js

const fs = require("fs");

const EDITS = [
 {
  "file": "src/app/api/ai-search/route.ts",
  "marker": "import { getSessionTicket } from \"@/lib/apiAuth\";",
  "old": "import { decideModelSkip, frontGateEnabled, loadDirectoryNameWords } from \"@/lib/search/frontGate\";\n",
  "new": "import { decideModelSkip, frontGateEnabled, loadDirectoryNameWords } from \"@/lib/search/frontGate\";\nimport { getSessionTicket } from \"@/lib/apiAuth\";\n"
 },
 {
  "file": "src/app/api/ai-search/route.ts",
  "marker": "const endSession = traceStep(\"session\");",
  "old": "    const userTicket = searchParams.get(\"ticket\")?.trim();\n",
  "new": "    // WHO is calling comes from the login SESSION only (security audit #3 and #6). The browser's `ticket` parameter is\n    // IGNORED: anybody can type any ticket number into a URL, and executive numbers (4xxxxx) are easy to guess.\n    const endSession = traceStep(\"session\");\n    const userTicket = (await getSessionTicket()) ?? undefined;\n    endSession();\n"
 },
 {
  "file": "src/app/api/ai-search/route.ts",
  "marker": "Not a verified executive (no login, a non-executive",
  "old": "      if (!isAuthorizedExecutive && userTicket) {\n        mode = \"semantic\";\n      }\n",
  "new": "      // Not a verified executive (no login, a non-executive, or someone no longer in the directory): the plain search.\n      // (Until step 25a this downgrade only happened when a `ticket` parameter was present, so a request without one\n      // went straight to synthesis, and any executive's ticket typed into the URL passed.)\n      if (!isAuthorizedExecutive) {\n        mode = \"semantic\";\n      }\n"
 }
];
const CHECKS = [
 {
  "marker": "synthesis is allowed only for an executive found in the login session",
  "line": "{ grep -q \"getSessionTicket\" src/app/api/ai-search/route.ts && ! grep -q 'searchParams.get(\"ticket\")' src/app/api/ai-search/route.ts; } 2>/dev/null; report \"synthesis is allowed only for an executive found in the login session\" $?"
 }
];
const CF = "cleanup/check-fixes.sh";

function read(p) {
  if (!fs.existsSync(p)) {
    console.error(`NOT APPLIED: ${p} not found. Run this from the project root (the folder with package.json).`);
    process.exit(1);
  }
  return fs.readFileSync(p, "utf8");
}
const countOf = (hay, needle) => (needle ? hay.split(needle).length - 1 : 0);

// ---- 1. verify EVERYTHING before writing anything
if (!read("src/app/api/ai-search/route.ts").includes("frontGate")) {
  console.error("NOT APPLIED: route.ts is missing the earlier steps: apply step 23a and step 24a first.");
  process.exit(1);
}
if (!fs.existsSync("src/lib/apiAuth.ts")) {
  console.error("NOT APPLIED: src/lib/apiAuth.ts (the session helper) does not exist in this project.");
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
    console.error(`NOT APPLIED: ${CF} does not have the expected ending (a bare "echo" line followed by the "if [ \\"$bad\\" ..." line, exactly once). Nothing was changed. Send me the last 8 lines of that file.`);
    process.exit(1);
  }
  cf = cf.slice(0, first) + "\n" + missingChecks.map((c) => c.line).join("\n") + cf.slice(first);
}

// ---- 2. write
let changed = 0;
for (const f of new Set(plan)) { fs.writeFileSync(f, byFile.get(f)); changed++; console.log(`edited   ${f}`); }
if (missingChecks.length) { fs.writeFileSync(CF, cf); changed++; console.log(`edited   ${CF}  (+ ${missingChecks.length} report line(s))`); }
console.log(changed ? "Applied." : "Nothing to do: already applied.");
