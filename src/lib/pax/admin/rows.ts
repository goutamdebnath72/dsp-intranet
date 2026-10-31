// src/lib/pax/admin/rows.ts
//
// TypeORM hands back the rows of a SELECT or an INSERT ... RETURNING as they are, but for an UPDATE or a DELETE it returns [rows, affectedCount]
// (checked in the installed version 1.1.1: PostgresQueryRunner, `case "DELETE": case "UPDATE": result.raw = [raw.rows, raw.rowCount]`).
// The admin store reads rows; this puts every result in that one shape. PURE.

type Row = Record<string, unknown>;

export function rowsOf(res: unknown): Row[] {
  if (Array.isArray(res) && res.length === 2 && Array.isArray(res[0]) && typeof res[1] === "number") return res[0] as Row[];
  return Array.isArray(res) ? (res as Row[]) : [];
}
