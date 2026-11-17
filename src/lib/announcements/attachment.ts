// src/lib/announcements/attachment.ts
//
// THE PDF OF AN ANNOUNCEMENT (pure; nothing here touches the database or the screen). An announcement can carry ONE PDF, with or without body text: "SAIL DARPAN | Frequently Asked Questions" and the
// SAIL policy on sexual harassment at the workplace are announcements that are only a title and a PDF. The file is kept in Vercel Blob (the same place the circulars' and the employees' files go); its
// address stays on the server: the browser only ever uses our own route, GET /api/announcements/<id>/file, which is open to whoever may read the announcements (they are public on the home page).
// What the database holds about the file is in public.announcement_file (src/lib/nl2sql/sql/28_announcement_file.sql); the writing is in admin/files.ts and admin/store.ts.

/** The largest PDF accepted (the circulars' upload allows 15 MB; an announcement's PDF is a notice or a policy, so less). */
export const MAX_PDF_BYTES = 10 * 1024 * 1024;

/** What the screen is told about a file: never its address. */
export interface AnnouncementFileInfo {
  name: string;
  bytes: number;
}

/** A file as it arrives from the upload form. */
export interface UploadedPdf {
  name: string;
  bytes: Buffer;
}

/** Our own route that serves the file of an announcement (inline in the viewer, or as a download with ?download=1; ?info=1 answers {name, bytes} as JSON). */
export const fileRoute = (id: number): string => `/api/announcements/${id}/file`;

/**
 * The name the reader sees and the download gets: no folders, no control characters, no quotes or slashes, at most 120 characters, always ending in .pdf. An empty or hostile name becomes
 * "attachment.pdf".
 */
export function cleanFileName(raw: unknown): string {
  let s = String(raw ?? "");
  s = s.split(/[\\/]/).pop() ?? ""; // a path becomes its last part
  s = s.replace(/[\u0000-\u001f\u007f"<>:|?*]/g, " ").replace(/\s+/g, " ").trim();
  while (/\.pdf$/i.test(s)) s = s.slice(0, -4).trim(); // "a.pdf.pdf" is one .pdf
  s = s.replace(/^\.+/, "").trim();
  if (s.length > 116) s = s.slice(0, 116).trim();
  return s ? `${s}.pdf` : "attachment.pdf";
}

export type PdfCheck = { ok: true; name: string } | { ok: false; reason: string };

/** Is this a PDF we accept? Judged by the bytes (the "%PDF-" header), not by what the browser says it is; and by size. */
export function checkPdf(file: UploadedPdf | null | undefined): PdfCheck {
  if (!file || !file.bytes || file.bytes.length === 0) return { ok: false, reason: "The file is empty." };
  if (file.bytes.length > MAX_PDF_BYTES) return { ok: false, reason: `The PDF is larger than ${MAX_PDF_BYTES / (1024 * 1024)} MB.` };
  const head = file.bytes.subarray(0, 1024).toString("latin1");
  if (!head.includes("%PDF-")) return { ok: false, reason: "The file is not a PDF." };
  if (!/\.pdf$/i.test(String(file.name ?? ""))) return { ok: false, reason: "Only a file whose name ends in .pdf can be attached." };
  return { ok: true, name: cleanFileName(file.name) };
}

/** "2.3 MB", "540 KB", "812 bytes". */
export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "";
  if (n < 1024) return `${Math.round(n)} bytes`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** The headers of a served file. `download` makes the browser save it instead of showing it. The name goes in twice (plain and UTF-8 encoded) so that Hindi or Bengali file names survive. */
export function fileHeaders(name: string, bytes: number, download: boolean): Record<string, string> {
  const clean = cleanFileName(name);
  const ascii = clean.replace(/[^\x20-\x7e]/g, "_").replace(/%/g, "_");
  return {
    "Content-Type": "application/pdf",
    "Content-Length": String(bytes),
    "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(clean)}`,
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "private, no-cache",
  };
}

/** Where the files are kept. `blobFileStorage` is the real one; `memoryFileStorage` is for the tests. */
export interface FileStorage {
  put(path: string, body: Buffer, contentType: string): Promise<string>;
  get(url: string): Promise<Buffer | null>;
  del(urls: string[]): Promise<void>;
}

export function blobFileStorage(): FileStorage {
  return {
    async put(path, body, contentType) {
      const { put } = await import("@vercel/blob");
      return (await put(path, body, { access: "public", addRandomSuffix: true, contentType })).url;
    },
    async get(url) {
      const r = await fetch(url, { cache: "no-store" });
      return r.ok ? Buffer.from(await r.arrayBuffer()) : null;
    },
    async del(urls) {
      if (urls.length === 0) return;
      const { del } = await import("@vercel/blob");
      await del(urls);
    },
  };
}

export function memoryFileStorage(): FileStorage & { urls(): string[] } {
  const files = new Map<string, Buffer>();
  let n = 0;
  return {
    async put(path, body) { const url = `memory://${path}-${++n}`; files.set(url, body); return url; },
    async get(url) { return files.get(url) ?? null; },
    async del(urls) { for (const u of urls) files.delete(u); },
    urls: () => Array.from(files.keys()),
  };
}

/**
 * Turns the upload form (multipart) into what the Announcement Manager's JSON endpoint takes, plus the file. The numbers of the form are text there; `removeFile` is "true" or absent.
 * A field that is not text is ignored; so is any file but the one called "file".
 */
export async function readUploadForm(form: FormData): Promise<{ body: Record<string, unknown>; file: UploadedPdf | null; tooBig: boolean }> {
  const body: Record<string, unknown> = {};
  let file: UploadedPdf | null = null;
  let tooBig = false;
  for (const [key, value] of form.entries()) {
    if (typeof value === "string") {
      body[key] = key === "id" || key === "limit" ? Number(value) : key === "removeFile" ? value === "true" : value;
    } else if (key === "file" && typeof (value as File).arrayBuffer === "function") {
      const f = value as File;
      if (f.size > MAX_PDF_BYTES) { tooBig = true; continue; } // refused before it is read into memory
      file = { name: f.name, bytes: Buffer.from(await f.arrayBuffer()) };
    }
  }
  return { body, file, tooBig };
}
