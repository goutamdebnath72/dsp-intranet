// src/app/api/live/fuel-trend/route.ts
//
// THE KOLKATA PRICE OF PETROL, DIESEL AND LPG OVER THE LAST YEAR. Reads nothing from the caller. Petrol and diesel: the daily table of the Petroleum Planning & Analysis Cell (a PDF found on its page,
// read with pdf-parse). LPG: GoodReturns' monthly table for Kolkata. Each is checked by src/lib/live/fuelTrend.ts (a changed source is an error, never a wrong price); when one cannot be had, the copy
// kept with the app takes its place and the card says so. The two kinds are asked separately, so a failure of one does not take the other down.
import { DateTime } from "luxon";
import snapshot from "@/lib/live/fuelTrendSnapshot.json";
import { getBuffer, getText } from "@/lib/live/http";
import { liveRoute } from "@/lib/live/envelope";
import { memo } from "@/lib/live/memo";
import { htmlToText } from "@/lib/live/text";
import { inYearWindow, parseLpgKolkata, parsePpacKolkata, ppacPdfLink, seriesFromSnapshot, validSeries, type FuelSeries, type FuelTrend, type Snapshot } from "@/lib/live/fuelTrend";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const PPAC_PAGE = "https://ppac.gov.in/retail-selling-price-rsp-of-petrol-diesel-and-domestic-lpg/rsp-of-petrol-and-diesel-in-metro-cities-since-16-6-2017";
const LPG_PAGE = "https://www.goodreturns.in/lpg-price-in-kolkata.html";
const SAVED = snapshot as Snapshot;

async function pdfText(buf: Buffer): Promise<string> {
  const mod = await import("pdf-parse/lib/pdf-parse.js");
  return (await mod.default(buf)).text;
}

const longDate = (iso: string) => DateTime.fromISO(iso, { zone: "Asia/Kolkata", locale: "en" }).toFormat("d LLLL yyyy");

export async function GET() {
  return liveRoute<FuelTrend>({
    key: "fuel-trend",
    ttlMs: 3 * 60 * 60 * 1000,
    source: "PPAC, Ministry of Petroleum and Natural Gas (petrol, diesel); GoodReturns (LPG)",
    sourceUrl: PPAC_PAGE,
    sourceLinks: [{ name: "PPAC, Ministry of Petroleum and Natural Gas (petrol, diesel)", url: PPAC_PAGE }, { name: "GoodReturns (LPG)", url: LPG_PAGE }],
    load: async () => {
      const [ppac, lpg] = await Promise.allSettled([
        memo("fuel-ppac-kolkata", 3 * 60 * 60 * 1000, async () => parsePpacKolkata(await pdfText(await getBuffer(ppacPdfLink(await getText(PPAC_PAGE)), { timeoutMs: 15000 })))),
        memo("fuel-lpg-kolkata-months", 3 * 60 * 60 * 1000, async () => parseLpgKolkata(htmlToText(await getText(LPG_PAGE)))),
      ]);
      const notes: string[] = [];
      let petrol: FuelSeries | null = null, diesel: FuelSeries | null = null, lpgSeries: FuelSeries | null = null;
      if (ppac.status === "fulfilled") {
        petrol = { id: "petrol", grain: "day", points: ppac.value.value.petrol };
        diesel = { id: "diesel", grain: "day", points: ppac.value.value.diesel };
      } else {
        const saved = [seriesFromSnapshot(SAVED, "petrol"), seriesFromSnapshot(SAVED, "diesel")];
        if (validSeries(saved[0]) && validSeries(saved[1])) { [petrol, diesel] = saved; notes.push(`The PPAC table could not be read just now (${ppac.reason instanceof Error ? ppac.reason.message : "no answer"}), so the petrol and diesel prices are a copy saved on ${longDate(SAVED.savedOn)}, which ends on ${longDate(SAVED.through)}.`); }
        else notes.push("The PPAC table could not be read just now, so petrol and diesel cannot be shown.");
      }
      if (lpg.status === "fulfilled") lpgSeries = { id: "lpg", grain: "month", points: lpg.value.value };
      else {
        const saved = seriesFromSnapshot(SAVED, "lpg");
        if (validSeries(saved)) { lpgSeries = saved; notes.push(`The LPG table could not be read just now (${lpg.reason instanceof Error ? lpg.reason.message : "no answer"}), so the LPG prices are a copy saved on ${longDate(SAVED.savedOn)}.`); }
        else notes.push("The LPG table could not be read just now, so LPG cannot be shown.");
      }
      // THE YEAR RUNS FROM THE SAME DATE A YEAR BACK TO TODAY: the last published price is carried on to today (a price stays until it is changed), and the card says so
      let carriedFrom: string | null = null;
      if (petrol) { const w = inYearWindow(petrol); petrol = w.series; carriedFrom = w.carriedFrom ?? carriedFrom; }
      if (diesel) { const w = inYearWindow(diesel); diesel = w.series; carriedFrom = w.carriedFrom ?? carriedFrom; }
      if (carriedFrom) notes.push(`The petrol and diesel record ends on ${longDate(carriedFrom)}, so the price of that day is shown up to today: a fuel price stays as it is until the day it is changed.`);
      if (!petrol && !diesel && !lpgSeries) throw new Error(notes.join(" "));
      return { petrol, diesel, lpg: lpgSeries, notes };
    },
  });
}
