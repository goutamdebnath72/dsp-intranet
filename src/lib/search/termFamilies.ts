// src/lib/search/termFamilies.ts
//
// TERM FAMILIES: words that people at the plant use for the same thing, though their dictionary meanings differ. My words, 23 Nov 2026: "In DSP, Biometric, face recognition, RFID and BAMS are all used interchangeably for the same purpose,
// though they are not the same in literal meaning. Take them as logically equal, along with their individual literal meaning. Keep both sides, to handle any unforeseen query: who will refer to what, we do not know."
//
// So a question that uses ONE word of a family is searched for ALL of them, and nothing is taken away: the typed words stay (their own literal meaning still counts), the others are ADDED. I built it as a general capability, not a rule for one question:
//   - the question's embedding is made from the question plus the family's other words (src/lib/ai/geminiEmbedding.ts, for every kind of search at once);
//   - the circulars' and announcements' word search (a Postgres text-search OR query) gets the other words as extra alternatives (semanticPolicySearch.ts, announcementSemanticSearch.ts);
//   - the per-word rescue of the content search (semanticContentSearch.ts) gets them too.
// I leave the test that counts how many of the TYPED words a passage holds (isLexicalHit) alone: the added words widen what is FOUND, they never make a passage look like a worse match for what was typed.
// To add a new family, add one entry in FAMILIES. This file is pure (no server code, no database).

export interface TermFamily {
  id: string;
  /** What the family is, in words, for people reading this file */
  means: string;
  /** Every way of saying it: the text as it is added to a search, the words of it for a text-search query (a phrase is joined by <->), and the pattern that finds it in a question */
  terms: { text: string; ts: string; re: RegExp }[];
}

export const FAMILIES: TermFamily[] = [
  {
    id: "attendance-technology",
    means: "the attendance and access systems that read a person's body or card: biometric, face recognition, RFID card, BAMS (the Biometric Attendance Management System)",
    terms: [
      { text: "biometric", ts: "biometric", re: /\bbiometrics?\b/i },
      { text: "face recognition", ts: "(face <-> recognition)", re: /\bfac(?:e|ial)[\s-]+recognition\b/i },
      { text: "RFID", ts: "rfid", re: /\brfid\b/i },
      { text: "BAMS", ts: "bams", re: /\bbams\b/i },
    ],
  },
];

/** Returns the family words a question does NOT already use, for each family it uses a word of (empty when it uses none) */
function additions(text: string): { text: string; ts: string }[] {
  const q = String(text ?? "");
  const out: { text: string; ts: string }[] = [];
  for (const f of FAMILIES) {
    if (!f.terms.some((t) => t.re.test(q))) continue;
    for (const t of f.terms) if (!t.re.test(q)) out.push({ text: t.text, ts: t.ts });
  }
  return out;
}

/** Returns the other words of the question's families, as words ("RFID", "BAMS") */
export function termFamilyAdditions(text: string): string[] {
  return additions(text).map((a) => a.text);
}

/** Returns the question with the other words of its families added (for the embedding). When it uses none, I leave the question unchanged. */
export function withTermFamilies(text: string): string {
  const add = termFamilyAdditions(text);
  return add.length ? `${String(text).trim()} (also called: ${add.join(", ")})` : text;
}

/** Returns the other words of the question's families as pieces of a Postgres text-search OR query ("rfid", "(face <-> recognition)"): join them with " | " to the question's own words */
export function termFamilyTsTerms(text: string): string[] {
  return additions(text).map((a) => a.ts);
}
