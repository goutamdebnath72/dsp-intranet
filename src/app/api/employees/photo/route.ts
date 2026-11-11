// src/app/api/employees/photo/route.ts
//
// POST /api/employees/photo  (multipart: op = "upload" | "remove", id, file)   and   GET /api/employees/photo?id=..&size=thumb|master  (or &meta=1).
// The rules are in src/lib/employees/photo/api.ts; the pictures are in Vercel Blob and are only ever served through here, to a logged-in person (step 70).

import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isSameOrigin } from "@/lib/employees/admin/api";
import { sessionActor, typeormEmpDb } from "@/lib/employees/admin/access";
import { handlePhotoGet, handlePhotoPost } from "@/lib/employees/photo/api";
import { blobStorage } from "@/lib/employees/photo/storage";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const ctxOf = async () => { const ds = await getDb(); return { actor: await sessionActor(ds), db: typeormEmpDb(ds), storage: blobStorage() }; };

export async function POST(request: Request) {
  if (!isSameOrigin(request.headers.get("origin"), request.headers.get("host"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  // A missing or unreadable Content-Length is refused (it used to count as 0, so a chunked body was read in full before any size check).
  const declaredBytes = Number(request.headers.get("content-length") ?? NaN);
  if (!Number.isFinite(declaredBytes)) return NextResponse.json({ error: "Length required." }, { status: 411 });
  if (declaredBytes > 6 * 1024 * 1024) return NextResponse.json({ error: "Too large." }, { status: 413 });
  try {
    let form: FormData | null = null;
    try { form = await request.formData(); } catch { form = null; }
    const out = await handlePhotoPost(form, await ctxOf());
    return NextResponse.json(out.body, { status: out.status, headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("employee photo:", e);
    return NextResponse.json({ error: "The photo could not be saved just now. Please try again." }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const out = await handlePhotoGet(url.searchParams, await ctxOf(), request.headers.get("if-none-match"));
    if (out.bytes) return new Response(new Uint8Array(out.bytes), { status: out.status, headers: out.headers });
    if (out.json) return NextResponse.json(out.json, { status: out.status, headers: out.headers });
    return new Response(null, { status: out.status, headers: out.headers });
  } catch (e) {
    console.error("employee photo:", e);
    return NextResponse.json({ error: "The photo could not be read just now." }, { status: 500 });
  }
}
