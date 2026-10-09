// src/app/api/omnibar/more/route.ts
//
// "Show more" for a long list: the next page (100 rows) of an answer the omnibar already gave.
// POST { logId, offset, labels? } -> { ok, columns, rows, people, total, hasMore }
//
//   * Signed-in people only (the whole directory must not be one click away for a stranger).
//   * The browser sends NO SQL. It sends the id of the answer; the SQL is loaded from the answer's own log row, checked
//     again by the same guard, and run by the same read-only executor, with the same stable order as page one.

import { NextResponse } from "next/server";
import { withDefaultClient } from "@/lib/nl2sql/db";
import { getSessionTicket } from "@/lib/apiAuth";
import { loadLogRow } from "@/lib/nl2sql/log";
import { guardSql } from "@/lib/nl2sql/guard";
import { runReadOnly } from "@/lib/nl2sql/executor";
import { PAGE_SIZE } from "@/lib/nl2sql/paging";
import { peoplePage } from "@/lib/nl2sql/omnibar";

export const dynamic = "force-dynamic";

const MAX_OFFSET = 200000;

export async function POST(req: Request) {
  const ticket = await getSessionTicket();
  if (!ticket) return NextResponse.json({ error: "Sign in to see the rest of the list." }, { status: 401 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const logId = Number(body?.logId);
  const offset = Number(body?.offset);
  if (!Number.isInteger(logId) || logId <= 0 || !Number.isInteger(offset) || offset < 0 || offset > MAX_OFFSET) {
    return NextResponse.json({ error: "logId and offset are required" }, { status: 400 });
  }

  try {
    const row = await withDefaultClient((c) => loadLogRow(c, logId));
    if (!row || !row.sql) return NextResponse.json({ error: "That answer is no longer available." }, { status: 404 });
    const g = guardSql(row.sql);
    if (!g.ok) return NextResponse.json({ error: "That answer cannot be extended." }, { status: 400 });

    const data = await withDefaultClient((c) => runReadOnly(c, g.sql, { rowLimit: PAGE_SIZE, offset, timeoutMs: 5000 }));
    const people = data.columns.includes("ticket_no") ? await withDefaultClient((c) => peoplePage(c, data, body?.labels)) : null;
    return NextResponse.json({
      ok: true,
      columns: data.columns,
      rows: data.rows,
      people,
      total: data.total,
      hasMore: data.truncated,
    });
  } catch {
    return NextResponse.json({ error: "Could not load more just now. Please try again." }, { status: 500 });
  }
}
