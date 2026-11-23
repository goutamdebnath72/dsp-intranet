// src/app/api/announcements/admin/route.ts
//
// POST /api/announcements/admin
// This is the endpoint of the Announcement Manager facility (Modular Facility Kit).
// I protect it with a same-origin check, session verification and granular authority.

import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { errorReply, handleAnnouncementAdmin, isSameOrigin } from "@/lib/announcements/admin/api";
import { sessionActor, typeormAnnouncementDb } from "@/lib/announcements/admin/access";
import { realIndexDeps } from "@/lib/announcements/searchIndex/defaults";
import { MAX_PDF_BYTES, readUploadForm, type UploadedPdf } from "@/lib/announcements/attachment";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
// In this request a PDF of up to 10 MB is read and put into storage, and is then read page by page for the search bar (the circular upload's own reading), so I set it up to the platform's ceiling for this plan
export const maxDuration = 300;

export async function POST(request: Request) {
  if (!isSameOrigin(request.headers.get("origin"), request.headers.get("host"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // I use JSON for everything, and a multipart form when a publish or an edit carries a PDF (fields op, title, content, date, id, version, removeFile and the file called "file").
  let body: unknown;
  let upload: UploadedPdf | null = null;
  if ((request.headers.get("content-type") || "").toLowerCase().startsWith("multipart/form-data")) {
    try {
      const form = await readUploadForm(await request.formData());
      if (form.tooBig) return NextResponse.json({ error: `The PDF is larger than ${MAX_PDF_BYTES / (1024 * 1024)} MB.` }, { status: 413 });
      body = form.body;
      upload = form.file;
    } catch {
      return NextResponse.json({ error: "Bad request: the upload could not be read." }, { status: 400 });
    }
  } else {
    try {
      const raw = await request.text();
      body = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: "Bad request: invalid JSON body." }, { status: 400 });
    }
  }

  try {
    const ds = await getDb();
    const { searchEmployeesById, searchEmployeesByName } = await import("@/lib/search/employeeSearch");

    const out = await handleAnnouncementAdmin(body, {
      actor: await sessionActor(ds),
      db: typeormAnnouncementDb(ds),
      upload,
      indexDeps: realIndexDeps(),
      findByName: (name) => searchEmployeesByName(ds, name),
      findByTicket: (ticket) => searchEmployeesById(ds, { kind: "ticket", value: ticket }),
    });

    return NextResponse.json(out.body, {
      status: out.status,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    console.error("[announcements/admin] route error:", e);
    const out = errorReply(e);
    return NextResponse.json(out.body, { status: out.status });
  }
}
