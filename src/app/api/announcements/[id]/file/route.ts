// src/app/api/announcements/[id]/file/route.ts
//
// GET /api/announcements/<id>/file          the PDF of an announcement, shown in the browser (inline)
// GET /api/announcements/<id>/file?download=1   the same, saved as a file
// GET /api/announcements/<id>/file?info=1       {name, bytes} as JSON (what the viewer asks when it was opened without that information)
//
// Open to whoever may read the announcements (they are public on the home page). The address of the file in Vercel Blob never leaves the server: this route fetches it and passes the bytes on.
// An announcement with no PDF, or a database that has no table for PDFs yet, answers 404.

import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { blobFileStorage, fileHeaders } from "@/lib/announcements/attachment";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const id = Number.parseInt(params.id, 10);
  if (!Number.isInteger(id) || id < 1) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let row: { url: string; name: string; bytes: number } | null = null;
  try {
    const ds = await getDb();
    const rows = (await ds.query(`SELECT url, name, bytes FROM public.announcement_file WHERE announcement_id = $1`, [id])) as Array<Record<string, unknown>>;
    if (rows[0]) row = { url: String(rows[0].url), name: String(rows[0].name), bytes: Number(rows[0].bytes) };
  } catch {
    row = null; // no table yet: no file
  }
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const q = new URL(request.url).searchParams;
  if (q.get("info") === "1") {
    return NextResponse.json({ name: row.name, bytes: row.bytes }, { headers: { "Cache-Control": "no-store" } });
  }

  const bytes = await blobFileStorage().get(row.url).catch(() => null);
  if (!bytes) return NextResponse.json({ error: "The file could not be read just now. Please try again." }, { status: 502 });
  return new NextResponse(new Uint8Array(bytes), { status: 200, headers: fileHeaders(row.name, bytes.length, q.get("download") === "1") });
}
