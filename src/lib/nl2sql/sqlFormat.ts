// src/lib/nl2sql/sqlFormat.ts
//
// How the "SQL the model wrote" panel LOOKS. The model sometimes writes a long single line; this lays it out, one clause to a line, for reading:
//
//   SELECT ticket_no, name, department_code, department, checkup_date, circular
//   FROM nlq.health_checkups
//   WHERE ticket_no = '228757'
//     AND schedule_year = 2026
//   ORDER BY checkup_date
//
// DISPLAY ONLY: the SQL that is run, logged and stored is never touched. A text that already has line breaks (the model laid it out itself) is left as
// it is. Text inside quotes, and anything inside brackets (a function's arguments, a sub-query), is never split.

const CLAUSES = ["UNION ALL", "UNION", "FROM", "LEFT JOIN", "RIGHT JOIN", "FULL JOIN", "INNER JOIN", "CROSS JOIN", "JOIN", "WHERE", "GROUP BY", "HAVING", "ORDER BY", "LIMIT", "OFFSET"];
const isWordChar = (c: string | undefined) => !!c && /[A-Za-z0-9_]/.test(c);

function keywordAt(sql: string, i: number, words: string[]): string | null {
  if (isWordChar(sql[i - 1])) return null;
  for (const w of words) {
    if (sql.slice(i, i + w.length).toUpperCase() === w && !isWordChar(sql[i + w.length])) return w;
  }
  return null;
}

export function formatSqlForDisplay(sql: string): string {
  if (!sql || /\n/.test(sql.trim())) return sql; // empty, or already laid out
  const src = sql.trim().replace(/\s+/g, " ");
  let out = "";
  let depth = 0;
  let inQuote = false;
  let clause = "";
  let between = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuote) {
      out += c;
      if (c === "'") {
        if (src[i + 1] === "'") { out += "'"; i++; } else inQuote = false;
      }
      continue;
    }
    if (c === "'") { inQuote = true; out += c; continue; }
    if (c === "(") depth++;
    if (c === ")") depth = Math.max(0, depth - 1);
    if (depth === 0) {
      const kw = keywordAt(src, i, CLAUSES);
      if (kw && i > 0) {
        out = out.replace(/ +$/, "") + "\n" + kw;
        clause = kw;
        i += kw.length - 1;
        continue;
      }
      if (keywordAt(src, i, ["BETWEEN"])) between = true;
      const bo = keywordAt(src, i, ["AND", "OR"]);
      if (bo && (clause === "WHERE" || clause === "HAVING")) {
        if (bo === "AND" && between) between = false; // x BETWEEN 1 AND 5: this AND is part of the BETWEEN
        else {
          out = out.replace(/ +$/, "") + "\n  " + bo;
          i += bo.length - 1;
          continue;
        }
      }
    }
    out += c;
  }
  return out;
}
