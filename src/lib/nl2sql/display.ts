// src/lib/nl2sql/display.ts
//
// How an answer written by the language model is PRESENTED. Pure functions, no database, no React, safe to
// import from both the server (omnibar.ts) and the browser (AnswerResult.tsx).
//
// The model may suggest a presentation (a "display" hint next to its SQL):
//     {"view": "cards" | "table" | "bar", "title": "...", "columns": [{"key": "...", "label": "..."}],
//      "bar": {"label": "<text column>", "value": "<numeric column>"}}
// The model PROPOSES, this module VERIFIES against the real result and falls back to a layout chosen from
// the shape of the data. So a missing, malformed or wrong hint can never break an answer, and:
//
//   GUARANTEE: every column the SQL returned is shown, exactly once. A hint can reorder and retitle the
//   columns; it can never hide one.

import { alternativeMatches, canonicalTitle, compileAlternative, isDesignationColumn, isTicketColumn, originOfTicket, splitAlternatives, squash } from "./designationFilter";

export type ColumnKind = "number" | "percent" | "boolean" | "code" | "date" | "text";
export type ViewKind = "cards" | "table" | "bar";

export interface DisplayColumn {
  key: string;
  label: string;
  kind: ColumnKind;
}

export interface ResolvedDisplay {
  view: ViewKind;
  title: string | null;
  /** ALL result columns, in display order. */
  columns: DisplayColumn[];
  /** Set when a bar chart is possible (one text column + one numeric column, 2..40 rows). */
  bar: { label: string; value: string } | null;
}

type Row = Record<string, unknown>;

// ---- labels ------------------------------------------------------------------------------------------

const KNOWN_LABELS: Record<string, string> = {
  ticket_no: "Ticket no",
  sail_pno: "P.No",
  name: "Name",
  designation: "Designation",
  designation_code: "Desig. code",
  designation_track: "Track",
  department: "Department",
  department_code: "Dept code",
  department_id: "Dept id",
  cohort: "Cohort",
  discipline: "Discipline",
  rank_order: "Rank",
  grade_id: "Grade id",
  global_seniority_rank: "Seniority rank",
  within_grade_position: "Position in grade",
  has_mobile: "Has mobile",
  has_email: "Has email",
  has_email_nic: "Has NIC email",
  has_webmail: "Has webmail",
  has_address: "Has address",
  n: "Count",
  cnt: "Count",
  count: "Count",
  total: "Total",
};

/** A readable column title: a known title, else the column name with spaces and a capital. */
export function defaultLabel(key: string): string {
  const k = String(key).trim();
  const known = KNOWN_LABELS[k.toLowerCase()];
  if (known) return known;
  const spaced = k.replace(/_+/g, " ").replace(/\s+/g, " ").trim();
  if (!spaced) return "Column";
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Plain text only: no control characters, collapsed spaces, capped. (The page also escapes everything.) */
export function cleanText(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  // eslint-disable-next-line no-control-regex
  return v.replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

// ---- column kinds --------------------------------------------------------------------------------------

const NUMERIC_STRING = /^-?\d+(\.\d+)?$/;
const CODE_NAME = /(^id$|_id$|_code$|_no$|^ticket|pno$)/i;
// A numeric column named percent / percentage / pct (e.g. percent_of_garage, pct_of_total) is shown with a % sign.
const PERCENT_NAME = /(^|_)(percent|percentage|pct)(_|$)/i;

function isNumberLike(v: unknown): boolean {
  return (typeof v === "number" && Number.isFinite(v)) || (typeof v === "string" && NUMERIC_STRING.test(v.trim()));
}

export function columnKind(key: string, rows: Row[]): ColumnKind {
  if (CODE_NAME.test(key)) return "code";
  const vals = rows.map((r) => r?.[key]).filter((v) => v !== null && v !== undefined);
  if (vals.length === 0) return "text";
  if (vals.every((v) => typeof v === "boolean")) return "boolean";
  if (vals.every(isNumberLike)) return PERCENT_NAME.test(key) ? "percent" : "number";
  if (vals.every((v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/.test(v)) || v instanceof Date)) return "date";
  return "text";
}

// ---- resolving a display -----------------------------------------------------------------------------

function pickView(v: unknown): ViewKind | null {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  if (s === "cards" || s === "list" || s === "people") return "cards";
  if (s === "table") return "table";
  if (s === "bar" || s === "chart" || s === "bars") return "bar";
  return null;
}

function findColumn(name: unknown, columns: string[]): string | null {
  if (typeof name !== "string") return null;
  const n = name.trim().toLowerCase();
  if (!n) return null;
  return columns.find((c) => c.toLowerCase() === n) ?? null;
}

/** A bar chart needs a text column and a numeric column, and 2..40 rows. */
function validBar(label: string | null, value: string | null, columns: DisplayColumn[], rows: Row[]) {
  if (!label || !value || label === value) return null;
  if (rows.length < 2 || rows.length > 40) return null;
  const vk = columns.find((c) => c.key === value)?.kind;
  const lk = columns.find((c) => c.key === label)?.kind;
  if ((vk !== "number" && vk !== "percent") || !lk || lk === "boolean") return null;
  if (!rows.every((r) => r[value] === null || r[value] === undefined || isNumberLike(r[value]))) return null;
  return { label, value };
}

/**
 * Decide how to present a result. `hint` is whatever the model sent (anything at all, even garbage).
 * Returns null for a single plain number (the page shows that as the large figure, no table needed).
 */
export function resolveDisplay(
  hint: unknown,
  columnNames: string[],
  rows: Row[],
  hasPeople: boolean,
  opts: { tableRequested?: boolean } = {},
): ResolvedDisplay | null {
  try {
    if (!Array.isArray(columnNames) || columnNames.length === 0) return null;
    const safeRows = Array.isArray(rows) ? rows : [];
    if (safeRows.length === 1 && columnNames.length === 1 && isNumberLike(safeRows[0]?.[columnNames[0]])) return null;

    const h: any = hint && typeof hint === "object" && !Array.isArray(hint) ? hint : {};
    const kinds = new Map(columnNames.map((c) => [c, columnKind(c, safeRows)] as const));

    // columns: the hint's order and titles for real columns first, then every remaining column
    const order: { key: string; label: string }[] = [];
    const used = new Set<string>();
    const hinted: unknown[] = Array.isArray(h.columns) ? h.columns.slice(0, 40) : [];
    for (const entry of hinted) {
      const rawKey = typeof entry === "string" ? entry : (entry as any)?.key;
      const key = findColumn(rawKey, columnNames);
      if (!key || used.has(key)) continue;
      const label = cleanText(typeof entry === "object" ? (entry as any)?.label : "", 40) || defaultLabel(key);
      order.push({ key, label });
      used.add(key);
    }
    for (const key of columnNames) if (!used.has(key)) order.push({ key, label: defaultLabel(key) });
    const columns: DisplayColumn[] = order.map((o) => ({ key: o.key, label: o.label, kind: kinds.get(o.key) ?? "text" }));

    // a bar chart: from the hint when valid, else detected when the result is exactly one text + one numeric column
    const hb = h.bar && typeof h.bar === "object" ? h.bar : {};
    let bar = validBar(findColumn(hb.label ?? hb.x, columnNames), findColumn(hb.value ?? hb.y, columnNames), columns, safeRows);
    if (!bar && columnNames.length === 2 && safeRows.length >= 2 && safeRows.length <= 30) {
      const isNum = (k: ColumnKind) => k === "number" || k === "percent";
      const num = columns.find((c) => isNum(c.kind));
      const txt = columns.find((c) => !isNum(c.kind) && c.kind !== "boolean");
      if (num && txt) bar = validBar(txt.key, num.key, columns, safeRows);
    }

    // the view: the model's choice when it is possible, else chosen from the shape of the data
    // A list of PEOPLE always opens on the person cards (they carry the most: P.No, department, contact buttons, and
    // every extra column as a labelled chip); the table is one click away. Only a person who literally asked for a
    // table gets the table first.
    let view: ViewKind | null = pickView(h.view);
    if (hasPeople) {
      view = opts.tableRequested ? "table" : "cards";
    } else {
      if (view === "cards") view = null;
      if (view === "bar" && !bar) view = null;
      if (!view) view = bar ? "bar" : "table";
    }

    const title = cleanText(h.title, 80) || null;
    return { view, title, columns, bar };
  } catch {
    // never let a presentation problem break an answer: a plain table of everything
    const cols = Array.isArray(columnNames) ? columnNames : [];
    return cols.length ? { view: "table", title: null, columns: cols.map((c) => ({ key: c, label: defaultLabel(c), kind: "text" as ColumnKind })), bar: null } : null;
  }
}

// ---- grouping a list of people under department headings ---------------------------------------------

export interface DepartmentGroup<T> {
  label: string;
  code: string | null;
  people: T[];
}

/**
 * When a list of people falls into a few CONSECUTIVE department blocks (executives first under one code, then the
 * sections), return those blocks so the page can show one heading per block instead of repeating the department on
 * every card. Order is never changed. Returns null when grouping would not help: fewer than 4 people, someone with no
 * department, more than 6 blocks, or blocks averaging fewer than 2 people.
 */
export function departmentGroups<T extends { department?: string | null; departmentCode?: string | null }>(people: T[]): DepartmentGroup<T>[] | null {
  if (!Array.isArray(people) || people.length < 4) return null;
  const runs: DepartmentGroup<T>[] = [];
  for (const p of people) {
    const dept = String(p?.department ?? "").trim();
    if (!dept) return null;
    const code = p.departmentCode ?? null;
    const last = runs[runs.length - 1];
    if (last && last.label === dept && last.code === code) last.people.push(p);
    else runs.push({ label: dept, code, people: [p] });
  }
  if (runs.length > 6 || people.length / runs.length < 2) return null;
  return runs;
}

// ---- cells ------------------------------------------------------------------------------------------

export function formatCell(value: unknown, kind: ColumnKind): string {
  if (value === null || value === undefined || value === "") return "\u2014";
  // a list in one cell (array_agg of names) reads "A, B, C" -- the default String() gives "A,B,C" with no space
  if (Array.isArray(value)) return value.length ? value.map((v) => String(v)).join(", ") : "\u2014";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (kind === "number" && isNumberLike(value)) {
    const n = Number(value);
    return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  }
  if (kind === "percent" && isNumberLike(value)) {
    return `${Number(value).toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;
  }
  if (kind === "date") {
    const d = value instanceof Date ? value : new Date(String(value));
    if (!Number.isNaN(d.getTime())) {
      const dateOnly = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
      return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", ...(dateOnly ? { timeZone: "UTC" } : {}) });
    }
  }
  return String(value);
}

// ---- "Show more" ---------------------------------------------------------------------------------------

export function pageProgress(shown: number, total: number, pageSize = 100): { remaining: number; label: string; progress: string } {
  const remaining = Math.max(0, total - shown);
  const label = remaining <= pageSize ? `Show the last ${remaining.toLocaleString()}` : `Show ${pageSize.toLocaleString()} more`;
  return { remaining, label, progress: `${shown.toLocaleString()} of ${total.toLocaleString()} shown` };
}

/** The table with one more page of rows appended (the original is not changed). */
export function mergePage<T extends { rows: Row[]; total: number; truncated: boolean }>(table: T, page: { rows: Row[]; total?: number; hasMore: boolean }): T {
  return { ...table, rows: [...table.rows, ...page.rows], total: typeof page.total === "number" ? page.total : table.total, truncated: page.hasMore };
}

// ---- table behaviour (pure, so it can be tested) -------------------------------------------------------

export function sortRows(rows: Row[], key: string, kind: ColumnKind, dir: "asc" | "desc"): Row[] {
  const sign = dir === "asc" ? 1 : -1;
  const isNum = kind === "number" || kind === "percent";
  return rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => {
      const va = a.r[key];
      const vb = b.r[key];
      const na = va === null || va === undefined || va === "";
      const nb = vb === null || vb === undefined || vb === "";
      if (na || nb) return na && nb ? a.i - b.i : na ? 1 : -1; // empty cells always last
      const c = isNum ? Number(va) - Number(vb) : String(va).localeCompare(String(vb), undefined, { numeric: true, sensitivity: "base" });
      return c !== 0 ? sign * c : a.i - b.i;
    })
    .map((x) => x.r);
}

/**
 * The filter box above a list. Several things can be asked at once, separated by a comma (or ; | or the word "or"): "gm, dgm, agm". Each one is either
 *   - a DESIGNATION (in any case, with or without dots: gm, dgm, agm, ed, dic, Dy. general manager, asst.general manager, sr mgr ...): the rows with exactly
 *     that designation, however it is spelled in the list; or
 *   - text, found anywhere in the row as before (a name, a ticket, a department, a code); dots and spaces do not matter ("asst.general" finds "Asst. General").
 * A designation and a word can be combined ("roy gm"). See designationFilter.ts for the rules.
 */
export function filterRows(rows: Row[], columns: DisplayColumn[], query: string): Row[] {
  const alternatives = splitAlternatives(query);
  if (alternatives.length === 0) return rows;
  const designationColumn = columns.find(isDesignationColumn);
  const ticketColumn = columns.find(isTicketColumn);
  const prepared = rows.map((r) => {
    const cells = columns.map((c) => formatCell(r[c.key], c.kind));
    return {
      row: r,
      lower: cells.map((s) => s.toLowerCase()).join(" | "),
      squashed: cells.map(squash).join(" "),
      title: designationColumn ? canonicalTitle(formatCell(r[designationColumn.key], designationColumn.kind)) : "",
      origin: ticketColumn ? originOfTicket(formatCell(r[ticketColumn.key], ticketColumn.kind)) : ("" as const),
    };
  });
  const known = new Set(prepared.map((p) => p.title).filter(Boolean));
  const compiled = alternatives.map((a) => compileAlternative(a, known, { designations: designationColumn !== undefined, origins: ticketColumn !== undefined }));
  return prepared.filter((p) => compiled.some((c) => alternativeMatches(c, p))).map((p) => p.row);
}

// ---- export ----------------------------------------------------------------------------------------

function csvCell(value: unknown, kind: ColumnKind): string {
  let s = value === null || value === undefined ? "" : typeof value === "boolean" ? (value ? "Yes" : "No") : Array.isArray(value) ? value.map((v) => String(v)).join(", ") : String(value);
  // a spreadsheet would run a cell that starts with = + - @ as a formula: neutralise text cells (never plain numbers)
  if (kind !== "number" && kind !== "percent" && /^[=+\-@\t\r]/.test(s) && !NUMERIC_STRING.test(s.trim())) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(columns: DisplayColumn[], rows: Row[]): string {
  // Numbers stay raw in the file (a spreadsheet can use them); a percentage column says so in its heading.
  const head = columns
    .map((c) => csvCell(c.kind === "percent" && !/%|percent/i.test(c.label) ? `${c.label} (%)` : c.label, "text"))
    .join(",");
  const body = rows.map((r) => columns.map((c) => csvCell(r[c.key], c.kind)).join(","));
  return "\ufeff" + [head, ...body].join("\r\n");
}

export function toTsv(columns: DisplayColumn[], rows: Row[]): string {
  const cell = (v: string) => v.replace(/[\t\r\n]+/g, " ");
  return [columns.map((c) => cell(c.label)).join("\t"), ...rows.map((r) => columns.map((c) => cell(formatCell(r[c.key], c.kind))).join("\t"))].join("\n");
}

// ---- honest row counts and export labels ------------------------------------------------------------
// A long list is loaded 100 rows at a time. The header and the Copy / CSV buttons must say how much they cover, so nobody
// takes the first 100 rows of 259 for the whole list.

const fmt = (n: number) => n.toLocaleString("en-US");

/** "2 rows" / "12 of 100 rows" / "100 loaded rows (259 in all)" / "12 of 100 loaded rows (259 in all)". */
export function rowCountLabel(shown: number, loaded: number, total: number, truncated: boolean): string {
  if (!truncated || total <= loaded) return shown === loaded ? `${fmt(shown)} ${shown === 1 ? "row" : "rows"}` : `${fmt(shown)} of ${fmt(loaded)} rows`;
  return `${shown === loaded ? fmt(loaded) : `${fmt(shown)} of ${fmt(loaded)}`} loaded rows (${fmt(total)} in all)`;
}

/** What Copy and CSV cover: a visible suffix like " (100 of 259)" and a tooltip, only when the list is not fully loaded. */
export function exportNote(shown: number, total: number, truncated: boolean): { suffix: string; title: string } {
  if (!truncated || total <= shown) return { suffix: "", title: "" };
  return {
    suffix: ` (${fmt(shown)} of ${fmt(total)})`,
    title: `Only the ${fmt(shown)} rows shown so far, not all ${fmt(total)}. Use "Show more" first to include the rest.`,
  };
}

/**
 * The big number and "N rows." at the top of a table answer say how many rows there are. For ONE row (a lookup of one person or one ticket) that is
 * noise: the table already shows it. Only that case is hidden: a count answer ("how many ...", a single number) and any list of 2 or more keep theirs.
 */
export function isSingleRowTable(kind: string | undefined, count: number | undefined, hasTable: boolean): boolean {
  return kind === "total" && count === 1 && hasTable;
}
