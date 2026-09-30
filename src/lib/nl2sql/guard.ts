// src/lib/nl2sql/guard.ts
//
// SECOND line of defence for LLM-written SQL (the FIRST is the database
// itself: a read-only transaction, a role that can only SELECT from three
// views, and a statement timeout -- see executor.ts and sql/01_*.sql).
//
// This guard parses the SQL with a real PostgreSQL parser and walks the whole
// syntax tree. It accepts ONE read-only statement that touches only the
// approved views and calls only approved functions. Anything it cannot parse
// or cannot positively approve is rejected: the model is then told why and
// gets to try again (see generator.ts), so a too-strict rejection costs one
// retry, while a too-lenient one could cost real damage. Strict wins.

import { parse } from "pgsql-ast-parser";

export type GuardResult = { ok: true; sql: string } | { ok: false; reason: string };

/** The only relations the model may read. */
export const ALLOWED_RELATIONS = new Set(["employees", "designations", "departments"]);
export const ALLOWED_SCHEMA = "nlq";

/** Our own helper functions, callable as nlq.<name>. */
export const NLQ_FUNCTIONS = new Set(["code", "norm", "word_like", "first_word_like", "last_word_like"]);

/** Built-in functions the model may call. Deliberately a short allow-list:
 *  no pg_sleep, set_config, pg_read_file, nextval, dblink, lo_*, etc. */
export const ALLOWED_FUNCTIONS = new Set([
  // array quantifiers (the parser represents `x = ANY(arr)` as a call)
  "any", "all", "some", "exists",
  // aggregates
  "count", "sum", "avg", "min", "max", "array_agg", "string_agg", "bool_and", "bool_or", "every",
  // numeric
  "round", "ceil", "ceiling", "floor", "abs", "greatest", "least", "coalesce", "nullif",
  // text
  "upper", "lower", "initcap", "btrim", "ltrim", "rtrim", "trim", "length", "char_length",
  "position", "strpos", "substring", "substr", "left", "right", "replace", "translate",
  "split_part", "concat", "concat_ws", "regexp_replace", "regexp_split_to_array",
  "regexp_split_to_table", "regexp_match", "regexp_matches", "similarity",
  // arrays
  "array_length", "cardinality", "array_position", "array_positions", "array_to_string",
  "array_cat", "array_remove", "unnest",
  // window
  "row_number", "rank", "dense_rank", "ntile", "lag", "lead", "first_value", "last_value",
  "nth_value", "percent_rank", "cume_dist",
  // misc
  "to_char", "date_trunc", "extract", "date_part", "now",
]);

const MAX_SQL_CHARS = 8000;

/** Remove '...' string literals and "..." quoted identifiers so structural
 *  checks (comments, semicolons) don't trip over their contents. */
export function stripLiterals(sql: string): string {
  return sql.replace(/'(?:[^']|'')*'/g, "''").replace(/"(?:[^"]|"")*"/g, '""');
}

const STATEMENT_TYPES = new Set(["select", "with", "union", "union all", "values"]);
const FORBIDDEN_NODE_TYPES = new Set(["insert", "update", "delete"]);

export function guardSql(rawSql: string): GuardResult {
  let sql = (rawSql || "").trim();
  if (!sql) return { ok: false, reason: "The SQL is empty." };
  if (sql.length > MAX_SQL_CHARS) return { ok: false, reason: `The SQL is too long (over ${MAX_SQL_CHARS} characters).` };
  sql = sql.replace(/;+\s*$/, "").trim();

  const bare = stripLiterals(sql);
  if (bare.includes("--") || bare.includes("/*") || bare.includes("*/")) {
    return { ok: false, reason: "SQL comments are not allowed. Remove them." };
  }
  if (bare.includes(";")) {
    return { ok: false, reason: "Only a single SQL statement is allowed (found a semicolon)." };
  }

  let statements: any[];
  try {
    statements = parse(sql) as any[];
  } catch (e: any) {
    const first = String(e?.message || e).split("\n")[0].slice(0, 200);
    return {
      ok: false,
      reason: `The SQL could not be parsed (${first}). Rewrite it in plain PostgreSQL WITHOUT: array slices like a[2:5], SELECT INTO, IS [NOT] DISTINCT FROM, SIMILAR TO, EXCEPT, INTERSECT, or trim(both ... from ...).`,
    };
  }
  if (statements.length !== 1) return { ok: false, reason: "Exactly one SQL statement is required." };

  // Names of CTEs defined anywhere in the statement -- legal table references.
  const cteNames = new Set<string>();
  const problems: string[] = [];

  const checkStatement = (st: any) => {
    if (!st || typeof st.type !== "string" || !STATEMENT_TYPES.has(st.type)) {
      problems.push(`Only SELECT statements are allowed (found "${st?.type ?? "unknown"}").`);
      return;
    }
    if (st.type === "with") {
      for (const b of st.bind || []) {
        if (b?.alias?.name) cteNames.add(String(b.alias.name).toLowerCase());
        checkStatement(b.statement);
      }
      checkStatement(st.in);
    }
  };
  checkStatement(statements[0]);

  const walk = (node: any) => {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (!node || typeof node !== "object") return;

    const t = node.type;
    if (typeof t === "string") {
      if (FORBIDDEN_NODE_TYPES.has(t)) problems.push(`Data-changing statements are not allowed ("${t}").`);

      if (t === "select" && node.for) problems.push("Locking clauses (FOR UPDATE / FOR SHARE) are not allowed.");

      if (t === "table") {
        const nm = node.name;
        const rel = String(nm?.name ?? "").toLowerCase();
        const schema = nm?.schema ? String(nm.schema).toLowerCase() : null;
        if (schema) {
          if (schema !== ALLOWED_SCHEMA || !ALLOWED_RELATIONS.has(rel)) {
            problems.push(`Table "${schema}.${rel}" is not available. Use only nlq.employees, nlq.designations, nlq.departments.`);
          }
        } else if (!ALLOWED_RELATIONS.has(rel) && !cteNames.has(rel)) {
          problems.push(`Table "${rel}" is not available. Use only nlq.employees, nlq.designations, nlq.departments.`);
        }
      }

      if (t === "call") {
        const fn = node.function;
        const name = String(fn?.name ?? "").toLowerCase();
        const schema = fn?.schema ? String(fn.schema).toLowerCase() : null;
        if (schema) {
          if (schema !== ALLOWED_SCHEMA || !NLQ_FUNCTIONS.has(name)) {
            problems.push(`Function "${schema}.${name}" is not allowed.`);
          }
        } else if (!ALLOWED_FUNCTIONS.has(name)) {
          problems.push(`Function "${name}" is not allowed.`);
        }
      }

      if (t === "cast") {
        const to = String(node.to?.name ?? "").toLowerCase();
        if (to.startsWith("reg")) problems.push(`Casting to "${to}" is not allowed.`);
      }
    }

    for (const k of Object.keys(node)) {
      if (k === "_location") continue;
      walk(node[k]);
    }
  };
  walk(statements[0]);

  if (problems.length) return { ok: false, reason: Array.from(new Set(problems)).join(" ") };
  return { ok: true, sql };
}
