// src/app/api/announcements/[id]/page/[n]/route.ts
//
// GET /api/announcements/<id>/page/<n>   the picture (PNG) of page n of an announcement's PDF, as the search index kept it (the circulars keep theirs the same way).
//
// Open to whoever may read the announcements (they are public on the home page). The address of the picture in Vercel Blob never leaves the server: this route fetches it and passes the bytes on.
// A page that has no picture (the PDF was not prepared for the search bar, or that page's picture was not kept), or a database with no such table yet, answers 404.

import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { blobFileStorage } from "@/lib/announcements/attachment";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET(_request: Request, { params }: { params: { id: string; n: string } }) {
  const id = Number.parseInt(params.id, 10);
  const n = Number.parseInt(params.n, 10);
  if (!Number.isInteger(id) || id < 1 || !Number.isInteger(n) || n < 1 || n > 500) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let url: string | null = null;
  try {
    const ds = await getDb();
    const rows = (await ds.query(`SELECT url FROM public.announcement_page WHERE announcement_id = $1 AND page = $2`, [id, n])) as Array<Record<string, unknown>>;
    if (rows[0]) url = String(rows[0].url);
  } catch {
    url = null; // no table yet: no picture
  }
  if (!url) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const bytes = await blobFileStorage().get(url).catch(() => null);
  if (!bytes) return NextResponse.json({ error: "The picture could not be read just now." }, { status: 502 });
  return new NextResponse(new Uint8Array(bytes), { status: 200, headers: { "Content-Type": "image/png", "Content-Length": String(bytes.length), "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" } });
}
