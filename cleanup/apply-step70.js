// cleanup/apply-step70.js
//
// Step 70: the race guard in ONE module (src/lib/facility/guard.ts) for both tools, and the employee PHOTO (browser finds the face and cuts the square; the server checks and keeps it in Vercel Blob; sql/19).
// It needs step 69c applied first AND the face finder installed:   npm install @vladmandic/face-api@1.7.15
// BEFORE using the photo, run src/lib/nl2sql/sql/19_employee_photo.sql ONCE in the Supabase SQL editor (safe to run again).
// The zip brings the files; this script checks the above and writes the row of this step in STATUS.md.
// Run from the project root:  node cleanup/apply-step70.js        Safe to run twice.

const fs = require("fs");
const path = require("path");

const ROW_70 = "| 70 | **Piece 1 finished and the employee PHOTO (owner, 2 Nov 2026).** (1) THE RACE GUARD IN ONE MODULE: `src/lib/facility/guard.ts` `guardRecord` (lock + read the record, answer missing / stale (the record as it is now + who changed it last) / fresh) replaces the four copies of the same code (change and delete of the employee manager, change and delete of the PAX editor); both stores use it, no copy of the version check is left in either; every earlier test of both tools passes unchanged. (2) THE PHOTO (optional, in the Identity card of Add and Modify; the ID card shows it instead of the initials): the BROWSER checks the file (JPG, PNG or WebP; 8 MB; 400 px), finds the ONE face with a small model (`@vladmandic/face-api`, TinyFaceDetector, 190 KB in `public/models/face`, loaded only when a photo is chosen; tested here on a real portrait: one face, score 0.98, and none on a blank picture) and cuts a SQUARE with the head, hair and a margin inside (`src/lib/employees/photo/crop.ts`: nothing stretched or squeezed; if the head does not fit with room around it, or the face is too small, or there is no / more than one face, the photo is REFUSED in words); only that square (at most 1200 px, far under the host's 4.5 MB request limit) is sent, AFTER the employee is saved. The SERVER checks it (first bytes, square, at least 320 px, EXIF turned upright and removed), keeps a large copy (at most 1000 px, never enlarged) and a 160 px copy in Vercel Blob (same place as the circulars), and the table `employee_photo` (sql/19) holds only where they are and the version. The addresses never go to the browser: pictures are served by `GET /api/employees/photo` to ANYBODY LOGGED IN (owner's decision), kept by the browser for good (immutable, the version is in the address). Change/replace/remove = HOD or an authorised delegate; each is a line in the history (\"Changed the photo of NAME (ticket)\", never the picture); a photo alone counts as a change in Modify; when the employee is deleted the photo goes with him. A failed photo never undoes the save (the person is told). (3) The headings of the authorised lists no longer say \"executive\" (non-executives can be in them). CHANGED FROM THE ADVICE: the real original never leaves the PC and is not kept (the host refuses requests over 4.5 MB). NEEDS (the install block does them): `npm install @vladmandic/face-api@1.7.15`; run sql/19 once; BLOB_READ_WRITE_TOKEN must be set (it is, for the circulars). PROOF (sandbox, NOT live): photo test 28 (800 random faces: the head never cut; real generated JPEG/PNG/WebP; a sideways phone picture really turned upright; EXIF removed; sizes; rubbish refused), PhotoField test 15, kit test 64 (the guard), employee store test 165 (who may upload, who may see, history, replace, remove, delete, a failing store), PAX store test 122 unchanged, the employee click-through 105 (no face, a PDF, a good photo, saved with the employee; Modify: the saved photo, replace, remove) and the PAX one 78, and the new rules deliberately broken 6 ways, each caught. NOT VERIFIED: the face finder in a REAL browser (its detection was proved in Node with the same browser build and model; the canvas cut and the picture decoding are code only), the live Blob store, the live database. | owner to run sql/19, npm install and test |";
const MARKER = "| 70 | **Piece 1 finished and the employee PHOTO";
const ANCHOR = "| 69c | **Authorising a NON-EXECUTIVE";

function main() {
  const root = process.cwd();
  const st = path.join(root, "STATUS.md");
  const has = (f, w) => fs.existsSync(path.join(root, f)) && fs.readFileSync(path.join(root, f), "utf8").includes(w);
  if (!fs.existsSync(path.join(root, "package.json")) || !has("src/lib/facility/authority.ts", "confirmNonExecutive") || !has("src/components/facility/NonExecutive.tsx", "NonExecutiveAsk")) {
    console.error("This patch needs step 69c (patch_step69c.zip) to be applied first. Install that one (unzip, then node cleanup/apply-step69c.js), then unzip this one again and run this script.");
    process.exit(1);
  }
  if (!fs.existsSync(path.join(root, "node_modules/@vladmandic/face-api/package.json"))) {
    console.error("The photo needs the face finder, which is not installed yet. Run:   npm install @vladmandic/face-api@1.7.15   and then run this script again.");
    process.exit(1);
  }
  const need = [["src/lib/facility/guard.ts", "guardRecord"], ["src/lib/employees/photo/crop.ts", "squareAround"], ["src/lib/employees/photo/process.ts", "normalisePhoto"], ["src/lib/employees/photo/api.ts", "handlePhotoPost"], ["src/lib/employees/photo/browserDeps.ts", "face-api"], ["src/app/api/employees/photo/route.ts", "handlePhotoGet"], ["src/components/facility/PhotoField.tsx", "PhotoField"], ["src/components/EmployeeAdminPanel.tsx", "syncPhoto"], ["src/lib/employees/admin/store.ts", "guardRecord"], ["src/lib/pax/admin/store.ts", "guardRecord"], ["src/lib/nl2sql/sql/19_employee_photo.sql", "employee_photo"], ["public/models/face/tiny_face_detector_model.bin", ""]];
  const missing = need.filter(([f, w]) => !has(f, w)).map(([f]) => f);
  if (missing.length) {
    console.error("The files of this patch are not in place: unzip patch_step70.zip into the project (over the existing files) first, then run this script. Not right yet: " + missing.join(", "));
    process.exit(1);
  }
  if (!fs.existsSync(st)) { console.error("STATUS.md: the file is missing"); process.exit(1); }
  const cur = fs.readFileSync(st, "utf8");
  if (cur.includes(MARKER)) { console.log("already there   STATUS.md\n\nNothing to do: step 70 is already applied."); return; }
  if (cur.split(ANCHOR).length - 1 !== 1) { console.error("NOTHING WAS WRITTEN. STATUS.md: the place for the new row (above the row of step 69c) was not found exactly once."); process.exit(1); }
  fs.writeFileSync(st, cur.replace(ANCHOR, () => ROW_70 + "\n" + ANCHOR));
  console.log("will change     STATUS.md\n\nDone: 1 change. If you have not yet, run src/lib/nl2sql/sql/19_employee_photo.sql once in the Supabase SQL editor.");
}
main();
