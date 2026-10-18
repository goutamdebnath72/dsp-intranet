// src/app/api/ai-search/answer/route.ts
//
// ANSWER FIRST (step 29a). Given the question and the documents the search just found (their type and id), read their text, ask the
// model to answer ONLY from it with a word-for-word quote for every fact, and return the answer ONLY if the program can prove it
// (src/lib/search/circularAnswer.ts). Otherwise {answer: null}: the screen then shows the documents exactly as before.
//
// Generic: it knows nothing about any particular circular. Off unless NEXT_PUBLIC_FRONT_PATH_ANSWER_FIRST=true (404 otherwise).
// Traced like every search: x-omni-* headers and one "[front-path] answer ..." console line with the model's exact tokens.

import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { groqLlm } from "@/lib/nl2sql/llm";
import { answerFromPassages, buildPassages, type DocInput, type PassageType } from "@/lib/search/circularAnswer";
import { loadPageChecks } from "@/lib/search/pageChecks";
import { setTraceRoute, startTrace, summarizeTrace, traceHeaders, traceLine, traceStep, withTrace } from "@/lib/search/frontPathTrace";

export const runtime = "nodejs";
export const maxDuration = 60;

const TYPES: PassageType[] = ["circular", "announcement", "holiday"];
const MAX_ITEMS = 3;

// A plain guard against a runaway caller: 20 answers per 10 minutes per address (each one costs model tokens).
const hits = new Map<string, number[]>();
function allowed(ip: string, now = Date.now()): boolean {
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 10 * 60 * 1000);
  if (recent.length >= 20) { hits.set(ip, recent); return false; }
  recent.push(now);
  hits.set(ip, recent);
  return true;
}

function enabled(): boolean {
  return (process.env.NEXT_PUBLIC_FRONT_PATH_ANSWER_FIRST ?? "").trim().toLowerCase() === "true";
}

async function loadDocs(items: { type: PassageType; id: number }[]): Promise<DocInput[]> {
  const db = await getDb();
  const docs: DocInput[] = [];
  for (const it of items) {
    if (it.type === "circular") {
      const head = await db.query(`SELECT id, headline, "publishedAt" FROM circulars WHERE id = $1`, [it.id]);
      if (!head[0]) continue;
      const rows = await db.query(`SELECT page_number, chunk_index, text FROM circular_chunks WHERE circular_id = $1 ORDER BY page_number, chunk_index`, [it.id]);
      const chunks = rows.map((r: any) => ({ page: r.page_number == null ? null : Number(r.page_number), index: Number(r.chunk_index), text: String(r.text ?? "") }));
      docs.push({
        type: "circular", id: it.id, title: String(head[0].headline), date: head[0].publishedAt ? new Date(head[0].publishedAt).toISOString() : null,
        chunks,
        // what a second reader said about the numbers of these pages (only for pages whose stored text is still the text that was checked)
        checks: await loadPageChecks((sql, params) => db.query(sql, params), it.id, chunks),
      });
    } else if (it.type === "holiday") {
      const rows = await db.query(`SELECT id, topic, holiday_name, year, text FROM holiday_policy_chunks WHERE id = $1`, [it.id]);
      if (!rows[0]) continue;
      const r = rows[0];
      docs.push({ type: "holiday", id: it.id, title: `${r.topic || r.holiday_name || "Holiday policy note"}${r.year ? ` (${r.year})` : ""}`, date: null, chunks: [{ page: null, index: 0, text: String(r.text ?? "") }] });
    } else {
      const rows = await db.query(`SELECT id, title, "contentText", date FROM announcement WHERE id = $1`, [it.id]);
      if (!rows[0]) continue;
      const r = rows[0];
      docs.push({ type: "announcement", id: it.id, title: String(r.title), date: r.date ? new Date(r.date).toISOString() : null, chunks: [{ page: null, index: 0, text: String(r.contentText ?? "") }] });
    }
  }
  return docs;
}

async function handle(request: Request, info: { q: string }) {
  if (!enabled()) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const ip = (request.headers.get("x-forwarded-for") || "local").split(",")[0].trim();
  if (!allowed(ip)) return NextResponse.json({ answer: null, reason: "rate_limited" }, { status: 429 });

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ answer: null, reason: "bad_request" }, { status: 400 });
  }
  const q = typeof body?.q === "string" ? body.q.trim() : "";
  info.q = q;
  const items = (Array.isArray(body?.items) ? body.items : [])
    .filter((x: any) => x && TYPES.includes(x.type) && Number.isInteger(x.id) && x.id > 0)
    .slice(0, MAX_ITEMS) as { type: PassageType; id: number }[];
  if (q.length < 2 || q.length > 300 || !items.length) return NextResponse.json({ answer: null, reason: "bad_request" }, { status: 400 });

  try {
    const endLoad = traceStep("load");
    const docs = await loadDocs(items);
    endLoad();
    const passages = buildPassages(q, docs);
    const endModel = traceStep("model");
    const result = await answerFromPassages(q, passages, groqLlm({ maxTokens: 2500 }));
    endModel();
    return NextResponse.json(result.ok ? { answer: result.value } : { answer: null, reason: result.reason });
  } catch (e) {
    console.error("[answer] failed:", e);
    return NextResponse.json({ answer: null, reason: "error" }, { status: 200 });
  }
}

export async function POST(request: Request) {
  const trace = startTrace();
  const info = { q: "" };
  const res = await withTrace(trace, () => handle(request, info));
  try {
    const out = await res.clone().json().catch(() => null);
    setTraceRoute("answer");
    trace.route = "answer";
    trace.kind = out?.answer ? "answered" : out?.reason ? String(out.reason).split(":")[0] : null;
    const summary = summarizeTrace(trace);
    for (const [name, value] of Object.entries(traceHeaders(summary))) res.headers.set(name, value);
    console.info(traceLine(summary, info.q));
  } catch {
    /* tracing is best-effort */
  }
  return res;
}
