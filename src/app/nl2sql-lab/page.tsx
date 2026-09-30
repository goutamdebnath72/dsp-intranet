"use client";

// src/app/nl2sql-lab/page.tsx
// EXPERIMENT: ask a question, see the SQL the language model wrote, its plain-
// English reading, and the result. Separate from the omnibar. Needs
// NL2SQL_LAB_ENABLED=true on the server and a logged-in session.

import { useState } from "react";
import { useModal } from "@/context/ModalContext";
import { useVerifiedSession } from "@/components/SessionGuard";

type Cell = string | number | boolean | null;
interface Data { columns: string[]; rows: Record<string, Cell>[]; total: number; truncated: boolean }
type Result =
  | { ok: true; question: string; sql: string; understoodAs: string; confidence: string; data: Data; attempts: number; elapsedMs: number; logId: number | null }
  | { ok: false; kind: "clarify" | "unanswerable" | "error"; message: string; sql?: string | null; understoodAs?: string; attempts: number; elapsedMs: number; logId: number | null };

const EXAMPLES = [
  'find the names of employees which have kumar at the middle',
  'find the names which end with "debnath" but not "nath" as a word',
  "GMs in C&IT whose name ends with nath",
  'names that contain "nath" but not at the end',
  "how many executives have no NIC email",
  "who are the 10 most senior non executives",
];

export default function Nl2SqlLab() {
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<"confirm" | "reject" | null>(null);
  // The app signs a tab out when it finds no "logged in here" note for that tab.
  // Logging in from THIS page creates the note in this very tab.
  const { status, data: session } = useVerifiedSession();
  const { openModal } = useModal();
  const loggedIn = status === "authenticated";

  async function ask(q: string) {
    if (!q.trim() || busy || !loggedIn) return;
    setBusy(true);
    setError(null);
    setResult(null);
    setVerdict(null);
    try {
      const res = await fetch("/api/nl2sql", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: q }) });
      if (res.status === 404) throw new Error("The lab is switched off. Set NL2SQL_LAB_ENABLED=true on the server.");
      if (res.status === 401) throw new Error("You are not logged in. Use the Log in button at the top of this page.");
      setResult(await res.json());
    } catch (e: any) {
      setError(e.message || "Request failed");
    } finally {
      setBusy(false);
    }
  }

  async function rate(v: "confirm" | "reject") {
    if (!result || result.logId == null || verdict) return;
    setVerdict(v);
    fetch("/api/nl2sql", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ feedback: { logId: result.logId, verdict: v } }) }).catch(() => {});
  }

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900">
        <b>Experiment.</b> A language model writes a read-only database query from your question. Always check the “Understood as” line.
      </div>
      <h1 className="mb-3 text-xl font-semibold">Ask about employees</h1>

      {status === "unauthenticated" && (
        <div className="mb-3 flex items-center justify-between rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-900">
          <span>You are not logged in on this page.</span>
          <button onClick={openModal} className="rounded-lg bg-red-600 px-3 py-1 text-xs font-medium text-white">Log in</button>
        </div>
      )}
      {loggedIn && (
        <div className="mb-3 text-xs text-emerald-700">Logged in{session?.user?.name ? ` as ${session.user.name}` : ""}.</div>
      )}

      <textarea
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) ask(question); }}
        rows={2}
        placeholder="e.g. GMs in C&IT whose name ends with nath   (Ctrl/Cmd+Enter to ask)"
        className="w-full rounded-lg border border-slate-300 p-3 text-sm outline-none focus:border-blue-500"
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button onClick={() => ask(question)} disabled={busy || !question.trim() || !loggedIn} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {busy ? "Thinking…" : "Ask"}
        </button>
        {EXAMPLES.map((ex) => (
          <button key={ex} onClick={() => { setQuestion(ex); ask(ex); }} className="rounded-full border border-slate-300 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50">
            {ex.length > 44 ? ex.slice(0, 42) + "…" : ex}
          </button>
        ))}
      </div>

      {error && <div className="mt-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</div>}

      {result && !result.ok && (
        <div className={`mt-4 rounded-lg border p-4 text-sm ${result.kind === "error" ? "border-red-300 bg-red-50 text-red-900" : "border-blue-200 bg-blue-50 text-blue-900"}`}>
          <div className="font-semibold">{result.kind === "clarify" ? "I need one detail" : result.kind === "unanswerable" ? "This can’t be answered from the data" : "Something went wrong"}</div>
          <div className="mt-1">{result.message}</div>
          {result.understoodAs && <div className="mt-2 text-xs opacity-80">Understood as: {result.understoodAs}</div>}
          {result.sql && <pre className="mt-2 overflow-x-auto rounded bg-white/70 p-2 text-xs">{result.sql}</pre>}
        </div>
      )}

      {result && result.ok && (
        <div className="mt-4">
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
            <div className="text-2xl font-bold text-blue-900">{result.data.total.toLocaleString()} {result.data.total === 1 ? "row" : "rows"}</div>
            <div className="mt-1 text-sm text-slate-700"><b>Understood as:</b> {result.understoodAs}</div>
            <div className="mt-1 text-xs text-slate-500">
              confidence {result.confidence} · {result.attempts} attempt{result.attempts === 1 ? "" : "s"} · {(result.elapsedMs / 1000).toFixed(1)} s
            </div>
            {result.logId != null && (
              <div className="mt-2 flex items-center gap-2 text-xs text-slate-600">
                {verdict ? (
                  <span>{verdict === "confirm" ? "Thanks — marked as correct." : "Thanks — marked as wrong. The same SQL won’t be shown to you again for this question."}</span>
                ) : (
                  <>
                    Is this what you meant?
                    <button onClick={() => rate("confirm")} className="rounded border border-emerald-300 px-2 py-0.5 text-emerald-700 hover:bg-emerald-50">✓</button>
                    <button onClick={() => rate("reject")} className="rounded border border-red-300 px-2 py-0.5 text-red-600 hover:bg-red-50">✗</button>
                  </>
                )}
              </div>
            )}
          </div>

          <details className="mt-3 rounded-lg border border-slate-200 p-3 text-sm">
            <summary className="cursor-pointer font-medium text-slate-700">SQL the model wrote</summary>
            <pre className="mt-2 overflow-x-auto rounded bg-slate-900 p-3 text-xs text-slate-100">{result.sql}</pre>
          </details>

          <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>{result.data.columns.map((c) => <th key={c} className="px-3 py-2">{c}</th>)}</tr>
              </thead>
              <tbody>
                {result.data.rows.map((r, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    {result.data.columns.map((c) => <td key={c} className="px-3 py-1.5">{r[c] === null ? "—" : String(r[c])}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {result.data.truncated && <div className="mt-2 text-xs text-slate-500">Showing the first {result.data.rows.length} of {result.data.total.toLocaleString()} rows.</div>}
        </div>
      )}
    </div>
  );
}
