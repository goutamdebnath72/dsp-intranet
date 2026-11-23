// src/records/types.ts
//
// The umbrella over everything the search bar answers from the intranet's own records (docs/QUERY_UMBRELLA_PLAN.md). Utility Services (src/tools/) and Executive Deep Synthesis stay outside it.
// A "scope" is a FIXED SELECTION the reader makes (People, PAX, Hospital OPD, Holidays, Degrees, Circulars) instead of leaving the bar to guess; "auto" is today's behaviour, untouched.
// I keep domain names out of this file: the list of them is domains.ts.

/** The fixed selections; "auto" means the bar decides, exactly as before. */
export type ScopeId = "auto" | "people" | "pax" | "hospital" | "holidays" | "degrees" | "documents" | "eds" | "admin";
/** The records the bar can search (EDS, the executives' deep synthesis, is a choice of the bar but not a record: it has its own route) */
export type DomainId = Exclude<ScopeId, "auto" | "eds" | "admin">;

/** How a person is looked for, once People is selected. */
export type PeopleFacet = "find" | "roster" | "ask";

export interface FacetInfo {
  id: PeopleFacet;
  label: string;
  /** A single short sentence shown under the selection. */
  hint: string;
  placeholder: string;
  /** Tap-to-fill lines that work under this facet (none for the finder: it has pick-lists) */
  examples: readonly string[];
}

export interface Domain {
  id: DomainId;
  /** the chip's text */
  label: string;
  /** One sentence saying what the bar does when this is chosen. */
  hint: string;
  /** The box's placeholder while this one is chosen. */
  placeholder: string;
  /** Lines that work under this selection, shown as tap-to-fill examples; where an engine can be run offline, the selftest runs each one through the real engine. */
  examples: readonly string[];
  /** Words that make a line this domain's own, for the hint "Looks like ..." */
  cues: RegExp;
  /** The words that NAME the domain ("pax", "opd", "holiday", "circular"): a line holding one is explicit about what it wants */
  named: RegExp;
  /**
   * The forms of the line I give this domain's engine, in the order to try them, until one answers: the line as typed when that is already the engine's own kind of line, then the line completed with the
   *  domain's cue word when the person left it out ("pax number of ...", "... opd", "what is ..."). Pure.
   */
  scopeLines: (line: string) => string[];
}

/** One claim of the planner: this domain could answer, this strongly. */
export interface Claim {
  domain: DomainId;
  band: 1 | 2 | 3 | 5;
  strength: number;
  why: string;
}

/** The planner's reading of a line. I use it for hints and the shadow log only: nothing is routed by it unless the reader chose a scope. */
export interface Plan {
  claims: Claim[];
  /** The best claim, or null when the line is only text for the documents / the model */
  best: Claim | null;
  /** True when two domains are close enough that the bar should not guess. */
  ambiguous: boolean;
}

/** What the reader has chosen in the bar: the selection, for People the way of looking, and the finder's two lists and name. */
export interface Selection {
  scope: ScopeId;
  facet: PeopleFacet;
  /** The department id from the pick-list ("" means any). */
  dept: string;
  /** The designation id from the pick-list ("" means any). */
  grade: string;
  /** An optional part of a name for the finder. */
  nm: string;
}
