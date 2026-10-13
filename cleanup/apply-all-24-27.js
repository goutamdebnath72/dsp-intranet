// cleanup/apply-all-24-27.js
//
// ONE command for steps 24a, 25a, 26a and 27a, in order. Each step is all-or-nothing and safe to run twice, so this is too: a step
// that is already applied just says "already". If one step cannot be applied (because a file differs from the one it was made for)
// the run STOPS there, nothing after it is applied, and it tells you which file to send me.
//
//   24a  the front-path gate (off by default)
//   25a  synthesis only for an executive found in the login session (security)
//   26a  the EDS-type question detector; the holiday parser no longer hijacks "compare ... circulars" questions
//   27a  the Enter key = the old button for a logged-in executive on an EDS-type question (off by default)
//
// Run from the project root, after unzipping patch_step28a.zip:   node cleanup/apply-all-24-27.js

const { spawnSync } = require("child_process");
const fs = require("fs");

const read = (p) => (fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "");
const route = () => read("src/app/api/ai-search/route.ts");
const has = (text, ...needles) => needles.every((n) => text.includes(n));

// How to tell that a step is ALREADY in the project, by something a LATER step does not remove (the steps edit the same lines).
const ALREADY = {
  "24a": () => has(route(), "rescueWithModel") && has(read("src/lib/nl2sql/omnibar.ts"), "skipModel"),
  "25a": () => has(route(), "getSessionTicket"),
  "26a": () => has(route(), "synthIntent") && has(read("src/lib/holidays/parser.ts"), "leftoverAfterStrip(q.replace(new RegExp(COMPARE_WORD") && has(read("src/hooks/useOmniSearch.ts"), 'mode: synthesis ? ("intellectual" as SearchMode)'),
  "27a": () => has(route(), "SCREEN decides (step 27a") && has(read("src/components/OmnibarModal.tsx"), "Executive Deep Synthesis BY ITSELF") && has(read("src/hooks/useOmniSearch.ts"), "autoRouted"),
};

for (const s of ["24a", "25a", "26a", "27a"]) {
  const script = `cleanup/apply-step${s}.js`;
  if (!fs.existsSync(script)) {
    console.error(`STOPPED: ${script} is missing. Unzip patch_step28a.zip over the project first.`);
    process.exit(1);
  }
  console.log(`\n=== step ${s} ===`);
  if (ALREADY[s]()) {
    console.log("already in the project: skipped.");
    continue;
  }
  const r = spawnSync(process.execPath, [script], { stdio: "inherit" });
  if (r.status !== 0) {
    console.error(`\nSTOPPED at step ${s}: nothing after it was applied (the steps before it are fine). Send me the message above.`);
    process.exit(r.status || 1);
  }
}
console.log("\nAll four steps are in the project. Next: git status --short, then npx tsc --noEmit.");
