// src/app/api/employees/name-words/route.ts
//
// GET /api/employees/name-words   { words: ["ABHIJIT", "ADITYA", ...] }
//
// The NAME WORDS of the directory, and nothing else: no person, no ticket, no department, nothing that says whose word it is. The search bar loads it once, when it opens, to recognise a word as part
// of an Indian name while the user types ("Looks like a name. Press Enter to search people": src/lib/search/nameHint/nameHint.ts). About 2,900 words, 22 KB; the browser and the edge keep it for ten minutes.
// Open to a person who has not signed in (the name search itself is open to them, and answers with the name and department), and limited per address.

import { NextResponse } from "next/server";
import { withDefaultClient } from "@/lib/nl2sql/db";
import { directoryNameWords } from "@/lib/nl2sql/nameSpelling";
import { clientIp, createLimiter, retryHeaders } from "@/lib/security/rateLimit";

export const dynamic = "force-dynamic";

const byAddress = createLimiter({ max: 20, windowMs: 60_000 });

export async function GET(request: Request) {
  const turn = byAddress.take(clientIp(request.headers));
  if (!turn.ok) return NextResponse.json({ words: [] }, { status: 429, headers: retryHeaders(turn) });
  try {
    const words = await directoryNameWords(withDefaultClient);
    return NextResponse.json({ words }, { headers: { "Cache-Control": "public, max-age=600, s-maxage=600, stale-while-revalidate=3600" } });
  } catch (e) {
    console.error("name words failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ words: [] }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
