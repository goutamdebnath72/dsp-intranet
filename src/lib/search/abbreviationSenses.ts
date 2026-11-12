// src/lib/search/abbreviationSenses.ts
//
// A short form with MORE THAN ONE meaning at DSP. The glossary list (ExecutiveBriefing.tsx: DSP_ABBREVIATIONS) can hold one meaning per short form;
// these are the other meanings the same letters have, which only the circular's context can pick ("as per TA rules" is the travelling allowance,
// "the TA office" is the Township Administration). The second reading (edsVerify.ts) reads that context and may name one of THESE senses; a meaning
// that is neither spelled out in the circulars nor listed here is a guess, and is not shown.
// Shared by the engine (server) and the briefing component (client): no imports.

// Only senses the owner has confirmed go here (11 Nov 2026: TA; APO was already in the component).
export const KNOWN_SENSES: Record<string, string[]> = {
  TA: ["Township Administration", "Travelling Allowance"],
  APO: ["Assistant Personnel Officer", "Advanced Planner & Optimizer (SAP module)"],
};

const flat = (s: string) => (s || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** True when `meaning` is one of the listed senses of `abbr` (spelling and punctuation aside). */
export function isKnownSense(abbr: string, meaning: string): boolean {
  const m = flat(meaning);
  return !!m && (KNOWN_SENSES[abbr] ?? []).some((k) => flat(k) === m);
}
