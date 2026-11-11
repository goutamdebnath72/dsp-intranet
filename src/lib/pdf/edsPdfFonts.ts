// src/lib/pdf/edsPdfFonts.ts
//
// The fonts of the PDF, registered once. They are embedded in the file (so it looks the same everywhere), and loaded from /fonts/pdf/ only when a PDF is made.
//   Source Sans 3  body text (regular, semibold, bold, italic)      Poppins  headings (semibold, bold: the same face as the app)
//   Source Sans 3 (latin-ext)  the rupee sign, which the latin file lacks     Noto Sans Devanagari / Baloo Da 2  Hindi / Bengali text inside a reply
// WHY Baloo Da 2 for Bengali: the PDF library's text shaper mis-draws Bengali conjuncts and vowel signs (স্ক, স্থ, ব্যবস্থা, ছুটি) with Noto Sans Bengali, while Chrome draws the same font right; Baloo Da 2 (a sans face)
// is drawn right by the library, checked word by word against Chrome on all 90 Bengali words of the archive.
// All are open-licence fonts (SIL OFL; the licence texts are in /public/fonts/pdf/). The formats are WOFF: the PDF library reads TTF and WOFF, not WOFF2.
import type { Run, Script } from "./edsPdfModel";

export const FAMILY = {
  body: "SourceSans",
  rupee: "SourceSansExt",
  heading: "PdfPoppins",
  devanagari: "NotoDevanagari",
  bengali: "BalooBengali",
} as const;

let registered = false;

/** Registers the fonts with the PDF library (`Font` of @react-pdf/renderer). `base` is the address the /fonts/pdf folder is served from (the site's origin in a browser). */
export function registerPdfFonts(Font: { register: (o: any) => void; registerHyphenationCallback: (cb: (w: string) => string[]) => void }, base: string): void {
  if (registered) return;
  registered = true;
  const u = (file: string) => `${base.replace(/\/$/, "")}/fonts/pdf/${file}`;
  Font.register({
    family: FAMILY.body,
    fonts: [
      { src: u("source-sans-3-latin-400-normal.woff"), fontWeight: 400 },
      { src: u("source-sans-3-latin-400-italic.woff"), fontWeight: 400, fontStyle: "italic" },
      { src: u("source-sans-3-latin-600-normal.woff"), fontWeight: 600 },
      { src: u("source-sans-3-latin-700-normal.woff"), fontWeight: 700 },
    ],
  });
  Font.register({
    family: FAMILY.rupee,
    fonts: [
      { src: u("source-sans-3-latin-ext-400-normal.woff"), fontWeight: 400 },
      { src: u("source-sans-3-latin-ext-600-normal.woff"), fontWeight: 600 },
      { src: u("source-sans-3-latin-ext-700-normal.woff"), fontWeight: 700 },
    ],
  });
  Font.register({ family: FAMILY.heading, fonts: [{ src: u("poppins-latin-600-normal.woff"), fontWeight: 600 }, { src: u("poppins-latin-700-normal.woff"), fontWeight: 700 }] });
  // the Indic fonts have no italic: a Hindi or Bengali word inside an italic paragraph (the question block) is drawn upright, so "italic" is registered with the upright files (without it the library stops with "could not resolve font")
  const upright = (a: string, b: string) => [{ src: u(a), fontWeight: 400 }, { src: u(b), fontWeight: 700 }, { src: u(a), fontWeight: 400, fontStyle: "italic" }, { src: u(b), fontWeight: 700, fontStyle: "italic" }];
  Font.register({ family: FAMILY.devanagari, fonts: upright("noto-sans-devanagari-devanagari-400-normal.woff", "noto-sans-devanagari-devanagari-700-normal.woff") });
  Font.register({ family: FAMILY.bengali, fonts: upright("baloo-da-2-bengali-400-normal.woff", "baloo-da-2-bengali-700-normal.woff") });
  // never break a word with a hyphen: names, ticket numbers and amounts must stay whole
  Font.registerHyphenationCallback((word) => [word]);
}

/** The style of one run: its font by script, its weight and slant. `heading` draws Latin text in the heading face. */
export function runStyle(run: Pick<Run, "script" | "bold" | "italic" | "code">, heading = false): { fontFamily: string; fontWeight: number; fontStyle?: "italic" } {
  const bold = !!run.bold || !!run.code;
  const family = (script: Script): string => {
    switch (script) {
      case "rupee": return FAMILY.rupee;
      case "devanagari": return FAMILY.devanagari;
      case "bengali": return FAMILY.bengali;
      default: return heading ? FAMILY.heading : FAMILY.body;
    }
  };
  const weight = (script: Script): number => {
    if (script === "devanagari" || script === "bengali") return bold ? 700 : 400; // the Indic fonts have 400 and 700 only
    if (heading && script === "latin") return bold ? 700 : 600;
    return run.code ? 600 : bold ? 700 : 400;
  };
  return { fontFamily: family(run.script), fontWeight: weight(run.script), ...(run.italic && run.script === "latin" && !heading ? { fontStyle: "italic" as const } : {}) };
}
