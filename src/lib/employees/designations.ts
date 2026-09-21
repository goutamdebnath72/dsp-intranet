// src/lib/employees/designations.ts
//
// Canonical designation dictionary for employee analytics.
// The `canonical` strings are BYTE-EXACT to what is stored in user.designation
// (verified against the live distribution). Counts must match on the exact
// string, never ILIKE — because "General Manager" is a substring of
// "Asst.General Manager", "Dy. General Manager" and "Chief General Manager".

export type DesigClass = "exec" | "medical" | "nonexec";

export interface Rank {
  canonical: string; // EXACT stored string in user.designation
  short: string; // display short form
  class: DesigClass;
  aliases: string[]; // user-typable terms (matched after normalization)
}

// Managerial executive ranks + Medical & Health Services (M-HS) cadre.
export const RANKS: Rank[] = [
  { canonical: "Executive Director",   short: "ED",       class: "exec", aliases: ["ed", "executive director"] },
  { canonical: "Chief General Manager", short: "CGM",     class: "exec", aliases: ["cgm", "chief general manager", "chief gm"] },
  { canonical: "General Manager",      short: "GM",       class: "exec", aliases: ["gm", "general manager"] },
  { canonical: "Dy. General Manager",  short: "DGM",      class: "exec", aliases: ["dgm", "dy general manager", "deputy general manager", "dy gm", "deputy gm"] },
  { canonical: "Asst.General Manager", short: "AGM",      class: "exec", aliases: ["agm", "asst general manager", "assistant general manager", "asst gm", "assistant gm"] },
  { canonical: "Sr. Manager",          short: "Sr Mgr",   class: "exec", aliases: ["sr manager", "senior manager", "sr mgr", "sr mngr", "senior mgr"] },
  { canonical: "Manager",              short: "Manager",  class: "exec", aliases: ["manager", "mgr", "mngr"] },
  { canonical: "Dy. Manager",          short: "Dy Mgr",   class: "exec", aliases: ["dy manager", "deputy manager", "dy mgr", "deputy mgr"] },
  { canonical: "Asst. Manager",        short: "Asst Mgr", class: "exec", aliases: ["asst manager", "assistant manager", "asst mgr", "assistant mgr"] },
  { canonical: "Junior Manager",       short: "Jr Mgr",   class: "exec", aliases: ["junior manager", "jr manager", "jr mgr", "junior mgr"] },

  { canonical: "Director(M-HS)",                 short: "Director (M-HS)",          class: "medical", aliases: ["director m-hs", "director mhs", "director medical", "medical director"] },
  { canonical: "Sr. Deputy Director",            short: "Sr Dy Director",           class: "medical", aliases: ["sr deputy director", "senior deputy director", "sr dy director"] },
  { canonical: "Joint Director",                 short: "Joint Director",           class: "medical", aliases: ["joint director", "jt director"] },
  { canonical: "Asst. Director/Sr. Consultant",  short: "Asst Director/Sr Consult", class: "medical", aliases: ["asst director", "assistant director", "sr consultant", "senior consultant"] },
  { canonical: "DMO/Consultant",                 short: "DMO/Consultant",           class: "medical", aliases: ["dmo", "dmo consultant", "deputy medical officer"] },
  { canonical: "ADMO/Specialist",                short: "ADMO/Specialist",          class: "medical", aliases: ["admo", "specialist", "admo specialist"] },
  { canonical: "Medical Officer",                short: "MO",                       class: "medical", aliases: ["medical officer", "mo"] },
];

// Non-executive scale S-1 .. S-11 (stored with a hyphen).
export const NONEXEC_DESIGNATIONS: string[] = Array.from(
  { length: 11 },
  (_, i) => `S-${i + 1}`,
);

export const EXEC_DESIGNATIONS = RANKS.filter((r) => r.class === "exec").map((r) => r.canonical);
export const MEDICAL_DESIGNATIONS = RANKS.filter((r) => r.class === "medical").map((r) => r.canonical);
// "Executive" at DSP = anyone NOT on the S-scale (managerial + medical + any stray title).
export const ALL_EXEC_DESIGNATIONS = [...EXEC_DESIGNATIONS, ...MEDICAL_DESIGNATIONS];

// Normalize a term for matching: lowercase, strip dots/hyphens/extra spaces.
export function normTerm(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/[.\-_/]/g, " ")
    .replace(/&/g, " and ")
    .replace(/[?!,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const ALIAS_INDEX: Map<string, string> = (() => {
  const m = new Map<string, string>();
  for (const r of RANKS) {
    m.set(normTerm(r.canonical), r.canonical);
    m.set(normTerm(r.short), r.canonical);
    for (const a of r.aliases) m.set(normTerm(a), r.canonical);
  }
  return m;
})();

export interface DesignationResolution {
  canonicals: string[]; // exact stored strings to match
  label: string; // human label for the answer
  kind: "rank" | "sgrade" | "exec" | "nonexec";
}

/**
 * Resolve a user term to the exact stored designation string(s).
 * Returns null if the term isn't a recognised designation/class.
 */
export function resolveDesignation(term: string): DesignationResolution | null {
  const n = normTerm(term);
  if (!n) return null;

  // group terms
  if (["executive", "executives", "exec", "execs", "officer", "officers"].includes(n))
    return { canonicals: ALL_EXEC_DESIGNATIONS, label: "Executives", kind: "exec" };
  if (
    ["non executive", "non executives", "nonexecutive", "non exec", "s grade", "s grades", "s scale", "worker", "workers", "non executive staff"].includes(n)
  )
    return { canonicals: NONEXEC_DESIGNATIONS, label: "Non-executives", kind: "nonexec" };

  // exact rank alias
  const canon = ALIAS_INDEX.get(n);
  if (canon) {
    const r = RANKS.find((x) => x.canonical === canon)!;
    return { canonicals: [canon], label: r.short, kind: "rank" };
  }

  // S-grade pattern: s1, s 1, s-1, grade s1
  const sm = n.match(/^(?:grade\s*)?s\s*(\d{1,2})$/);
  if (sm) {
    const num = parseInt(sm[1], 10);
    if (num >= 1 && num <= 11)
      return { canonicals: [`S-${num}`], label: `S-${num}`, kind: "sgrade" };
  }

  return null;
}

// Rank hierarchy for display order: managerial executives (senior -> junior),
// then Medical & Health Services cadre (senior -> junior), then the S-scale
// from S-11 (senior-most non-exec) down to S-1. RANKS is already declared in
// seniority order, so we reuse it. (If S-1 should be treated as senior instead,
// flip the S-range below — one line.)
export const HIERARCHY: string[] = [
  ...RANKS.map((r) => r.canonical),
  ...Array.from({ length: 11 }, (_, i) => `S-${11 - i}`),
];
export const HIERARCHY_INDEX: Map<string, number> = new Map(
  HIERARCHY.map((c, i) => [c, i]),
);
