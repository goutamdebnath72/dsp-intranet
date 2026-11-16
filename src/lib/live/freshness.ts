// src/lib/live/freshness.ts
//
// WHETHER WHAT A LIVE CARD SHOWS IS LIVE, THE LAST CLOSE, OR A SAVED COPY, decided in one place so that every card says it in the same three words and the same three colours:
//   "live"  - green:  a figure from the session that is running now (a share price at most 20 minutes old inside market hours; today's IBJA rate once IBJA has put it up)
//   "last"  - grey:   the last figure the source published, which is the right answer now (a market that is shut; IBJA on a Sunday, a holiday, or before its morning rate)
//   "saved" - amber:  the source did not answer, and this is the last copy this site kept, with its own time
// A holiday needs no calendar: on a day the exchange is shut the newest price is the old close, more than 20 minutes old, so it reads "last".
import { DateTime } from "luxon";
import { sessionState } from "./markets";

export type Freshness = "live" | "last" | "saved";

export interface FreshnessLabel {
  state: Freshness;
  /** the pill's own words, short enough for a tile */
  text: string;
  /** a sentence for a tooltip or a screen reader */
  detail: string;
}

const dayText = (iso: string) => {
  const d = DateTime.fromISO(iso, { zone: "Asia/Kolkata" });
  return d.isValid ? d.toFormat("ccc, d LLL") : iso;
};

/** A share or index price: saved when it is among the copies the site kept, live inside the session, otherwise the last close. */
export function quoteFreshness(q: { name: string; time: string }, now: DateTime, savedNames: readonly string[] = []): FreshnessLabel {
  if (savedNames.includes(q.name)) return { state: "saved", text: "SAVED COPY", detail: "The source did not answer, so this is the last price this site saved." };
  if (sessionState(q.time, now) === "live") return { state: "live", text: "LIVE", detail: "A price from the trading session now running (it may be about fifteen minutes behind)." };
  return { state: "last", text: "LAST CLOSE", detail: "The market is shut, so this is the last price of the last trading session." };
}

/** The IBJA gold and silver rates: saved when only a saved copy could be had, today's rate once it is up, otherwise the last day IBJA published. */
export function goldFreshness(r: { asOf?: string; session: "AM" | "PM" }, stale: boolean): FreshnessLabel {
  if (stale) return { state: "saved", text: "SAVED COPY", detail: "IBJA's page did not answer, so these are the last rates this site saved." };
  if (!r.asOf) return r.session === "AM"
    ? { state: "live", text: "LIVE · OPENING (AM)", detail: "IBJA's opening rate of today, now up. IBJA publishes twice a day, so this is the current rate; the closing (PM) rate comes later." }
    : { state: "live", text: "LIVE · CLOSING (PM)", detail: "IBJA's closing rate of today." };
  return { state: "last", text: `LAST PUBLISHED · ${dayText(r.asOf)}`, detail: "IBJA has not put up a rate for today (a Sunday, a holiday, or before its morning rate), so this is the last day it published." };
}
