// cleanup/apply-step22b.js
//
// One wording change, in place, all-or-nothing, safe to run twice:
//   src/lib/employees/analytics.ts   a comparison where BOTH years have no data now says
//                                    "I don't have holiday data loaded for both 2027 and 2028 yet ..."
// Run from the project root:   node cleanup/apply-step22b.js

const fs = require("fs");
const E = {
 "file": "src/lib/employees/analytics.ts",
 "marker": "loaded for both ${missing[0]} and ${missing[1]} yet",
 "old": "              : `I don't have holiday data loaded for ${missing[0]} or ${missing[1]} yet, so I can't compare them.${available}`;\n",
 "new": "              : `I don't have holiday data loaded for both ${missing[0]} and ${missing[1]} yet, so I can't compare them.${available}`;\n"
};

if (!fs.existsSync(E.file)) {
  console.error(`NOT APPLIED: ${E.file} not found. Run this from the project root (the folder with package.json).`);
  process.exit(1);
}
const text = fs.readFileSync(E.file, "utf8");
if (text.includes(E.marker)) { console.log(`already  ${E.file}`); console.log("Nothing to do: already applied."); process.exit(0); }
const n = text.split(E.old).length - 1;
if (n !== 1) {
  console.error(`NOT APPLIED: ${E.file} does not contain the expected line exactly once (found ${n}). Nothing was changed. Send me this file.`);
  process.exit(1);
}
fs.writeFileSync(E.file, text.replace(E.old, () => E.new));
console.log(`edited   ${E.file}`);
console.log("Applied.");
