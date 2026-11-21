// src/lib/security/sensitiveFields.ts
//
// THE TICKET NUMBER AND THE SAIL P.No. LEAVE THE SERVER MASKED, and are shown only when a signed-in person presses "reveal" on a card (the reveal route writes who asked for whose, and caps how many).
// The P.No. is also the first password of every account, so a raw one must never be in an answer. This is the ONE place that cuts them out of an answer, on the answer that is about to leave the server
// (the same place for every route that returns people or tables: src/app/api/ai-search, employees/search, omnibar/more), so no builder and no screen has to remember to:
//   - an EMPLOYEE CARD: the ticket number is masked for everybody, and the colour of its origin (direct recruit / promotee, read from the real ticket) is sent as `ticketOrigin` so the optional
//     ticket colouring still works on the masked text; the P.No. is masked (a raw one that reaches here is masked again); chips of extra fields labelled P.No or Ticket are masked too;
//   - a TABLE ({columns, rows}): a P.No. column is masked for everybody, and so is any cell that is a raw P.No. (a letter and 5-7 digits) wherever it sits; a ticket column is masked for a person who has NOT
//     signed in (a signed-in person's table is a working report; the cards are the audited route to a ticket number).
// Pure: it returns a copy and never changes what it is given.

import { maskPno } from "./maskPno";
import { originOfTicket } from "@/lib/nl2sql/designationFilter";

/** "498880" -> "4••••0": the first and the last character only, like the P.No. (maskPno) */
export const maskTicket = (t: string | number | null | undefined): string | null => maskPno(t === null || t === undefined ? null : String(t));

const PNO_KEY = /^(sail_?p_?no|pno|p_?no|personal_?(no|number)|sail_?personal_?(no|number))$/i;
const TICKET_KEY = /^(ticket_?(no|number)?|ticketno)$/i;
const PNO_SHAPE = /^[A-Za-z]\d{5,7}$/;
const PNO_LABEL = /(^|[^a-z])(p\.?\s?no|personal\s*(no|number))/i;
const TICKET_LABEL = /ticket/i;

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
const isObj = (v: unknown): v is Record<string, Json> => !!v && typeof v === "object" && !Array.isArray(v);
const alreadyMasked = (s: string) => s.includes("•");

const maskedPno = (v: Json): Json => (typeof v === "string" && v.trim() && !alreadyMasked(v) ? maskPno(v) : v);
const maskedTicket = (v: Json): Json => ((typeof v === "string" || typeof v === "number") && String(v).trim() && !alreadyMasked(String(v)) ? maskTicket(v) : v);

/** one employee card, cut for the client */
export function cardForClient(c: Record<string, Json>): Record<string, Json> {
  const out: Record<string, Json> = { ...c };
  const rawTicket = typeof c.ticketNo === "string" ? c.ticketNo.trim() : "";
  if (rawTicket && !alreadyMasked(rawTicket)) {
    out.ticketOrigin = originOfTicket(rawTicket);
    out.ticketNo = maskTicket(rawTicket);
  }
  if ("sailPNo" in c) out.sailPNo = maskedPno(c.sailPNo);
  if (Array.isArray(c.extraFields)) {
    out.extraFields = (c.extraFields as Json[]).map((f) => {
      if (!isObj(f)) return f;
      const label = typeof f.label === "string" ? f.label : "";
      if (PNO_LABEL.test(label) || (typeof f.value === "string" && PNO_SHAPE.test(f.value.trim()))) return { ...f, value: maskedPno(f.value ?? null) };
      if (TICKET_LABEL.test(label)) return { ...f, value: maskedTicket(f.value ?? null) };
      return f;
    });
  }
  return out;
}

const keyOf = (c: Json): string => (isObj(c) && typeof c.key === "string" ? c.key : typeof c === "string" ? c : "");

/** the same answer, with the ticket number and the P.No. masked as described at the top of this file */
export function maskAnswer<T>(value: T, opts: { signedIn: boolean }): T {
  const walk = (v: Json): Json => {
    if (Array.isArray(v)) return v.map(walk);
    if (!isObj(v)) return v;
    if (v.type === "employee" && typeof v.name === "string" && "ticketNo" in v) return cardForClient(v);
    const tableLike = Array.isArray(v.columns) && Array.isArray(v.rows);
    const pnoKeys = new Set<string>();
    const ticketKeys = new Set<string>();
    if (tableLike) {
      for (const c of v.columns as Json[]) {
        const k = keyOf(c);
        if (!k) continue;
        if (PNO_KEY.test(k)) pnoKeys.add(k);
        else if (TICKET_KEY.test(k) && !opts.signedIn) ticketKeys.add(k);
      }
    }
    const out: Record<string, Json> = {};
    for (const [k, x] of Object.entries(v)) {
      if (tableLike && k === "rows") {
        out[k] = (x as Json[]).map((r) => {
          if (!isObj(r)) return r;
          const row: Record<string, Json> = {};
          for (const [ck, cv] of Object.entries(r)) {
            if (pnoKeys.has(ck)) row[ck] = maskedPno(cv);
            else if (ticketKeys.has(ck)) row[ck] = maskedTicket(cv);
            else if (typeof cv === "string" && PNO_SHAPE.test(cv.trim())) row[ck] = maskedPno(cv);
            else row[ck] = walk(cv);
          }
          return row;
        });
      } else out[k] = walk(x);
    }
    return out;
  };
  return walk(value as unknown as Json) as unknown as T;
}
