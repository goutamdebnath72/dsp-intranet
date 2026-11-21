// src/app/api/history-docs/[doc]/route.ts
//
// GET /api/history-docs/<id>           a plant document the DSP history card cites (a JO Manual), shown in the browser; signed-in readers only
// GET /api/history-docs/<id>?info=1    {title, pages, bytes} as JSON (what the card's viewer asks first, to know whether to show the PDF or the Sign in button)
// The work is in src/tools/dsphistory/serve.ts; the files are put in Vercel Blob by scripts/upload-history-docs.mjs.

import { getSessionTicket } from "@/lib/apiAuth";
import { serveDoc } from "@/tools/dsphistory/serve";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET(request: Request, { params }: { params: Promise<{ doc: string }> }) {
  return serveDoc(request, (await params).doc, {
    ticket: getSessionTicket,
    async find(blobName) {
      const { list } = await import("@vercel/blob");
      const { blobs } = await list({ prefix: blobName.replace(/\.pdf$/, "") });
      const b = blobs.find((x) => x.pathname.endsWith(".pdf")) ?? null;
      return b ? { url: b.url, size: b.size } : null;
    },
    get: (url, init) => fetch(url, { ...init, cache: "no-store" }),
  });
}
