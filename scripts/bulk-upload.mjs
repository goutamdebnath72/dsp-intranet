// scripts/bulk-upload.mjs
//
// Bulk-uploads circulars through the REAL POST /api/circulars endpoint —
// the exact same backend path the admin modal uses (OCR -> chunk -> embed
// -> atomic DB transaction -> blob store). No shortcuts, no direct DB writes.
//
// It is driven entirely by a manifest CSV so the title<->file pairing is the
// one you verified, never guessed at upload time.
//
// PREREQUISITES:
//   1. Dev server running:            npm run dev
//   2. Manifest CSV present (below):   circulars_manifest.csv
//   3. The 50 PDFs on disk under a root you pass with --files
//
// MANIFEST COLUMNS (header row required):
//   filename,folder,confirmed_title,publishedAt_YYYY-MM-DD,status,evidence_notes
//   - filename            : e.g. 07_2023.pdf
//   - folder              : the sub-folder under --files that holds the PDF
//   - confirmed_title     : the headline to store (exact wording)
//   - publishedAt_YYYY-MM-DD : issue date, strict YYYY-MM-DD
//   (status / evidence_notes are ignored by this script — they're for you.)
//
// USAGE:
//   node scripts/bulk-upload.mjs \
//     --manifest ./circulars_manifest.csv \
//     --files "/path/to/2026 to 2022" \
//     --ticket 400000
//
//   Flags:
//     --manifest <path>   CSV path (default ./circulars_manifest.csv)
//     --files <dir>       root dir that contains the year sub-folders
//     --ticket <no>       authorTicketNo to stamp (must start with 4 to allow
//                         later edit/delete by that executive). Optional.
//     --base <url>        default http://localhost:3000
//     --yes               skip the interactive confirm (for CI); default asks
//     --start <n>         1-based row to start from (resume after a failure)
//
// BEHAVIOUR:
//   - Prints the full pairing table, then WAITS for you to type "yes".
//   - Uploads strictly in manifest order, one at a time (serials are assigned
//     per-year by the backend; sequential upload keeps them deterministic).
//   - HALTS on the first failure and tells you which row, so a bad upload can
//     never silently corrupt the set. Re-run with --start <n> to resume.

import { readFileSync, existsSync } from "fs";
import { basename, join, isAbsolute } from "path";
import { createInterface } from "readline";

/* ---------- tiny arg parser ---------- */
function arg(name, def = undefined) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return def;
  const v = process.argv[i + 1];
  return v && !v.startsWith("--") ? v : true;
}

const MANIFEST = arg("manifest", "./circulars_manifest.csv");
const FILES_ROOT = arg("files", ".");
const TICKET = arg("ticket", "");
const BASE = arg("base", "http://localhost:3000");
const SKIP_CONFIRM = !!arg("yes", false);
const START = parseInt(arg("start", "1"), 10) || 1;

/* ---------- minimal CSV parser (handles quoted fields + commas) ---------- */
function parseCSV(text) {
  const rows = [];
  let row = [], field = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQ = false;
      } else field += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else if (c === "\r") { /* ignore */ }
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.length && r.some((x) => x.trim() !== ""));
}

/* ---------- load + validate manifest ---------- */
if (!existsSync(MANIFEST)) {
  console.error(`Manifest not found: ${MANIFEST}`);
  process.exit(1);
}
const raw = parseCSV(readFileSync(MANIFEST, "utf8"));
const header = raw[0].map((h) => h.trim());
const need = ["filename", "folder", "confirmed_title", "publishedAt_YYYY-MM-DD"];
for (const col of need) {
  if (!header.includes(col)) {
    console.error(`Manifest missing required column: ${col}`);
    process.exit(1);
  }
}
const idx = Object.fromEntries(header.map((h, i) => [h, i]));
const records = raw.slice(1).map((r) => ({
  filename: (r[idx["filename"]] || "").trim(),
  folder: (r[idx["folder"]] || "").trim(),
  title: (r[idx["confirmed_title"]] || "").trim(),
  publishedAt: (r[idx["publishedAt_YYYY-MM-DD"]] || "").trim(),
}));

/* ---------- pre-flight validation (fail before any upload) ---------- */
const problems = [];
const seen = new Set();
const dateRe = /^\d{4}-\d{2}-\d{2}$/;
for (const [i, rec] of records.entries()) {
  const n = i + 1;
  if (!rec.filename) problems.push(`row ${n}: empty filename`);
  if (seen.has(rec.filename)) problems.push(`row ${n}: duplicate filename ${rec.filename}`);
  seen.add(rec.filename);
  if (!rec.title) problems.push(`row ${n}: empty title (${rec.filename})`);
  if (!dateRe.test(rec.publishedAt))
    problems.push(`row ${n}: bad date "${rec.publishedAt}" (${rec.filename}) — need YYYY-MM-DD`);
  const p = resolvePath(rec);
  if (!existsSync(p)) problems.push(`row ${n}: file not found on disk: ${p}`);
}
function resolvePath(rec) {
  const root = isAbsolute(FILES_ROOT) ? FILES_ROOT : join(process.cwd(), FILES_ROOT);
  return rec.folder ? join(root, rec.folder, rec.filename) : join(root, rec.filename);
}

if (problems.length) {
  console.error("\nManifest validation FAILED — fix these before uploading:\n");
  for (const p of problems) console.error("  - " + p);
  process.exit(1);
}

/* ---------- show pairing table ---------- */
console.log(`\n${"=".repeat(78)}`);
console.log(`BULK UPLOAD PLAN — ${records.length} circulars -> ${BASE}/api/circulars`);
console.log(`files root: ${FILES_ROOT}`);
console.log(`ticket    : ${TICKET || "(none)"}`);
console.log("=".repeat(78));
for (const [i, r] of records.entries()) {
  const n = String(i + 1).padStart(2, "0");
  console.log(`${n}. [${r.publishedAt}] ${r.filename}`);
  console.log(`      ${r.title}`);
}
console.log("=".repeat(78));
if (START > 1) console.log(`(resuming from row ${START})`);

/* ---------- confirm ---------- */
async function confirm() {
  if (SKIP_CONFIRM) return true;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ans = await new Promise((res) =>
    rl.question('\nType "yes" to upload all of the above: ', res),
  );
  rl.close();
  return ans.trim().toLowerCase() === "yes";
}

/* ---------- upload one row via the real endpoint ---------- */
async function uploadOne(rec) {
  const path = resolvePath(rec);
  const buf = readFileSync(path);
  const type = rec.filename.toLowerCase().endsWith(".pdf")
    ? "application/pdf"
    : rec.filename.toLowerCase().endsWith(".png")
      ? "image/png"
      : "application/octet-stream";

  const fd = new FormData();
  fd.append("headline", rec.title);
  fd.append("publishedAt", rec.publishedAt); // ISO date string, as the picker sends
  if (TICKET) fd.append("authorTicketNo", String(TICKET));
  fd.append("file", new Blob([buf], { type }), basename(rec.filename));

  const res = await fetch(`${BASE}/api/circulars`, { method: "POST", body: fd });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  if (!res.ok) {
    throw new Error(
      `HTTP ${res.status}: ${typeof body === "string" ? body : JSON.stringify(body)}`,
    );
  }
  return body;
}

/* ---------- run ---------- */
(async () => {
  if (!(await confirm())) {
    console.log("Aborted. Nothing uploaded.");
    process.exit(0);
  }
  console.log("");
  let ok = 0;
  for (let i = 0; i < records.length; i++) {
    const n = i + 1;
    if (n < START) continue;
    const rec = records[i];
    process.stdout.write(`[${String(n).padStart(2, "0")}/${records.length}] ${rec.filename} ... `);
    try {
      const body = await uploadOne(rec);
      const serial = body?.circular?.serialNumber;
      const id = body?.circular?.id;
      console.log(`OK (id=${id}, serial=${serial})`);
      ok++;
    } catch (e) {
      console.log("FAILED");
      console.error(`\n  Row ${n} (${rec.filename}) failed:\n  ${e.message}\n`);
      console.error(`  Halting. Fix the cause, then resume with:  --start ${n}`);
      process.exit(1);
    }
  }
  console.log(`\nDone. ${ok}/${records.length} uploaded successfully.`);
})();
