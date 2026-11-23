// src/lib/employees/designations.ts
//
// Stage 8 overhaul (28 Sep 2026): every designation/rank concept this file
// used to own (RANKS, HIERARCHY, HIERARCHY_INDEX, resolveDesignation,
// NONEXEC_DESIGNATIONS, EXEC_DESIGNATIONS, MEDICAL_DESIGNATIONS,
// ALL_EXEC_DESIGNATIONS, DesigClass, DesignationResolution) has been
// superseded by designationGrades.ts, which reads the real
// `designation_grade` table instead of a hardcoded array. A
// full search of the app (chat, 28 Sep 2026) confirmed that none of those symbols have
// any importer left outside this file, so I removed them here.
//
// The ONE thing still keeping this file alive is normTerm(), a generic text
// normalizer used by `ai-search/route.ts` and three holiday files
// (`extraction.ts`, `terms.ts`, `parser.ts`) for plain text normalization,
// entirely unrelated to designation/rank logic. I left it in place rather than
// moving it, so this cleanup doesn't also touch those four unrelated call sites.

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
