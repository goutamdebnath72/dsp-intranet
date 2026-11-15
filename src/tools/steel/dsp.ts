// src/tools/steel/dsp.ts
//
// THE DSP TAB OF THE STEEL CARD (pure, no React): what the Durgapur Steel Plant makes to sell, and what the same kind of steel costs in the Durgapur market.
//
// TWO KINDS OF FIGURE, KEPT APART:
//   * PRODUCTS: what each mill rolls, its sizes and its capacity, exactly as the plant's own "Operation Department Manual" (the DSP JO Manual 2022, revised plant-specific manual) states them, with the page.
//   * QUOTES: the Durgapur rates a private trade-price site (Ayron Mart, ayronmart.com) publishes every day, read on 15 Nov 2026 from its tables dated 13 Nov 2026 (rupees per tonne, GST NOT included: the site says 18% GST is extra).
//     A quote is the market's rate for that KIND of steel in Durgapur. It is NOT DSP's or SAIL's selling price: SAIL sells at its own list and dealer rates, which nobody publishes, and a market quote is for a given size
//     (TMT 12 mm, while DSP rolls 20 and 25 mm) and is mostly the re-rollers' price. The card says so. Nothing is estimated: a product with no quote has none, and the card says why.
//   * PRODUCTION: what DSP produced, as SAIL's own annual reports (FY 2023-24, 2024-25, 2025-26) and its FY26 results presentation state it, each with the PDF page and the words it was read from. The reports give DSP's hot metal, crude steel,
//     saleable steel and finished steel by year for some years and the output of three units (the Bloom cum Round Caster, the Medium Structural Mill and the Merchant Mill) for 2024-25 only; for 2025-26 they say only "highest ever finished steel"
//     and give the product mix in per cent. What they do not state (TMT, structurals, blooms, billets, wheels and axles in tonnes, month by month) is NOT here and the card says so. The reports give some figures in lakh tonnes: they are
//     divided by 10 into million tonnes (MT). A figure worked out from two stated figures is marked "worked out".
// Nothing is fetched while the card is open: this is a reviewed file with its sources and dates, like mos.ts. When it is refreshed, change the quotes, `asOf` and `readOn` together; the card warns when the quotes are old.
import { DateTime } from "luxon";

export type QuoteId = "tmt12" | "channel" | "angle" | "billet" | "pigSteel" | "pigFoundry";
export interface Quote {
  id: QuoteId;
  /** what the site calls it, with the size where the site gives one */
  item: string;
  /** rupees per tonne, GST not included, as the site prints it */
  rupees: number;
  /** the day's change the site prints beside it (▲/▼), in rupees; null where it prints none */
  change: number | null;
  /** the date the site stamps on the figure (ISO) */
  asOf: string;
  /** the page it was read from and the line, word for word */
  url: string;
  line: string;
}
const AYRON = "https://ayronmart.com";
export const QUOTES_READ_ON = "2026-11-15";
export const QUOTE_SOURCE = { name: "Ayron Mart", site: AYRON, basis: "rupees per metric tonne, GST (18%) extra, \"only for informational use\" as the site says" };
export const QUOTES: Readonly<Record<QuoteId, Quote>> = {
  tmt12: { id: "tmt12", item: "TMT bar, 12 mm", rupees: 45200, change: 200, asOf: "2026-11-13", url: `${AYRON}/tmt-steel-bar-prices/`, line: "Durgapur West Bengal TMT 12mm 45200 (▲200) 13-November-2026" },
  channel: { id: "channel", item: "Channel", rupees: 48750, change: -250, asOf: "2026-11-13", url: `${AYRON}/angle-channel-pipe-structure-prices/`, line: "Durgapur West Bengal Channel 48750 (▼250) 13-November-2026" },
  angle: { id: "angle", item: "Angle", rupees: 44500, change: 250, asOf: "2026-11-13", url: `${AYRON}/angle-channel-pipe-structure-prices/`, line: "Durgapur West Bengal Angle 44500 (▲250) 13-November-2026" },
  billet: { id: "billet", item: "Billet", rupees: 43090, change: 590, asOf: "2026-11-13", url: `${AYRON}/semi-finished-steel-prices/`, line: "Durgapur West Bengal Billet 43090 (▲590) 13-November-2026" },
  pigSteel: { id: "pigSteel", item: "Pig iron, steel grade", rupees: 41500, change: null, asOf: "2026-11-13", url: `${AYRON}/pig-iron-prices/`, line: "Durgapur West Bengal Steel Grade 41500 (X) 13-November-2026" },
  pigFoundry: { id: "pigFoundry", item: "Pig iron, foundry grade", rupees: 46500, change: null, asOf: "2026-11-13", url: `${AYRON}/pig-iron-prices/`, line: "Durgapur West Bengal Foundry Grade 46500 (X) 13-November-2026" },
};
/** a second trade reporter's Durgapur billet, as a check on the first: the two differ a little, as trade reports do (13 Nov 7 PM feed 43,000; 14 Nov 1:05 PM 42,700) */
export const BILLET_SECOND = { name: "Steel Baba", url: "https://steel-baba.com/", rupees: 42700, when: "14 Nov 2026, 1:05 PM", line: "Durgapur West Bengal ₹42,700 ₹42.70 ▼ 300 14-11-2026 | 01:05 PM (MS billet, excludes 18% GST)" };
/** the same site's ticker showed Durgapur TMT at 45,500 at 11:00 AM on 14 Nov with no size; the 12 mm figure of its table is used because it names its size and is one of a complete set of one day */
export const TICKER_NOTE = "The site's ticker showed ₹45,500 for Durgapur TMT at 11:00 AM on 14 Nov without a size; the 12 mm figure of its table is shown because it names its size and belongs to one complete set of 13 Nov.";

/** TMT 12 mm in the cities the same table lists, 13 Nov 2026 (rupees per tonne, GST not included): Durgapur against the rest, all from one table of one site */
export const TMT12_CITIES: ReadonlyArray<{ city: string; rupees: number }> = [
  { city: "Durgapur", rupees: 45200 }, { city: "Kolkata", rupees: 45700 }, { city: "Raigarh", rupees: 46000 }, { city: "Raipur", rupees: 46200 }, { city: "Rourkela", rupees: 47000 },
  { city: "Hyderabad", rupees: 49200 }, { city: "Muzaffarnagar", rupees: 49500 }, { city: "Jaipur", rupees: 50000 }, { city: "Jalna", rupees: 50300 }, { city: "Indore", rupees: 50700 },
  { city: "Delhi", rupees: 51000 }, { city: "Mandi Gobindgarh", rupees: 51200 }, { city: "Bhavnagar", rupees: 51600 }, { city: "Mumbai", rupees: 51700 }, { city: "Chennai", rupees: 52000 }, { city: "Goa", rupees: 52300 },
];

/** "2026-11-13" -> "13 Nov 2026" */
export const dateLabel = (iso: string): string => DateTime.fromISO(iso, { zone: "Asia/Kolkata" }).toFormat("d LLL yyyy");
export const GST_RATE = 0.18;
/** a quote with the 18% GST the site says is extra added, to the whole rupee: arithmetic on the published figure, shown as "with GST" */
export const withGst = (rupees: number): number => Math.round(rupees * (1 + GST_RATE));
/** whole days between the date of a quote and `now` */
export function ageDays(asOf: string, now: DateTime = DateTime.now().setZone("Asia/Kolkata")): number {
  return Math.floor(now.startOf("day").diff(DateTime.fromISO(asOf, { zone: "Asia/Kolkata" }).startOf("day"), "days").days);
}
/** the quotes are called old after this many days: a trade rate moves every few days */
export const QUOTE_OLD_AFTER_DAYS = 7;
/** Durgapur's place among the cities of the TMT 12 mm table (1 = cheapest) and how far the dearest is above it, in percent */
export function durgapurTmtRank(): { rank: number; of: number; dearest: { city: string; rupees: number }; gapPct: number } {
  const sorted = [...TMT12_CITIES].sort((a, b) => a.rupees - b.rupees);
  const rank = sorted.findIndex((c) => c.city === "Durgapur") + 1, dearest = sorted[sorted.length - 1], d = sorted.find((c) => c.city === "Durgapur")!;
  return { rank, of: sorted.length, dearest, gapPct: Math.round(((dearest.rupees - d.rupees) / d.rupees) * 1000) / 10 };
}

/** what the plant's manual says about a product: where, and the page of the manual (its printed page number) */
export interface DspProduct {
  id: string;
  name: string;
  mill: string;
  /** sizes and sections, as the manual states them */
  sizes: string;
  /** the mill's capacity as the manual states it (million tonnes, MT, where it is a million or more is not needed: tonnes a year are written out) */
  capacity: string | null;
  /** a line on what it is for */
  use: string;
  page: string;
  /** the quotes that are for this kind of steel (empty when there is none) */
  quotes: QuoteId[];
  /** why a quote is not the product's own price, or why there is none */
  note: string;
  /** what is published about its production (the card's "Produced" line), with what is not */
  produced: string;
}
export const DSP_PRODUCTS: readonly DspProduct[] = [
  { id: "tmt", name: "TMT bars", mill: "Merchant Mill", sizes: "20 mm and 25 mm ribbed (TMT) bars; the mill was built for 16, 20 and 25 mm and now rolls only 20 and 25 mm", capacity: "2,80,000 tonnes a year (0.28 MT) since the 1992 modernisation; 2,40,000 tonnes when it started in 1961", use: "reinforcement bars for buildings and bridges, rolled from 125 mm billets of the Continuous Casting Plant", page: "p. 37", quotes: ["tmt12"], produced: "Merchant Mill: 0.428 MT in 2024-25, its highest ever. 2023-24 and 2025-26 were records too (the reports give no tonnes for those years). Month-by-month output is not published.", note: "The market quote is for 12 mm bar from the Durgapur market in general, not for DSP's 20 and 25 mm, and not for SAIL-branded bar." },
  { id: "channel", name: "Channels", mill: "Section Mill and Medium Structural Mill", sizes: "Section Mill: 200 x 75 mm and 150 x 75 mm. Medium Structural Mill: 100 to 300 mm", capacity: "Section Mill 2,12,000 tonnes a year (0.212 MT); Medium Structural Mill 1 MT a year", use: "structural steel for frames, trusses, bridges and wagons", page: "pp. 34, 47", quotes: ["channel"], produced: "Medium Structural Mill: 0.557 MT in 2024-25, all its sections together (the reports do not split channels, angles and beams), its highest ever; 2023-24 and 2025-26 were records too (no tonnes given). The Section Mill's output is not stated.", note: "The market quote is for an unnamed size of channel in Durgapur; it is not DSP's list price." },
  { id: "angle", name: "Angles", mill: "Medium Structural Mill", sizes: "equal angles 90 to 200 mm. The Section Mill's angles (150 x 150, 130 x 130 and 100 x 100 mm) are \"not produced/required as of now\"", capacity: "Medium Structural Mill 1 MT a year", use: "structural steel for towers, frames and fabrication", page: "pp. 34, 47", quotes: ["angle"], produced: "Medium Structural Mill: 0.557 MT in 2024-25, all its sections together (the reports do not split channels, angles and beams). The Section Mill's output is not stated.", note: "The market quote is for an unnamed size of angle in Durgapur; it is not DSP's list price." },
  { id: "beam", name: "Joists and beams", mill: "Section Mill and Medium Structural Mill", sizes: "Section Mill: joist 200 x 100 mm. Medium Structural Mill: universal beams 100 to 300 mm (parallel flange beams; 131 profiles in all across the mill's products)", capacity: "Section Mill 2,12,000 tonnes a year (0.212 MT); Medium Structural Mill 1 MT a year", use: "beams for buildings, bridges and industrial sheds", page: "pp. 34, 47", quotes: [], produced: "Medium Structural Mill: 0.557 MT in 2024-25, all its sections together (the reports do not split channels, angles and beams). The Section Mill's output is not stated.", note: "No Durgapur quote for joists or beams was found on the sites read, so none is shown." },
  { id: "billet", name: "Billets and blooms", mill: "Continuous Casting Plant", sizes: "billets 125 mm square (the design range is 80 to 150 mm); blooms 150 to 350 mm; bloom-cum-round caster: blooms 350 x 240 mm and rounds of 340 mm", capacity: "billet casters 0.773 MT, bloom caster 0.75 MT, bloom-cum-round caster 0.75 MT of crude steel a year", use: "billets feed the Merchant Mill and are sold; blooms feed the Section and Medium Structural Mills and the Wheel & Axle Plant", page: "pp. 4, 27", quotes: ["billet"], produced: "Bloom cum Round Caster: 0.626 MT of blooms and rounds in 2024-25, its highest ever. The billet casters' and the bloom caster's output is not stated. All semi-finished steel together: about 1.02 MT in 2024-25 (worked out).", note: "The market quote is for billets in Durgapur, mostly from induction-furnace makers; DSP's continuous-cast billets are sold to its own terms. No quote for blooms was found." },
  { id: "wheel", name: "Railway wheels and axles", mill: "Wheel & Axle Plant", sizes: "forged wheels (coach, locomotive, EMU, metro, LHB and others) and axles (LHB and BOX-N among them)", capacity: "wheels 28,000 tonnes and axles 4,500 tonnes a year: 32,500 tonnes in all", use: "supplied mainly to Indian Railways, and to some other buyers; the only public-sector plant that makes forged wheels, as the manual says", page: "p. 40", quotes: [], produced: "SAIL supplied 47,200 wheel, tyre and axle items to Indian Railways in 2025-26 (45,656 in 2024-25 and 42,024 in 2023-24), among them 1,689 Vande Bharat wheels in 2025-26. Tonnes of wheels and axles are not stated.", note: "Made to the Railways' specification and inspected by RITES; no open-market quote exists, so none is shown." },
  { id: "pig", name: "Pig iron", mill: "Blast Furnaces and the Pig Casting Machine", sizes: "pig iron from the Pig Casting Machine (the manual does not state a grade)", capacity: "the plant's hot metal capacity is 2.40 MT a year (SAIL's JO Manual, Industry & Company Awareness, p. 38); the plant manual's older figure for the Blast Furnaces is 2.088 MT a year", use: "foundry and steel-making raw material", page: "pp. 4, 22", quotes: ["pigSteel", "pigFoundry"], produced: "DSP's own pig iron production is not stated in the reports.", note: "The manual does not say which grade DSP casts, so both Durgapur grades are shown; neither is DSP's own price." },
];

/** the by-products the manual lists, with no price quote found for any of them */
export const DSP_BYPRODUCTS: ReadonlyArray<{ name: string; detail: string; page: string }> = [
  { name: "Granulated slag", detail: "sold outside for cement making; granulated slag fetches a better price than lump slag (the manual's words)", page: "p. 23" },
  { name: "Coal chemicals", detail: "benzene, toluene, light solvent naphtha, naphthalene (flakes: the plant's capacity is 1,000 kg an hour), creosote oil, crude tar, and ammonium sulphate (100 tonnes a day)", page: "pp. 5, 9, 12" },
];

/** the plant at a glance, from SAIL's own JO Manual "Industry & Company Awareness" (2022), pp. 38-39: capacities after the Modernisation & Expansion Plan, million tonnes a year (MT). The plant manual's older figures (2.4 and 2 MT of hot metal, 2.088 MT from the Blast Furnaces, 1.876 MT of liquid steel) differ: the card shows this one and says so. */
export const DSP_CAPACITY = { hotMetal: 2.4, crudeSteel: 2.2, saleableSteel: 2.12, page: "p. 38", note: "The plant's own manual, written earlier, gives older figures (hot metal 2.4 and 2 MT, Blast Furnaces 2.088 MT, liquid steel 1.876 MT). A Lok Sabha reply of 2025 and the CAG's audit of SAIL (Report 38 of 2025) both give DSP's hot metal capacity as 2.45 MT, with crude steel 2.20 and saleable steel 2.12 MT as here." } as const;
/** the same SAIL manual says the Medium Structural Mill's products carry the CE mark (p. 39) */
export const MSM_CE_MARK = "The SAIL manual says the Medium Structural Mill's products carry the CE mark (p. 39).";


// ---- PRODUCTION (SAIL's annual reports and results presentation)
export interface ProdSource { name: string; url: string; page: string; quote: string }
const AR24 = "https://sail.co.in/sites/default/files/ticker/2024-09/SAIL_Annual_Report2023-24.pdf";
const AR25 = "https://sail.co.in/sites/default/files/2025-08/Sail%20Annual%20Report_2025_(25_08_2025).pdf";
const AR26 = "https://sail.co.in/sites/default/files/2026-10/2025-26.pdf";
const DECK26 = "https://sail.co.in/sites/default/files/2026-05/Performance%20highlights%20Q4%20FY26.pdf";
/** DSP's production in million tonnes (MT) by financial year; null where the report does not state it */
export interface DspYear {
  fy: string;
  hotMetal: number | null; crude: number | null; saleable: number | null; finished: number | null;
  /** the product mix of saleable steel in per cent as SAIL's presentation gives it (2025-26 only) */
  mix: { longs: number; semis: number } | null;
  /** what the report says besides the figures */
  said: string;
  sources: ProdSource[];
}
export const DSP_YEARS: readonly DspYear[] = [
  { fy: "2022-23", hotMetal: 2.56, crude: 2.29, saleable: 2.18, finished: null, mix: null, said: "Given as the previous best, when 2023-24 beat it.",
    sources: [{ name: "SAIL Annual Report 2023-24", url: AR24, page: "PDF p. 30", quote: "DSP recorded the best ever production of Hot Metal at 2.57 MT, surpassing the previous best of 2.56 MT recorded in the FY 2022-23. DSP also produced highest ever Crude Steel at 2.30 MT and Saleable Steel 2.21 MT, surpassing the previous best of 2.29 MT and 2.18 MT respectively achieved in the previous FY." }] },
  { fy: "2023-24", hotMetal: 2.57, crude: 2.30, saleable: 2.21, finished: null, mix: null, said: "The best ever hot metal, crude steel and saleable steel; highest ever output from the Medium Structural Mill and the Merchant Mill (no tonnes given).",
    sources: [{ name: "SAIL Annual Report 2023-24", url: AR24, page: "PDF p. 30", quote: "The Plant recorded highest ever production from its Medium Structural Mill (MSM) and Merchant Mill (MM)." }] },
  { fy: "2024-25", hotMetal: 2.50, crude: 2.26, saleable: 2.15, finished: 1.126, mix: null, said: "Highest ever output from the Bloom cum Round Caster, the Medium Structural Mill and the Merchant Mill, and 1.126 MT of finished steel.",
    sources: [{ name: "SAIL Annual Report 2024-25", url: AR25, page: "PDF p. 30", quote: "Durgapur Steel Plant (DSP) recorded the production of Hot Metal at 2.50 MT, Crude Steel at 2.26 MT and Saleable Steel 2.15 MT. The Plant recorded highest ever production from its Bloom cum Round Caster BRC of 6.26 lakh tonne, 5.57 lakh tonne from Medium Structural Mill (MSM), 4.28 lakh tonne from Merchant Mill (MM) and of 1.126 MT of Finished Steel." }] },
  { fy: "2025-26", hotMetal: null, crude: null, saleable: null, finished: null, mix: { longs: 54.7, semis: 45.3 }, said: "The highest ever finished steel, driven by record output at the Medium Structural Mill and the Merchant Mill. The report gives no tonnes for DSP; SAIL's presentation gives the product mix.",
    sources: [{ name: "SAIL Annual Report 2025-26", url: AR26, page: "PDF p. 22", quote: "Durgapur Steel Plant (DSP) recorded highest ever Finished Steel production driven by record production at Medium Structural Mill (MSM) and Merchant Mill (MM)." }, { name: "SAIL results presentation, Q4 FY26", url: DECK26, page: "PDF p. 14", quote: "PRODUCTION PERFORMANCE : FY\u201926, PRODUCT MIX: 5 ISPs, DSP: Longs 54.7%, Semis 45.3% (a bar chart)" }] },
];
/** DSP's HOT METAL by financial year, the last ten (2016-17 to 2025-26), in MT: a figure only where a SAIL report states it for DSP; null where none does, with the reason. Four years are stated. 2018-19 is stated as the "previous best" in the
 *  2022-23 report; 2022-23 is 2.56 in the 2023-24 report ("previous best ... recorded in the FY 2022-23") but 2.57 in the 2022-23 report itself: the later one is kept (it is the one that makes 2023-24's 2.57 a record) and the other is shown. */
export interface HotMetalYear { fy: string; mt: number | null; why: string; sources: ProdSource[] }
const BELOW = "No DSP figure is stated in SAIL's reports for this year. It was below 2.52 MT, the best ever set in 2018-19.";
const AT_MOST = "No DSP figure is stated in SAIL's reports for this year. It was not above 2.52 MT: the 2022-23 report names 2.52 MT of 2018-19 as the best before 2022-23.";
export const DSP_HOT_METAL: readonly HotMetalYear[] = [
  { fy: "2016-17", mt: null, why: BELOW, sources: [] },
  { fy: "2017-18", mt: null, why: BELOW, sources: [] },
  { fy: "2018-19", mt: 2.52, why: "The best ever hot metal, crude steel and saleable steel at the time; 2.52 MT is the figure the 2022-23 report gives as the previous best.",
    sources: [{ name: "SAIL Annual Report 2022-23", url: "https://sail.co.in/sites/default/files/2023-09/SAIL_Annual-Report-2022-2023.pdf", page: "PDF p. 31", quote: "DSP recorded the best ever production of Hot Metal at 2.57 MT, surpassing the previous best of 2.52 MT recorded in the FY 2018-19." },
      { name: "SAIL Annual Report 2018-19", url: "https://sail.co.in/sites/default/files/2024-03/SAILAR201819.pdf", page: "PDF p. 13", quote: "Durgapur Steel Plant(DSP) achieved the best ever annual Hot Metal, Crude Steel and Saleable Steel production during the Financial Year 2018-19 at 2.52" }] },
  { fy: "2019-20", mt: null, why: AT_MOST, sources: [] },
  { fy: "2020-21", mt: null, why: AT_MOST, sources: [] },
  { fy: "2021-22", mt: null, why: AT_MOST, sources: [] },
  { fy: "2022-23", mt: 2.56, why: "2.56 MT as the 2023-24 report gives it. The 2022-23 report itself gave 2.57 MT for that year; the later figure is kept because 2.57 MT is the 2023-24 record that it \"surpassed\".",
    sources: [{ name: "SAIL Annual Report 2023-24", url: "https://sail.co.in/sites/default/files/ticker/2024-09/SAIL_Annual_Report2023-24.pdf", page: "PDF p. 30", quote: "DSP recorded the best ever production of Hot Metal at 2.57 MT, surpassing the previous best of 2.56 MT recorded in the FY 2022-23." },
      { name: "SAIL Annual Report 2022-23", url: "https://sail.co.in/sites/default/files/2023-09/SAIL_Annual-Report-2022-2023.pdf", page: "PDF p. 31", quote: "DSP recorded the best ever production of Hot Metal at 2.57 MT, surpassing the previous best of 2.52 MT recorded in the FY 2018-19." }] },
  { fy: "2023-24", mt: 2.57, why: "The best ever hot metal.", sources: [{ name: "SAIL Annual Report 2023-24", url: "https://sail.co.in/sites/default/files/ticker/2024-09/SAIL_Annual_Report2023-24.pdf", page: "PDF p. 30", quote: "DSP recorded the best ever production of Hot Metal at 2.57 MT, surpassing the previous best of 2.56 MT recorded in the FY 2022-23." }] },
  { fy: "2024-25", mt: 2.50, why: "Below the 2023-24 record.", sources: [{ name: "SAIL Annual Report 2024-25", url: "https://sail.co.in/sites/default/files/2025-08/Sail%20Annual%20Report_2025_(25_08_2025).pdf", page: "PDF p. 30", quote: "Durgapur Steel Plant (DSP) recorded the production of Hot Metal at 2.50 MT, Crude Steel at 2.26 MT and Saleable Steel 2.15 MT." }] },
  { fy: "2025-26", mt: null, why: "SAIL's 2025-26 annual report gives no hot metal for DSP (it says only that finished steel was the highest ever).", sources: [] },
];

/** the output of three units in 2024-25, in MT (the report gives lakh tonnes: 6.26, 5.57 and 4.28, divided by 10); all three were the unit's highest ever */
export const DSP_MILLS_FY25: ReadonlyArray<{ id: "brc" | "msm" | "mm"; name: string; kind: "Semi-finished" | "Finished"; mt: number; makes: string }> = [
  { id: "brc", name: "Bloom cum Round Caster", kind: "Semi-finished", mt: 0.626, makes: "blooms and rounds" },
  { id: "msm", name: "Medium Structural Mill", kind: "Finished", mt: 0.557, makes: "beams, channels, angles" },
  { id: "mm", name: "Merchant Mill", kind: "Finished", mt: 0.428, makes: "TMT bars" },
];
/** wheel, tyre and axle (WTA) items SAIL supplied to Indian Railways, in numbers (the wheels are made at DSP's Wheel & Axle Plant) */
export const DSP_WTA: ReadonlyArray<{ fy: string; items: number; vandeBharat: number | null; source: ProdSource }> = [
  { fy: "2023-24", items: 42024, vandeBharat: null, source: { name: "SAIL Annual Report 2023-24", url: AR24, page: "PDF p. 34", quote: "42,024 numbers of WTA (Wheel, Tyre, Axle) items were supplied to Indian Railways in FY 2023-24" } },
  { fy: "2024-25", items: 45656, vandeBharat: null, source: { name: "SAIL Annual Report 2024-25", url: AR25, page: "PDF p. 34", quote: "45,656 numbers of WTA (Wheel, Tyre, Axle) items were supplied to Indian Railways in FY 2024-25" } },
  { fy: "2025-26", items: 47200, vandeBharat: 1689, source: { name: "SAIL Annual Report 2025-26", url: AR26, page: "PDF p. 26", quote: "47,200 numbers of WTA (Wheel, Tyre, Axle) items were supplied to Indian Railways in FY 2025-26 ... During FY 2025-26, 1689 numbers of Vande Bharat Wheels were supplied to Indian Railways." } },
];
/** finished steel and semi-finished steel of 2024-25, and the part of finished steel the two named mills do not account for: all worked out from stated figures */
export function fy25Split(): { saleable: number; finished: number; semis: number; finishedShare: number; otherFinished: number } {
  const y = DSP_YEARS.find((x) => x.fy === "2024-25")!, msm = DSP_MILLS_FY25.find((m) => m.id === "msm")!.mt, mm = DSP_MILLS_FY25.find((m) => m.id === "mm")!.mt;
  const saleable = y.saleable!, finished = y.finished!;
  return { saleable, finished, semis: Math.round((saleable - finished) * 1000) / 1000, finishedShare: Math.round((finished / saleable) * 1000) / 10, otherFinished: Math.round((finished - msm - mm) * 1000) / 1000 };
}
/** the change from one year to the next in per cent to one decimal, or null where a year has no figure */
export function yearChange(now: number | null, then: number | null): number | null {
  return now === null || then === null || then === 0 ? null : Math.round(((now - then) / then) * 1000) / 10;
}

export const DSP_MANUAL ="the plant's Operation Department Manual (DSP JO Manual 2022, revised plant-specific manual)";
