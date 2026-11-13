// src/tools/converter/useRates.ts
//
// THE PUBLIC EXCHANGE-RATE TABLE, for the converter: downloaded once, when a topic first asks for it (a currency question, or the converter's page), and kept for half an hour. The request is a fixed
// address with no body and no query: nothing the user typed is part of it. The panel (ToolPanel.tsx) calls it and hands the table to whichever card needs it.
"use client";

import { useEffect, useState } from "react";
import { validRates, type Rates } from "./currency";
import type { RatesState } from "@/tools/uiTypes";

let ratesCache: { at: number; rates: Rates } | null = null;
const RATES_TTL_MS = 30 * 60 * 1000;

/** The public exchange-rate table, fetched once when first needed and kept for half an hour. Nothing the user typed is part of the request. */
export function useRates(enabled: boolean): { rates: Rates | null; state: RatesState } {
  const [rates, setRates] = useState<Rates | null>(ratesCache && Date.now() - ratesCache.at < RATES_TTL_MS ? ratesCache.rates : null);
  const [state, setState] = useState<RatesState>(rates ? "ok" : "idle");
  useEffect(() => {
    if (!enabled || (ratesCache && Date.now() - ratesCache.at < RATES_TTL_MS)) {
      if (enabled && ratesCache) { setRates(ratesCache.rates); setState("ok"); }
      return;
    }
    let live = true;
    setState("loading");
    fetch("/api/tools/rates", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j) => {
        if (!live) return;
        if (!validRates(j)) throw new Error("bad rates");
        ratesCache = { at: Date.now(), rates: j };
        setRates(j);
        setState("ok");
      })
      .catch(() => live && setState("error"));
    return () => { live = false; };
  }, [enabled]);
  return { rates, state };
}
