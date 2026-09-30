// src/lib/employees/namePredicate.ts
//
// Replaces the flat `mode: "surname"|"firstname"|"anyword"|"contains"|"auto"`
// + `excludePositions` scheme (29 Sep 2026) with a genuinely compositional
// representation: a small, FIXED set of primitive checks, combined via
// AND/OR/NOT. This is the actual fix to the "still patchwork" problem
// raised in chat -- a flat enum requires a new field/value every time a new
// LOGICAL COMBINATION shows up (which is unbounded), whereas composition
// via AND/OR/NOT is recursive and covers any combination of the EXISTING
// primitives for free. Only a genuinely new PRIMITIVE (a new kind of atomic
// check the backend can't already express) should ever require touching
// this file again -- combining existing primitives never should.

export type NamePredicate =
  // `exact: true` (29 Sep 2026) switches a leaf to LITERAL matching: the
  // whole word/phrase, case-insensitive, with NO phonetic or synonym
  // matching. Without it a leaf is phonetic-aware, so e.g. "nath" as the last
  // word also matches "debnath" (they are the same surname). exact is set by
  // markExactLeaves below, never by the LLM: a value the person put in double
  // quotes, or two values they explicitly contrasted, must stay separable.
  | { type: "wordEquals"; value: string; exact?: boolean } // whole word, anywhere in the name (phonetic-aware unless exact)
  | { type: "wordIsFirst"; value: string; exact?: boolean } // exact word, specifically the first token
  | { type: "wordIsLast"; value: string; exact?: boolean } // exact word, specifically the last token (surname position)
  | { type: "substring"; value: string; exact?: boolean } // plain substring anywhere, not a whole-word requirement
  | { type: "fuzzy"; value: string } // loosest: phonetic-only, no word-boundary or position meaning
  | { type: "and"; clauses: NamePredicate[] }
  | { type: "or"; clauses: NamePredicate[] }
  | { type: "not"; clause: NamePredicate };

function escapeForRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Regex fragment for a literal word/phrase: each word escaped, joined by
 *  \s+ so a multi-word quoted phrase tolerates irregular spacing. Used by BOTH
 *  the SQL compiler and the JS verifier, so exact matching is identical on
 *  each side by construction (same pattern, same case-insensitivity). */
function exactPhrasePattern(value: string): string {
  return value.trim().split(/\s+/).filter(Boolean).map(escapeForRegex).join("\\s+");
}

type ExactKind = "any" | "first" | "last";
function exactRegexSource(kind: ExactKind, value: string): string | null {
  const p = exactPhrasePattern(value);
  if (!p) return null;
  if (kind === "first") return `^\\s*${p}(\\s|$)`;
  if (kind === "last") return `(^|\\s)${p}\\s*$`;
  return `(^|\\s)${p}(\\s|$)`;
}

/** All the leaf string values referenced anywhere in a predicate tree. */
export function leafValues(pred: NamePredicate): string[] {
  switch (pred.type) {
    case "and":
    case "or":
      return pred.clauses.flatMap(leafValues);
    case "not":
      return leafValues(pred.clause);
    default:
      return [pred.value];
  }
}

/** True when every leaf in the tree references the same single value --
 *  the common case (a query is "about" one name), needed so the learned-
 *  pattern cache can safely substitute one {name} placeholder throughout
 *  the whole tree. Trees referencing more than one distinct value are
 *  deliberately NOT cached (see queryOrchestrator.ts) -- safer to re-run
 *  the LLM than risk substituting the wrong value into the wrong leaf. */
export function singleValue(pred: NamePredicate): string | null {
  const values = Array.from(new Set(leafValues(pred).map((v) => v.toLowerCase())));
  return values.length === 1 ? leafValues(pred)[0] : null;
}

/** Replace every leaf's value with `to`, preserving tree structure --
 *  used both to build a cacheable template (value -> "{name}") and to fill
 *  a matched template back in (the "{name}" placeholder -> a real value). */
export function substituteValue(pred: NamePredicate, to: string): NamePredicate {
  switch (pred.type) {
    case "and":
      return { type: "and", clauses: pred.clauses.map((c) => substituteValue(c, to)) };
    case "or":
      return { type: "or", clauses: pred.clauses.map((c) => substituteValue(c, to)) };
    case "not":
      return { type: "not", clause: substituteValue(pred.clause, to) };
    default:
      return { ...pred, value: to };
  }
}

/**
 * Compile a NamePredicate into a parameterized SQL boolean expression.
 * `params` is mutated (pushed to) as the source of truth for $N positions,
 * matching the calling convention already used throughout rosterQuery.ts.
 * Assumes the query has `er` (employee_roster) and `u` (public."user",
 * for name_phonetic) already in scope/joined.
 */
export function compileNamePredicate(pred: NamePredicate, params: any[]): string {
  switch (pred.type) {
    case "and": {
      if (!pred.clauses.length) return "TRUE";
      return `(${pred.clauses.map((c) => compileNamePredicate(c, params)).join(" AND ")})`;
    }
    case "or": {
      if (!pred.clauses.length) return "FALSE";
      return `(${pred.clauses.map((c) => compileNamePredicate(c, params)).join(" OR ")})`;
    }
    case "not": {
      return `(NOT ${compileNamePredicate(pred.clause, params)})`;
    }
    case "substring": {
      if (pred.exact) {
        params.push(pred.value);
        return `(position(lower($${params.length}) in lower(er.name)) > 0)`;
      }
      params.push(`%${pred.value}%`);
      const pLike = params.length;
      params.push(pred.value);
      const pPhon = params.length;
      return `(er.name ILIKE $${pLike} OR public.phonetic_subseq_match($${pPhon}, u.name_phonetic))`;
    }
    case "fuzzy": {
      params.push(pred.value);
      const pPhon = params.length;
      return `(u.name_phonetic IS NOT NULL AND public.phonetic_subseq_match($${pPhon}, u.name_phonetic))`;
    }
    case "wordEquals": {
      if (pred.exact) {
        const src = exactRegexSource("any", pred.value);
        if (!src) return "FALSE";
        params.push(src);
        return `(er.name ~* $${params.length})`;
      }
      params.push(escapeForRegex(pred.value));
      const pRegex = params.length;
      params.push(pred.value);
      const pPhonA = params.length;
      params.push(pred.value);
      const pPhonB = params.length;
      return `(er.name ~* ('\\y' || $${pRegex} || '\\y') OR public.indic_fold(public.name_synonym_normalize($${pPhonA}, true)) = ANY(u.name_phonetic) OR public.indic_fold(public.name_synonym_normalize($${pPhonB}, false)) = ANY(u.name_phonetic))`;
    }
    case "wordIsFirst":
    case "wordIsLast": {
      // Both use the same position-aware EXISTS shape (verified live in
      // chat, 29 Sep 2026) -- it composes correctly under NOT, unlike a
      // regex anchor, since "NOT EXISTS(word X at position 1)" is exactly
      // "X is not the first word", a clean, unambiguous negation.
      const isFirst = pred.type === "wordIsFirst";
      if (pred.exact) {
        const src = exactRegexSource(isFirst ? "first" : "last", pred.value);
        if (!src) return "FALSE";
        params.push(src);
        return `(er.name ~* $${params.length})`;
      }
      params.push(pred.value);
      const pWordLit = params.length;
      params.push(pred.value);
      const pWordPhonA = params.length;
      params.push(pred.value);
      const pWordPhonB = params.length;
      const posCheckLit = isFirst ? "tok.idx = 1" : "tok.idx = tok.total";
      const posCheckPhon = isFirst ? "tok.idx = 1" : "tok.idx = tok.total";
      return `(
        EXISTS (
          SELECT 1 FROM (
            SELECT word, idx, count(*) OVER () AS total
            FROM unnest(regexp_split_to_array(er.name, '\\s+')) WITH ORDINALITY AS t(word, idx)
          ) tok
          WHERE upper(tok.word) = upper($${pWordLit}) AND ${posCheckLit}
        )
        OR (
          u.name_phonetic IS NOT NULL AND EXISTS (
            SELECT 1 FROM (
              SELECT code, idx, count(*) OVER () AS total
              FROM unnest(u.name_phonetic) WITH ORDINALITY AS t(code, idx)
            ) tok
            WHERE tok.code IN (
              public.indic_fold(public.name_synonym_normalize($${pWordPhonA}, true)),
              public.indic_fold(public.name_synonym_normalize($${pWordPhonB}, false))
            )
            AND ${posCheckPhon}
          )
        )
      )`;
    }
  }
}

// ============================================================================
// INDEPENDENT VERIFICATION LAYER (added 29 Sep 2026, per explicit request):
// every result the SQL query returns is re-checked here, in plain
// deterministic code, against the SAME predicate tree -- before anything
// reaches the browser. This is NOT "ask the LLM to double check" (that
// isn't independent -- the same fallible model can rationalize the same
// mistake twice); it's a mechanical re-evaluation of the exact logical
// condition against the actual returned name string.
//
// HONEST LIMIT, stated plainly: this guarantees PRECISION (everything shown
// to the person genuinely satisfies the condition) -- it cannot by itself
// guarantee RECALL (that the SQL fetch didn't miss a genuine match; a
// filter can only remove wrong rows, never recover ones the query never
// fetched in the first place). Recall depends on the SQL compiler being a
// correct superset, which is why compileNamePredicate above is still
// written carefully and tested directly against real data -- this
// evaluator is the second, independent gate on top of that, not a
// replacement for getting the SQL right in the first place.
// ============================================================================

/** Plain-JS port of the `indic_fold` Postgres function (see chat, 28 Sep
 *  2026, for the original) -- needed here so verification is a genuinely
 *  independent code path, not another round-trip to Postgres. Must be kept
 *  in sync with the live SQL function if that function is ever changed. */
function indicFoldJs(wordRaw: string): string {
  let w = (wordRaw || "").toUpperCase().replace(/[^A-Z]/g, "");
  if (!w) return "";
  w = w.replace(/C(?!H)/g, "K");
  const digraphs: [RegExp, string][] = [
    [/SHH/g, "S"], [/CHH/g, "C"], [/KSH/g, "X"],
    [/PH/g, "F"], [/BH/g, "B"], [/DH/g, "D"], [/GH/g, "G"], [/KH/g, "K"],
    [/JH/g, "J"], [/TH/g, "T"], [/SH/g, "S"], [/ZH/g, "J"], [/CH/g, "C"],
    [/WH/g, "W"], [/CK/g, "K"],
  ];
  for (const [re, rep] of digraphs) w = w.replace(re, rep);
  const vowelDigraphs: [RegExp, string][] = [
    [/AA/g, "A"], [/EE/g, "I"], [/OO/g, "U"], [/OU/g, "O"], [/AU/g, "O"],
    [/OW/g, "O"], [/AW/g, "O"], [/AI/g, "E"], [/AY/g, "E"], [/OY/g, "O"],
    [/EY/g, "E"], [/EI/g, "E"], [/IE/g, "I"], [/EA/g, "I"], [/UU/g, "U"],
    [/OI/g, "O"], [/UI/g, "U"],
  ];
  for (const [re, rep] of vowelDigraphs) w = w.replace(re, rep);
  const translateMap: Record<string, string> = { V: "B", W: "B", F: "P", Z: "S", Q: "K", Y: "I" };
  w = w.replace(/[VWFZQY]/g, (c) => translateMap[c]);
  w = w.replace(/X/g, "KS");
  if (w.length > 1) w = w[0] + w.slice(1).replace(/H/g, "");
  w = w.replace(/(.)\1+/g, "$1");
  const consonantCount = w.replace(/[AEIOU]/g, "").length;
  if (consonantCount >= 3) {
    w = w.replace(/[EIOU]/g, "A");
    w = w.replace(/A+/g, "A");
  }
  return w;
}

/** Plain-JS port of name_synonym_normalize -- must stay in sync with the
 *  live SQL function (patternCache-adjacent migrations) if extended. */
function nameSynonymNormalizeJs(tok: string, isLast: boolean): string {
  const t = tok.toLowerCase();
  if (t === "nath" && isLast) return "debnath";
  const map: Record<string, string> = {
    ray: "roy", mazumdar: "majumdar", mazumder: "majumdar",
    surinder: "surendra", aggrawal: "aggarwal", ghose: "ghosh",
    basu: "bose", bosu: "bose", dutt: "dutta", dut: "dutta",
    singha: "sinha", bandyopadhyay: "banerjee", bandopadhyay: "banerjee",
    chattopadhyay: "chatterjee", mukhopadhyay: "mukherjee", gangopadhyay: "ganguly",
  };
  return map[t] ?? tok;
}

export function foldToken(tok: string, isLast: boolean): string {
  return indicFoldJs(nameSynonymNormalizeJs(tok, isLast));
}

function exactTest(kind: ExactKind, value: string, name: string): boolean {
  const src = exactRegexSource(kind, value);
  if (!src) return false;
  return new RegExp(src, "i").test((name || "").trim());
}

/**
 * Evaluate a NamePredicate against one real employee's name (and their
 * precomputed phonetic code array, if available) -- the independent,
 * mechanical verification gate. Returns false (never throws) for a
 * primitive type it doesn't recognize, so an unrecognized/future predicate
 * type fails CLOSED (excludes the row) rather than silently passing
 * everything through unchecked.
 */
export function evaluateNamePredicate(pred: NamePredicate, name: string, phoneticCodes: string[] | null): boolean {
  const tokens = (name || "").trim().split(/\s+/).filter(Boolean);
  const upperTokens = tokens.map((t) => t.toUpperCase());

  switch (pred.type) {
    case "and":
      return pred.clauses.every((c) => evaluateNamePredicate(c, name, phoneticCodes));
    case "or":
      return pred.clauses.some((c) => evaluateNamePredicate(c, name, phoneticCodes));
    case "not":
      return !evaluateNamePredicate(pred.clause, name, phoneticCodes);
    case "substring":
      return name.toLowerCase().includes(pred.value.toLowerCase());
    case "fuzzy": {
      if (!phoneticCodes || !phoneticCodes.length) return false;
      const qCodeA = foldToken(pred.value, true);
      const qCodeB = foldToken(pred.value, false);
      // Loosest: any overlap between the query's own possible codes and any
      // code in the stored name -- mirrors phonetic_subseq_match's intent
      // for a single-word query (a real subsequence check is unnecessary
      // here since we're only verifying a single leaf value, not a whole
      // multi-word phrase).
      return phoneticCodes.includes(qCodeA) || phoneticCodes.includes(qCodeB);
    }
    case "wordEquals": {
      if (pred.exact) return exactTest("any", pred.value, name);
      const literal = upperTokens.includes(pred.value.toUpperCase());
      if (literal) return true;
      if (!phoneticCodes) return false;
      const qCodeA = foldToken(pred.value, true);
      const qCodeB = foldToken(pred.value, false);
      return phoneticCodes.includes(qCodeA) || phoneticCodes.includes(qCodeB);
    }
    case "wordIsFirst": {
      if (pred.exact) return exactTest("first", pred.value, name);
      if (!tokens.length) return false;
      if (upperTokens[0] === pred.value.toUpperCase()) return true;
      if (!phoneticCodes || !phoneticCodes.length) return false;
      return phoneticCodes[0] === foldToken(pred.value, false);
    }
    case "wordIsLast": {
      if (pred.exact) return exactTest("last", pred.value, name);
      if (!tokens.length) return false;
      if (upperTokens[upperTokens.length - 1] === pred.value.toUpperCase()) return true;
      if (!phoneticCodes || !phoneticCodes.length) return false;
      return phoneticCodes[phoneticCodes.length - 1] === foldToken(pred.value, true);
    }
    default:
      return false; // unrecognized primitive -- fail CLOSED, never pass silently
  }
}

// ---------------------------------------------------------------------------
// Plain-language description of a predicate (29 Sep 2026).
//
// Why this exists: the JS verifier above proves the returned rows satisfy
// the predicate the LLM produced -- it cannot prove the predicate is what
// the person MEANT. The only defence against a misread question (e.g. "kumar
// at the middle" silently becoming a plain "has the word kumar") is making
// the interpretation visible, so the person can spot it at a glance instead
// of guessing from a list of names. This renders the tree as a sentence.
// It is display-only: nothing in the search path reads its output.
// ---------------------------------------------------------------------------

function q(v: string, exact?: boolean): string {
  return exact ? `"${v}" (exact)` : `"${v}"`;
}

function describeLeaf(pred: Exclude<NamePredicate, { type: "and" | "or" | "not" }>): string {
  switch (pred.type) {
    case "wordEquals":
      return `has the word ${q(pred.value, (pred as { exact?: boolean }).exact)}`;
    case "wordIsFirst":
      return `has ${q(pred.value, (pred as { exact?: boolean }).exact)} as the first word`;
    case "wordIsLast":
      return `has ${q(pred.value, (pred as { exact?: boolean }).exact)} as the last word`;
    case "substring":
      return `contains the text ${q(pred.value, (pred as { exact?: boolean }).exact)}`;
    case "fuzzy":
      return `sounds like ${q(pred.value, (pred as { exact?: boolean }).exact)}`;
  }
}

function describeNegatedLeaf(pred: Exclude<NamePredicate, { type: "and" | "or" | "not" }>): string {
  switch (pred.type) {
    case "wordEquals":
      return `does not have the word ${q(pred.value, (pred as { exact?: boolean }).exact)}`;
    case "wordIsFirst":
      return `${q(pred.value, (pred as { exact?: boolean }).exact)} is not the first word`;
    case "wordIsLast":
      return `${q(pred.value, (pred as { exact?: boolean }).exact)} is not the last word`;
    case "substring":
      return `does not contain the text ${q(pred.value, (pred as { exact?: boolean }).exact)}`;
    case "fuzzy":
      return `does not sound like ${q(pred.value, (pred as { exact?: boolean }).exact)}`;
  }
}

function describeClause(pred: NamePredicate, parentType: "and" | "or" | null): string {
  switch (pred.type) {
    case "and":
    case "or": {
      if (!pred.clauses.length) return pred.type === "and" ? "(anything)" : "(nothing)";
      const joiner = pred.type === "and" ? " and " : " or ";
      const body = pred.clauses.map((c) => describeClause(c, pred.type)).join(joiner);
      // Parenthesize only where mixing and/or would otherwise be ambiguous.
      return parentType && parentType !== pred.type ? `(${body})` : body;
    }
    case "not":
      if (pred.clause.type === "and" || pred.clause.type === "or" || pred.clause.type === "not") {
        return `not (${describeClause(pred.clause, null)})`;
      }
      return describeNegatedLeaf(pred.clause);
    default:
      return describeLeaf(pred);
  }
}

/** e.g. `Name has the word "kumar" and "kumar" is not the first word and "kumar" is not the last word` */
export function describeNamePredicate(pred: NamePredicate): string {
  return `Name ${describeClause(pred, null)}`;
}

/**
 * One-sentence reminder shown under the interpretation when at least one
 * word/substring condition is NOT exact -- i.e. similar spellings (Nath /
 * Debnath, Ray / Roy ...) are being counted -- so the person knows the
 * behaviour exists and how to switch it off. Null when everything is exact
 * or the tree has no such condition.
 */
export function describeSimilarityNote(pred: NamePredicate): string | null {
  const loose = (p: NamePredicate): boolean => {
    switch (p.type) {
      case "and":
      case "or":
        return p.clauses.some(loose);
      case "not":
        return loose(p.clause);
      case "fuzzy":
        return false; // "sounds like" already says so
      default:
        return !p.exact;
    }
  };
  return loose(pred)
    ? 'Similar spellings are included. Put a name in "double quotes" to match it exactly.'
    : null;
}

// ---------------------------------------------------------------------------
// Deciding which leaves are EXACT (29 Sep 2026). Deterministic, done in code
// after the LLM classifies, never left to the model:
//
//  1. Quoted: a value the person typed inside double quotes is literal --
//     whole word, case-insensitive, no phonetic/synonym matching.
//  2. Contrasted: if one value is required and a DIFFERENT value is
//     excluded, and the two would otherwise be treated as the same name
//     (e.g. "ends with debnath but not nath"), the person is plainly
//     separating them -- both become exact. Without this, "not nath" also
//     matches every Debnath and the answer is always empty.
// ---------------------------------------------------------------------------

const stripQuotes = (v: string) => v.replace(/^[\s"\u201C\u201D]+|[\s"\u201C\u201D]+$/g, "");

/** Every value the person put inside double quotes (straight or curly). */
export function extractQuotedValues(query: string): string[] {
  const out: string[] = [];
  const re = /["\u201C\u201D]([^"\u201C\u201D]{1,60})["\u201C\u201D]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(query))) {
    const v = m[1].trim();
    if (v) out.push(v);
  }
  return out;
}

function codesOf(v: string): Set<string> {
  const c = new Set<string>();
  for (const isLast of [true, false]) {
    const f = foldToken(v, isLast);
    if (f) c.add(f);
  }
  return c;
}
function sameName(a: string, b: string): boolean {
  const ca = codesOf(a);
  for (const x of codesOf(b)) if (ca.has(x)) return true;
  return false;
}

export function markExactLeaves(pred: NamePredicate, quotedValues: string[]): NamePredicate {
  const quoted = new Set(quotedValues.map((v) => stripQuotes(v).toLowerCase()).filter(Boolean));

  // Collect required (positive) and excluded (negated) values.
  const pos = new Set<string>();
  const neg = new Set<string>();
  const walk = (p: NamePredicate, negated: boolean) => {
    switch (p.type) {
      case "and":
      case "or":
        p.clauses.forEach((c) => walk(c, negated));
        return;
      case "not":
        walk(p.clause, !negated);
        return;
      case "fuzzy":
        return;
      default: {
        const v = stripQuotes(p.value).toLowerCase();
        if (v) (negated ? neg : pos).add(v);
      }
    }
  };
  walk(pred, false);

  const contrasted = new Set<string>();
  for (const a of pos) {
    for (const b of neg) {
      if (a !== b && sameName(a, b)) {
        contrasted.add(a);
        contrasted.add(b);
      }
    }
  }

  const rewrite = (p: NamePredicate): NamePredicate => {
    switch (p.type) {
      case "and":
        return { type: "and", clauses: p.clauses.map(rewrite) };
      case "or":
        return { type: "or", clauses: p.clauses.map(rewrite) };
      case "not":
        return { type: "not", clause: rewrite(p.clause) };
      case "fuzzy":
        return { type: "fuzzy", value: stripQuotes(p.value) };
      default: {
        const clean = stripQuotes(p.value);
        const key = clean.toLowerCase();
        const exact = p.exact || quoted.has(key) || contrasted.has(key);
        return exact ? { ...p, value: clean, exact: true } : { ...p, value: clean };
      }
    }
  };
  return rewrite(pred);
}

/** True if any leaf in the tree is exact -- such intents are never cached. */
export function hasExactLeaf(pred: NamePredicate): boolean {
  switch (pred.type) {
    case "and":
    case "or":
      return pred.clauses.some(hasExactLeaf);
    case "not":
      return hasExactLeaf(pred.clause);
    case "fuzzy":
      return false;
    default:
      return !!pred.exact;
  }
}
