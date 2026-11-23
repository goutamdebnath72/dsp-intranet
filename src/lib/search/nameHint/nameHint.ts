// src/lib/search/nameHint/nameHint.ts
//
// "THIS LOOKS LIKE A NAME": while a person types in the search bar, one to four words that read as an Indian name (or a part of one) earn the hint "Looks like a name. Press Enter to search people", the same
// way a line that clearly names a utility earns "Looks like <utility>. Press Enter to open it". It is a HINT and nothing more: it changes no search, it never stops one, and it is shown only when no
// command or utility has claimed the line. I run it in the browser, on every keystroke, with no network and no AI model: a few set look-ups (well under a millisecond). Nothing typed is sent anywhere.
//
// I use two sources of knowledge, and each can be switched off (src/lib/search/nameHint/config.ts):
//   - BUILT-IN: common Indian given names and family names written out in indianNames.ts, and the endings of compound names (Ajaykumar, Gopinath);
//   - PLANT: the name words of the directory itself (the words only, with nobody attached), fetched once when the search bar opens (/api/employees/name-words).
// A word is recognised when it is the same word, or has the same phonetic code (Goutam = Gautam; the code the database itself uses: foldToken), or, for the plant's words only, is one slip away
// in a spelling-equivalent key (Gosyami -> Goswami: reported as "similar", so the screen can say which word it took it for). Pure.

import { foldToken } from "@/lib/employees/namePredicate";
import { FIRST_NAMES, HONORIFICS, NAME_ENDINGS, SURNAMES } from "./indianNames";

export type NameBasis = "builtin" | "plant" | "similar";

export interface NameHint {
  /** the name words I read from the line, in upper case, with honorifics and initials left out */
  words: string[];
  /** the number of words in the line, initials included (the honorific excluded) */
  wordCount: number;
  /** how the words were recognised: I report the WEAKEST basis among them (every word is at least this well known; plant is the strongest, then built-in, then similar spelling) */
  basis: NameBasis;
  /** for a word recognised only by similar spelling: the plant word I took it for, e.g. { typed: "GOSYAMI", took: "GOSWAMI" } */
  similarTo?: { typed: string; took: string };
}

/** the plant's words, which I prepare once: the words, their phonetic codes, and the keys of their spelling */
export interface PlantVocab {
  words: Set<string>;
  /** maps a phonetic code to the words that have it */
  byCode: Map<string, string[]>;
  keys: Map<string, string>;
}

const letters = (w: string): string => String(w ?? "").toUpperCase().replace(/[^A-Z]/g, "");
/** W or Y after a consonant and before a vowel is silent in a Bengali name (Goswami = Goshami = Gosyami); I use the same key as src/lib/nl2sql/nameSpelling.ts */
const withoutGlides = (w: string): string => letters(w).replace(/([BCDFGHJKLMNPQRSTVXZ])[WY](?=[AEIOU])/g, "$1");
const spellingKey = (w: string): string => foldToken(withoutGlides(w), false);
/** I take the phonetic code of a word both as a first word and as a last word, because the database compares either */
const codesOf = (w: string): string[] => [foldToken(letters(w), false), foldToken(letters(w), true)];

const addByCode = (m: Map<string, string[]>, w: string): void => {
  for (const c of new Set(codesOf(w))) {
    const list = m.get(c);
    if (list) list.push(w);
    else m.set(c, [w]);
  }
};
const BUILTIN_WORDS = new Set<string>([...FIRST_NAMES, ...SURNAMES].map(letters));
const BUILTIN_BY_CODE = new Map<string, string[]>();
for (const w of BUILTIN_WORDS) addByCode(BUILTIN_BY_CODE, w);
const HONORIFIC_SET = new Set<string>(HONORIFICS);
/** words people add after a name that are not part of it */
const COURTESY_AFTER = new Set<string>(["SIR", "MADAM", "MAM", "JI", "SAHEB", "SAHAB"]);

/** I never accept these as a name part, even if a vocabulary happens to hold them: they are the words of commands and questions */
const NEVER_NAMES = new Set<string>(
  (
    // I keep question words, the commonest English words, and the words of this app's commands out of the name check, even where a vocabulary holds a similar word
    "THE AND FOR OF IN ON AT TO IS ARE WAS WERE WHAT WHO WHOM WHICH WHEN WHERE WHY HOW LIST SHOW TELL GIVE FIND GET OPEN SEARCH PRICE RATE RATES TIME TODAY NOW DATE DAY WEEK MONTH YEAR GOLD SILVER TRAIN FLIGHT BUS WEATHER NEWS CIRCULAR CIRCULARS POLICY RULE RULES LEAVE HOLIDAY HOLIDAYS LOAN PF PAY SALARY BONUS FORM FORMS LETTER NOTICE ORDER ANNOUNCEMENT ANNOUNCEMENTS MEDICAL HOSPITAL OPD DOCTOR DOCTORS EXECUTIVE EXECUTIVES OFFICER OFFICERS EMPLOYEE EMPLOYEES STAFF DEPARTMENT DEPARTMENTS PLANT STEEL IRON COAL MILL SAIL DSP DURGAPUR ASANSOL KOLKATA DELHI MUMBAI CHENNAI HELP ADMIN MANAGEMENT SPORTS CRICKET SCORE PRODUCTION " +
      "ABOUT ABOVE AFTER AGAIN AHEAD ALLOW ALONE ALONG ALSO ALWAYS AMONG ANOTHER ANSWER ANY ANYONE AROUND ASK BACK BEFORE BEHIND BELOW BEST BETTER BETWEEN BIG BOTH BUTTON CALL CAN CAME CHANGE CHECK CLICK CLOSE COME COULD COUNT DATA DOES DONE DOWN DURING EACH EITHER ELSE ENOUGH EVEN EVERY EXACT EXAMPLE FEW FIRST FOLLOW FROM FULL GOES GOOD GREAT HAS HAVE HERE HIGH HOME HOUR HOURS INDEX INSIDE INTO ITEM ITEMS JOIN JUST KEEP KIND KNOW LARGE LAST LATER LEAST LESS LIKE LINE LINK LITTLE LONG LOOK MADE MAIN MAKE MAKER MAKES MANY MAY MEAN MEANS MORE MOST MUCH MUST NAME NAMES NEAR NEED NEVER NEW NEXT NORMAL NOTHING NUMBER OFTEN ONLY OTHER OUT OVER PAGE PART PEOPLE PERSON PLACE PLEASE POINT PRESENT PRINT RANGE RATHER READY REAL RIGHT ROUND SAME SAVE SEE SEEM SEND SENT SERIES SET SEVERAL SHOULD SIDE SIMPLE SINCE SMALL SOME SOMEONE SOMETHING SOON START STILL SUCH SURE TAKE TEXT THAN THAT THEIR THEM THEN THERE THESE THEY THING THINGS THINK THIS THOSE THOUGH THREE THROUGH TIMES TOGETHER TOO TOTAL TRY TURN UNDER UNTIL UPON USE USED USER USING VALUE VERY WANT WAY WELL WENT WHETHER WHILE WILL WITH WITHIN WITHOUT WORD WORDS WORK WOULD WRITE YES YET YOUR"
  ).split(" "),
);

/** a word of six letters or more that is a known stem plus a known ending (Ajaykumar, Gopinath) I read as a name */
const hasNameEnding = (w: string): boolean => w.length >= 6 && NAME_ENDINGS.some((e) => w.endsWith(e) && w.length > e.length + 1);

export function buildPlantVocab(words: string[]): PlantVocab {
  const set = new Set<string>();
  const byCode = new Map<string, string[]>();
  const keys = new Map<string, string>();
  for (const raw of words) {
    const w = letters(raw);
    if (w.length < 3 || set.has(w)) continue;
    set.add(w);
    addByCode(byCode, w);
    keys.set(w, spellingKey(w));
  }
  return { words: set, byCode, keys };
}

/** Returns the number of single-letter slips (insert, delete, change, or swap two neighbours) between two words, or `cap + 1` as soon as it is certain to be more than `cap` */
function slips(a: string, b: string, cap: number): number {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  const n = a.length, m = b.length;
  let prev2: number[] = [];
  let prev: number[] = Array.from({ length: m + 1 }, (_, j) => j);
  for (let i = 1; i <= n; i++) {
    const cur: number[] = [i];
    let rowMin = i;
    for (let j = 1; j <= m; j++) {
      let d = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d = Math.min(d, prev2[j - 2] + 1);
      cur.push(d);
      if (d < rowMin) rowMin = d;
    }
    if (rowMin > cap) return cap + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[m];
}

/** I count a word with the same phonetic code as a known word only if it is also a NEAR spelling of one (same first letter, within 2 letters of its length, a few slips away): the code alone is too loose for ordinary words */
const nearSpelling = (word: string, candidates: string[] | undefined): boolean =>
  !!candidates && candidates.some((c) => c[0] === word[0] && Math.abs(c.length - word.length) <= 2 && slips(word, c, word.length >= 6 ? 2 : 1) <= (word.length >= 6 ? 2 : 1));

type Known = { basis: NameBasis; took?: string } | null;

const byAnyCode = (word: string, m: Map<string, string[]>): string[] => [...new Set(codesOf(word).flatMap((c) => m.get(c) ?? []))];

function recognise(word: string, useBuiltin: boolean, plant: PlantVocab | null): Known {
  if (NEVER_NAMES.has(word)) return null;
  // I check the plant's own words first (they are the people searched here), then the built-in list; a word of four letters or fewer is matched as written only
  if (plant?.words.has(word)) return { basis: "plant" };
  // I accept the same sound as a known word only when it is also a near spelling of it (Goutam = Gautam, Sandip = Sandeep)
  if (word.length >= 5 && plant && nearSpelling(word, byAnyCode(word, plant.byCode))) return { basis: "plant" };
  if (useBuiltin && BUILTIN_WORDS.has(word)) return { basis: "builtin" };
  if (word.length >= 5 && useBuiltin && nearSpelling(word, byAnyCode(word, BUILTIN_BY_CODE))) return { basis: "builtin" };
  if (useBuiltin && hasNameEnding(word)) return { basis: "builtin" };
  // I accept a spelling that sounds the same as a real word of the plant after a silent W or Y is dropped (Gosyami = Goswami), or is one slip away from it, with the same first letter: said as "similar"
  // (only for a word of six letters or more, and only one slip: a looser rule turned "ahead" into Ahmad and "before" into Bepari)
  if (plant && word.length >= 6) {
    const key = spellingKey(word);
    for (const [w, k] of plant.keys) {
      if (w[0] !== word[0] || Math.abs(w.length - word.length) > 1 || w.length < 6) continue;
      if (slips(word, w, 1) <= 1 || (k === key && slips(word, w, 2) <= 2)) return { basis: "similar", took: w };
    }
  }
  return null;
}

const RANK: Record<NameBasis, number> = { plant: 3, builtin: 2, similar: 1 };

/**
 * The hint for the line typed so far, or null. `useBuiltin` and `plant` are the two sources (either may be off). I treat a line as a name when it has one to four words after any honorific, none with a digit or a
 * symbol, at least one that is not an initial, and EVERY word that is not an initial is recognised.
 */
export function detectNameHint(line: string, sources: { useBuiltin: boolean; plant: PlantVocab | null }): NameHint | null {
  const text = String(line ?? "").trim();
  if (text.length < 2 || text.length > 60) return null;
  if (/[0-9@#$%^&*=+<>?/\\|_~`!:;,"(){}[\]]/.test(text)) return null;
  let tokens = text.split(/\s+/).filter(Boolean);
  if (tokens.length && HONORIFIC_SET.has(letters(tokens[0])) && /^[A-Za-z]+\.?$/.test(tokens[0])) tokens = tokens.slice(1);
  while (tokens.length > 1 && COURTESY_AFTER.has(letters(tokens[tokens.length - 1]))) tokens = tokens.slice(0, -1);
  if (tokens.length < 1 || tokens.length > 4) return null;

  const words: string[] = [];
  let basis: NameBasis | null = null;
  let similarTo: NameHint["similarTo"];
  for (const t of tokens) {
    if (!/^[A-Za-z][A-Za-z.'-]*$/.test(t)) return null;
    const w = letters(t);
    if (!w) return null;
    if (w.length <= 2) continue; // I skip an initial, or two initials written together (G, G., D, SK, MD, KR): it carries no word to recognise
    const k = recognise(w, sources.useBuiltin, sources.plant);
    if (!k) return null;
    words.push(w);
    if (!basis || RANK[k.basis] < RANK[basis]) basis = k.basis;
    if (k.basis === "similar" && !similarTo) similarTo = { typed: w, took: k.took as string };
  }
  if (!words.length || !basis) return null;
  return { words, wordCount: tokens.length, basis, ...(similarTo ? { similarTo } : {}) };
}
