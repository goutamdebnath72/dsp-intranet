// src/lib/nl2sql/eval/golden.ts
//
// The measuring stick. Each case is ONE meaning asked in SEVERAL different
// wordings (the whole point of this experiment is wording it has never seen),
// plus a hand-written REFERENCE SQL that defines the correct answer. A wording
// passes when the SQL the model writes returns the same rows as the reference,
// computed on the same database -- so the suite needs no hard-coded numbers and
// works on your real data as well as the test data.

export type GoldenKind = "set" | "ordered" | "scalar" | "table" | "unanswerable";

export interface GoldenCase {
  id: string;
  kind: GoldenKind;
  variants: string[];
  /** Reference SQL (null for cases that must be declared unanswerable). */
  reference: string | null;
  note?: string;
}

const P = "ticket_no, name, designation, department";
const CIT = "(SELECT id FROM nlq.departments WHERE code IN (98500, 98530, 98540))";
const GARAGE = "(SELECT id FROM nlq.departments WHERE code IN (85000, 85070, 85110, 85200, 85330, 85430))";

export const GOLDEN: GoldenCase[] = [
  {
    id: "kumar_middle_similar",
    kind: "set",
    variants: [
      "find the names of employees which have kumar at the middle",
      "list everyone who has kumar as a middle name",
      "employees where kumar is neither the first nor the last word of the name",
      "show people with kumar in the middle of their name",
      "kumar between the first name and the surname",
    ],
    reference: `SELECT ${P} FROM nlq.employees
      WHERE nlq.word_like(name_words, name_codes, 'kumar')
        AND NOT nlq.first_word_like(name_words, name_codes, 'kumar')
        AND NOT nlq.last_word_like(name_words, name_codes, 'kumar')
      ORDER BY global_seniority_rank`,
  },
  {
    id: "kumar_middle_exact",
    kind: "set",
    variants: [
      'find the names of employees which have "kumar" at the middle',
      'list employees with "Kumar" as a middle word',
      'names where "kumar" is neither first nor last',
    ],
    reference: `SELECT ${P} FROM nlq.employees
      WHERE 'KUMAR' = ANY(name_words) AND name_words[1] <> 'KUMAR' AND name_words[cardinality(name_words)] <> 'KUMAR'
      ORDER BY global_seniority_rank`,
  },
  {
    id: "debnath_exact_last",
    kind: "set",
    variants: [
      'find the names which end with "debnath"',
      'employees whose surname is exactly "Debnath"',
      'list people whose last word is "debnath"',
    ],
    reference: `SELECT ${P} FROM nlq.employees WHERE name_words[cardinality(name_words)] = 'DEBNATH' ORDER BY global_seniority_rank`,
  },
  {
    id: "nath_exact_last",
    kind: "set",
    variants: [
      'find the names which end with "nath"',
      'employees whose surname is exactly "NATH"',
      'list people whose last word is "nath"',
    ],
    reference: `SELECT ${P} FROM nlq.employees WHERE name_words[cardinality(name_words)] = 'NATH' ORDER BY global_seniority_rank`,
  },
  {
    id: "debnath_not_nath",
    kind: "set",
    note: "Two similar names set against each other: both must become exact.",
    variants: [
      "find the names which ends with debnath but not nath as a word",
      "surname debnath but nobody who has nath as a word",
      "debnath as the last word, exclude names containing the word nath",
      'last word "debnath" but without "nath" anywhere',
    ],
    reference: `SELECT ${P} FROM nlq.employees
      WHERE name_words[cardinality(name_words)] = 'DEBNATH' AND NOT ('NATH' = ANY(name_words))
      ORDER BY global_seniority_rank`,
  },
  {
    id: "debnath_similar_last",
    kind: "set",
    note: "Unquoted, uncontrasted: similar spellings (Nath as a surname) are included by design.",
    variants: [
      "find the names which ends with debnath",
      "list employees with surname debnath",
      "who has debnath as last name",
    ],
    reference: `SELECT ${P} FROM nlq.employees WHERE nlq.last_word_like(name_words, name_codes, 'debnath') ORDER BY global_seniority_rank`,
  },
  {
    id: "contains_nath_not_at_end",
    kind: "set",
    variants: [
      'find the names of employees which contains "nath" but not at the end',
      'find the names of employees which contains "nath" but not at the end as a whole word or part of a word',
      'find the names of employees which contains "nath" but not at the end either as a whole word or as a part of a word',
      "names that have nath somewhere but the name does not end with nath",
    ],
    reference: `SELECT ${P} FROM nlq.employees
      WHERE upper(name) LIKE '%NATH%' AND NOT (upper(btrim(name)) LIKE '%NATH')
      ORDER BY global_seniority_rank`,
  },
  {
    id: "gm_cit_nath",
    kind: "set",
    note: "The designation must NOT be dropped when a name condition is present.",
    variants: [
      "GMs in C&IT whose name ends with nath",
      "general managers of C&IT with surname nath",
      "list GM in c and it whose last name is nath",
      "which General Managers in the computer and IT department have a name ending in nath",
    ],
    reference: `SELECT ${P} FROM nlq.employees
      WHERE designation = 'General Manager' AND department_id IN ${CIT}
        AND nlq.last_word_like(name_words, name_codes, 'nath')
      ORDER BY global_seniority_rank`,
  },
  {
    id: "count_exec_cit",
    kind: "scalar",
    variants: ["how many executives are there in C&IT", "number of executives in c and it", "count of officers in the C&IT department"],
    reference: `SELECT count(*) AS count FROM nlq.employees WHERE cohort = 'executive' AND department_id IN ${CIT}`,
  },
  {
    id: "count_nonexec_garage",
    kind: "scalar",
    variants: ["how many non executives are in plant garage", "number of staff in the garage", "count of non-ex employees in plant garage"],
    reference: `SELECT count(*) AS count FROM nlq.employees WHERE cohort = 'nonexecutive' AND department_id IN ${GARAGE}`,
  },
  {
    id: "top10_nonexec",
    kind: "ordered",
    variants: ["who are the 10 most senior non executives", "top 10 senior staff", "list the ten most senior non-executive employees"],
    reference: `SELECT ${P} FROM nlq.employees WHERE cohort = 'nonexecutive' ORDER BY global_seniority_rank LIMIT 10`,
  },
  {
    id: "exec_without_nic",
    kind: "scalar",
    variants: ["how many executives have no NIC email", "number of executives without a sail.in email", "count executives lacking NIC mail"],
    reference: `SELECT count(*) AS count FROM nlq.employees WHERE cohort = 'executive' AND NOT has_email_nic`,
  },
  {
    id: "garage_breakdown",
    kind: "table",
    variants: ["designation wise count of employees in plant garage", "breakdown of plant garage employees by designation", "how many people of each designation work in the garage"],
    reference: `SELECT designation, count(*) AS count FROM nlq.employees WHERE department_id IN ${GARAGE}
      GROUP BY designation, rank_order ORDER BY rank_order, designation`,
  },
  {
    id: "arup_roy_similar",
    kind: "set",
    note: "Roy = Ray (same name) but Rai is a different surname.",
    variants: ["employees named arup roy", "find arup roy", "list people called Arup Roy"],
    reference: `SELECT ${P} FROM nlq.employees
      WHERE nlq.first_word_like(name_words, name_codes, 'arup') AND nlq.last_word_like(name_words, name_codes, 'roy')
      ORDER BY global_seniority_rank`,
  },
  {
    id: "starts_with_text",
    kind: "set",
    variants: ["names starting with sanj", "list employees whose name begins with SANJ", "find names that start with the letters sanj"],
    reference: `SELECT ${P} FROM nlq.employees WHERE upper(btrim(name)) LIKE 'SANJ%' ORDER BY global_seniority_rank`,
  },
  {
    id: "three_word_names",
    kind: "set",
    variants: ["employees whose name has exactly 3 words", "list people with three words in their name", "names made of exactly three words"],
    reference: `SELECT ${P} FROM nlq.employees WHERE cardinality(name_words) = 3 ORDER BY global_seniority_rank`,
  },
  {
    id: "senior_to",
    kind: "set",
    variants: ["who is senior to sanjay debnath", "list everyone more senior than Sanjay Debnath", "employees ranked above sanjay debnath"],
    reference: `SELECT ${P} FROM nlq.employees
      WHERE global_seniority_rank < (SELECT global_seniority_rank FROM nlq.employees WHERE name_words = ARRAY['SANJAY','DEBNATH'] LIMIT 1)
      ORDER BY global_seniority_rank`,
  },
  {
    id: "count_blast_furnace",
    kind: "scalar",
    variants: ["how many employees in blast furnace operation", "number of people working in BLAST FURNACE (OPERATION)", "headcount of blast furnace operation"],
    reference: `SELECT count(*) AS count FROM nlq.employees
      WHERE department_id IN (SELECT id FROM nlq.departments WHERE nlq.norm(name) LIKE '%blast furnace%operation%')`,
  },
  {
    id: "unanswerable_salary",
    kind: "unanswerable",
    variants: ["what is the salary of sanjay debnath", "how much does Bimal Debnath earn", "show pay scale of all general managers"],
    reference: null,
  },
  {
    id: "unanswerable_phone",
    kind: "unanswerable",
    variants: ["show the mobile numbers of all general managers", "give me the phone number of sanjay debnath", "what is the home address of arup roy"],
    reference: null,
  },
];

// --------------------------------------------------------------------------
// Result comparison
// --------------------------------------------------------------------------

type Row = Record<string, unknown>;

/** The column both results share that identifies a person. */
function pickKey(e: Row[], a: Row[]): string | null {
  const has = (rows: Row[], c: string) => !rows.length || c in rows[0];
  for (const c of ["ticket_no", "name"]) if (has(e, c) && has(a, c)) return c;
  return null;
}

const cellStr = (v: unknown) => (v === null || v === undefined ? "" : typeof v === "number" ? String(v) : String(v).trim());

export interface Comparison {
  pass: boolean;
  detail: string;
}

export function compareResults(kind: GoldenKind, expected: Row[], actual: Row[]): Comparison {
  if (kind === "scalar") {
    const e = Number(Object.values(expected[0] ?? {})[0]);
    const a = Number(Object.values(actual[0] ?? {})[0]);
    return e === a ? { pass: true, detail: `count ${e}` } : { pass: false, detail: `expected ${e}, got ${Number.isNaN(a) ? "no number" : a}` };
  }
  if (kind === "table") {
    const norm = (rows: Row[]) => rows.map((r) => Object.values(r).map(cellStr).join("|")).sort();
    const e = norm(expected);
    const a = norm(actual);
    const same = e.length === a.length && e.every((x, i) => x === a[i]);
    return same ? { pass: true, detail: `${e.length} rows` } : { pass: false, detail: `expected ${e.length} rows, got ${a.length}; first difference: ${e.find((x, i) => x !== a[i]) ?? "(row count)"}` };
  }
  const col = pickKey(expected, actual);
  if (col === null) return { pass: false, detail: "result has neither ticket_no nor name to compare with the reference" };
  const ek = expected.map((r) => String(r[col]));
  const ak = actual.map((r) => String(r[col]));
  if (kind === "ordered") {
    const same = ek.length === ak.length && ek.every((x, i) => x === ak[i]);
    return same ? { pass: true, detail: `${ek.length} rows in order` } : { pass: false, detail: `expected ${ek.length} rows in order, got ${ak.length}` };
  }
  // set
  const E = new Set(ek);
  const A = new Set(ak);
  const missing = ek.filter((x) => !A.has(x));
  const extra = ak.filter((x) => !E.has(x));
  if (!missing.length && !extra.length && ek.length === ak.length) return { pass: true, detail: `${ek.length} rows` };
  return { pass: false, detail: `expected ${ek.length} rows, got ${ak.length} (${missing.length} missing, ${extra.length} extra)` };
}
