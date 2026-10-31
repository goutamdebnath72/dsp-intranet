// src/lib/qualifications/degreeAnswer.ts
//
// QUESTIONS ABOUT THE DEGREES THEMSELVES, answered from the table of degrees (step 61a). No model call, nothing is read from a database.
// Owner, 26 Oct 2026: "what are the post graduate degrees in engineering" is a question about degrees, not about people: the table of degrees (degrees.ts: 120 degrees, each with its level and its field)
// answers it. Three kinds of question are taken:
//   1. a LIST:      "what are the post graduate degrees in engineering", "list the engineering degrees", "how many post graduate degrees are there in medicine", "which degrees are higher than graduate"
//   2. A VERDICT:   "is MD a postgraduate degree", "is dnb a post graduate degree", "is mbbs graduate or post graduate"
//   3. ONE DEGREE:  "what is mtech", "full form of dnb", "what level is bds"
// A question that is about PEOPLE (doctors, employees, who, a ticket ...) is never taken: the hospital route and the directory answer those. The table is general knowledge, NOT an official list, and the
// answer says so; a degree the author was not sure of is marked with * and named. A field the table does not have is said so: nothing is guessed.
// Pure (no server code): the pipeline calls answerDegreeQuestion(question).

import { DEGREES, LEVELS, LEVEL_LABEL, LEVEL_RANK, SEGMENTS, type DegreeDef, type Level, type Segment } from "./degrees";
import { degreeByKey, keyOf } from "./parse";
import type { HospitalAnswer, HospitalResult } from "../hospital/types";

/** A question about PEOPLE or a document, not about degrees. */
const ABOUT_PEOPLE = /\b(doctors?|dr|employees?|employed|people|persons?|staff|officers?|executives?|who|whom|whose|ticket|tickets|holders?|working|work|posted|circulars?|policy|policies|scheme|eligib\w*|salary|pay|promotion|recruit\w*|vacanc\w*|apply|applying|admission)\b/i;
const DEGREE_WORD = /\b(degrees?|qualifications?|courses?)\b/i;

const norm = (s: string) => String(s ?? "").toLowerCase().replace(/[“”"']/g, "").replace(/&/g, " and ").replace(/[^a-z0-9.\s]/g, " ").replace(/\s+/g, " ").trim();

/** The level a question names (the longest wording first: "post graduate" before "graduate"), or null. */
const LEVEL_WORDS: [RegExp, Level][] = [
  [/\bsuper\s?-?\s?speciali?[tc]y\b/, "superspecialty"],
  [/\b(?:post\s?-?\s?graduate|post\s?-?\s?graduation|postgraduation|pg|master'?s?|masters)\b/, "postgraduate"],
  [/\b(?:doctorates?|doctoral|ph\.?\s?d)\b/, "doctorate"],
  [/\b(?:under\s?-?\s?graduate|graduate|graduation|bachelor'?s?|bachelors|ug)\b/, "graduate"],
  [/\bdiplomas?\b/, "diploma"],
  [/\bcertificates?\b/, "certificate"],
];
function levelsIn(q: string): Level[] {
  let s = q;
  const out: Level[] = [];
  for (const [re, lv] of LEVEL_WORDS) {
    if (re.test(s)) {
      if (!out.includes(lv)) out.push(lv);
      s = s.replace(new RegExp(re.source, "g"), " "); // "post graduate" is not also "graduate"
    }
  }
  return out;
}

/** Words that name a FIELD, each to the segment of the table. */
const SEGMENT_WORDS: [RegExp, Segment][] = [
  [/\b(?:engineering|engg|engineer|engineers|technology|technical|btech|b\.tech)\b/, "Engineering and technology"],
  [/\b(?:medicine|medical|allopathy|allopathic)\b/, "Medical (allopathy)"],
  [/\b(?:dental|dentistry)\b/, "Dental"],
  [/\b(?:ayush|ayurveda|ayurvedic|homeopathy|homoeopathy|unani|siddha|naturopathy)\b/, "AYUSH (Ayurveda, Unani, Homeopathy, Siddha, Naturopathy)"],
  [/\b(?:nursing|paramedical|physiotherapy|allied\s+health)\b/, "Nursing and paramedical"],
  [/\b(?:pharmacy|pharmaceutical|pharma)\b/, "Pharmacy"],
  [/\b(?:veterinary|agriculture|agricultural|fisheries|animal\s+husbandry)\b/, "Veterinary and agriculture"],
  [/\b(?:architecture|architectural|design|planning)\b/, "Architecture and design"],
  [/\b(?:science|sciences)\b/, "Science"],
  [/\b(?:computer|computers|computing|software|it)\b/, "Computer applications"],
  [/\b(?:arts|humanities|social\s+sciences?|social\s+work)\b/, "Arts, humanities and social sciences"],
  [/\b(?:commerce|management|business|accounting|accountancy)\b/, "Commerce and management"],
  [/\b(?:law|legal)\b/, "Law"],
  [/\b(?:education|teaching|teacher|teachers)\b/, "Education"],
  [/\b(?:school|trade|iti)\b/, "School and trade"],
  [/\b(?:research)\b/, "Research (any field)"],
];
function segmentIn(q: string): Segment | null {
  for (const [re, seg] of SEGMENT_WORDS) if (re.test(q)) return seg;
  return null;
}
/** After "in / of / for / under": is a FIELD named at all (so that an unknown field can be said to be unknown)? */
const FIELD_PHRASE = /\b(?:in|of|for|under|within)\s+(?:the\s+)?(?:field\s+of\s+)?(?:(?:post\s?-?\s?graduate|graduate|super\s?-?\s?speciali?[tc]y)\s+)?([a-z][a-z .&-]{2,40}?)\s*(?:\?|$|\bdegrees?\b)/;
const NOT_A_FIELD = /^(?:the\s+)?(?:table|system|list|plant|dsp|sail|steel|india|general|any\s+field|all|total|world|this|that|it)\b/;

/** A field as a person says it: "Medicine (allopathy)", "AYUSH", "Engineering and technology". */
const segLabel = (seg: Segment): string => (seg.startsWith("Medical") ? "Medicine (allopathy)" : seg.replace(/ \(.*\)$/, ""));
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
const PG_PLUS = (d: DegreeDef) => LEVEL_RANK[d.level] >= LEVEL_RANK.postgraduate;

const NOTE = "This is the table of degrees kept in the system (general knowledge, not an official list), so it may be incomplete.";

/** What counts at each level, folded under the answer. */
const EXPLAIN: Record<Level, string> = {
  certificate: "A certificate is a school or trade qualification (Class X, Class XII, ITI).",
  diploma: "A diploma below graduate level (polytechnic engineering, D.Pharm, GNM ...). A diploma taken AFTER a bachelor's degree is a postgraduate diploma (PGDM, PGDCA, DGO ...).",
  graduate: "A graduate degree is a bachelor's degree or an equal professional degree (MBBS, BDS, B.Tech, B.Com, LLB ...).",
  postgraduate: "Postgraduate means every degree ABOVE graduate: a master's degree (M.Tech, MBA, M.Sc ...), MD, MS, DNB, MDS, a postgraduate diploma such as DGO or PGDM; super-specialty and doctorate degrees are above it. MBBS and BDS are graduate degrees.",
  superspecialty: "A super-specialty degree (DM, MCh, DrNB, FNB) is taken after an MD or MS, so it is above postgraduate.",
  doctorate: "A doctorate (PhD, DSc, D.Litt) is a research degree above postgraduate.",
};
const levelPlural = (l: Level) => (l === "postgraduate" ? "Postgraduate degrees" : l === "superspecialty" ? "Super-specialty degrees" : l === "graduate" ? "Graduate degrees" : l === "doctorate" ? "Doctorates" : l === "diploma" ? "Diplomas (below graduate)" : "Certificates");

const star = (d: DegreeDef) => `${d.code}${d.confirm ? " *" : ""}`;
function footnote(ds: DegreeDef[]): string | null {
  const c = ds.filter((d) => d.confirm);
  return c.length ? `* Not confirmed: ${c.map((d) => d.code).join(", ")} (the level is the best knowledge of the table's author).` : null;
}

function listCard(args: { title: string; head: string; sentence: string; ds: DegreeDef[]; showField: boolean; showLevel: boolean; level: Level | null; seg: Segment | null; many?: boolean }): HospitalResult {
  const { title, head, sentence, ds, showField, showLevel, level, seg } = args;
  const columns = ["Degree", "Full name", ...(showField ? ["Field"] : []), ...(showLevel ? ["Level"] : [])];
  const rows = ds.map((d) => [star(d), d.name, ...(showField ? [d.segment] : []), ...(showLevel ? [LEVEL_LABEL[d.level]] : [])]);
  const lines = [NOTE, ...(footnote(ds) ? [footnote(ds) as string] : [])];
  const details: { summary: string; text: string }[] = [];
  if (level) details.push({ summary: `What counts as ${level === "postgraduate" ? "postgraduate" : level === "superspecialty" ? "super-specialty" : level}?`, text: EXPLAIN[level] });
  if (level === "postgraduate") {
    const above = DEGREES.filter((d) => LEVEL_RANK[d.level] > LEVEL_RANK.postgraduate && (!seg || d.segment === seg || d.segment === "Research (any field)" || d.segment === "Any field"));
    if (above.length) details.push({ summary: `Degrees above postgraduate (${above.length})`, text: above.map((d) => `${d.code} (${d.name})`).join("; ") + "." });
  }
  const card: HospitalAnswer = { title, headline: { text: head, tone: ds.length ? "info" : "unknown" }, status: { tone: ds.length ? "info" : "unknown", text: sentence }, table: ds.length ? { columns, rows } : undefined, lines, details };
  return { summary: `${head}. ${sentence}`, card };
}

/** The degree a question is about, looked up by what follows "is / what is / full form of ...". null when it names none the table knows. */
function degreeNamed(text: string, original: string): DegreeDef | null {
  const t = norm(text).replace(/^(?:the|a|an)\s+/, "").replace(/\s+(?:degree|qualification|course)$/, "").trim();
  if (!t || t.split(" ").length > 5) return null;
  const k = keyOf(t);
  // "DTM&H" is cleaned to "dtm and h": a degree whose code has an ampersand is found without the "and" as well
  const d = degreeByKey(k) ?? degreeByKey(keyOf(t.replace(/\band\b/g, " ")));
  if (!d) return null;
  // a two-letter word (me, ms, ma, be, md ...) is a degree only when it is written in capitals or the question is plainly about a degree
  if (k.length <= 2) {
    const asWritten = /\b[A-Z][A-Z.]{1,3}\b/.test(original);
    if (!asWritten && !DEGREE_WORD.test(original)) return null;
  }
  return d;
}

export function answerDegreeQuestion(question: string): HospitalResult | null {
  const original = String(question ?? "").trim();
  const q = norm(original);
  if (!q || q.length > 160 || ABOUT_PEOPLE.test(q)) return null;
  const lvls = levelsIn(q);

  // ---- 2. a VERDICT or the LEVEL of one degree: "is MD a postgraduate degree", "is mbbs graduate or post graduate", "what level is bds"
  const verdict = /\b(?:is|are|was)\s+(?:an?\s+|the\s+)?(.{1,40}?)\s+(?:an?\s+|the\s+)?(?:(?:degree|qualification)\s+)?(?:(?:post\s?-?\s?graduate|graduate|super|doctorate|doctoral|diploma|certificate|under\s?-?\s?graduate|master|bachelor|ph\.?\s?d)\b|or\b)/.exec(q);
  const levelOf = /\b(?:what|which)\s+level\s+(?:is|of)\s+(?:the\s+)?(?:degree\s+)?(.{1,40}?)\s*\??$/.exec(q) ?? /\blevel\s+of\s+(?:the\s+)?(?:degree\s+)?(.{1,40}?)\s*\??$/.exec(q);
  const whatIs = /^(?:what\s+is|what's|whats|explain|define|full\s+form\s+of|fullform\s+of|meaning\s+of|expand)\s+(?:the\s+)?(?:degree\s+)?(.{1,45}?)\s*\??$/.exec(q);

  const one = (m: RegExpExecArray | null): DegreeDef | null => (m ? degreeNamed(m[1], original) : null);
  const vd = one(verdict);
  if (vd && lvls.length >= 1) {
    const asked = lvls[0];
    const yes = asked === "postgraduate" ? LEVEL_RANK[vd.level] >= LEVEL_RANK.postgraduate : vd.level === asked;
    if (lvls.length >= 2) {
      // "is mbbs graduate or post graduate": the answer is the level itself
      return levelCard(vd);
    }
    const exact = LEVEL_LABEL[vd.level];
    const sentence = yes
      ? vd.level === asked ? `${vd.code} (${vd.name}) is a ${exact.toLowerCase()} degree.` : `${vd.code} (${vd.name}) is a ${exact.toLowerCase()} degree: above postgraduate.`
      : `${vd.code} (${vd.name}) is ${/^[aeiou]/i.test(exact) ? "an" : "a"} ${exact.toLowerCase()} degree${LEVEL_RANK[vd.level] > LEVEL_RANK[asked] ? ", above " + asked : ", below " + asked}.`;
    const card: HospitalAnswer = {
      title: `${vd.code}: ${levelPlural(asked).toLowerCase().replace(/s$/, "")}?`,
      headline: { text: yes ? "Yes" : "No", tone: yes ? "yes" : "no" },
      status: { tone: "info", text: sentence },
      lines: [NOTE, ...(vd.confirm ? [`* Not confirmed: ${vd.code} (${vd.confirm})`] : [])],
      details: [{ summary: `What counts as ${asked === "postgraduate" ? "postgraduate" : asked === "superspecialty" ? "super-specialty" : asked}?`, text: EXPLAIN[asked] }],
    };
    return { summary: `${yes ? "Yes" : "No"}. ${sentence}`, card };
  }
  const ld = one(levelOf);
  if (ld) return levelCard(ld);
  const wd = one(whatIs);
  if (wd && (keyOf(whatIs ? whatIs[1] : "").length >= 3 || DEGREE_WORD.test(q))) return levelCard(wd);

  // ---- 1. a LIST: it must say "degree(s)" (or "qualification(s)") and name a level or a field, or say "higher than graduate"
  if (!DEGREE_WORD.test(q)) return null;
  const higher = /\b(?:higher|above|beyond|after|more)\s+(?:than\s+)?(?:a\s+|the\s+)?(?:graduate|graduation|bachelor'?s?|bachelors)\b/.test(q);
  const level: Level | null = higher ? "postgraduate" : lvls[0] ?? null;
  const seg = segmentIn(q.replace(/\b(?:post\s?-?\s?graduate|graduate|graduation|super\s?-?\s?speciali?[tc]y)\b/g, " "));
  const fieldPhrase = FIELD_PHRASE.exec(q.replace(/\b(?:are|is)\s+there\b/g, " "));
  const fieldText = fieldPhrase && !NOT_A_FIELD.test(fieldPhrase[1].trim()) ? fieldPhrase[1].trim() : null;
  if (!level && !seg && !fieldText) return null;
  if (!seg && fieldText && !/\b(?:levels?|types?|kinds?|k\s*inds?)\b/.test(fieldText)) {
    const named = fieldText.replace(/\b(?:post\s?-?\s?graduate|graduate|degrees?)\b/g, "").trim();
    if (named) {
      const card: HospitalAnswer = {
        title: "A field the table does not have",
        headline: { text: "Not known", tone: "unknown" },
        status: { tone: "unknown", text: `The table of degrees has no field called “${named}”. Its fields are: ${SEGMENTS.join("; ")}.` },
        lines: [NOTE],
      };
      return { summary: `Not known. The table of degrees has no field called “${named}”.`, card };
    }
  }
  const wantsCount = /\bhow\s+many\b/.test(q);
  let ds = DEGREES.filter((d) => (level ? (higher || level === "postgraduate" ? (higher ? PG_PLUS(d) : d.level === "postgraduate") : d.level === level) : true) && (seg ? d.segment === seg : true));
  if (higher) ds = DEGREES.filter((d) => PG_PLUS(d) && (seg ? d.segment === seg : true));
  ds = [...ds].sort((a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level] || DEGREES.indexOf(a) - DEGREES.indexOf(b));
  const segName = seg ? segLabel(seg) : null;
  const what = higher ? "Degrees higher than graduate" : level ? levelPlural(level) : "Degrees";
  const title = `${what}${segName ? ` in ${segName}` : ""}`;
  const n = ds.length;
  const head = n === 0 ? "None in the table" : wantsCount ? `${n}` : `${n} ${plural(n, "degree", "degrees")}`;
  const sentence = n === 0
    ? `The table of degrees has no ${level ? levelPlural(level).toLowerCase() : "degree"}${segName ? ` in ${segName}` : ""}.`
    : `${what}${segName ? ` in ${segName}` : ""}: ${n} in the table.`;
  return listCard({ title, head, sentence, ds, showField: !seg, showLevel: !level || higher, level: higher ? "postgraduate" : level, seg });
}

/** One degree: its level is the clean answer (headline), then what it is. */
function levelCard(d: DegreeDef): HospitalResult {
  const label = LEVEL_LABEL[d.level];
  const sentence = `${d.code} is the ${d.name}: ${/^[aeiou]/i.test(label) ? "an" : "a"} ${label.toLowerCase()} degree in ${segLabel(d.segment)}.`;
  const card: HospitalAnswer = {
    title: `${d.code}: level`,
    headline: { text: label, tone: "info" },
    status: { tone: "info", text: sentence },
    lines: [NOTE, ...(d.confirm ? [`* Not confirmed: ${d.code} (${d.confirm})`] : []), ...(d.note ? [d.note] : [])],
    details: [{ summary: `What counts as ${d.level === "postgraduate" ? "postgraduate" : d.level === "superspecialty" ? "super-specialty" : d.level}?`, text: EXPLAIN[d.level] }],
  };
  void LEVELS;
  return { summary: `${label}. ${sentence}`, card };
}
