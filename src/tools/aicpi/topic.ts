// src/tools/aicpi/topic.ts
//
// WHAT THE SEARCH LINE NEEDS TO KNOW ABOUT THIS TOPIC (pure, no React): the words of the AICPI, SAIL DA and inflation card ("aicpi da", "sail da"). The data, its source and its checks are in src/lib/live/aicpi.ts; how it looks
// is in AicpiCard.tsx and ui.tsx. It is listed once, in src/tools/registry.ts.
// A line is this card's when it has a key word and every word is a key word, an extra word or a filler: "da formula" opens it, "da vinci" does not. Hyphens read as spaces, so "cpi-iw" is "cpi" and "iw".
import { defineTopic } from "@/tools/types";

export const aicpiTopic = defineTopic({
  id: "aicpi",
  live: {
    keys: ["aicpi", "cpi", "cpiiw", "dearness", "da", "ida", "inflation"],
    extra: ["iw", "index", "indices", "inflation", "industrial", "workers", "worker", "all", "consumer", "formula", "calculator", "calculate", "calculation", "allowance", "central", "government", "govt", "employees", "executive", "executives", "non", "sail", "7th", "cpc", "quarter", "quarterly", "october", "january", "2017", "scale", "scales", "trend", "graph", "chart", "labour", "bureau", "months", "12", "year", "how", "to", "should", "be", "hike", "expected", "next", "percentage", "percent", "relief", "dr", "dearness's", "urban", "rural", "combined", "state", "states", "monthly", "rate", "rates", "years", "5", "3", "10", "mospi", "india", "indian", "price", "prices"],
    // the card opens on the dearness allowance; a line that asks for the consumer price index or inflation, with no word of the dearness allowance or of the industrial workers' index, opens its CPI tab ("inflation", "cpi", "india inflation"; "cpi-iw" and "aicpi" stay with the DA)
    lang: (w) => {
      const da = ["iw", "cpiiw", "aicpi", "da", "ida", "dearness", "sail", "formula", "calculator", "calculate", "calculation", "allowance", "industrial", "workers", "worker", "hike", "quarter", "quarterly", "7th", "cpc", "relief", "dr", "executive", "executives", "employees", "central", "government", "govt"];
      return !w.some((x) => da.includes(x)) && w.some((x) => x === "cpi" || x === "inflation") ? "cpi" : undefined;
    },
  },
  samples: [
    { q: "aicpi da", note: "the all-India consumer price index for industrial workers (AICPI-IW, base 2016=100) from the Labour Bureau, as a graph of the last year (from the same month a year back to the latest), and the dearness allowance of SAIL employees worked out from it quarter by quarter (the CPSE IDA pattern of the 2017 pay scales, revised every three months): the rate in force (59.1% from 1 October 2026), the expected rate of the next quarter, a table of the quarters with the work of each, the formula, and a calculator for your basic pay. SAIL's own circular is the authority", instant: true },
    { q: "india inflation", note: "the same card, on its second tab: the Consumer Price Index of MoSPI month by month as column charts for all India (Combined, Urban, Rural) and for any State (West Bengal first), and India's inflation rate for the last 1, 3, 5 or 10 years. 'cpi' and 'inflation 10 years' open it too", instant: true },
    { q: "da formula", note: "the same card: 'sail da', 'dearness allowance', 'aicpi', 'cpi-iw', 'ida' and 'da calculator' open it too", instant: true },
  ],
});
