/**
 * Self-test of the page reconciliation. Run: npx tsx --tsconfig tsconfig.json src/lib/ingestion/pageVerify.selftest.ts
 * The main test uses the 11 real hard pages of the OCR pilot (both readings are in __fixtures__/pilot-readings.json) and the hand-made truth
 * (eval/ocr-pilot-truth.json): the stored text must read the truth at least as well as either reader did alone.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { scoreText, type Truth } from "./ocrScore";
import { STOPPED_MARKER } from "./pageReader";
import { cleanSecondReading, pairDisputes, reconcilePage } from "./pageVerify";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };

const pilot: { id: string; pipeline: string; gemini: string }[] = JSON.parse(readFileSync(join(__dirname, "__fixtures__", "pilot-readings.json"), "utf8"));
const truth = new Map<string, Truth>((JSON.parse(readFileSync(join(__dirname, "..", "..", "..", "eval", "ocr-pilot-truth.json"), "utf8")).pages as Truth[]).map((t) => [t.id, t]));
const page = (id: string) => pilot.find((p) => p.id === id) as { id: string; pipeline: string; gemini: string };

// ---------------------------------------------------------------- the real pages against the truth
{
  const before = { n: 0, p: 0, t: 0, f: 0 }, after = { n: 0, p: 0, t: 0, f: 0 };
  let N = 0, PH = 0, TG = 0, fromSecond = 0;
  for (const pg of pilot) {
    const tr = truth.get(pg.id) as Truth;
    const v = reconcilePage(pg.pipeline, pg.gemini, "gemini:test");
    const b: any = scoreText(pg.pipeline, tr), a: any = scoreText(v.text, tr);
    N += tr.numbers.length; PH += tr.phrases.length; TG += tr.together.length;
    before.n += b.numbersFound; before.p += b.phrasesFound; before.t += b.togetherFound; before.f += b.forbiddenFound?.length ?? 0;
    after.n += a.numbersFound; after.p += a.phrasesFound; after.t += a.togetherFound; after.f += a.forbiddenFound?.length ?? 0;
    if (v.source === "second") fromSecond++;
  }
  ok("the truth holds 120 numbers, 69 phrases and 26 label+value pairs on 11 pages", pilot.length === 11 && N === 120 && PH === 69 && TG === 26, `${N}/${PH}/${TG}`);
  ok("the pipeline alone reads 117 numbers, 66 phrases, 24 pairs (the baseline this step improves on)", before.n === 117 && before.p === 66 && before.t === 24, JSON.stringify(before));
  ok("the STORED text reads all 120 numbers, 69 phrases and 26 pairs", after.n === 120 && after.p === 69 && after.t === 26, JSON.stringify(after));
  ok("...with no forbidden (known wrong) reading", after.f === 0, String(after.f));
  ok("every one of the 11 real pages takes the second reading as its text", fromSecond === 11, String(fromSecond));
}

// ---------------------------------------------------------------- what the log records on the real pages (the known misreads)
{
  const med = reconcilePage(page("mediclaim-hindi").pipeline, page("mediclaim-hindi").gemini, "g");
  ok("REAL: the mediclaim date misread by the pipeline ('20-0802') is recorded as a dispute with the right date", med.disputes.some((d) => d.pipeline === "20.0802" && d.second === "20.08.2026"), JSON.stringify(med.disputes));
  ok("REAL: the stored mediclaim page has the right date", /20-08-2026/.test(med.text), med.text.slice(0, 200));
  const gh = reconcilePage(page("gift-card-hindi").pipeline, page("gift-card-hindi").gemini, "g");
  ok("REAL: the pipeline's '215000' (a rupee sign read as 2) is dropped and recorded", gh.dropped.includes("215000") && !/215,?000/.test(gh.text), JSON.stringify(gh.dropped));
  const wn = reconcilePage(page("wage-notice").pipeline, page("wage-notice").gemini, "g");
  ok("REAL: stamp noise ('9022' beside the stamp) is dropped and recorded", wn.dropped.includes("9022"), JSON.stringify(wn.dropped));
  const ft = reconcilePage(page("football-trial").pipeline, page("football-trial").gemini, "g");
  ok("REAL: the check row has no unconfirmed numbers (the stored text is the better reading) and names the reader", !!ft.check && ft.check.unconfirmed.length === 0 && ft.check.reader === "g" && ft.check.confirmed.length > 0, JSON.stringify(ft.check).slice(0, 160));
  const agreed = reconcilePage(page("gift-card-corrigendum").pipeline, page("gift-card-corrigendum").gemini, "g");
  ok("REAL: when every important number agrees, the page says so", !!agreed.check && agreed.check.status === "agreed" && agreed.stats.onlyPipeline === 0 && agreed.stats.onlySecond === 0, JSON.stringify(agreed.stats));
}

// ---------------------------------------------------------------- when the second reading cannot be used, the pipeline's text STAYS
{
  const pg = page("wage-notice");
  const base = pg.pipeline.trim();
  const kept = (v: ReturnType<typeof reconcilePage>) => v.source === "pipeline" && v.text === base && v.check === null;
  ok("the reader failed: the pipeline's text stays, no check", kept(reconcilePage(pg.pipeline, undefined, "g", "Gemini answered 429: quota")), "");
  ok("...and the reason is in the log", /no second reading: Gemini answered 429/.test(reconcilePage(pg.pipeline, undefined, "g", "Gemini answered 429: quota").reason));
  ok("an empty reply: the pipeline's text stays", kept(reconcilePage(pg.pipeline, "   ", "g")));
  ok("a reply cut off or looping (the stopped mark): the pipeline's text stays", kept(reconcilePage(pg.pipeline, pg.gemini + "\n" + STOPPED_MARKER, "g")));
  ok("a reading far too short for the page: the pipeline's text stays", kept(reconcilePage(pg.pipeline, "Notice", "g")));
  const other = Array.from({ length: 8 }, (_, i) => `Quarterly maintenance schedule number ${i} of the sinter plant conveyor belts with lubrication, inspection, alignment and replacement program for the coming financial year, supervised by the mechanical engineering division`).join(" ");
  const wrongPage = reconcilePage(pg.pipeline, other, "g");
  ok("a reading of ANOTHER page (under half its words in common): the pipeline's text stays", kept(wrongPage) && /do not describe the same page/.test(wrongPage.reason), wrongPage.reason);
  ok("a page the pipeline could not read at all takes the second reading", (() => { const v = reconcilePage("", pg.gemini, "g"); return v.source === "second" && v.text.length > 100 && /read nothing/.test(v.reason); })());
  ok("null and undefined pipeline text are handled", reconcilePage(null, pg.gemini, "g").source === "second" && reconcilePage(undefined, undefined, "g").source === "pipeline");
}

// ---------------------------------------------------------------- cleaning, pairing
{
  ok("the bare marks of a logo, a stamp and a blank form are removed", !/\[(logo|stamp|blank form rows)\]/i.test(cleanSecondReading("[logo]\nSTEEL AUTHORITY\n[stamp]\nReceived\n[blank form rows]\nEnd")));
  ok("the legible text next to a stamp mark stays", /Received/.test(cleanSecondReading("[stamp] Received 12.01.2026")));
  ok("handwriting and [illegible] stay (they are information)", cleanSecondReading("[handwritten: Roy 24/12/2025?] and [illegible]") === "[handwritten: Roy 24/12/2025?] and [illegible]");
  ok("blank lines are collapsed", cleanSecondReading("a\n\n\n\n\nb") === "a\n\nb");
  const pairs = pairDisputes(["215000", "13203"], ["15000", "713203", "99999"], "Rs 215,000 on 13203", "Rs 15,000 on 713203");
  ok("pairDisputes: numbers one or two digits apart are paired (215000~15000, 13203~713203)", pairs.length === 2 && pairs[0].second === "15000" && pairs[1].second === "713203", JSON.stringify(pairs));
  ok("pairDisputes: numbers further apart are not", pairDisputes(["5000"], ["9999"], "", "").length === 0);
  ok("pairDisputes: a number is paired once", pairDisputes(["15000", "15001"], ["15000x".replace("x", "2")], "", "").length === 1);
  ok("pairDisputes: very short numbers are never paired", pairDisputes(["12"], ["13"], "", "").length === 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
