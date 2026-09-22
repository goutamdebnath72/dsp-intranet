// src/app/api/circulars/route.ts
import { NextResponse } from "next/server";
import { put, del } from "@vercel/blob";
import { getDb } from "@/lib/db";
import { Circular } from "@/lib/db/models/circular.model";
import { DateTime } from "luxon";
import { Client as QStashClient } from "@upstash/qstash";

const qstash = new QStashClient({ token: process.env.QSTASH_TOKEN! });

// Base URL of THIS deployment, so QStash knows where to call back.
// VERCEL_URL is set automatically on every Vercel deployment (no manual
// config needed) but omits the protocol -- always https there. APP_BASE_URL
// is an escape hatch for local dev against a real QStash account (QStash
// needs a URL it can actually reach over the internet, so plain
// http://localhost will not work without a tunnel).
function getBaseUrl(): string {
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

/* ============================================================
   POST: Enqueue a circular for processing.

   This used to do everything synchronously: render the PDF, run dual-pass
   OCR on every page, generate embeddings, and commit it all in one
   request/response cycle. That routinely exceeded Vercel's serverless
   function duration ceiling (300s, a HARD platform limit on the Hobby
   plan -- confirmed directly via the dashboard, which rejects any
   maxDuration above 300 outright) on multi-page documents, producing a
   504 Gateway Timeout.

   Now this route only does the fast part: validate, upload the original
   file once, create a placeholder DB row (status: "processing"), and
   enqueue a background job via Upstash QStash to do the actual heavy
   work in src/app/api/circulars/process/route.ts -- a separate function
   invocation with its own independent time budget, decoupled from this
   request entirely.
============================================================ */
export async function POST(req: Request) {
  const dataSource = await getDb();
  let rawBlobUrl: string | null = null;

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const rawHeadline = formData.get("headline") as string;
    // Circular's own issue date, sent by the date picker as an ISO date
    // string (e.g. "2024-08-20"). This drives the year tab.
    const rawPublishedAt = formData.get("publishedAt")?.toString() || "";

    // Safely cast to string or undefined to satisfy TypeORM
    const authorTicketNo =
      formData.get("authorTicketNo")?.toString() || undefined;

    if (!rawHeadline || !file) {
      console.warn("POST /api/circulars missing headline or file");
      return NextResponse.json(
        { error: "Missing headline or file" },
        { status: 400 },
      );
    }

    // Auto-cleaner: strips leading numbers/dots (e.g., "108. ")
    const headline = rawHeadline.replace(/^\s*\d+[\.\-\s]+/, "").trim();

    // publishedAt is REQUIRED and comes only from the picker — no more
    // guessing the year from the headline. Reject if missing or unparseable.
    if (!rawPublishedAt) {
      return NextResponse.json(
        { error: "Missing circular date" },
        { status: 400 },
      );
    }
    const publishedAt = DateTime.fromISO(rawPublishedAt);
    if (!publishedAt.isValid) {
      return NextResponse.json(
        { error: "Invalid circular date" },
        { status: 400 },
      );
    }

    if (!file.type.startsWith("image/") && file.type !== "application/pdf") {
      console.warn("Unsupported file type:", file.type);
      return NextResponse.json(
        { error: "Unsupported file type. Upload PDF or image." },
        { status: 400 },
      );
    }

    // Server-stamped upload time — tamper-proof, never from the client.
    const uploadedAt = DateTime.now();

    console.log(
      `UPLOAD START (enqueue): filename="${file.name}", cleaned headline="${headline}"`,
    );

    const fileBytes = Buffer.from(await file.arrayBuffer());

    // Cheap page-count read for PDFs -- pdf-parse's metadata pass, not the
    // full render+OCR pipeline, so this stays fast even in this
    // fast-response enqueue path. Lets the frontend show a time estimate
    // based on THIS document's actual size rather than a generic guess.
    // Failure here is non-fatal: the upload can proceed without an
    // estimate, it just won't have a document-specific one.
    let pageCount: number | null = null;
    if (file.type === "application/pdf") {
      try {
        const pdfParseModule: any = await import("pdf-parse");
        const parseFn: any = pdfParseModule?.default ?? pdfParseModule;
        const parsed: any = await parseFn(fileBytes);
        pageCount = parsed?.numpages ?? null;
      } catch (e) {
        console.warn(
          "Cheap page-count read failed (non-fatal, proceeding without estimate):",
          (e as any)?.message || e,
        );
      }
    } else if (file.type.startsWith("image/")) {
      pageCount = 1;
    }

    // Upload the ORIGINAL file once, fast. The background job fetches this
    // same blob to do the actual rendering/OCR — so the QStash message
    // payload only needs to carry a URL + metadata, never the file bytes
    // themselves.
    const rawKey = `circulars/raw/${Date.now()}_${file.name}`;
    const { url } = await put(rawKey, fileBytes, {
      access: "public",
      contentType: file.type,
    });
    rawBlobUrl = url;

    // Placeholder row — no serialNumber yet (assigned once processing
    // completes, in the same transaction that used to run synchronously
    // here). fileUrls starts pointing at the raw upload so nothing is ever
    // orphaned/unlinked even if processing fails outright before ever
    // rendering a single page.
    const repo = dataSource.getRepository<Circular>("Circular");
    const placeholder = repo.create({
      headline,
      fileUrls: [rawBlobUrl],
      publishedAt,
      uploadedAt,
      authorTicketNo,
      status: "processing",
      pageCount,
    });
    const saved = await repo.save(placeholder);

    try {
      await qstash.publishJSON({
        url: `${getBaseUrl()}/api/circulars/process`,
        body: {
          circularId: saved.id,
          rawBlobUrl,
          fileType: file.type,
          fileName: file.name,
        },
        retries: 3,
      });
    } catch (qErr: any) {
      // Could never even enqueue the job — no job will ever pick this row
      // up, so leaving it as a permanent "processing" row would be worse
      // than a clean rollback. Matches this project's existing "a failure
      // before commit leaves zero database trace" convention.
      await repo.delete(saved.id).catch(() => {});
      throw qErr;
    }

    console.log(
      `UPLOAD ENQUEUED: circular id=${saved.id}, queued for background processing.`,
    );

    return NextResponse.json(
      {
        message: "Circular queued for processing",
        circular: saved,
      },
      { status: 202 }, // 202 Accepted: request valid, work not yet done
    );
  } catch (err: any) {
    console.error(
      "Circular upload (enqueue phase) failed:",
      err?.message || err,
    );
    if (rawBlobUrl) {
      await del(rawBlobUrl).catch(() => {});
    }
    return NextResponse.json(
      { error: err?.message || "Upload failed" },
      { status: 500 },
    );
  }
}

/* ============================================================
   GET: Fetch circulars, scoped by year.

   This used to fetch EVERY circular from EVERY year in one request. With
   ~500 circulars/year in practice, that only gets slower and heavier every
   year the archive grows -- and it made the "no circulars found" empty
   state flash misleadingly before data ever arrived, since the whole
   (large, slow) fetch had to finish before anything could render.

   Two modes now:
   - ?meta=years  -> just the distinct years that have circulars, cheap and
     rarely-changing, used to render the year-tab selector without pulling
     any circular rows at all.
   - ?year=YYYY   -> only that year's circulars (the normal case).
   No params defaults to the current calendar year rather than silently
   reintroducing a fetch-everything fallback.
============================================================ */
export async function GET(req: Request) {
  const dataSource = await getDb();
  const { searchParams } = new URL(req.url);

  try {
    if (searchParams.get("meta") === "years") {
      const rows: Array<{ year: string }> = await dataSource.query(`
        SELECT DISTINCT EXTRACT(YEAR FROM "publishedAt")::int::text AS year
        FROM public.circulars
        WHERE "publishedAt" IS NOT NULL
        ORDER BY year DESC
      `);
      return NextResponse.json(rows.map((r) => r.year));
    }

    const yearParam = searchParams.get("year");
    const year = yearParam
      ? Number.parseInt(yearParam, 10)
      : new Date().getFullYear();

    if (!Number.isFinite(year)) {
      return NextResponse.json({ error: "Invalid year" }, { status: 400 });
    }

    const circulars = await dataSource.query(
      `
        SELECT
          id,
          headline,
          "fileUrls",
          "publishedAt",
          "uploadedAt",
          "serialNumber",
          "authorTicketNo",
          status,
          "processingError",
          "pageCount"
        FROM public.circulars
        WHERE EXTRACT(YEAR FROM "publishedAt") = $1
        ORDER BY "serialNumber" DESC, id DESC
      `,
      [year],
    );

    return NextResponse.json(circulars);
  } catch (err: any) {
    console.error("GET circulars failed:", err);
    return NextResponse.json(
      { error: "Failed to fetch circulars" },
      { status: 500 },
    );
  }
}
