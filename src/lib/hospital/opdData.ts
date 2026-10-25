// src/lib/hospital/opdData.ts
//
// The hospital data (step 51a), kept in two JSON files so that it can grow without touching code:
//   data/hospital_staff.json  -- the people of the hospital (doctors and other staff), linked to the intranet doctor list and the roster
//   data/opd_schedule.json    -- OPD timings, the closure rules, and for every department its OPD units with the doctor (or state) of every weekday
//
// BOTH FILES COME FROM LISTS THE HOSPITAL GAVE ON 24 OCT 2026 THAT ARE NOT UP TO DATE (retired doctors are still in them): every answer says so.
// To add or correct data later: edit the JSON (a doctor leaves: set "status"; a new unit: add it to its department; a head or an HOD is known: set "head" / "hod").

import staffJson from "./data/hospital_staff.json";
import scheduleJson from "./data/opd_schedule.json";

export type Weekday = "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN";
/** The six OPD days, in the order of the schedule. */
export const OPD_DAYS: Weekday[] = ["MON", "TUE", "WED", "THU", "FRI", "SAT"];
export const WEEKDAY_NAME: Record<Weekday, string> = { MON: "Monday", TUE: "Tuesday", WED: "Wednesday", THU: "Thursday", FRI: "Friday", SAT: "Saturday", SUN: "Sunday" };
/** luxon numbers Monday 1 ... Sunday 7. */
export const WEEKDAY_BY_ISO: Weekday[] = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

export type PersonStatus = "current" | "retired" | "transferred" | "not_on_list" | "unknown";

export interface Person {
  id: string;
  name: string;
  title: string | null;
  department: string;
  qualification: string | null;
  role: "doctor" | "staff";
  printed: string[];
  employment: "permanent" | "contractual" | "unknown";
  ticket: string | null;
  doctorListId: string | null;
  /** The discipline (Medicine, ENT ...) when the qualification states it: shown as a chip on the card and a column in the table (discipline.ts). null = not known. */
  discipline?: string | null;
  status: PersonStatus;
  note: string | null;
}

/** NO_DOCTOR: the room is part of the schedule, but the doctor who was listed for it is no longer on roll and nobody else is listed. */
export type SlotState = "OT_DAY" | "CLOSED" | "ANY_AVAILABLE" | "PROCEDURE_EMERGENCY" | "UNKNOWN" | "UNIT_OFF" | "NO_DOCTOR";
export interface Slot {
  doctors?: string[];
  state?: SlotState;
  note?: string | null;
  /** Where each doctor sits that day (person id -> "OPD 24"). A room is not a unit: in Medicine the three units use rooms 24, 25 and 26 on different days. */
  rooms?: Record<string, string>;
}

export interface Unit {
  id: string;
  label: string;
  /** For a department of kind "rooms" the unit IS an OPD room (the number the schedule shows); for a department of kind "units" it is null and the rooms are in the slots. */
  opdNo: string | null;
  unitNo: number | null;
  /** The doctors of the unit, in the order of the board: the first-named doctor is the head by the usual rule. */
  members?: string[];
  /** The exclusive OPD days of the unit (kind "units" only). */
  days?: Weekday[];
  note?: string | null;
  place?: string | null;
  /** Set only when the head is KNOWN; otherwise the head is the first-named doctor of the unit (the usual rule, see unitHead). */
  head?: string | null;
  week: Partial<Record<Weekday, Slot>>;
}

export interface Department {
  id: string;
  name: string;
  /** "units": the real units of the department are known (a board or the owner said so): each unit has its doctors and exclusive days.
   *  "rooms": only the OPD rooms and the days of each doctor are known (from the OPD schedule PDF); the units are NOT recorded yet, so no unit head is claimed. */
  kind: "units" | "rooms";
  note?: string | null;
  staffDepartment: string;
  aliases: string[];
  /** The HOD's person id when KNOWN; null = not recorded yet. */
  hod: string | null;
  units: Unit[];
}

export interface TimeRange { from: string; to: string }
export interface ClosureRules {
  weekly: Weekday[];
  fixed: { month: number; day: number; name: string }[];
  holidayTypes: string[];
  holidayNameContains: string[];
  note: string;
}
export interface ScheduleFile {
  asOf: string;
  source: string;
  timings: { opd: TimeRange[]; token: TimeRange[]; /** Who the afternoon OPD is for (shown as a red point under an open OPD). */ afternoonNote?: string };
  days: Weekday[];
  closure: ClosureRules;
  /** Where to send a person when the OPD is closed; the wording of the suggestion comes from here. */
  emergency?: { name: string; hours: string; place?: string; phone?: string; note?: string };
  /** The department a patient can use for GENERAL care when his own unit is not sitting (the owner: unit treatment is specialist treatment, general medicine is just general). */
  generalOpd?: { departmentId: string; name: string; note?: string };
  /** The rule that binds a patient to the unit of his first visit. */
  unitRule?: string;
  departments: Department[];
}
export interface StaffFile {
  asOf: string;
  source: string;
  people: Person[];
}

export const STAFF = staffJson as unknown as StaffFile;
export const SCHEDULE = scheduleJson as unknown as ScheduleFile;
export const PERSON = new Map<string, Person>(STAFF.people.map((p) => [p.id, p]));

/** The head of a unit: the person set in the data, else the FIRST-NAMED doctor of the unit (Monday first), which is the usual rule at the hospital. */
export function unitHead(u: Unit): string | null {
  if (u.head) return u.head;
  if (u.members?.length) return u.members[0];
  for (const d of OPD_DAYS) {
    const first = u.week[d]?.doctors?.[0];
    if (first) return first;
  }
  return null;
}

/** Problems in the data files (empty when they are consistent): used by the tests, and worth running after every edit. */
export function validateData(): string[] {
  const out: string[] = [];
  const ids = new Set<string>();
  for (const p of STAFF.people) {
    if (ids.has(p.id)) out.push(`two people share the id ${p.id}`);
    ids.add(p.id);
  }
  const labels = new Set<string>();
  const units = new Set<string>();
  for (const d of SCHEDULE.departments) {
    if (d.hod && !ids.has(d.hod)) out.push(`${d.id}: hod ${d.hod} is not in the staff file`);
    for (const u of d.units) {
      if (units.has(u.id)) out.push(`two units share the id ${u.id}`);
      units.add(u.id);
      const key = u.label.toLowerCase();
      if (labels.has(key)) out.push(`the label ${u.label} is used by two units`);
      labels.add(key);
      if (u.head && !ids.has(u.head)) out.push(`${u.id}: head ${u.head} is not in the staff file`);
      for (const [day, slot] of Object.entries(u.week)) {
        if (!OPD_DAYS.includes(day as Weekday)) out.push(`${u.id}: ${day} is not an OPD day`);
        if (!slot || (!slot.doctors?.length && !slot.state)) out.push(`${u.id} ${day}: the slot has neither doctors nor a state`);
        for (const id of slot?.doctors ?? []) if (!ids.has(id)) out.push(`${u.id} ${day}: ${id} is not in the staff file`);
      }
      for (const day of OPD_DAYS) if (!u.week[day]) out.push(`${u.id}: no entry for ${day} (use state UNKNOWN for a blank cell)`);
      for (const id of u.members ?? []) if (!ids.has(id)) out.push(`${u.id}: member ${id} is not in the staff file`);
      if (d.kind === "units") {
        if (!u.members?.length || !u.days?.length) out.push(`${u.id}: a unit of a department of kind units needs members and days`);
        for (const day of OPD_DAYS) {
          const slot = u.week[day];
          const sits = !!u.days?.includes(day);
          if (sits && !slot?.doctors?.length) out.push(`${u.id} ${day}: a day of the unit has no doctors`);
          if (!sits && slot?.state !== "UNIT_OFF") out.push(`${u.id} ${day}: not a day of the unit, so the state must be UNIT_OFF`);
          for (const id of Object.keys(slot?.rooms ?? {})) if (!slot?.doctors?.includes(id)) out.push(`${u.id} ${day}: room given for ${id}, who does not sit that day`);
        }
      }
    }
  }
  return out;
}
