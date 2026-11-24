/* The developer reference: the page logic. Plain JavaScript, no library: it loads data/index.json once, a small JSON file per source file when one is opened, and draws everything itself. */
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (n) => new Intl.NumberFormat("en-IN").format(n);
  const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private window */ } } };

  const ICON = {
    home: '<path d="M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10"/>', layers: '<path d="M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5M3 17.5l9 5 9-5"/>', box: '<path d="M21 8l-9-5-9 5v8l9 5 9-5V8zM3 8l9 5 9-5M12 13v8"/>', route: '<circle cx="6" cy="19" r="2.5"/><circle cx="18" cy="5" r="2.5"/><path d="M8.5 19H15a3.5 3.5 0 000-7H9a3.5 3.5 0 010-7h6.5"/>',
    db: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>', sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>', code: '<path d="M8 8l-5 4 5 4M16 8l5 4-5 4M14 5l-4 14"/>', file: '<path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5zM14 3v5h5"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>', sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>', moon: '<path d="M21 13A9 9 0 1111 3a7 7 0 0010 10z"/>', menu: '<path d="M4 7h16M4 12h16M4 17h16"/>', up: '<path d="M12 19V5M5 12l7-7 7 7"/>', graph: '<circle cx="5" cy="6" r="2.5"/><circle cx="19" cy="6" r="2.5"/><circle cx="12" cy="19" r="2.5"/><path d="M7.5 6h9M6.5 8l4 9M17.5 8l-4 9"/>', check: '<path d="M5 12l5 5 9-10"/>',
  };
  const icon = (n) => `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[n] || ""}</svg>`;
  const KIND_LABEL = { function: "function", component: "component", class: "class", interface: "interface", type: "type", constant: "constant", route: "route", hook: "hook", entity: "entity", enum: "enum", file: "file", switch: "switch", method: "method", field: "field", key: "key", constructor: "constructor", getter: "getter", setter: "setter", signature: "signature" };
  const KIND_ORDER = ["route", "component", "hook", "function", "class", "entity", "interface", "type", "enum", "constant"];
  const KIND_PLURAL = { route: "Route handlers", component: "Components", hook: "Hooks", function: "Functions", class: "Classes", entity: "Entities", interface: "Interfaces", type: "Type aliases", enum: "Enums", constant: "Constants" };
  const badge = (k) => `<span class="badge k-${k}">${esc(KIND_LABEL[k] || k)}</span>`;

  // ------------------------------------------------------------------------------------------------ data
  let IDX, FILES = new Map(), BYHASH = new Map(), PKGS = new Map(), SYMS = new Map(), SEARCH = [];
  const cache = new Map();
  const load = (path) => { if (!cache.has(path)) cache.set(path, fetch(path, { credentials: "same-origin" }).then((r) => { if (!r.ok) throw new Error(path + " " + r.status); return r.json(); })); return cache.get(path); };

  // ------------------------------------------------------------------------------------------------ text helpers
  function kickerize(text) {
    const t = String(text ?? "");
    const m = t.search(/[a-z]/);
    if (m > 14) {
      const cut = t.lastIndexOf(" ", m - 1);
      const head = t.slice(0, cut > 0 ? cut : m);
      const letters = head.replace(/[^A-Za-z]/g, "");
      if (letters.length > 10 && (head.replace(/[^A-Z]/g, "").length / letters.length) > 0.85) return `<span class="kicker">${esc(head)}</span>${esc(t.slice(head.length))}`;
    }
    return esc(t);
  }
  const pathRe = /\b((?:src|scripts)\/[\w./\[\]()@-]+\.(?:tsx?|jsx?|mjs|sql))\b/g;
  function linkify(escaped) {
    return escaped.replace(pathRe, (m, p) => (FILES.has(p) ? `<a href="#/f/${FILES.get(p).h}">${p}</a>` : m));
  }
  function inline(text) {
    let s = esc(text);
    s = s.replace(/`([^`]+)`/g, (m, c) => {
      const name = c.replace(/\(\)$/, "");
      const hit = SYMS.get(name);
      if (hit && hit.length === 1 && name.length >= 4) return `<a href="#/f/${FILES.get(hit[0][2]).h}/${encodeURIComponent(name)}"><code>${c}</code></a>`;
      return `<code>${c}</code>`;
    });
    s = linkify(s);
    s = s.replace(/\b(https?:\/\/[^\s<)]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
    return s;
  }
  function doc(paras) {
    if (!paras || !paras.length) return "";
    let out = "", list = null;
    const closeList = () => { if (list) { out += `<ul>${list.map((x) => `<li>${inline(x)}</li>`).join("")}</ul>`; list = null; } };
    for (const p of paras) {
      if (/^([-*•]|\d+[.)])\s+/.test(p)) { (list ??= []).push(p.replace(/^([-*•]|\d+[.)])\s+/, "")); continue; }
      closeList();
      if (/^\|/.test(p) || /^-{3,}|^={3,}/.test(p)) out += `<pre>${esc(p)}</pre>`;
      else if (/^@\w+/.test(p)) out += `<p class="tag">${esc(p)}</p>`;
      else out += `<p>${inline(p)}</p>`;
    }
    closeList();
    return `<div class="doc">${out}</div>`;
  }
  const KW = new Set("export default async await function const let var return if else new class extends implements interface type enum import from as typeof keyof readonly private public protected static abstract void null undefined true false in of this get set declare".split(" "));
  function hl(code) {
    const re = /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|(\b\d[\d_.]*\b)|([A-Za-z_$][\w$]*)|(=>|[{}()\[\];,:<>?|&=+\-*\/!.])|(\s+)|(.)/g;
    let out = "", m, prev = "";
    while ((m = re.exec(code))) {
      if (m[1]) out += `<span class="tk-s">${esc(m[1])}</span>`;
      else if (m[2]) out += `<span class="tk-n">${m[2]}</span>`;
      else if (m[3]) { const w = m[3]; out += KW.has(w) ? `<span class="tk-k">${w}</span>` : /^[A-Z]/.test(w) ? `<span class="tk-t">${w}</span>` : (code[re.lastIndex] === "(" ? `<span class="tk-f">${w}</span>` : esc(w)); }
      else if (m[4]) out += `<span class="tk-p">${esc(m[4])}</span>`;
      else out += esc(m[0]);
      prev = m[0];
    }
    return out;
  }
  const codebox = (code) => `<div class="codebox"><pre>${hl(code)}</pre><button class="copy" data-copy="${esc(code)}">Copy</button></div>`;
  const brief = (s) => { const d = first(s.doc || []); if (d) return d; if (s.members?.length) return `${s.members.length} ${s.kind === "interface" ? "fields and methods" : s.kind === "enum" ? "members" : s.kind === "class" || s.kind === "entity" ? "members" : "keys"}`; if (s.kind === "type" && s.sig) return s.sig.slice(0, 90); if (s.params) return `(${s.params.map((p) => p.name).join(", ")})${s.returns ? " → " + s.returns : ""}`.slice(0, 120); return ""; };
  const first = (paras) => { const t = (paras || []).find((p) => !/^@/.test(p) && !/^[-=_#*]{4,}/.test(p)) || ""; const m = /^(.{20,200}?[.!?])(\s|$)/.exec(t); return (m ? m[1] : t.slice(0, 180)); };
  const fileLink = (id, text) => (FILES.has(id) ? `<a href="#/f/${FILES.get(id).h}">${esc(text ?? id)}</a>` : esc(text ?? id));
  // the path without the leading src/: the whole folder is kept, because two files of one name (admin/store.ts) live in several folders
  const shortName = (id) => id.replace(/^src\//, "");

  // ------------------------------------------------------------------------------------------------ shell
  function shell() {
    document.body.innerHTML = `
    <header class="top">
      <button class="iconbtn burger" id="burger" aria-label="Menu">${icon("menu")}</button>
      <a class="brand" href="#/"><span class="mark">DSP</span><span>Developer Reference<small>Durgapur Steel Plant · C&amp;IT intranet</small></span></a>
      <span class="grow"></span>
      <button class="searchbtn" id="open-search" aria-label="Search the reference">${icon("search")}<span class="t">Search files, functions, routes, tables…</span><kbd>⌘K</kbd></button>
      <span class="pill" id="buildpill"></span>
      <button class="iconbtn" id="theme" aria-label="Switch theme"></button>
    </header>
    <div class="shell"><nav class="side" id="side"></nav><main class="main" id="main"></main></div>
    <div class="veil" id="veil"><div class="pal" role="dialog" aria-label="Search"><input id="q" placeholder="Search the whole project…" autocomplete="off" spellcheck="false"><div class="res" id="res"></div><div class="foot"><span><kbd>↑</kbd> <kbd>↓</kbd> move</span><span><kbd>↵</kbd> open</span><span><kbd>esc</kbd> close</span></div></div></div>
    <div class="toast" id="toast"></div>
    <button class="totop" id="totop" aria-label="Back to top">${icon("up")}</button>`;
    const theme = store.get("devdocs-theme") || (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
    const setTheme = (t) => { document.documentElement.dataset.theme = t; $("#theme").innerHTML = icon(t === "dark" ? "sun" : "moon"); store.set("devdocs-theme", t); };
    setTheme(theme);
    $("#theme").onclick = () => setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
    $("#burger").onclick = () => document.body.classList.toggle("nav-open");
    $("#open-search").onclick = openPalette;
    $("#totop").onclick = () => window.scrollTo({ top: 0 });
    addEventListener("scroll", () => $("#totop").classList.toggle("show", scrollY > 900), { passive: true });
    document.addEventListener("click", (e) => {
      const c = e.target.closest("[data-copy]");
      if (c) { navigator.clipboard?.writeText(c.dataset.copy).then(() => toast("Copied")); }
      if (e.target.closest(".side a")) document.body.classList.remove("nav-open");
    });
    document.addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); openPalette(); }
      else if (e.key === "/" && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); openPalette(); }
      else if (e.key === "Escape") closePalette();
    });
    $("#veil").addEventListener("mousedown", (e) => { if (e.target.id === "veil") closePalette(); });
  }
  function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("show"), 1400); }

  // ------------------------------------------------------------------------------------------------ sidebar
  function sidebar() {
    const m = IDX.meta;
    const tree = Object.create(null);
    for (const p of IDX.packages) { let n = tree; for (const part of p.id.split("/")) { n.c ??= {}; n = n.c[part] ??= {}; } n.pkg = p; }
    const node = (name, n, path) => {
      const id = path;
      const kids = Object.entries(n.c ?? {}).sort(([a], [b]) => a.localeCompare(b));
      const self = n.pkg ? `<a href="#/p/${encodeURIComponent(n.pkg.id)}" data-nav="p:${esc(n.pkg.id)}">${esc(name)}<span class="count">${n.pkg.files}</span></a>` : "";
      if (!kids.length) return self || `<a>${esc(name)}</a>`;
      return `<details ${/^src$|^src\/lib$/.test(id) ? "open" : ""}><summary>${esc(name)}</summary><div class="sub">${n.pkg ? self : ""}${kids.map(([k, v]) => node(k, v, id + "/" + k)).join("")}</div></details>`;
    };
    $("#side").innerHTML = `<div class="nav">
      <a href="#/" data-nav="home">${icon("home")}Overview</a>
      <a href="#/architecture" data-nav="arch">${icon("graph")}Architecture</a>
      <a href="#/routes" data-nav="routes">${icon("route")}HTTP API<span class="count">${m.routes}</span></a>
      <a href="#/db" data-nav="db">${icon("db")}Database<span class="count">${m.entities}</span></a>
      <a href="#/switches" data-nav="switches">${icon("sliders")}Speed switches<span class="count">${m.switches}</span></a>
      <a href="#/packages" data-nav="packages">${icon("box")}All packages<span class="count">${IDX.packages.length}</span></a>
      <h6>Packages</h6>
      ${Object.entries(tree.c ?? {}).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => node(k, v, k)).join("")}
    </div>`;
  }
  function markNav(key) {
    document.querySelectorAll(".side a.on").forEach((a) => a.classList.remove("on"));
    const a = document.querySelector(`.side a[data-nav="${CSS.escape(key)}"]`);
    if (a) { a.classList.add("on"); let d = a.parentElement; while (d) { if (d.tagName === "DETAILS") d.open = true; d = d.parentElement; } a.scrollIntoView({ block: "nearest" }); }
  }

  // ------------------------------------------------------------------------------------------------ the palette
  let palSel = 0, palHits = [];
  function openPalette() { $("#veil").classList.add("open"); const q = $("#q"); q.value = ""; q.focus(); runSearch(""); }
  function closePalette() { $("#veil").classList.remove("open"); }
  function score(e, q, words) {
    const n = e[0].toLowerCase();
    if (!q) return e[5] ? 1 : 0;
    let s = 0;
    if (n === q) s = 1000; else if (n.startsWith(q)) s = 700 - n.length; else if (n.includes(q)) s = 420 - n.length * 0.5;
    else {
      const sm = (e[4] || "").toLowerCase();
      if (words.every((w) => n.includes(w))) s = 300;
      else if (words.every((w) => n.includes(w) || sm.includes(w))) s = 120;
      else { let i = 0; for (const ch of n) if (ch === q[i]) i++; if (i === q.length && q.length >= 3) s = 60; }
    }
    if (!s) return 0;
    if (e[1] === "file") s += 6; if (e[5]) s += 8;
    return s;
  }
  function runSearch(raw) {
    const q = raw.trim().toLowerCase(), words = q.split(/\s+/).filter(Boolean);
    const hits = [];
    for (const e of SEARCH) { const s = score(e, q, words); if (s > 0) hits.push([s, e]); }
    hits.sort((a, b) => b[0] - a[0]);
    palHits = hits.slice(0, 40).map((h) => h[1]);
    palSel = 0;
    const mark = (t) => { const i = t.toLowerCase().indexOf(q); return q && i >= 0 ? `${esc(t.slice(0, i))}<mark>${esc(t.slice(i, i + q.length))}</mark>${esc(t.slice(i + q.length))}` : esc(t); };
    $("#res").innerHTML = palHits.length ? palHits.map((e, i) => `<div class="hit ${i === 0 ? "sel" : ""}" data-i="${i}"><span class="badge k-${e[1]}">${esc(e[1])}</span><div style="min-width:0"><div class="n">${mark(e[0])}</div><div class="w">${esc(shortName(e[2]))}${e[4] ? " · " + esc(e[4]) : ""}</div></div></div>`).join("") : `<div class="empty">Nothing matches “${esc(raw)}”.</div>`;
  }
  function go(e) {
    closePalette();
    const [name, kind, file] = e;
    if (kind === "route") location.hash = `#/routes?q=${encodeURIComponent(name)}`;
    else if (kind === "entity") location.hash = `#/db?q=${encodeURIComponent(name)}`;
    else if (kind === "switch") location.hash = `#/switches?q=${encodeURIComponent(name)}`;
    else if (kind === "file") location.hash = `#/f/${FILES.get(file).h}`;
    else location.hash = `#/f/${FILES.get(file).h}/${encodeURIComponent(name)}`;
  }
  function paletteEvents() {
    $("#q").addEventListener("input", (e) => runSearch(e.target.value));
    $("#q").addEventListener("keydown", (e) => {
      const rows = document.querySelectorAll("#res .hit");
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); palSel = (palSel + (e.key === "ArrowDown" ? 1 : -1) + rows.length) % Math.max(1, rows.length); rows.forEach((r, i) => r.classList.toggle("sel", i === palSel)); rows[palSel]?.scrollIntoView({ block: "nearest" }); }
      else if (e.key === "Enter" && palHits[palSel]) { e.preventDefault(); go(palHits[palSel]); }
    });
    $("#res").addEventListener("click", (e) => { const h = e.target.closest(".hit"); if (h) go(palHits[+h.dataset.i]); });
    $("#res").addEventListener("mousemove", (e) => { const h = e.target.closest(".hit"); if (h) { palSel = +h.dataset.i; document.querySelectorAll("#res .hit").forEach((r, i) => r.classList.toggle("sel", i === palSel)); } });
  }

  // ------------------------------------------------------------------------------------------------ graph
  const FAMILY_COLOR = (g) => (g.startsWith("app") ? "var(--k-route)" : g === "components" || g === "hooks" || g === "context" ? "var(--k-component)" : g === "tools" ? "var(--k-enum)" : g === "scripts" ? "var(--k-file)" : g === "records" ? "var(--k-class)" : "var(--k-function)");
  function drawGraph(box, opts = {}) {
    const { groups, edges } = IDX.graph;
    const order = (g) => (g.startsWith("app") ? 0 : g === "components" ? 1 : g === "hooks" || g === "context" ? 2 : g === "records" ? 3 : g === "tools" ? 4 : g.startsWith("lib") ? 5 : g === "scripts" ? 7 : 6);
    const nodes = groups.slice().sort((a, b) => order(a.id) - order(b.id) || a.id.localeCompare(b.id));
    const W = 1000, H = 800, cx = W / 2, cy = H / 2, R = 262;
    // a little empty arc between one family of the code and the next, so the groups can be told apart
    const fam = (g) => order(g);
    let gaps = 0; nodes.forEach((n, i) => { if (i && fam(n.id) !== fam(nodes[i - 1].id)) gaps++; });
    const unit = (Math.PI * 2) / (nodes.length + gaps * 0.9);
    let slot = 0;
    nodes.forEach((n, i) => { if (i && fam(n.id) !== fam(nodes[i - 1].id)) slot += 0.9; n.a = slot * unit - Math.PI / 2 + unit / 2; slot += 1; n.x = cx + R * Math.cos(n.a); n.y = cy + R * Math.sin(n.a); n.r = 5 + Math.sqrt(n.files) * 1.25; });
    const by = new Map(nodes.map((n) => [n.id, n]));
    const maxW = Math.max(...edges.map((e) => e.w));
    const path = (a, b) => { const x1 = a.x, y1 = a.y, x2 = b.x, y2 = b.y; return `M${x1},${y1} Q${cx + (x1 + x2 - 2 * cx) * 0.1},${cy + (y1 + y2 - 2 * cy) * 0.1} ${x2},${y2}`; };
    const edgeSvg = edges.filter((e) => by.has(e.a) && by.has(e.b)).sort((a, b) => a.w - b.w).map((e) => `<path class="gedge" data-a="${esc(e.a)}" data-b="${esc(e.b)}" d="${path(by.get(e.a), by.get(e.b))}" stroke="${FAMILY_COLOR(e.a)}" stroke-width="${0.6 + (e.w / maxW) * 5}" opacity="${0.16 + (e.w / maxW) * 0.34}"/>`).join("");
    const nodeSvg = nodes.map((n) => {
      const deg = (n.a * 180) / Math.PI, flip = Math.cos(n.a) < 0, lr = R + n.r + 12;
      const lx = cx + lr * Math.cos(n.a), ly = cy + lr * Math.sin(n.a);
      return `<g class="gnode" data-id="${esc(n.id)}" style="--c:${FAMILY_COLOR(n.id)}"><circle cx="${n.x}" cy="${n.y}" r="${n.r}" fill="${FAMILY_COLOR(n.id)}" fill-opacity=".92" stroke="var(--bg)" stroke-width="2"/><text class="glabel" transform="translate(${lx},${ly}) rotate(${flip ? deg + 180 : deg})" text-anchor="${flip ? "end" : "start"}" dy="4">${esc(n.id)}</text></g>`;
    }).join("");
    box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Which parts of the code depend on which">${edgeSvg}${nodeSvg}</svg><div class="gtip" id="gtip"></div>`;
    const tip = $("#gtip", box);
    const dim = (id) => {
      box.querySelectorAll(".gedge").forEach((p) => { const on = !id || p.dataset.a === id || p.dataset.b === id; p.style.opacity = on ? (id ? 0.85 : "") : 0.04; });
      box.querySelectorAll(".gnode").forEach((g) => { const linked = !id || g.dataset.id === id || edges.some((e) => (e.a === id && e.b === g.dataset.id) || (e.b === id && e.a === g.dataset.id)); g.style.opacity = linked ? 1 : 0.25; });
    };
    box.querySelectorAll(".gnode").forEach((g) => {
      g.addEventListener("mouseenter", () => {
        const id = g.dataset.id, n = by.get(id);
        dim(id);
        const out = edges.filter((e) => e.a === id).sort((a, b) => b.w - a.w).slice(0, 4).map((e) => `${esc(e.b)} (${e.w})`).join(", ");
        const inn = edges.filter((e) => e.b === id).sort((a, b) => b.w - a.w).slice(0, 4).map((e) => `${esc(e.a)} (${e.w})`).join(", ");
        tip.innerHTML = `<b>${esc(id)}</b><br><span class="muted">${n.files} files · ${fmt(n.lines)} lines</span>${out ? `<br>uses → ${out}` : ""}${inn ? `<br>used by ← ${inn}` : ""}`;
        tip.style.opacity = 1;
      });
      g.addEventListener("mousemove", (e) => { const r = box.getBoundingClientRect(); tip.style.left = Math.min(r.width - 270, e.clientX - r.left + 14) + "px"; tip.style.top = e.clientY - r.top + 14 + "px"; });
      g.addEventListener("mouseleave", () => { dim(null); tip.style.opacity = 0; });
      g.addEventListener("click", () => { const id = g.dataset.id; const cand = IDX.packages.filter((p) => groupOfPkg(p.id) === id)[0]; if (cand) location.hash = `#/p/${encodeURIComponent(cand.id)}`; });
    });
  }
  function groupOfPkg(pid) { const p = pid.split("/"); if (p[0] === "scripts") return "scripts"; if (p[1] === "app") return p[2] === "api" ? "app/api" : "app (pages)"; if (p[1] === "lib") return p.length > 2 ? `lib/${p[2]}` : "lib (root)"; if (p[1] === "tools") return "tools"; if (p.length === 1) return "root"; return p[1]; }

  // ------------------------------------------------------------------------------------------------ pages
  function countUp(el, to) { const t0 = performance.now(); const d = 900; const step = (t) => { const k = Math.min(1, (t - t0) / d); el.textContent = fmt(Math.round(to * (1 - Math.pow(1 - k, 3)))); if (k < 1) requestAnimationFrame(step); }; requestAnimationFrame(step); }
  const footer = () => `<div class="foot"><span>Generated ${esc(new Date(IDX.meta.generated).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }))} from commit ${esc(IDX.meta.commit || "?")} (${esc(IDX.meta.branch || "")})</span><span>Everything here is read from the code, its comments and its self-tests: <span class="mono">npm run docs:api</span> builds it again.</span></div>`;

  function pageHome() {
    const m = IDX.meta;
    const kinds = KIND_ORDER.filter((k) => m.kinds[k]);
    const total = kinds.reduce((a, k) => a + m.kinds[k], 0);
    const hubs = IDX.files.slice().sort((a, b) => b.importedBy - a.importedBy).slice(0, 8);
    const big = IDX.files.slice().sort((a, b) => b.lines - a.lines).slice(0, 6);
    return `<section class="hero">
      <div class="eyebrow">Developer reference</div>
      <h1 class="title">The <span class="grad">DSP Intranet</span>,<br>from the inside.</h1>
      <p class="lead">Every package, file, function, component, route, table and switch of the Durgapur Steel Plant intranet: first its structure (where it lives, what it takes, what it returns, who uses it), then its function, in the words of the comments above it and the behaviours its self-tests check.</p>
      <div class="stats">
        ${[["files", m.files], ["symbols", m.symbols], ["lines of code", m.lines], ["lines of comment", m.commentLines], ["HTTP routes", m.routes], ["database tables", m.entities], ["behaviours checked", m.behaviours]].map(([l, v]) => `<div class="card stat"><b data-count="${v}">0</b><span>${l}</span></div>`).join("")}
      </div>
    </section>
    <h2 class="sec">What the code is made of</h2>
    <div class="card" style="padding:22px"><div class="bar">${kinds.map((k) => `<i style="flex:${m.kinds[k]};--c:var(--k-${k})" title="${k}"></i>`).join("")}</div>
      <div class="legend">${kinds.map((k) => `<span class="row" style="gap:7px"><span class="dot k-${k}" style="--c:var(--k-${k})"></span>${esc(KIND_PLURAL[k])} <b>${fmt(m.kinds[k])}</b> <span class="muted">${Math.round((m.kinds[k] / total) * 100)}%</span></span>`).join("")}</div></div>
    <h2 class="sec">Explore</h2>
    <div class="grid g3">
      <a class="card explore" href="#/architecture"><div class="ico">${icon("graph")}</div><h3>Architecture</h3><p>The layers, and which part of the code depends on which: a live map.</p></a>
      <a class="card explore" href="#/routes"><div class="ico">${icon("route")}</div><h3>HTTP API</h3><p>${m.routes} route handlers with their methods, parameters and guards.</p></a>
      <a class="card explore" href="#/db"><div class="ico">${icon("db")}</div><h3>Database</h3><p>${m.entities} entities and ${m.sql} SQL scripts.</p></a>
      <a class="card explore" href="#/switches"><div class="ico">${icon("sliders")}</div><h3>Speed switches</h3><p>${m.switches} switches, each with the way things were before.</p></a>
      <a class="card explore" href="#/packages"><div class="ico">${icon("box")}</div><h3>Packages</h3><p>${IDX.packages.length} packages in Javadoc style: summary first, detail after.</p></a>
      <a class="card explore" href="#" id="home-search"><div class="ico">${icon("search")}</div><h3>Search everything</h3><p>Press <span class="mono">⌘K</span> or <span class="mono">/</span> from anywhere.</p></a>
    </div>
    <h2 class="sec">The most depended-on files</h2>
    <div class="card tblwrap"><table class="tbl"><thead><tr><th>File</th><th>What it is</th><th class="num">Used by</th></tr></thead><tbody>${hubs.map((f) => `<tr><td><a class="name mono" href="#/f/${f.h}">${esc(shortName(f.id))}</a></td><td class="muted">${kickerize(f.summary).slice(0, 220)}</td><td class="num">${f.importedBy} files</td></tr>`).join("")}</tbody></table></div>
    <h2 class="sec">The largest files</h2>
    <div class="card tblwrap"><table class="tbl"><thead><tr><th>File</th><th>What it is</th><th class="num">Lines</th></tr></thead><tbody>${big.map((f) => `<tr><td><a class="name mono" href="#/f/${f.h}">${esc(shortName(f.id))}</a></td><td class="muted">${kickerize(f.summary).slice(0, 220)}</td><td class="num">${fmt(f.lines)}</td></tr>`).join("")}</tbody></table></div>
    ${footer()}`;
  }
  function afterHome() {
    document.querySelectorAll("[data-count]").forEach((el) => countUp(el, +el.dataset.count));
    $("#home-search")?.addEventListener("click", (e) => { e.preventDefault(); openPalette(); });
  }

  function pageArchitecture() {
    const g = Object.fromEntries(IDX.graph.groups.map((x) => [x.id, x]));
    const chips = (ids) => ids.filter((i) => g[i]).map((i) => `<a class="chip btn" href="#/packages?g=${encodeURIComponent(i)}"><span class="dot" style="--c:${FAMILY_COLOR(i)}"></span>${esc(i)} <span class="muted">${g[i].files}</span></a>`).join("");
    const libs = IDX.graph.groups.map((x) => x.id).filter((i) => i.startsWith("lib/"));
    const layers = [
      ["The browser", "what the user sees", chips(["components", "hooks", "context", "tools", "app (pages)"])],
      ["The HTTP API", "route handlers", chips(["app/api", "records"])],
      ["The engines", "search, answers, employees", chips(libs.filter((i) => /search|nl2sql|employees|announcements|circulars|holidays|hospital|pax|records|tools|qualifications|peopleEvents|contact|ingestion|help|pdf/.test(i)))],
      ["The platform", "data, AI, security, live data", chips(libs.filter((i) => /db|ai|security|facility|errorLog|accessLog|live|perf|ui|utils|concurrency|dev/.test(i)).concat(["lib (root)"]))],
    ];
    return `<div class="crumbs"><a href="#/">Overview</a><span class="sep">/</span>Architecture</div>
    <h1 class="title">Architecture</h1>
    <p class="lead">Four layers, from what the user touches down to the data and the models. A question typed in the search window goes through the first three and reaches the fourth only through the engines.</p>
    <h2 class="sec">The layers</h2>
    <div class="layers">${layers.map((l, i) => `${i ? '<div class="flowdown">↓</div>' : ""}<div class="card layer"><div class="nm">${l[0]}<small>${l[1]}</small></div><div class="chips">${l[2]}</div></div>`).join("")}</div>
    <h2 class="sec">Who depends on whom</h2>
    <p class="muted small" style="margin:-4px 0 12px">Each dot is a part of the code, sized by its files; a curve is a file of one part importing a file of another, thicker for more imports. Hover a dot to follow its links, click it to open its package.</p>
    <div class="card graphbox" id="graph"></div>
    ${footer()}`;
  }

  const FAMILIES = [["App and API", (p) => /^src\/app/.test(p) || p === "src (root)"], ["Interface", (p) => /^src\/(components|hooks|context|types|records)/.test(p)], ["Library", (p) => /^src\/lib/.test(p)], ["Tools", (p) => /^src\/tools/.test(p)], ["Scripts", (p) => /^scripts/.test(p)]];
  function pagePackages(params) {
    const g = params.get("g");
    const list = IDX.packages.filter((p) => !g || groupOfPkg(p.id) === g);
    return `<div class="crumbs"><a href="#/">Overview</a><span class="sep">/</span>Packages</div>
    <h1 class="title">Packages</h1>
    <p class="lead">A package is a folder of the code. Open one for its summary of files and symbols, then a file for the detail.${g ? ` Showing <b>${esc(g)}</b> · <a href="#/packages">show all</a>` : ""}</p>
    ${FAMILIES.map(([name, test]) => { const ps = list.filter((p) => test(p.id)); return ps.length ? `<h2 class="sec">${name}</h2><div class="grid g2">${ps.map((p) => `<a class="card explore" href="#/p/${encodeURIComponent(p.id)}"><div class="row" style="justify-content:space-between"><span class="mono small muted">${esc(p.id)}</span><span class="chip">${p.files} files</span></div><h3>${esc(p.title)}</h3><p>${esc((p.description || "").slice(0, 150))}</p><div class="row small muted" style="margin-top:12px"><span>${fmt(p.lines)} lines</span><span>${fmt(p.symbols)} symbols</span>${p.behaviours ? `<span>${fmt(p.behaviours)} checks</span>` : ""}</div></a>`).join("")}</div>` : ""; }).join("")}
    ${footer()}`;
  }

  function pagePackage(pid) {
    const p = PKGS.get(pid);
    if (!p) return notFound("package " + pid);
    const files = IDX.files.filter((f) => f.pkg === pid).sort((a, b) => a.id.localeCompare(b.id));
    const syms = SEARCH.filter((e) => e[1] !== "file" && e[1] !== "route" && e[1] !== "entity" && e[1] !== "switch" && FILES.get(e[2])?.pkg === pid);
    const kinds = KIND_ORDER.filter((k) => syms.some((s) => s[1] === k));
    const parts = pid.split("/");
    return `<div class="crumbs"><a href="#/">Overview</a><span class="sep">/</span><a href="#/packages">Packages</a>${parts.map((x, i) => `<span class="sep">/</span>${i === parts.length - 1 ? esc(x) : esc(x)}`).join("")}</div>
    <h1 class="title">${esc(p.title)}</h1>
    <div class="row small muted" style="margin-bottom:10px"><span class="mono">${esc(pid)}</span><span class="chip">${p.files} files</span><span class="chip">${fmt(p.lines)} lines</span><span class="chip">${fmt(p.symbols)} symbols</span>${p.behaviours ? `<span class="chip">${fmt(p.behaviours)} behaviours checked</span>` : ""}</div>
    <p class="lead">${esc(p.description || "")}</p>
    <h2 class="sec">File summary</h2>
    <div class="card tblwrap"><table class="tbl"><thead><tr><th>File</th><th>Description</th><th>Contents</th><th class="num">Lines</th><th class="num">Used by</th></tr></thead><tbody>
      ${files.map((f) => `<tr><td><a class="name mono" href="#/f/${f.h}">${esc(f.id.split("/").pop())}</a>${f.kind !== "module" ? `<br>${badge(f.kind)}` : ""}</td><td class="muted">${kickerize(f.summary || "—").slice(0, 260)}</td><td><div class="chips">${Object.entries(f.kinds).sort((a, b) => KIND_ORDER.indexOf(a[0]) - KIND_ORDER.indexOf(b[0])).map(([k, v]) => `<span class="chip"><span class="dot k-${k}" style="--c:var(--k-${k})"></span>${v}</span>`).join("")}</div></td><td class="num">${fmt(f.lines)}</td><td class="num">${f.importedBy || ""}</td></tr>`).join("")}
    </tbody></table></div>
    ${kinds.map((k) => { const list = syms.filter((s) => s[1] === k && s[5]).sort((a, b) => a[0].localeCompare(b[0])); return list.length ? `<h2 class="sec">${esc(KIND_PLURAL[k])} <span class="muted" style="letter-spacing:0;text-transform:none;font-weight:500">${list.length}</span></h2><div class="card tblwrap"><table class="tbl"><thead><tr><th>Name</th><th>Description</th><th>File</th></tr></thead><tbody>${list.map((s) => `<tr><td><a class="name mono" href="#/f/${FILES.get(s[2]).h}/${encodeURIComponent(s[0])}">${esc(s[0])}</a></td><td class="muted">${inline(s[4] || "—")}</td><td class="mono small muted">${esc(s[2].split("/").pop())}:${s[3]}</td></tr>`).join("")}</tbody></table></div>` : ""; }).join("")}
    ${footer()}`;
  }

  function symbolCard(s, fid) {
    const members = (s.members || []).filter((m) => m.name !== undefined);
    const tableOf = (rows, cols) => `<div class="pwrap"><table class="ptable">${rows.map((r) => `<tr>${cols.map((c) => `<td class="${c.cls || ""}">${c.f(r)}</td>`).join("")}</tr>`).join("")}</table></div>`;
    let body = "";
    if (s.generics) body += `<div class="small muted">Generic parameters: <span class="mono">${esc(s.generics)}</span></div>`;
    if (s.extends || (s.implements && s.implements.length)) body += `<div class="small muted" style="margin-top:6px">${s.extends ? `extends <span class="mono">${esc(s.extends)}</span> ` : ""}${s.implements?.length ? `implements <span class="mono">${esc(s.implements.join(", "))}</span>` : ""}</div>`;
    if (s.sig) body += codebox(s.sig);
    else if (s.kind === "interface") body += codebox(`interface ${s.name}${s.generics ? "<" + s.generics + ">" : ""}${s.extends ? " extends " + s.extends : ""}`);
    else if (s.kind === "class" || s.kind === "entity") body += codebox(`${s.abstract ? "abstract " : ""}class ${s.name}${s.extends ? " extends " + s.extends : ""}${s.implements?.length ? " implements " + s.implements.join(", ") : ""}`);
    else if (s.kind === "enum") body += codebox(`enum ${s.name}`);
    body += doc(s.doc);
    if (s.params?.length) body += `<div class="mini">Parameters</div>${tableOf(s.params, [{ f: (p) => `${esc(p.rest ? "…" : "")}${esc(p.name)}${p.optional ? "?" : ""}` }, { cls: "ty", f: (p) => esc(p.type || "—") }, { f: (p) => inline((s.paramDocs && s.paramDocs[p.name]) || (p.def ? "default " + p.def : "")) }])}`;
    if (s.returns || s.returnDoc) body += `<div class="mini">Returns</div><div class="doc"><p><span class="mono" style="color:var(--k-interface)">${esc(s.returns || "")}</span> ${inline(s.returnDoc || "")}</p></div>`;
    if (members.length) {
      const groups = Object.create(null);
      for (const m of members) (groups[m.kind] ??= []).push(m);
      for (const [k, list] of Object.entries(groups)) {
        body += `<div class="mini">${esc({ field: "Fields", method: "Methods", key: s.kind === "enum" ? "Members" : "Keys", constructor: "Constructor", getter: "Getters", setter: "Setters", signature: "Signatures" }[k] || k)} · ${list.length}</div>`;
        body += `<div class="tblwrap"><table class="ptable">${list.slice(0, 120).map((m) => `<tr><td><span class="mono">${esc(m.name)}${m.optional ? "?" : ""}</span>${m.mods?.length ? `<br><span class="muted small">${esc(m.mods.join(" "))}</span>` : ""}</td><td class="ty">${esc(m.type || m.sig || m.value || "")}${m.params?.length && !m.sig ? "" : ""}</td><td>${(m.doc || []).length ? inline((m.doc || []).join(" ")) : '<span class="muted">—</span>'}${m.decos?.length ? `<div class="muted small mono">${esc(m.decos.join(" "))}</div>` : ""}</td></tr>`).join("")}</table></div>`;
      }
    }
    if (s.usedBy?.length) body += `<div class="mini">Used by · ${s.usedBy.length}</div><div class="chips">${s.usedBy.slice(0, 40).map((u) => `<a class="chip btn mono" href="#/f/${FILES.get(u)?.h}">${esc(shortName(u))}</a>`).join("")}${s.usedBy.length > 40 ? `<span class="chip">+${s.usedBy.length - 40} more</span>` : ""}</div>`;
    return `<article class="card sym k-${s.kind}" id="s-${esc(s.name)}"><h3>${esc(s.name)} ${badge(s.kind)}${s.exported ? "" : '<span class="ext">internal</span>'}${s.isDefault ? '<span class="ext">default export</span>' : ""}${s.async ? '<span class="ext">async</span>' : ""}<span class="loc">${esc(fid.split("/").pop())}:${s.line}</span></h3>${body}</article>`;
  }

  async function pageFile(h, sym) {
    const f = BYHASH.get(h);
    if (!f) return notFound("file");
    const d = await load(`data/f/${h}.json`);
    const pkg = PKGS.get(d.pkg);
    const exp = d.symbols.filter((s) => s.exported), internal = d.symbols.filter((s) => !s.exported);
    const kinds = KIND_ORDER.filter((k) => exp.some((s) => s.kind === k));
    const summaryTable = (k) => { const list = exp.filter((s) => s.kind === k); return `<h2 class="sec">${esc(KIND_PLURAL[k])} <span class="muted" style="letter-spacing:0;text-transform:none;font-weight:500">${list.length}</span></h2><div class="card tblwrap"><table class="tbl"><thead><tr><th style="width:30%">Name</th><th>Summary</th></tr></thead><tbody>${list.map((s) => `<tr><td><a class="name mono" href="#s-${esc(s.name)}" data-jump="${esc(s.name)}">${esc(s.name)}</a>${s.params ? `<div class="sig muted" style="font-size:11.5px">(${esc(s.params.map((p) => p.name + (p.optional ? "?" : "")).join(", "))})</div>` : ""}</td><td class="muted">${first(s.doc) ? inline(first(s.doc)) : `<span class="mono small">${esc(brief(s))}</span>`}</td></tr>`).join("")}</tbody></table></div>`; };
    const hood = `<div class="card hood"><div class="col"><h6>Imports · ${d.imports.length}</h6>${d.imports.slice(0, 12).map((i) => `<a class="node" href="#/f/${FILES.get(i.file)?.h}" title="${esc(i.names.join(", "))}">${esc(shortName(i.file))}${i.lazy ? " ⟳" : ""}</a>`).join("") || '<span class="muted small">nothing inside the project</span>'}${d.imports.length > 12 ? `<span class="muted small">+${d.imports.length - 12} more</span>` : ""}${d.external.length ? `<div class="muted small mono" style="margin-top:6px">${esc(d.external.slice(0, 8).join(" · "))}</div>` : ""}</div><div class="arrow">→</div><div class="center">${esc(d.id.split("/").pop())}</div><div class="arrow">→</div><div class="col"><h6>Imported by · ${d.importedBy.length}</h6>${d.importedBy.slice(0, 12).map((i) => `<a class="node" href="#/f/${FILES.get(i)?.h}">${esc(shortName(i))}</a>`).join("") || '<span class="muted small">no other file (an entry point or a script)</span>'}${d.importedBy.length > 12 ? `<span class="muted small">+${d.importedBy.length - 12} more</span>` : ""}</div></div>`;
    const parts = d.pkg.split("/");
    const main = `<div class="crumbs"><a href="#/">Overview</a><span class="sep">/</span><a href="#/packages">Packages</a><span class="sep">/</span><a href="#/p/${encodeURIComponent(d.pkg)}">${esc(d.pkg)}</a><span class="sep">/</span>${esc(d.id.split("/").pop())}</div>
      <h1 class="title mono" style="font-size:clamp(22px,3vw,34px)">${esc(d.id.split("/").pop())}</h1>
      <div class="row small muted" style="margin-bottom:12px"><span class="mono">${esc(d.id)}</span>${badge(d.kind === "ui" ? "component" : d.kind === "module" ? "file" : d.kind)}<span class="chip">${fmt(d.lines)} lines</span><span class="chip">${Math.round((d.commentLines / Math.max(1, d.lines)) * 100)}% comment</span>${d.tests.length ? `<span class="chip">${d.behaviours.length} behaviours checked</span>` : '<span class="chip off">no self-test</span>'}</div>
      ${d.header.length ? `<h2 class="sec" style="margin-top:22px">Overview</h2>${doc(d.header)}` : ""}
      <h2 class="sec">Structure</h2>${hood}
      ${kinds.length ? kinds.map(summaryTable).join("") : '<div class="card empty">This file exports nothing that is documented here.</div>'}
      ${d.symbols.length ? `<h2 class="sec">Detail</h2>${exp.map((s) => symbolCard(s, d.id)).join("")}${internal.length ? `<details class="fold" style="margin-top:20px"><summary>${internal.length} internal symbols <span class="muted small">(not exported)</span></summary><div class="inner">${internal.map((s) => symbolCard(s, d.id)).join("")}</div></details>` : ""}` : ""}
      ${d.behaviours.length ? `<h2 class="sec">Behaviours checked</h2><details class="fold"><summary>${icon("check")} ${d.behaviours.length} statements the self-test proves <span class="muted small">${d.tests.map((t) => t.file.split("/").pop()).join(", ")}</span></summary><div class="inner"><ol class="spec">${d.behaviours.map((b) => `<li>${inline(b)}</li>`).join("")}</ol></div></details>` : ""}
      ${footer()}`;
    const rail = `<aside class="rail"><h6>On this page</h6>${exp.slice(0, 80).map((s) => `<a href="#s-${esc(s.name)}" data-jump="${esc(s.name)}"><span class="dot k-${s.kind}" style="--c:var(--k-${s.kind})"></span>${esc(s.name)}</a>`).join("")}</aside>`;
    return { html: `<div class="page2"><div>${main}</div>${rail}</div>`, after: () => { if (sym) jumpTo(sym); const links = document.querySelectorAll(".rail a"); const obs = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) { links.forEach((l) => l.classList.toggle("on", l.dataset.jump === e.target.id.slice(2))); } }, { rootMargin: "-90px 0px -70% 0px" }); document.querySelectorAll(".sym").forEach((s) => obs.observe(s)); } };
  }
  function jumpTo(name) { const el = document.getElementById("s-" + name); if (el) { el.scrollIntoView({ behavior: "smooth", block: "start" }); el.classList.add("flash"); setTimeout(() => el.classList.remove("flash"), 1700); } }

  function pageRoutes(params) {
    const q = (params.get("q") || "").toLowerCase();
    const list = IDX.routes.filter((r) => !q || (r.url + " " + r.summary + " " + r.file).toLowerCase().includes(q));
    const groups = Object.create(null);
    for (const r of list) { const seg = r.url.split("/")[2] || "(root)"; (groups[seg] ??= []).push(r); }
    return `<div class="crumbs"><a href="#/">Overview</a><span class="sep">/</span>HTTP API</div>
    <h1 class="title">HTTP API</h1>
    <p class="lead">Every route handler of the application (<span class="mono">src/app/api</span>). The badges say what a route insists on: a signed-in session, a same-origin request, a rate limit.</p>
    <div class="toolbar"><input class="input" id="rq" placeholder="Filter routes…" value="${esc(params.get("q") || "")}"><span class="chip">${list.length} of ${IDX.routes.length} routes</span><span class="chip"><span class="flag session">session</span> signed-in user required</span><span class="chip"><span class="flag same-origin">same-origin</span> checked</span><span class="chip"><span class="flag rate-limited">rate-limited</span></span></div>
    ${Object.entries(groups).map(([seg, rs]) => `<h2 class="sec">${esc(seg)}</h2>${rs.map((r) => `<div class="card route"><div class="ms">${r.methods.map((m) => `<span class="method m-${m.method}">${m.method}</span>`).join("") || '<span class="method">—</span>'}</div><div><div class="url">${esc(r.url)}</div><div class="doc" style="margin:6px 0">${r.summary ? `<p>${inline(r.summary)}</p>` : ""}</div><div class="chips">${r.flags.map((f) => `<span class="flag ${f}">${f}</span>`).join("")}${r.maxDuration ? `<span class="flag">max ${r.maxDuration} s</span>` : ""}${r.query.map((x) => `<span class="chip mono">?${esc(x)}</span>`).join("")}<a class="chip btn mono" href="#/f/${FILES.get(r.file)?.h}">${esc(shortName(r.file))}</a></div></div></div>`).join("")}`).join("") || '<div class="card empty">No route matches.</div>'}
    ${footer()}`;
  }

  function pageDb(params) {
    const q = (params.get("q") || "").toLowerCase();
    const ents = IDX.entities.filter((e) => !q || (e.table + e.name).toLowerCase().includes(q));
    return `<div class="crumbs"><a href="#/">Overview</a><span class="sep">/</span>Database</div>
    <h1 class="title">Database</h1>
    <p class="lead">The TypeORM entities (tables) of the application on Supabase Postgres, and the SQL scripts that built the rest: views, roles, search indexes.</p>
    <div class="toolbar"><input class="input" id="dq" placeholder="Filter tables…" value="${esc(params.get("q") || "")}"><span class="chip">${ents.length} entities</span></div>
    <div class="grid g-db">${ents.map((e) => `<div class="card" style="padding:18px 20px"><div class="row" style="justify-content:space-between"><h3 class="mono" style="margin:0;font-size:17px">${esc(e.table)}</h3><span class="badge k-entity">entity</span></div><div class="small muted" style="margin:3px 0 8px">class <span class="mono">${esc(e.name)}</span> · <a href="#/f/${FILES.get(e.file)?.h}/${encodeURIComponent(e.name)}">${esc(shortName(e.file))}:${e.line}</a></div>${doc(e.doc)}<div class="cols"><div class="cols-in">${e.columns.map((c) => `<div class="col"><span class="cn">${esc(c.name)}${c.nullable ? '<em title="nullable / optional">?</em>' : ""}</span><span class="ct">${esc(c.type || "")}</span><span class="cd">${(c.decorators || []).map((d) => d.replace(/^@/, "").replace(/\(.*$/, "")).map((d) => `<i class="${/^Primary/.test(d) ? "pk" : ""}">${esc(d)}</i>`).join("")}</span></div>`).join("")}</div></div></div>`).join("") || '<div class="card empty">No entity matches.</div>'}</div>
    <h2 class="sec">SQL scripts · ${IDX.sqls.length}</h2>
    <div class="card tblwrap"><table class="tbl"><thead><tr><th>Script</th><th>What it does</th><th>Creates</th></tr></thead><tbody>${IDX.sqls.map((s) => `<tr><td class="mono small">${esc(s.id.replace(/^src\/lib\/nl2sql\/sql\//, ""))}<br><span class="muted">${s.lines} lines</span></td><td class="muted">${inline(first(s.header) || "—")}</td><td><div class="chips">${s.tables.slice(0, 6).map((t) => `<span class="chip mono">${esc(t)}</span>`).join("")}${s.tables.length > 6 ? `<span class="chip">+${s.tables.length - 6}</span>` : ""}</div></td></tr>`).join("")}</tbody></table></div>
    ${footer()}`;
  }

  function pageSwitches(params) {
    const q = (params.get("q") || "").toLowerCase();
    const list = IDX.switches.filter((s) => !q || s.name.toLowerCase().includes(q));
    const sections = Object.create(null);
    for (const s of list) (sections[s.section || "General"] ??= []).push(s);
    return `<div class="crumbs"><a href="#/">Overview</a><span class="sep">/</span>Speed switches</div>
    <h1 class="title">Speed switches</h1>
    <p class="lead">One file (<a href="#/f/${FILES.get("src/lib/perf/switches.js")?.h}">src/lib/perf/switches.js</a>) says, for every change of the performance audit, whether the new way or the previous way runs. Change a value and the application behaves as before; each card says what the other value is.</p>
    <div class="toolbar"><input class="input" id="sq" placeholder="Filter switches…" value="${esc(params.get("q") || "")}"><span class="chip">${list.length} switches</span></div>
    ${Object.entries(sections).map(([sec, ss]) => `<h2 class="sec">${esc(sec)}</h2>${ss.map((s) => `<div class="card switch"><div><h3>${esc(s.name)}</h3><div class="doc" style="margin-top:6px">${doc(s.doc.filter((p) => !/^-{6,}/.test(p)).slice(0, 3)) || ""}</div></div><div class="val">${esc(s.value)}</div></div>`).join("")}`).join("")}
    ${footer()}`;
  }

  const notFound = (what) => `<div class="empty"><h1 class="title">Not found</h1><p>There is no ${esc(what)} in this reference. <a href="#/">Back to the overview</a></p></div>`;

  // ------------------------------------------------------------------------------------------------ the router
  async function route() {
    const raw = location.hash.replace(/^#/, "") || "/";
    const [pathPart, qs] = raw.split("?");
    const params = new URLSearchParams(qs || "");
    const seg = pathPart.split("/").filter(Boolean).map(decodeURIComponent);
    const main = $("#main");
    let html = "", after = null, nav = "home", title = "Developer Reference";
    try {
      if (!seg.length) { html = pageHome(); after = afterHome; }
      else if (seg[0] === "architecture") { html = pageArchitecture(); after = () => drawGraph($("#graph")); nav = "arch"; title = "Architecture"; }
      else if (seg[0] === "packages") { html = pagePackages(params); nav = "packages"; title = "Packages"; }
      else if (seg[0] === "p") { const pid = seg.slice(1).join("/"); html = pagePackage(pid); nav = "p:" + pid; title = pid; }
      else if (seg[0] === "f") { main.innerHTML = '<div class="empty">Loading…</div>'; const r = await pageFile(seg[1], seg[2]); if (typeof r === "string") html = r; else { html = r.html; after = r.after; } const f = BYHASH.get(seg[1]); nav = f ? "p:" + f.pkg : ""; title = f ? f.id : "File"; }
      else if (seg[0] === "routes") { html = pageRoutes(params); after = () => $("#rq")?.addEventListener("input", (e) => { const v = e.target.value; history.replaceState(null, "", "#/routes" + (v ? "?q=" + encodeURIComponent(v) : "")); route(); setTimeout(() => { const i = $("#rq"); i.focus(); i.setSelectionRange(v.length, v.length); }, 0); }); nav = "routes"; title = "HTTP API"; }
      else if (seg[0] === "db") { html = pageDb(params); after = () => $("#dq")?.addEventListener("input", (e) => { const v = e.target.value; history.replaceState(null, "", "#/db" + (v ? "?q=" + encodeURIComponent(v) : "")); route(); setTimeout(() => { const i = $("#dq"); i.focus(); i.setSelectionRange(v.length, v.length); }, 0); }); nav = "db"; title = "Database"; }
      else if (seg[0] === "switches") { html = pageSwitches(params); after = () => $("#sq")?.addEventListener("input", (e) => { const v = e.target.value; history.replaceState(null, "", "#/switches" + (v ? "?q=" + encodeURIComponent(v) : "")); route(); setTimeout(() => { const i = $("#sq"); i.focus(); i.setSelectionRange(v.length, v.length); }, 0); }); nav = "switches"; title = "Speed switches"; }
      else html = notFound("page");
    } catch (e) { html = `<div class="empty"><h1 class="title">Could not load this page</h1><p class="muted">${esc(e.message)}</p></div>`; }
    main.innerHTML = html;
    main.style.animation = "none"; void main.offsetWidth; main.style.animation = "";
    document.title = title + " · DSP Developer Reference";
    markNav(nav);
    if (!(seg[0] === "f" && seg[2])) window.scrollTo({ top: 0 });
    if (after) after();
  }

  // ------------------------------------------------------------------------------------------------ start
  async function start() {
    shell();
    try { IDX = await load("data/index.json"); } catch (e) { $("#main").innerHTML = `<div class="empty"><h1 class="title">The reference could not be loaded</h1><p class="muted">${esc(e.message)}. If you are not signed in to the intranet, sign in first and open this page again.</p></div>`; return; }
    for (const f of IDX.files) { FILES.set(f.id, f); BYHASH.set(f.h, f); }
    for (const p of IDX.packages) PKGS.set(p.id, p);
    SEARCH = IDX.search;
    for (const e of SEARCH) if (e[5] && e[1] !== "file" && e[1] !== "route" && e[1] !== "entity" && e[1] !== "switch") { if (!SYMS.has(e[0])) SYMS.set(e[0], []); SYMS.get(e[0]).push(e); }
    $("#buildpill").textContent = `${IDX.meta.commit || "build"} · ${new Date(IDX.meta.generated).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`;
    sidebar();
    paletteEvents();
    document.addEventListener("click", (e) => { const j = e.target.closest("[data-jump]"); if (j) { e.preventDefault(); jumpTo(j.dataset.jump); history.replaceState(null, "", location.hash.split("/").slice(0, 3).join("/")); } });
    addEventListener("hashchange", route);
    route();
  }
  start();
})();
