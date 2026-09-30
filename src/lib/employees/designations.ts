// src/lib/employees/designations.ts
//
// STAGE 8 OVERHAUL (28 Sep 2026): every designation/rank concept this file
// used to own -- RANKS, HIERARCHY, HIERARCHY_INDEX, resolveDesignation,
// NONEXEC_DESIGNATIONS, EXEC_DESIGNATIONS, MEDICAL_DESIGNATIONS,
// ALL_EXEC_DESIGNATIONS, DesigClass, DesignationResolution -- has been
// superseded by designationGrades.ts, which reads the real
// `designation_grade` table instead of a hardcoded array. Confirmed via a
// full search of the app (chat, 28 Sep 2026) that none of those symbols have
// any importer left anywhere outside this file, so they were removed here.
//
// The ONE thing still keeping this file alive: normTerm(), a generic text
// normalizer used by `ai-search/route.ts` and three holiday files
// (`extraction.ts`, `terms.ts`, `parser.ts`) for plain text normalization --
// entirely unrelated to designation/rank logic. Left in place rather than
// moved, so this cleanup doesn't also touch those four unrelated call sites.

/** Normalize a term for matching: lowercase, strip dots/hyphens/extra spaces. */
export function normTerm(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/[.\-_/]/g, " ")
    .replace(/&/g, " and ")
    .replace(/[?!,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
