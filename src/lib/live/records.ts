// src/lib/live/records.ts
//
// THE RECORD SEARCHES of the Business tab: a record high or low of the share market, of gold or silver, or of the dollar against the rupee must stand first on the tab (the owner's rule of 27 Nov 2026). The four business papers' feeds
// carry only their top ten stories each, so a record that is the day's news may not be in them; I ask the same two public news searches as the steel tab (Google News and Bing News), with fixed questions, and keep a story only when its own
// headline names the thing and a record (src/lib/live/priority.ts, recordMove). Nothing typed goes into these addresses.
import { bingNews, googleNews, type SteelSearch } from "./steel";

export const RECORD_SEARCHES: SteelSearch[] = [
  googleNews('(Sensex OR Nifty OR "stock market") ("record high" OR "all-time high" OR "lifetime high")', "en-IN"),
  googleNews('(Sensex OR Nifty OR "stock market") ("record low" OR "all-time low" OR "biggest single-day fall" OR "worst day")', "en-IN"),
  googleNews('(gold OR silver) (price OR rate) ("record high" OR "all-time high" OR "lifetime high" OR "record low")', "en-IN"),
  googleNews('rupee dollar ("record low" OR "all-time low" OR "record high" OR "lifetime low")', "en-IN"),
  bingNews("Sensex Nifty record high", "en"),
  bingNews("gold silver price record high", "en"),
  bingNews("rupee dollar record low", "en"),
];
