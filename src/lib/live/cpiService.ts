// src/lib/live/cpiService.ts
//
// THE CONSUMER PRICE INDEX ANSWER: from the saved rows (src/lib/live/cpiStore.ts); MoSPI is asked only
//   * when nothing is saved (everything is loaded: the new series from January 2026 and the old from 2016), or
//   * when a month that should be out by now is not saved (the index of a month is due on the 12th of the next, at 4 pm): only the missing months are asked, a request or two.
// When MoSPI cannot be asked or has not published, what is saved is shown (the card says which month is the latest and when the next is due). Nothing is estimated.
import { DateTime } from "luxon";
import { askAll, askNewMonths, buildCpi, latestDue, type Cpi, type CpiRow, type JsonGetter } from "./cpi";
import type { CpiStore } from "./cpiStore";

let loading: Promise<CpiRow[]> | null = null;

export interface CpiDeps {
  store: CpiStore;
  now?: DateTime;
  get?: JsonGetter;
}

/** the answer, loading or topping up the store first when that is due */
export async function cpiAnswer({ store, now = DateTime.now(), get }: CpiDeps): Promise<Cpi> {
  let rows = await store.all();
  const newest = rows.filter((r) => r.base === "2024").map((r) => r.month).sort().pop();
  const due = latestDue(now);
  const needs = !newest ? "all" : newest < due && due >= "2026-01" ? "new" : null;
  if (needs) {
    // one load at a time, however many people open the card at once
    loading ??= (async () => {
      try {
        const got = needs === "all" ? await askAll(now, get) : await askNewMonths(nextMonth(newest!), due, get);
        await store.put(got, DateTime.now().toJSDate());
        return got;
      } finally {
        loading = null;
      }
    })();
    try {
      rows = [...rows, ...(await loading)];
    } catch (e) {
      // MoSPI did not answer: with something saved, show it; with nothing, there is nothing to show
      if (!rows.length) throw e;
    }
  }
  return buildCpi(rows);
}

const nextMonth = (m: string): string => DateTime.fromISO(`${m}-01`).plus({ months: 1 }).toFormat("yyyy-MM");
