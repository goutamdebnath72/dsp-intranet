#!/usr/bin/env node
// cleanup/audit-tree.js - a READ-ONLY audit of the project tree. It changes NOTHING in the project.
// Run from the project root:   node cleanup/audit-tree.js
// It writes its full report OUTSIDE the project, to ../dsp-intranet-audit.md, and prints a short summary.
//
// What it finds, from evidence (never from guessing):
//   1. source files that nothing reachable from the app, the scripts or the evaluation tools imports (orphans), and files only a self-test imports;
//   2. package.json dependencies that no file refers to;
//   3. files in public/ that no file refers to;
//   4. junk (.DS_Store, logs, backups, zips), very large files, and what Git ignores but is on disk;
//   5. files that still mention Ollama; the cleanup/, scripts/ and eval/ folders listed in full.
// It cannot see references built at run time (a file name assembled from pieces, a path read from the database), so every list is a list of
// CANDIDATES for a human to confirm, not a list to delete.
const fs = require("fs");
const path = require("path");
const cp = require("child_process");

const ROOT = process.cwd();
if (!fs.existsSync(path.join(ROOT, "package.json"))) {
  console.error("NOT RUN: run this from the project root (the folder with package.json).");
  process.exit(1);
}
const OUT = path.resolve(ROOT, "..", "dsp-intranet-audit.md");
const posix = (p) => p.split(path.sep).join("/");
const kb = (n) => (n >= 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB");

function git(args) {
  try { return cp.execFileSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 27, stdio: ["ignore", "pipe", "ignore"] }); } catch { return null; }
}
function walk(dir, skip, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skip.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, skip, out);
    else if (e.isFile()) out.push(posix(path.relative(ROOT, full)));
  }
  return out;
}

// ---------------------------------------------------------------- the files that count
const inGit = (git(["rev-parse", "--is-inside-work-tree"]) || "").trim() === "true";
let files;
if (inGit) files = (git(["ls-files", "-co", "--exclude-standard"]) || "").split("\n").filter(Boolean).filter((f) => fs.existsSync(path.join(ROOT, f)));
else files = walk(ROOT, new Set(["node_modules", ".next", ".git"]));
files = [...new Set(files)].sort();
const size = (f) => { try { return fs.statSync(path.join(ROOT, f)).size; } catch { return 0; } };
const text = (f) => { try { return fs.readFileSync(path.join(ROOT, f), "utf8"); } catch { return ""; } };

const CODE = /\.(tsx?|jsx?|mjs|cjs)$/;
const codeFiles = files.filter((f) => CODE.test(f));
const fileSet = new Set(files);

// ---------------------------------------------------------------- tsconfig paths (a tolerant read: tsconfig may hold comments)
function stripJsonComments(s) {
  let out = "", inStr = false, q = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i], n = s[i + 1];
    if (inStr) { out += c; if (c === "\\") { out += n; i++; } else if (c === q) inStr = false; continue; }
    if (c === '"' || c === "'") { inStr = true; q = c; out += c; continue; }
    if (c === "/" && n === "/") { while (i < s.length && s[i] !== "\n") i++; out += "\n"; continue; }
    if (c === "/" && n === "*") { i += 2; while (i < s.length && !(s[i] === "*" && s[i + 1] === "/")) i++; i++; continue; }
    out += c;
  }
  return out.replace(/,(\s*[}\]])/g, "$1");
}
let aliases = [{ prefix: "@", target: "src" }];
try {
  const ts = JSON.parse(stripJsonComments(fs.readFileSync(path.join(ROOT, "tsconfig.json"), "utf8")));
  const base = ts.compilerOptions?.baseUrl || ".";
  const paths = ts.compilerOptions?.paths || {};
  const found = Object.entries(paths).filter(([k, v]) => k.endsWith("/*") && v[0]).map(([k, v]) => ({ prefix: k.slice(0, -2), target: posix(path.normalize(path.join(base, v[0].replace(/\/\*$/, "")))) }));
  if (found.length) aliases = found;
} catch { /* keep the usual "@/ = src/" */ }

// ---------------------------------------------------------------- import graph
const EXTS = ["", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".css"];
function resolveSpec(from, spec) {
  let base = null;
  if (spec.startsWith(".")) base = posix(path.normalize(path.join(path.dirname(from), spec)));
  else {
    const a = aliases.find((x) => spec === x.prefix || spec.startsWith(x.prefix + "/"));
    if (a) base = posix(path.normalize(path.join(a.target, spec.slice(a.prefix.length))));
  }
  if (base === null) return null; // a package
  const tries = [];
  for (const e of EXTS) tries.push(base + e);
  for (const e of EXTS.slice(1)) tries.push(base + "/index" + e);
  const m = base.match(/^(.*)\.(m?js)$/);
  if (m) tries.push(m[1] + ".ts", m[1] + ".tsx");
  return tries.find((t) => fileSet.has(t)) || null;
}
const SPEC_RES = [
  /(?:^|[\s;}])(?:import|export)\s+(?:[^'"`;]*?\sfrom\s+)?["']([^"']+)["']/g,
  /import\(\s*["']([^"']+)["']\s*\)/g,
  /require\(\s*["']([^"']+)["']\s*\)/g,
];
const edges = new Map(); // file -> [files]
const packagesUsed = new Set();
for (const f of codeFiles) {
  const src = text(f), out = [];
  for (const re of SPEC_RES) for (const m of src.matchAll(re)) {
    const spec = m[1];
    const r = resolveSpec(f, spec);
    if (r) out.push(r);
    else if (!spec.startsWith(".")) packagesUsed.add(spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0]);
  }
  // non-code files named in an import of a CSS/JSON etc. are covered by resolveSpec; plain string mentions are checked later
  edges.set(f, out);
}

// ---------------------------------------------------------------- entries
const isTest = (f) => /\.(selftest|test|spec)\.(tsx?|jsx?|mjs|cjs)$/.test(f);
const isAppEntry = (f) => /^(src\/)?app\/(.*\/)?(page|layout|route|loading|error|global-error|not-found|template|default|opengraph-image|twitter-image|icon|apple-icon|sitemap|robots|manifest)\.(tsx?|jsx?)$/.test(f);
// files Next.js uses by their NAME alone (no import), in any extension: the icon, social images, robots, sitemap, manifest; and the Pages Router
const isNextByName = (f) => /^(src\/)?app\/(.*\/)?(favicon\.ico|icon\d*\.(png|jpe?g|svg|ico)|apple-icon\d*\.(png|jpe?g)|opengraph-image\d*\.(png|jpe?g|gif)|twitter-image\d*\.(png|jpe?g|gif)|robots\.txt|sitemap\.xml|manifest\.(json|webmanifest))$/.test(f) || /^(src\/)?pages\/.*\.(tsx?|jsx?)$/.test(f);
const isOtherEntry = (f) => /^(src\/)?(middleware|instrumentation)\.(ts|js)$/.test(f) || /(^|\/)\.eslintrc\.(js|cjs)$/.test(f) || /(^|\/)[\w.-]*\.config\.(ts|js|mjs|cjs)$/.test(f) || /^(scripts|eval|cleanup)\/.*\.(tsx?|jsx?|mjs|cjs)$/.test(f);
function reach(entries) {
  const seen = new Set(entries), stack = [...entries];
  while (stack.length) for (const n of edges.get(stack.pop()) || []) if (!seen.has(n)) { seen.add(n); stack.push(n); }
  return seen;
}
const mainEntries = [...codeFiles.filter((f) => !isTest(f) && (isAppEntry(f) || isOtherEntry(f))), ...files.filter(isNextByName)];
const used = reach(mainEntries);
const testEntries = codeFiles.filter(isTest);
const testReach = reach(testEntries);

const allText = codeFiles.map(text).join("\n");
const configTexts = files.filter((f) => /(^|\/)(package\.json|tsconfig[\w.]*\.json|\.eslintrc[\w.]*|vercel\.json|next\.config\.[\w]+|tailwind\.config\.[\w]+|postcss\.config\.[\w]+|components\.json)$/.test(f)).map(text).join("\n");
const scriptsText = (() => { try { return Object.values(JSON.parse(text("package.json")).scripts || {}).join("\n"); } catch { return ""; } })();
const mentionedByName = (f) => { const b = path.basename(f); return allText.includes(b) || configTexts.includes(b); };

const srcFiles = files.filter((f) => f.startsWith("src/") && !isTest(f) && !/\.d\.ts$/.test(f));
const JUNK = /(^|\/)(\.DS_Store|Thumbs\.db)$|\.(log|orig|rej|bak|tmp|zip|swp)$|~$/;
const orphans = [], onlyTested = [];
for (const f of srcFiles) {
  if (used.has(f) || JUNK.test(f)) continue; // junk is listed under 4a, not here
  if (!CODE.test(f) && mentionedByName(f)) continue; // a non-code file named somewhere
  (testReach.has(f) ? onlyTested : orphans).push(f);
}

// ---------------------------------------------------------------- dependencies
let pkg = {};
try { pkg = JSON.parse(text("package.json")); } catch { /* reported below */ }
const ALWAYS = new Set(["next", "react", "react-dom", "typescript", "tailwindcss", "postcss", "autoprefixer", "eslint", "eslint-config-next", "@types/node", "@types/react", "@types/react-dom"]);
const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
const unusedDeps = [];
for (const name of Object.keys(deps)) {
  if (ALWAYS.has(name) || packagesUsed.has(name)) continue;
  if (name.startsWith("@types/")) {
    const real = name.slice(7).replace("__", "/");
    if (packagesUsed.has(real) || packagesUsed.has("@" + real) || deps[real] || deps["@" + real]) { if (packagesUsed.has(real) || packagesUsed.has("@" + real)) continue; }
  }
  if (configTexts.replace(/"dependencies"[\s\S]*?\n\s*}/, "").includes(`"${name}"`) && !text("package.json").includes(`"${name}":`)) continue;
  const bin = name.replace(/^@[^/]+\//, "");
  if (new RegExp(`(^|[\\s&|;])${bin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([\\s&|;]|$)`, "m").test(scriptsText)) continue; // used as a command in a script
  unusedDeps.push(`${name} ${deps[name]}${pkg.devDependencies && pkg.devDependencies[name] ? " (dev)" : ""}`);
}

// ---------------------------------------------------------------- public assets, junk, large files, ignored things, Ollama
const publicFiles = files.filter((f) => f.startsWith("public/"));
const cssText = files.filter((f) => /\.css$/.test(f)).map(text).join("\n");
const unreferencedPublic = publicFiles.filter((f) => {
  const rel = "/" + f.slice("public/".length), b = path.basename(f);
  return !(allText.includes(rel) || cssText.includes(rel) || allText.includes(b) || cssText.includes(b) || configTexts.includes(b));
});
const junk = files.filter((f) => JUNK.test(f));
const large = files.filter((f) => size(f) > 2 * 1048576).sort((a, b) => size(b) - size(a));
let ignoredOnDisk = [];
if (inGit) {
  const ig = (git(["ls-files", "-o", "-i", "--exclude-standard", "--directory"]) || "").split("\n").filter(Boolean);
  ignoredOnDisk = ig.filter((p) => !ig.some((q) => q !== p && p.startsWith(q))).map((p) => {
    let n = 0;
    try { const o = cp.execFileSync("du", ["-sk", path.join(ROOT, p)], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }); n = parseInt(o, 10) * 1024; } catch { /* unknown */ }
    return { p, n };
  });
}
const mentionsOllama = files.filter((f) => !/package-lock\.json$|audit-tree\.js$/.test(f) && /ollama/i.test(text(f)) && size(f) < 2 * 1048576);
const envFiles = fs.readdirSync(ROOT).filter((f) => /^\.env/.test(f)); // names only, never the values
const docs = files.filter((f) => /\.(md|docx|pdf|txt)$/i.test(f) && !f.startsWith("public/") && !/package-lock/.test(f));
const folder = (d) => files.filter((f) => f.startsWith(d + "/")).map((f) => `${f} (${kb(size(f))})`);

// ---------------------------------------------------------------- the report
const L = [];
const sec = (title, items, note = "") => { L.push(`\n## ${title} (${items.length})`); if (note) L.push(note); L.push(items.length ? items.map((x) => "- " + x).join("\n") : "- none"); };
L.push(`# Project tree audit`, `Read-only. Project: ${ROOT}. ${files.length} files counted (${inGit ? "Git's own list: tracked and not ignored" : "NOT a Git repository: every file except node_modules, .next and .git"}); ${codeFiles.length} are code.`);
sec("1a. Source files that nothing imports (orphans)", orphans.map((f) => `${f} (${kb(size(f))})`), "Not reached from any page, API route, middleware, script, evaluation tool or config, and not imported by any self-test. A file loaded by a name built at run time would still show here.");
sec("1b. Source files only a self-test imports", onlyTested.map((f) => `${f} (${kb(size(f))})`), "Tested, but nothing in the app uses them.");
sec("2. package.json dependencies that no file refers to", unusedDeps, "No import, no mention in a config file, no use as a command in a package.json script. Packages used only by a tool that finds them by itself (a Tailwind or PostCSS plugin named in a file this audit cannot read) can appear here: confirm before removing.");
sec("3. Files in public/ that no file refers to", unreferencedPublic.map((f) => `${f} (${kb(size(f))})`), "A file named from the database (a logo path stored in a row) would show here although it is used.");
sec("4a. Junk", junk.map((f) => `${f} (${kb(size(f))})`));
sec("4b. Files larger than 2 MB (counted in the project)", large.map((f) => `${f} (${kb(size(f))})`));
sec("4c. On disk but ignored by Git (not part of the repository)", ignoredOnDisk.sort((a, b) => b.n - a.n).map((x) => `${x.p} (${x.n ? kb(x.n) : "size unknown"})`), inGit ? "These never reach GitHub; node_modules, .next and .env files are normal here." : "(not a Git repository)");
sec("4d. Environment files (names only)", envFiles);
sec("5. Files that still mention Ollama", mentionsOllama);
sec("6a. Documents", docs.map((f) => `${f} (${kb(size(f))})`));
sec("6b. cleanup/", folder("cleanup"));
sec("6c. scripts/", folder("scripts"));
sec("6d. eval/", folder("eval"));
const top = {};
for (const f of files) { const t = f.includes("/") ? f.split("/")[0] + "/" : f; top[t] = (top[t] || 0) + size(f); }
L.push(`\n## 7. Top level (size of counted files)`, Object.entries(top).sort((a, b) => b[1] - a[1]).map(([k, v]) => `- ${k} ${kb(v)}`).join("\n"));
fs.writeFileSync(OUT, L.join("\n") + "\n");

console.log(`Audit done. Nothing in the project was changed.`);
console.log(`  orphan source files: ${orphans.length} | only tested: ${onlyTested.length} | unused dependencies: ${unusedDeps.length} | unreferenced public files: ${unreferencedPublic.length} | junk: ${junk.length} | large: ${large.length}`);
console.log(`Full report: ${OUT}`);
console.log(`Please send me that file.`);
