"use client";

// src/components/Nl2SqlAnswerExtras.tsx
//
// Pieces shown with an employee answer that was written by the language model (payload.nl2sql):
//   * Departments covered -- which departments the answer's filter really matched, computed by the
//     server from the SQL itself (not written by the model), so scope can be seen at a glance.
//   * The SQL the model wrote, collapsed, so any reader can check it.
//   * (The Yes / No for the answer now lives in the omnibar footer, AnswerFeedback.tsx, for every kind of answer.)
//   * Nl2SqlTable -- a plain table for breakdowns and other non-list answers.

import type { Nl2SqlExtras, Nl2SqlTable as TableData } from "@/lib/nl2sql/clientTypes";

// Same name appearing twice means two department records with different codes; show it once with a count.
function groupNames(names: string[]): string[] {
  const counts = new Map<string, number>();
  for (const n of names) counts.set(n, (counts.get(n) ?? 0) + 1);
  return Array.from(counts, ([n, c]) => (c > 1 ? `${n} ×${c}` : n));
}

export function Nl2SqlAnswerExtras({ nl2sql }: { nl2sql: Nl2SqlExtras }) {
  const scope = nl2sql.scope;
  const names = scope ? groupNames(scope.departments) : [];
  const SHOW = 6;

  return (
    <div className="mt-1.5">
      {scope && scope.total > 0 && (
        <p className="text-xs leading-snug text-slate-600">
          <span className="font-semibold">Departments covered ({scope.total}):</span>{" "}
          {names.slice(0, SHOW).join(", ")}
          {names.length > SHOW && (
            <details className="inline">
              <summary className="ml-1 inline cursor-pointer text-blue-700">… and {names.length - SHOW} more</summary>
              <span>{names.slice(SHOW).join(", ")}</span>
            </details>
          )}
        </p>
      )}
      {nl2sql.verifiedBy ? (
        <p className="mt-1 text-xs font-medium text-emerald-700">
          ✓ Verified answer — confirmed by {nl2sql.verifiedBy} {nl2sql.verifiedBy === 1 ? "person" : "people"}.
        </p>
      ) : null}
      {nl2sql.retryAttempt ? <p className="mt-1 text-xs font-medium text-blue-700">A different reading (attempt {nl2sql.retryAttempt}), after your feedback.</p> : null}
      <details className="mt-2">
        <summary className="cursor-pointer text-xs font-medium text-slate-500">SQL the model wrote</summary>
        <pre className="mt-1 overflow-x-auto rounded-md bg-slate-900 p-2 text-[11px] leading-snug text-slate-100">{nl2sql.sql}</pre>
      </details>
    </div>
  );
}

export function Nl2SqlTable({ table }: { table: TableData }) {
  if (!table.columns.length) return null;
  return (
    <div className="mb-2 p-1">
      <div className="max-h-80 overflow-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="sticky top-0 bg-slate-50 text-[11px] uppercase text-slate-500">
            <tr>
              {table.columns.map((c) => (
                <th key={c} className="px-3 py-2 font-semibold">{c.replace(/_/g, " ")}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((r, i) => (
              <tr key={i} className="border-t border-slate-100">
                {table.columns.map((c) => (
                  <td key={c} className="px-3 py-1.5 text-slate-700">{r[c] === null || r[c] === undefined ? "—" : String(r[c])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {table.truncated && (
        <p className="mt-1 px-1 text-xs text-slate-500">
          Showing the first {table.rows.length.toLocaleString()} of {table.total.toLocaleString()} rows.
        </p>
      )}
    </div>
  );
}
