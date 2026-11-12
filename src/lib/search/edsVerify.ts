// src/lib/search/edsVerify.ts
//
// THE CHECK THAT READS THE CIRCULARS. Until 11 Nov 2026 every fault found in a briefing was met with one more rule in the prompt or one more regex
// (a wrong count, a discretion holder called an issuer, "directly" added, "Not stated" for an item the circular lists ...). Each such rule fixes the
// last question and nothing else. This module is the general form of all of them: after the best candidate is chosen, a SECOND model call reads the
// whole circular text and the briefing, and reports, sentence by sentence and cell by cell, what the circulars do not support, what they contradict,
// what the table lacks, which part of the question is unanswered, and what each short form stands for in these circulars.
//
// The verifier is itself a model, so nothing it says is taken on trust. Plain code (applyVerdict) applies a report only when the code can check it:
//   - a corrected sentence or cell is used only when its figures are in the circulars (figuresSafe) and its wording is the circulars' wording;
//   - a quote the verifier gives must be found, verbatim, in the circular text, or the item is ignored;
//   - a sentence the circulars do not support, for which no checkable correction is given, is REMOVED (the briefing then says less, never more that is wrong);
//   - a cell is never blanked on the verifier's word alone: "Not stated" is the absence check's business (absenceCheck.ts), which fills, never blanks.
// Pure except for `verifyBriefing`, which makes the model call.

import type { SynthesisResult, SynthesisTable, SynthesisFinding } from "./executiveSynthesis";
import { stemsOf } from "./edsQuality";
import { isKnownSense, KNOWN_SENSES } from "./abbreviationSenses";
import { readable } from "./absenceCheck";

export interface VerifySentence { where?: string; sentence: string; verdict: "unsupported" | "contradicted"; fix?: string; quote?: string }
export interface VerifyCell { table?: "table" | "table2"; row: string; column: string; value: string; quote: string }
export interface VerifyRow { table?: "table" | "table2"; label: string; cells: string[]; quote: string }
export interface VerifyPart { part: string; status: "in_circular" | "not_in_circular"; fact?: string; quote?: string }
export interface VerifyAbbr { abbr: string; meaning: string; quote: string }
/** a year or edition the question names that the table has no column for: one value per row, each with its own quote */
export interface VerifyColumn { table?: "table" | "table2"; column: string; cells: Array<{ row: string; value: string; quote: string }> }
export interface Verdict {
  sentences: VerifySentence[];
  cells: VerifyCell[];
  missingRows: VerifyRow[];
  missingColumns: VerifyColumn[];
  unanswered: VerifyPart[];
  abbreviations: VerifyAbbr[];
  /** a misspelt word of the briefing's own sentences, and its correction (optional: older reports have none) */
  spelling?: Array<{ wrong: string; right: string }>;
}

export const VERIFY_PROMPT = `You check an executive briefing against the circulars it was written from. The circulars are the only truth. You do not improve style, and you do not add what the question did not ask. You report ONLY what is wrong or missing, as strict JSON:
{
  "sentences": [ { "where": "headline", "overview" or "finding N" (N counted from 1), "sentence": "<the sentence exactly as the briefing writes it>", "verdict": "unsupported" or "contradicted", "fix": "<the same sentence rewritten so that it says only what the circulars say, in their own words; an empty string when the sentence should simply be removed>", "quote": "<the circular's own words, copied verbatim, on which the fix rests; empty when the fix is a removal>" } ],
  "cells": [ { "table": "table" or "table2", "row": "<the first cell of the row, exactly as written>", "column": "<the column heading, exactly as written>", "value": "<the right value, in the circular's words>", "quote": "<the circular's words, verbatim, that give this value>" } ],
  "missingRows": [ { "table": "table" or "table2" (the table whose kind of item it is), "label": "<the item's name as the circular writes it>", "cells": ["<one value per column after the first, in that table's column order>"], "quote": "<the circular's words, verbatim, that give this row>" } ],
  "missingColumns": [ { "table": "table" or "table2", "column": "<the year or edition the question names that has no column>", "cells": [ { "row": "<first cell of the row, exactly>", "value": "<that year's value in the circular's words, or 'Not stated in circular'>", "quote": "<the circular's words, verbatim, that give the value; empty for 'Not stated in circular'>" } ] } ],
  "unanswered": [ { "part": "<the part of the question the briefing does not answer>", "status": "in_circular" or "not_in_circular", "fact": "<when in_circular: one sentence that answers it, in the circular's words>", "quote": "<when in_circular: the circular's words, verbatim>" } ],
  "abbreviations": [ { "abbr": "<a short form the briefing uses that has MORE THAN ONE usual meaning>", "meaning": "<the meaning the circulars' own use of it shows>", "quote": "<the circular's words, verbatim, where the short form is used>" } ],
  "spelling": [ { "wrong": "<a misspelt word of the briefing's own sentences, one word>", "right": "<the same word spelt correctly>" } ]
}

Check the headline, every sentence of the overview and of every finding, and every cell of the table(s):
1. UNSUPPORTED: a statement, figure, name, authority, cadence, count, scope word ("all", "every", "only", "unchanged", "increased across") or word of speed, force or consequence ("immediately", "directly", "automatically", "bypasses") that the circulars do not state. An authority the circular names only as holding a discretion does not thereby issue, approve or sanction.
2. CONTRADICTED: the circulars say otherwise, or the briefing's own table shows otherwise (a count of items that is not the number of rows of the table; a figure that differs from the cell; "unchanged" where the table's columns differ).
3. THE TABLE: a cell whose value the circular gives differently; a row that the circular's own table or list has for the same kind of item and the briefing's table lacks (one entry per missing row); a cell that says "Not stated" for an item the circular does mention anywhere (then give the circular's words as the value); a field the circular's table gives for each of its rows that the briefing carries only in part when a reader needs it to act (an account number without its IFSC code, a place without its time: the missing field is given in the cell's fix, from the circular's words, with its quote); a year or edition the question names that has no column of its own (then "missingColumns": every row's value for that year, each with its own verbatim quote from THAT year's circular, even when the value is the same as another year's). A value is short and in the same form as the other cells of its row ("9 days" beside "9 days"). When the circular gives a count only as a numbered list of items (no sentence says "four holidays"), the value gives the count and names the listed items as the circular prints them ("4 holidays: <the names>"), and the quote is that list (up to 60 words; text between entries may be skipped with "...", every piece being verbatim): that is a value the circular gives, never "Not stated".
4. THE QUESTION: each part of the question is answered, or is answerable from the circulars and not answered (in_circular), or is not in the circulars at all (not_in_circular). Only these two kinds are listed. A part is written in the question's OWN words; never add a part the question did not ask. A question that asks for lists of things (holidays, schemes, officers, dates) is not answered by counts of them: the items with their dates or figures are what is asked. When the briefing gives only totals while the circulars list the items, report it under "unanswered" as in_circular, the fact naming the items and their dates in the circulars' words, the quote the list's entries (skipped text marked "...", every piece verbatim).
5. DEFINITIONS AND EXCEPTIONS: when the briefing uses a category the circular defines by listing its members (a type of city, a category of employee), the briefing must name those members; and when the circular states a different limit, cap or rule for another case of the same subject (another cause, another group), the briefing must say it in one sentence: both answer the question as much as the main rule does. Go through the circulars clause by clause: every clause that states a period, amount, limit, condition or approval for the subject of the question is carried by the briefing or listed. What is missing goes under "unanswered" as in_circular, the fact naming the members or the other case, the quote the circular's words (skipped text marked "...", every piece verbatim).
6. SHORT FORMS: only for a short form the briefing uses that has more than one usual meaning (for example "TA": Township Administration, or Travelling Allowance beside "rules" or "eligibility"): say which meaning the circulars' own use shows, with the circular's words as the quote. A short form with one usual meaning is not listed, and the meaning is never a phrase copied from the circular.

RANGES: a sentence that gives ONE value (an authority, a rate, a period, a figure) for a range of rows, periods or years is tested against EACH column of the briefing's table: where one column differs inside that range, the sentence is contradicted, and the fix names each column's value in the circular's words. A condition ("exceptional circumstances", "provided that", "subject to", "only if") that the circular or the briefing's table gives to some rows or periods only is contradicted when a sentence says it of the whole range or of its largest value: the fix says which part it belongs to.

LEFT OUT BY THE RULE: a cell that says "Not stated" for a category the circular's own rule leaves out (the circular says festival holidays are admissible to Category A and Category B; the cell for Category C and D says "Not stated") is wrong: the circular does state it, by naming only the others. The fix says it in the circular's words ("Admissible to Category A and Category B only"), with the quote of that rule.

QUALIFIERS: a footnote, note or exception of the circular qualifies the item it is attached to and no other. A sentence or cell that moves it to a neighbouring item ("18 months salary (excluding normal salary)" where the circular excludes normal salary from the EXPENDITURE, not from the months of salary) is contradicted: the fix attaches it where the circular does, in its words, with the quote.

SPELLING: a misspelt word in the briefing's own sentences ("thereafer" for "thereafter") goes under "spelling", one word each. A name or word printed in the circular is never listed, whatever its spelling.

Then, separately, take every sentence that uses a universal word ("all", "every", "each", "across", "both", "unchanged", "same", "no change", "remains", "increased / decreased / applies across") and test it against EVERY row of the briefing's own table(s) that the sentence covers: one row that differs makes the sentence contradicted, and the fix names the exception in the circular's words. Likewise a sentence that merges two alternatives of the table into one range ("5-10 years in Level 11 or 10" for "5 years in Level 11, or 10 years in Level 10") is contradicted by the table.

WHAT CHANGED: when the question asks how something changed or differed between years or editions, the briefing must say what DIFFERS in the circulars themselves, not only what stayed equal: an item (a holiday, a rate, a name, a date, a condition) present in one year's circular and absent, renamed or moved in another's. "Unchanged", "the same" or "remained" in the headline, the overview or a finding is tested against the circulars' own lists and dates, not only against the briefing's table: if the circulars' lists differ, the sentence is contradicted and the fix keeps what is truly equal (the totals) and names what differs, in the circulars' own words; when a part of the answer is missing (the items that differ), list it under "unanswered" as in_circular, with the fact NAMING the items that differ and the year each belongs to, as the circulars print the names (never only "the lists changed"), and the quote the circulars' entries for them (skipped text marked "...", every piece verbatim). Before you accept any sentence that says a rule or figure differs between years, find the circulars' words for EACH year on that point: if they give the same figure and rule, there is no change. A difference that exists only in wording is NOT a difference: the same figure said in other words, or one group named by one word in a circular and by its parts in another (a term the circular itself explains by listing its parts), must never be told as a change between the years; a sentence that does so is contradicted, and the fix states the figure once.

A cell that holds only "-" means the circular has no separate entry for that row in that column (the row's words stand in one cell): it is not a fault, and a cell is never to repeat the words of another cell of the same row.

NOT A FAULT (never list these): a rupee sign or a number format ("₹1,000" for "1000"); a plural, a short form written in full ("Executives" for "Exe") or in short; bold marks; a paraphrase that keeps the fact; a sentence that only introduces or summarises ("The circular outlines the schemes, detailing ...") and states no fact the circulars lack; a count that equals the number of rows of the briefing's own table ("Twelve schemes are compared" over a table of twelve). Only a difference of FACT is reported.

Rules: a "quote" is ALWAYS copied verbatim from the circular text, 3 to 60 words, never paraphrased and never from the briefing. A supported sentence is not listed. A right cell is not listed. When nothing is wrong, every array is empty. Figures in a "fix" or a "value" must appear in the circular text. Output JSON only.`;

/** The short forms with more than one confirmed sense (abbreviationSenses.ts) that the briefing uses, written as a short form (capitals, word on its own). */
export function ambiguousShortForms(r: SynthesisResult): string[] {
  const text = [r.overview, ...(r.keyFindings ?? []).map((f) => f.text), ...[r.table, r.extraTable].flatMap((t) => (t ? [t.title ?? "", ...t.columns, ...t.rows.flat()] : []))].join(" \n ");
  return Object.keys(KNOWN_SENSES).filter((abbr) => new RegExp(`(?:^|[^\\p{L}])${abbr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}])`, "u").test(text));
}

/**
 * CLAUSES THE BRIEFING DOES NOT USE. A reader of a long circular misses a clause that bears on the question (a shorter limit for another case, a condition, an exception): the
 * circular is long and the clause is one sentence. Plain code narrows the haystack: the clauses (sentences) of the circulars that share at least two content words with the
 * question and carry a figure the briefing never uses, the likeliest first. Code does not judge whether a clause belongs to the answer; it only points, and the verifier decides.
 */
/** a code a reader acts on: letters with digits mixed (an IFSC code, a policy number) or a long run of digits (an account number); a telephone number is not one */
const CODE_LIKE = (t: string): boolean => {
  if (/^\d{9,18}$/.test(t)) return !/^[6-9]\d{9}$/.test(t) && !/^0\d{9,11}$/.test(t); // not a mobile or a landline
  return t.length >= 6 && /[A-Za-z]/.test(t) && /\d{3,}/.test(t) && !/^\d+(?:st|nd|rd|th)$/i.test(t);
};

const LIMIT_PHRASE = /\b(?:pro[- ]?rata|only once|once in (?:a |his\/her |their )?career|not exceed\w*|not more than|no more than|shall not be (?:allowed|entertained)|not be allowed)\b/i;

export function unusedClauses(q: string, r: SynthesisResult, contextData: string, max = 6): string[] {
  const qStems = stemsOf(q);
  if (qStems.size === 0) return [];
  const briefingText = [r.headline ?? "", r.overview, ...(r.keyFindings ?? []).map((f) => f.text), ...[r.table, r.extraTable].flatMap((t) => (t ? [t.title ?? "", ...t.columns, ...t.rows.flat()] : []))].join(" ");
  const used = new Set(flatText(briefingText).split(" "));
  const droppedCode = (c: string): boolean => {
    const codes = (c.match(/[A-Za-z0-9]{6,}/g) || []).filter(CODE_LIKE);
    return codes.some((t) => used.has(t.toLowerCase())) && codes.some((t) => !used.has(t.toLowerCase()));
  };
  const clauses = contextData
    .replace(/\[Circular id=[^\]]*\]/g, "\n") // the record header of each circular ends a clause
    .replace(/\d+ \| P a g e|\[handwritten:[^\]]*\]|\[logo\]/gi, " ") // page footers, signatures and logos are not clauses
    .split(/\n+|(?<=[.;])\s+(?=[A-Z*"'(“‘])|\s(?=\d{1,2}\.\d{1,2}\s+[A-Z‘“"'(])/)
    .map((c) => c.replace(/\s+/g, " ").trim())
    .filter((c) => {
      const w = c.split(" ").length;
      // not a table row (a row is the table's business: the briefing's own table and the missing-row check carry it), not a letterhead, a date stamp or a form
      // a table row is the table's business, EXCEPT a record in which the briefing carries one code but drops another (the account number kept, its IFSC code dropped)
      if (c.includes(" | ") && !droppedCode(c)) return false;
      return w >= 8 && w <= (c.includes(" | ") ? 170 : 100) && !/GMT[+-]\d|handwritten|\bP a g e\b|\b(?:date of (?:issue|effect)|reference no|page \d|circular id=|annexure|proforma|signature|distribution|tick)\b/i.test(c) && !/\b\d{1,2}[./]\d{1,2}[./]\d{2,4}\b/.test(c);
    });
  const seen = new Set<string>();
  const out: Array<{ c: string; shared: number }> = [];
  for (const c of clauses) {
    const key = flatText(c);
    if (seen.has(key)) continue;
    seen.add(key);
    const shared = [...stemsOf(c)].filter((st) => qStems.has(st)).length;
    const dropped = c.includes(" | ") && droppedCode(c);
    if (shared < 2 && !dropped) continue;
    if (dropped) { out.push({ c, shared: 99 }); continue; } // a record that lost a code is always worth the verifier's look
    const figures = flatText(c.replace(/^\d{1,2}(?:\.\d{1,2})*\.?\s+/, "")).match(/\b\d+(?:\.\d+)?\b/g) || []; // the clause's own number is not a figure of its content
    // a clause with no figure can still LIMIT the answer ("only once in career", "on pro-rata basis", "shall not exceed"): it counts when its limiting phrase is not in the briefing
    const limit = c.match(LIMIT_PHRASE);
    const limitUnused = !!limit && !flatText(briefingText).includes(flatText(limit[0]));
    if (!figures.some((n) => !used.has(n)) && !limitUnused) continue;
    out.push({ c, shared });
  }
  return out.sort((a, b) => b.shared - a.shared || a.c.length - b.c.length).slice(0, max).map((x) => (x.c.length > 520 ? x.c.slice(0, 520) + " ..." : x.c));
}

/**
 * TIMES UNDER THE WRONG NAME. A time is a fact only with its event ("Arrival and address of the Chief Guest 07:45", "Flag-off 08:00"): a briefing that puts the time under another
 * name ("Assembly: 7:45 AM") misleads a reader who acts on it. Plain code compares: for each clock time of the briefing, the words written just before it are looked for beside the
 * same time in the circulars; when none of them stands there, the circulars' own words beside that time are given to the verifier, who decides. Code only points.
 */
const CLOCK = /(?<!\d[\s:.])\b(\d{1,2})(?:[:.](\d{2}))?\s?(AM|PM|a\.m\.|p\.m\.)(?![A-Za-z])/gi;
const minuteOfDay = (h: string, m: string | undefined, ap: string): number => ((Number(h) % 12) + (/^p/i.test(ap) ? 12 : 0)) * 60 + Number(m ?? 0);
const TIME_WORDS = /^(?:time|timi|from|onwa|star|begi|comm|date|till|unti|dead|last|held|open|clos|that|this|with|will|when|endi|befo|afte|arou|abou|appr|fixe|sche|plan|sett|repo)/; // stems are four letters (stemsOf)
export function mislabelledTimes(r: SynthesisResult, contextData: string, max = 4): string[] {
  const src = contextData.replace(/\s+/g, " ");
  const around = new Map<number, string[]>(); // minute of day -> the circulars' words beside each occurrence
  for (const m of src.matchAll(CLOCK)) {
    const at = m.index ?? 0;
    const k = minuteOfDay(m[1], m[2], m[3]);
    around.set(k, [...(around.get(k) ?? []), src.slice(Math.max(0, at - 70), at + 12)]);
  }
  if (around.size === 0) return [];
  const units: Array<{ text: string; row: string }> = [{ text: r.overview, row: "" }, ...(r.keyFindings ?? []).map((f) => ({ text: f.text, row: "" }))];
  for (const t of [r.table, r.extraTable]) if (t) for (const row of t.rows) row.forEach((cell, ci) => units.push({ text: cell, row: ci === 0 ? "" : row[0] }));
  const out: string[] = [];
  const seen = new Set<string>();
  const nameOf = (before: string) => before.replace(/[*_]+/g, "").split(/[;.,]|\d{1,2}[:.]\d{2}\s?(?:AM|PM)/i).pop()!.trim().split(/\s+/).slice(-3).join(" ");
  for (const unit of units) {
    const text = (unit.text || "").replace(/\s+/g, " ");
    for (const m of text.matchAll(CLOCK)) {
      const k = minuteOfDay(m[1], m[2], m[3]);
      const beside = around.get(k);
      if (!beside) continue; // a time the circulars do not print is the figure guard's business
      let name = nameOf(text.slice(0, m.index ?? 0));
      let label = [...stemsOf(name)].filter((st) => !TIME_WORDS.test(st));
      if (label.length === 0 && unit.row) { name = unit.row.split(/\s+/).slice(-3).join(" "); label = [...stemsOf(name)].filter((st) => !TIME_WORDS.test(st)); }
      if (label.length === 0) continue;
      if (beside.some((w) => { const ws = stemsOf(w); return label.some((st) => ws.has(st)); })) continue;
      const line = `the briefing writes "${name} ${m[0]}"; the circulars print ${m[0]} beside: "${beside[0].replace(/^\S*\s/, "").trim()}"`;
      if (!seen.has(line)) { seen.add(line); out.push(line); }
    }
  }
  return out.slice(0, max);
}

/**
 * A LIST NAMED BUT NOT GIVEN. A circular holds a short list of dated entries (the five closed holidays: SAIL Foundation Day 24th January ...) under a heading whose words are the
 * question's ("closed and public holidays"); the briefing says "5 closed holidays" or names them, and gives no date. A question that names the list asks for its entries. Plain code
 * finds each short numbered list (3 to 20 entries) whose heading shares two words with the question and whose dated entries are, for the most part, dated nowhere in the briefing,
 * and hands the entries over; the verifier decides and, when the list belongs to the answer, gives it under "unanswered" with the circular's own words.
 */
const MONTHS = "january|february|march|april|may|june|july|august|september|october|november|december";
const datesOfText = (t: string): string[] => [...flatText(t).matchAll(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)? (${MONTHS})\\b`, "g"))].map((m) => `${Number(m[1])} ${m[2]}`);
export function uncoveredLists(q: string, r: SynthesisResult, contextData: string, max = 2): string[] {
  const qStems = stemsOf(q);
  const flat = contextData.replace(/\[(?:handwritten|logo)[^\]]*\]/gi, " ").replace(/\s+/g, " ");
  const marks = [...flat.matchAll(/\b(?:sl\.?\s*(?:no\.?)?\s*:?|column\s*1\s*:)\s*(\d+)\.?\s*\|/gi)].map((m) => ({ at: m.index!, end: m.index! + m[0].length, n: Number(m[1]) }));
  const briefingText = [r.headline ?? "", r.overview, ...(r.keyFindings ?? []).map((f) => f.text), ...[r.table, r.extraTable].flatMap((t) => (t ? t.rows.flat() : []))].join(" ");
  const shown = new Set(datesOfText(briefingText));
  const lists: Array<typeof marks> = [];
  for (const m of marks) {
    const cur = lists[lists.length - 1];
    if (cur && m.n === cur[cur.length - 1].n + 1) cur.push(m);
    else lists.push([m]);
  }
  const out: string[] = [];
  for (const list of lists) {
    if (list.length < 3 || list.length > 20 || list[0].n > 1) continue;
    const heading = flat.slice(Math.max(0, list[0].at - 420), list[0].at);
    const headTail = heading.split(/\d\.\s+(?=[A-Z])/).pop()!.trim(); // the heading is the text after the last clause number ("1. CLOSED/ PUBLIC HOLIDAYS: Following ...")
    if ([...stemsOf(headTail.slice(0, 120))].filter((st) => qStems.has(st)).length < 2) continue;
    const entries = list.map((m, i) => {
      const next = list[i + 1]?.at ?? Math.min(flat.length, m.end + 170);
      const parts = readable(flat.slice(m.end, Math.min(next, m.end + 170)).replace(/\s+/g, " ").trim()).split(" · ").slice(0, 5);
      // the last entry of a list runs on into the prose that follows it: its last field is cut to a few words
      if (!list[i + 1]) parts[parts.length - 1] = parts[parts.length - 1].split(/\s\d{1,2}\.\s+[A-Z]/)[0].split(" ").slice(0, 4).join(" ");
      return parts.join(" · ");
    });
    const dated = entries.filter((e) => datesOfText(e).length > 0);
    if (dated.length < 3) continue;
    const missing = dated.filter((e) => datesOfText(e).some((d) => !shown.has(d)));
    if (missing.length * 2 < dated.length) continue;
    out.push(`under "${headTail.slice(0, 70).trim()}" the circular lists ${dated.length} dated entries and the briefing gives the date of ${dated.length - missing.length} of them: ${entries.join("; ")}`);
  }
  return out.slice(0, max);
}

/** The user prompt of the verifier: the question, the briefing to check, the ambiguous short forms it must rule on, and the same circular records the writer saw. */
export function verifierInput(q: string, r: SynthesisResult, contextData: string): string {
  const tableOf = (t: SynthesisTable | null | undefined) => (t ? { title: t.title ?? "", columns: t.columns, rows: t.rows } : null);
  const briefing = {
    headline: r.headline ?? "",
    overview: r.overview,
    findings: (r.keyFindings ?? []).map((f, i) => ({ n: i + 1, text: f.text })),
    table: tableOf(r.table),
    table2: tableOf(r.extraTable),
  };
  const askedYears = [...new Set(q.match(/\b(?:19|20)\d{2}\b/g) || [])];
  const headers = [r.table, r.extraTable].flatMap((t) => (t ? t.columns.slice(1) : [])).join(" ");
  const missingYears = r.table && askedYears.length >= 2 ? askedYears.filter((y) => !headers.includes(y)) : [];
  const askColumns = missingYears.length
    ? `\n\nThe question names the years ${askedYears.join(", ")}; the table has no column for ${missingYears.join(", ")}. In "missingColumns" give, for each of these years, every row's value for that year, each with its own verbatim quote from that year's circular; "Not stated in circular" with an empty quote where that circular does not give it.`
    : "";
  const amb = ambiguousShortForms(r);
  const ask = amb.length
    ? `\n\nShort forms in the briefing that have more than one meaning. For EACH, say in "abbreviations" which meaning the circulars' own use of it shows, with the quote:\n${amb.map((a) => `- ${a}: ${KNOWN_SENSES[a].map((m) => `"${m}"`).join(" or ")}`).join("\n")}`
    : "";
  const unused = unusedClauses(q, r, contextData);
  const askClauses = unused.length
    ? `\n\nClauses of the circulars that share words with the question and carry a figure the briefing does not use. Judge each one: when it belongs to what the question asks (a shorter limit or a different rule for another case, a condition, an exception), give it under "unanswered" as in_circular, the fact in the circular's words and the quote copied from it; when it does not belong, leave it out:\n${unused.map((c) => `- ${c}`).join("\n")}`
    : "";
  const lists = uncoveredLists(q, r, contextData);
  const askLists = lists.length
    ? `\n\nShort lists of the circulars named by the question whose dates the briefing does not give. Judge each one: when the question asks for these items (a list of holidays, schemes, officers is asked for by its entries), give them under "unanswered" as in_circular, the fact naming each item with its date as the circular prints it, the quote the entries (text between entries skipped with "...", every piece verbatim); when they do not belong to what is asked, leave them out:\n${lists.map((c) => `- ${c}`).join("\n")}`
    : "";
  const times = mislabelledTimes(r, contextData);
  const askTimes = times.length
    ? `\n\nTimes of the briefing whose name does not stand beside the same time in the circulars. Judge each one: when the briefing gives the time to the wrong event, correct the cell or sentence with the circulars' own name for that time (under "cells" or "sentences", with the quote); when the briefing's name is the circular's meaning in other words, leave it:\n${times.map((c) => `- ${c}`).join("\n")}`
    : "";
  return `Question: "${q}"\n\nBriefing to check (JSON):\n${JSON.stringify(briefing)}${askColumns}${ask}${askClauses}${askLists}${askTimes}\n\nOfficial Circular Records:\n${contextData}\n\nJSON report:`;
}

const asArray = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const str = (v: unknown): string => (v == null ? "" : String(v)).trim();
const whichTable = (v: unknown): "table" | "table2" | undefined => (str(v).toLowerCase() === "table2" ? "table2" : str(v).toLowerCase() === "table" ? "table" : undefined);
/** "STEEL AUTHORITY OF INDIA LIMITED" (a letterhead) -> "Steel Authority of India Limited"; a meaning not written in capitals is left as it is */
const titleCase = (s: string): string =>
  /^[^a-z]*$/.test(s) && /[A-Z]{2}/.test(s) ? s.toLowerCase().replace(/(^|[\s(/-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()).replace(/\b(Of|And|The|For|In)\b/g, (w) => w.toLowerCase()) : s;

/** A value the verifier built from pieces of a list ("Republic Day ... May Day") reads as a list: the skipped-text marks become commas. (A quote keeps its marks: they are how it is checked.) */
const asList = (v: string): string => v.replace(/\s*(?:\.{3,}|\u2026)\s*/g, ", ").replace(/^[,\s]+|[,\s]+$/g, "");

/** The verifier's JSON, read defensively: a field that is not of the expected shape is an empty list, never a crash. Null when there is no JSON at all. */
export function parseVerdict(raw: string): Verdict | null {
  if (!raw) return null;
  const cleaned = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
  const m = cleaned.match(/\{[\s\S]*\}/);
  if (!m) return null;
  let p: any;
  try {
    p = JSON.parse(m[0]);
  } catch {
    return null;
  }
  if (!p || typeof p !== "object") return null;
  return {
    sentences: asArray<any>(p.sentences)
      .map((s) => ({ where: str(s?.where) || undefined, sentence: str(s?.sentence), verdict: str(s?.verdict).toLowerCase() === "contradicted" ? "contradicted" : "unsupported", fix: str(s?.fix), quote: str(s?.quote) } as VerifySentence))
      .filter((s) => s.sentence),
    cells: asArray<any>(p.cells).map((c) => ({ table: whichTable(c?.table), row: str(c?.row), column: str(c?.column), value: asList(str(c?.value)), quote: str(c?.quote) })).filter((c) => c.row && c.column),
    missingRows: asArray<any>(p.missingRows).map((r) => ({ table: whichTable(r?.table), label: str(r?.label), cells: asArray<unknown>(r?.cells).map((x) => asList(str(x))), quote: str(r?.quote) })).filter((r) => r.label),
    missingColumns: asArray<any>(p.missingColumns)
      .map((c) => ({ table: whichTable(c?.table), column: str(c?.column), cells: asArray<any>(c?.cells).map((x) => ({ row: str(x?.row), value: asList(str(x?.value)), quote: str(x?.quote) })).filter((x) => x.row) }))
      .filter((c) => c.column && c.cells.length),
    unanswered: asArray<any>(p.unanswered)
      .map((u) => ({ part: str(u?.part), status: str(u?.status).toLowerCase() === "in_circular" ? "in_circular" : "not_in_circular", fact: str(u?.fact), quote: str(u?.quote) } as VerifyPart))
      .filter((u) => u.part),
    abbreviations: asArray<any>(p.abbreviations).map((a) => ({ abbr: str(a?.abbr), meaning: str(a?.meaning), quote: str(a?.quote) })).filter((a) => a.abbr && a.meaning),
    spelling: asArray<any>(p.spelling).map((x) => ({ wrong: str(x?.wrong), right: str(x?.right) })).filter((x) => x.wrong && x.right),
  };
}

/** letters and digits only, one space between, thousands commas removed: "Rs. 1,000/-" and "rs 1000" compare equal */
export const flatText = (s: string): string =>
  (s || "")
    .toLowerCase()
    .replace(/(\d),(?=\d{3}\b)/g, "$1")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

/**
 * The pieces of a quote. A quote may skip text with "..." ("SL. NO: 1 | HOLIDAY: Republic Day ... SL. NO: 4 | HOLIDAY: Mahatma Gandhi's Birthday"): then each piece
 * is a quote of its own. A piece shorter than two words proves nothing, and a quote of more than eight pieces is not a quote.
 */
export function quotePieces(quote: string): string[] {
  const pieces = (quote || "").split(/\s*(?:\.{3,}|\u2026)\s*/).map(flatText).filter(Boolean);
  return pieces.length >= 1 && pieces.length <= 8 && pieces.every((p) => p.split(" ").length >= 2) ? pieces : [];
}

/** True when the quote (every piece of it) is found verbatim, after flattening, in the source. A quote under 4 characters proves nothing. */
export function quoteInSource(quote: string, flatSource: string): boolean {
  const pieces = quotePieces(quote);
  return pieces.length > 0 && pieces.join(" ").length >= 4 && pieces.every((p) => flatSource.includes(p));
}

/** share of the text's content words (stems) that the source also has: 1 when every word is the circular's */
function wordingSupport(text: string, srcStems: Set<string>): number {
  const st = stemsOf(text);
  if (st.size === 0) return 1;
  let n = 0;
  for (const s of st) if (srcStems.has(s)) n++;
  return n / st.size;
}

const SENTENCE_SPLIT = /(?<=[.!?])\s+(?=[A-Z*"'(“])/;

const wordsOf = (s: string): Set<string> => new Set(flatText(s).split(" ").filter(Boolean));

/** how alike two sentences are, as the share of their words they have in common (1 = the same words) */
function alike(a: string, b: string): number {
  const wa = wordsOf(a), wb = wordsOf(b);
  if (wa.size === 0 || wb.size === 0) return 0;
  let both = 0;
  for (const w of wa) if (wb.has(w)) both++;
  return both / (wa.size + wb.size - both);
}

/** index of the sentence of `text` that the verifier quoted (the same words, or nearly: a word the guards took out does not lose it), or -1 */
function findSentence(sentences: string[], wanted: string): number {
  const w = flatText(wanted);
  if (!w) return -1;
  let best = -1, bestScore = 0;
  for (let i = 0; i < sentences.length; i++) {
    const s = flatText(sentences[i]);
    if (!s) continue;
    if (s === w) return i;
    const sc = alike(s, w);
    if (sc > bestScore) { bestScore = sc; best = i; }
  }
  return bestScore >= 0.75 ? best : -1;
}

export interface RepairContext {
  /** every circular the briefing was written from, with its text: a quote names its circular */
  sources: Array<{ id: number; text: string }>;
  /** true when every figure in the text is in the circulars (the writer's own figure guard) */
  figuresSafe: (text: string) => boolean;
  /** the question asked: a part the verifier reports as unanswered must be made of the question's own words (optional: without it the check is not made) */
  question?: string;
}

export interface RepairOutcome {
  result: SynthesisResult;
  /** one line per change made, for the log and the stored record */
  changes: string[];
  /** reports the code could not act on (a quote not found, a fix with a figure the circulars lack): the briefing is left as it was there */
  ignored: number;
  /** one line per report left alone, saying which and why (for the log) */
  ignoredWhy: string[];
  /** sentences removed as unsupported */
  removed: number;
}

const MAX_FINDINGS = 6;
/** a fact the circulars state and the briefing omits is worth a place even when the writer used all six: two more, each one checked sentence */
const MAX_WITH_OMITTED = MAX_FINDINGS + 2;
const MAX_ROWS_ADDED = 8;
const MIN_WORDING = 0.7;

/** Applies what the verifier reported, to the extent plain code can check it. Never changes the input objects. */
export function applyVerdict(input: SynthesisResult, v: Verdict, ctx: RepairContext): RepairOutcome {
  const flatSrc = flatText(ctx.sources.map((s) => s.text).join("\n"));
  const srcStems = stemsOf(ctx.sources.map((s) => s.text).join("\n"));
  const changes: string[] = [];
  const ignoredWhy: string[] = [];
  let ignored = 0;
  let removed = 0;
  const skip = (why: string) => { ignored++; ignoredWhy.push(why); };
  const result: SynthesisResult = {
    ...input,
    keyFindings: (input.keyFindings ?? []).map((f) => ({ ...f, sources: [...f.sources] })),
    table: input.table ? { ...input.table, columns: [...input.table.columns], rows: input.table.rows.map((r) => [...r]) } : input.table,
    extraTable: input.extraTable ? { ...input.extraTable, columns: [...input.extraTable.columns], rows: input.extraTable.rows.map((r) => [...r]) } : input.extraTable,
    abbreviations: { ...(input.abbreviations ?? {}) },
  };
  // a quote with skipped text may take its pieces from several circulars (the lists of two years): each circular holding a piece is cited
  const circularOf = (quote: string): number[] =>
    quoteInSource(quote, flatSrc) ? ctx.sources.filter((s) => { const f = flatText(s.text); return quotePieces(quote).some((p) => f.includes(p)); }).map((s) => s.id) : [];
  /**
   * A corrected text the code accepts: its figures are in the circulars, its quote (if any) is found there verbatim, and the words it ADDS to what
   * was written before are the circulars' words (what it keeps of the writer's own sentence was already scored once).
   */
  const acceptable = (text: string, quote: string, before = ""): boolean => {
    if (!text) return false;
    if (!ctx.figuresSafe(text)) return false;
    if (quote && !quoteInSource(quote, flatSrc)) return false;
    const was = stemsOf(before);
    const added = [...stemsOf(text)].filter((st) => !was.has(st));
    if (added.length === 0) return true;
    return added.filter((st) => srcStems.has(st)).length / added.length >= MIN_WORDING;
  };

  /** the same numbers and no word the original lacks: a change of format or wording only ("₹1,000" -> "1000", "Executives" -> "Exe"), not of fact */
  const numbersOf = (t: string) => (flatText(t).match(/\d+(?:\.\d+)?/g) || []).map(Number).sort((a, b) => a - b).join(",");
  // a fix that takes out a scope word ("unchanged", "all", "only") removes a CLAIM: that is a change of fact, not of format
  const SCOPE_WORDS = /\b(?:unchanged|same|identical|all|every|entire|entirely|completely|only|always|never|no|not|none|remain\w*|across)\b/i;
  const cosmetic = (before: string, after: string): boolean => {
    if (numbersOf(before) !== numbersOf(after)) return false;
    const was = stemsOf(before);
    if (![...stemsOf(after)].every((st) => was.has(st))) return false;
    const kept = flatText(after).split(" ");
    const dropped = flatText(before).split(" ").filter((w) => SCOPE_WORDS.test(w) && !kept.includes(w));
    return dropped.length === 0;
  };

  // ---- 1. sentences of the overview and the findings ----
  const editText = (text: string, s: VerifySentence, label: string): { text: string; done: boolean } => {
    const parts = text.split(SENTENCE_SPLIT);
    const at = findSentence(parts, s.sentence);
    if (at < 0) return { text, done: false };
    const fix = (s.fix || "").trim();
    if (fix && cosmetic(parts[at], fix)) { changes.push(`${label}: a fix that changes no fact was not taken ("${fix.slice(0, 60)}")`); return { text, done: true }; }
    if (fix && flatText(fix) !== flatText(parts[at]) && acceptable(fix, s.quote || "", parts[at])) {
      changes.push(`${label}: "${parts[at].slice(0, 70)}" -> "${fix.slice(0, 70)}"`);
      parts[at] = fix;
    } else {
      if (fix) skip(`${label}: the fix "${fix.slice(0, 60)}" could not be checked; the sentence was removed instead`); // the sentence goes rather than stand unsupported
      changes.push(`${label}: removed "${parts[at].slice(0, 90)}" (${s.verdict})`);
      removed++;
      parts.splice(at, 1);
    }
    return { text: parts.join(" ").replace(/\s{2,}/g, " ").trim(), done: true };
  };
  for (const s of v.sentences) {
    const where = (s.where || "").toLowerCase();
    if (where.startsWith("headline")) {
      // the title is never removed: a fix is taken only when it is checkable, else the title stays
      const fix = (s.fix || "").trim();
      if (result.headline && fix && fix.split(/\s+/).length <= 14 && flatText(fix) !== flatText(result.headline) && !cosmetic(result.headline, fix) && acceptable(fix, s.quote || "", result.headline)) {
        changes.push(`headline: "${result.headline.slice(0, 70)}" -> "${fix.slice(0, 70)}"`);
        result.headline = fix;
      } else skip(`headline: no checkable fix for "${(result.headline || s.sentence).slice(0, 60)}"`);
      continue;
    }
    const fi = /finding\s*(\d+)/.exec(where);
    let done = false;
    if (fi) {
      const i = Number(fi[1]) - 1;
      if (result.keyFindings[i]) {
        const r = editText(result.keyFindings[i].text, s, `finding ${i + 1}`);
        if (r.done) { result.keyFindings[i] = { ...result.keyFindings[i], text: r.text }; done = true; }
      }
    }
    if (!done && (!fi || !where)) {
      const r = editText(result.overview, s, "overview");
      if (r.done) { result.overview = r.text; done = true; }
    }
    if (!done) {
      // the place was not given or was wrong: look everywhere once
      for (let i = 0; i < result.keyFindings.length && !done; i++) {
        const r = editText(result.keyFindings[i].text, s, `finding ${i + 1}`);
        if (r.done) { result.keyFindings[i] = { ...result.keyFindings[i], text: r.text }; done = true; }
      }
      if (!done && fi) {
        const r = editText(result.overview, s, "overview");
        if (r.done) { result.overview = r.text; done = true; }
      }
    }
    if (!done) skip(`sentence not found in the briefing: "${s.sentence.slice(0, 70)}"`);
  }
  result.keyFindings = result.keyFindings.filter((f) => f.text.trim().length > 0);

  // ---- 1b. misspelt words of the briefing's own sentences ----
  // Taken only when it is plainly a typing slip: one word of seven letters or more, which the circulars do not print, and the correction is ONE letter away
  // (one added, dropped, changed, or two side by side swapped). A word two letters away may be another word altogether ("increased" / "decreased").
  const oneLetterAway = (a: string, b: string): boolean => {
    if (a === b) return false;
    if (Math.abs(a.length - b.length) > 1) return false;
    let i = 0;
    while (i < a.length && i < b.length && a[i] === b[i]) i++;
    if (a.length === b.length) {
      if (a.slice(i + 1) === b.slice(i + 1)) return true; // one letter changed
      return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2); // two side by side swapped
    }
    const [long, short] = a.length > b.length ? [a, b] : [b, a];
    return long.slice(i + 1) === short.slice(i); // one letter dropped or added
  };
  const printed = new Set(flatSrc.split(" "));
  for (const sp of v.spelling ?? []) {
    const wrong = sp.wrong.trim().toLowerCase(), right = sp.right.trim().toLowerCase();
    if (!/^\p{L}{7,}$/u.test(wrong) || !/^\p{L}+$/u.test(right) || printed.has(wrong) || !oneLetterAway(wrong, right)) { skip(`spelling "${sp.wrong.slice(0, 30)}" -> "${sp.right.slice(0, 30)}": not a plain one-letter slip, or the circular prints the word`); continue; }
    const re = new RegExp(`(?<![\\p{L}])${wrong}(?![\\p{L}])`, "giu");
    const fixWord = (t: string) => t.replace(re, (m) => (m[0] === m[0].toUpperCase() ? right[0].toUpperCase() + right.slice(1) : right));
    let hit = false;
    const touch = (t: string) => { const n = fixWord(t); if (n !== t) hit = true; return n; };
    result.overview = touch(result.overview);
    if (result.headline) result.headline = touch(result.headline);
    result.keyFindings = result.keyFindings.map((f) => ({ ...f, text: touch(f.text) }));
    if (hit) changes.push(`spelling: "${wrong}" -> "${right}"`);
    else skip(`spelling "${sp.wrong.slice(0, 30)}": not found in the briefing's sentences`);
  }

  // ---- 2. cells ----
  const tables = [result.table, result.extraTable].filter((t): t is SynthesisTable => !!t);
  const named = (which: "table" | "table2" | undefined): SynthesisTable[] => (which === "table2" && result.extraTable ? [result.extraTable] : which === "table" && result.table ? [result.table] : tables);
  for (const c of v.cells) {
    let done = false;
    for (const t of named(c.table)) {
      const ci = t.columns.findIndex((h, i) => i > 0 && flatText(h) === flatText(c.column));
      const ri = t.rows.findIndex((r) => flatText(r[0] ?? "") === flatText(c.row));
      if (ci < 0 || ri < 0) continue;
      const value = c.value.trim();
      if (!value || /^(?:not\s+(?:stated|applicable|specified)|n\/?a|nil|-)\b/i.test(value) || !c.quote || !acceptable(value, c.quote)) {
        skip(`cell "${c.row.slice(0, 40)}" / "${c.column.slice(0, 30)}" -> "${value.slice(0, 40)}": ${!value || !c.quote ? "no value or no quote" : /^not\s/i.test(value) ? "a cell is never blanked on the verifier's word" : "the quote or the words are not the circular's"}`);
        done = true;
        break;
      }
      if (flatText(t.rows[ri][ci] ?? "") === flatText(value)) { done = true; break; }
      // the same words in two cells of one row say nothing twice (a "-" cell is a deliberate blank, not a gap to fill)
      if (t.rows[ri].some((other, oi) => oi !== ci && flatText(other) === flatText(value) || (oi !== ci && oi > 0 && flatText(other).length > 20 && (flatText(other).includes(flatText(value)) || flatText(value).includes(flatText(other)))))) {
        skip(`cell "${c.row.slice(0, 40)}" / "${c.column.slice(0, 30)}": the value repeats another cell of the row`);
        done = true;
        break;
      }
      changes.push(`cell "${c.row.slice(0, 40)}" / "${c.column.slice(0, 30)}": "${(t.rows[ri][ci] ?? "").slice(0, 50)}" -> "${value.slice(0, 50)}"`);
      t.rows[ri][ci] = value;
      done = true;
      break;
    }
    if (!done) skip(`cell "${c.row.slice(0, 40)}" / "${c.column.slice(0, 30)}": no such row or column`);
  }

  // ---- 3. rows the table lacks ----
  let added = 0;
  for (const r of v.missingRows) {
    // the table the verifier names; with two tables and no name, the one whose column count fits, else the first
    const t0 = r.table ? named(r.table)[0] : tables.length > 1 ? tables.find((t) => t.columns.length === r.cells.length + 1) ?? tables[0] : tables[0];
    if (!t0 || added >= MAX_ROWS_ADDED) { skip(`row "${r.label.slice(0, 40)}": no table, or enough rows added`); continue; }
    const row = [r.label.trim(), ...r.cells.map((x) => x.trim())];
    const have = t0.rows.some((x) => flatText(x[0] ?? "") === flatText(row[0]));
    if (have) continue; // already there: nothing to report
    const okShape = row.length === t0.columns.length && row.every((x) => x.length > 0);
    if (!okShape || !r.quote || !quoteInSource(r.quote, flatSrc) || !row.every((x) => ctx.figuresSafe(x)) || wordingSupport(row.join(" "), srcStems) < MIN_WORDING) {
      skip(`row "${r.label.slice(0, 40)}": ${!okShape ? "wrong number of cells" : "the quote, a figure or the words are not the circular's"}`);
      continue;
    }
    t0.rows.push(row);
    added++;
    changes.push(`row added: "${row[0].slice(0, 60)}"`);
  }

  // ---- 3b. columns the table lacks (a year the question names): one value per row, each on its own quote. A value the code cannot prove is NOT written as
  // "Not stated in circular" (that claims an absence the code has not checked: the 2024 list of four public holidays never says "4 days"); it says so plainly. ----
  for (const mc of v.missingColumns) {
    const t = mc.table ? named(mc.table)[0] : tables[0];
    const header = mc.column.trim();
    if (!t || !header || t.columns.some((h) => flatText(h) === flatText(header))) { skip(`column "${header}": no table, or the column exists`); continue; }
    let proven = 0;
    const values = t.rows.map((row) => {
      const c = mc.cells.find((x) => flatText(x.row) === flatText(row[0] ?? ""));
      if (!c || !c.value || /^(?:not\s+(?:stated|applicable|specified)|n\/?a|nil|-)\b/i.test(c.value) || !c.quote || !acceptable(c.value, c.quote)) return "Not confirmed from the circular";
      proven++;
      return c.value.trim();
    });
    if (proven * 2 < t.rows.length) { skip(`column "${header}": only ${proven} of ${t.rows.length} values rest on a quote found in the circulars`); continue; }
    // the new column goes where its year belongs among year headings, else last
    const yearOf = (h: string) => Number((h.match(/\b(?:19|20)\d{2}\b/) || [])[0]) || 0;
    const y = yearOf(header);
    let at = t.columns.length;
    if (y && t.columns.slice(1).every((h) => yearOf(h) > 0)) {
      const later = t.columns.findIndex((h, i) => i > 0 && yearOf(h) > y);
      at = later > 0 ? later : t.columns.length; // before the first later year, else last
    }
    t.columns.splice(at, 0, header);
    t.rows.forEach((row, i) => row.splice(at, 0, values[i]));
    changes.push(`column added: "${header}" (${proven} of ${t.rows.length} values from the circulars${proven < t.rows.length ? ', the rest "Not confirmed from the circular"' : ""})`);
  }

  // ---- 4. parts of the question ----
  // words of five letters or more by their first five letters (the stemmer drops common words such as "employee" and "regarding", which is exactly what must be seen here)
  const PLAIN = new Set(["which", "whose", "those", "these", "their", "there", "about", "other", "would", "could", "should", "after", "under", "where", "while"]);
  const prefixes = (t: string): string[] => (t.toLowerCase().match(/\p{L}{5,}/gu) || []).map((w) => w.slice(0, 5)).filter((w) => !PLAIN.has(w));
  const qWords = ctx.question ? new Set(prefixes(ctx.question)) : null;
  const notAsked = (part: string): boolean => {
    if (!qWords) return false;
    const w = prefixes(part);
    const outside = w.filter((x) => !qWords.has(x)).length;
    return outside >= 2 && outside / Math.max(1, w.length) >= 0.3;
  };
  for (const u of v.unanswered) {
    // a part the question never asked (the verifier added words of its own: "regarding employee categorization") is not reported, either way
    if (notAsked(u.part)) { skip(`part "${u.part.slice(0, 60)}": not made of the question's own words`); continue; }
    if (u.status === "in_circular") {
      const fact = (u.fact || "").trim();
      const ids = u.quote ? circularOf(u.quote) : [];
      if (!fact || ids.length === 0 || !acceptable(fact, u.quote || "") || result.keyFindings.length >= MAX_WITH_OMITTED) { skip(`part "${u.part.slice(0, 50)}": ${!fact ? "no fact given" : ids.length === 0 ? "the quote is in no circular" : result.keyFindings.length >= MAX_WITH_OMITTED ? "no room for a finding" : "the words or figures are not the circular's"}`); continue; }
      if (result.keyFindings.some((f) => flatText(f.text) === flatText(fact))) continue;
      const finding: SynthesisFinding = { text: fact, sources: ids };
      result.keyFindings.push(finding);
      changes.push(`finding added for "${u.part.slice(0, 50)}": "${fact.slice(0, 70)}"`);
    } else {
      const part = u.part.replace(/[.\s]+$/, "");
      if (!part) continue;
      // already said: an overview sentence with a negation that shares two content words with the part
      const partStems = stemsOf(part);
      const already = result.overview.split(SENTENCE_SPLIT).some((sent) => /\b(?:none|no|not|absent|without)\b/i.test(sent) && [...stemsOf(sent)].filter((st) => partStems.has(st)).length >= 2);
      if (already) continue;
      const sentence = `None of the circulars provided covers this part of the question: "${part}".`;
      result.overview = `${result.overview.trim()} ${sentence}`.trim();
      changes.push(`overview: added "${sentence.slice(0, 90)}"`);
    }
  }

  // ---- 5. short forms ----
  const shown = [result.overview, ...result.keyFindings.map((f) => f.text), ...tables.flatMap((t) => [t.title ?? "", ...t.columns, ...t.rows.flat()])].join(" \n ");
  // The verifier's only say on short forms: which of the CONFIRMED senses of an ambiguous one (abbreviationSenses.ts: TA) the circular's context shows.
  // Anything else it offers is dropped: a meaning the circular spells out is found by code (abbreviations.ts: "Full Phrase (ABBR)"), the rest comes from the
  // curated list, and a "meaning" that is only words copied from near the short form (seen live: "IED = Implementing/ Executing Authority") is no meaning.
  for (const a of v.abbreviations) {
    const abbr = a.abbr.trim();
    const meaning = titleCase(a.meaning.trim());
    if (!/^[A-Z][A-Za-z&.]{1,8}$/.test(abbr) || !a.quote || !quoteInSource(a.quote, flatSrc)) { skip(`short form ${abbr}: no quote in the circular`); continue; }
    if (!new RegExp(`(?:^|[^\\p{L}])${abbr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}])`, "u").test(shown)) continue;
    if (!isKnownSense(abbr, meaning)) { skip(`short form ${abbr} = ${meaning}: not a confirmed sense of an ambiguous short form`); continue; }
    if (result.abbreviations![abbr] === meaning) continue;
    result.abbreviations![abbr] = meaning;
    changes.push(`short form ${abbr} = ${meaning}`);
  }
  if (Object.keys(result.abbreviations!).length === 0) delete result.abbreviations;

  // an overview emptied by the reading is replaced by a sentence built from the table, never by a copy of a finding
  if (!result.overview.trim()) {
    const t = result.table;
    result.overview = t?.title ? `The table below sets out the ${t.title.replace(/[.\s]+$/, "")}, in the circular's own words.` : t ? `The table below sets out the ${t.rows.length} rows the circulars give, in their own words.` : "The findings below say what the circulars say.";
    changes.push(`overview: nothing left after the reading; a sentence built from the table stands in`);
  }
  return { result, changes, ignored, ignoredWhy, removed };
}
