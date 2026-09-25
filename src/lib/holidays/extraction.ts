// src/lib/holidays/extraction.ts
//
// Turns a holiday-list circular's OCR'd text into a staged
// HolidayExtractionPayload (see holiday-extraction-staging.model.ts).
// Deliberately does NOT write to holidaymaster/holidayyear -- that only
// happens later, when an admin explicitly confirms a staged row (see the
// review-before-write decision: this is LLM output feeding a database real
// employees' leave calculations depend on, so nothing here is auto-applied).

import { generateChatResponse } from "@/lib/ai-services";
import { getDb } from "@/lib/db";
import { HolidayType } from "@/lib/db/models/holiday-master.model";
import type {
  HolidayExtractionPayload,
  StagedHolidayEntry,
  StagedRhQuota,
} from "@/lib/db/models/holiday-extraction-staging.model";
import { normTerm } from "@/lib/employees/designations";

// ----------------------------------------------------------------------------
// English-page detection -- content-based, NOT page-order-based.
//
// Verified against two real circulars where the Hindi/English page order was
// reversed between years: the 2026 circular has Hindi pages first, English
// after; the 2024 circular has English pages FIRST, Hindi after. Assuming
// either fixed order would silently extract from the wrong-language pages
// in roughly half of all real cases. Inspecting each page's actual script
// content directly is the only reliable option.
// ----------------------------------------------------------------------------
const INDIC_SCRIPT_RE = /[\u0900-\u097F\u0980-\u09FF]/g;
const LATIN_LETTER_RE = /[A-Za-z]/g;

export function isPrimarilyEnglishPage(pageText: string): boolean {
  if (!pageText || !pageText.trim()) return false;
  const indicChars = (pageText.match(INDIC_SCRIPT_RE) || []).length;
  const latinLetters = (pageText.match(LATIN_LETTER_RE) || []).length;
  // Require a meaningful amount of Latin text, and clearly fewer Indic
  // characters than Latin ones -- a page with a few stray Devanagari glyphs
  // from OCR bleed-through shouldn't be disqualified.
  return latinLetters > 50 && indicChars < latinLetters * 0.3;
}

// ----------------------------------------------------------------------------
// Defensive JSON-object extraction from a raw LLM response. Mirrors
// upload-and-seed/route.ts's own extractPureJsonText, adapted for an OBJECT
// ({...}) response shape instead of an array ([...]), since this endpoint's
// target payload is { holidays: [...], rhQuota: [...] }, not a bare array.
// ----------------------------------------------------------------------------
function extractPureJsonObjectText(raw: string): string {
  let clean = raw.replace(/^\uFEFF/, "").trim();
  clean = clean.replace(/[^\x20-\x7E\n\r[\]{}:,"'A-Za-z0-9_.\- ]+/g, "");

  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("No valid JSON object found in model response");
  }
  return clean.slice(start, end + 1).trim();
}

// ----------------------------------------------------------------------------
// Two focused prompts instead of one three-table prompt. A real extraction
// (2024 circular) came back missing 6 consecutive entries at the tail of the
// 35-row RH table, plus 2 wrong dates and 2 paraphrased names -- all errors
// clustered in the RH table specifically, while the much shorter CH+FH
// section came back clean. Splitting so the RH table gets a call with
// nothing else competing for the model's attention directly targets that
// failure pattern, rather than just hoping a bigger token budget fixes it.
// ----------------------------------------------------------------------------
function buildChFhExtractionPrompt(year: number, text: string): string {
  return `You are extracting structured holiday data from an official Indian steel plant HR circular listing employee holidays for the year ${year}.

Extract ONLY the CLOSED/PUBLIC holidays and FESTIVAL holidays sections. IGNORE the Restricted Holidays (RH) list entirely -- it is handled separately and must not appear in your output.

- CLOSED/PUBLIC holidays (type "CH") -- apply to every employee category, no Category column.
- FESTIVAL holidays (type "FH") -- apply only to specific employee categories (A, B, C, D), shown in a "Category" column next to each row.

Return ONLY a JSON object, no prose, no markdown code fences, in exactly this shape:
{
  "holidays": [
    { "name": string, "date": "YYYY-MM-DD", "type": "CH" | "FH", "categories": string | null, "note": string | null }
  ]
}

Rules:
- "categories" is a comma-separated list like "A,B", taken from that row's Category column. ONLY set it for FH rows -- always null for CH rows.
- "date" must be a real calendar date in ${year}, resolved from the day and month shown (e.g. "24th January" -> "${year}-01-24").
- If the circular text describes a holiday being ADDITIONALLY counted as a Festival Holiday for one specific category, because another holiday fell on a particular Saturday that category already gets off (a conditional, one-off rule, usually described in a note right after the FH table) -- emit this as an EXTRA holiday entry: type "FH", the affected category in "categories", and a "note" field explaining the reason in plain English, taken from the circular's own text. This holiday's normal home is the RH list, not the FH table -- emit it here anyway, as this one extra FH entry, even though you are not otherwise touching RH.
- Every other holiday's "note" must be null.
- Extract every single row from the CH and FH tables. Do not skip, merge, or summarize rows.
- Use each holiday's name EXACTLY as printed in the circular, including every alternate name joined by "/". Do not translate, correct spelling, shorten, or paraphrase it -- if a row lists three alternate names, all three must appear in "name" exactly as printed.

Circular text:
"""
${text}
"""`;
}

function buildRhExtractionPrompt(year: number, text: string): string {
  return `You are extracting structured holiday data from an official Indian steel plant HR circular listing employee holidays for the year ${year}.

Extract ONLY the RESTRICTED HOLIDAYS (RH) list -- a long flat table (often 30-36 rows) of optional holidays every employee category may pick from. IGNORE the Closed/Public and Festival holiday sections entirely -- they are handled separately and must not appear in your output.

Also extract the per-category RH quota, usually stated in a short table near the RH list (e.g. "Category A & C: 4 RH", "Category B: 2 RH", "Category D: 4 RH").

Return ONLY a JSON object, no prose, no markdown code fences, in exactly this shape:
{
  "holidays": [
    { "name": string, "date": "YYYY-MM-DD", "type": "RH", "categories": null, "note": null }
  ],
  "rhQuota": [
    { "category": string, "quota": number }
  ]
}

Rules:
- "categories" and "note" are always null for every RH entry.
- "date" must be a real calendar date in ${year}, resolved from the day and month shown (e.g. "24th January" -> "${year}-01-24").
- Use each holiday's name EXACTLY as printed in the circular, including every alternate name joined by "/". Do not translate, correct spelling, shorten, or paraphrase it.
- "rhQuota" should have one entry per distinct category-or-category-group shown against the RH quota numbers (e.g. if the circular says "Category A & C: 4" as one combined row, emit separate entries { "category": "A", "quota": 4 } and { "category": "C", "quota": 4 }).
- CRITICAL: this list is long (often 30-36 rows) and every single row matters equally -- rows near the END of the list (the last 5-10 entries, typically in November/December) are just as important as the first. Do not stop early, do not summarize a run of rows, do not truncate. Count the rows in the source text yourself before answering, and make sure your output has the same count.

Circular text:
"""
${text}
"""`;
}

// ----------------------------------------------------------------------------
// Near-miss detection: catches spacing/hyphenation/typo-level differences
// (e.g. "Doljatra" vs "Dol Yatra" -- one character apart once whitespace is
// stripped) that normTerm's punctuation-to-space normalization doesn't
// unify, since it preserves word boundaries. Deliberately does NOT attempt
// to catch word-reordering or phrasing differences (e.g. "Guru Nanak's
// Birthday" vs "Birth Day of Guru Nanak") -- that's a fundamentally
// different, much riskier kind of fuzzy match, more likely to incorrectly
// merge two genuinely different holidays that happen to share common words
// ("Day", "Puja", "Birthday") than to correctly catch a real alias.
// ----------------------------------------------------------------------------
function levenshteinDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const matrix: number[][] = Array.from({ length: rows }, () => new Array(cols).fill(0));
  for (let i = 0; i < rows; i++) matrix[i][0] = i;
  for (let j = 0; j < cols; j++) matrix[0][j] = j;
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }
  return matrix[rows - 1][cols - 1];
}

/** Aggressive normalization for near-miss comparison ONLY -- strips ALL
 *  whitespace and punctuation, unlike normTerm (used for exact matching),
 *  which deliberately preserves word boundaries. */
function stripForFuzzyCompare(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** True if two names are near-identical at the character level (spacing,
 *  hyphenation, a typo, a doubled character) but weren't caught by
 *  normTerm's exact-match check (which preserves word boundaries and
 *  doesn't strip everything this aggressively). Conservative: requires
 *  both strings to be at least 4 characters, and the edit distance to be
 *  small relative to length (max of 2 characters or 15% of length) -- an
 *  edit distance of 0 (identical once fully stripped, e.g. a spacing-only
 *  difference like "Netaji's Birth Day" vs "Netaji's Birthday") is the
 *  strongest possible case and always passes. */
function isNearMiss(nameA: string, nameB: string): boolean {
  const a = stripForFuzzyCompare(nameA);
  const b = stripForFuzzyCompare(nameB);
  if (a.length < 4 || b.length < 4) return false; // too short to fuzzy-match safely
  const distance = levenshteinDistance(a, b);
  const threshold = Math.max(2, Math.floor(Math.min(a.length, b.length) * 0.15));
  return distance <= threshold;
}

// ----------------------------------------------------------------------------
// Canonical-name resolution: match each raw extracted name against EXISTING
// holidaymaster rows, scoped by TYPE together with name/alias -- an FH
// extraction only ever matches an FH master, RH only an RH master, etc.
// This is deliberate: the same real festival legitimately has two separate
// master rows (one FH, one RH), sometimes spelled differently between them
// (e.g. "Doljatra" FH vs "Dol Yatra" RH) -- matching name alone, ignoring
// type, would risk merging two rows that are supposed to stay distinct.
//
// When no EXACT match exists, also checks for a near-miss (see above)
// against existing names/aliases of the same type. A near-miss is treated
// as a match to that master, with the new spelling queued as an alias to
// add on confirm (see StagedHolidayEntry.newAlias) -- rather than silently
// creating a brand-new, disconnected master row for what's really the same
// holiday spelled slightly differently. This is surfaced in the admin
// review panel, not applied silently: a wrong near-miss match would
// incorrectly link two different real holidays together, so it goes
// through the same review-before-write gate as everything else here.
// ----------------------------------------------------------------------------
interface RawExtractedHoliday {
  name: string;
  date: string;
  type: HolidayType;
  categories: string | null;
  note: string | null;
}

async function resolveAgainstExistingMasters(
  rawEntries: RawExtractedHoliday[],
): Promise<StagedHolidayEntry[]> {
  const d = await getDb();
  const masters: Array<{
    id: number;
    name: string;
    aliases: string[] | null;
    type: HolidayType;
  }> = await d.query(`SELECT id, name, aliases, type FROM holidaymaster`);

  return rawEntries.map((entry) => {
    const normEntryName = normTerm(entry.name);
    const candidates = masters.filter((m) => m.type === entry.type);

    const exactMatch = candidates.find((m) => {
      if (normTerm(m.name) === normEntryName) return true;
      return (m.aliases ?? []).some((a) => normTerm(a) === normEntryName);
    });

    if (exactMatch) {
      return {
        name: exactMatch.name,
        matchedMasterId: exactMatch.id,
        isNewMaster: false,
        newAlias: null,
        date: entry.date,
        type: entry.type,
        categories: entry.categories,
        note: entry.note,
      };
    }

    const nearMissTarget = candidates.find((m) =>
      [m.name, ...(m.aliases ?? [])].some((candidateName) =>
        isNearMiss(candidateName, entry.name),
      ),
    );

    if (nearMissTarget) {
      return {
        name: nearMissTarget.name, // canonical name still wins downstream
        matchedMasterId: nearMissTarget.id,
        isNewMaster: false,
        newAlias: entry.name, // staged for review; added to the master's
        // aliases only when this batch is confirmed
        date: entry.date,
        type: entry.type,
        categories: entry.categories,
        note: entry.note,
      };
    }

    return {
      name: entry.name,
      matchedMasterId: null,
      isNewMaster: true,
      newAlias: null,
      date: entry.date,
      type: entry.type,
      categories: entry.categories,
      note: entry.note,
    };
  });
}

// ----------------------------------------------------------------------------
// Deterministic, code-level sanity check -- NOT another LLM call. Directly
// targets a confirmed real failure mode: OCR silently dropping the trailing
// rows of the RH table (verified by rendering the actual source PDF pages
// and reading them: a 2024 extraction came back with 30 RH entries when the
// real document has 35, because Tesseract failed to capture a small
// continuation table at the top of a later page). No amount of prompt
// tuning can recover text the model was never given, so this catches the
// gap at the one point it CAN be caught: by counting what came back.
//
// Thresholds are based on every real circular seen so far (2023-2026): CH
// has been exactly 5 every year; RH has been 34-35. The RH threshold has
// headroom below that for legitimate year-to-year variation, while still
// safely catching the real 30-count failure this was built to catch.
// ----------------------------------------------------------------------------
const CH_EXPECTED_COUNT = 5;
const RH_COUNT_WARNING_THRESHOLD = 32;

function buildCountWarnings(holidays: StagedHolidayEntry[]): string[] {
  const warnings: string[] = [];
  const chCount = holidays.filter((h) => h.type === "CH").length;
  const rhCount = holidays.filter((h) => h.type === "RH").length;

  if (chCount !== CH_EXPECTED_COUNT) {
    warnings.push(
      `Expected exactly ${CH_EXPECTED_COUNT} Closed Holidays (CH), found ${chCount}. ` +
        `Every year seen so far (2023-2026) has had exactly ${CH_EXPECTED_COUNT} -- verify against the source PDF before confirming.`,
    );
  }
  if (rhCount < RH_COUNT_WARNING_THRESHOLD) {
    warnings.push(
      `Only ${rhCount} Restricted Holidays (RH) were extracted. Real circulars have listed 34-35 -- ` +
        `this may mean OCR silently dropped some trailing rows (a confirmed real failure mode). ` +
        `Check the source PDF's RH list count before confirming.`,
    );
  }
  return warnings;
}

// ----------------------------------------------------------------------------
// Shared Groq call, as a proper retry LOOP -- not a single one-shot retry.
// Two independent failure modes handled, both observed for real against
// this exact model/account:
//  1. 400 json_validate_failed -- Groq's strict JSON mode rejects the
//     response outright for reasons its own payload doesn't explain (a real
//     observed empty failed_generation). Retried once without strict mode;
//     extractPureJsonObjectText above extracts the JSON substring regardless
//     of any surrounding text, so this still produces usable output.
//  2. 429 rate_limit_exceeded -- this account's tier caps at 8000 tokens
//     per minute, genuinely tight for two ~4000-7000 token calls landing in
//     the same rolling minute. A single retry was NOT always enough: a real
//     run hit a SECOND consecutive 429 on the retry itself, which had no
//     further protection and propagated straight up as an uncaught failure.
//     Now retries up to MAX_ATTEMPTS total, re-parsing Groq's own suggested
//     wait time out of EACH new 429 rather than assuming one wait is enough.
// ----------------------------------------------------------------------------
const EXTRACTION_MAX_TOKENS = 8192;
const MAX_GROQ_ATTEMPTS = 4;

async function callGroqForExtraction(prompt: string): Promise<string> {
  let useJsonMode = true;

  for (let attempt = 1; attempt <= MAX_GROQ_ATTEMPTS; attempt++) {
    try {
      return await generateChatResponse(prompt, {
        jsonMode: useJsonMode,
        maxTokens: EXTRACTION_MAX_TOKENS,
      });
    } catch (err: any) {
      const message = String(err?.message || "");
      const isLastAttempt = attempt === MAX_GROQ_ATTEMPTS;

      if (message.includes("rate_limit_exceeded") && !isLastAttempt) {
        const waitMatch = message.match(/try again in ([\d.]+)s/);
        const waitMs = waitMatch ? Math.ceil(parseFloat(waitMatch[1]) * 1000) + 500 : 8000;
        console.warn(
          `HOLIDAY EXTRACTION: Groq rate limit hit (attempt ${attempt}/${MAX_GROQ_ATTEMPTS}); ` +
            `waiting ${waitMs}ms then retrying:`,
          message,
        );
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        continue;
      }

      if (message.includes("json_validate_failed") && useJsonMode) {
        console.warn(
          "HOLIDAY EXTRACTION: Groq's strict JSON mode rejected the response; " +
            "retrying without it:",
          message,
        );
        useJsonMode = false;
        continue;
      }

      throw err;
    }
  }

  throw new Error("HOLIDAY EXTRACTION: exhausted all Groq retry attempts");
}

// ----------------------------------------------------------------------------
// Top-level entry point. Pass the circular's per-page OCR text (perPageText,
// already in memory at upload time -- no need to re-fetch circular_chunks).
// Runs two focused prompts (CH+FH, and RH+quota) -- see their own header
// comment for why the split exists. SEQUENTIALLY, not concurrently: this
// account's Groq tier caps at 8000 tokens/minute, and running both calls at
// once burst their combined usage past that limit in a real observed 429.
// ----------------------------------------------------------------------------
export async function extractHolidaysFromCircular(
  year: number,
  perPageText: string[],
): Promise<HolidayExtractionPayload> {
  const englishPages = perPageText.filter(isPrimarilyEnglishPage);
  // Falls back to using every page if none confidently classified as
  // English (e.g. OCR quality was poor across the board) -- better to
  // attempt extraction from everything than to silently produce nothing.
  const sourceText =
    englishPages.length > 0 ? englishPages.join("\n\n") : perPageText.join("\n\n");

  const chFhRaw = await callGroqForExtraction(buildChFhExtractionPrompt(year, sourceText));
  const rhRaw = await callGroqForExtraction(buildRhExtractionPrompt(year, sourceText));

  const chFhParsed = JSON.parse(extractPureJsonObjectText(chFhRaw)) as {
    holidays?: RawExtractedHoliday[];
  };
  const rhParsed = JSON.parse(extractPureJsonObjectText(rhRaw)) as {
    holidays?: RawExtractedHoliday[];
    rhQuota?: StagedRhQuota[];
  };

  const rawHolidays = [...(chFhParsed.holidays ?? []), ...(rhParsed.holidays ?? [])];
  const holidays = await resolveAgainstExistingMasters(rawHolidays);
  const rhQuota: StagedRhQuota[] = rhParsed.rhQuota ?? [];
  const warnings = buildCountWarnings(holidays);

  return { holidays, rhQuota, warnings };
}
