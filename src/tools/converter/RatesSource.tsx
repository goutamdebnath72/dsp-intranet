// src/tools/converter/RatesSource.tsx
//
// WHERE THE CURRENCY CONVERTER'S RATES COME FROM, said under the converter like every other card says it: the European Central Bank's reference rates (through Frankfurter) and, for the Gulf currencies the ECB does not
// publish, open.er-api.com (whose free terms ask for a link to Exchange Rate API, given here). Each name is a link to the provider; the date is the date of the rates. The text is read from the rates the server answered with
// (rates.source), so a provider that did not answer is not named.
"use client";

import React from "react";
import { DateTime } from "luxon";
import { ExternalLink } from "lucide-react";
import type { Rates } from "./currency";

/** the providers a rates answer can name, in the words of the server's answer: each with how it is shown and where it is */
export const RATE_PROVIDERS: Array<{ match: string; name: string; url: string }> = [
  { match: "European Central Bank", name: "European Central Bank reference rates (through Frankfurter)", url: "https://frankfurter.dev" },
  { match: "open.er-api.com", name: "Rates By Exchange Rate API (open.er-api.com)", url: "https://www.exchangerate-api.com" },
];

export function ratesProviders(rates: Rates): Array<{ name: string; url: string }> {
  return RATE_PROVIDERS.filter((p) => rates.source.includes(p.match));
}

export function RatesSource({ rates }: { rates: Rates }) {
  const list = ratesProviders(rates);
  const day = DateTime.fromISO(rates.date);
  return (
    <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
      <span>{list.length > 1 ? "Sources" : "Source"}: {list.length === 0 ? rates.source : list.map((p, i) => (
        <React.Fragment key={p.name}>{i > 0 && <span aria-hidden="true"> · </span>}<a href={p.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 font-semibold text-slate-700 hover:underline">{p.name}<ExternalLink size={11} /></a></React.Fragment>
      ))}</span>
      {day.isValid && <span>Rates of {day.toFormat("d LLL yyyy")}</span>}
    </p>
  );
}
