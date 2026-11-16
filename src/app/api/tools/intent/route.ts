// src/app/api/tools/intent/route.ts
//
// WHICH UTILITY DOES THIS LINE MEAN? (POST {"line": "..."} -> {ok, id|null, confidence}). Called by the search box only for a whole sentence that no utility's words settle, after Enter. It sends the one line (long digit runs
// and e-mail addresses blanked, never an ID query) and the list of utilities to the AI (Gemini), and gives back only a utility id that is really in the list. Nothing is stored. Only a signed-in user may ask; a person
// can ask at most 12 times a minute; the same line is answered from memory for an hour. TOOL_INTENT_AI=off switches it off (the box then simply searches).
import { NextResponse } from "next/server";
import { getSessionTicket } from "@/lib/apiAuth";
import { chatModels, geminiGenerate } from "@/lib/ai/geminiChat";
import { askWhichUtility } from "@/lib/tools/intentAi";
import { maskForAi } from "@/lib/tools/intent";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

const none = (extra: object = {}) => NextResponse.json({ ok: true, id: null, confidence: 0, ...extra }, { headers: { "Cache-Control": "no-store" } });

const kept = new Map<string, { at: number; id: string | null; confidence: number }>();
const asked = new Map<string, number[]>();
const HOUR = 60 * 60 * 1000;

export async function POST(req: Request) {
  if ((process.env.TOOL_INTENT_AI || "").toLowerCase() === "off" || !process.env.GEMINI_API_KEY) return none({ off: true });
  const ticket = await getSessionTicket().catch(() => null);
  if (!ticket) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  let line = "";
  try { line = String(((await req.json()) as { line?: unknown })?.line ?? ""); } catch { return NextResponse.json({ ok: false, error: "Send the line." }, { status: 400 }); }
  const masked = maskForAi(line);
  if (!masked) return none();
  const key = masked.toLowerCase();
  const hit = kept.get(key);
  if (hit && Date.now() - hit.at < HOUR) return none({ id: hit.id, confidence: hit.confidence });
  const mine = (asked.get(ticket) ?? []).filter((t) => Date.now() - t < 60_000);
  if (mine.length >= 12) return NextResponse.json({ ok: false, error: "Too many requests; try again in a minute." }, { status: 429 });
  asked.set(ticket, [...mine, Date.now()]);
  const pick = await askWhichUtility(line, async (prompt) => (await geminiGenerate(prompt, { json: true, models: chatModels(), maxOutputTokens: 600, temperature: 0, thinking: "low", attemptTimeoutMs: 7000, totalTimeoutMs: 10000, label: "tool-intent" })).text);
  if (kept.size > 500) kept.clear();
  kept.set(key, { at: Date.now(), id: pick?.id ?? null, confidence: pick?.confidence ?? 0 });
  return none({ id: pick?.id ?? null, confidence: pick?.confidence ?? 0 });
}
