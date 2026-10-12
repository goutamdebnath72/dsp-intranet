// src/lib/circularTitle.ts
//
// How a circular's title is SHOWN on screen. DISPLAY ONLY: the title saved in the database is never changed, so nothing is lost and this can be switched
// off with the one constant below.
//
// Titles were typed by hand, by different people, over the years: some entirely in capitals ("CIRCULAR-HOLIDAY LIST FOR THE YEAR 2026"), some in running
// letters ("Circular - Selection of players for SAIL ..."), some half and half ("CIRCULAR - HTS Jan-May 2026 Session"). Shown in a list that looks untidy,
// so every title is shown the same way: running letters, only the first letter of the first word (and of the subject that follows a "Circular -" label)
// in capital.
//   * A title typed entirely in capitals is converted. Organisation names and abbreviations stay in capitals (SAIL, DSP, PF ... see KEEP_UPPERCASE),
//     months and a few proper names keep their capital (January, Durgapur ... see PROPER_NOUNS).
//   * A title that is already in running letters is left exactly as it is, except that a shouted first word ("CIRCULAR - ...") is put right.
//   * Only the CASE of letters is ever touched: every other character, and the order of the letters, stays exactly as typed (typos included).
// To teach it another abbreviation or name, add it to the lists below.

/** Switch the tidying off (titles are then shown exactly as stored). */
export const NORMALIZE_CIRCULAR_TITLES = true;

/** Abbreviations that stay in capitals. (Any 2-5 letter word with no vowel, like DSP, BSP, PF, HR, LMS, HTS, TT, also stays in capitals by itself.) */
export const KEEP_UPPERCASE: ReadonlySet<string> = new Set(
  [
    "SAIL", "DSP", "BSP", "RSP", "ISP", "BSL", "ASP", "SSP", "VISL", "IISCO", "CMO", "CPSE", "HR", "IT", "ERP", "ESS", "BAMS", "IMS", "PF", "ESI", "ESIC",
    "GPAIS", "LTC", "DA", "MACP", "VRS", "PRC", "JCC", "MOU", "TDS", "GST", "PAN", "EL", "CL", "HPL", "RH", "FH", "CH", "TT", "HTS", "LMS", "SIR", "JO",
    "ICVL", "ED", "GM", "DGM", "AGM", "CGM", "CEO", "MD", "CVO", "NOC", "OPD", "IPD", "ECG", "OBC", "PWD", "EWS", "VIP", "ID", "SMS", "OTP", "UPI", "QR",
    "PDF", "FAQ", "CCTV", "GPS", "ATM", "AI", "SOP", "CSR", "NPS", "CGHS", "ESOP", "IEM", "ISO", "NABH", "NABL",
  ].map((s) => s.toUpperCase()),
);

/** Abbreviations that contain a symbol (the symbol would split them into single letters). */
const COMPOSITES = ["C&IT", "M&HS", "R&D", "S&T", "P&A"];

/** Names that keep a capital letter, in their proper form (key = lowercase). */
export const PROPER_NOUNS: ReadonlyMap<string, string> = new Map(
  [
    "Gaurav", "Diwas", "Swarna", "Jayanti", "Mediclaim", "Durgapur", "Kolkata", "Calcutta", "Delhi", "India", "Bengal", "Hindi", "Bengali", "English",
    "Salem", "Bhilai", "Rourkela", "Bokaro", "Burnpur", "LinkedIn",
  ].map((s) => [s.toLowerCase(), s] as [string, string]),
);

const MONTHS = new Set(
  ["january", "february", "march", "april", "june", "july", "august", "september", "october", "november", "december", "jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep", "sept", "oct", "nov", "dec"],
);
const WEEKDAYS = new Set(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]);
/** Abbreviations written with a capital first letter (Dr., Rs., Ltd. ...). */
const CAPITALISED_ABBREVIATIONS: ReadonlyMap<string, string> = new Map([
  ["dr", "Dr"], ["mr", "Mr"], ["mrs", "Mrs"], ["ms", "Ms"], ["smt", "Smt"], ["ltd", "Ltd"], ["pvt", "Pvt"], ["rs", "Rs"],
]);
/** A word after which a lone I, V or X is a roman numeral (Part-II, Phase I). */
const NUMBERED_THINGS = new Set(["part", "phase", "clause", "schedule", "annexure", "appendix", "category", "grade", "class", "zone", "unit", "batch", "group", "section", "stage", "volume"]);
/** The first word of a title that is only a label; the subject after it starts with a capital too ("Circular - Holiday list"). */
const LABELS = new Set(["circular", "notice", "notification", "memo", "order"]);
/** A title with at most this share of lowercase letters counts as "typed in capitals" (allows a unit like the km in 5km). */
const SHOUTING_MAX_LOWER_SHARE = 0.12;

const ROMAN = /^(?:XC|XL|L?X{0,3})(?:IX|IV|V?I{0,3})$/;
const WORD_OR_COMPOSITE = new RegExp(`\\b(${COMPOSITES.map((c) => c.replace("&", "&")).join("|")})\\b|([A-Za-z]+(?:['’][A-Za-z]+)?)`, "gi");

interface Context {
  whole: string;
  offset: number;
  length: number;
  prevWord: string; // lowercase, "" at the start
}

/** The case a single (already uppercase or any-case) word gets in the middle of a sentence. */
function decideWord(word: string, ctx: Context): string {
  const apostrophe = word.search(/['’]/);
  if (apostrophe > 0) {
    // worker's, don't: the part after the apostrophe is never an abbreviation
    return decideWord(word.slice(0, apostrophe), { ...ctx, length: apostrophe }) + word[apostrophe] + word.slice(apostrophe + 1).toLowerCase();
  }
  const up = word.toUpperCase();
  const lo = word.toLowerCase();
  const before = ctx.whole.slice(0, ctx.offset);
  const after = ctx.whole.slice(ctx.offset + ctx.length);
  const directlyAfterDigit = /\d$/.test(before);
  const directlyBeforeDigit = /^-?\d/.test(after);

  if (KEEP_UPPERCASE.has(up)) return up;
  if (WEEKDAYS.has(lo)) return lo[0].toUpperCase() + lo.slice(1);
  if (MONTHS.has(lo)) return lo[0].toUpperCase() + lo.slice(1);
  if (lo === "may") {
    // the month only next to a number or another month (May-2026, Jan-May 2026); otherwise the word "may"
    const monthNeighbour = /^[-\s]*\d/.test(after) || /\d[-\s]*$/.test(before) || /(?:jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s*-\s*$/i.test(before);
    return monthNeighbour ? "May" : "may";
  }
  const proper = PROPER_NOUNS.get(lo);
  if (proper) return proper;
  const abbreviation = CAPITALISED_ABBREVIATIONS.get(lo);
  if (abbreviation) return abbreviation;
  if (lo === "no" && after.startsWith(".")) return "No"; // "No.-13"
  if (word.length === 1 && directlyBeforeDigit && !directlyAfterDigit) return up; // grade codes: E1, S-3
  if (word.length === 1 && "IVX".includes(up) && NUMBERED_THINGS.has(ctx.prevWord)) return up; // Part-I
  if (word.length >= 2 && ROMAN.test(up)) return up; // Part-II, XII
  if (directlyAfterDigit) return lo; // 26th, 5km: a unit or an ordinal ending
  if (word.length >= 2 && word.length <= 5 && !/[AEIOUY]/i.test(word)) return up; // an abbreviation with no vowel: DSP, PF, LMS
  return lo;
}

const capitalise = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

function convert(title: string, onlyFirstWord: boolean): string {
  let seen = 0;
  let prevWord = "";
  let labelPending = false;
  let prevEnd = 0;
  return title.replace(WORD_OR_COMPOSITE, (m: string, composite: string | undefined, word: string | undefined, offset: number, whole: string) => {
    if (onlyFirstWord && seen > 0) return m;
    const gap = whole.slice(prevEnd, offset);
    prevEnd = offset + m.length;
    let out: string;
    if (composite) {
      out = composite.toUpperCase();
      prevWord = out.toLowerCase();
    } else {
      out = decideWord(word as string, { whole, offset, length: m.length, prevWord });
      prevWord = (word as string).toLowerCase();
    }
    const isFirst = seen === 0;
    // the subject after a label starts with a capital only when the label is followed by a dash, colon or comma ("Circular - Holiday list"), not by a plain
    // space ("Circular for ...")
    const afterLabel = labelPending && /^[\s,.:;–—-]*$/.test(gap) && /[,.:;–—-]/.test(gap);
    // never capitalise the ending of a number (26th)
    const endsANumber = /\d$/.test(whole.slice(0, offset));
    if ((isFirst || afterLabel) && !endsANumber) {
      if (onlyFirstWord && isFirst) {
        // a half-shouted title: fix the first word only if it was shouted (CIRCULAR), never touch an abbreviation (PF, HTS)
        out = out !== m ? capitalise(out.toLowerCase()) : m;
      } else {
        out = capitalise(out);
      }
    }
    labelPending = isFirst && LABELS.has(prevWord);
    seen++;
    return out;
  });
}

/** The title as it should be shown. Never changes anything but the case of letters. */
export function formatCircularTitle(title: string | null | undefined): string {
  if (!title) return "";
  if (!NORMALIZE_CIRCULAR_TITLES) return title;
  const letters = title.replace(/[^A-Za-z]/g, "");
  if (!letters) return title;
  const lowercase = letters.replace(/[^a-z]/g, "").length;
  if (lowercase / letters.length > SHOUTING_MAX_LOWER_SHARE) {
    // already in running letters: only a SHOUTED first word ("CIRCULAR - ...") is put right
    const first = /[A-Za-z]+/.exec(title);
    if (first && first[0] === first[0].toUpperCase() && first[0].length >= 3) return convert(title, true);
    return title;
  }
  return convert(title, false);
}
