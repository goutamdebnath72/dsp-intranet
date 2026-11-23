/**
 * Smart Name Helper Utility
 *
 * I use this to extract conversational names and initials from full name strings;
 * it ignores common prefixes, honorifics, and religious abbreviations.
 */

// My curated, case-insensitive list of common prefixes and honorifics,
// widely used in South Asia and globally.
// Important: keep this in sync with the SQL function public.name_prefixes()
// (04_phonetic_setup.sql), which employee phonetic search uses.
const COMMON_PREFIXES = new Set([
  "MOHD",
  "MOHAMMAD",
  "MOHAMMED",
  "MUHAMMAD",
  "MUHAMMED",
  "MD",
  "MD.",
  "MR",
  "MR.",
  "MRS",
  "MRS.",
  "MS",
  "MS.",
  "DR",
  "DR.",
  "PROF",
  "PROF.",
  "SHRI",
  "SMT",
  "LATE",
  "KM",
  "KUMARI",
]);

/**
 * I split a name into structural parts here, discarding any configured prefixes.
 */
function getStructuralNameParts(fullName: string): string[] {
  const parts = fullName.trim().split(/\s+/);

  const filtered = parts.filter((part) => {
    const cleanPart = part.replace(/[.,:]/g, "").toUpperCase();
    return !COMMON_PREFIXES.has(cleanPart);
  });

  // If the entire name was filtered out as prefixes, I fall back to the original parts
  return filtered.length > 0 ? filtered : parts;
}

/**
 * I parse a full name here and extract the true conversational call-name.
 * @param fullName - The full raw name string (e.g., "MOHD ANWAR ULLAH", "DR GOUTAM SEN")
 * @returns The resolved first conversational name (e.g., "ANWAR", "GOUTAM")
 */
export function getFriendlyFirstName(
  fullName: string | null | undefined,
): string {
  if (!fullName) return "User";
  const structuralParts = getStructuralNameParts(fullName);
  return structuralParts[0];
}

/**
 * I generate up to two initials from a name string and ignore common prefixes.
 * @param fullName - The full raw name string (e.g., "MOHD ANWAR ULLAH")
 * @returns The resolved initials (e.g., "AU" instead of "MA")
 */
export function getInitials(fullName: string | null | undefined): string {
  if (!fullName) return "U";
  const structuralParts = getStructuralNameParts(fullName);

  return structuralParts
    .map((word) => word[0])
    .join("")
    .substring(0, 2)
    .toUpperCase();
}
