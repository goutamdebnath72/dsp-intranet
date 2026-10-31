// src/lib/pax/display.ts
//
// HOW A PRINTED NAME IS SHOWN IN THE PAX TABLE (step 63c; owner, 31 Oct 2026): three columns, Department | Location | PAX, the first column in A to Z order, nothing about plant or outside plant.
// The list prints one name per line ("CISF Main Gate (IN)"); the table needs the department and the location apart. PURE: it only reads the printed names, the database is not touched.
//
//   - Names that START WITH THE SAME WORDS share a department: the words they all begin with are the department, the rest of each name is its location (verbatim).
//       CISF Admin Gate / CISF Main Gate (IN) / CISF Pass section(Opp Admin. Bldg.) / CISF (PCR)  ->  CISF | Admin Gate, Main Gate (IN), Pass section(Opp Admin. Bldg.), PCR
//       Network Team (C & IT) / Network Team (CMMS)                                               ->  Network Team | C & IT, CMMS
//   - A name that stands alone is cut at its bracket: the text outside is the department, the text inside the bracket is the location.   Plant Medical (PMU) -> Plant Medical | PMU;  Fire Service -> Fire Service | (empty)
//   - A location that is only a bracket loses its brackets (A - Zone, PCR); a bracket that follows other words stays as printed (Main Gate (IN)).
//   - A name that stands alone but uses the SAME NUMBER as a name of a department belongs to that department, and its whole printed name is the location (owner, 31 Oct 2026):
//       CISF Tumla Gate and Weigh Bridge - Tumla Gate both have 42043  ->  CISF | Tumla Gate  and  CISF | Weigh Bridge - Tumla Gate

export interface Parts { department: string; location: string }

/**
 * COMPLETE department names that are never cut (owner, 31 Oct 2026: "Plant Control and Plant Medical are the complete department names, can not break the words").
 * Without this, the names that merely START with the same word ("Plant Control", "Plant Medical (PMU)") would be read as one department "Plant". A name that begins with one of these is that department,
 * the rest of the printed name (if any) is the location: Plant Medical (PMU) -> Plant Medical | PMU; Plant Control -> Plant Control | (empty).
 * Add a name here when a department's own name begins with a word that other departments share.
 */
export const WHOLE_DEPARTMENTS: readonly string[] = ["Plant Control", "Plant Medical"];
/** A printed name and, when it is known, its number (the sharing of a number needs it). */
export interface Entry { label: string; number?: string }

const BRACKET = /^(.*?)\s*\(([^)]*)\)\s*$/;
const words = (s: string): string[] => s.trim().split(/\s+/).filter(Boolean);
const lower = (s: string) => s.toLowerCase();

/** The text before a final bracket, and the bracket's content (or null). */
function splitBracket(label: string): { base: string; inside: string | null } {
  const m = BRACKET.exec(label.trim());
  return m ? { base: m[1].trim(), inside: m[2].trim() } : { base: label.trim(), inside: null };
}

/** A dash or colon standing alone between two parts of a printed name ("Weigh Bridge – 60T"): a separator, never a word of the department or the location. */
const SEPARATOR = /^[-–—−:]+$/;

/** The words that every name of the group begins with (compared without regard to case). */
function commonLead(bases: string[][]): string[] {
  const lead: string[] = [];
  for (let i = 0; ; i++) {
    const w = bases[0][i];
    if (w === undefined || !bases.every((b) => b[i] !== undefined && lower(b[i]) === lower(w))) break;
    lead.push(w);
  }
  while (lead.length > 0 && SEPARATOR.test(lead[lead.length - 1])) lead.pop(); // "Weigh Bridge –" is the department "Weigh Bridge"
  return lead;
}

/** The department and the location of every distinct printed name, worked out from ALL the names of the directory (the sharing of first words needs the whole list). */
export function splitLabels(entries: Entry[]): Map<string, Parts> {
  const distinct = Array.from(new Set(entries.map((e) => e.label.trim()).filter(Boolean)));
  const numbersOf = new Map<string, Set<string>>();
  for (const e of entries) {
    const l = e.label.trim();
    if (l && e.number) numbersOf.set(l, (numbersOf.get(l) ?? new Set<string>()).add(e.number.trim()));
  }
  const grouped = new Set<string>(); // the names that share their first words with another name (or are a whole department name)
  const out = new Map<string, Parts>();
  // a name that begins with a complete department name is that department, whole; it takes no part in the sharing of first words
  const whole = new Set<string>();
  for (const l of distinct) {
    const w = words(l).map(lower);
    const dep = WHOLE_DEPARTMENTS.find((d) => { const dw = words(d).map(lower); return dw.every((x, i) => w[i] === x); });
    if (!dep) continue;
    const rest = l.replace(/\s+/g, " ").slice(dep.length).trim();
    const lone = BRACKET.exec(rest);
    out.set(l, { department: dep, location: lone && lone[1] === "" ? lone[2].trim() : rest });
    whole.add(l);
    grouped.add(l);
  }
  const groups = new Map<string, string[]>();
  for (const l of distinct) {
    if (whole.has(l)) continue;
    const key = lower(words(splitBracket(l).base)[0] ?? l);
    groups.set(key, [...(groups.get(key) ?? []), l]);
  }
  for (const members of groups.values()) {
    if (members.length >= 2) {
      const lead = commonLead(members.map((l) => words(splitBracket(l).base)));
      if (lead.length > 0) {
        for (const l of members) {
          grouped.add(l);
          // the location = what is printed after the shared words, verbatim; only a lone bracket loses its brackets
          const rest = l.trim().replace(/\s+/g, " ").slice(lead.join(" ").length).replace(/^[\s\-–—−:]+/, "").trim();
          const lone = BRACKET.exec(rest);
          out.set(l, { department: lead.join(" "), location: lone && lone[1] === "" ? lone[2].trim() : rest });
        }
        continue;
      }
    }
    for (const l of members) {
      const { base, inside } = splitBracket(l);
      out.set(l, { department: base, location: inside ?? "" });
    }
  }
  // a name that stands alone but uses the number of a department's name joins that department; its whole printed name is the location
  for (const s of distinct) {
    if (grouped.has(s)) continue;
    const mine = numbersOf.get(s);
    if (!mine) continue;
    const t = distinct.find((x) => x !== s && grouped.has(x) && Array.from(numbersOf.get(x) ?? []).some((n) => mine.has(n)));
    if (t) out.set(s, { department: (out.get(t) as Parts).department, location: s.replace(/\s+/g, " ") });
  }
  return out;
}

const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
/** Department A to Z, then location, then number. */
export const compareParts = (a: Parts & { number: string }, b: Parts & { number: string }): number =>
  collator.compare(a.department, b.department) || collator.compare(a.location, b.location) || a.number.localeCompare(b.number);
