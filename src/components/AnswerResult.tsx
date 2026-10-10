"use client";

// src/components/AnswerResult.tsx
//
// Shows the result of an answer written by the language model, adapting to whatever came back:
//   * Cards  -- a list of people (the omnibar's person cards, passed in as `peopleView`)
//   * Table  -- every column the SQL returned: readable titles, sort by clicking a heading, a filter box,
//               Yes/No for true/false, tidy numbers and dates; copy / CSV for signed-in people
//   * Chart  -- a bar chart for "a count per group"
// Which one opens first, the heading and the column titles come from lib/nl2sql/display.ts: the model's
// suggestion VERIFIED against the real result, or a layout chosen from the data's shape. Every column the SQL
// returned is always visible (see display.ts). A switcher appears when more than one view is possible.

import { useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, BarChart3, Check, ChevronDown, Copy, Download, LayoutList, Loader2, Search, Table2 } from "lucide-react";
import type { Nl2SqlExtras, Nl2SqlTable } from "@/lib/nl2sql/clientTypes";
import { exportNote, filterRows, formatCell, pageProgress, rowCountLabel, sortRows, toCsv, toTsv, type DisplayColumn, type ViewKind } from "@/lib/nl2sql/display";

const VIEW_META: Record<ViewKind, { label: string; Icon: typeof Table2 }> = {
  cards: { label: "Cards", Icon: LayoutList },
  table: { label: "Table", Icon: Table2 },
  bar: { label: "Chart", Icon: BarChart3 },
};

function Pill({ yes }: { yes: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
        yes ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" : "bg-slate-100 text-slate-500 ring-1 ring-slate-200"
      }`}
    >
      {yes ? "Yes" : "No"}
    </span>
  );
}

function Cell({ value, col }: { value: unknown; col: DisplayColumn }) {
  if (value === null || value === undefined || value === "") return <span className="text-slate-300">{"\u2014"}</span>;
  if (typeof value === "boolean") return <Pill yes={value} />;
  if (col.kind === "code") {
    return <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-700">{String(value)}</span>;
  }
  return <>{formatCell(value, col.kind)}</>;
}

export function ResultTable({ table, columns, authenticated }: { table: Nl2SqlTable; columns: DisplayColumn[]; authenticated: boolean }) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [dir, setDir] = useState<"asc" | "desc">("asc");
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState(false);

  const shown = useMemo(() => {
    const filtered = filterRows(table.rows, columns, query);
    const col = columns.find((c) => c.key === sortKey);
    return col ? sortRows(filtered, col.key, col.kind, dir) : filtered;
  }, [table.rows, columns, query, sortKey, dir]);

  const toggleSort = (key: string) => {
    if (sortKey === key) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setDir("asc");
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(toTsv(columns, shown));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  };
  const download = () => {
    const blob = new Blob([toCsv(columns, shown)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "omnibar-result.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const locked = !authenticated;
  const note = exportNote(shown.length, table.total, table.truncated);
  return (
    <div
      className={locked ? "select-none" : "select-text"}
      onCopy={locked ? (e) => e.preventDefault() : undefined}
      onContextMenu={locked ? (e) => e.preventDefault() : undefined}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2 px-1">
        {table.rows.length > 8 && (
          <label className="relative">
            <Search size={13} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value.slice(0, 80))}
              placeholder="Filter rows"
              aria-label="Filter rows"
              className="w-44 rounded-lg border border-slate-200 bg-white py-1 pl-7 pr-2 text-xs text-slate-700 outline-none focus:border-blue-400"
            />
          </label>
        )}
        <span className="text-xs text-slate-500">{rowCountLabel(shown.length, table.rows.length, table.total, table.truncated)}</span>
        <span className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={copy}
            disabled={locked}
            title={locked ? "Log in to copy" : note.title || "Copy the rows (paste into a spreadsheet)"}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copied" : `Copy${note.suffix}`}
          </button>
          <button
            type="button"
            onClick={download}
            disabled={locked}
            title={locked ? "Log in to download" : note.title || "Download as a CSV file"}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download size={13} /> {`CSV${note.suffix}`}
          </button>
        </span>
      </div>

      <div className="max-h-96 overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur">
            <tr>
              {columns.map((c) => {
                const active = sortKey === c.key;
                const SortIcon = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
                    className={`whitespace-nowrap px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 ${c.kind === "number" || c.kind === "percent" ? "text-right" : ""}`}
                  >
                    <button type="button" onClick={() => toggleSort(c.key)} className="inline-flex items-center gap-1 hover:text-slate-800">
                      {c.label}
                      <SortIcon size={12} className={active ? "text-blue-600" : "text-slate-300"} aria-hidden="true" />
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={i} className="border-t border-slate-100 transition-colors odd:bg-white even:bg-slate-50/50 hover:bg-blue-50/40">
                {columns.map((c) => (
                  <td key={c.key} className={`px-3 py-1.5 text-slate-700 ${c.kind === "number" || c.kind === "percent" ? "text-right tabular-nums" : ""}`}>
                    <Cell value={r[c.key]} col={c} />
                  </td>
                ))}
              </tr>
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-3 py-6 text-center text-sm text-slate-400">
                  No rows{query ? " match the filter" : ""}.
                </td>
              </tr>
            )}
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

export function BarChartView({ table, columns, bar }: { table: Nl2SqlTable; columns: DisplayColumn[]; bar: { label: string; value: string } }) {
  const labelCol = columns.find((c) => c.key === bar.label);
  const valueCol = columns.find((c) => c.key === bar.value);
  const items = table.rows.slice(0, 40).map((r) => ({
    label: formatCell(r[bar.label], labelCol?.kind ?? "text"),
    value: Number(r[bar.value]) || 0,
  }));
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        {valueCol?.label ?? "Value"} by {(labelCol?.label ?? "group").toLowerCase()}
      </p>
      <ul role="list" className="flex flex-col gap-1.5">
        {items.map((it, i) => (
          <li key={i} className="flex items-center gap-3">
            <span className="w-44 shrink-0 truncate text-xs text-slate-600" title={it.label}>
              {it.label}
            </span>
            <span className="h-5 flex-1 overflow-hidden rounded-full bg-slate-100">
              <span
                className="block h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-500"
                style={{ width: `${it.value > 0 ? Math.max(2, (it.value / max) * 100) : 0}%` }}
              />
            </span>
            <span className="w-14 shrink-0 text-right text-xs font-semibold tabular-nums text-slate-700">{valueCol?.kind === "percent" ? formatCell(it.value, "percent") : it.value.toLocaleString()}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** "Show 100 more" with a running count; for a signed-out visitor it says to log in. */
export function ShowMore({ more }: { more: MoreState }) {
  const p = pageProgress(more.shown, more.total);
  return (
    <div className="mt-2 flex flex-col items-center gap-1 px-1">
      <button
        type="button"
        onClick={more.onMore}
        disabled={more.locked || more.loading}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {more.loading ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <ChevronDown size={15} aria-hidden="true" />}
        {more.locked ? "Log in to see the rest" : more.loading ? "Loading\u2026" : p.label}
        <span className="text-xs font-normal text-slate-400">{p.progress}</span>
      </button>
      {more.error && (
        <p role="alert" className="text-xs text-red-600">
          {more.error}
        </p>
      )}
    </div>
  );
}

export interface MoreState {
  shown: number;
  total: number;
  loading: boolean;
  error: string | null;
  locked: boolean;
  onMore: () => void;
}

export function AnswerResult({
  nl2sql,
  authenticated,
  peopleView,
  more = null,
}: {
  nl2sql: Nl2SqlExtras;
  authenticated: boolean;
  /** The omnibar's person cards (already rendered by the page), or null when the answer is not a list of people. */
  peopleView: ReactNode | null;
  /** Set while more rows exist beyond the ones shown ("Show more", 100 at a time). */
  more?: MoreState | null;
}) {
  const display = nl2sql.display ?? null;
  const table = nl2sql.table ?? null;
  const available: ViewKind[] = [];
  if (peopleView) available.push("cards");
  if (table && display) available.push("table");
  if (table && display?.bar) available.push("bar");

  const start: ViewKind | undefined = display && available.includes(display.view) ? display.view : available[0];
  const [view, setView] = useState<ViewKind | undefined>(start);
  if (!view || available.length === 0) return peopleView ? <>{peopleView}</> : null;
  const current = available.includes(view) ? view : available[0];

  return (
    <div className="mb-2 p-1">
      {(display?.title || available.length > 1) && (
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1">
          <h4 className="text-sm font-semibold text-slate-700">{display?.title ?? ""}</h4>
          {available.length > 1 && (
            <div role="tablist" aria-label="How to show the result" className="inline-flex rounded-lg bg-slate-100 p-0.5">
              {available.map((v) => {
                const { label, Icon } = VIEW_META[v];
                const on = v === current;
                return (
                  <button
                    key={v}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    onClick={() => setView(v)}
                    className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                      on ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    <Icon size={13} aria-hidden="true" /> {label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
      {current === "cards" && peopleView}
      {current === "table" && table && display && <ResultTable table={table} columns={display.columns} authenticated={authenticated} />}
      {current === "bar" && table && display?.bar && <BarChartView table={table} columns={display.columns} bar={display.bar} />}
      {more && current !== "bar" && <ShowMore more={more} />}
    </div>
  );
}
