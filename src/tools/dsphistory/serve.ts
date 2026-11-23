// src/tools/dsphistory/serve.ts
//
// This serves a plant document. I kept Next.js out of it so that it can be tested: the route src/app/api/history-docs/[doc]/route.ts hands its request and the real dependencies to `serveDoc`.
//   * An internal document (a JO Manual): a reader who is not signed in gets 401 and is told to sign in (the viewer then shows its Sign in button). A published PDF (Steel Cities, an annual report...) is public: no sign-in.
//     The address of the file in Vercel Blob never leaves the server.
//   * An unknown document id is 404, and so is a document that has not been uploaded yet.
//   * ?info=1 answers {title, pages, bytes} as JSON; otherwise the PDF, inline. A Range request (the browser's PDF viewer asks for the pages it needs) is passed to Blob and answered 206, so that a page far
//     into a manual opens at once without the whole file being sent first.
import { DOCS, isPublic } from "./docs";

export interface ServeDeps {
  /** The signed-in reader's ticket, or null. */
  ticket: () => Promise<string | null>;
  /** Finds the file kept under this name in Blob: its address and size, or null when it is not there. */
  find: (blobName: string) => Promise<{ url: string; size: number } | null>;
  /** The fetch to use; a test passes its own. */
  get: (url: string, init: { headers: Record<string, string> }) => Promise<Response>;
}

const NO_STORE = { "Cache-Control": "private, no-store" };
const json = (body: unknown, status: number): Response => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...NO_STORE } });

export async function serveDoc(request: Request, id: string, deps: ServeDeps): Promise<Response> {
  const doc = Object.prototype.hasOwnProperty.call(DOCS, id) ? DOCS[id] : null;
  if (!doc) return json({ error: "Not found" }, 404);
  if (!isPublic(doc) && !(await deps.ticket())) return json({ error: "Please sign in to read this document." }, 401);
  const found = await deps.find(doc.blobName).catch(() => null);
  if (!found) return json({ error: "This document has not been uploaded yet." }, 404);

  if (new URL(request.url).searchParams.get("info") === "1") return json({ title: doc.title, ...(doc.pages ? { pages: doc.pages } : {}), bytes: found.size }, 200);

  const range = request.headers.get("range");
  const upstream = await deps.get(found.url, { headers: range && /^bytes=\d*-\d*$/.test(range) ? { Range: range } : {} }).catch(() => null);
  if (!upstream || !(upstream.status === 200 || upstream.status === 206) || !upstream.body) return json({ error: "The document could not be read just now. Please try again." }, 502);

  const headers: Record<string, string> = {
    "Content-Type": "application/pdf",
    "Content-Disposition": `inline; filename="${doc.blobName.split("/").pop()}"`,
    "Accept-Ranges": "bytes",
    "X-Content-Type-Options": "nosniff",
    ...NO_STORE,
  };
  const len = upstream.headers.get("content-length");
  if (len) headers["Content-Length"] = len;
  const cr = upstream.headers.get("content-range");
  if (upstream.status === 206 && cr) headers["Content-Range"] = cr;
  return new Response(upstream.body, { status: upstream.status, headers });
}
