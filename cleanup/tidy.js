#!/usr/bin/env node
// cleanup/tidy.js - move what the project does not need out of the project tree. Follows cleanup/clean.sh: a dry run by default.
//
//   node cleanup/tidy.js                     shows what it WOULD move, after checking every item again; changes nothing
//   node cleanup/tidy.js --apply             does it
//   node cleanup/tidy.js --also docker,pdfs  also moves optional groups (their names are listed at the end of the dry run)
//
// NOTHING IS DELETED. Every moved item goes to  ../dsp-intranet-removed/<date-time>/  (outside the project, same folder layout), and a file
// that Git tracks is also recorded as removed (git rm --cached). To bring things back: the restore line printed at the end.
// FAILS CLOSED: before moving an item it looks for any reference to it in the project's files; one reference and that item stays.
const fs = require("fs");
const path = require("path");
const cp = require("child_process");

const ROOT = process.cwd();
if (!fs.existsSync(path.join(ROOT, "package.json")) || !fs.existsSync(path.join(ROOT, "src"))) {
  console.error("NOT RUN: run this from the project root (the folder with package.json).");
  process.exit(1);
}
const APPLY = process.argv.includes("--apply");
const alsoArg = (process.argv.find((a) => a.startsWith("--also=")) || "").slice(7) || (process.argv.includes("--also") ? process.argv[process.argv.indexOf("--also") + 1] || "" : "");
const ALSO = new Set(alsoArg.split(",").map((x) => x.trim()).filter(Boolean));
const posix = (p) => p.split(path.sep).join("/");
const kb = (n) => (n >= 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB");
const git = (args) => { try { return cp.execFileSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 27, stdio: ["ignore", "pipe", "ignore"] }); } catch { return null; } };
const inGit = (git(["rev-parse", "--is-inside-work-tree"]) || "").trim() === "true";

// ---------------------------------------------------------------- the files that count, and what they say
function walk(dir, skip, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skip.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, skip, out); else if (e.isFile()) out.push(posix(path.relative(ROOT, full)));
  }
  return out;
}
let files = inGit ? (git(["ls-files", "-co", "--exclude-standard"]) || "").split("\n").filter(Boolean) : walk(ROOT, new Set(["node_modules", ".next", ".git"]));
files = [...new Set(files)].filter((f) => fs.existsSync(path.join(ROOT, f))).sort();
const TEXT = /\.(tsx?|jsx?|mjs|cjs|json|css|scss|md|txt|sh|ya?ml|html|csv|sql)$|(^|\/)(Dockerfile|\.dockerignore|\.gitignore|\.npmrc|\.env\.example)$/;
const sizeOf = (f) => { try { return fs.statSync(path.join(ROOT, f)).size; } catch { return 0; } };
const content = new Map();
for (const f of files) if (TEXT.test(f) && !/package-lock\.json$/.test(f) && sizeOf(f) < 2 * 1048576) content.set(f, fs.readFileSync(path.join(ROOT, f), "utf8"));
// a mention in a document or in a cleanup tool is a note, not a use; everything else (code, config, data) is a use
const isNote = (f) => /\.(md|txt)$/i.test(f) || f.startsWith("cleanup/") || /(^|\/)\.gitignore$/.test(f);

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ---- how files import each other: the same reading as cleanup/audit-tree.js (relative paths and the tsconfig alias)
function stripJsonComments(src) {
  let out = "", inStr = false, q = "";
  for (let i = 0; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (inStr) { out += c; if (c === "\\") { out += n; i++; } else if (c === q) inStr = false; continue; }
    if (c === '"' || c === "'") { inStr = true; q = c; out += c; continue; }
    if (c === "/" && n === "/") { while (i < src.length && src[i] !== "\n") i++; out += "\n"; continue; }
    if (c === "/" && n === "*") { i += 2; while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i++; i++; continue; }
    out += c;
  }
  return out.replace(/,(\s*[}\]])/g, "$1");
}
let aliases = [{ prefix: "@", target: "src" }];
try {
  const ts = JSON.parse(stripJsonComments(fs.readFileSync(path.join(ROOT, "tsconfig.json"), "utf8")));
  const base = ts.compilerOptions?.baseUrl || ".";
  const found = Object.entries(ts.compilerOptions?.paths || {}).filter(([k, v]) => k.endsWith("/*") && v[0]).map(([k, v]) => ({ prefix: k.slice(0, -2), target: posix(path.normalize(path.join(base, v[0].replace(/\/\*$/, "")))) }));
  if (found.length) aliases = found;
} catch { /* the usual "@/ = src/" */ }
const SPEC_RES = [
  /(?:^|[\s;}])(?:import|export)\s+(?:[^'"`;]*?\sfrom\s+)?["']([^"']+)["']/g,
  /import\(\s*["']([^"']+)["']\s*\)/g,
  /require\(\s*["']([^"']+)["']\s*\)/g,
];
const stemOf = (p) => p.replace(/\.(tsx?|jsx?|mjs|cjs)$/, "").replace(/\/index$/, "");
const importStems = new Map(); // file -> the files it imports, written without extension
for (const [f, t] of content) {
  if (!/\.(tsx?|jsx?|mjs|cjs)$/.test(f)) continue;
  const set = new Set();
  for (const re of SPEC_RES) for (const m of t.matchAll(re)) {
    const spec = m[1];
    let base = null;
    if (spec.startsWith(".")) base = posix(path.normalize(path.join(path.dirname(f), spec)));
    else { const a = aliases.find((x) => spec === x.prefix || spec.startsWith(x.prefix + "/")); if (a) base = posix(path.normalize(path.join(a.target, spec.slice(a.prefix.length)))); }
    if (base) set.add(stemOf(base));
  }
  importStems.set(f, set);
}
/** Files that use a SOURCE MODULE: they import it (the path is resolved, so another file with the same name does not count), or write its path as a string. */
function modulePathMentions(file, movingSet) {
  const stem = stemOf(file);
  const tail = file.replace(/\.[^.]+$/, "").split("/").slice(-2).join("/");
  const re = new RegExp("(^|[^\\w-])" + esc(tail) + "(\\.(?:tsx?|jsx?|mjs|cjs))?['\"`]");
  const uses = [], notes = [];
  for (const [f, t] of content) {
    if (f === file || movingSet.has(f)) continue;
    const viaString = re.test(t);
    if (isNote(f)) { if (viaString) notes.push(f); continue; }
    if (viaString || (importStems.get(f) && importStems.get(f).has(stem))) uses.push(f);
  }
  return { uses, notes };
}
/** Files that name an ASSET or any other file by its file name. A mention only in comments is a note, not a use. */
function nameMentions(file, movingSet) {
  const base = path.basename(file);
  const re = new RegExp("(^|[^A-Za-z0-9_.-])" + esc(base) + "(?![A-Za-z0-9_-])");
  const uses = [], notes = [];
  for (const [f, t] of content) {
    if (f === file || movingSet.has(f)) continue;
    const lines = t.split("\n").filter((l) => re.test(l));
    if (!lines.length) continue;
    const onlyComments = lines.every((l) => /^\s*(\/\/|\/\*|\*|#)/.test(l));
    (isNote(f) || onlyComments ? notes : uses).push(f);
  }
  return { uses, notes };
}

// ---------------------------------------------------------------- what could go, and why
function dirFiles(dir) { // every file under dir (ignored or not), as paths from the project root
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  return fs.statSync(abs).isDirectory() ? walk(abs, new Set()) : [dir];
}
const exists = (p) => fs.existsSync(path.join(ROOT, p));
const gitignoreText = exists(".gitignore") ? fs.readFileSync(path.join(ROOT, ".gitignore"), "utf8") : "";

const GROUPS = [
  { id: "dead-code", why: "source file that nothing imports (verified again below)", kind: "module", optional: false,
    paths: ["src/components/AiOverview.tsx", "src/components/NewHero.tsx", "src/components/SearchBar.tsx", "src/hooks/useTypewriter.ts", "src/lib/ai/chunkText.ts", "src/lib/ai/saveEmbedding.ts",
            "src/lib/circulars.js", "src/lib/citusers.js", "src/lib/departments.js", "src/lib/db/force-pg.ts", "src/lib/db/postgres.runtime.ts", "src/lib/debugLog.ts", "src/lib/env.ts"] },
  { id: "windows-markers", why: "Windows download marker (:Zone.Identifier), never used", kind: "none", optional: false, paths: files.filter((f) => /:Zone\.Identifier$/.test(f)) },
  { id: "starter-images", why: "Next.js starter image, never used", kind: "name", optional: false, paths: ["public/file.svg", "public/globe.svg", "public/next.svg", "public/vercel.svg", "public/window.svg"] },
  { id: "unused-images", why: "image or video no file refers to (the code uses a different file)", kind: "name", optional: false,
    paths: [...dirFiles("public/incorrect"), "public/wheel-axle-icon.png", "public/coke-oven-batteries.png", "public/steel-plant2.png", "public/Steel_Plant_Video1.mp4"] },
  { id: "duplicate-images", why: "copy of an image that the code uses from public/ itself", kind: "copy", optional: false, paths: dirFiles("public/correct") },
  { id: "language-cache", why: "Tesseract's download cache, committed by mistake (.gitignore already ignores *.traineddata); it downloads again when needed", kind: "traineddata", optional: false,
    paths: ["eng.traineddata", "ben.traineddata", "hin.traineddata"] },
  { id: "scratch", why: "scratch note or tool output at the top level", kind: "name", optional: false, paths: ["msg.txt", "temp.json", "output-1.png"] },
  { id: "installers", why: "one-time patch script, already applied (it only reports 'already applied' now)", kind: "name", optional: false,
    paths: files.filter((f) => /^cleanup\/(apply-step[\w-]*\.js|apply-all-[\w-]*\.js|apply-title-normalizer\.js)$/.test(f)) },
  { id: "probes", why: "one-off diagnostic script from an investigation", kind: "name", optional: false, paths: files.filter((f) => /^scripts\/probe-[\w-]+\.mjs$/.test(f)) },
  { id: "outputs", why: "generated output of an evaluation tool (made again by running it)", kind: "none", optional: false,
    paths: [...dirFiles("eval/results"), "circular-battery-report.txt", ...fs.readdirSync(ROOT).filter((f) => /^nl2sql-eval-.*\.(json|md|txt)$/.test(f))] },
  // ---- optional: you decide
  { id: "docker", why: "Docker files (the site is deployed on Vercel; keep them if a closed-network Docker deployment is planned)", kind: "name", optional: true, paths: ["Dockerfile", ".dockerignore", "run-docker.sh", "apt-get.txt"] },
  { id: "pdfs", why: "the original holiday circular PDFs (23 MB; the holiday data comes from the curated JSON, these are the source documents)", kind: "name", optional: true, paths: dirFiles("Holidays/holiday circulars") },
  { id: "backfill", why: "one-time data tool: back-fills page numbers (keep it if the database may still lack them)", kind: "name", optional: true, paths: ["scripts/backfill-page-numbers.mjs"] },
  { id: "caches", why: "caches of the re-read and health check-up tools (made again; they only save time)", kind: "none", optional: true, paths: [...dirFiles("reread-cache"), ...dirFiles("health-cache")] },
  { id: "reports", why: "backups and reports of earlier re-read / health check-up runs (could be needed to undo a run)", kind: "none", optional: true, paths: [...dirFiles("reread-backups"), ...dirFiles("reread-reports"), ...dirFiles("health-reports")] },
  { id: "envbackup", why: "an old copy of .env (local only, never in Git)", kind: "none", optional: true, paths: fs.readdirSync(ROOT).filter((f) => /^\.env\.backup\./.test(f)) },
  { id: "oldtools", why: "the cleanup tools themselves, once the tidy-up is finished", kind: "none", optional: true, paths: ["cleanup/clean.sh", "cleanup/audit-tree.js", "cleanup/tidy.js"] },
];
const active = GROUPS.filter((g) => !g.optional || ALSO.has(g.id));
const unknownAlso = [...ALSO].filter((a) => !GROUPS.some((g) => g.optional && g.id === a));

// ---------------------------------------------------------------- check every item again (fails closed)
const plan = []; // { path, group, size, status: "ok" | "kept", reason }
const claimed = new Set(); // a path belongs to the FIRST group that names it
for (const g of active) for (const p of g.paths) if (exists(p) && !claimed.has(p) && claimed.add(p)) plan.push({ path: p, group: g, size: sizeOf(p) || (() => { try { return parseInt(cp.execFileSync("du", ["-sk", path.join(ROOT, p)], { encoding: "utf8" }), 10) * 1024; } catch { return 0; } })(), status: "ok", reason: "" });
// repeat until stable: an item referred to only by items that are leaving does not hold anyone back, but one that stays holds its references
for (let round = 0; round < 10; round++) {
  const moving = new Set(plan.filter((x) => x.status === "ok").map((x) => x.path));
  let changed = false;
  for (const it of plan) {
    if (it.status !== "ok") continue;
    const k = it.group.kind;
    let r = null;
    if (k === "module") {
      const dir = path.dirname(it.path), stem = path.basename(it.path).replace(/\.[^.]+$/, "");
      const sib = files.find((f) => f !== it.path && path.dirname(f) === dir && path.basename(f).replace(/\.[^.]+$/, "") === stem && /\.(tsx?|jsx?)$/.test(f));
      if (sib) r = `has a same-named sibling (${sib}); webpack and TypeScript pick different ones`;
      else { const m = modulePathMentions(it.path, moving); if (m.uses.length) r = `imported by ${m.uses.slice(0, 3).join(", ")}`; else if (m.notes.length) it.note = `named in ${m.notes.slice(0, 3).join(", ")}`; }
    } else if (k === "name") {
      const m = nameMentions(it.path, moving);
      if (m.uses.length) r = `named in ${m.uses.slice(0, 3).join(", ")}`; else if (m.notes.length) it.note = `named in ${m.notes.slice(0, 3).join(", ")}`;
    } else if (k === "traineddata") {
      // nothing in the code calls these files by name: Tesseract looks for them in the working folder by itself and downloads them when they are missing
      if (!/^\s*\*\.traineddata\s*$/m.test(gitignoreText)) r = "(.gitignore does not list *.traineddata)";
    } else if (k === "copy") {
      const base = path.basename(it.path), root = "public/" + base;
      if (!exists(root)) r = `no copy of ${base} directly in public/`;
      else { const m = content; for (const [f, t] of m) if (!isNote(f) && !moving.has(f) && t.includes("/correct/")) { r = `${f} refers to /correct/`; break; } }
    }
    if (r) { it.status = "kept"; it.reason = r; changed = true; }
  }
  if (!changed) break;
}

// ---------------------------------------------------------------- the report
const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14).replace(/(\d{8})(\d{6})/, "$1-$2");
const DEST = path.resolve(ROOT, "..", "dsp-intranet-removed", stamp);
let total = 0, nOk = 0, nKept = 0;
console.log(APPLY ? `TIDY: moving to ${DEST}` : "TIDY - a dry run: nothing is moved. Add --apply to do it.");
for (const g of active) {
  const items = plan.filter((x) => x.group === g);
  if (!items.length) continue;
  const ok = items.filter((x) => x.status === "ok"), kept = items.filter((x) => x.status === "kept");
  console.log(`\n[${g.id}]${g.optional ? " (optional)" : ""} ${g.why}`);
  for (const it of ok) { console.log(`   MOVE  ${kb(it.size).padStart(8)}  ${it.path}${it.note ? `   (${it.note}; not a use)` : ""}`); total += it.size; nOk++; }
  for (const it of kept) { console.log(`   STAYS ${"".padStart(8)}  ${it.path}   <- ${it.reason}`); nKept++; }
}
console.log(`\n${nOk} item(s) to move (${kb(total)}), ${nKept} that stay because something refers to them.`);

const optionalOff = GROUPS.filter((g) => g.optional && !ALSO.has(g.id));
if (optionalOff.length) {
  console.log(`\nOptional groups, NOT included (add them with  --also name,name ):`);
  for (const g of optionalOff) { const n = g.paths.filter(exists).length; if (n) console.log(`   ${g.id.padEnd(10)} ${String(n).padStart(3)} item(s)  ${g.why}`); }
}
if (unknownAlso.length) console.log(`\nUnknown --also name(s): ${unknownAlso.join(", ")}`);
console.log(`\nLeft alone on purpose (they look unused to a simple scan but are needed): src/lib/nl2sql/eval/* (the self-test and evaluation tools), src/lib/nl2sql/sql/*.sql (migrations run by hand), src/lib/ingestion/readingCheck.ts (to be wired in next), src/lib/holidays/extraction.ts (goes with the dormant extraction-staging routes, in the security step), the curated Holidays/*.json, circulars_manifest.csv and circulars_wage_one.csv, next-env.d.ts, node_modules and .next.`);

// the packages: reported, never touched here (package.json and the lock file are changed by npm itself, and the build must be run after)
(() => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  const all = [...content.entries()].filter(([f]) => /\.(tsx?|jsx?|mjs|cjs)$/.test(f));
  const cfg = [...content.entries()].filter(([f]) => /(^|\/)(tsconfig[\w.]*\.json|\.eslintrc[\w.]*|vercel\.json|next\.config\.[\w]+|tailwind\.config\.[\w]+|postcss\.config\.[\w]+|Dockerfile)$/.test(f)).map(([, t]) => t).join("\n");
  const scripts = Object.values(pkg.scripts || {}).join("\n");
  const never = ["@google/generative-ai", "@supabase/supabase-js", "date-fns", "file-type", "openai", "pdf-lib"].filter((n) => pkg.dependencies?.[n] || pkg.devDependencies?.[n]);
  const stillUsed = never.filter((n) => all.some(([, t]) => new RegExp("(from\\s+|require\\(\\s*|import\\(\\s*)[\"']" + esc(n) + "(/[^\"']*)?[\"']").test(t)) || cfg.includes(n) || scripts.includes(n));
  const free = never.filter((n) => !stillUsed.includes(n));
  console.log(`\nPackages (a separate step, 32c; this tool changes nothing in package.json):`);
  console.log(free.length ? `   no import, config or script refers to: ${free.join(", ")}\n   (later:  npm uninstall ${free.join(" ")}  then  npm run build )` : "   none of the six suspected packages is unreferenced.");
  if (stillUsed.length) console.log(`   still referenced, keep: ${stillUsed.join(", ")}`);
})();

// ---------------------------------------------------------------- do it
if (APPLY) {
  const movedDirs = new Set();
  let n = 0;
  for (const it of plan.filter((x) => x.status === "ok")) {
    const from = path.join(ROOT, it.path), to = path.join(DEST, it.path);
    if (inGit) git(["rm", "-r", "--cached", "--ignore-unmatch", "-q", "--", it.path]);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.renameSync(from, to);
    movedDirs.add(path.dirname(from));
    n++;
  }
  // folders left empty by the move go too (deepest first); a folder that still holds anything stays
  for (const d of [...movedDirs].sort((a, b) => b.length - a.length)) {
    let cur = d;
    while (cur.startsWith(ROOT + path.sep) && fs.existsSync(cur) && fs.readdirSync(cur).filter((x) => x !== ".DS_Store").length === 0) {
      try { for (const x of fs.readdirSync(cur)) fs.rmSync(path.join(cur, x)); fs.rmdirSync(cur); } catch { break; }
      cur = path.dirname(cur);
    }
  }
  console.log(`\nMoved ${n} item(s) (${kb(total)}) to ${DEST}`);
  console.log(`To bring everything back:  cp -R "${DEST}/." .`);
  console.log(`Then check:  npx tsc --noEmit   and look at the site (home page, circulars, holidays) before committing.`);
}
