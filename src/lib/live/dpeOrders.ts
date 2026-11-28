// src/lib/live/dpeOrders.ts
//
// THE QUARTERLY IDA ORDERS OF THE DEPARTMENT OF PUBLIC ENTERPRISES, READ FROM ITS OWN WEBSITE (so the card no longer waits for me to type a new order in by hand).
// Every quarter DPE issues an Office Memorandum "Revision of Industrial Dearness Allowance (IDA) Rates for Executives and Non-Unionized Supervisors of CPSEs - effective from 01.10.2026", with the rate for each pay scale
// ("... shall be 489.5% for the 1997 pay scale, 249.2% for the 2007 pay scale, and 59.1% for the 2017 pay scale"). dpe.gov.in draws its pages in the browser from an open WordPress service (the same address the site itself
// calls: www.dpe.gov.in/cms/wp-json/wp/v2), whose list of central documents gives, for each order, the title (with the day it takes effect), the date it was put on the site and a link to the PDF.
// WHAT I TAKE: only the 2017 pay scale's rate, because that is the one the card is about (SAIL's executives); and only from the order's own words. WHAT I DO NOT DO: guess. The orders of April and July 2026 and of October 2025
// are scanned pictures (no text in the PDF), and the order of October 2026 has a text layer; I read the rate where there is text, and where there is only a picture I give the order and its link and say the rate has to be read
// from it (the rates I read from the pictures by eye are in aicpi.ts, IDA_ANNOUNCED). A rate that is not a plausible one for the 2017 scales is thrown away, not shown.
// WHAT GOES OUT: fixed public addresses only; nothing typed by anybody.
import { DateTime } from "luxon";

export const DPE_API = "https://www.dpe.gov.in/cms/wp-json/wp/v2";
/** The newest first; DPE's own search by the word in the title of every order of the kind */
export const ORDER_LIST_URL = `${DPE_API}/central_documents?search=dearness&orderby=date&order=desc&per_page=40&_fields=id,date,modified,title,acf`;
export const mediaUrl = (id: number): string => `${DPE_API}/media/${id}?_fields=source_url,mime_type`;
/** How many of the newest orders I look into (a little more than a year of quarters) */
export const MAX_ORDERS = 6;

export interface DpeOrder {
  /** The day the rate takes effect, YYYY-MM-DD */
  from: string;
  /** The day DPE put the order on its website, YYYY-MM-DD (the Office Memorandum's own date is usually a few days earlier) */
  postedOn: string;
  /** The 2017-scale rate in the order's own words, when the PDF has text and the sentence is there; null when the PDF is a picture or the sentence is not found */
  rate: number | null;
  /** The Office Memorandum's number and date, read from the text (null for a picture) */
  omNo: string | null;
  omDate: string | null;
  /** The PDF itself, so that anyone can open the order */
  pdf: string | null;
}

interface ListRecord {
  id: number;
  date: string;
  modified?: string;
  title?: { rendered?: string };
  acf?: { title?: string; pdf?: number | null };
}

const decode = (s: string): string => s.replace(/&#8211;|&#8212;|&ndash;|&mdash;/g, "-").replace(/&amp;/g, "&").replace(/&#038;/g, "&").replace(/&#8217;|&#039;/g, "'").replace(/\s+/g, " ").trim();

/** One record of DPE's list, when it is a quarterly IDA order of the executives: its day of effect and its PDF; otherwise null. */
export function orderOf(r: ListRecord): { id: number; key: string; from: string; postedOn: string; pdfId: number | null } | null {
  const title = decode(r.acf?.title || r.title?.rendered || "");
  // "... (IDA) Rates for Executives ... of CPSEs - effective from 01.10.2026"
  if (!/\bIDA\)?\s+Rates\b/i.test(title) || !/Executives/i.test(title)) return null;
  const m = /effective\s+from\s+(\d{2})\.(\d{2})\.(\d{4})/i.exec(title);
  if (!m) return null;
  const day = DateTime.fromObject({ year: Number(m[3]), month: Number(m[2]), day: Number(m[1]) });
  // a quarter begins on the 1st of January, April, July or October
  if (!day.isValid || day.day !== 1 || ![1, 4, 7, 10].includes(day.month)) return null;
  const posted = DateTime.fromISO(r.date);
  return { id: r.id, key: `${r.id}@${r.modified ?? r.date}`, from: day.toISODate() as string, postedOn: posted.isValid ? (posted.toISODate() as string) : day.toISODate() as string, pdfId: typeof r.acf?.pdf === "number" ? r.acf.pdf : null };
}

/** DPE's list as the newest MAX_ORDERS orders of the kind, one for each day of effect (the later posting wins when an order is put up again), newest first. */
export function parseOrderList(json: unknown): Array<NonNullable<ReturnType<typeof orderOf>>> {
  if (!Array.isArray(json)) return [];
  const byDay = new Map<string, NonNullable<ReturnType<typeof orderOf>>>();
  for (const r of json as ListRecord[]) {
    const o = r && typeof r === "object" ? orderOf(r) : null;
    if (!o) continue;
    const had = byDay.get(o.from);
    if (!had || o.postedOn > had.postedOn) byDay.set(o.from, o);
  }
  return [...byDay.values()].sort((a, b) => (a.from < b.from ? 1 : -1)).slice(0, MAX_ORDERS);
}

/** The media record's PDF address, only when it is a PDF on DPE's own site. */
export function pdfAddress(json: unknown): string | null {
  const j = json as { source_url?: unknown; mime_type?: unknown } | null;
  if (!j || typeof j.source_url !== "string") return null;
  try {
    const u = new URL(j.source_url);
    return u.protocol === "https:" && /(^|\.)dpe\.gov\.in$/.test(u.hostname) && /\.pdf$/i.test(u.pathname) ? u.toString() : null;
  } catch {
    return null;
  }
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/** "27th October 2026", "17th July 2026", "24.04.2026", "29th October, 2025" -> "2026-10-27" */
export function dayIn(text: string): string | null {
  const a = /(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?([A-Za-z]{3,9}),?\s+(\d{4})/.exec(text);
  if (a) {
    const mo = MONTHS.findIndex((x) => x.startsWith(a[2].toLowerCase().slice(0, 3)));
    if (mo >= 0) { const d = DateTime.fromObject({ year: Number(a[3]), month: mo + 1, day: Number(a[1]) }); if (d.isValid) return d.toISODate(); }
  }
  const b = /(\d{1,2})[./](\d{1,2})[./](\d{4})/.exec(text);
  if (b) { const d = DateTime.fromObject({ year: Number(b[3]), month: Number(b[2]), day: Number(b[1]) }); if (d.isValid) return d.toISODate(); }
  return null;
}

/** What the text of an order's PDF says: its number and date, and the rate for the 2017 scales (each null when the words are not there). A PDF with no text (a scan) gives all null. */
export function readOrderText(raw: string): { rate: number | null; omNo: string | null; omDate: string | null } {
  const text = raw.replace(/\s+/g, " ").trim();
  if (text.length < 80) return { rate: null, omNo: null, omDate: null };
  // "... shall be 489.5% for the 1997 pay scale, 249.2% for the 2007 pay scale, and 59.1% for the 2017 pay scale"
  const rates = new Set<number>();
  for (const m of text.matchAll(/(\d{1,3}(?:\.\d{1,2})?)\s*%\s+for\s+the\s+2017\s+pay\s*scales?/gi)) rates.add(Number(m[1]));
  // a table row: "2017 | 51.8%"
  for (const m of text.matchAll(/\b2017\s+(\d{1,3}\.\d{1,2})\s*%/g)) rates.add(Number(m[1]));
  const found = [...rates].filter((x) => x > 20 && x < 150);
  // two different figures for one scale is not an order I can read: I say nothing
  const rate = found.length === 1 ? found[0] : null;
  const omNo = /No\.\s*(W-\d{2}\/\d{4}\/\d{4}-DPE\(WC\)[^\s]*)/i.exec(text)?.[1] ?? null;
  const dated = /Dated\s*:?\s*(?:the\s+)?([^A-Za-z]{0,3}\d{1,2}(?:st|nd|rd|th)?[\s.][A-Za-z0-9./ ,]{3,20}?\d{4})/i.exec(text)?.[1];
  return { rate, omNo, omDate: dated ? dayIn(dated) : null };
}

export interface DpeDeps {
  getJson: (url: string) => Promise<unknown>;
  getPdf: (url: string) => Promise<Uint8Array>;
  pdfText: (bytes: Uint8Array) => Promise<string>;
}

const read = new Map<string, DpeOrder>();

/**
 * The newest quarterly orders with what could be read of each. An order that has been read is kept (its key holds its id and its "modified" time, so a re-posted order is read again). A failure of one order (its media record or its
 * PDF) leaves that order with no rate and no link; a failure of the list is an empty answer. Nothing here throws.
 */
export async function loadDpeOrders(deps: DpeDeps): Promise<DpeOrder[]> {
  let list: ReturnType<typeof parseOrderList>;
  try {
    list = parseOrderList(await deps.getJson(ORDER_LIST_URL));
  } catch {
    return [];
  }
  const out = await Promise.all(list.map(async (o): Promise<DpeOrder> => {
    const kept = read.get(o.key);
    if (kept) return kept;
    let pdf: string | null = null;
    let said: { rate: number | null; omNo: string | null; omDate: string | null } = { rate: null, omNo: null, omDate: null };
    let complete = false;
    try {
      if (o.pdfId !== null) {
        pdf = pdfAddress(await deps.getJson(mediaUrl(o.pdfId)));
        if (pdf) {
          said = readOrderText(await deps.pdfText(await deps.getPdf(pdf)));
          complete = true;
        }
      }
    } catch {
      // the order stays listed without its rate; it is asked again next time
    }
    const order: DpeOrder = { from: o.from, postedOn: o.postedOn, rate: said.rate, omNo: said.omNo, omDate: said.omDate, pdf };
    if (complete) read.set(o.key, order);
    return order;
  }));
  while (read.size > 40) read.delete(read.keys().next().value as string);
  return out;
}

/** For the tests: forget what is kept. */
export function forgetOrders(): void { read.clear(); }

export function validOrders(x: unknown): x is DpeOrder[] {
  return Array.isArray(x) && x.every((o) => o && typeof o === "object" && /^\d{4}-\d{2}-01$/.test((o as DpeOrder).from) && ((o as DpeOrder).rate === null || typeof (o as DpeOrder).rate === "number") && ((o as DpeOrder).pdf === null || typeof (o as DpeOrder).pdf === "string"));
}
