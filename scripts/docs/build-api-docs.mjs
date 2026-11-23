// scripts/docs/build-api-docs.mjs
//
// THE DEVELOPER REFERENCE OF THIS PROJECT, GENERATED FROM THE CODE: every package, file, function, class, interface, type, constant, React component, hook, API route, page, database entity and speed switch, first by its structure
// (where it lives, what it takes, what it returns, who uses it) and then by its function (the comment I wrote above it, and the behaviours its self-test checks). It reads the TypeScript tree (no model, no guessing) and writes
// developer-docs/: an index, one small JSON file per source file, and the site (scripts/docs/site/). The app serves it at /developers to a signed-in user (src/app/developers/[[...path]]/route.ts).
//   npm run docs:api            (or: node scripts/docs/build-api-docs.mjs)
import ts from "typescript";
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, existsSync, rmSync, copyFileSync } from "node:fs";
import { join, dirname, extname, basename, relative } from "node:path";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";

const ROOT = process.cwd();
const OUT = join(ROOT, "developer-docs");
const SKIP = new Set(["node_modules", ".next", ".git", "public", "developer-docs", ".comment-work", "reread-gemini-cache", "reread-backups", "coverage", ".vercel"]);
const slug = (s) => createHash("sha1").update(s).digest("hex").slice(0, 10);

// ------------------------------------------------------------------------------------------------ the files
function walk(dir, exts, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) { if (!SKIP.has(name)) walk(p, exts, out); continue; }
    if (exts.has(extname(name))) out.push(relative(ROOT, p));
  }
  return out;
}
const codeFiles = [...walk(join(ROOT, "src"), new Set([".ts", ".tsx", ".js", ".mjs"])), ...walk(join(ROOT, "scripts"), new Set([".ts", ".tsx", ".mjs"]))].filter((f) => !f.startsWith("scripts/docs/") && !f.startsWith("scripts/comments/"));
const sqlFiles = [...walk(join(ROOT, "src"), new Set([".sql"])), ...walk(join(ROOT, "sql"), new Set([".sql"]))];
const isTest = (f) => /\.selftest\.(tsx?|mjs)$/.test(f);

const cfg = ts.readConfigFile(join(ROOT, "tsconfig.json"), ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(cfg.config, ts.sys, ROOT);
const options = { ...parsed.options, noEmit: true, skipLibCheck: true, allowJs: true };
const host = ts.createCompilerHost(options, true);
const cache = ts.createModuleResolutionCache(ROOT, (x) => x, options);

// ------------------------------------------------------------------------------------------------ comments -> text
const DIRECTIVE = /^\s*(eslint|prettier|@ts-|ts-(ignore|expect-error|nocheck)|istanbul|\/\s*<|@vitest|@jsx|webpack)/i;
function cleanComment(raw) {
  let lines;
  if (raw.startsWith("//")) lines = raw.split("\n").map((l) => l.replace(/^\s*\/\/ ?/, ""));
  else lines = raw.replace(/^\/\*+/, "").replace(/\*+\/$/, "").split("\n").map((l) => l.replace(/^\s*\* ?/, "").replace(/\s+$/, ""));
  while (lines.length && !lines[0].trim()) lines.shift();
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  return lines;
}
/** lines -> paragraphs: wrapped lines are joined; a list item, a table row, a heading line or a @tag starts a new one; an indented line under a list item belongs to that item */
function paragraphs(lines) {
  const out = [];
  let cur = [];
  let inItem = false;
  const flush = () => { if (cur.length) { out.push(cur.join(" ").replace(/\s+/g, " ").trim()); cur = []; } inItem = false; };
  for (const l of lines) {
    if (!l.trim()) { flush(); continue; }
    const t = l.trim();
    if (/^([-*•]|\d+[.)]|\([a-z0-9]\))\s/.test(t)) { flush(); cur.push(t); inItem = true; continue; }
    if (/^(@\w+|\|)/.test(t) || /^-{3,}|^={3,}|^-{2,}\s.+\s-{2,}$/.test(t)) { flush(); out.push(t); continue; }
    if (inItem && /^\s{2,}\S/.test(l)) { cur.push(t); continue; } // the wrapped second line of a list item
    if (inItem) flush();
    cur.push(t);
  }
  flush();
  return out;
}
/** the comment group that stands directly above a position (no blank line between) */
function docAbove(text, node, sf) {
  const ranges = ts.getLeadingCommentRanges(text, node.getFullStart()) ?? [];
  if (!ranges.length) return null;
  const group = [];
  let i = ranges.length - 1;
  // walk back while the gap between a comment and the next thing is a single newline
  let nextStart = node.getStart(sf);
  for (; i >= 0; i--) {
    const gap = text.slice(ranges[i].end, nextStart);
    if ((gap.match(/\n/g) ?? []).length > 1) break;
    group.unshift(ranges[i]);
    nextStart = ranges[i].pos;
  }
  if (!group.length) return null;
  const lines = [];
  for (const r of group) lines.push(...cleanComment(text.slice(r.pos, r.end)));
  if (lines.some((l) => DIRECTIVE.test(l))) return null;
  return lines;
}
const firstSentence = (paras) => {
  const t = (paras.find((p) => !/^@/.test(p)) ?? "").replace(/`/g, "");
  const m = /^(.{20,220}?[.!?])(\s|$)/.exec(t);
  return (m ? m[1] : t.slice(0, 200)).trim();
};

// ------------------------------------------------------------------------------------------------ structure helpers
const has = (n, kind) => !!n.modifiers?.some((m) => m.kind === kind);
const exported = (n) => has(n, ts.SyntaxKind.ExportKeyword);
const isDefault = (n) => has(n, ts.SyntaxKind.DefaultKeyword);
const line = (sf, n) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
/** code without its comments (the TypeScript scanner, so a // inside a string or a template stays) */
function stripComments(code) {
  if (!code.includes("//") && !code.includes("/*")) return code;
  const sc = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.Standard, code);
  let out = "", t;
  while ((t = sc.scan()) !== ts.SyntaxKind.EndOfFileToken) {
    if (t === ts.SyntaxKind.SingleLineCommentTrivia || t === ts.SyntaxKind.MultiLineCommentTrivia) continue;
    out += sc.getTokenText();
  }
  return out;
}
const squash = (s, max = 700) => stripComments(s).replace(/\s+/g, " ").replace(/\s*([,;)\]])/g, "$1").trim().slice(0, max);
const HTTP = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);

function paramsOf(sf, fn) {
  return (fn.parameters ?? []).map((p) => ({
    name: p.name.getText(sf), type: p.type ? squash(p.type.getText(sf), 240) : "", optional: !!p.questionToken || !!p.initializer, rest: !!p.dotDotDotToken,
    def: p.initializer ? squash(p.initializer.getText(sf), 60) : "",
  }));
}
const sigOfFunction = (sf, node, bodyOwner, prefix) => {
  const body = bodyOwner.body;
  const start = node.getStart(sf);
  const end = body ? body.getStart(sf) : node.getEnd();
  let s = sf.text.slice(start, end).replace(/=>\s*$/, "=>").replace(/\{\s*$/, "");
  if (prefix) s = prefix + s;
  return squash(s, 900);
};
const returnsOf = (sf, fn) => (fn.type ? squash(fn.type.getText(sf), 240) : "");
function tagsFrom(paras) {
  const params = {}; let returns = ""; const rest = [];
  for (const p of paras) {
    let m;
    if ((m = /^@param\s+(?:\{[^}]*\}\s*)?(\[?[\w.$]+\]?)\s*-?\s*(.*)$/.exec(p))) params[m[1].replace(/[\[\]]/g, "")] = m[2];
    else if ((m = /^@returns?\s+(?:\{[^}]*\}\s*)?(.*)$/.exec(p))) returns = m[1];
    else if (!/^@(type|typedef|default|deprecated)\b/.test(p)) rest.push(p);
    else if (/^@deprecated/.test(p)) rest.push(p);
  }
  return { params, returns, rest };
}
const kindOfFn = (name, fileId, isJsx) => {
  if (/\/route\.ts$/.test(fileId) && HTTP.has(name)) return "route";
  if (/^use[A-Z0-9]/.test(name)) return "hook";
  if (/^[A-Z]/.test(name) && (fileId.endsWith(".tsx") || isJsx)) return "component";
  return "function";
};
const containsJsx = (node) => { let f = false; const v = (n) => { if (f) return; if (n.kind === ts.SyntaxKind.JsxElement || n.kind === ts.SyntaxKind.JsxSelfClosingElement || n.kind === ts.SyntaxKind.JsxFragment) { f = true; return; } ts.forEachChild(n, v); }; v(node); return f; };

function membersOfClass(sf, text, node) {
  const out = [];
  for (const m of node.members) {
    const doc = docAbove(text, m, sf);
    const paras = doc ? paragraphs(doc) : [];
    const mods = (m.modifiers ?? []).map((x) => x.getText(sf)).filter((x) => !/^(export|default|declare)$/.test(x));
    const decos = (ts.canHaveDecorators(m) ? ts.getDecorators(m) ?? [] : []).map((d) => squash(d.getText(sf), 200));
    if (ts.isConstructorDeclaration(m)) out.push({ kind: "constructor", name: "constructor", line: line(sf, m), sig: sigOfFunction(sf, m, m), params: paramsOf(sf, m), mods, doc: paras, decos });
    else if (ts.isMethodDeclaration(m)) out.push({ kind: "method", name: m.name.getText(sf), line: line(sf, m), sig: sigOfFunction(sf, m, m), params: paramsOf(sf, m), returns: returnsOf(sf, m), mods, doc: paras, decos });
    else if (ts.isPropertyDeclaration(m)) out.push({ kind: "field", name: m.name.getText(sf), line: line(sf, m), type: m.type ? squash(m.type.getText(sf), 240) : "", optional: !!m.questionToken, mods, doc: paras, decos, init: m.initializer ? squash(m.initializer.getText(sf), 80) : "" });
    else if (ts.isGetAccessor(m) || ts.isSetAccessor(m)) out.push({ kind: ts.isGetAccessor(m) ? "getter" : "setter", name: m.name.getText(sf), line: line(sf, m), sig: sigOfFunction(sf, m, m), mods, doc: paras, decos });
  }
  return out;
}
function membersOfInterface(sf, text, node) {
  const out = [];
  for (const m of node.members) {
    const doc = docAbove(text, m, sf);
    const paras = doc ? paragraphs(doc) : [];
    if (ts.isPropertySignature(m)) out.push({ kind: "field", name: m.name.getText(sf), line: line(sf, m), type: m.type ? squash(m.type.getText(sf), 260) : "", optional: !!m.questionToken, readonly: has(m, ts.SyntaxKind.ReadonlyKeyword), doc: paras });
    else if (ts.isMethodSignature(m)) out.push({ kind: "method", name: m.name.getText(sf), line: line(sf, m), sig: squash(m.getText(sf), 400), params: paramsOf(sf, m), returns: returnsOf(sf, m), doc: paras });
    else if (ts.isCallSignatureDeclaration(m) || ts.isIndexSignatureDeclaration(m)) out.push({ kind: "signature", name: ts.isCallSignatureDeclaration(m) ? "(call)" : "[index]", line: line(sf, m), sig: squash(m.getText(sf), 300), doc: paras });
  }
  return out;
}
function membersOfObject(sf, text, obj) {
  const out = [];
  for (const m of obj.properties) {
    const doc = docAbove(text, m, sf);
    const paras = doc ? paragraphs(doc) : [];
    if (ts.isPropertyAssignment(m) || ts.isShorthandPropertyAssignment(m) || ts.isMethodDeclaration(m)) {
      const name = m.name.getText(sf);
      const val = ts.isPropertyAssignment(m) ? squash(m.initializer.getText(sf), 110) : "";
      out.push({ kind: "key", name, line: line(sf, m), value: val, doc: paras });
    }
  }
  return out;
}

function symbolsOf(sf, text, fileId) {
  const syms = [];
  const reexports = [];
  const push = (s) => syms.push(s);
  const baseDoc = (node) => { const d = docAbove(text, node, sf); return d ? paragraphs(d) : []; };
  for (const st of sf.statements) {
    if (ts.isFunctionDeclaration(st) && st.name) {
      const paras = baseDoc(st); const tg = tagsFrom(paras);
      const isJsx = containsJsx(st);
      push({ name: st.name.text, kind: kindOfFn(st.name.text, fileId, isJsx), exported: exported(st), isDefault: isDefault(st), async: has(st, ts.SyntaxKind.AsyncKeyword), line: line(sf, st), sig: sigOfFunction(sf, st, st), params: paramsOf(sf, st), returns: returnsOf(sf, st), generics: st.typeParameters ? squash(st.typeParameters.map((t) => t.getText(sf)).join(", "), 120) : "", doc: tg.rest, paramDocs: tg.params, returnDoc: tg.returns });
    } else if (ts.isVariableStatement(st)) {
      const exp = exported(st);
      const paras = baseDoc(st); const tg = tagsFrom(paras);
      for (const d of st.declarationList.declarations) {
        if (!ts.isIdentifier(d.name)) continue;
        const name = d.name.text; const init = d.initializer;
        const isConst = !!(st.declarationList.flags & ts.NodeFlags.Const);
        if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) {
          const isJsx = containsJsx(init);
          push({ name, kind: kindOfFn(name, fileId, isJsx), exported: exp, line: line(sf, d), async: has(init, ts.SyntaxKind.AsyncKeyword), sig: squash(`${isConst ? "const" : "let"} ${name}${d.type ? ": " + d.type.getText(sf) : ""} = ` + sf.text.slice(init.getStart(sf), (init.body ?? init).getStart(sf)).replace(/\{\s*$/, ""), 900), params: paramsOf(sf, init), returns: returnsOf(sf, init), doc: tg.rest, paramDocs: tg.params, returnDoc: tg.returns });
        } else {
          const members = init && ts.isObjectLiteralExpression(init) ? membersOfObject(sf, text, init) : [];
          const arrLen = init && ts.isArrayLiteralExpression(init) ? init.elements.length : 0;
          push({ name, kind: "constant", exported: exp, line: line(sf, d), sig: squash(`${isConst ? "const" : "let"} ${name}${d.type ? ": " + d.type.getText(sf) : ""}${init ? " = " + (init.getText(sf).length > 120 ? init.getText(sf).slice(0, 120) + " …" : init.getText(sf)) : ""}`, 400), type: d.type ? squash(d.type.getText(sf), 240) : "", doc: tg.rest, members, items: arrLen });
        }
      }
    } else if (ts.isClassDeclaration(st) && st.name) {
      const decos = (ts.canHaveDecorators(st) ? ts.getDecorators(st) ?? [] : []).map((d) => squash(d.getText(sf), 200));
      const entity = decos.find((d) => /^@Entity\b/.test(d));
      const paras = baseDoc(st);
      push({ name: st.name.text, kind: entity ? "entity" : "class", exported: exported(st), isDefault: isDefault(st), line: line(sf, st), abstract: has(st, ts.SyntaxKind.AbstractKeyword), extends: st.heritageClauses?.filter((h) => h.token === ts.SyntaxKind.ExtendsKeyword).flatMap((h) => h.types.map((t) => t.getText(sf))).join(", ") ?? "", implements: st.heritageClauses?.filter((h) => h.token === ts.SyntaxKind.ImplementsKeyword).flatMap((h) => h.types.map((t) => t.getText(sf))) ?? [], decos, doc: tagsFrom(paras).rest, members: membersOfClass(sf, text, st) });
    } else if (ts.isInterfaceDeclaration(st)) {
      push({ name: st.name.text, kind: "interface", exported: exported(st), line: line(sf, st), generics: st.typeParameters ? squash(st.typeParameters.map((t) => t.getText(sf)).join(", "), 120) : "", extends: st.heritageClauses?.flatMap((h) => h.types.map((t) => t.getText(sf))).join(", ") ?? "", doc: tagsFrom(baseDoc(st)).rest, members: membersOfInterface(sf, text, st) });
    } else if (ts.isTypeAliasDeclaration(st)) {
      push({ name: st.name.text, kind: "type", exported: exported(st), line: line(sf, st), generics: st.typeParameters ? squash(st.typeParameters.map((t) => t.getText(sf)).join(", "), 120) : "", sig: squash(st.type.getText(sf), 1400), doc: tagsFrom(baseDoc(st)).rest });
    } else if (ts.isEnumDeclaration(st)) {
      push({ name: st.name.text, kind: "enum", exported: exported(st), line: line(sf, st), doc: tagsFrom(baseDoc(st)).rest, members: st.members.map((m) => ({ kind: "key", name: m.name.getText(sf), line: line(sf, m), value: m.initializer ? squash(m.initializer.getText(sf), 60) : "", doc: [] })) });
    } else if (ts.isExportDeclaration(st)) {
      if (st.moduleSpecifier && !st.exportClause) reexports.push({ from: st.moduleSpecifier.getText(sf).slice(1, -1), all: true });
      else if (st.exportClause && ts.isNamedExports(st.exportClause)) for (const e of st.exportClause.elements) reexports.push({ from: st.moduleSpecifier ? st.moduleSpecifier.getText(sf).slice(1, -1) : null, name: (e.propertyName ?? e.name).text, as: e.name.text });
    } else if (ts.isExportAssignment(st)) {
      push({ name: "default", kind: "constant", exported: true, isDefault: true, line: line(sf, st), sig: squash(`export default ${st.expression.getText(sf)}`, 300), doc: tagsFrom(baseDoc(st)).rest });
    }
  }
  return { syms, reexports };
}

/** the header of a file: the first comment group of the file (before the first statement), without the line that only repeats the path */
function headerOf(sf, text, fileId) {
  const first = sf.statements[0];
  const pos = first ? first.getFullStart() : 0;
  const ranges = ts.getLeadingCommentRanges(text, 0) ?? [];
  if (!ranges.length) return [];
  // the first group of adjacent comments
  const group = [ranges[0]];
  for (let i = 1; i < ranges.length; i++) { if ((text.slice(ranges[i - 1].end, ranges[i].pos).match(/\n/g) ?? []).length > 1) break; group.push(ranges[i]); }
  void pos;
  let lines = [];
  for (const r of group) lines.push(...cleanComment(text.slice(r.pos, r.end)));
  if (lines.some((l) => DIRECTIVE.test(l)) && lines.length < 3) return [];
  if (lines.length && lines[0].trim().replace(/^\.?\//, "") === fileId) lines = lines.slice(1);
  while (lines.length && !lines[0].trim()) lines.shift();
  return paragraphs(lines);
}

// ------------------------------------------------------------------------------------------------ read every file
const files = new Map();
const exportsByFile = new Map();
for (const fid of codeFiles) {
  const text = readFileSync(join(ROOT, fid), "utf8");
  const sf = ts.createSourceFile(fid, text, ts.ScriptTarget.Latest, true, fid.endsWith(".tsx") ? ts.ScriptKind.TSX : fid.endsWith(".ts") ? ts.ScriptKind.TS : ts.ScriptKind.JS);
  const lines = text.split("\n");
  const commentLines = lines.filter((l) => /^\s*(\/\/|\/\*|\*)/.test(l)).length;
  const { syms, reexports } = symbolsOf(sf, text, fid);
  const imports = [];
  const addImport = (spec, names, lazy = false) => { if (spec) imports.push({ spec, names, lazy }); };
  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st) && ts.isStringLiteral(st.moduleSpecifier)) {
      const names = [];
      const ic = st.importClause;
      if (ic) {
        if (ic.name) names.push("default");
        if (ic.namedBindings) { if (ts.isNamespaceImport(ic.namedBindings)) names.push("*"); else for (const e of ic.namedBindings.elements) names.push((e.propertyName ?? e.name).text); }
      }
      addImport(st.moduleSpecifier.text, names);
    }
  }
  const visit = (n) => { if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword && n.arguments[0] && ts.isStringLiteral(n.arguments[0])) addImport(n.arguments[0].text, ["*"], true); ts.forEachChild(n, visit); };
  visit(sf);
  for (const r of reexports) if (r.from) addImport(r.from, r.all ? ["*"] : [r.name]);
  files.set(fid, { id: fid, text, sf, lines: lines.length, commentLines, syms, reexports, imports, header: headerOf(sf, text, fid), test: isTest(fid) });
}

// ------------------------------------------------------------------------------------------------ packages
function pkgOf(fid) {
  const p = fid.split("/");
  if (p[0] === "scripts") return p.length > 2 ? "scripts/" + p[1] : "scripts";
  if (p[0] !== "src") return fid;
  if (p.length === 2) return "src (root)";
  if (p[1] === "app") return p[2] === "api" ? "src/app/api" : "src/app";
  if (p[1] === "lib") return p.length > 3 ? `src/lib/${p[2]}` : "src/lib";
  if (p[1] === "tools") return p.length > 3 ? `src/tools/${p[2]}` : "src/tools";
  return `src/${p[1]}`;
}
function groupOf(fid) { // the coarser nodes of the dependency picture
  const p = fid.split("/");
  if (p[0] === "scripts") return "scripts";
  if (p[1] === "app") return p[2] === "api" ? "app/api" : "app (pages)";
  if (p[1] === "lib") return p.length > 3 ? `lib/${p[2]}` : "lib (root)";
  if (p[1] === "tools") return "tools";
  if (p.length === 2) return "root";
  return p[1];
}

// ------------------------------------------------------------------------------------------------ links between files
const resolveCache = new Map();
function resolve(spec, from) {
  const key = `${from}|${spec}`;
  if (resolveCache.has(key)) return resolveCache.get(key);
  let out = null;
  if (spec.startsWith(".") || spec.startsWith("@/") || spec.startsWith("src/")) {
    const r = ts.resolveModuleName(spec, join(ROOT, from), options, host, cache).resolvedModule;
    if (r && !r.isExternalLibraryImport) { const rel = relative(ROOT, r.resolvedFileName); if (files.has(rel)) out = rel; }
  }
  resolveCache.set(key, out);
  return out;
}
const usedBySym = new Map();   // "file#name" -> Set(file)
const importedBy = new Map();  // file -> Set(file)
const importsOf = new Map();   // file -> Map(target -> {names:Set,lazy})
const external = new Map();    // file -> Set(package)
const edgeGroup = new Map();   // "a>b" -> weight
for (const f of files.values()) {
  const targets = new Map();
  const ext = new Set();
  for (const im of f.imports) {
    const t = resolve(im.spec, f.id);
    if (!t) { if (!im.spec.startsWith(".") && !im.spec.startsWith("@/")) ext.add(im.spec.startsWith("@") ? im.spec.split("/").slice(0, 2).join("/") : im.spec.split("/")[0]); continue; }
    if (!targets.has(t)) targets.set(t, { names: new Set(), lazy: true });
    const rec = targets.get(t);
    im.names.forEach((n) => rec.names.add(n));
    if (!im.lazy) rec.lazy = false;
    if (!importedBy.has(t)) importedBy.set(t, new Set());
    importedBy.get(t).add(f.id);
    for (const n of im.names) { const k = `${t}#${n}`; if (!usedBySym.has(k)) usedBySym.set(k, new Set()); usedBySym.get(k).add(f.id); }
  }
  importsOf.set(f.id, targets);
  external.set(f.id, ext);
  if (!f.test) for (const t of targets.keys()) {
    if (files.get(t).test) continue;
    const a = groupOf(f.id), b = groupOf(t);
    if (a !== b) edgeGroup.set(`${a}>${b}`, (edgeGroup.get(`${a}>${b}`) ?? 0) + 1);
  }
}

// ------------------------------------------------------------------------------------------------ tests: the behaviours a self-test checks
function behavioursOf(text) {
  const out = [];
  const re = /\b(?:ok|check|assert|it|test|expect)\(\s*(["'`])((?:\\.|(?!\1)[^\\\n])+)\1/g;
  let m;
  while ((m = re.exec(text)) && out.length < 120) {
    const s = m[2].replace(/\\(["'`\\])/g, "$1").replace(/\s+/g, " ").trim();
    if (s.length >= 14 && /[a-z]/i.test(s) && !/^[./\w-]+\.(ts|tsx|js)$/.test(s)) out.push(s);
  }
  return out;
}
const testsOf = new Map();
for (const f of files.values()) {
  if (!f.test) continue;
  const stem = f.id.replace(/\.selftest\.(tsx?|mjs)$/, "");
  const target = [".ts", ".tsx", ".js", ".mjs"].map((e) => stem + e).find((c) => files.has(c) && !files.get(c).test);
  const tests = { file: f.id, behaviours: behavioursOf(f.text), lines: f.lines };
  if (target) { if (!testsOf.has(target)) testsOf.set(target, []); testsOf.get(target).push(tests); }
}

// ------------------------------------------------------------------------------------------------ routes, pages, entities, switches, scripts
const routes = [];
const pages = [];
for (const f of files.values()) {
  if (f.test) continue;
  if (/^src\/app\/.*\/route\.ts$/.test(f.id) || f.id === "src/app/route.ts") {
    const url = "/" + f.id.replace(/^src\/app\//, "").replace(/\/?route\.ts$/, "");
    const methods = f.syms.filter((s) => s.kind === "route").map((s) => ({ method: s.name, line: s.line, doc: s.doc, async: s.async }));
    const q = [...new Set([...f.text.matchAll(/searchParams\.get\(\s*["']([\w-]+)["']/g)].map((m) => m[1]))];
    const flags = [];
    if (/getSessionTicket|getServerSession|sessionActor|verifiedTicket/.test(f.text)) flags.push("session");
    if (/isSameOrigin/.test(f.text)) flags.push("same-origin");
    if (/rateLimit|aiByTicket|aiByAddress|\.take\(/.test(f.text)) flags.push("rate-limited");
    if (/force-dynamic/.test(f.text)) flags.push("dynamic");
    const dur = /export const maxDuration\s*=\s*(\d+)/.exec(f.text)?.[1];
    routes.push({ url, file: f.id, methods, query: q, flags, maxDuration: dur ? Number(dur) : null, summary: firstSentence(f.header) });
  } else if (/^src\/app\/.*page\.tsx$/.test(f.id)) {
    pages.push({ url: "/" + f.id.replace(/^src\/app\//, "").replace(/\/?page\.tsx$/, ""), file: f.id, summary: firstSentence(f.header) });
  }
}
routes.sort((a, b) => a.url.localeCompare(b.url));
pages.sort((a, b) => a.url.localeCompare(b.url));

const entities = [];
for (const f of files.values()) for (const s of f.syms) if (s.kind === "entity") {
  const table = /@Entity\(\s*(?:\{[^}]*name:\s*)?["'`]([\w.]+)["'`]/.exec((s.decos.find((d) => d.startsWith("@Entity")) ?? ""))?.[1] ?? s.name;
  entities.push({ name: s.name, table, file: f.id, line: s.line, doc: s.doc, columns: s.members.filter((m) => m.kind === "field").map((m) => ({ name: m.name, type: m.type, nullable: m.optional || /nullable:\s*true/.test((m.decos ?? []).join(" ")), decorators: (m.decos ?? []).map((d) => d.replace(/\s+/g, " ")), doc: m.doc })) });
}

function switchesOf() {
  const f = files.get("src/lib/perf/switches.js");
  if (!f) return [];
  const out = [];
  const sfx = f.sf;
  const visit = (n) => {
    if (ts.isVariableDeclaration(n) && n.name.getText(sfx) === "PERF" && n.initializer && ts.isObjectLiteralExpression(n.initializer)) {
      let section = "";
      for (const p of n.initializer.properties) {
        const secRanges = (ts.getLeadingCommentRanges(f.text, p.getFullStart()) ?? []).map((r) => f.text.slice(r.pos, r.end));
        for (const r of secRanges) { const m = /^\/\/ -{3,}\s*(.+)$/.exec(r.trim()); if (m) section = m[1].trim(); }
        const doc = docAbove(f.text, p, sfx);
        if (ts.isPropertyAssignment(p)) out.push({ name: p.name.getText(sfx), value: p.initializer.getText(sfx), section, doc: doc ? paragraphs(doc) : [], line: line(sfx, p) });
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sfx);
  return out;
}
const switches = switchesOf();

const sqls = sqlFiles.map((fid) => {
  const text = readFileSync(join(ROOT, fid), "utf8");
  const head = [];
  for (const l of text.split("\n")) { if (/^\s*--/.test(l)) head.push(l.replace(/^\s*--\s?/, "")); else if (l.trim() === "" && !head.length) continue; else break; }
  return { id: fid, lines: text.split("\n").length, header: paragraphs(head), tables: [...new Set([...text.matchAll(/create\s+(?:or\s+replace\s+)?(?:table|view|materialized view)\s+(?:if\s+not\s+exists\s+)?([\w."]+)/gi)].map((m) => m[1].replace(/"/g, "")))].slice(0, 40) };
});

// ------------------------------------------------------------------------------------------------ the output model
let gitInfo = {};
try { gitInfo = { commit: execSync("git rev-parse --short HEAD", { cwd: ROOT }).toString().trim(), branch: execSync("git rev-parse --abbrev-ref HEAD", { cwd: ROOT }).toString().trim() }; } catch {}
rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, "data", "f"), { recursive: true });

const fileList = [];
const searchIndex = [];
const pkgMap = new Map();
let totalSyms = 0, totalLines = 0, totalComments = 0, totalBehaviours = 0;
const kindCount = {};
for (const f of files.values()) {
  if (f.test) continue;
  const pkg = pkgOf(f.id);
  const ib = [...(importedBy.get(f.id) ?? [])].filter((x) => !files.get(x).test).sort();
  const im = [...(importsOf.get(f.id) ?? [])].filter(([t]) => !files.get(t).test).map(([t, r]) => ({ file: t, names: [...r.names].slice(0, 12), lazy: r.lazy })).sort((a, b) => a.file.localeCompare(b.file));
  const tests = testsOf.get(f.id) ?? [];
  const behaviours = tests.flatMap((t) => t.behaviours);
  const syms = f.syms.map((s) => {
    const used = [...(usedBySym.get(`${f.id}#${s.name}`) ?? []), ...(s.isDefault ? [...(usedBySym.get(`${f.id}#default`) ?? [])] : [])].filter((x) => !files.get(x).test);
    return { ...s, id: `${slug(f.id)}-${s.name}`, usedBy: [...new Set(used)].sort() };
  });
  for (const s of syms) { kindCount[s.kind] = (kindCount[s.kind] ?? 0) + 1; searchIndex.push([s.name, s.kind, f.id, s.line, firstSentence(s.doc ?? []).slice(0, 140), s.exported ? 1 : 0]); }
  totalSyms += syms.length; totalLines += f.lines; totalComments += f.commentLines; totalBehaviours += behaviours.length;
  const kind = /\/route\.ts$/.test(f.id) ? "route" : /\/page\.tsx$/.test(f.id) ? "page" : f.id.startsWith("scripts/") ? "script" : f.id.endsWith(".tsx") ? "ui" : "module";
  const detail = { id: f.id, pkg, kind, lines: f.lines, commentLines: f.commentLines, header: f.header, symbols: syms, imports: im, importedBy: ib, external: [...(external.get(f.id) ?? [])].sort(), reexports: f.reexports, tests: tests.map((t) => ({ file: t.file, lines: t.lines, count: t.behaviours.length })), behaviours };
  writeFileSync(join(OUT, "data", "f", slug(f.id) + ".json"), JSON.stringify(detail));
  const summary = firstSentence(f.header);
  fileList.push({ id: f.id, h: slug(f.id), pkg, kind, lines: f.lines, summary, symbols: syms.length, exported: syms.filter((s) => s.exported).length, kinds: Object.fromEntries(Object.entries(syms.reduce((a, s) => ((a[s.kind] = (a[s.kind] ?? 0) + 1), a), {}))), importedBy: ib.length, imports: im.length, tests: behaviours.length });
  searchIndex.push([basename(f.id), "file", f.id, 1, summary.slice(0, 140), 1]);
  if (!pkgMap.has(pkg)) pkgMap.set(pkg, { id: pkg, files: 0, lines: 0, symbols: 0, behaviours: 0 });
  const pm = pkgMap.get(pkg); pm.files++; pm.lines += f.lines; pm.symbols += syms.length; pm.behaviours += behaviours.length;
}
for (const r of routes) searchIndex.push([r.url, "route", r.file, 1, r.summary.slice(0, 140), 1]);
for (const e of entities) searchIndex.push([e.table, "entity", e.file, e.line, "", 1]);
for (const s of switches) searchIndex.push([s.name, "switch", "src/lib/perf/switches.js", s.line, firstSentence(s.doc).slice(0, 140), 1]);

const PACKAGE_INFO = {
  "scripts": ["Scripts", "Command-line tools run by hand: the gold test of Executive Deep Search, the warm-up of its stored answers, bulk upload, page reading checks, exports."],
  "scripts/lib": ["Script helpers", "Shared helpers of the scripts (the acceptance-test core and a pacing helper)."],
  "src (root)": ["Application root", "The Next.js middleware (pictures are answered only to a page that shows them) and the instrumentation hook."],
  "src/app": ["App Router", "The root layout, the home page and the NL2SQL lab page of the Next.js App Router."],
  "src/app/api": ["HTTP API", "Every route handler of the application: search, circulars, announcements, employees, administration, login, live data, error log and more. Each route is listed with its methods, query parameters and guards."],
  "src/components": ["React components", "The search window (OmnibarModal), the management panels, answer cards, the guide and the shared widgets of the home page."],
  "src/context": ["React context", "Shared state of the modal windows."],
  "src/hooks": ["React hooks", "Hooks for search results, live data, breakpoints and the status of circulars."],
  "src/lib": ["Library root", "Cross-cutting library files: the login configuration, API authentication, the scroll configuration and the AI service facade."],
  "src/lib/accessLog": ["Contact Access Log", "The facility that records who revealed a contact number, with its admin API and the question it answers in the search box."],
  "src/lib/ai": ["AI calls", "Every call to a language or embedding model: Gemini text and JSON generation (with timeouts, hedging and the no-Pro guard), Claude, embeddings."],
  "src/lib/announcements": ["Announcements", "Announcement storage, access rules, file serving, search index and intent detection."],
  "src/lib/circulars": ["Circulars", "Circular access rules, admin API, intent detection and the omnibar answers about circulars."],
  "src/lib/concurrency": ["Concurrency", "Version checks for edits made by two people at once."],
  "src/lib/contact": ["Contact numbers", "Questions about the pattern of CUG numbers, answered by code and never by a model."],
  "src/lib/db": ["Database", "The TypeORM data source for Supabase Postgres and every entity (table) of the application."],
  "src/lib/dev": ["Development aids", "The bridge that copies the browser console to a file for the developer."],
  "src/lib/employees": ["Employees", "The directory: search by name, ticket or number, analytics, contact rules, admin API and masking."],
  "src/lib/errorLog": ["Production error log", "Capture, masking, triage, alerts and the daily digest of errors."],
  "src/lib/facility": ["Facility kit", "The shared kit behind the management facilities: authority, authorisation, guard and audit."],
  "src/lib/help": ["Help and guides", "The text and data of the guide, the Executive Deep Search guide and its shelf of proven questions."],
  "src/lib/holidays": ["Holidays", "Holiday lists, their parser and terms, access rules, admin API and the omnibar answers."],
  "src/lib/hospital": ["Hospital OPD", "Doctors, disciplines, closures and the questions about the hospital."],
  "src/lib/ingestion": ["Circular ingestion", "Reading an uploaded circular: pages to pictures, OCR by two readers, comparison, chunking and embedding."],
  "src/lib/live": ["Live data", "Fetchers and services for the live cards: price index, gold, fuel, railways, weather and news."],
  "src/lib/nl2sql": ["Employee questions (NL2SQL)", "The language model writes read-only SQL for employee and department questions behind a privacy wall; aliases, examples, steps and the database roles."],
  "src/lib/pax": ["PAX directory", "The internal telephone directory: access, conflicts, intent and admin API."],
  "src/lib/pdf": ["PDF output", "The PDF of an Executive Deep Search briefing: model, fonts, document and download."],
  "src/lib/peopleEvents": ["People and events", "Birthdays, anniversaries and their lookup for the home page."],
  "src/lib/perf": ["Speed switches", "The switch panel of the performance audit and the helpers it controls."],
  "src/lib/qualifications": ["Qualifications", "Degrees and qualifications: parsing and answers."],
  "src/lib/records": ["Records scope", "Answering a question inside one chosen record type."],
  "src/lib/search": ["Search engines", "Circular and announcement retrieval, Executive Deep Synthesis (writer, checker, scoring, store), intent detection, ranking rules and answer composers."],
  "src/lib/security": ["Security", "Password rules, OTP, masking of numbers, reveal limits and the guard of generated SQL."],
  "src/lib/tools": ["Tool detection", "Detecting which utility a typed line needs."],
  "src/lib/ui": ["UI helpers", "Small helpers for the screens: headings, identifiers, the image guard, lazy loading."],
  "src/lib/utils": ["Utilities", "Name helpers, query cleaning and search utilities."],
  "src/records": ["Record types", "The fixed selections of the search window (Everything, People, PAX, Hospital, Holidays, Degrees, Circulars, Executive Deep Search): domains, plan and scope."],
  "src/tools": ["Utility registry", "The registry of utility tools and the menu of the Utility Services page."],
  "src/types": ["Type declarations", "Ambient type declarations."],
};
for (const p of pkgMap.values()) {
  const info = PACKAGE_INFO[p.id];
  const best = fileList.filter((f) => f.pkg === p.id && f.summary).sort((a, b) => b.importedBy - a.importedBy)[0];
  p.title = info ? info[0] : p.id.startsWith("src/tools/") ? "Tool: " + p.id.split("/")[2] : p.id;
  p.description = info ? info[1] : (best ? best.summary : "");
}
const packages = [...pkgMap.values()].sort((a, b) => a.id.localeCompare(b.id));
const edges = [...edgeGroup.entries()].map(([k, w]) => { const [a, b] = k.split(">"); return { a, b, w }; });
const groups = {};
for (const f of fileList) { const g = groupOf(f.id); groups[g] ??= { id: g, files: 0, lines: 0 }; groups[g].files++; groups[g].lines += f.lines; }

const index = {
  meta: { generated: new Date().toISOString(), ...gitInfo, files: fileList.length, symbols: totalSyms, lines: totalLines, commentLines: totalComments, routes: routes.length, pages: pages.length, entities: entities.length, switches: switches.length, behaviours: totalBehaviours, tests: [...testsOf.values()].reduce((a, t) => a + t.length, 0), kinds: kindCount, sql: sqls.length },
  packages, files: fileList, routes, pages, entities, switches, sqls, graph: { groups: Object.values(groups), edges }, search: searchIndex,
};
writeFileSync(join(OUT, "data", "index.json"), JSON.stringify(index));

// the site
const SITE = join(ROOT, "scripts", "docs", "site");
for (const name of readdirSync(SITE)) copyFileSync(join(SITE, name), join(OUT, name));
const size = (dir) => readdirSync(dir).reduce((a, n) => { const p = join(dir, n); return a + (statSync(p).isDirectory() ? size(p) : statSync(p).size); }, 0);
console.log(`developer-docs/: ${fileList.length} files, ${totalSyms} symbols (${Object.entries(kindCount).map(([k, v]) => `${v} ${k}`).join(", ")}), ${routes.length} routes, ${pages.length} pages, ${entities.length} entities, ${switches.length} switches, ${totalBehaviours} checked behaviours, ${edges.length} package links; ${(size(OUT) / 1e6).toFixed(1)} MB`);
