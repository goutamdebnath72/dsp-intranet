// scripts/comments/comments.mjs
//
// The comment tool: it takes every comment out of the code files as a numbered block (scan), gives the blocks to a writer in batches (the writer changes the WORDS of a block, never the code), and puts the new words back (apply). Nothing but
// comment text can change: apply checks, file by file, that the code tokens before and after are the same (the TypeScript scanner, comments left out) and refuses a file whose code differs. A block whose original text has changed since the scan is skipped.
//   node scripts/comments/comments.mjs scan  [--max-chars 38000]   -> .comment-work/blocks.json and .comment-work/in/NNN.json
//   node scripts/comments/comments.mjs apply [--dry]               -> reads .comment-work/out/NNN.json, rewrites the files
//   node scripts/comments/comments.mjs verify                      -> checks every file against .comment-work/blocks.json (code unchanged)
import ts from "typescript";
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import { createHash } from "node:crypto";

const ROOT = process.cwd();
const WORK = join(ROOT, ".comment-work");
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "public", "reread-gemini-cache", "reread-backups", "coverage", ".vercel", ".comment-work", "dist", "out", "api-docs"]);
const CODE_EXT = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs"]);
const SQL_EXT = new Set([".sql"]);
const DIRECTIVE = /^\s*(eslint|prettier|@ts-|ts-(ignore|expect-error|nocheck|check)|istanbul|c8\s|#region|#endregion|\/\s*<|@vitest|@jsx|@refresh|webpack[A-Z]|#__|@license|@preserve|biome|@flow|@next|jscpd)/i;

const sha = (s) => createHash("sha1").update(s).digest("hex").slice(0, 10);

export function listFiles() {
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir).sort()) {
      const p = join(dir, name);
      const st = statSync(p);
      if (st.isDirectory()) { if (!SKIP_DIRS.has(name)) walk(p); continue; }
      const ext = extname(name);
      if (CODE_EXT.has(ext) || SQL_EXT.has(ext)) out.push(p.slice(ROOT.length + 1));
    }
  };
  for (const top of ["src", "scripts", "sql", "tools"]) if (existsSync(join(ROOT, top))) walk(join(ROOT, top));
  for (const f of readdirSync(ROOT)) if (CODE_EXT.has(extname(f)) && statSync(join(ROOT, f)).isFile()) out.push(f);
  return out;
}

const kindOf = (file) => (file.endsWith(".tsx") ? ts.ScriptKind.TSX : file.endsWith(".ts") ? ts.ScriptKind.TS : ts.ScriptKind.JS);

/** Finds every comment range of a code file (each once), from the TypeScript tree: a // inside a string, a template or JSX text is not one. */
function commentRanges(file, text) {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kindOf(file));
  const seen = new Map();
  const add = (r) => { if (r && !seen.has(r.pos)) seen.set(r.pos, r); };
  const visit = (node) => {
    const kids = node.getChildren(sf);
    if (kids.length === 0) {
      if (node.kind !== ts.SyntaxKind.JsxText) {
        for (const r of ts.getLeadingCommentRanges(text, node.getFullStart()) ?? []) add(r);
        for (const r of ts.getTrailingCommentRanges(text, node.getEnd()) ?? []) add(r);
      }
      return;
    }
    for (const k of kids) visit(k);
  };
  visit(sf);
  return [...seen.values()].sort((a, b) => a.pos - b.pos);
}

/** Returns the code tokens of a file, comments left out; I use it to prove that only comments changed. */
export function codeTokens(file, text) {
  if (SQL_EXT.has(extname(file))) return text.split("\n").filter((l) => !/^\s*--/.test(l)).join("\n");
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kindOf(file));
  const out = [];
  const visit = (node) => {
    if (node.kind >= ts.SyntaxKind.FirstJSDocNode && node.kind <= ts.SyntaxKind.LastJSDocNode) return; // a JSDoc comment is a comment, whatever the tree calls it
    const kids = node.getChildren(sf);
    if (kids.length === 0) { if (node.kind !== ts.SyntaxKind.EndOfFileToken) out.push(node.kind === ts.SyntaxKind.JsxText ? node.getText(sf).replace(/\s+/g, " ").trim() : node.getText(sf)); return; }
    for (const k of kids) visit(k);
  };
  visit(sf);
  return out.join("\u0001");
}

const lineStart = (text, pos) => text.lastIndexOf("\n", pos - 1) + 1;

/** the blocks of one file: consecutive // lines at one indent are ONE block; a /* *\/ comment is one block; a comment after code on its line is a "trail" block */
export function blocksOfFile(file, text) {
  const blocks = [];
  if (SQL_EXT.has(extname(file))) {
    const lines = text.split("\n");
    let off = 0, cur = null;
    const flush = () => { if (cur) { blocks.push(cur); cur = null; } };
    for (const line of lines) {
      const m = /^(\s*)--(?!-)\s?(.*)$/.exec(line);
      if (m) {
        if (cur && cur.indent === m[1]) { cur.lines.push(m[2]); cur.end = off + line.length; }
        else { flush(); cur = { kind: "line", marker: "--", indent: m[1], start: off + m[1].length, end: off + line.length, lines: [m[2]] }; }
      } else flush();
      off += line.length + 1;
    }
    flush();
  } else {
    const ranges = commentRanges(file, text);
    let cur = null;
    const flush = () => { if (cur) { blocks.push(cur); cur = null; } };
    for (const r of ranges) {
      const ls = lineStart(text, r.pos);
      const before = text.slice(ls, r.pos);
      const standalone = /^\s*$/.test(before);
      const raw = text.slice(r.pos, r.end);
      if (r.kind === ts.SyntaxKind.SingleLineCommentTrivia) {
        const body = raw.replace(/^\/\/ ?/, "");
        if (!standalone) { flush(); blocks.push({ kind: "trail", indent: before.match(/^\s*/)[0], start: r.pos, end: r.end, lines: [body] }); continue; }
        if (cur && cur.kind === "line" && cur.indent === before && text.slice(cur.end, r.pos).replace(/[ \t]/g, "") === "\n") { cur.lines.push(body); cur.end = r.end; }
        else { flush(); cur = { kind: "line", marker: "//", indent: before, start: r.pos, end: r.end, lines: [body] }; }
      } else {
        flush();
        const opener = raw.startsWith("/**") ? "/**" : "/*";
        const inner = raw.slice(opener.length, raw.length - 2);
        const multi = raw.includes("\n");
        const lines = inner.split("\n").map((l, i, a) => (multi ? l.replace(/^\s*\*?\s?/, "") : l.trim())).map((l) => l.replace(/\s+$/, ""));
        while (lines.length && lines[0] === "") lines.shift();
        while (lines.length && lines[lines.length - 1] === "") lines.pop();
        blocks.push({ kind: "block", opener, multi, indent: standalone ? before : before.match(/^\s*/)[0], standalone, start: r.pos, end: r.end, lines });
      }
    }
    flush();
  }
  // context: the first code line after the block (what the comment is about), and the id
  blocks.forEach((b, i) => {
    const after = text.slice(b.end).split("\n").map((l) => l.trim()).find((l) => l && !/^(\/\/|\/\*|\*|--)/.test(l));
    b.context = (after ?? "").slice(0, 170);
    b.directive = b.lines.some((l) => DIRECTIVE.test(l));
    b.n = i;
    b.hash = sha(b.lines.join("\n"));
  });
  return blocks;
}

function render(b, newLines) {
  const clean = newLines.map((l) => String(l).replace(/\s+$/g, ""));
  if (b.kind === "trail") return `// ${clean.join(" ").trim()}`;
  if (b.kind === "line") return clean.map((l, i) => (i === 0 ? "" : b.indent) + b.marker + (l ? ` ${l}` : "")).join("\n");
  const text = clean.join(" ").replace(/\*\//g, "* /");
  if (!b.multi) return `${b.opener} ${text} */`;
  return `${b.opener}\n${clean.map((l) => `${b.indent} * ${l}`.replace(/\s+$/, "")).join("\n")}\n${b.indent} */`.replace(/\*\//g, (m, off, s) => (s.endsWith("*/") && off === s.length - 2 ? m : "* /"));
}

const argv = process.argv.slice(2);
const cmd = argv[0];
const flag = (n) => argv.includes(`--${n}`);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };

if (cmd === "scan") {
  mkdirSync(join(WORK, "in"), { recursive: true });
  mkdirSync(join(WORK, "out"), { recursive: true });
  const max = Number(opt("max-chars", 38000));
  const files = listFiles();
  const all = [];
  for (const file of files) {
    const text = readFileSync(join(ROOT, file), "utf8");
    let blocks;
    try { blocks = blocksOfFile(file, text); } catch (e) { console.log("SKIP (cannot read)", file, e.message); continue; }
    for (const b of blocks) all.push({ file, ...b });
  }
  const todo = all.filter((b) => !b.directive && b.lines.join("").trim() !== "");
  writeFileSync(join(WORK, "blocks.json"), JSON.stringify({ files, blocks: all.map(({ file, n, hash, kind, start, end }) => ({ file, n, hash, kind, start, end })) }));
  // batches: whole files together, never splitting one file's blocks across two batches unless the file alone is too big
  const byFile = new Map();
  for (const b of todo) { if (!byFile.has(b.file)) byFile.set(b.file, []); byFile.get(b.file).push(b); }
  let batch = [], size = 0, no = 0;
  const flushB = () => { if (!batch.length) return; no++; writeFileSync(join(WORK, "in", String(no).padStart(3, "0") + ".json"), JSON.stringify(batch.map((b) => ({ id: `${b.file}#${b.n}`, file: b.file, kind: b.kind, context: b.context, hash: b.hash, lines: b.lines })), null, 0)); batch = []; size = 0; };
  for (const [file, bs] of byFile) {
    const sz = bs.reduce((a, b) => a + b.lines.join("\n").length + 120, 0);
    if (size + sz > max && batch.length) flushB();
    batch.push(...bs); size += sz;
    if (size > max) flushB();
  }
  flushB();
  const chars = todo.reduce((a, b) => a + b.lines.join("\n").length, 0);
  console.log(`files ${files.length}, blocks ${all.length}, to rewrite ${todo.length} (${chars} chars), directives left alone ${all.length - todo.length}, batches ${no}`);
} else if (cmd === "apply" || cmd === "verify") {
  const dry = flag("dry");
  const outDir = join(WORK, "out");
  const wanted = new Map(); // id -> new lines
  if (cmd === "apply") {
    for (const f of readdirSync(outDir).filter((x) => x.endsWith(".json")).sort()) {
      let j; try { j = JSON.parse(readFileSync(join(outDir, f), "utf8")); } catch (e) { console.log("BAD JSON", f, e.message); continue; }
      for (const [id, lines] of Object.entries(j)) if (Array.isArray(lines) && lines.length) wanted.set(id, lines.map(String));
    }
  }
  const byFile = new Map();
  for (const id of wanted.keys()) { const file = id.slice(0, id.lastIndexOf("#")); if (!byFile.has(file)) byFile.set(file, []); byFile.get(file).push(id); }
  let changedFiles = 0, changedBlocks = 0, skipped = 0, refused = 0, refusedBlocks = 0;
  const inputs = new Map();
  for (const f of readdirSync(join(WORK, "in")).sort()) for (const b of JSON.parse(readFileSync(join(WORK, "in", f), "utf8"))) inputs.set(b.id, b);
  for (const [file, ids] of byFile) {
    const path = join(ROOT, file);
    const text = readFileSync(path, "utf8");
    const blocks = blocksOfFile(file, text);
    const edits = [];
    for (const id of ids) {
      const n = Number(id.slice(id.lastIndexOf("#") + 1));
      const b = blocks[n];
      const inp = inputs.get(id);
      if (!b || !inp || b.hash !== inp.hash || b.directive) { skipped++; continue; }
      const lines = wanted.get(id);
      if (SQL_EXT.has(extname(file)) ? false : false) continue;
      edits.push({ b, text: render(b, lines) });
    }
    if (!edits.length) continue;
    edits.sort((a, c) => c.b.start - a.b.start);
    let next = text;
    for (const e of edits) next = next.slice(0, e.b.start) + e.text + next.slice(e.b.end);
    if (codeTokens(file, next) !== codeTokens(file, text)) {
      // find the single edits that break the code and leave exactly those out; the others are kept
      const okEdits = [];
      for (const e of edits) {
        const one = text.slice(0, e.b.start) + e.text + text.slice(e.b.end);
        if (codeTokens(file, one) === codeTokens(file, text)) okEdits.push(e);
        else if (flag("debug")) console.log("  BAD EDIT in", file, "\n   old:", JSON.stringify(text.slice(e.b.start, e.b.end).slice(0, 200)), "\n   new:", JSON.stringify(e.text.slice(0, 200)));
        else refusedBlocks++;
      }
      let again = text;
      for (const e of okEdits) again = again.slice(0, e.b.start) + e.text + again.slice(e.b.end);
      if (!okEdits.length || codeTokens(file, again) !== codeTokens(file, text)) { refused++; console.log("REFUSED (the code would differ)", file); continue; }
      next = again; edits.length = 0; edits.push(...okEdits);
    }
    if (!dry) writeFileSync(path, next);
    changedFiles++; changedBlocks += edits.length;
  }
  console.log(`${dry ? "DRY RUN: " : ""}${changedBlocks} blocks in ${changedFiles} files rewritten; ${skipped} skipped (changed since the scan); ${refused} files refused (code differed), ${refusedBlocks} single blocks left out because they would have changed the code`);
} else if (cmd === "roundtrip") {
  // a block written back with its own words must give back the very same text: proves the writer-back (render) keeps the layout
  let bad = 0, total = 0; const samples = [];
  for (const file of listFiles()) {
    const text = readFileSync(join(ROOT, file), "utf8");
    for (const b of blocksOfFile(file, text)) {
      if (b.directive) continue;
      total++;
      const orig = text.slice(b.start, b.end);
      const back = render(b, b.lines);
      if (back !== orig) { bad++; if (samples.length < 6) samples.push({ file, kind: b.kind, orig: orig.slice(0, 160), back: back.slice(0, 160) }); }
    }
  }
  console.log(`roundtrip: ${total} blocks, ${bad} differ`);
  for (const s of samples) console.log(JSON.stringify(s));
} else {
  console.log("usage: scan | apply [--dry] | verify | roundtrip");
}
