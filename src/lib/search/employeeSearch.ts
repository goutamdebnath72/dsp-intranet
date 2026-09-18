// src/lib/search/employeeSearch.ts
import { DataSource } from "typeorm";

export interface EmployeeResult {
  id: string;
  type: "employee";
  name: string;
  ticketNo: string;
  sailPNo: string | null;
  designation: string | null;
  department: string | null;
  // Masked by default; the reveal endpoint returns the full values + logs access.
  mobileMasked: string | null;
  emailMasked: string | null;
  hasMobile: boolean;
  hasEmail: boolean;
  isExecutive: boolean;
  matchKind: "id" | "name-exact" | "name-fuzzy" | "name-phonetic";
  score: number;
}

// ---- Masking helpers ---------------------------------------------------------
function maskMobile(m: string | null): string | null {
  if (!m) return null;
  const digits = m.replace(/\D/g, "");
  if (digits.length < 4) return "xxxx";
  // Keep the leading 6 (CUG prefix like 943479) visible, mask the rest.
  const head = digits.slice(0, 6);
  return `${head}${"x".repeat(Math.max(0, digits.length - 6))}`;
}
function maskEmail(e: string | null): string | null {
  if (!e) return null;
  const at = e.indexOf("@");
  if (at <= 0) return "xxxxxx";
  return `xxxxxx${e.slice(at)}`;
}

// ---- Query-shape detection ---------------------------------------------------
export type QueryShape =
  | { kind: "ticket"; value: string }
  | { kind: "mobile"; value: string }
  | { kind: "sailpno"; value: string }
  | { kind: "name"; value: string }
  | { kind: "none" };

export function detectShape(raw: string): QueryShape {
  const q = (raw || "").trim();
  if (q.length < 2) return { kind: "none" };
  if (/^\d{6}$/.test(q)) return { kind: "ticket", value: q };
  if (/^\d{10}$/.test(q)) return { kind: "mobile", value: q };
  if (/^[A-Za-z]\d{4,}$/.test(q)) return { kind: "sailpno", value: q };
  // any alphabetic / mixed text -> name
  if (/[A-Za-z\u0900-\u097F\u0980-\u09FF]/.test(q)) return { kind: "name", value: q };
  return { kind: "none" };
}

function rowToResult(r: any, matchKind: EmployeeResult["matchKind"], score: number): EmployeeResult {
  const ticket = (r.ticketNo || "").trim();
  return {
    id: r.id,
    type: "employee",
    name: r.name,
    ticketNo: ticket,
    sailPNo: r.sailPNo || null,
    designation: r.designation || null,
    department: r.dept_name || null,
    mobileMasked: maskMobile(r.contactNo || null),
    emailMasked: maskEmail(r.email || null),
    hasMobile: !!r.contactNo,
    hasEmail: !!r.email,
    isExecutive: /^4\d{5}$/.test(ticket),
    matchKind,
    score,
  };
}

const SELECT_COLS = `
  u.id, u.name, u."ticketNo" AS "ticketNo", u."sailPNo" AS "sailPNo",
  u.designation, u."contactNo" AS "contactNo", u.email,
  d.name AS dept_name
`;

/**
 * EXACT ID lookup (live as the user types). No fuzziness.
 */
export async function searchEmployeesById(
  ds: DataSource,
  shape: Extract<QueryShape, { kind: "ticket" | "mobile" | "sailpno" }>,
): Promise<EmployeeResult[]> {
  let where = "";
  const params: any[] = [];
  if (shape.kind === "ticket") {
    where = `u."ticketNo" = $1`;
    params.push(shape.value);
  } else if (shape.kind === "mobile") {
    where = `u."contactNo" = $1`;
    params.push(shape.value);
  } else {
    // SAIL PNO doubles as the login password (case-sensitive there), but for
    // FINDING a person we match case-insensitively — login is unaffected.
    where = `lower(u."sailPNo") = lower($1)`;
    params.push(shape.value);
  }
  const sql = `
    SELECT ${SELECT_COLS}
    FROM public."user" u
    LEFT JOIN public.departments d ON d.id = u."departmentId"
    WHERE ${where}
    LIMIT 10;
  `;
  const rows = await ds.query(sql, params);
  return rows.map((r: any) => rowToResult(r, "id", 100));
}

/**
 * NAME search (on Enter). Combines:
 *   - literal trigram similarity + ILIKE (typo / partial tolerance)
 *   - phonetic dmetaphone match, but ONLY on COMPLETE words
 *     (a word is "complete" if it is followed by a space or another word;
 *      the trailing partial word stays literal-only).
 *
 * Ranking: exact whole-name > starts-with > high trigram > phonetic.
 */
export async function searchEmployeesByName(
  ds: DataSource,
  raw: string,
): Promise<EmployeeResult[]> {
  const q = (raw || "").trim().replace(/\s+/g, " ");
  if (q.length < 2) return [];

  const like = `%${q}%`;

  // Positional phonetic match against the PRECOMPUTED name_phonetic codes:
  //   - multi-word query -> ordered subsequence (positions preserved, middle
  //     words skippable, NO swaps, NO single-word-only).
  //   - single-word query -> that one code appears anywhere in the name.
  //   - honorifics (MOHD, MR, DR, SHRI, ...) stripped inside the SQL function,
  //     mirroring nameHelper.ts COMMON_PREFIXES.
  // Literal trigram/ILIKE runs alongside and ranks on top.
  const sql = `
    SELECT ${SELECT_COLS},
      similarity(u.name, $1) AS sim,
      (u.name ILIKE $2) AS literal_hit,
      public.phonetic_subseq_match($1, u.name_phonetic) AS phon_match
    FROM public."user" u
    LEFT JOIN public.departments d ON d.id = u."departmentId"
    WHERE
      -- Name queries must be phonetically correct OR a genuine exact/near-exact
      -- literal hit. Loose trigram (letter-similar but different-sounding, e.g.
      -- ANAL/ANIK for "anoop") is intentionally excluded.
      public.phonetic_subseq_match($1, u.name_phonetic)
      OR u.name ILIKE $2
      OR similarity(u.name, $1) > 0.85
    ORDER BY
      (CASE WHEN lower(u.name) = lower($1) THEN 4
            WHEN lower(u.name) LIKE lower($1) || '%' THEN 3
            WHEN u.name ILIKE $2 THEN 2
            WHEN public.phonetic_subseq_match($1, u.name_phonetic) THEN 1
            ELSE 0 END) DESC,
      similarity(u.name, $1) DESC,
      u.name ASC
    LIMIT 20;
  `;

  const rows = await ds.query(sql, [q, like]);
  return rows.map((r: any) => {
    const sim = Number(r.sim) || 0;
    const literal = r.literal_hit === true;
    const phon = r.phon_match === true;
    let kind: EmployeeResult["matchKind"] = "name-fuzzy";
    if (literal && sim > 0.85) kind = "name-exact";
    else if (!literal && phon) kind = "name-phonetic";
    return rowToResult(r, kind, sim + (phon ? 0.5 : 0) + (literal ? 1 : 0));
  });
}
