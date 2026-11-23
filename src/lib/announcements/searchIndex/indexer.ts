// src/lib/announcements/searchIndex/indexer.ts
//
// I prepare an announcement for the search bar the way a circular is prepared, in two PARTS that can each be redone alone:
//   * THE BODY: the announcement's own text is cut into 200-word passages (the circulars' chunking, src/lib/ingestion/chunking.ts), each with a vector (source 'body').
//   * THE PDF: read page by page (reader.ts): a true PDF from its own text layer, a page without a usable one (a scan, an infographic) by Gemini, as a circular's pages are; the picture of every page is kept in storage
//     (as circulars keep theirs); the text is cut into 200-word passages per page, each with a vector (source 'pdf'); the whole text is kept.
// Then I make the announcement's own vector again from title, body and the start of the PDF's text (embedAnnouncement), as a circular's whole-document vector is.
//
// MY RULES (the circulars' own, and no more lenient):
//   * I make ALL vectors BEFORE anything is written: if a passage's vector cannot be made, that part is not saved at all (I never store an unsearchable passage and call it a success); the failure is recorded
//     with its reason, and the manager can index it again.
//   * Page pictures go into storage before the database write and are TRACKED: if the part then fails, I take them out again; the pictures of what it replaces are taken out after the commit. A failure leaves no trace.
//   * A page that cannot be read is named in the note; the pages that were read are kept. If NO page has text, it is a failure.
//   * It never throws: publishing or editing an announcement must not fail because its text or PDF could not be prepared. The answer says what happened.
//   * At most MAX_PAGES pages are read (the time of one request); a longer PDF is prepared up to there and the note says so.
// Everything outside the logic (page reading, embedding, storage, database, clock) is injected, so it can be tested without network access.

import type { FacilityDb } from "@/lib/facility/types";
import type { FileStorage } from "@/lib/announcements/attachment";
import { buildPageUnits, planChunks } from "@/lib/ingestion/chunking";
import { ensureIndexTables, saveBodyFailure, saveBodyIndex, savePdfFailure, savePdfIndex, type IndexedChunk } from "./tables";

/** The most pages I read from one PDF, to limit the time and cost of one request. */
export const MAX_PAGES = 40;
/** The time I allow for reading the pages, counted from the start of the request. */
export const READ_BUDGET_MS = 170_000;

export interface PageRead {
  /** Text of the page; I use "" when none could be had. */
  text: string;
  /** Where the text came from: the PDF's own text, AI reading, or nowhere. */
  via: "text" | "ocr" | "none";
  /** Why a page has no text, or only part of it. */
  reason?: string;
}

export interface PdfReading {
  /** The pages that were read, in order (index 0 = page 1). */
  pages: PageRead[];
  /** The picture (PNG) of each page, by the same index; null where it could not be drawn. */
  images: Array<Buffer | null>;
  /** The PDF has this many pages in all; this is more than were read when it exceeds MAX_PAGES. */
  totalPages: number;
}

export interface IndexDeps {
  /** Reads the PDF page by page; the real one is reader.ts. */
  read(bytes: Buffer, deadlineAt: number): Promise<PdfReading>;
  /** Gives one vector for one text (a stored document: RETRIEVAL_DOCUMENT), already normalised. */
  embed(text: string): Promise<number[]>;
  /** Makes the announcement's own vector again once its parts are saved (embedAnnouncement). */
  reEmbedRecord(id: number): Promise<unknown>;
  /** Where I keep the page pictures. */
  storage: FileStorage;
  now(): number;
}

export type BodyOutcome = { status: "none" } | { status: "ready"; chunks: number } | { status: "failed"; note: string };
export type PdfOutcome =
  | { status: "ready"; pages: number; textPages: number; ocrPages: number; chunks: number; note: string | null }
  | { status: "failed"; note: string };
export interface IndexOutcome {
  /** I set failed if any part failed, ready if a part was prepared, and none if there was nothing to prepare. */
  status: "ready" | "failed" | "none";
  body?: BodyOutcome;
  pdf?: PdfOutcome;
}

const vector = (v: number[]) => `[${v.join(",")}]`;
const reasonOf = (e: unknown, max = 200) => String((e as Error)?.message ?? e).slice(0, max);
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** A sentence or two for the manager, written from what happened. */
export function describeOutcome(o: IndexOutcome): string {
  const out: string[] = [];
  if (o.pdf?.status === "ready") {
    const p = o.pdf;
    const how = p.ocrPages > 0 ? ` (${p.textPages} from its own text, ${p.ocrPages} read by AI)` : p.textPages > 0 ? " (from its own text)" : "";
    out.push(`The PDF was read for the search bar: ${plural(p.pages, "page")}${how}, ${plural(p.chunks, "passage")}.${p.note ? ` ${p.note}` : ""}`);
  } else if (o.pdf?.status === "failed") {
    out.push(`The PDF could not be read for the search bar: ${o.pdf.note}`);
  }
  if (o.body?.status === "ready") out.push(`The text was indexed for the search bar (${plural(o.body.chunks, "passage")}).`);
  else if (o.body?.status === "failed") out.push(`The text could not be indexed for the search bar (${o.body.note}); its words are still found literally.`);
  return out.join(" ");
}

function overall(body: BodyOutcome | undefined, pdf: PdfOutcome | undefined): IndexOutcome["status"] {
  if (body?.status === "failed" || pdf?.status === "failed") return "failed";
  if (body?.status === "ready" || pdf?.status === "ready") return "ready";
  return "none";
}

async function embedAll(deps: IndexDeps, planned: Array<{ index: number; page: number; text: string }>): Promise<IndexedChunk[]> {
  const out: IndexedChunk[] = [];
  for (const c of planned) out.push({ index: c.index, page: c.page, text: c.text, vector: vector(await deps.embed(c.text)) });
  return out;
}

const missingTables = (e: unknown) => {
  const code = (e as { code?: string; driverError?: { code?: string } })?.code ?? (e as { driverError?: { code?: string } })?.driverError?.code;
  return code === "42501" || code === "42P01";
};
const SQL_HINT = "the database tables for it are missing: run src/lib/nl2sql/sql/29_announcement_search_index.sql once in the Supabase SQL editor";

/** THE BODY: I build its passages here. An empty body clears them. */
export async function indexBody(db: FacilityDb, deps: IndexDeps, input: { id: number; bodyText: string | null }): Promise<BodyOutcome> {
  const text = (input.bodyText ?? "").replace(/\s+/g, " ").trim();
  const planned = text ? planChunks(buildPageUnits([], text)) : [];
  let chunks: IndexedChunk[];
  try {
    chunks = await embedAll(deps, planned);
  } catch (e) {
    const note = `the passages could not be given vectors: ${reasonOf(e)}`;
    try { await db.run(async (q) => { await ensureIndexTables(q); await saveBodyFailure(q, input.id, note); }); } catch { /* Not even the failure could be recorded, so I let the outcome say it. */ }
    return { status: "failed", note };
  }
  if (chunks.length === 0 && !text) {
    // Nothing to prepare, and nothing may be left of an older text, so I clear it; no tables yet means nothing to clear.
    try { await db.run(async (q) => saveBodyIndex(q, input.id, { chunks: [] })); } catch { /* With no tables there is nothing to clear. */ }
    return { status: "none" };
  }
  try {
    await db.run(async (q) => {
      await ensureIndexTables(q);
      await saveBodyIndex(q, input.id, { chunks });
    });
  } catch (e) {
    return { status: "failed", note: missingTables(e) ? SQL_HINT : "the passages could not be saved" };
  }
  return { status: "ready", chunks: chunks.length };
}

/** THE PDF: here I handle its text (from the PDF itself, or read by AI), its page pictures and its passages. */
export async function indexPdf(db: FacilityDb, deps: IndexDeps, input: { id: number; bytes: Buffer }): Promise<PdfOutcome> {
  const started = deps.now();
  const uploaded: string[] = []; // pictures put in storage by THIS run: I take them out again if the run fails
  const dropOldPictures = async (urls: string[]) => { if (urls.length) await deps.storage.del(urls).catch(() => {}); };
  const fail = async (note: string): Promise<PdfOutcome> => {
    await dropOldPictures(uploaded);
    try {
      const old = await db.run(async (q) => {
        await ensureIndexTables(q);
        return savePdfFailure(q, input.id, note);
      });
      await dropOldPictures(old);
    } catch {
      /* The failure itself could not be recorded (no tables, and the database user may not create them); I still let the outcome say it. */
    }
    return { status: "failed", note };
  };

  let reading: PdfReading;
  try {
    reading = await deps.read(input.bytes, started + READ_BUDGET_MS);
  } catch (e) {
    return fail(reasonOf(e, 300) || "the PDF could not be opened");
  }

  const pageTexts = reading.pages.map((p) => (p.text || "").replace(/\s+/g, " ").trim());
  const withText = pageTexts.filter((t) => t.length > 0).length;
  if (withText === 0) {
    const why = reading.pages.find((p) => p.reason)?.reason;
    return fail(why ? `no page could be read (${why})` : "no text was found in it (a blank or unreadable PDF)");
  }
  const textPages = reading.pages.filter((p, i) => pageTexts[i] && p.via === "text").length;
  const ocrPages = reading.pages.filter((p, i) => pageTexts[i] && p.via === "ocr").length;

  const units = buildPageUnits(pageTexts, "");
  const planned = planChunks(units);
  const fullText = units.map((u) => u.text).join(" \n").trim();

  // Step 1: I make every vector before anything is written.
  let chunks: IndexedChunk[];
  try {
    chunks = await embedAll(deps, planned);
  } catch (e) {
    return fail(`the passages could not be given vectors (${reasonOf(e)}); nothing was saved, index it again later`);
  }

  // Step 2: the page pictures go into storage (tracked); a picture that cannot be stored is named, and the PDF is still prepared.
  const pageUrls = new Map<number, string>();
  const noPicture: number[] = [];
  for (let i = 0; i < reading.images.length && i < reading.pages.length; i++) {
    const png = reading.images[i];
    if (!png) { noPicture.push(i + 1); continue; }
    try {
      const url = await deps.storage.put(`announcements/pages/a${input.id}-p${i + 1}.png`, png, "image/png");
      uploaded.push(url);
      pageUrls.set(i + 1, url);
    } catch {
      noPicture.push(i + 1);
    }
  }

  const notes: string[] = [];
  const unread = reading.pages.map((p, i) => (pageTexts[i] ? 0 : i + 1)).filter(Boolean);
  if (unread.length) notes.push(`Page${unread.length === 1 ? "" : "s"} ${unread.join(", ")} could not be read.`);
  if (reading.totalPages > MAX_PAGES) notes.push(`Only the first ${MAX_PAGES} of ${reading.totalPages} pages were read.`);
  if (noPicture.length) notes.push(`The picture of page${noPicture.length === 1 ? "" : "s"} ${noPicture.join(", ")} was not kept.`);
  const note = notes.length ? notes.join(" ") : null;

  // Step 3: one write holds passages, pictures, text and state together.
  let old: string[];
  try {
    old = await db.run(async (q) => {
      await ensureIndexTables(q);
      return savePdfIndex(q, input.id, { chunks, text: fullText, pages: withText, textPages, ocrPages, note, pageUrls });
    });
  } catch (e) {
    return fail(missingTables(e) ? SQL_HINT : "the text could not be saved");
  }
  await dropOldPictures(old.filter((u) => !uploaded.includes(u))); // what it replaces
  return { status: "ready", pages: withText, textPages, ocrPages, chunks: chunks.length, note };
}

/**
 * Prepares what was just saved: the body when `bodyText` is given (null = it has none, so clear it; undefined = leave it), and the PDF when `bytes` is given. Then I make the announcement's own vector, once.
 * It never throws.
 */
export async function indexAnnouncement(db: FacilityDb, deps: IndexDeps, input: { id: number; bodyText?: string | null; bytes?: Buffer | null }): Promise<IndexOutcome> {
  let body: BodyOutcome | undefined;
  let pdf: PdfOutcome | undefined;
  try {
    if (input.bodyText !== undefined) body = await indexBody(db, deps, { id: input.id, bodyText: input.bodyText });
  } catch (e) {
    body = { status: "failed", note: reasonOf(e) };
  }
  try {
    if (input.bytes) pdf = await indexPdf(db, deps, { id: input.id, bytes: input.bytes });
  } catch (e) {
    pdf = { status: "failed", note: reasonOf(e) };
  }
  try { await deps.reEmbedRecord(input.id); } catch { /* The title and body keep their vector, or get it again at the next save. */ }
  return { status: overall(body, pdf), ...(body ? { body } : {}), ...(pdf ? { pdf } : {}) };
}
