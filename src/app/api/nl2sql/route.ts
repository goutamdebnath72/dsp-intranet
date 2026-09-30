// src/app/api/nl2sql/route.ts
//
// EXPERIMENT endpoint: the language model writes read-only SQL from a
// question. Completely separate from /api/ai-search and the omnibar.
//
// Off by default: returns 404 unless NL2SQL_LAB_ENABLED=true. Requires a
// logged-in session. Queries run as the read-only nlq_reader role.
//
// POST { question: string }                       -> pipeline result
// POST { feedback: { logId, verdict: "confirm"|"reject" } } -> { ok }

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth";
import { answerQuestion } from "@/lib/nl2sql/pipeline";
import { groqLlm } from "@/lib/nl2sql/llm";
import { withDefaultClient } from "@/lib/nl2sql/db";
import { recordVerdict } from "@/lib/nl2sql/log";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const maxDuration = 60;

export async function POST(req: Request) {
  if (process.env.NL2SQL_LAB_ENABLED !== "true") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const session = await getServerSession(await getAuthOptions());
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body?.feedback) {
    const logId = Number(body.feedback.logId);
    const verdict = body.feedback.verdict;
    if (!Number.isInteger(logId) || (verdict !== "confirm" && verdict !== "reject")) {
      return NextResponse.json({ error: "logId and verdict are required" }, { status: 400 });
    }
    const ok = await withDefaultClient((c) => recordVerdict(c, logId, verdict, userId));
    return NextResponse.json({ ok });
  }

  const question = typeof body?.question === "string" ? body.question : "";
  const result = await answerQuestion(question, userId, { llm: groqLlm(), withClient: withDefaultClient });
  return NextResponse.json(result);
}
