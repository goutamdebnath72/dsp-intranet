/**
 * Smart Name Helper Utility
 *
 * Extracts conversational names and initials from full name strings,
 * ignoring common prefixes, honorifics, and religious abbreviations.
 */

// A curated, case-insensitive list of common prefixes and honorifics
// widely used in South Asia and globally.
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
 * Helper to split a name into structural parts, discarding any configured prefixes.
 */
function getStructuralNameParts(fullName: string): string[] {
  const parts = fullName.trim().split(/\s+/);

  const filtered = parts.filter((part) => {
    const cleanPart = part.replace(/[.,:]/g, "").toUpperCase();
    return !COMMON_PREFIXES.has(cleanPart);
  });

  // Fallback to original parts if the entire name was filtered out as prefixes
  return filtered.length > 0 ? filtered : parts;
}

/**
 * Parses a full name and extracts the true conversational call-name.
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
 * Generates up to two initials from a name string, ignoring common prefixes.
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
