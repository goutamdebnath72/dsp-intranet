// scripts/render-eds-pdf.mts: draws a saved EDS reply (a JSON file: a SynthesisResult, or a gold-run file) as the same PDF the "Download PDF" button makes, WITHOUT a browser.
// For looking at the layout, and for the layout checks (scripts read the fonts from public/fonts/pdf).
// The PDF library is an ES-module package, so the tool is bundled with esbuild first (the packages stay external) and then run with plain node:
//   npx esbuild scripts/render-eds-pdf.mts --bundle --platform=node --format=esm --packages=external --tsconfig=tsconfig.selftest.json --outfile=.render/render-eds-pdf.mjs \
//     && node .render/render-eds-pdf.mjs <reply.json> <out.pdf> ["the question asked"]
import { createElement } from "react";
import { readFileSync } from "node:fs";
import { DateTime } from "luxon";
import { Font, renderToFile } from "@react-pdf/renderer";
import { buildEdsPdfModel } from "../src/lib/pdf/edsPdfModel";
import { EdsPdfDocument } from "../src/lib/pdf/edsPdfDocument";
import { registerPdfFonts } from "../src/lib/pdf/edsPdfFonts";
import { extractRelevantAbbreviations } from "../src/components/ExecutiveBriefing";

(async () => {
  const [src, out, question] = process.argv.slice(2);
  if (!src || !out) throw new Error("usage: render-eds-pdf.mts <reply.json> <out.pdf> [question]");
  let data = JSON.parse(readFileSync(src, "utf8"));
  if (Array.isArray(data)) data = data[0].res; // a gold-run file
  registerPdfFonts(Font as any, `${process.cwd()}/public`);
  const model = buildEdsPdfModel(data, { question: question || null, now: DateTime.now().setZone("Asia/Kolkata"), abbreviations: extractRelevantAbbreviations(data) });
  console.log(`${model.fileName} | findings ${model.findings.length}, charts ${model.charts.length}, tables ${model.tables.length}, sources ${model.sources.length}`);
  await renderToFile(createElement(EdsPdfDocument, { model }) as any, out);
  console.log("written", out);
})().catch((e) => { console.error("ERR", e?.stack || e); process.exit(1); });
