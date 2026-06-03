/**
 * Smart Name Helper Utility
 * * Extracts the most appropriate conversational "first name" from a full name string,
 * ignoring common prefixes, honorifics, and religious title abbreviations.
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
 * Parses a full name and extracts the true conversational call-name.
 * * @param fullName - The full raw name string (e.g., "MOHD ANWAR ULLAH", "DR GOUTAM SEN")
 * @returns The resolved first conversational name (e.g., "ANWAR", "GOUTAM")
 */
export function getFriendlyFirstName(
  fullName: string | null | undefined,
): string {
  if (!fullName) return "User";

  // 1. Split the name into individual words, removing extra spaces
  const nameParts = fullName.trim().split(/\s+/);

  // 2. Filter out parts that match our common prefixes (case-insensitive)
  const structuralParts = nameParts.filter((part) => {
    // Strip trailing commas, periods, or colons from the word for clean matching
    const cleanPart = part.replace(/[.,:]/g, "").toUpperCase();
    return !COMMON_PREFIXES.has(cleanPart);
  });

  // 3. Fallback logic: If the entire name consisted of "prefixes" (e.g. "Mr. Md"),
  // return the original first element. Otherwise, return the first structural word.
  const resolvedName =
    structuralParts.length > 0 ? structuralParts[0] : nameParts[0];

  // 4. Return the name in its original casing (preserving UPPERCASE or Capital Case)
  return resolvedName;
}
