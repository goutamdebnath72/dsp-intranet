// src/lib/pdf/downloadEdsPdf.ts
//
// "Download as PDF" for an EDS reply: builds the document model, draws it with the PDF library and hands the file to the browser. The PDF library, the painter and the fonts are
// all loaded HERE, on the click (dynamic import), so nobody pays for them until they ask for a PDF.
import { createElement } from "react";
import { DateTime } from "luxon";
import type { SynthesisResult } from "@/lib/search/executiveSynthesis";
import { IST } from "@/lib/dates";
import { buildEdsPdfModel, hasPdfContent } from "./edsPdfModel";

export class PdfNothingToDownload extends Error {}

/** Makes the PDF of a reply and returns it as a file blob with its suggested name. Throws PdfNothingToDownload for an empty or error reply. */
export async function makeEdsPdf(data: SynthesisResult, question: string | null | undefined, abbreviations: Array<[string, string]>): Promise<{ blob: Blob; fileName: string }> {
  if (!hasPdfContent(data)) throw new PdfNothingToDownload("This reply has nothing to put in a PDF.");
  const [{ pdf, Font }, { EdsPdfDocument }, { registerPdfFonts }] = await Promise.all([import("@react-pdf/renderer"), import("./edsPdfDocument"), import("./edsPdfFonts")]);
  registerPdfFonts(Font as any, window.location.origin);
  const model = buildEdsPdfModel(data, { question, now: DateTime.now().setZone(IST), abbreviations });
  const blob = await pdf(createElement(EdsPdfDocument, { model }) as any).toBlob(); // the painter's root is a <Document>; the library's types cannot see through the wrapper
  return { blob, fileName: model.fileName };
}

/** Gives a blob to the browser as a download. */
export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export async function downloadEdsPdf(data: SynthesisResult, question: string | null | undefined, abbreviations: Array<[string, string]>): Promise<string> {
  const { blob, fileName } = await makeEdsPdf(data, question, abbreviations);
  saveBlob(blob, fileName);
  return fileName;
}
