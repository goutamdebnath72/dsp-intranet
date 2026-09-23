"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { DateTime } from "luxon";
import {
  Loader2, ChevronLeft, ChevronRight, ArrowLeft, ArrowUp, ArrowDown, FilterX,
} from "lucide-react";
import { ACTIVE_UI_DESIGN } from "@/lib/config";
import { TopBar } from "@/components/TopBar";
import Header from "@/components/Header";
import OldHeader from "@/components/OldHeader";

interface LogRow {
  accessedAt: string;
  viewerTicketNo: string | null;
  viewerName: string | null;
  viewedTicketNo: string | null;
  viewedName: string | null;
  field: string | null;
  action: string;
}
type SortKey = "accessedAt" | "viewer" | "viewed" | "field" | "action";
interface Filters {
  from: string; to: string; viewer: string; viewed: string; field: string; action: string;
}
const EMPTY: Filters = { from: "", to: "", viewer: "", viewed: "", field: "", action: "" };
const PAGE_SIZE = 50;

function fmt(ts: string): string {
  const dt = DateTime.fromISO(ts);
  return dt.isValid ? dt.toFormat("dd LLL yyyy, h:mm a") : "—";
}
function ActionBadge({ action }: { action: string }) {
  const copy = action === "copy";
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
      copy ? "bg-green-100 text-green-800" : "bg-blue-100 text-blue-800"}`}>
      {action}
    </span>
  );
}

function AccessLogContent() {
  const { data: session, status } = useSession();
  const isSuper = (session?.user as any)?.isSuperAdmin === true;

  const [rows, setRows] = useState<LogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "accessedAt", dir: "desc",
  });
  const [loading, setLoading] = useState(false);

  // Gate: only the super-admin (HOD C&IT). Others bounce home.
  useEffect(() => {
    if (status === "unauthenticated") redirect("/");
    if (status === "authenticated" && !isSuper) redirect("/");
  }, [status, isSuper]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams({
        page: String(page), pageSize: String(PAGE_SIZE),
        sort: sort.key, dir: sort.dir,
      });
      if (filters.from) p.set("from", filters.from);
      if (filters.to) p.set("to", filters.to);
      if (filters.viewer) p.set("viewer", filters.viewer);
      if (filters.viewed) p.set("viewed", filters.viewed);
      if (filters.field) p.set("field", filters.field);
      if (filters.action) p.set("action", filters.action);

      const res = await fetch(`/api/admin/access-log?${p.toString()}`, { cache: "no-store" });
      if (res.status === 403) { window.location.href = "/"; return; }
      if (!res.ok) { setRows([]); setTotal(0); setCounts({}); return; }
      const d = await res.json();
      setRows(Array.isArray(d.rows) ? d.rows : []);
      setTotal(d.total ?? 0);
      setCounts(d.counts ?? {});
    } catch {
      setRows([]); setTotal(0); setCounts({});
    } finally {
      setLoading(false);
    }
  }, [page, sort, filters]);

  // Debounced fetch so typing in text filters doesn't hammer the API.
  useEffect(() => {
    if (!(status === "authenticated" && isSuper)) return;
    const t = setTimeout(load, 350);
    return () => clearTimeout(t);
  }, [status, isSuper, load]);

  const setFilter = (k: keyof Filters, v: string) => {
    setFilters((f) => ({ ...f, [k]: v }));
    setPage(1);
  };
  const clearFilters = () => { setFilters(EMPTY); setSort({ key: "accessedAt", dir: "desc" }); setPage(1); };
  const toggleSort = (key: SortKey) => {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
                                  : { key, dir: key === "accessedAt" ? "desc" : "asc" }));
    setPage(1);
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, total);

  const SortCaret = ({ k }: { k: SortKey }) =>
    sort.key !== k ? <span className="text-neutral-300">↕</span>
      : sort.dir === "asc" ? <ArrowUp size={13} className="inline text-blue-600" />
      : <ArrowDown size={13} className="inline text-blue-600" />;

  const Th = ({ k, label }: { k: SortKey; label: string }) => (
    <th
      onClick={() => toggleSort(k)}
      className="px-3 py-2.5 font-medium cursor-pointer select-none whitespace-nowrap hover:text-neutral-900"
    >
      {label} <SortCaret k={k} />
    </th>
  );

  if (status === "loading" || (status === "authenticated" && !isSuper))
    return (
      <div className="flex items-center justify-center h-screen bg-gray-100">
        <Loader2 className="animate-spin text-primary-600" size={48} />
      </div>
    );

  return (
    <>
      {ACTIVE_UI_DESIGN === "new" ? (
        <>
          <div className="w-full md:w-[var(--content-width)] mx-auto">
            <TopBar />
          </div>
          <Header />
        </>
      ) : (
        <OldHeader />
      )}

      <div className="w-full md:w-[var(--content-width)] mx-auto shadow-lg bg-gray-200 min-h-screen">
        <div className="container mx-auto pt-8 px-8 pb-10">
          <Link href="/admin" className="inline-flex items-center gap-1 text-sm text-neutral-600 hover:text-neutral-900 mb-4">
            <ArrowLeft size={16} /> Back to Admin
          </Link>

          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h1 className="text-3xl font-bold font-heading text-neutral-800">Contact Access Log</h1>
              <p className="text-sm text-neutral-500 mt-1">HOD C&amp;IT only · newest first · filterable</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-neutral-500">
                Total {total.toLocaleString()} · Reveals {(counts["reveal"] ?? 0).toLocaleString()} · Copies {(counts["copy"] ?? 0).toLocaleString()}
              </span>
              <button onClick={clearFilters}
                className="inline-flex items-center gap-1 rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-700 hover:bg-gray-50">
                <FilterX size={15} /> Clear filters
              </button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white shadow-sm">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-gray-100 text-left text-neutral-600">
                  <Th k="accessedAt" label="Date & time" />
                  <Th k="viewer" label="Viewer" />
                  <Th k="viewed" label="Viewed person" />
                  <Th k="field" label="Field" />
                  <Th k="action" label="Action" />
                </tr>
                {/* Excel-like per-column filter row */}
                <tr className="bg-gray-50 border-t border-neutral-200">
                  <td className="px-2 py-1.5">
                    <div className="flex gap-1">
                      <input type="date" value={filters.from} onChange={(e) => setFilter("from", e.target.value)}
                        className="h-8 w-[112px] rounded border border-neutral-300 bg-white px-1.5 text-xs" />
                      <input type="date" value={filters.to} onChange={(e) => setFilter("to", e.target.value)}
                        className="h-8 w-[112px] rounded border border-neutral-300 bg-white px-1.5 text-xs" />
                    </div>
                  </td>
                  <td className="px-2 py-1.5">
                    <input placeholder="name or ticket" value={filters.viewer} onChange={(e) => setFilter("viewer", e.target.value)}
                      className="h-8 w-full rounded border border-neutral-300 bg-white px-2 text-xs" />
                  </td>
                  <td className="px-2 py-1.5">
                    <input placeholder="name or ticket" value={filters.viewed} onChange={(e) => setFilter("viewed", e.target.value)}
                      className="h-8 w-full rounded border border-neutral-300 bg-white px-2 text-xs" />
                  </td>
                  <td className="px-2 py-1.5">
                    <select value={filters.field} onChange={(e) => setFilter("field", e.target.value)}
                      className="h-8 w-full rounded border border-neutral-300 bg-white px-1 text-xs">
                      <option value="">All</option>
                      <option value="mobile">mobile</option>
                      <option value="email">email</option>
                    </select>
                  </td>
                  <td className="px-2 py-1.5">
                    <select value={filters.action} onChange={(e) => setFilter("action", e.target.value)}
                      className="h-8 w-full rounded border border-neutral-300 bg-white px-1 text-xs">
                      <option value="">All</option>
                      <option value="reveal">reveal</option>
                      <option value="copy">copy</option>
                    </select>
                  </td>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5} className="px-4 py-10 text-center text-neutral-400"><Loader2 className="inline animate-spin" size={22} /></td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-10 text-center text-neutral-400">No records match these filters.</td></tr>
                ) : (
                  rows.map((r, i) => (
                    <tr key={i} className="border-t border-neutral-100">
                      <td className="px-3 py-3 whitespace-nowrap text-neutral-600">{fmt(r.accessedAt)}</td>
                      <td className="px-3 py-3">
                        <div className="font-medium text-neutral-800">{r.viewerName || "—"}</div>
                        <div className="text-xs text-neutral-400">{r.viewerTicketNo || ""}</div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="font-medium text-neutral-800">{r.viewedName || "—"}</div>
                        <div className="text-xs text-neutral-400">{r.viewedTicketNo || ""}</div>
                      </td>
                      <td className="px-3 py-3 text-neutral-700">{r.field || "—"}</td>
                      <td className="px-3 py-3"><ActionBadge action={r.action} /></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center justify-between text-sm text-neutral-600">
            <span>{total === 0 ? "No records"
              : `Showing ${rangeStart.toLocaleString()}–${rangeEnd.toLocaleString()} of ${total.toLocaleString()}`}</span>
            <div className="flex items-center gap-3">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1 || loading}
                className="inline-flex items-center gap-1 rounded-md border border-neutral-300 bg-white px-3 py-1.5 disabled:opacity-40">
                <ChevronLeft size={15} /> Prev
              </button>
              <span>Page {page} of {totalPages}</span>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages || loading}
                className="inline-flex items-center gap-1 rounded-md border border-neutral-300 bg-white px-3 py-1.5 disabled:opacity-40">
                Next <ChevronRight size={15} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default function AccessLogPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-screen bg-gray-100">
        <Loader2 className="animate-spin text-primary-600" size={48} />
      </div>
    }>
      <AccessLogContent />
    </Suspense>
  );
}
