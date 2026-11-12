// src/app/api/live/fuel/route.ts
//
// PETROL, DIESEL AND LPG IN DELHI, MUMBAI, CHENNAI AND KOLKATA. Reads nothing from the caller. Six public pages are fetched together (petrol, diesel, and the LPG page of each city),
// flattened and read by src/lib/live/fuel.ts, which checks every figure and refuses a page that no longer looks as it should (an error, never a wrong price).
import { getText } from "@/lib/live/http";
import { liveRoute } from "@/lib/live/envelope";
import { htmlToText } from "@/lib/live/text";
import { assemble, CITIES, LPG_SLUG, type City } from "@/lib/live/fuel";

export const dynamic = "force-dynamic";
export const maxDuration = 25;

const BASE = "https://www.goodreturns.in";

export async function GET() {
  return liveRoute({
    key: "fuel",
    ttlMs: 30 * 60 * 1000,
    source: "GoodReturns (prices published by the oil marketing companies)",
    sourceUrl: `${BASE}/petrol-price.html`,
    load: async () => {
      const [petrol, diesel, ...lpgPages] = await Promise.all([
        getText(`${BASE}/petrol-price.html`),
        getText(`${BASE}/diesel-price.html`),
        ...CITIES.map((c) => getText(`${BASE}/lpg-price-in-${LPG_SLUG[c]}.html`)),
      ]);
      const lpg = {} as Record<City, string>;
      CITIES.forEach((c, i) => { lpg[c] = htmlToText(lpgPages[i]); });
      return assemble(htmlToText(petrol), htmlToText(diesel), lpg);
    },
  });
}
