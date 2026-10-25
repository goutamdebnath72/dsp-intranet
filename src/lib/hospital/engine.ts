// src/lib/hospital/engine.ts
//
// The hospital route (step 51a): questions about the OPD answered from the hospital data, deterministically and without a model call.
// It runs right after the holiday parser in the omnibar. When a question is not clearly about the hospital OPD it returns null and the other routes go on.
//
// Understood today (more is added with the data):
//   - is the OPD open today / tomorrow / on a weekday / on a date (and why not)        - which days a doctor sits in the OPD, and whether he sits on a date
//   - who is in a department's OPD on a weekday / date                                  - a unit (OPD number, or "unit 2" of a department) with its days and head
//   - a department's OPD at a glance                                                    - the head of a unit and the HOD of a department
//   - OPD and token timings                                                             - the days the OPD is closed
// The HOD and the unit heads: by the usual rule at the hospital the first-named doctor of a unit is its head, and one of the unit heads is the HOD (set in the data when known).
// The hospital's lists are out of date, so a doctor who has retired or is not on the current doctor list is MARKED, never silently shown as sitting.

import { DateTime } from "luxon";
import { opdClosure, type Closure, type HolidaysOn } from "./closure";
import { parseDateRef, plain, weekdaysIn, type DateRef } from "./dates";
import { OPD_DAYS, PERSON, SCHEDULE, STAFF, WEEKDAY_NAME, unitHead, type Department, type Person, type Slot, type Unit, type Weekday } from "./opdData";
import type { AskOption, DepartmentAsk } from "../nl2sql/departmentAsk";
import { MARKER_RE, markerOf } from "./doctorAsk";
import { nonPermanentOf, NON_PERMANENT_DOCTORS, unlistedAsPeople } from "./nonPermanentDoctors";
import type { HospitalAnswer, HospitalResult, HospitalTable } from "./types";

export interface EngineCtx {
  now: DateTime;
  holidaysOn: HolidaysOn;
}

// ---------------------------------------------------------------- wording

// When the answer is "no OPD" the person still needs somewhere to go: point to the Emergency Department (wording and hours from the data file).
const EM = SCHEDULE.emergency;
const URGENT = EM ? `For urgent medical attention, you can consult the ${EM.name}, which remains open ${EM.hours}.` : undefined;
const UNIT_RULE = SCHEDULE.unitRule ?? "A patient is seen only by the unit of his or her first visit.";
const URGENT_SOFT = EM ? `If the OPD turns out to be closed, you can consult the ${EM.name} for urgent medical attention; it remains open ${EM.hours}.` : undefined;

export const nice = (s: string) =>
  s.replace(/\.(?=[A-Za-z])/g, ". ").trim().split(/\s+/).map((w) => (w.includes(".") || w.length <= 1 ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())).join(" ");
const flag = (p: Person) => (p.status === "retired" ? " (retired)" : p.status === "transferred" ? " (transferred)" : p.status === "not_on_list" ? " (not on the current doctor list)" : "");
/** A department's name as the hospital writes it (MOPD, ENT, OHS & PMU, Gynae & Obs ...), not title-cased into "Mopd". */
const deptLabel = (dep: string): string => SCHEDULE.departments.find((d) => d.staffDepartment.toUpperCase() === dep.toUpperCase())?.name ?? (["OHS & PMU", "ENT", "MOPD"].includes(dep.toUpperCase()) ? dep.toUpperCase() : nice(dep));
const docName = (p: Person) => `Dr. ${nice(p.name)}`;
const docLabel = (p: Person) => docName(p) + flag(p);
const shortName = (p: Person) => {
  const w = nice(p.name).split(" ");
  return w.length === 1 ? `Dr. ${w[0]}` : `${w.slice(0, -1).map((x) => (x.length > 1 && !x.includes(".") ? `${x[0]}.` : x)).join(" ")} ${w[w.length - 1]}`;
};
const shortLabel = (p: Person) => shortName(p) + (p.status === "retired" ? " (retired)" : p.status === "transferred" ? " (transferred)" : p.status === "not_on_list" ? " (not on list)" : "");
const isCurrent = (p: Person | undefined) => !!p && p.status === "current";
/** "has retired", "has been transferred", "is not on the current doctor list" */
const statusPhrase = (p: Person) => (p.status === "retired" ? "has retired" : p.status === "transferred" ? "has been transferred" : "is not on the current doctor list");
const joinAnd = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const fmtTime = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h < 12 ? "AM" : "PM"}`;
};
const ranges = (rs: { from: string; to: string }[]) => rs.map((r) => `${fmtTime(r.from)} to ${fmtTime(r.to)}`).join(" and ");

const STATE_TEXT: Record<string, string> = {
  OT_DAY: "OT day (no OPD)",
  CLOSED: "Closed",
  ANY_AVAILABLE: "Any doctor who is available",
  PROCEDURE_EMERGENCY: "Procedures and emergency cases only",
  UNKNOWN: "Not shown in the schedule",
  UNIT_OFF: "Does not sit on this day",
};
const slotPeople = (s: Slot): Person[] => (s.doctors ?? []).map((id) => PERSON.get(id)).filter((p): p is Person => !!p);
/** A doctor who has retired or been transferred is not shown in a table of who sits (he or she does not sit any more); one who is only not on the current doctor list is shown, marked. */
const isGone = (p: Person) => p.status === "retired" || p.status === "transferred";
const slotShown = (s: Slot): Person[] => slotPeople(s).filter((p) => !isGone(p));
const NO_CURRENT = "No current doctor listed";
const slotText = (s: Slot, short = false): string => {
  const ps = slotShown(s);
  const one = (p: Person) => `${s.rooms?.[p.id] ? `${s.rooms[p.id]}: ` : ""}${short ? shortLabel(p) : docLabel(p)}`;
  const base = ps.length ? ps.map(one).join(s.rooms ? "; " : short ? ", " : " and ") : s.doctors?.length ? NO_CURRENT : STATE_TEXT[s.state ?? "UNKNOWN"];
  return s.note ? (s.rooms ? `${base}; ${s.note}` : `${base} (${s.note})`) : base;
};

// ---- the time of day, used only for questions about TODAY (the OPD hours are in the data file)
type TimeState =
  | { state: "open"; closesAt: string; tokenEnd: string | null; tokenClosed: boolean }
  | { state: "before"; opensAt: string }
  | { state: "between"; reopensAt: string }
  | { state: "over" };
const mins = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
function timeState(now: DateTime): TimeState {
  const m = now.hour * 60 + now.minute;
  const opd = SCHEDULE.timings.opd;
  const token = SCHEDULE.timings.token;
  for (let i = 0; i < opd.length; i++) {
    if (m >= mins(opd[i].from) && m < mins(opd[i].to)) {
      const tk = token[i];
      return { state: "open", closesAt: fmtTime(opd[i].to), tokenEnd: tk ? fmtTime(tk.to) : null, tokenClosed: !!tk && m >= mins(tk.to) };
    }
  }
  const next = opd.find((r) => m < mins(r.from));
  if (!next) return { state: "over" };
  return m < mins(opd[0].from) ? { state: "before", opensAt: fmtTime(next.from) } : { state: "between", reopensAt: fmtTime(next.from) };
}
const closedNowText = (ts: Exclude<TimeState, { state: "open" }>, now: DateTime) => {
  const t = now.minute === 0 ? now.toFormat("h a") : now.toFormat("h:mm a");
  return ts.state === "before" ? `The OPD is not open yet (it is ${t}): it opens at ${ts.opensAt}.`
    : ts.state === "between" ? `The OPD is closed at this moment (it is ${t}): it reopens at ${ts.reopensAt}.`
    : `Today's OPD hours are over (it is ${t}).`;
};
/** Only a question about today ("today", "now", or no date at all) is judged by the time of day; "on monday" or "on 26 october" is not, even when that day is today. */
const timeApplies = (ref: DateRef | null, date: DateTime, today: DateTime) => date.hasSame(today, "day") && (!ref || ref.kind === "relative");

// ---- when a patient's own unit is not sitting: the unit rule, the general OPD for general care, the Emergency Department for urgent care
function generalOpdText(day: Weekday | null): string | null {
  const g = SCHEDULE.generalOpd;
  const d = g ? SCHEDULE.departments.find((x) => x.id === g.departmentId) : undefined;
  if (!g || !d) return null;
  const sits = (dd: Weekday) => d.units.some((u) => u.week[dd]?.doctors?.some((id) => PERSON.get(id)?.status === "current"));
  const labels = joinAnd(d.units.map((u) => u.label));
  if (day) return sits(day) ? `${g.name}, ${labels}, open on ${WEEKDAY_NAME[day]}` : null;
  const days = OPD_DAYS.filter(sits);
  if (!days.length) return null;
  return `${g.name}, ${labels}, open ${days.length === OPD_DAYS.length ? "Monday to Saturday" : `on ${joinAnd(days.map((x) => WEEKDAY_NAME[x]))}`}`;
}
function noUnitSuggestion(day: Weekday | null, soft: boolean): string | undefined {
  const g = generalOpdText(day);
  if (!g) return URGENT;
  // one point per line (the card shows them as bullets)
  const points = [UNIT_RULE, `For general care: ${g} (general consultation, not specialist treatment).`];
  if (EM) points.push(`For urgent medical attention: the ${EM.name}, open ${EM.hours}.`);
  return `${soft ? "If your unit is not sitting that day:\n" : ""}${points.join("\n")}`;
}

const noOpdState = (s?: Slot) => !!s && !s.doctors?.length && (s.state === "OT_DAY" || s.state === "CLOSED" || s.state === "UNIT_OFF");
/** True when none of these units holds an OPD on any of these days (OT day or closed), so the person should be pointed to the Emergency Department. */
const allNoOpd = (units: Unit[], days: Weekday[]) => units.length > 0 && days.length > 0 && units.every((u) => days.every((d) => noOpdState(u.week[d])));
const noCurrentDoctor = (s: Slot) => !!s.doctors?.length && !slotPeople(s).some((p) => isCurrent(p));

// ---------------------------------------------------------------- entities
const SPELL: [RegExp, string][] = [
  [/chowdhury|chowdhuri|choudhury|choudhuri/g, "choudhuri"], [/khusboo|khushboo|khooshbu|khoosbu|khushbu/g, "khooshbu"], [/mallik/g, "mallick"],
  [/acharyya/g, "acharya"], [/bhattacharyya/g, "bhattacharya"], [/thara/g, "tara"], [/koner/g, "konar"], [/mohanta/g, "mahanta"],
  [/avishek|avisek/g, "avisek"], [/chakrabarti|chakravorty|chakraborty/g, "chakraborty"],
];
const spell = (t: string) => SPELL.reduce((s, [re, to]) => s.replace(re, to), t);
const INITIAL_PAIRS = new Set(["rr", "ss", "kb", "pp", "ak", "kr", "sk", "dy", "sa"]);
const tokenize = (s: string): string[] => spell(plain(s)).split(/[^a-z0-9]+/).filter(Boolean).flatMap((t) => (INITIAL_PAIRS.has(t) ? t.split("") : [t]));
/** One letter wrong, missing or extra in a name of six letters or more ("gosami" for "goswami"). */
const oneOff = (a: string, b: string): boolean => a.length >= 6 && b.length >= 5 && Math.abs(a.length - b.length) <= 1 && Math.round((1 - sim(a, b)) * Math.max(a.length, b.length)) <= 1;
const sim = (a: string, b: string) => {
  // a small edit-distance similarity, enough for spelling variants of a name
  const m = a.length, n = b.length;
  if (!m || !n) return 0;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)] as number[]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return 1 - d[m][n] / Math.max(m, n);
};

const tokenSets = new Map<string, string[][]>();
function personTokens(p: Person): string[][] {
  let sets = tokenSets.get(p.id);
  if (!sets) {
    const srcs = [p.name, ...p.printed.map((x) => x.replace(/^OPD schedule:\s*/i, "").replace(/^(DR\.?|SHRI|MS\.?)\s*/i, "").split(",")[0])];
    sets = srcs.map(tokenize).filter((t) => t.length);
    tokenSets.set(p.id, sets);
  }
  return sets;
}

const STOP = new Set(
  ("dr doctor doctors drs mr mrs ms shri prof professor sir madam which what whom who whose when where how why is are was were will would can could do does did the a an of in on at for to from by with and or not no yes please tell me show give list name names " +
    "opd opds out patient patients outpatient outdoor clinic clinics unit units number department departments dept day days week weekday weekdays sit sits sitting seat seats seated available availability attend attends attending " +
    "schedule timing timings time times today tomorrow yesterday tonight now next this coming head hod incharge charge open opens closed close closes working running functioning consult consults consulting see sees visit his her their hospital main dsp " +
    "monday tuesday wednesday thursday friday saturday sunday mon tue tues wed thu thur thurs fri sat sun january february march april may june july august september october november december jan feb mar apr jun jul aug sep sept oct nov dec token holiday holidays contractual contract permanent regular temporary non part visiting employee employees").split(" "),
);

const DOCTOR_POOL: Person[] = [...STAFF.people.filter((p) => p.role === "doctor"), ...unlistedAsPeople()];
/** Doctors whose name fits the name words of the question. More than one = the question is ambiguous. */
function findDoctors(words: string[], keep?: Set<string>): Person[] {
  const q = words.filter((w) => (keep?.has(w) ?? false) || (!STOP.has(w) && !/^\d+$/.test(w)));
  if (!q.length || !q.some((w) => w.length >= 3)) return [];
  const hits = DOCTOR_POOL.filter((p) => {
    return personTokens(p).some((set) => q.every((w) => set.some((t) => t === w || (w.length >= 5 && sim(w, t) >= 0.86) || oneOff(w, t) || (w.length === 1 && t.startsWith(w)))));
  });
  if (hits.length > 1) {
    // a person whose WHOLE name is in the question beats people who only share a word with it
    const full = hits.filter((p) => personTokens(p).some((set) => set.every((t) => q.includes(t) || q.some((w) => sim(w, t) >= 0.86))));
    if (full.length === 1) return full;
  }
  return hits;
}

/** Words that name a department or discipline the OPD schedule has no department for (the staff list does): used only to narrow a doctor's name. */
const HINT_WORDS: [string, string][] = [
  ["radiology", "RADIOLOGY"], ["radiologist", "RADIOLOGY"], ["pathology", "PATHOLOGY"], ["pathologist", "PATHOLOGY"], ["biochemistry", "BIOCHEMISTRY"], ["anaesthesia", "ANAESTHESIOLOGY"],
  ["anesthesia", "ANAESTHESIOLOGY"], ["anaesthesiology", "ANAESTHESIOLOGY"], ["anaesthetist", "ANAESTHESIOLOGY"], ["emergency", "EMERGENCY"], ["casualty", "EMERGENCY"], ["blood bank", "BLOOD BANK"],
  ["public health", "PUBLIC HEALTH"], ["ohs", "OHS & PMU"], ["pmu", "OHS & PMU"], ["pharmacy", "STORES AND PHARMACY"], ["administration", "ADMINISTRATION"],
];
const exactDoctor = (kind: string, value: string): Person | undefined => {
  const v = value.toLowerCase();
  const k = kind.toLowerCase();
  return DOCTOR_POOL.find((p) => (k === "ticket" ? p.ticket === value : k.startsWith("list") ? (p.doctorListId ?? "").toLowerCase() === v : p.id === v));
};
const sitsInDept = (p: Person, d: Department) => d.units.some((u) => OPD_DAYS.some((day) => u.week[day]?.doctors?.includes(p.id)));
/** A hint in the question (a department or discipline, a unit) narrows the doctors a name matches. If the hint fits none of them, the list is kept and the miss is reported. */
function narrowDoctors(cands: Person[], depts: Department[], extra: string[], units: Unit[]): { list: Person[]; miss: string | null } {
  if (!cands.length || (!depts.length && !extra.length && !units.length)) return { list: cands, miss: null };
  // a unit is stricter than a department: first the members of that unit
  if (units.length) {
    const members = cands.filter((p) => units.some((u) => u.members?.includes(p.id)));
    if (members.length) return { list: members, miss: null };
  }
  const fits = (p: Person) =>
    depts.some((d) => p.department.toUpperCase() === d.staffDepartment.toUpperCase() || sitsInDept(p, d) || (p.discipline ?? "").toLowerCase() === d.name.toLowerCase()) ||
    extra.includes(p.department.toUpperCase()) || units.some((u) => u.members?.includes(p.id));
  const kept = cands.filter(fits);
  if (kept.length) return { list: kept, miss: null };
  return { list: cands, miss: joinAnd([...depts.map((d) => d.name), ...extra.map((x) => nice(x.toLowerCase()))]) };
}

interface Entities {
  n: string;
  hasOpd: boolean;
  depts: Department[];
  /** An OPD number is a ROOM; a unit is a group of doctors with exclusive days (departments of kind units). */
  unitRefs: { label: string; unit?: Unit; dept?: Department; roomKey?: string; rooms?: { dept: Department; unit: Unit }[]; notRecorded?: boolean }[];
  weekdays: Weekday[];
  dateRef: DateRef | null;
  doctors: Person[];
  /** A department or unit named in the question that none of the doctors with that name belongs to ("karmakar of surgery"): the department's name, else null. */
  hintMiss: string | null;
  /** The words of the question that are neither a department, a date nor a question word: the name the person typed, if any. */
  leftover: string[];
}

const ALIASES = SCHEDULE.departments.flatMap((d) => d.aliases.map((a) => ({ alias: a, dept: d }))).sort((a, b) => b.alias.length - a.alias.length);
const ALL_UNITS = SCHEDULE.departments.flatMap((d) => d.units.map((u) => ({ dept: d, unit: u })));
/** Every OPD room key ("24", "14B", "KANISHKA") with the units that use it: in a department of kind rooms the unit IS the room; in kind units the rooms are in the slots of the units. */
const ROOM_INDEX = new Map<string, { dept: Department; unit: Unit }[]>();
for (const { dept, unit } of ALL_UNITS) {
  const keys = new Set<string>();
  if (unit.opdNo) keys.add(unit.opdNo.toUpperCase());
  for (const s of Object.values(unit.week)) for (const r of Object.values(s?.rooms ?? {})) { const m = /(\d+[A-D]?)\s*$/i.exec(r); if (m) keys.add(m[1].toUpperCase()); }
  for (const s of Object.values(unit.week)) for (const m of (s?.note ?? "").matchAll(/OPD (\d+[A-D]?)/gi)) keys.add(m[1].toUpperCase()); // a room named only in a note (Medicine room 26 on Monday: any doctor available)
  for (const k of keys) ROOM_INDEX.set(k, [...(ROOM_INDEX.get(k) ?? []), { dept, unit }]);
}
const ROMAN: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4, v: 5 };
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function entitiesOf(rawQ: string, now: DateTime): Entities {
  // an exact marker added by the question about a doctor: "(ticket 490138)", "(list no. D499964)", "(doctor <id>)": it names the doctor, and is not part of the question
  const marker = MARKER_RE.exec(rawQ);
  const q = marker ? rawQ.replace(marker[0], " ") : rawQ;
  let n = plain(q);
  const depts: Department[] = [];
  const deptWords = new Set<string>();
  for (const { alias, dept } of ALIASES) {
    const re = new RegExp(`(^|[^a-z0-9])(${esc(plain(alias))})(?=[^a-z0-9]|$)`);
    const m = re.exec(n);
    if (m) {
      if (!depts.includes(dept)) depts.push(dept);
      plain(alias).split(" ").forEach((w) => deptWords.add(w));
      n = n.slice(0, m.index + m[1].length) + " ".repeat(m[2].length) + n.slice(m.index + m[1].length + m[2].length);
    }
  }
  const extraDepts: string[] = [];
  const lower = plain(q);
  for (const [w, dept] of HINT_WORDS) if (new RegExp(`\\b${w}\\b`).test(lower)) { if (!extraDepts.includes(dept)) extraDepts.push(dept); w.split(" ").forEach((x) => deptWords.add(x)); }
  n = plain(`${n}`);
  const original = plain(q);
  const hasOpd = /\b(opd|opds|o p d|outpatient|out patient|outdoor)\b/.test(original.replace(/\./g, " "));

  // an OPD number ("opd 25", "opd no 14b", "clinic no 37") or a named unit ("kanishka", "joydeb"); "unit 2" with a department
  const unitRefs: Entities["unitRefs"] = [];
  for (const m of original.matchAll(/\b(opd|clinic)\s*(?:no\.?|number|#)?\s*(\d{1,2})\s?([a-d])?\b/g)) {
    const key = `${m[2]}${(m[3] ?? "").toUpperCase()}`;
    const label = `${m[1] === "clinic" ? "Clinic" : "OPD"} ${key}`;
    const hits = ROOM_INDEX.get(key) ?? [];
    if (!hits.length) unitRefs.push({ label });
    else if (hits.every((h) => h.dept.kind === "rooms")) unitRefs.push({ label, unit: hits[0].unit, dept: hits[0].dept, roomKey: key });
    else unitRefs.push({ label, rooms: hits, roomKey: key });
  }
  for (const x of ALL_UNITS) if (x.unit.opdNo && !/^\d/.test(x.unit.opdNo) && new RegExp(`\\b${x.unit.opdNo.toLowerCase()}\\b`).test(original)) unitRefs.push({ label: x.unit.label, unit: x.unit, dept: x.dept, roomKey: x.unit.opdNo.toUpperCase() });
  const un = /\bunit[\s-]*(?:no\.?|number)?\s*(\d|iii|ii|iv|i|v)\b/.exec(original);
  if (un && depts.length) {
    const no = /^\d$/.test(un[1]) ? +un[1] : ROMAN[un[1]];
    const d0 = depts[0];
    if (d0.kind === "units") { const hit = d0.units.find((u) => u.unitNo === no); unitRefs.push({ label: `${d0.name} unit ${no}`, unit: hit, dept: hit ? d0 : undefined }); }
    else unitRefs.push({ label: `${d0.name} unit ${no}`, dept: d0, notRecorded: true });
  }

  const dateRef = parseDateRef(q, now);
  const words = tokenize(n).filter((w) => !deptWords.has(w));
  // initials before a surname ("dr a mukherjee", "doctor a k sahay"): single letters that are part of the name, not the article "a"
  const initials = new Set<string>();
  for (const m of original.matchAll(/\b(?:dr|doctor)\s+((?:[a-z]\s+)+)(?=[a-z]{3})/g)) m[1].split(/\s+/).filter(Boolean).forEach((x) => initials.add(x));
  const exact = marker ? exactDoctor(marker[1], marker[2]) : undefined;
  const found = exact ? [exact] : findDoctors(words, initials);
  const narrowed = exact ? { list: found, miss: null as string | null } : narrowDoctors(found, depts, extraDepts, unitRefs.flatMap((r) => (r.unit && r.dept && r.dept.kind === "units" ? [r.unit] : [])));
  return { n: original, hasOpd, depts, unitRefs, weekdays: weekdaysIn(q), dateRef, doctors: narrowed.list, hintMiss: narrowed.miss, leftover: words.filter((w) => !STOP.has(w) && !/^\d+$/.test(w)) };
}

// ---------------------------------------------------------------- answers
/** The OPD hours and the card registration (token) hours by the clock, as short points (shown in red under an answer about the OPD). */
const timingNotes = () => [`OPD hours: ${ranges(SCHEDULE.timings.opd)}`, `Card registration (token) hours: ${ranges(SCHEDULE.timings.token)}`, ...(SCHEDULE.timings.afternoonNote ? [SCHEDULE.timings.afternoonNote] : [])];
/** The small green / red / amber badge beside the title of an answer about a date. */
const badgeOf = (tone: "open" | "closed" | "unknown" | "info" | undefined): HospitalAnswer["badge"] =>
  tone === "open" ? { tone: "open", text: "Open" } : tone === "closed" ? { tone: "closed", text: "Closed" } : tone === "unknown" ? { tone: "unknown", text: "Not known" } : undefined;
const dateLabel = (d: DateTime) => d.toFormat("cccc, d LLLL yyyy");
const dayOf = (d: DateTime): Weekday => (["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const)[d.weekday - 1];
/** The FIRST answer is an eye-catching Yes (green) or No (red), then the long text: a verdict that is open starts with "Yes:", one that is closed with "No:". An unknown one stays amber and an information line stays grey. */
const YES_NO = /^(yes|no)\b[:,.]/i;
const withYesNo = (tone: string | undefined, text: string): string => (!text || YES_NO.test(text) ? text : tone === "open" ? `Yes: ${text}` : tone === "closed" ? `No: ${text}` : text);
const done = (summary: string, card: HospitalAnswer): HospitalResult => {
  const st = card.status;
  if (!st || (st.tone !== "open" && st.tone !== "closed")) return { summary, card };
  const text = withYesNo(st.tone, st.text);
  return { summary: summary === st.text ? text : withYesNo(st.tone, summary), card: { ...card, status: { ...st, text } } };
};

const isUnits = (d: Department) => d.kind === "units";
/** The in-charge of a unit as shown in a table or a card: only a doctor who is still there; otherwise "not recorded yet" (the question "who is the in-charge" names the one who has gone). */
const inChargeText = (u: Unit): string => { const id = unitHead(u); const h = id ? PERSON.get(id) : undefined; return h && !isGone(h) ? docLabel(h) : "not recorded yet"; };
/** The units of a department that hold an OPD on a day: in a department of kind units only the unit whose day it is; in kind rooms every OPD room (its cell may say OT day, closed ...). */
const unitsOn = (d: Department, day: Weekday): Unit[] => (isUnits(d) ? d.units.filter((u) => u.week[day]?.doctors?.length) : d.units);
/** The rows of ONE unit (or room) on one day: [room, doctor]; the retired and transferred are left out, a room named only in a note is a row of its own. */
function unitDayItems(u: Unit, day: Weekday): [string, string][] {
  const s = u.week[day] ?? { state: "UNKNOWN" as const };
  const items: [string, string][] = [];
  const where = u.opdNo ? u.label : "—";
  if (s.doctors?.length) {
    const shown = slotShown(s);
    if (shown.length) for (const p of shown) items.push([s.rooms?.[p.id] ?? where, docLabel(p) + (s.note && !/^OPD /i.test(s.note) ? ` (${s.note})` : "")]);
    else items.push([where, NO_CURRENT]);
  } else items.push([where, STATE_TEXT[s.state ?? "UNKNOWN"]]);
  const m = s.note ? /^(OPD \d+[A-D]?):\s*(.*)$/i.exec(s.note) : null; // a room named only in a note: "OPD 26: any doctor who is available"
  if (m) items.push([m[1], m[2].charAt(0).toUpperCase() + m[2].slice(1)]);
  return items;
}
/** The table of ONE day: the room and the doctor, one row per doctor; the department and the unit are written once for their group (only when they help). */
function dayTable(depts: Department[], day: Weekday): { columns: string[]; rows: string[][] } {
  const showDept = depts.length > 1;
  const showUnit = depts.some(isUnits);
  const columns = [...(showDept ? ["Department"] : []), ...(showUnit ? ["Unit"] : []), "Room", "Doctor"];
  const rows: string[][] = [];
  for (const d of depts) for (const u of unitsOn(d, day)) {
    unitDayItems(u, day).forEach(([room, doctor], i, items) => {
      const sameRoomAsAbove = i > 0 && items[i - 1][0] === room;
      rows.push([...(showDept ? [i === 0 ? d.name : ""] : []), ...(showUnit ? [i === 0 ? (isUnits(d) ? u.label : "—") : ""] : []), sameRoomAsAbove ? "" : room, doctor]);
    });
  }
  return { columns, rows };
}
const staffingNotes = (depts: Department[], day: Weekday): string[] => {
  const out: string[] = [];
  for (const d of depts) for (const u of unitsOn(d, day)) {
    const s = u.week[day];
    // all gone: the table already says "No current doctor listed"; only the unconfirmed ones (not on the current doctor list) need a word
    if (s && noCurrentDoctor(s) && slotShown(s).length) out.push(`${d.name} ${u.label}, ${WEEKDAY_NAME[day]}: not on the current doctor list (please confirm).`);
  }
  return out;
};
/** For a question about a date: the day, the closure of that day, and (only for "today") the time of day. */
async function dateGate(e: Entities, ctx: EngineCtx): Promise<{ date: DateTime; day: Weekday; label: string; was: boolean; c: Closure; ts: TimeState | null } | null> {
  const focus = weekdayFocus(e);
  if (!focus || !focus.date || focus.date.kind === "invalid") return null;
  const date = focus.date.date;
  const today = ctx.now.startOf("day");
  const c = await opdClosure(date, ctx.holidaysOn);
  return { date, day: focus.day, label: dateLabel(date), was: date < today, c, ts: timeApplies(focus.date, date, today) ? timeState(ctx.now) : null };
}

async function closureAnswer(e: Entities, ctx: EngineCtx): Promise<HospitalResult> {
  const today = ctx.now.startOf("day");
  const ref = e.dateRef && e.dateRef.kind !== "invalid" ? e.dateRef : null;
  const date = ref ? ref.date : today;
  const past = date < today;
  const isWas = past ? "was" : "is";
  const label = dateLabel(date);
  const c = await opdClosure(date, ctx.holidaysOn);
  const day = dayOf(date);
  const ts = timeApplies(ref, date, today) ? timeState(ctx.now) : null;
  const notes: string[] = [];
  if (!c.yearLoaded) notes.push(`Holiday data for ${date.year} is not loaded, so only Sundays and the fixed-date closures were checked.`);
  let status: NonNullable<HospitalAnswer["status"]>;
  const lines: string[] = [];
  let suggestion = c.state === "closed" ? URGENT : c.state === "unknown" ? URGENT_SOFT : undefined;
  if (c.state === "closed") status = { tone: "closed", text: `The OPD ${isWas} closed on ${label}: ${joinAnd(c.reasons)}.` };
  else {
    status = c.state === "unknown"
      ? { tone: "unknown", text: `The plant has a holiday on ${label}: ${joinAnd(c.unknown.map((h) => h.name))}. Whether the OPD ${isWas} closed that day is not in my list yet.` }
      : { tone: "open", text: `The OPD ${isWas} open on ${label} (regular Monday to Saturday schedule).` };
    if (ts && ts.state === "open") {
      status = { ...status, text: `${status.text} It is in session now, until ${ts.closesAt}.` };
      if (ts.tokenClosed && ts.tokenEnd) lines.push(`Token issue for this session closed at ${ts.tokenEnd}.`);
    } else if (ts) {
      status = { tone: "closed", text: closedNowText(ts, ctx.now) };
      suggestion = URGENT; // out of visiting time: the Emergency Department
    }
  }
  let table: HospitalAnswer["table"];
  if (c.state !== "closed" && e.depts.length && day !== "SUN") {
    table = dayTable(e.depts, day);
    notes.push(...staffingNotes(e.depts, day));
    // the OPD is open but the department's own units are not sitting that day: the unit rule, general OPD, Emergency
    if (c.state === "open" && !(ts && ts.state !== "open") && allNoOpd(e.depts.flatMap((d) => d.units), [day])) suggestion = noUnitSuggestion(day, false);
  }
  if (c.state !== "closed") notes.push(...timingNotes());
  return done(status.text, { title: `OPD on ${label}`, badge: badgeOf(status.tone), status, lines, suggestion, table, notes });
}

function closureRulesAnswer(): HospitalResult {
  const r = SCHEDULE.closure;
  const fixed = r.fixed.map((f) => `${f.day} ${["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][f.month]}: ${f.name}`);
  const card: HospitalAnswer = {
    title: "When the OPD is closed",
    status: { tone: "info", text: "The OPD is closed on Sundays, on the holidays below and on the puja holidays." },
    lines: ["Every Sunday", ...fixed, "The puja holidays (for example the Durga Puja days): the dates come from the plant's holiday list of the year"],
    suggestion: URGENT,
  };
  return done(card.status?.text ?? card.title, card);
}

function timingsAnswer(): HospitalResult {
  const opd = `OPD hours: ${ranges(SCHEDULE.timings.opd)}`;
  const token = `Card registration (token) hours: ${ranges(SCHEDULE.timings.token)}`;
  const card: HospitalAnswer = { title: "OPD and card registration timings", status: { tone: "info", text: opd }, lines: [token, ...(SCHEDULE.timings.afternoonNote ? [SCHEDULE.timings.afternoonNote] : []), "Closed on Sundays and on holidays"] };
  return done(`${opd}; ${token}`, card);
}

function weekdayFocus(e: Entities): { day: Weekday; date: DateRef | null } | null {
  if (e.dateRef && e.dateRef.kind !== "invalid") return { day: dayOf(e.dateRef.date), date: e.dateRef };
  return null;
}

async function deptDateAnswer(e: Entities, ctx: EngineCtx): Promise<HospitalResult> {
  // two weekdays named ("monday and thursday"): no single date; one weekday or a date: that day, with its closure
  const focus = e.weekdays.length > 1 ? null : weekdayFocus(e);
  const days: Weekday[] = focus ? [focus.day] : e.weekdays;
  const notes: string[] = [];
  const lines: string[] = [];
  const today = ctx.now.startOf("day");
  const names = joinAnd(e.depts.map((d) => d.name));
  let status: HospitalAnswer["status"];
  let ts: TimeState | null = null;
  const dr = focus?.date && focus.date.kind !== "invalid" ? focus.date : null;
  if (dr) {
    const c = await opdClosure(dr.date, ctx.holidaysOn);
    if (c.state === "closed") {
      const text = `The OPD ${dr.date < today ? "was" : "is"} closed on ${dateLabel(dr.date)}: ${joinAnd(c.reasons)}.`;
      return done(text, { title: `${names} OPD, ${dateLabel(dr.date)}`, badge: badgeOf("closed"), status: { tone: "closed", text }, suggestion: URGENT });
    }
    if (c.state === "unknown") status = { tone: "unknown", text: `The plant has a holiday on ${dateLabel(dr.date)}: ${joinAnd(c.unknown.map((h) => h.name))}. Whether the OPD is closed is not in my list yet; the usual schedule for the day is below.` };
    if (timeApplies(dr, dr.date, today)) ts = timeState(ctx.now);
  }
  if (days.includes("SUN") && days.length === 1) {
    const text = "The OPD is closed on Sundays.";
    return done(text, { title: `${names} OPD, Sunday`, badge: badgeOf("closed"), status: { tone: "closed", text }, suggestion: URGENT });
  }
  const opdDays = days.filter((d) => d !== "SUN");
  const title = `${names} OPD, ${dr ? dateLabel(dr.date) : joinAnd(opdDays.map((d) => WEEKDAY_NAME[d]))}`;
  let table: HospitalAnswer["table"];
  if (opdDays.length === 1) {
    table = dayTable(e.depts, opdDays[0]);
    for (const d of e.depts) {
      if (!isUnits(d)) continue;
      const others = d.units.filter((u) => !unitsOn(d, opdDays[0]).includes(u));
      if (others.length) lines.push(`Not sitting on ${WEEKDAY_NAME[opdDays[0]]}: ${others.map((u) => `${u.label} (${joinAnd((u.days ?? []).map((x) => WEEKDAY_NAME[x]))})`).join(", ")}`);
      lines.push(UNIT_RULE);
    }
  } else {
    const rows: string[][] = [];
    for (const d of e.depts) {
      const sitting = isUnits(d) ? d.units.filter((u) => opdDays.some((day) => u.week[day]?.doctors?.length)) : d.units;
      for (const u of sitting) rows.push([d.name, u.label, ...opdDays.map((day) => { const sl = u.week[day] ?? { state: "UNKNOWN" as const }; return sl.state === "UNIT_OFF" ? "—" : slotText(sl); })]);
    }
    table = { columns: ["Department", "Unit / OPD", ...opdDays.map((d) => WEEKDAY_NAME[d])], rows };
  }
  for (const day of opdDays) notes.push(...staffingNotes(e.depts, day));
  const units = e.depts.flatMap((d) => d.units);
  let suggestion: string | undefined;
  let tone: "open" | "closed" | "unknown" | undefined = dr ? "open" : undefined;
  if (ts && ts.state !== "open") { status = { tone: "closed", text: closedNowText(ts, ctx.now) }; suggestion = URGENT; tone = "closed"; } // out of visiting time
  else if (allNoOpd(units, opdDays)) { suggestion = noUnitSuggestion(opdDays.length === 1 ? opdDays[0] : null, false); tone = dr ? "closed" : undefined; } // the units are not sitting
  else if (status?.tone === "unknown") { suggestion = URGENT_SOFT; tone = "unknown"; }
  if (tone !== "closed" || !allNoOpd(units, opdDays)) notes.push(...timingNotes());
  const first = (table?.rows[0] ?? []).filter(Boolean).join(" ");
  return done(`${title}: ${first}`, { title, badge: badgeOf(tone), status, lines, suggestion, table, notes });
}

function overviewAnswer(depts: Department[]): HospitalResult {
  const lines: string[] = [];
  const notes: string[] = [];
  const grid: string[][] = [];
  const unitRows: string[][] = [];
  const roomDepts = depts.filter((d) => !isUnits(d));
  for (const d of depts) {
    if (isUnits(d)) {
      for (const u of d.units) {
        const days = u.days ?? [];
        const first = days.map((x) => u.week[x]).find((s) => s?.doctors?.length);
        unitRows.push([depts.length > 1 ? `${d.name} ${u.label}` : u.label, joinAnd(days.map((x) => WEEKDAY_NAME[x])), first ? slotText({ doctors: first.doctors, rooms: first.rooms }) : "—", inChargeText(u)]);
      }
      lines.push(`${d.name} has ${d.units.length} units; each has its own OPD days`, UNIT_RULE);
      for (const day of OPD_DAYS) notes.push(...staffingNotes([d], day));
    } else {
      for (const u of d.units) grid.push([depts.length > 1 ? `${d.name} ${u.label}` : u.label, ...OPD_DAYS.map((day) => slotText(u.week[day] ?? { state: "UNKNOWN" }, true))]);
      lines.push(`${d.name}: the OPD rooms and the days of each doctor are known, but the units of this department are not recorded yet, so no unit head or HOD can be named.`);
      for (const day of OPD_DAYS) notes.push(...staffingNotes([d], day));
    }
  }
  const showUnits = unitRows.length > 0;
  if (showUnits && roomDepts.length) lines.push(`For ${joinAnd(roomDepts.map((d) => d.name))}, ask separately for its OPD days.`);
  const title = `${joinAnd(depts.map((x) => x.name))} OPD at a glance`;
  const table = showUnits ? { columns: ["Unit", "OPD days", "Doctors (room)", "In-charge"], rows: unitRows } : { columns: ["OPD", ...OPD_DAYS.map((d) => WEEKDAY_NAME[d].slice(0, 3))], rows: grid };
  const suggestion = !showUnits && allNoOpd(depts.flatMap((d) => d.units), OPD_DAYS) ? noUnitSuggestion(null, false) : undefined;
  return done(title, { title, lines, suggestion, table, notes: [...new Set([...notes, ...timingNotes()])] });
}

function opdListAnswer(): HospitalResult {
  const rows = SCHEDULE.departments.map((d) => [d.name, d.units.map((u) => u.label).join(", ")]);
  const card: HospitalAnswer = { title: "OPD departments and OPD numbers", table: { columns: ["Department", "OPD / clinic"], rows }, lines: ["Ask for one department, for example \"orthopaedics OPD\", for its days and doctors."], notes: timingNotes() };
  return done(card.title, card);
}

async function unitAnswer(refs: Entities["unitRefs"], e: Entities, ctx: EngineCtx): Promise<HospitalResult> {
  const ref = refs[0];
  if (ref.notRecorded && ref.dept) {
    const text = `The units of ${ref.dept.name} are not recorded yet; I only have its OPD rooms: ${ref.dept.units.map((u) => u.label).join(", ")}.`;
    return done(text, { title: ref.label, status: { tone: "unknown", text } });
  }
  if (ref.rooms) return roomAnswer(ref.label, ref.roomKey ?? "", ref.rooms, e.weekdays.filter((x) => x !== "SUN"));
  if (!ref.unit || !ref.dept) {
    const rooms = (d: Department) => [...new Set([...ROOM_INDEX].filter(([, v]) => v.some((x) => x.dept === d)).map(([k]) => k))].join(", ");
    const known = SCHEDULE.departments.map((d) => (isUnits(d) ? `${d.name} ${d.units.map((u) => u.label).join(", ")} (OPD rooms ${rooms(d)})` : `${d.name} ${d.units.map((u) => u.label).join(", ")}`)).join("; ");
    const text = `${ref.label} is not in the OPD schedule I have.`;
    return done(text, { title: ref.label, status: { tone: "unknown", text }, lines: [`The OPDs and units I have: ${known}.`] });
  }
  const { unit: u, dept: d } = ref as { unit: Unit; dept: Department };
  return isUnits(d) ? unitDetailAnswer(d, u, e, ctx) : roomUnitAnswer(d, u, e);
}

/** A unit of a department of kind units: its doctors, its exclusive days, its in-charge; and, when a day or date is asked, whether it sits then. */
async function unitDetailAnswer(d: Department, u: Unit, e: Entities, ctx: EngineCtx): Promise<HospitalResult> {
  const days = u.days ?? [];
  const lines = [`${d.name} ${u.label} sits on ${joinAnd(days.map((x) => WEEKDAY_NAME[x]))}; on the other days of the week it has no OPD.`];
  lines.push(`In-charge: ${inChargeText(u)}`);
  lines.push(UNIT_RULE);
  const notes: string[] = [];
  const first = days.map((x) => u.week[x]).find((s) => s?.doctors?.length);
  const members = (u.members ?? []).map((id) => PERSON.get(id)).filter((p): p is Person => !!p && !isGone(p));
  const rows = members.map((p, i) => { const room = first?.rooms?.[p.id] ?? "—"; const prev = i > 0 ? first?.rooms?.[members[i - 1].id] : undefined; return [room === prev ? "" : room, docLabel(p)]; });
  let status: HospitalAnswer["status"];
  let suggestion: string | undefined;
  const g = await dateGate(e, ctx);
  if (g) {
    const verb = g.was ? "was" : "is";
    if (g.c.state === "closed") { status = { tone: "closed", text: `The OPD ${verb} closed on ${g.label}: ${joinAnd(g.c.reasons)}.` }; suggestion = URGENT; }
    else if (days.includes(g.day)) {
      const s = u.week[g.day];
      status = { tone: g.c.state === "unknown" ? "unknown" : "open", text: `${d.name} ${u.label} ${g.was ? "sat" : "sits"} on ${g.label}: ${s ? slotText(s) : ""}.${g.c.state === "unknown" ? ` The plant has a holiday that day (${joinAnd(g.c.unknown.map((h) => h.name))}); whether the OPD is closed is not in my list yet.` : ""}` };
      if (g.c.state === "unknown") suggestion = URGENT_SOFT;
      if (g.ts && g.ts.state !== "open") { status = { tone: "closed", text: closedNowText(g.ts, ctx.now) }; suggestion = URGENT; }
    } else {
      status = { tone: "closed", text: `${d.name} ${u.label} does not sit on ${g.label}; it sits on ${joinAnd(days.map((x) => WEEKDAY_NAME[x]))}.` };
      suggestion = noUnitSuggestion(g.day, false);
    }
  }
  for (const day of days) notes.push(...staffingNotes([{ ...d, units: [u] }], day));
  if (!status || status.tone !== "closed") notes.push(...timingNotes());
  const title = `${d.name} ${u.label}`;
  return done(status?.text ?? lines[0], { title, badge: g ? badgeOf(status?.tone) : undefined, status, lines, suggestion, table: { columns: ["Room", "Doctor"], rows }, notes: [...new Set(notes)] });
}

/** A unit of a department of kind rooms: the unit IS the OPD room, with the doctor or the state of every day. */
function roomUnitAnswer(d: Department, u: Unit, e: Entities): HospitalResult {
  const focusDays = e.weekdays.filter((x) => x !== "SUN");
  const days = focusDays.length ? focusDays : OPD_DAYS;
  const lines = [`The units of ${d.name} are not recorded yet, so no unit head can be named`];
  const notes: string[] = e.weekdays.includes("SUN") ? ["The OPD is closed on Sundays."] : [];
  for (const day of days) notes.push(...staffingNotes([{ ...d, units: [u] }], day));
  const noOpd = allNoOpd([u], days);
  if (!noOpd) notes.push(...timingNotes());
  const title = `${d.name} ${u.label}`;
  return done(`${title}: ${days.map((day) => `${WEEKDAY_NAME[day]} ${slotText(u.week[day] ?? { state: "UNKNOWN" })}`).join("; ")}`, {
    title, lines, suggestion: noOpd ? noUnitSuggestion(days.length === 1 ? days[0] : null, false) : undefined,
    table: { columns: ["Day", "Doctors"], rows: days.map((day) => [WEEKDAY_NAME[day], slotText(u.week[day] ?? { state: "UNKNOWN" })]) }, notes: [...new Set(notes)],
  });
}

/** An OPD number that is a ROOM used by the units of a department on different days (Medicine rooms 24, 25, 26): who sits in it each day, from which unit. */
function roomAnswer(label: string, key: string, hits: { dept: Department; unit: Unit }[], onlyDays: Weekday[]): HospitalResult {
  const rows: string[][] = [];
  const notes: string[] = [];
  for (const day of onlyDays.length ? onlyDays : OPD_DAYS) {
    let any = false;
    for (const { dept, unit } of hits) {
      const s = unit.week[day];
      if (!s?.doctors?.length) continue;
      const here = s.doctors.filter((id) => new RegExp(`\\b${key}$`, "i").test(s.rooms?.[id] ?? ""));
      if (here.length) { rows.push([WEEKDAY_NAME[day], `${dept.name} ${unit.label}`, slotText({ doctors: here })]); any = true; }
      const m = s.note ? new RegExp(`^OPD ${key}\\b:\\s*(.*)$`, "i").exec(s.note) : null; // a room named only in a note
      if (m) { rows.push([WEEKDAY_NAME[day], `${dept.name} ${unit.label}`, m[1].charAt(0).toUpperCase() + m[1].slice(1)]); any = true; }
    }
    if (!any) rows.push([WEEKDAY_NAME[day], "—", "—"]);
  }
  for (const { dept } of hits) { for (const day of OPD_DAYS) notes.push(...staffingNotes([dept], day)); }
  const d0 = hits[0].dept;
  return done(`${label} of ${d0.name}`, {
    title: `${d0.name} ${label}`,
    lines: [`${label} is a room of ${d0.name}`, "On each day the unit whose day it is uses it; the units sit on exclusive days"],
    table: { columns: ["Day", "Unit", "Doctor in this room"], rows }, notes: [...new Set([...notes, ...timingNotes()])],
  });
}

function headAnswer(e: Entities): HospitalResult {
  const ref = e.unitRefs.find((r) => r.unit || r.rooms || r.notRecorded);
  const notes: string[] = [];
  const inCharge = (d: Department, u: Unit) => {
    const h = unitHead(u) ? PERSON.get(unitHead(u) as string) : undefined;
    return h ? { h, text: `${u.label}: ${docLabel(h)}${u.head ? "" : " (the first-named doctor)"}` } : { h: undefined, text: `${u.label}: not recorded` };
  };
  const flagged = (h?: Person) => { if (h && !isCurrent(h)) notes.unshift(`${docName(h)} ${statusPhrase(h)}: the current in-charge of that unit is not in my data.`); };
  if (ref?.unit && ref.dept && isUnits(ref.dept)) {
    const { h, text } = inCharge(ref.dept, ref.unit);
    flagged(h);
    const t = h ? `The in-charge of ${ref.dept.name} ${ref.unit.label} is ${docLabel(h)}${ref.unit.head ? "" : " (the first-named doctor)"}.` : `The in-charge of ${ref.dept.name} ${ref.unit.label} is not recorded.`;
    return done(t, { title: `In-charge of ${ref.dept.name} ${ref.unit.label}`, status: { tone: "info", text: t }, lines: [text], notes });
  }
  if (ref?.rooms) {
    const d0 = ref.rooms[0].dept;
    const parts = d0.units.map((u) => inCharge(d0, u));
    parts.forEach((p) => flagged(p.h));
    const t = `${ref.label} is a room of ${d0.name} used by its units on different days, so it has no head of its own. The in-charge of each unit: ${parts.map((p) => p.text).join("; ")}.`;
    return done(t, { title: `Heads of ${d0.name}`, status: { tone: "info", text: t }, notes });
  }
  const d = ref?.dept ?? e.depts[0] ?? (ref?.unit ? ALL_UNITS.find((x) => x.unit === ref.unit)?.dept : undefined);
  if (!d) return opdListAnswer();
  if (!isUnits(d)) {
    const t = `The HOD of ${d.name} is not recorded yet, and neither are its units: I only have its OPD rooms (${d.units.map((u) => u.label).join(", ")}).`;
    return done(t, { title: `HOD and units of ${d.name}`, status: { tone: "unknown", text: t }, notes });
  }
  const hod = d.hod ? PERSON.get(d.hod) : undefined;
  const parts = d.units.map((u) => inCharge(d, u));
  parts.forEach((p) => flagged(p.h));
  const status: NonNullable<HospitalAnswer["status"]> = hod ? { tone: "info", text: `The HOD of ${d.name} is ${docLabel(hod)}.` } : { tone: "unknown", text: `The HOD of ${d.name} is not recorded yet.` };
  const lines = ["The HOD is one of the unit in-charges (the first-named doctor of a unit)", ...parts.map((p) => p.text)];
  return done(status.text, { title: `HOD and unit heads of ${d.name}`, status, lines, notes: [...new Set(notes)] });
}

const npOf = (p: Person) => nonPermanentOf(p.id) ?? NON_PERMANENT_DOCTORS.find((x) => `np-${x.listId.toLowerCase()}` === p.id);
const npLine = (who: string, p: Person) => {
  const np = npOf(p);
  if (!np) return p.employment === "contractual" ? `${who} is a contractual doctor.` : null;
  return `${who} is a non-permanent (contractual) doctor on the intranet doctor list (number ${np.listId}). Specialization: ${np.specialization ?? "not recorded yet"}.`;
};

const daysText = (ds: Weekday[]) => (ds.length === OPD_DAYS.length ? "Monday to Saturday" : joinAnd(ds.map((x) => WEEKDAY_NAME[x])));
/** "on Monday and Thursday", but "from Monday to Saturday" for all six days. */
const onDays = (ds: Weekday[]) => (ds.length === OPD_DAYS.length ? "from Monday to Saturday" : `on ${joinAnd(ds.map((x) => WEEKDAY_NAME[x]))}`);
/** [room, doctor] rows with the room written once for its group. */
const groupRooms = (items: [string, string][]): string[][] => items.map(([room, doc], i) => [i > 0 && items[i - 1][0] === room ? "" : room, doc]);

/** The table of the doctor's unit: its current doctors with their rooms (a department of units), or the doctors of the room, with their days when these differ (a department of rooms). */
function unitTable(dept: Department, unit: Unit, days: Weekday[]): HospitalTable & { caption: string } {
  const caption = `${dept.name} ${unit.label}: ${daysText(days)}`;
  const items: [string, string][] = [];
  if (isUnits(dept)) {
    const first = unit.week[days[0]];
    for (const id of unit.members ?? []) { const x = PERSON.get(id); if (x && !isGone(x)) items.push([first?.rooms?.[x.id] ?? "—", docLabel(x)]); }
  } else {
    const m = new Map<string, Weekday[]>();
    for (const day of OPD_DAYS) for (const id of unit.week[day]?.doctors ?? []) m.set(id, [...(m.get(id) ?? []), day]);
    for (const [id, ds] of m) {
      const x = PERSON.get(id);
      if (!x || isGone(x)) continue;
      const same = ds.join() === days.join();
      const fl = flag(x).replace(/^ \(|\)$/g, ""); // "not on the current doctor list" or ""
      items.push([unit.label, same ? docLabel(x) : `${docName(x)} (${daysText(ds)}${fl ? `; ${fl}` : ""})`]);
    }
  }
  return { caption, columns: ["Room", "Doctor"], rows: groupRooms(items) };
}

async function doctorAnswer(p: Person, e: Entities, ctx: EngineCtx): Promise<HospitalResult> {
  const perUnit: { dept: Department; unit: Unit; days: Weekday[] }[] = [];
  for (const d of SCHEDULE.departments) for (const u of d.units) {
    const days = OPD_DAYS.filter((day) => u.week[day]?.doctors?.includes(p.id));
    if (days.length) perUnit.push({ dept: d, unit: u, days });
  }
  const notes: string[] = [];
  const lines: string[] = [];
  const who = docName(p);
  if (p.status === "retired" || p.status === "transferred") notes.push(`${who} has ${p.status === "retired" ? "retired" : "been transferred"}: he or she no longer sits in the OPD, whatever the old list shows.`);
  else if (p.status === "not_on_list") notes.push(`${who} is not on the current doctor list (he or she may have retired or moved): please confirm that he or she still sits.`);
  const npText = npLine(who, p);
  if (npText) lines.push(npText);

  if (!perUnit.length) {
    const np = npOf(p);
    const text = np && !np.staffId
      ? `${who} is on the intranet doctor list as a non-permanent doctor (${np.listId}); the department, the specialization and the OPD days are not recorded yet.`
      : `${who} (${deptLabel(p.department)}) is not in the OPD schedule I have.`;
    return done(text, { title: `${who}: OPD days`, status: { tone: "unknown", text }, lines, notes });
  }
  for (const { dept, unit, days } of perUnit) {
    const room = unit.week[days[0]]?.rooms?.[p.id];
    lines.push(`${who} sits in ${dept.name} ${unit.label}${room ? ` (${room})` : ""} ${onDays(days)}.`);
  }
  let status: HospitalAnswer["status"];
  let suggestion: string | undefined;
  const g = await dateGate(e, ctx);
  const here = g ? perUnit.filter((x) => x.days.includes(g.day)) : [];
  let tables: { title: string; table: HospitalTable }[] = [];
  if (g) {
    const isWas = g.was ? "was" : "is";
    if (g.c.state === "closed") { status = { tone: "closed", text: `The OPD ${isWas} closed on ${g.label}: ${joinAnd(g.c.reasons)}.` }; suggestion = URGENT; }
    else if (here.length) {
      status = { tone: g.c.state === "unknown" ? "unknown" : "open", text: `Yes: ${who} ${isWas} listed in ${joinAnd(here.map((x) => `${x.dept.name} ${x.unit.label}`))} on ${g.label}.` + (g.c.state === "unknown" ? ` The plant has a holiday that day (${joinAnd(g.c.unknown.map((h) => h.name))}); whether the OPD is closed is not in my list yet.` : "") };
      if (g.c.state === "unknown") suggestion = URGENT_SOFT;
    } else {
      // he does not sit that day: what does HIS UNIT do? (a patient belongs to the unit, not to one doctor)
      const { dept, unit } = perUnit[0];
      const slot = unit.week[g.day];
      const unitName = `${dept.name} ${unit.label}`;
      const others = slot ? slotShown(slot) : [];
      if (slot?.state === "UNIT_OFF") {
        status = { tone: "closed", text: `No: ${who}'s unit (${unitName}) does not sit on ${WEEKDAY_NAME[g.day]}; it sits on ${joinAnd((unit.days ?? []).map((x) => WEEKDAY_NAME[x]))}.` };
        suggestion = noUnitSuggestion(g.day, false);
      } else if (others.length) {
        status = { tone: "closed", text: `No: ${who} is not listed in the OPD on ${WEEKDAY_NAME[g.day]}. ${unitName} is sat by ${joinAnd(others.map(docLabel))} that day, but the units of ${dept.name} are not recorded yet, so I cannot say whether a patient of ${who} may consult them.` };
        suggestion = noUnitSuggestion(g.day, true);
      } else if (slot?.state === "OT_DAY" || slot?.state === "CLOSED") {
        status = { tone: "closed", text: `No: ${who}'s unit (${unitName}) has no OPD on ${WEEKDAY_NAME[g.day]}${slot.state === "OT_DAY" ? " (OT day)" : ""}.` };
        suggestion = noUnitSuggestion(g.day, false);
      } else if (slot?.state === "ANY_AVAILABLE") {
        status = { tone: "closed", text: `No: ${who} is not named for ${WEEKDAY_NAME[g.day]}, but ${unitName} has any doctor who is available that day.` };
      } else if (slot?.state === "PROCEDURE_EMERGENCY") {
        status = { tone: "closed", text: `No: ${who} does not sit on ${WEEKDAY_NAME[g.day]}: ${unitName} sees procedures and emergency cases only that day.` };
        suggestion = URGENT;
      } else {
        status = { tone: "unknown", text: `The schedule does not show ${who}'s unit (${unitName}) on ${WEEKDAY_NAME[g.day]}.` };
        suggestion = noUnitSuggestion(g.day, true);
      }
    }
    // out of visiting time today: whatever the schedule says, the OPD is not in session now
    if (g.ts && g.ts.state !== "open" && g.c.state !== "closed" && (here.length || status?.tone === "open")) {
      status = { tone: "closed", text: `${closedNowText(g.ts, ctx.now)}${here.length ? ` ${who} is listed in ${joinAnd(here.map((x) => `${x.dept.name} ${x.unit.label}`))} today.` : ""}` };
      suggestion = URGENT;
    }
  }
  // the tables: asked on a day he sits: the unit on that day (room, doctor); otherwise his unit and its days, and, when the answer is No, the unit that sits on the asked date
  if (g && here.length && g.c.state !== "closed") tables = here.map(({ dept, unit }) => ({ title: `${dept.name} ${unit.label}, ${g.label}`, table: { columns: ["Room", "Doctor"], rows: groupRooms(unitDayItems(unit, g.day)) } }));
  else {
    tables = perUnit.map(({ dept, unit, days }) => { const t = unitTable(dept, unit, days); return { title: t.caption, table: { columns: t.columns, rows: t.rows } }; });
    if (g && g.c.state !== "closed" && !here.length) {
      const sitting = dayTable([...new Set(perUnit.map((x) => x.dept))], g.day);
      if (sitting.rows.length) tables.push({ title: `Sitting on ${g.label}`, table: sitting });
    }
  }
  if (!status || status.tone !== "closed") notes.push(...timingNotes());
  const summary = status?.text ?? lines[0];
  return done(summary, { title: `${who}: OPD days`, badge: g ? badgeOf(status?.tone) : undefined, status, lines, suggestion, extraTables: tables, notes });
}

/** Is this doctor permanent or contractual? From the staff data and the file of non-permanent doctors. */
function employmentAnswer(p: Person): HospitalResult {
  const who = docName(p);
  const np = npOf(p);
  const notes: string[] = [];
  let text: string;
  let tone: "info" | "unknown" = "info";
  if (np) text = npLine(who, p) ?? "";
  else if (p.employment === "permanent") text = `${who} is a permanent DSP employee.`;
  else if (p.status === "retired") text = `${who} has retired.`;
  else if (p.status === "transferred") text = `${who} has been transferred out of the hospital.`;
  else { text = `I do not know whether ${who} is permanent or contractual: he or she is not on the intranet doctor list under any number.`; tone = "unknown"; }
  if (p.status === "not_on_list") notes.push("A permanent doctor has a plain ticket number on the intranet doctor list and a non-permanent one a number that starts with letters (D or DTN).");
  return done(text, { title: `${who}: permanent or contractual?`, status: { tone, text }, notes });
}

const dept0 = (p: { department: string | null }) => (p.department ?? "").toUpperCase();
/** The non-permanent doctors (all, or of the departments named), from the separate file; the specialization shows "not recorded yet" until it is collected. */
function nonPermanentListAnswer(e: Entities): HospitalResult {
  let list = NON_PERMANENT_DOCTORS.slice();
  if (e.depts.length) list = list.filter((x) => e.depts.some((d) => dept0(x) === d.staffDepartment.toUpperCase()));
  list.sort((a, b) => (a.department ? 0 : 1) - (b.department ? 0 : 1) || dept0(a).localeCompare(dept0(b)) || a.name.localeCompare(b.name));
  const withDept = NON_PERMANENT_DOCTORS.filter((x) => x.department).length;
  const withSpec = NON_PERMANENT_DOCTORS.filter((x) => x.specialization).length;
  const where = e.depts.length ? ` in ${joinAnd(e.depts.map((d) => d.name))}` : "";
  const text = list.length
    ? `The intranet doctor list has ${list.length} non-permanent (contractual or temporary) doctor${list.length === 1 ? "" : "s"}${where}${e.depts.length ? ` (${NON_PERMANENT_DOCTORS.length} in all)` : ""}.`
    : `No non-permanent doctor${where} is recorded yet; the department of most of them is not known yet (${NON_PERMANENT_DOCTORS.length} in all).`;
  const notes = [
    `The department is known for ${withDept} of the ${NON_PERMANENT_DOCTORS.length} and the specialization for ${withSpec}; the rest are added as they are collected ("not recorded yet").`,
    "A non-permanent doctor's number on the intranet doctor list starts with letters (D or DTN); a permanent doctor has a plain ticket number.",
  ];
  return done(text, {
    title: "Non-permanent doctors", status: { tone: list.length ? "info" : "unknown", text },
    table: list.length ? { columns: ["Doctor", "Department", "Specialization", "List number"], rows: list.map((x) => [`Dr. ${nice(x.name)}`, x.department ?? "not recorded yet", x.specialization ?? "not recorded yet", x.listId]) } : undefined,
    notes,
  });
}

const unitNameOf = (p: Person): string | null => {
  for (const d of SCHEDULE.departments) if (isUnits(d)) for (const u of d.units) if (u.members?.includes(p.id)) return `${d.name} ${u.label}`;
  return null;
};
const OPTION_LIMIT = 10;
const reEsc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** The name matches more than one doctor (or none in the department the question names): ASK which, with radio buttons (the department question in mode "one"); the question is kept. */
function askDoctor(e: Entities, q: string): HospitalResult {
  const surname = e.leftover[e.leftover.length - 1] ?? "";
  const lastToken = (p: Person) => tokenize(p.name).slice(-1)[0] ?? "";
  const rank = (p: Person) => (surname && (lastToken(p) === surname || sim(lastToken(p), surname) >= 0.86) ? 0 : 1);
  const sorted = [...e.doctors].sort((a, b) => rank(a) - rank(b) || Number(isGone(a)) - Number(isGone(b)) || a.department.localeCompare(b.department) || a.name.localeCompare(b.name));
  const options: AskOption[] = sorted.slice(0, OPTION_LIMIT).map((p) => {
    const np = npOf(p);
    const bits = [p.discipline ?? np?.specialization ?? (p.department ? deptLabel(p.department) : "department not recorded")];
    const unit = unitNameOf(p);
    if (unit) bits.push(unit);
    if (p.employment === "contractual") bits.push("non-permanent");
    if (isGone(p)) bits.push(p.status === "retired" ? "retired" : "transferred");
    return { id: p.id, label: docName(p), detail: bits.join(" · "), phrase: `${docName(p)} (${markerOf(p)})` };
  });
  const more = sorted.length - options.length;
  const typed = e.leftover.join(" ");
  const title = typed ? nice(typed) : "doctor";
  const message =
    (e.hintMiss
      ? `I found no Dr. ${title} in ${e.hintMiss}. ${sorted.length === 1 ? "This doctor has that name" : "These doctors have that name"}: choose the one you mean, then press Continue.`
      : `More than one doctor is called Dr. ${title}. Choose the one you mean, then press Continue; your question is kept.`) +
    (more > 0 ? ` (Showing ${options.length} of ${sorted.length}: add the first name or the department, for example "of surgery", to narrow it.)` : "");
  const ask: DepartmentAsk = {
    message, word: typed, question: q, options, mode: "one",
    // the typed name (with "dr" and initials before it) is replaced by the chosen doctor and his exact marker; if the words are not found, the marker is added at the end
    pattern: e.leftover.length ? `\\b(?:(?:dr|doctor)\\.?\\s+)?(?:[a-z]\\.?\\s+)*${e.leftover.map(reEsc).join("\\s+")}\\b` : undefined,
    none: { label: "None of these", reply: "Please add the doctor's first name or the department and ask again." },
    alternative: { label: `Search all employees named ${title}`, query: typed || q.replace(/[?.!\s]+$/, "") },
  };
  return { summary: message, card: { title: "Which doctor?" }, ask };
}

// ---------------------------------------------------------------- the front door
const DOCUMENT_WORDS = /\b(mediclaim|reimburs\w*|claim|claims|policy|policies|circular|circulars|referral|empanel\w*|premium|insurance|tender|vacanc\w*|recruit\w*|bill|bills|fee|fees|rate|rates)\b/;
const EMPLOYEE_WORDS = /\b(ticket|mobile|phone|email|e mail|designation|senior|junior|seniority|salary|grade|joined|joining|age|address|contact|executive|executives|employee|employees|how many|count)\b/;
const DAY_WORDS = /\b(days?|sit|sits|sitting|seat|attend|attends|available|availability|schedule|roster|duty|when|consult\w*|timing|timings|opd)\b/;

export async function answerHospital(q: string, ctx: EngineCtx): Promise<HospitalResult | null> {
  // the exact marker of a doctor ("(ticket 490138)") is not part of the question: its word "ticket" must not make it look like a directory question
  const marker = MARKER_RE.exec(q);
  const n = plain(marker ? q.replace(marker[0], " ") : q);
  if (!n || DOCUMENT_WORDS.test(n)) return null;
  const e = entitiesOf(q, ctx.now);

  if (e.dateRef?.kind === "invalid" && (e.hasOpd || e.doctors.length === 1)) {
    const text = `"${e.dateRef.text}" is not a valid date.`;
    return done(text, { title: "Which date?", status: { tone: "unknown", text }, notes: [] });
  }

  // token timings can be asked without the word OPD
  if (/\btoken\s*(timings?|times?|hours?)\b/.test(n) && !e.depts.length && !e.doctors.length) return timingsAnswer();

  // permanent or contractual: one doctor's status, or the list of the non-permanent doctors (from the separate file)
  const nm = n.replace(/-/g, " ");
  const npWords = /\b(contractual|contract|non permanent|temporary|part time|visiting)\b/.test(nm);
  const permWords = /\b(permanent|regular)\b/.test(nm);
  if ((e.doctors.length > 1 || (e.doctors.length === 1 && e.hintMiss)) && (npWords || permWords)) return askDoctor(e, q);
  if (e.doctors.length === 1 && (npWords || permWords)) return employmentAnswer(e.doctors[0]);
  if (npWords && !e.doctors.length && /\b(doctor|doctors|dr|specialist|specialists|consultant|consultants)\b/.test(nm)) return nonPermanentListAnswer(e);

  // head of unit / HOD
  if (/\b(hod|head of|unit head|department head|dept head|in ?charge)\b/.test(n.replace(/-/g, " ")) && (e.depts.length || e.unitRefs.length)) return headAnswer(e);

  // a doctor
  const cue = e.hasOpd || (DAY_WORDS.test(n) && !EMPLOYEE_WORDS.test(n));
  if (e.doctors.length && cue && !(EMPLOYEE_WORDS.test(n) && !e.hasOpd)) {
    if (e.doctors.length > 1 || e.hintMiss) return askDoctor(e, q);
    return doctorAnswer(e.doctors[0], e, ctx);
  }

  // "which days does dr kamla sit": a doctor's name was typed but nobody matches it: say so, do not show something else
  const NOT_A_NAME = new Set(["hospital", "plant", "health", "centre", "centres", "center", "general", "emergency", "clinic", "clinics", "department", "departments", "doctors", "units", "opds", "timing", "timings", "hours", "patients", "patient"]);
  const nameWords = e.leftover.filter((w) => w.length >= 3 && !NOT_A_NAME.has(w));
  if (!e.doctors.length && (/\b(dr|doctor)\b/.test(n) || /\b(days?|schedule|roster)\s+of\s+[a-z]/.test(n)) && /\b(days?|sit|sits|sitting|when|schedule|roster)\b/.test(n) && nameWords.length && !e.depts.length && !e.unitRefs.length) {
    const text = `I could not find a doctor named "${nameWords.join(" ")}" in the hospital lists I have. Check the spelling, or try the surname only.`;
    return done(text, { title: "Which doctor?", status: { tone: "unknown", text } });
  }

  if (!e.hasOpd && !e.unitRefs.length) return null;

  // an OPD number or a unit of a department
  if (e.unitRefs.length) return unitAnswer(e.unitRefs, e, ctx);

  const hasWhen = e.dateRef !== null || e.weekdays.length > 0;
  const closureWords = /\b(open|opens|opened|closed?|closes|closing|running|functioning|functional|working|holiday|holidays|off|closure|closures)\b/.test(n);
  const timingWords = /\b(timing|timings|time|times|hours|starts?|begins?|from what time|what time)\b/.test(n);

  if (e.depts.length && hasWhen && !(closureWords && !e.depts.length)) {
    // "is orthopaedic OPD open on tuesday" and "who is in orthopaedic OPD on tuesday" both show the department's OPD that day
    if (closureWords && e.dateRef && e.dateRef.kind !== "invalid") return closureAnswer(e, ctx);
    return deptDateAnswer(e, ctx);
  }
  if (!e.depts.length && closureWords && !hasWhen) return closureRulesAnswer();
  if (!e.depts.length && (closureWords || e.dateRef || e.weekdays.length)) return closureAnswer(e, ctx);
  if (timingWords && !e.depts.length) return timingsAnswer();
  if (e.depts.length && timingWords) return timingsAnswer();
  if (e.depts.length) return overviewAnswer(e.depts);
  return opdListAnswer();
}
