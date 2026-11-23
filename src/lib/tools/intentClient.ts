// src/lib/tools/intentClient.ts
//
// The browser's ask: POST the typed line to /api/tools/intent (src/app/api/tools/intent/route.ts) and get a checked utility id back, or null. It never throws: any failure (offline, not signed in, a slow answer,
// the AI switched off) is simply "no answer", and the search box searches as it always did. It sends nothing but the one line.
import { AI_MIN_CONFIDENCE } from "./intentAi";

export async function askIntent(line: string, signal?: AbortSignal): Promise<{ id: string; confidence: number } | null> {
  try {
    const r = await fetch("/api/tools/intent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ line }), signal, cache: "no-store" });
    const j = (await r.json().catch(() => null)) as { ok?: boolean; id?: unknown; confidence?: unknown } | null;
    if (!r.ok || !j?.ok || typeof j.id !== "string" || typeof j.confidence !== "number" || j.confidence < AI_MIN_CONFIDENCE) return null;
    return { id: j.id, confidence: j.confidence };
  } catch {
    return null;
  }
}
