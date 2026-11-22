// src/records/types.ts
//
// THE UMBRELLA OVER EVERYTHING THE SEARCH BAR ANSWERS FROM THE INTRANET'S OWN RECORDS (docs/QUERY_UMBRELLA_PLAN.md). Utility Services (src/tools/) and Executive Deep Synthesis stay outside it.
// A "scope" is a FIXED SELECTION the reader makes (People, PAX, Hospital OPD, Holidays, Degrees, Circulars) instead of leaving the bar to guess; "auto" is today's behaviour, untouched.
// This file names no domain: the list of them is domains.ts.

/** the fixed selections; "auto" = the bar decides, exactly as before */
export type ScopeId = "auto" | "people" | "pax" | "hospital" | "holidays" | "degrees" | "documents" | "eds" | "admin";
/** the records the bar can search (EDS, the executives' deep synthesis, is a choice of the bar but not a record: it has its own route) */
export type DomainId = Exclude<ScopeId, "auto" | "eds" | "admin">;

/** how a person is looked for, once People is selected */
export type PeopleFacet = "find" | "roster" | "ask";

export interface FacetInfo {
  id: PeopleFacet;
  label: string;
  /** one short sentence under the selection */
  hint: string;
  placeholder: string;
  /** tap-to-fill lines that work under this facet (none for the finder: it has pick-lists) */
  examples: readonly string[];
}

export interface Domain {
  id: DomainId;
  /** the chip's text */
  label: string;
  /** one sentence: what the bar does when this is chosen */
  hint: string;
  /** the box's placeholder while it is chosen */
  placeholder: string;
  /** lines that work under this selection (shown as tap-to-fill examples; each is run through the real engine by the selftest where an engine can be run offline) */
  examples: readonly string[];
  /** words that make a line this domain's own, for the hint "Looks like ..." */
  cues: RegExp;
  /** the words that NAME the domain ("pax", "opd", "holiday", "circular"): a line holding one is explicit about what it wants */
  named: RegExp;
  /** the forms of the line to give this domain's engine, in the order to try them, until one answers: the line as typed when that is already the engine's own kind of line, then the line completed with the
   *  domain's cue word when the person left it out ("pax number of ...", "... opd", "what is ..."). Pure. */
  scopeLines: (line: string) => string[];
}

/** one claim of the planner: this domain could answer, this strongly */
export interface Claim {
  domain: DomainId;
  band: 1 | 2 | 3 | 5;
  strength: number;
  why: string;
}

/** the planner's reading of a line (hints and the shadow log only: nothing is routed by it unless the reader chose a scope) */
export interface Plan {
  claims: Claim[];
  /** the best claim, or null when the line is only text for the documents / the model */
  best: Claim | null;
  /** two domains close enough that the bar should not guess */
  ambiguous: boolean;
}

/** what the reader has chosen in the bar: the selection, for People the way of looking, and the finder's two lists and name */
export interface Selection {
  scope: ScopeId;
  facet: PeopleFacet;
  /** department id from the pick-list ("" = any) */
  dept: string;
  /** designation id from the pick-list ("" = any) */
  grade: string;
  /** optional part of a name for the finder */
  nm: string;
}
