// Run (from the project root): npx tsx --tsconfig tsconfig.json src/lib/hospital/engine.selftest.ts
// Step 51a: the hospital route. Every question below has an expected answer worked out from the data (the OPD schedule and the staff list of 24 Oct 2026) and from the plant's curated holiday files.
// "Now" is fixed: Sunday, 25 October 2026, 10:00 (the day this was built).

import { readFileSync, existsSync } from "node:fs";
import { DateTime } from "luxon";
import { answerHospital } from "./engine";
import type { HolidaysOn } from "./closure";
import { queryFor } from "../nl2sql/departmentAsk";
import { parseDateRef } from "./dates";
import { NON_PERMANENT_DOCTORS, validateNonPermanent } from "./nonPermanentDoctors";
import { disciplineOfTicket } from "./discipline";
import { OPD_DAYS, PERSON, SCHEDULE, STAFF, unitHead, validateData } from "./opdData";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) pass++;
  else { fail++; console.log(`FAIL ${name} ${extra}`); }
};

const NOW = DateTime.fromISO("2026-10-25T10:00:00", { zone: "Asia/Kolkata" });
const holidaysOn: HolidaysOn = async (iso) => {
  const f = `Holidays/holiday${iso.slice(0, 4)}_enriched.json`;
  if (!existsSync(f)) return { yearLoaded: false, hits: [] };
  const d = JSON.parse(readFileSync(f, "utf8")) as { holidays: { name: string; date: string; type: "CH" | "FH" | "RH"; categories: string | null }[] };
  return { yearLoaded: true, hits: d.holidays.filter((h) => h.date === iso).map((h) => ({ name: h.name, type: h.type, categories: h.categories })) };
};
const ask = (q: string) => answerHospital(q, { now: NOW, holidaysOn });
const all = (r: Awaited<ReturnType<typeof ask>>) => (r ? `${r.summary} ${JSON.stringify(r.card)}`.toLowerCase() : "");
const has = (r: Awaited<ReturnType<typeof ask>>, ...parts: string[]) => parts.every((p) => all(r).includes(p.toLowerCase()));
const tone = (r: Awaited<ReturnType<typeof ask>>) => r?.card.status?.tone;

async function main() {
  // ---- the data files are consistent, and say what the PDFs say
  ok("the data files have no problems", validateData().length === 0, validateData().join("; "));
  ok("13 departments and 25 OPD units", SCHEDULE.departments.length === 13 && SCHEDULE.departments.reduce((n, d) => n + d.units.length, 0) === 25);
  ok("no HOD is recorded yet", SCHEDULE.departments.every((d) => d.hod === null));
  ok("Ranjeet Kumar and Ivy Paul are retired and Dadan Prasad is transferred (told by the owner)", PERSON.get("ranjeet-kumar")?.status === "retired" && PERSON.get("ivy-paul")?.status === "retired" && PERSON.get("dadan-prasad")?.status === "transferred");
  ok("Manish Kumar is permanent with ticket 490196 (the stray D of the doctor list is not kept)", PERSON.get("manish-kumar")?.ticket === "490196" && PERSON.get("manish-kumar")?.employment === "permanent");

  // ---- dates
  const dr = (q: string) => parseDateRef(q, NOW);
  ok("today", dr("opd open today")?.kind === "relative" && (dr("today") as { date: DateTime }).date.toISODate() === "2026-10-25");
  ok("tomorrow is Monday 26 October", (dr("tomorrow") as { date: DateTime }).date.toISODate() === "2026-10-26");
  ok("a weekday is its next occurrence: tuesday = 27 October, sunday = today", (dr("on tuesday") as { date: DateTime }).date.toISODate() === "2026-10-27" && (dr("sunday") as { date: DateTime }).date.toISODate() === "2026-10-25");
  ok("next sunday is a week later", (dr("next sunday") as { date: DateTime }).date.toISODate() === "2026-11-01");
  ok("25 december has no year: this year", (dr("25 december") as { date: DateTime }).date.toISODate() === "2026-12-25");
  ok("25th Dec 2027, 25/12/2027, 2027-12-25, december 25 2027 are all the same day", ["25th Dec 2027", "25/12/2027", "2027-12-25", "december 25 2027"].every((x) => (dr(x) as { date: DateTime }).date.toISODate() === "2027-12-25"));
  ok("31 february is invalid, not guessed", dr("31 february")?.kind === "invalid");

  // ---- is the OPD open?
  let r = await ask("is OPD open today?");
  ok("today is Sunday: closed", tone(r) === "closed" && has(r, "sunday", "closed"), all(r));
  r = await ask("opd open tomorrow");
  ok("tomorrow (Monday 26 October) is open, with the hours", tone(r) === "open" && has(r, "monday, 26 october 2026", "8 am to 1 pm", "5 pm to 7 pm", "4:30 pm to 6:30 pm"), all(r));
  r = await ask("was opd open yesterday");
  ok("yesterday (Saturday 24 October) was open (past tense)", tone(r) === "open" && has(r, "was open", "saturday, 24 october 2026"), all(r));
  r = await ask("opd open on 2 october");
  ok("2 October: closed, Gandhi's birthday", tone(r) === "closed" && has(r, "mahatma gandhi's birthday"), all(r));
  r = await ask("is opd closed on 25 december 2026");
  ok("25 December: closed, once (no duplicate reason)", tone(r) === "closed" && has(r, "christmas day") && !/christmas day.*christmas day/i.test(r?.summary ?? ""), all(r));
  r = await ask("opd open on 24 january 2026");
  ok("24 January: SAIL Foundation Day", tone(r) === "closed" && has(r, "sail foundation day"), all(r));
  for (const [q, name] of [["26 january 2026", "republic day"], ["1 may 2026", "may day"], ["15 august 2026", "independence day"], ["14 april 2026", "ambedkar"]] as const) {
    r = await ask(`is opd open on ${q}`);
    ok(`${q}: closed, ${name}`, tone(r) === "closed" && has(r, name), all(r));
  }
  r = await ask("opd open on 20 october 2026");
  ok("20 October 2026: closed, a puja holiday (Maha Navami)", tone(r) === "closed" && has(r, "maha navami", "puja holiday"), all(r));
  r = await ask("opd on 21 october 2026");
  ok("21 October 2026: closed, Maha Dasami", tone(r) === "closed" && has(r, "maha dasami"), all(r));
  r = await ask("opd open on 11 november 2026");
  ok("11 November 2026 (Bhatridwitiya): a plant holiday not in the OPD list: NOT KNOWN, neither open nor closed", tone(r) === "unknown" && has(r, "bhatridwitiya", "not in my list yet"), all(r));
  r = await ask("opd open on 21 march 2026");
  ok("21 March 2026 (Id-ul-Fitr): not known", tone(r) === "unknown" && has(r, "id-ul-fitr"), all(r));
  r = await ask("opd open on 5 january 2027");
  ok("5 January 2027: open by the rules, and it says the 2027 holiday data is not loaded", tone(r) === "open" && has(r, "holiday data for 2027 is not loaded"), all(r));
  r = await ask("opd open on sunday");
  ok("sunday: closed", tone(r) === "closed" && has(r, "sunday"), all(r));
  r = await ask("opd open on saturday");
  ok("saturday (31 October): open", tone(r) === "open" && has(r, "saturday, 31 october 2026"), all(r));
  r = await ask("opd open on 31 february");
  ok("31 february: said to be invalid", has(r, "not a valid date"), all(r));
  r = await ask("when is opd closed");
  ok("the closure rules are listed", tone(r) === "info" && has(r, "every sunday", "sail foundation day", "puja"), all(r));

  // ---- a doctor

  r = await ask("dr rupak goswami opd days");
  ok("Rupak Goswami: ENT OPD 11, Monday, Tuesday, Thursday and Friday (Wednesday and Saturday are OT days)", has(r, "ent opd 11", "monday, tuesday, thursday and friday") && !has(r, "wednesday and"), all(r));
  r = await ask("when is dr priyank sahoo available");
  ok("a question without the word OPD but about days: Priyank Sahoo, Orthopaedics OPD 22, Tuesday, Wednesday, Friday and Saturday", has(r, "orthopaedics opd 22", "tuesday, wednesday, friday and saturday"), all(r));
  r = await ask("which days does dr ranjeet kumar sit in opd");
  ok("Ranjeet Kumar: the old days are shown but he is marked retired", has(r, "monday and thursday", "retired", "no longer sits"), all(r));
  r = await ask("dr ivy paul opd days");
  ok("Ivy Paul: retired", has(r, "retired", "kanishka"), all(r));
  r = await ask("dr dadan prasad opd days");
  ok("Dadan Prasad: transferred", has(r, "transferred"), all(r));
  r = await ask("which days does dr arghya das sit in opd");
  ok("Arghya Das is the EYE doctor (OPD 14D), not the ENT one", has(r, "eye opd 14d") && !has(r, "ent opd"), all(r));
  r = await ask("opd days of dr arijit das");
  ok("Arijit Das is the ENT doctor (OPD 13)", has(r, "ent opd 13") && !has(r, "eye opd"), all(r));
  r = await ask("is dr sumit mukherjee available today");
  ok("a doctor today (Sunday): closed", tone(r) === "closed" && has(r, "sunday"), all(r));
  r = await ask("is dr sumit mukherjee in opd tomorrow");
  ok("a doctor tomorrow (Monday): yes, Psychiatry OPD 1", tone(r) === "open" && has(r, "yes", "psychiatry opd 1", "monday, 26 october 2026"), all(r));
  r = await ask("is dr rupak goswami in opd on wednesday");
  ok("a doctor on a day he does not sit (Wednesday is an ENT OT day): no", tone(r) === "closed" && has(r, "no:", "ot day"), all(r));
  r = await ask("is dr ajit karmakar available on 20 october 2026");
  ok("a doctor on a puja holiday: the OPD is closed", tone(r) === "closed" && has(r, "maha navami"), all(r));
  r = await ask("which days does dr kamla sit in opd");
  ok("a name nobody has: said so, nothing else shown", has(r, "could not find a doctor named", "kamla") && !has(r, "opd departments"), all(r));
  r = await ask("dr tumpa lahiri opd days");
  ok("Tumpa Lahiri (listed under Stores and Pharmacy in the staff list) sits in Paediatrics OPD 33 on Monday", has(r, "paediatrics opd 33", "monday"), all(r));
  r = await ask("opd days of dr thara gopinath");
  ok("a contractual doctor is said to be contractual (spelling variant Tara / Thara)", has(r, "contractual", "mopd clinic 40"), all(r));

  // ---- a department
  r = await ask("who is in orthopaedics opd on tuesday");
  ok("Orthopaedics on Tuesday: OPD 22 with the four doctors, two of them not on the current list", has(r, "opd 22", "priyank sahoo", "chetan", "p. alam", "not on the current doctor list"), all(r));
  r = await ask("orthopaedic opd monday");
  ok("Orthopaedics on Monday: OT day", has(r, "ot day"), all(r));
  r = await ask("dental opd tuesday");
  ok("Dental on Tuesday: procedures and emergency only", has(r, "procedures and emergency cases only"), all(r));
  r = await ask("eye opd tuesday");
  ok("Eye on Tuesday: OT day for both OPDs", has(r, "opd 14b", "opd 14d", "ot day"), all(r));
  r = await ask("ent opd on wednesday");
  ok("ENT on Wednesday: OT day for OPD 11, 12 and 13", has(r, "opd 11", "opd 13", "ot day"), all(r));
  r = await ask("gynae opd thursday");
  ok("Gynae on Thursday: any doctor", has(r, "any doctor who is available"), all(r));
  r = await ask("paediatrics opd friday");
  ok("Paediatrics on Friday: Dr. N. Roy, marked", has(r, "nivedita roy") || has(r, "n. roy"), all(r));
  r = await ask("is surgery opd open on 3 november 2026");
  ok("Surgery on Tuesday 3 November 2026: open, three OPDs", tone(r) === "open" && has(r, "opd 15", "opd 17", "opd 18", "p. p. roy", "dharmendra kumar"), all(r));
  r = await ask("ent opd on 21 october 2026");
  ok("ENT on 21 October 2026: the OPD is closed (puja), not a table", tone(r) === "closed" && has(r, "maha dasami") && !r?.card.table, all(r));
  r = await ask("medicine opd sunday");
  ok("a department on Sunday: closed", tone(r) === "closed" && has(r, "closed on every sunday"), all(r));
  r = await ask("skin opd saturday");
  ok("Skin on Saturday: both OPDs, Hirak Choudhuri and Nabanita Das", has(r, "opd 36", "opd 35", "hirak choudhuri", "nabanita das"), all(r));
  r = await ask("chest opd");
  ok("Chest: closed on every day, no doctor", has(r, "closed") && has(r, "opd 4"), all(r));
  r = await ask("which opd number for skin");
  ok("which OPD number: the department at a glance shows OPD 36 and 35", has(r, "opd 36", "opd 35"), all(r));

  // ---- a unit
  r = await ask("clinic no 37 days");
  ok("MOPD clinic 37", has(r, "mopd clinic 37", "manish kumar"), all(r));

  // ---- heads
  r = await ask("hod of medicine");
  ok("the HOD of Medicine: not recorded, OPD 24's head is retired", has(r, "not recorded yet", "ranjeet kumar (retired)"), all(r));

  // ---- timings
  r = await ask("opd timing");
  ok("OPD timings", has(r, "8 am to 1 pm and 5 pm to 7 pm", "card registration"), all(r));
  r = await ask("token timings");
  ok("token timings without the word OPD", has(r, "8 am to 11:30 am and 4:30 pm to 6:30 pm"), all(r));
  r = await ask("which departments have opd");
  ok("the list of OPD departments and numbers", has(r, "orthopaedics", "22", "kanishka"), all(r));

  // ---- RULE 1: the OPD is closed that day (a holiday, a Sunday) -> the Emergency Department (the wording comes from the data file)
  const URGENT = "For urgent medical attention, you can consult the Emergency Department, which remains open 24 hours a day, 7 days a week.";
  const sug = async (q: string) => (await ask(q))?.card.suggestion;
  for (const q of [
    "opd open today", "opd open on 2 october", "opd open on 20 october 2026", "is opd closed on 25 december 2026", "is dr sumit mukherjee available today",
    "is dr ajit karmakar available on 20 october 2026", "ent opd on 21 october 2026", "medicine opd sunday", "when is opd closed", "opd open on sunday",
  ]) ok(`OPD closed that day: the Emergency Department: "${q}"`, (await sug(q)) === URGENT, String(await sug(q)));
  ok("the closure that is not known gets the softer wording", (await sug("opd open on 11 november 2026")) === "If the OPD turns out to be closed, you can consult the Emergency Department for urgent medical attention; it remains open 24 hours a day, 7 days a week.", String(await sug("opd open on 11 november 2026")));

  // ---- RULE 2: the OPD is open, but the patient's own unit is not sitting -> the unit rule, the General Medicine OPD for general care, the Emergency Department for urgent care
  for (const q of ["is dr rupak goswami in opd on wednesday", "orthopaedic opd monday", "eye opd tuesday", "ent opd on wednesday", "chest opd", "opd 4 days", "is orthopaedic opd open on monday"]) {
    const s = (await sug(q)) ?? "";
    ok(`unit not sitting, OPD open: the unit rule + General Medicine OPD + Emergency: "${q}"`, /first visit/.test(s) && /General Medicine OPD \(MOPD\), Clinic 37 and Clinic 40, open/.test(s) && /not specialist treatment/.test(s) && /Emergency Department, open 24 hours a day, 7 days a week/.test(s), s);
  }
  ok("on a named day the general OPD is said to sit THAT day; for 'chest opd' (all days) from Monday to Saturday", /open on Wednesday/.test((await sug("ent opd on wednesday")) ?? "") && /open Monday to Saturday/.test((await sug("chest opd")) ?? ""));

  // ---- the OPD is open and the unit sits: no pointer at all
  for (const q of [
    "opd open tomorrow", "opd open on saturday", "opd open on 5 january 2027", "medicine opd monday", "dental opd tuesday", "which days does dr ajit karmakar sit in opd", "is dr sumit mukherjee in opd tomorrow",
    "opd timing", "orthopaedics opd", "opd 25 days", "who is the hod of surgery", "which departments have opd", "is surgery opd open on 3 november 2026",
  ]) ok(`no pointer when there is an OPD: "${q}"`, (await sug(q)) === undefined, String(await sug(q)));

  // ---- a patient belongs to the UNIT, not to one doctor
  r = await ask("is dr avisek mukherjee in opd on tuesday");
  ok("Dental on Tuesday sees procedures and emergency cases only: a red No, with the Emergency pointer", tone(r) === "closed" && /^No: /.test(r?.card.status?.text ?? "") && has(r, "procedures and emergency cases only") && r?.card.suggestion === URGENT, all(r));
  ok("the unit rule and the general OPD are in the data file, so they can be changed there", SCHEDULE.generalOpd?.departmentId === "mopd" && /first visit/.test(SCHEDULE.unitRule ?? "") && SCHEDULE.emergency?.name === "Emergency Department");

  // ---- RULE 1b: today, outside the OPD hours -> the Emergency Department (the hours are 8:00 to 1:00 and 5:00 to 7:00)
  const askAt = (q: string, iso: string) => answerHospital(q, { now: DateTime.fromISO(iso, { zone: "Asia/Kolkata" }), holidaysOn });
  r = await askAt("opd open now", "2026-10-26T10:00:00");
  ok("Monday 10:00: open and in session until 1:00 PM, no pointer", tone(r) === "open" && has(r, "in session now, until 1 pm") && r?.card.suggestion === undefined, all(r));
  r = await askAt("opd open now", "2026-10-26T12:00:00");
  ok("Monday 12:00: in session, and the token counter closed at 11:30", has(r, "in session now", "token issue for this session closed at 11:30 am"), all(r));
  r = await askAt("opd open now", "2026-10-26T17:30:00");
  ok("Monday 17:30: the second session, until 7:00 PM", tone(r) === "open" && has(r, "until 7 pm"), all(r));
  r = await askAt("opd open today", "2026-10-26T15:00:00");
  ok("Monday 15:00: between the sessions: closed now, reopens at 5:00 PM, the Emergency Department", tone(r) === "closed" && has(r, "closed at this moment", "3 pm", "reopens at 5 pm") && r?.card.suggestion === URGENT, all(r));
  r = await askAt("opd open today", "2026-10-26T07:00:00");
  ok("Monday 07:00: not open yet, opens at 8:00 AM, the Emergency Department", tone(r) === "closed" && has(r, "not open yet", "opens at 8 am") && r?.card.suggestion === URGENT, all(r));
  r = await askAt("opd open today", "2026-10-26T20:00:00");
  ok("Monday 20:00: today's hours are over, the Emergency Department", tone(r) === "closed" && has(r, "opd hours are over", "8 pm") && r?.card.suggestion === URGENT, all(r));
  r = await askAt("opd open tomorrow", "2026-10-26T20:00:00");
  ok("a question about TOMORROW is not judged by the time of day now", tone(r) === "open" && !has(r, "hours are over") && r?.card.suggestion === undefined, all(r));
  r = await askAt("opd open on monday", "2026-10-26T20:00:00");
  ok("'on monday' said on a Monday evening is not judged by the time either (it names a weekday, not 'now')", tone(r) === "open" && !has(r, "hours are over"), all(r));
  r = await askAt("is dr sumit mukherjee in opd today", "2026-10-26T15:00:00");
  ok("a doctor today, but out of hours: listed, but the OPD is closed at this moment, Emergency Department", tone(r) === "closed" && has(r, "listed in psychiatry opd 1", "closed at this moment") && r?.card.suggestion === URGENT, all(r));
  r = await askAt("is orthopaedic opd open today", "2026-10-26T10:00:00");
  ok("Orthopaedics on a Monday (OT day), in hours: the unit rule and the General Medicine OPD", /first visit/.test(r?.card.suggestion ?? "") && has(r, "in session now"), all(r));
  r = await askAt("is orthopaedic opd open today", "2026-10-26T15:00:00");
  ok("the same at 15:00: out of hours comes first, the Emergency Department only", r?.card.suggestion === URGENT, all(r));
  r = await ask("opd open now");
  ok("Sunday: closed for the day (the time of day adds nothing)", tone(r) === "closed" && has(r, "sunday") && !has(r, "in session") && r?.card.suggestion === URGENT, all(r));

  // ======================================================================================================================================
  // THE MEDICINE BOARD (25 Oct 2026): a UNIT is a group of doctors with exclusive OPD days; an OPD number is a ROOM
  // ======================================================================================================================================
  const med = SCHEDULE.departments.find((d) => d.id === "medicine")!;
  ok("Medicine is a department of real units, every other department only has rooms", med.kind === "units" && SCHEDULE.departments.filter((d) => d.kind === "units").length === 1);
  ok("Unit I sits Wednesday and Saturday with four doctors, Unit II Monday and Thursday with two, Unit III Tuesday and Friday with three", med.units.map((u) => `${u.days?.join("+")}:${u.members?.length}`).join(" ") === "WED+SAT:4 MON+THU:2 TUE+FRI:3");
  ok("every Medicine day has exactly one unit sitting", OPD_DAYS.every((d) => med.units.filter((u) => u.week[d]?.doctors?.length).length === 1));
  ok("in-charge: Unit II Dr. Ranjeet Kumar and Unit III Dr. Dadan Prasad (the board says IN-CHARGE); Unit I by the rule the first name, Dr. Ashish Chatterjee (painted over)", unitHead(med.units[1]) === "ranjeet-kumar" && unitHead(med.units[2]) === "dadan-prasad" && unitHead(med.units[0]) === "ashish-chatterjee" && med.units[1].head === "ranjeet-kumar" && !med.units[0].head);
  ok("the staff file has 91 doctors (the two Ritesh entries are one person) and 10 other staff", STAFF.people.filter((p) => p.role === "doctor").length === 91 && STAFF.people.filter((p) => p.role === "staff").length === 10);
  ok("'Ritesh Deshmukh' of the schedule PDF and 'Ritesh Chauhan' of the board are one person", !PERSON.get("ritesh-deshmukh") && !!PERSON.get("ritesh-chauhan") && PERSON.get("ritesh-chauhan")!.printed.some((x) => /DESHMUKH/.test(x)));

  r = await ask("which days does dr dipak singh sit in opd");
  ok("Dr. Dipak Singh is in Unit I: Wednesday and Saturday, room OPD 26", has(r, "medicine unit i (opd 26)", "wednesday and saturday") && !has(r, "monday"), all(r));
  r = await ask("dr ritesh deshmukh opd days");
  ok("the schedule's spelling 'Deshmukh' finds Dr. Ritesh Chauhan, Unit I, Wednesday and Saturday, not on the doctor list", has(r, "ritesh chauhan", "wednesday and saturday", "not on the current doctor list"), all(r));
  r = await ask("which days does dr sukhdeb sankar patil sit in opd");
  ok("the board's spelling 'Sukhdeb Sankar Patil' finds Dr. Sukhdev Shankar Patil", has(r, "sukhdev shankar patil", "medicine unit i (opd 25)"), all(r));
  r = await ask("dr ranjit kumar opd days");
  ok("the board's spelling 'Ranjit Kumar' finds Dr. Ranjeet Kumar, retired", has(r, "ranjeet kumar", "retired"), all(r));


  // ---- units, by number and by roman numeral
  ok("'unit ii', 'unit-2', 'unit 2 of medicine' all find the same unit", (await Promise.all(["medicine unit ii", "medicine unit-2", "unit 2 of medicine"].map((q) => ask(q)))).every((x) => has(x, "medicine unit ii sits on monday and thursday")));
  r = await ask("is medicine unit 2 open on tuesday");
  ok("Unit II on a Tuesday: it does not sit, it sits Monday and Thursday; the unit rule, the General Medicine OPD, the Emergency Department", tone(r) === "closed" && has(r, "does not sit on tuesday", "monday and thursday") && /first visit/.test(r?.card.suggestion ?? ""), all(r));
  r = await ask("is medicine unit 2 open on monday");
  ok("Unit II on a Monday: it sits, no pointer", tone(r) === "open" && has(r, "sits on monday, 26 october 2026") && r?.card.suggestion === undefined, all(r));
  r = await ask("orthopaedics unit 2");
  ok("a department whose units are not recorded: said so, with its rooms", has(r, "units of orthopaedics are not recorded yet", "opd 22"), all(r));

  // ---- rooms
  r = await ask("opd 25 days");
  ok("OPD 25 is a ROOM of Medicine: Monday and Thursday Dr. Ajit Karmakar (Unit II), Tuesday and Friday Dr. Rajeev Kumar (Unit III), Wednesday and Saturday Dr. Sukhdev Shankar Patil (Unit I)", r?.card.table?.rows.length === 6 && has(r, "is a room of medicine", "unit ii", "unit iii", "unit i", "dr. ajit karmakar", "dr. rajeev kumar", "dr. sukhdev shankar patil"), all(r));
  r = await ask("opd 26 days");
  ok("room 26: on Monday Unit II's note 'any doctor available', Unit III Dr. Kunj Bihari Singh, Unit I Dr. Dipak Singh and Dr. Ritesh Chauhan", has(r, "monday", "medicine unit ii", "any doctor who is available", "kunj bihari singh", "dipak singh", "ritesh chauhan") && r?.card.table?.rows.find((x) => x[0] === "Monday")?.[1] === "Medicine Unit II" && r?.card.table?.rows.find((x) => x[0] === "Thursday")?.[1] === "—", all(r));
  r = await ask("opd 99");
  ok("an OPD number that does not exist: honest not-found, with the units and rooms that do", has(r, "opd 99 is not in the opd schedule i have", "unit iii", "opd rooms 24, 25, 26", "orthopaedics opd 22"), all(r));

  // ---- heads and the HOD
  r = await ask("who is the hod of surgery");
  ok("Surgery: its HOD is not recorded and neither are its units (only rooms): no head is claimed", tone(r) === "unknown" && has(r, "hod of surgery is not recorded yet", "neither are its units", "opd 15") && !has(r, "avijit sircar"), all(r));
  r = await ask("who is the in-charge of medicine unit 2");
  ok("the in-charge of Medicine Unit II is Dr. Ranjeet Kumar, retired", has(r, "in-charge of medicine unit ii is dr. ranjeet kumar (retired)", "has retired"), all(r));
  r = await ask("who is the head of unit iii of medicine");
  ok("the head of Unit III is Dr. Dadan Prasad (board: IN-CHARGE), transferred", has(r, "dr. dadan prasad (transferred)", "has been transferred"), all(r));
  r = await ask("who is the unit head of opd 24");
  ok("OPD 24 is a room, so it has no head: the units' heads are listed", has(r, "room of medicine", "no head of its own", "unit i:", "unit ii: dr. ranjeet kumar (retired)", "unit iii: dr. dadan prasad (transferred)"), all(r));

  // ---- a patient belongs to his UNIT: a doctor asked about on a day his unit does not sit
  r = await ask("is dr ajit karmakar in opd on tuesday");
  ok("Dr. Ajit Karmakar on a Tuesday: NO, his unit (Medicine Unit II) does not sit; it sits Monday and Thursday; the unit rule + the General Medicine OPD + Emergency", tone(r) === "closed" && has(r, "no:", "medicine unit ii) does not sit on tuesday", "monday and thursday") && /first visit/.test(r?.card.suggestion ?? "") && /General Medicine OPD/.test(r?.card.suggestion ?? ""), all(r));
  r = await ask("is dr kunj bihari singh in opd on monday");
  ok("Dr. Kunj Bihari Singh on a Monday: Unit III does not sit (Tuesday and Friday)", tone(r) === "closed" && has(r, "unit iii) does not sit on monday", "tuesday and friday"), all(r));
  r = await ask("is dr ranjeet kumar in opd on tuesday");
  ok("a retired doctor on a Tuesday: his unit does not sit; the notes say he has retired", has(r, "medicine unit ii) does not sit on tuesday", "retired"), all(r));
  r = await ask("is dr avijit sircar in opd on tuesday");
  ok("a doctor of a department with only rooms, on a day he does not sit: others sit in the room, but the units are not recorded, so the softer pointer", tone(r) === "closed" && has(r, "units of surgery are not recorded yet") && /^If your unit is not sitting that day:/.test(r?.card.suggestion ?? ""), all(r));

  // ======================================================================================================================================
  // THE NON-PERMANENT DOCTORS: a separate file
  // ======================================================================================================================================
  const known = new Set(STAFF.people.map((p) => p.id));
  ok("the file of non-permanent doctors is consistent", validateNonPermanent(known).length === 0, validateNonPermanent(known).join("; "));
  ok("66 non-permanent doctors: 51 with a D number, 15 with a DTN number", NON_PERMANENT_DOCTORS.length === 66 && NON_PERMANENT_DOCTORS.filter((d) => d.kind === "D").length === 51 && NON_PERMANENT_DOCTORS.filter((d) => d.kind === "DTN").length === 15);
  ok("13 of them are in the hospital's own lists (linked), and every contractual person of the staff file is in the non-permanent file", NON_PERMANENT_DOCTORS.filter((d) => d.staffId).length === 13 && STAFF.people.filter((p) => p.employment === "contractual").every((p) => NON_PERMANENT_DOCTORS.some((d) => d.staffId === p.id)));
  ok("Dr. Manish Kumar (the stray D490196) and Dr. Debdip Saha 490107 are permanent: not in the file; the other Debdip Saha, D499964, is", !NON_PERMANENT_DOCTORS.some((d) => d.listId === "D490196" || d.listId === "D490107") && NON_PERMANENT_DOCTORS.some((d) => d.listId === "D499964"));
  ok("no specialization is invented: it is set only where a printed qualification states it (8 of 66 so far)", NON_PERMANENT_DOCTORS.filter((d) => d.specialization).length === 8 && NON_PERMANENT_DOCTORS.filter((d) => !d.staffId).every((d) => d.specialization === null && d.department === null));
  ok("nobody on the Medicine board is a confirmed non-permanent doctor", med.units.flatMap((u) => u.members ?? []).every((id) => !NON_PERMANENT_DOCTORS.some((d) => d.staffId === id)));

  r = await ask("list contractual doctors");
  ok("the list of non-permanent doctors: all 66, 'not recorded yet' where it is not known", r?.card.table?.rows.length === 66 && has(r, "66 non-permanent", "not recorded yet", "dtn00752"), all(r).slice(0, 200));
  r = await ask("how many contractual doctors are there in surgery");
  ok("contractual doctors of Surgery: 5, with the total", r?.card.table?.rows.length === 5 && has(r, "5 non-permanent", "in surgery", "66 in all", "shyamal hansda", "plastic surgery"), all(r).slice(0, 200));
  r = await ask("non-permanent doctors of ENT");
  ok("a department with no non-permanent doctor recorded: said so, not an empty table", tone(r) === "unknown" && has(r, "no non-permanent doctor in ent is recorded yet") && !r?.card.table, all(r));
  r = await ask("is dr thara gopinath contractual");
  ok("a contractual doctor: said so, with her number and the specialization 'not recorded yet'", has(r, "non-permanent (contractual) doctor", "dtn00752", "specialization: not recorded yet"), all(r));
  r = await ask("is dr khooshbu gayen a permanent doctor");
  ok("a contractual doctor whose specialization is known from the qualification: Dental surgery", has(r, "non-permanent", "dtn00756", "specialization: dental surgery"), all(r));
  r = await ask("is dr rajeev kumar permanent");
  ok("a permanent doctor", has(r, "permanent dsp employee"), all(r));
  r = await ask("is dr ritesh chauhan permanent or contractual");
  ok("a doctor on no list under any number: not known, said so (not guessed)", tone(r) === "unknown" && has(r, "i do not know whether", "not on the intranet doctor list"), all(r));
  r = await ask("is dr ranjeet kumar contractual");
  ok("a retired doctor: he has retired", has(r, "has retired"), all(r));
  r = await ask("is dr ajay varghese contractual");
  ok("a non-permanent doctor the hospital's own lists do not have is still found, from the file", has(r, "non-permanent (contractual) doctor", "d499962"), all(r));
  r = await ask("dr ajay varghese opd days");
  ok("...and his OPD days are said not to be recorded yet", has(r, "non-permanent doctor (d499962)", "not recorded yet"), all(r));
  r = await ask("is dr kumar contractual");
  ok("'kumar' is ambiguous here too", has(r, "more than one doctor"), all(r));
  for (const q of ["how many contractual employees", "list contractual workers", "contractual employees in C&IT", "how many permanent employees are there"]) ok(`left alone (not about doctors): "${q}"`, (await ask(q)) === null, all(await ask(q)).slice(0, 100));

  // ======================================================================================================================================
  // STEP 53b (from the owner's review of "medicine opd monday"): the badge, the table first (room and doctor), points, the hours in red
  // ======================================================================================================================================
  const flat = (r2: Awaited<ReturnType<typeof ask>>) => JSON.stringify(r2?.card ?? {});
  r = await ask("medicine opd monday");
  ok("Medicine on Monday: the badge is a green Open", r?.card.badge?.tone === "open" && r?.card.badge?.text === "Open", flat(r));
  ok("...the points are short: the other units with their days, and the unit rule", JSON.stringify(r?.card.lines) === JSON.stringify(["Not sitting on Monday: Unit I (Wednesday and Saturday), Unit III (Tuesday and Friday)", "A patient is seen only by the unit of his or her first visit."]), flat(r));
  ok("...and the two generic notes are gone", !/not complete|not up to date|please confirm/i.test(flat(r)), flat(r));
  r = await ask("medicine opd wednesday");
  ok("Medicine on Wednesday: Unit I, four doctors; two share room 26 and the room is written once; the retired / unlisted are marked", JSON.stringify(r?.card.table?.rows) === JSON.stringify([["Unit I", "OPD 24", "Dr. Ashish Chatterjee (not on the current doctor list)"], ["", "OPD 25", "Dr. Sukhdev Shankar Patil"], ["", "OPD 26", "Dr. Dipak Singh"], ["", "", "Dr. Ritesh Chauhan (not on the current doctor list)"]]), flat(r));
  r = await ask("orthopaedics opd tuesday");
  ok("a department of rooms: the columns are just Room and Doctor, one row per doctor, the room once", JSON.stringify(r?.card.table?.columns) === JSON.stringify(["Room", "Doctor"]) && JSON.stringify(r?.card.table?.rows.map((x) => x[0])) === JSON.stringify(["OPD 22", "", "", ""]) && r?.card.badge?.tone === "open", flat(r));
  r = await ask("surgery opd tuesday");
  ok("Surgery on Tuesday: three rooms, the doctors under their room", JSON.stringify(r?.card.table?.rows.map((x) => x[0])) === JSON.stringify(["OPD 15", "", "OPD 17", "", "OPD 18"]), flat(r));
  r = await ask("medicine opd monday and thursday");
  ok("two weekdays named: the grid (unit by day), no single date, no badge", r?.card.table?.columns.join("|") === "Department|Unit / OPD|Monday|Thursday" && r?.card.table?.rows.length === 1 && r?.card.badge === undefined, flat(r));
  r = await ask("medicine opd");
  ok("Medicine at a glance: one row per UNIT with its days, its doctors with rooms and its in-charge; short points; no badge (no date)", r?.card.table?.columns.join("|") === "Unit|OPD days|Doctors (room)|In-charge" && r?.card.table?.rows.length === 3 && has(r, "wednesday and saturday", "monday and thursday", "tuesday and friday") && r?.card.lines?.[0] === "Medicine has 3 units; each has its own OPD days" && r?.card.badge === undefined, flat(r));
  r = await ask("orthopaedics opd");
  ok("a department with only rooms: the grid, and it says its units are not recorded (no unit head claimed)", r?.card.table?.columns.length === 7 && has(r, "p. sahoo", "units of this department are not recorded yet", "no unit head or hod can be named") && !has(r, "in-charge"), flat(r));

  // ---- the badge: Open (green), Closed (red), Not known (amber), only for an answer about a date
  const badge = async (q: string) => { const x = await ask(q); return x?.card.badge ? `${x.card.badge.tone}:${x.card.badge.text}` : "none"; };
  for (const [q, want] of [
    ["opd open today", "closed:Closed"], ["opd open tomorrow", "open:Open"], ["opd open on 2 october", "closed:Closed"], ["opd open on 11 november 2026", "unknown:Not known"], ["opd open on saturday", "open:Open"],
    ["medicine opd sunday", "closed:Closed"], ["orthopaedic opd monday", "closed:Closed"], ["eye opd tuesday", "closed:Closed"], ["chest opd tuesday", "closed:Closed"], ["ent opd on 21 october 2026", "closed:Closed"],
    ["dental opd tuesday", "open:Open"], ["is medicine unit 2 open on tuesday", "closed:Closed"], ["is medicine unit 2 open on monday", "open:Open"],
    ["is dr ajit karmakar in opd on tuesday", "closed:Closed"], ["is dr ajit karmakar in opd on monday", "open:Open"], ["is dr sumit mukherjee available today", "closed:Closed"], ["is dr rupak goswami in opd on wednesday", "closed:Closed"],
    ["medicine opd", "none"], ["opd 25 days", "none"], ["who is the hod of medicine", "none"], ["opd timing", "none"], ["when is opd closed", "none"], ["which days does dr ajit karmakar sit in opd", "none"], ["list contractual doctors", "none"],
  ] as const) ok(`badge of "${q}" = ${want}`, (await badge(q)) === want, await badge(q));
  const clockBadge = async (q: string, iso: string) => { const x = await askAt(q, iso); return x?.card.badge ? x.card.badge.tone : "none"; };
  ok("today at 10:00 in session: Open; at 15:00 between the sessions, at 7:00 before the opening, at 20:00 after the hours: Closed", (await clockBadge("opd open today", "2026-10-26T10:00:00")) === "open" && (await clockBadge("opd open today", "2026-10-26T15:00:00")) === "closed" && (await clockBadge("opd open today", "2026-10-26T07:00:00")) === "closed" && (await clockBadge("opd open today", "2026-10-26T20:00:00")) === "closed");

  // ---- the hours in red points under an answer about an OPD that is open; nothing of the kind under a closed day
  const notesOf = async (q: string) => (await ask(q))?.card.notes ?? [];
  ok("a closed day carries no hours", !(await notesOf("medicine opd sunday")).some((n) => /hours/.test(n)) && !(await notesOf("opd open today")).some((n) => /hours/.test(n)));
  ok("the clock times have no :00 (8 AM, not 8:00 AM)", !/\d:00 [AP]M/.test(JSON.stringify((await ask("opd open tomorrow"))?.card)) && !/\d:00 [AP]M/.test(flat(await ask("opd timing"))));
  for (const q of ["medicine opd monday", "orthopaedic opd monday", "opd open tomorrow", "which days does dr ajit karmakar sit in opd", "opd 25 days", "medicine unit 2", "who is the hod of medicine", "opd timing", "when is opd closed", "kanishka opd", "which departments have opd"])
    ok(`no generic disclaimer in "${q}"`, !/not complete|not up to date|please confirm with|painted over|photographed|the owner/i.test(flat(await ask(q))), flat(await ask(q)).slice(0, 120));

  // ======================================================================================================================================
  // STEP 54a: hints and initials narrow a name; the radio question; retired doctors are not shown; the two tables of a No; the afternoon rule
  // ======================================================================================================================================
  const A = (r2: Awaited<ReturnType<typeof ask>>) => r2?.ask;
  const jc = (r2: Awaited<ReturnType<typeof ask>>) => JSON.stringify(r2?.card ?? {});

  // ---- (a) hints and initials narrow the name BEFORE anything is asked
  r = await ask("is dr mukherjee of dental available on tuesday");
  ok("'mukherjee of dental' is Dr. Avisek Mukherjee: no question, the answer", !A(r) && has(r, "avisek mukherjee", "dental"), all(r).slice(0, 160));
  r = await ask("is dr a mukherjee available on tuesday");
  ok("the initial narrows too: 'dr a mukherjee' is Dr. Avisek Mukherjee", !A(r) && has(r, "avisek mukherjee"), all(r).slice(0, 160));
  r = await ask("is dr mukherjee of psychiatry available on tuesday");
  ok("'mukherjee of psychiatry' is Dr. Sumit Mukherjee", !A(r) && has(r, "sumit mukherjee"), all(r).slice(0, 160));
  r = await ask("is dr mukherjee ent doctor available on tuesday");
  ok("a hint that fits no Mukherjee is reported, with the doctors that have the name", !!A(r) && /I found no Dr\. Mukherjee in ENT/.test(A(r)!.message) && A(r)!.options.length === 3, all(r).slice(0, 200));
  r = await ask("is dr das of biochemistry available on tuesday");
  ok("a discipline the OPD has no department for narrows too (biochemistry): Dr. Arup Kumar Das", !A(r) && has(r, "arup kumar das"), all(r).slice(0, 160));
  r = await ask("is dr singh of medicine unit 3 available on tuesday");
  ok("a unit narrows: 'singh of medicine unit 3' is Dr. Kunj Bihari Singh, who sits on Tuesday", !A(r) && has(r, "kunj bihari singh", "yes"), all(r).slice(0, 200));
  r = await ask("is dr kumar of surgery available on tuesday");
  ok("'kumar of surgery': only the two Kumars of Surgery are offered (not all thirteen)", A(r)?.options.map((o) => o.label).sort().join("|") === "Dr. Dharmendra Kumar|Dr. R. R. Kumar", JSON.stringify(A(r)?.options.map((o) => o.label)));
  r = await ask("is dr karmakar of surgery available on tuesday");
  ok("'karmakar of surgery': there is none in Surgery; the Medicine Karmakar is offered as the one to confirm", !!A(r) && /I found no Dr\. Karmakar in Surgery/.test(A(r)!.message) && A(r)!.options.length === 1 && A(r)!.options[0].label === "Dr. Ajit Karmakar", all(r).slice(0, 200));
  r = await ask("is doctor karmakar of medicine available on next tuesday?");
  ok("the sample question: 'karmakar of medicine' is Dr. Ajit Karmakar, and 'next tuesday' is 27 October", !A(r) && has(r, "ajit karmakar", "tuesday, 27 october 2026"), all(r).slice(0, 200));

  // ---- (c) the radio question: doctors only, with discipline / unit / non-permanent, and the whole question kept
  r = await ask("is dr mukherjee available on tuesday");
  const mk = A(r);
  ok("'mukherjee' with no hint: a question in radio mode (one choice), not a text", !!mk && mk.mode === "one" && /More than one doctor is called Dr\. Mukherjee/.test(mk.message) && mk.options.length === 3, all(r).slice(0, 200));
  ok("each option says who the doctor is: the discipline, and non-permanent where it is so", !!mk && mk.options.some((o) => o.label === "Dr. Avisek Mukherjee" && o.detail === "Dental surgery") && mk.options.some((o) => o.label === "Dr. Sumit Mukherjee" && o.detail === "Psychiatry") && mk.options.some((o) => o.label === "Dr. Gourav Mukherjee" && /Chest medicine/.test(o.detail ?? "") && /non-permanent/.test(o.detail ?? "")), JSON.stringify(mk?.options));
  ok("'None of these' and 'search all employees named Mukherjee' are separate buttons", mk?.none.label === "None of these" && mk?.alternative?.label === "Search all employees named Mukherjee" && mk?.alternative?.query === "mukherjee");
  ok("only hospital doctors are offered", !!mk && mk.options.every((o) => STAFF.people.some((p) => p.role === "doctor" && o.phrase.startsWith(`Dr. ${p.name.split(" ").map((w) => w[0] + w.slice(1).toLowerCase()).join(" ")}`)) || /non-permanent/.test(o.detail ?? "")));
  ok("the question searched for after the choice is the person's OWN question with the doctor named exactly", !!mk && queryFor(mk, [mk.options.find((o) => o.label === "Dr. Sumit Mukherjee")!.id]) === "is Dr. Sumit Mukherjee (ticket 490138) available on tuesday", String(mk && queryFor(mk, [mk.options[0].id])));
  r = await ask("which days does dr a k mukherjee sit in opd");
  ok("initials typed before the name are replaced with the chosen doctor", !A(r) || queryFor(A(r)!, [A(r)!.options[0].id]).startsWith("which days does Dr."), all(r).slice(0, 120));
  r = await ask("dr kumar is available on tuesday?");
  ok("nineteen doctors have Kumar in their name (some as a middle name): ten are offered, the surname matches first, and the person is told to narrow it", A(r)?.options.length === 10 && /Showing 10 of 19/.test(A(r)!.message) && A(r)!.options.slice(0, 3).every((o) => /Kumar$/.test(o.label)), A(r)?.options.map((o) => o.label).join("|"));
  // the round trip: EVERY option of every ambiguous surname answers for that doctor, keeps the day, and never asks again
  for (const sur of ["mukherjee", "das", "kumar", "mondal", "roy", "singh", "saha", "chakraborty", "sarkar", "ghosh", "choudhuri", "bhattacharya"]) {
    const r1 = await ask(`is dr ${sur} available on next tuesday?`);
    const a = A(r1);
    if (!a) { ok(`"${sur}" is not ambiguous (one doctor or none): nothing to choose`, true); continue; }
    for (const o of a.options) {
      const q2 = queryFor(a, [o.id]);
      const r2 = await ask(q2);
      ok(`${sur}: choosing ${o.label} (${o.detail}) answers for him or her, keeps "next tuesday", and does not ask again`, !!r2 && !r2.ask && jc(r2).includes(o.label) && /next tuesday/i.test(q2) && /\((ticket|list no\.|doctor) /i.test(q2), `${q2} => ${jc(r2).slice(0, 90)}`);
    }
  }
  r = await ask("is dr debdip saha available on tuesday");
  ok("two people share the name Debdip Saha: told apart by their details", A(r)?.options.length === 2 && A(r)!.options.some((o) => /OHS & PMU|Ohs/i.test(o.detail ?? "") && !/non-permanent/.test(o.detail ?? "")) && A(r)!.options.some((o) => /non-permanent/.test(o.detail ?? "")), JSON.stringify(A(r)?.options));
  ok("...the exact markers: the ticket of the permanent one, the list number of the non-permanent one", A(r)!.options.some((o) => /\(ticket 490107\)/.test(o.phrase)) && A(r)!.options.some((o) => /\(list no\. D499964\)/.test(o.phrase)));
  const perm = await ask(queryFor(A(r)!, [A(r)!.options.find((o) => !/non-permanent/.test(o.detail ?? ""))!.id]));
  const contr = await ask(queryFor(A(r)!, [A(r)!.options.find((o) => /non-permanent/.test(o.detail ?? ""))!.id]));
  ok("...each marker finds exactly its own person", has(perm, "not in the opd schedule") && has(contr, "d499964", "not recorded yet"), all(perm).slice(0, 100) + " | " + all(contr).slice(0, 100));
  r = await ask("is dr kumar contractual");
  ok("the same question when the employment is asked: 'kumar contractual' offers the Kumars", !!A(r) && A(r)!.options.length === 10, all(r).slice(0, 100));
  r = await ask("is dr ajit karmakar (ticket 499116) available on next tuesday?");
  ok("an exact marker in a question names the doctor, and is not read as a date or a room", !A(r) && has(r, "ajit karmakar", "tuesday, 27 october 2026"), all(r).slice(0, 150));
  r = await ask("is dr mukherjee (ticket 490138) of dental available on tuesday");
  ok("an exact marker beats a hint that does not fit: no second question", !A(r) && has(r, "sumit mukherjee"), all(r).slice(0, 120));

  // ---- (b) the answer: the doctor's unit, and (when it is No) the unit that sits on the asked date
  r = await ask("is dr ajit karmakar available on next tuesday");
  ok("a No: two tables: his unit with its days, then the unit that sits on that date, with the rooms", r?.card.extraTables?.map((x) => x.title).join("|") === "Medicine Unit II: Monday and Thursday|Sitting on Tuesday, 27 October 2026" && r?.card.badge?.tone === "closed", jc(r).slice(0, 200));
  ok("...his unit's table: room and doctor, the retired colleague is not shown", JSON.stringify(r?.card.extraTables?.[0].table.rows) === JSON.stringify([["OPD 25", "Dr. Ajit Karmakar"]]) && JSON.stringify(r?.card.extraTables?.[0].table.columns) === JSON.stringify(["Room", "Doctor"]), jc(r));
  ok("...the unit that sits on Tuesday: Unit III with its rooms and current doctors (the transferred in-charge is not shown)", JSON.stringify(r?.card.extraTables?.[1].table.rows) === JSON.stringify([["Unit III", "OPD 25", "Dr. Rajeev Kumar"], ["", "OPD 26", "Dr. Kunj Bihari Singh"]]) && JSON.stringify(r?.card.extraTables?.[1].table.columns) === JSON.stringify(["Unit", "Room", "Doctor"]), jc(r));
  ok("...and the pointer to general care and Emergency is still there", /first visit/.test(r?.card.suggestion ?? "") && /Emergency Department/.test(r?.card.suggestion ?? ""));
  r = await ask("is dr ajit karmakar available on next monday");
  ok("a Yes: a green Open badge and the unit on that day: room 25 Dr. Ajit Karmakar, room 26 any doctor", r?.card.badge?.tone === "open" && JSON.stringify(r?.card.extraTables?.map((x) => x.title)) === JSON.stringify(["Medicine Unit II, Monday, 26 October 2026"]) && JSON.stringify(r?.card.extraTables?.[0].table.rows) === JSON.stringify([["OPD 25", "Dr. Ajit Karmakar"], ["OPD 26", "Any doctor who is available"]]), jc(r).slice(0, 220));
  r = await ask("which days does dr ajit karmakar sit in opd");
  ok("with no date: his unit and its days, one table", JSON.stringify(r?.card.extraTables?.map((x) => x.title)) === JSON.stringify(["Medicine Unit II: Monday and Thursday"]) && r?.card.badge === undefined, jc(r).slice(0, 160));
  r = await ask("is dr priyank sahoo available on monday");
  ok("a department of rooms, an OT day: his room with its doctors, no unit claimed", tone(r) === "closed" && r?.card.extraTables?.[0].title === "Orthopaedics OPD 22: Tuesday, Wednesday, Friday and Saturday" && r?.card.extraTables?.[0].table.rows[0].join("|") === "OPD 22|Dr. Priyank Sahoo" && (r?.card.extraTables?.[0].table.rows.length ?? 0) === 4, jc(r).slice(0, 220));
  r = await ask("is dr avijit sircar available on tuesday");
  ok("a department of rooms, another doctor of the room sits that day: his room (colleagues with their days), and who sits that day", has(r, "units of surgery are not recorded yet") && r?.card.extraTables?.[0].title === "Surgery OPD 15: Monday, Wednesday and Friday" && r?.card.extraTables?.[1].title.startsWith("Sitting on Tuesday") && /Tuesday, Thursday and Saturday/.test(jc(r)), jc(r).slice(0, 300));

  // ---- retired and transferred doctors are not shown where the OPD is described
  for (const q of ["medicine opd monday", "medicine opd tuesday", "medicine opd thursday", "medicine opd friday", "opd 24 days", "opd 25 days", "medicine opd", "medicine unit 2", "medicine unit 3", "kanishka opd", "which days does dr ajit karmakar sit in opd", "is dr ajit karmakar available on next tuesday", "is dr rajeev kumar available on monday", "medicine and surgery opd on monday"])
    ok(`no retired or transferred doctor in "${q}"`, !/\(retired\)|\(transferred\)|Ranjeet|Dadan|Ivy Paul/.test(jc(await ask(q)).replace(/"notes":\[[^\]]*\]/, "")), jc(await ask(q)).slice(0, 160));
  ok("asked about HIM, the answer still says he has retired", has(await ask("which days does dr ranjeet kumar sit in opd"), "has retired") && has(await ask("who is the in-charge of medicine unit 2"), "ranjeet kumar (retired)"));
  ok("the in-charge of a unit is shown only while he is there, else 'not recorded yet'", /In-charge: not recorded yet/.test(jc(await ask("medicine unit 2"))) && /not recorded yet/.test(jc(await ask("medicine opd"))));
  r = await ask("the kanishka health centre opd");
  ok("the Kanishka health centre: Dr. Rina Mondal; Dr. Ivy Paul, who has retired, is not shown", has(r, "kanishka", "rina mondal") && !has(r, "ivy paul"), all(r).slice(0, 160));

  // ---- the afternoon rule and the hours
  const hoursNotes = (await ask("opd open tomorrow"))?.card.notes ?? [];
  ok("the red points under an open OPD: the OPD hours, the card registration hours, and who the afternoon is for", hoursNotes.slice(-3).join("|") === "OPD hours: 8 AM to 1 PM and 5 PM to 7 PM|Card registration (token) hours: 8 AM to 11:30 AM and 4:30 PM to 6:30 PM|The afternoon OPD (5 PM to 7 PM) is only for employees currently on roll", hoursNotes.join("|"));
  ok("the afternoon rule is in the timings answer too, in its short form", has(await ask("opd timing"), "the afternoon opd (5 pm to 7 pm) is only for employees currently on roll") && !has(await ask("opd timing"), "retired employees", "family members"));
  ok("a closed day carries no hours and no afternoon rule", !/afternoon/i.test(jc(await ask("medicine opd sunday"))) && !/afternoon/i.test(jc(await ask("opd open today"))));
  ok("the afternoon rule is in the data file, so the wording can be changed there", /currently on roll/.test(SCHEDULE.timings.afternoonNote ?? ""));
  r = await ask("which days does dr sumit mukherjee sit in opd");
  ok("a doctor who sits all six days: 'from Monday to Saturday', not the six names", has(r, "sits in psychiatry opd 1 from monday to saturday") && !has(r, "monday, tuesday, wednesday"), all(r).slice(0, 200));
  ok("...and the caption of his table says 'Monday to Saturday'", r?.card.extraTables?.[0].title === "Psychiatry OPD 1: Monday to Saturday", jc(r).slice(0, 160));
  ok("a doctor of two days keeps the names: 'on Monday and Thursday'", has(await ask("which days does dr ajit karmakar sit in opd"), "sits in medicine unit ii (opd 25) on monday and thursday"));
  ok("diplomas keep their chip: Psychiatry (DPM), Obstetrics and Gynaecology (DGO)", disciplineOfTicket("499170") === "Psychiatry (DPM)" && STAFF.people.some((p) => p.discipline === "Obstetrics and Gynaecology (DGO)"));
  r = await ask("medicine opd monday");
  ok("Medicine on Monday: the table has Unit II with room 25 Dr. Ajit Karmakar and room 26 any doctor (Dr. Ranjeet Kumar has retired and is not shown)", JSON.stringify(r?.card.table) === JSON.stringify({ columns: ["Unit", "Room", "Doctor"], rows: [["Unit II", "OPD 25", "Dr. Ajit Karmakar"], ["", "OPD 26", "Any doctor who is available"]] }), jc(r).slice(0, 200));
  r = await ask("medicine opd tuesday");
  ok("Medicine on Tuesday: Unit III, rooms 25 and 26 (Dr. Dadan Prasad has been transferred and is not shown)", JSON.stringify(r?.card.table?.rows) === JSON.stringify([["Unit III", "OPD 25", "Dr. Rajeev Kumar"], ["", "OPD 26", "Dr. Kunj Bihari Singh"]]) && r?.card.badge?.tone === "open", jc(r).slice(0, 200));
  r = await ask("medicine and surgery opd on monday");
  ok("two departments: Department, Unit, Room, Doctor; Medicine's two rows and Surgery's four", r?.card.table?.columns.join("|") === "Department|Unit|Room|Doctor" && (r?.card.table?.rows.length ?? 0) === 6 && r?.card.table?.rows[2][0] === "Surgery", jc(r).slice(0, 200));
  r = await askAt("medicine opd today", "2026-10-26T15:00:00");
  ok("Medicine today (Monday 15:00), out of hours: Closed, the Emergency Department, Unit II's table is still shown", r?.card.badge?.tone === "closed" && r?.card.suggestion === URGENT && (r?.card.table?.rows.length ?? 0) === 2, jc(r).slice(0, 160));
  r = await ask("opd 24 on monday");
  ok("OPD 24 on Monday: nobody sits in it (both doctors of Unit II are in room 25); Dr. Ranjeet Kumar is not named", r?.card.table?.rows.length === 1 && r?.card.table?.rows[0].join("|") === "Monday|—|—" && !/Ranjeet/.test(jc(r)), jc(r).slice(0, 200));
  r = await ask("opd 25 on monday");
  ok("OPD 25 on Monday: Unit II, Dr. Ajit Karmakar (Dr. Ranjeet Kumar, who shared the room, has retired and is not shown)", r?.card.table?.rows.length === 1 && r?.card.table?.rows[0].join("|") === "Monday|Medicine Unit II|Dr. Ajit Karmakar", jc(r).slice(0, 200));
  r = await ask("medicine unit 2");
  ok("Medicine unit 2: Monday and Thursday; the table has only the current doctor; the in-charge is 'not recorded yet'", has(r, "medicine unit ii sits on monday and thursday", "in-charge: not recorded yet", "first visit") && JSON.stringify(r?.card.table?.rows) === JSON.stringify([["OPD 25", "Dr. Ajit Karmakar"]]), jc(r).slice(0, 220));
  r = await ask("medicine unit 3");
  ok("Medicine unit 3: Tuesday and Friday; Dr. Rajeev Kumar and Dr. Kunj Bihari Singh", has(r, "tuesday and friday", "rajeev kumar", "kunj bihari singh") && !has(r, "dadan"), jc(r).slice(0, 200));
  r = await ask("medicine unit i");
  ok("Medicine unit I: Wednesday and Saturday; the first-named doctor on the board is not on the current doctor list", has(r, "wednesday and saturday", "in-charge: dr. ashish chatterjee (not on the current doctor list)"), jc(r).slice(0, 220));

  // ======================================================================================================================================
  // STEP 54c: the first answer is a green Yes or a red No; the out-of-hours No; one bracket; a slip of one letter in a name; a name nobody matches
  // ======================================================================================================================================
  // every verdict that is open starts with "Yes:" and every one that is closed starts with "No:"; an unknown one is amber and has neither
  const sweep = ["is opd open on monday", "is opd open on sunday", "is opd open tomorrow", "is opd open on 26 january 2027", "is opd open on 24 january 2027", "is opd open on 2 october 2026", "medicine opd monday", "medicine opd sunday", "medicine opd tuesday", "medicine and surgery opd on monday", "is dr ajit karmakar available on tuesday", "is dr ajit karmakar available on monday", "is dr sumit mukherjee available on tuesday", "is dr mukherjee of dental available on tuesday", "is dr mukherjee of dental available on friday", "is dr priyank sahoo available on monday", "is dr avijit sircar available on tuesday", "is dr rupak kumar goswami available on wednesday", "medicine unit 2 on tuesday", "medicine unit 2 on monday", "is dr rina mondal available on sunday", "is dr debdip saha available on tuesday (list no. D499964)"];
  for (const q of sweep) {
    const rr = await ask(q);
    const tn = rr?.card.status?.tone;
    const text = rr?.card.status?.text ?? "";
    ok(`the first answer of "${q}" is eye-catching: ${tn === "open" ? "green Yes" : tn === "closed" ? "red No" : "amber / grey, no Yes or No"}`, tn === "open" ? /^Yes: /.test(text) : tn === "closed" ? /^No: /.test(text) : !/^(Yes|No): /.test(text), `${tn} ${text.slice(0, 80)}`);
    if (tn === "open" || tn === "closed") ok(`...its plain-text answer says the same, and the badge (when there is one) has the same colour`, /^(Yes|No): /.test(rr?.summary ?? "") && (!rr?.card.badge || rr.card.badge.tone === tn), `${rr?.summary?.slice(0, 60)} ${JSON.stringify(rr?.card.badge)}`);
  }
  // the Dental doctor on a procedures-and-emergency day: the red No first, the long text after it
  r = await ask("is dr mukherjee of dental available on tuesday?");
  ok("Dental Tuesday: Closed badge, red, 'No: Dr. Avisek Mukherjee does not sit on Tuesday ...', then the two tables, then the pointer", r?.card.badge?.tone === "closed" && r?.card.status?.text === "No: Dr. Avisek Mukherjee does not sit on Tuesday: Dental OPD 29 sees procedures and emergency cases only that day." && r?.card.extraTables?.length === 2 && /Emergency Department/.test(r?.card.suggestion ?? ""), jc(r).slice(0, 240));
  r = await ask("is dr mukherjee of dental available on friday");
  ok("Dental Friday: green Yes, Open", r?.card.badge?.tone === "open" && /^Yes: Dr\. Avisek Mukherjee is listed in Dental OPD 29 on Friday/.test(r?.card.status?.text ?? ""), jc(r).slice(0, 200));
  // today, out of visiting time: a red No that also says the doctor is listed (it used to be a red box that began with "Yes")
  r = await askAt("is dr sumit mukherjee available today", "2026-10-26T15:00:00");
  ok("Monday 3 PM, between the sessions: 'No: The OPD is closed at this moment ...' and the doctor is listed today", r?.card.status?.tone === "closed" && /^No: The OPD is closed at this moment/.test(r?.card.status?.text ?? "") && /Dr\. Sumit Mukherjee is listed in Psychiatry OPD 1 today\./.test(r?.card.status?.text ?? "") && !/^Yes/.test(r?.card.status?.text ?? "") && r?.card.suggestion === URGENT, jc(r).slice(0, 260));
  r = await askAt("is dr sumit mukherjee available today", "2026-10-26T09:30:00");
  ok("Monday 9:30 AM, in session: 'Yes: Dr. Sumit Mukherjee is listed in Psychiatry OPD 1 on Monday ...', green", r?.card.status?.tone === "open" && /^Yes: /.test(r?.card.status?.text ?? ""), jc(r).slice(0, 200));
  r = await askAt("is dr sumit mukherjee available today", "2026-10-26T20:00:00");
  ok("Monday 8 PM, hours over: 'No: Today's OPD hours are over ...'", /^No: Today's OPD hours are over/.test(r?.card.status?.text ?? ""), jc(r).slice(0, 200));

  // one bracket, not two
  r = await ask("opd days of dr shyam");
  const cells = (r?.card.extraTables ?? []).flatMap((x) => x.table.rows.flat());
  ok("Surgery OPD 17: 'Dr. Dharmendra Kumar (Tuesday, Thursday and Saturday; not on the current doctor list)'", cells.includes("Dr. Dharmendra Kumar (Tuesday, Thursday and Saturday; not on the current doctor list)"), JSON.stringify(cells));
  ok("...and no cell has two brackets side by side", !cells.some((c) => /\)\s*\(/.test(c)), JSON.stringify(cells));
  ok("...a colleague whose days differ and who is on the list keeps one bracket: 'Dr. Shyamal Hansda (Tuesday, Thursday and Saturday)'", cells.includes("Dr. Shyamal Hansda (Tuesday, Thursday and Saturday)"));

  // a slip of one letter in a name of six letters or more
  r = await ask("opd days of rupak gosami");
  ok("'rupak gosami' (a letter missing) is Dr. Rupak Kumar Goswami, not the list of departments", has(r, "rupak kumar goswami", "ent opd 11") && r?.card.title === "Dr. Rupak Kumar Goswami: OPD days", jc(r).slice(0, 160));
  r = await ask("opd days of rupak goswamy");
  ok("'goswamy' (a letter wrong) is found too", r?.card.title === "Dr. Rupak Kumar Goswami: OPD days", jc(r).slice(0, 120));
  r = await ask("opd days of sutanu sarkar");
  ok("'sutanu sarkar' is Dr. Sutanu Sarkar (as the live screen showed)", r?.card.title === "Dr. Sutanu Sarkar: OPD days", jc(r).slice(0, 120));
  r = await ask("opd days of rupak gozami");
  ok("two letters wrong ('gozami'): said plainly that nobody has that name, with a hint, not a list of departments", r?.card.title === "Which doctor?" && has(r, "could not find a doctor named", "rupak gozami", "check the spelling"), all(r).slice(0, 200));
  r = await ask("which days does dr kamla sit");
  ok("with 'dr' the same: nobody named Kamla", has(r, "could not find a doctor named", "kamla"), all(r).slice(0, 160));
  ok("a plain 'opd days of medicine' is still the department, not a doctor's name", has(await ask("opd days of medicine"), "medicine") && !has(await ask("opd days of medicine"), "could not find a doctor"));
  ok("'opd days of the hospital' is not taken for a doctor's name", !has(await ask("opd days of the hospital"), "could not find a doctor"));
  ok("a question word is never matched to a name by the one-letter rule (monday is one letter off Mondal)", !has(await ask("is dr ajit karmakar in opd on monday"), "mondal") && (await ask("medicine opd monday"))?.card.title.startsWith("Medicine OPD") === true);

  // ======================================================================================================================================
  // STEP 54d: "every Sunday"; a No says WHEN he is available (a banner with the nearest date); "is opd open on monday?" is not yet a clear Yes: which department? which unit?
  // ======================================================================================================================================
  const hl = (r2: Awaited<ReturnType<typeof ask>>) => r2?.card.highlight ?? "";
  // ---- "every Sunday"
  r = await ask("is opd open on sunday");
  ok("Sunday: exactly the owner's sentence, with 'every'", r?.card.status?.text === "No: The OPD is closed on every Sunday, 25 October 2026: Sunday." && r?.card.badge?.tone === "closed" && !r?.ask, jc(r).slice(0, 200));
  r = await ask("is opd open on 1 november 2026");
  ok("any other Sunday: 'closed on every Sunday, 1 November 2026: Sunday'", r?.card.status?.text === "No: The OPD is closed on every Sunday, 1 November 2026: Sunday.", jc(r).slice(0, 160));
  ok("a department asked on a Sunday: 'every Sunday' too", /closed on every Sunday/.test((await ask("is medicine opd open on sunday"))?.card.status?.text ?? "") && /closed on every Sunday/.test((await ask("medicine opd sunday"))?.card.status?.text ?? "") && /closed on every Sunday/.test((await ask("is dr ajit karmakar available on sunday"))?.card.status?.text ?? ""));
  ok("a holiday that is not a Sunday has no 'every': 'closed on Tuesday, 26 January 2027: Republic Day'", /closed on Tuesday, 26 January 2027/.test((await ask("is opd open on 26 january 2027"))?.card.status?.text ?? "") && !/every/.test((await ask("is opd open on 26 january 2027"))?.card.status?.text ?? ""));
  ok("the closure rules and the timings say 'every Sunday'", has(await ask("when is opd closed"), "every sunday") && has(await ask("opd timing"), "closed on every sunday"));

  // ---- a No says when he is available: a banner of its own, with the nearest date (it is not repeated as a bullet)
  r = await ask("is dr mukherjee of dental available on tuesday?");
  ok("Dental doctor, Tuesday: the banner 'Dr. Avisek Mukherjee sits in Dental OPD 29 on Monday and Friday. Nearest: Monday, 26 October 2026 (tomorrow).'", hl(r) === "Dr. Avisek Mukherjee sits in Dental OPD 29 on Monday and Friday. Nearest: Monday, 26 October 2026 (tomorrow).", hl(r));
  ok("...right after the verdict (the card has it), and the same sentence is not a bullet any more", !!r?.card.highlight && !(r?.card.lines ?? []).some((l) => /sits in Dental OPD 29/.test(l)));
  r = await ask("is doctor karmakar of medicine available on next tuesday?");
  ok("Karmakar, Tuesday: 'Dr. Ajit Karmakar sits in Medicine Unit II on Monday and Thursday. Nearest: Monday, 26 October 2026 (tomorrow).'", hl(r) === "Dr. Ajit Karmakar sits in Medicine Unit II on Monday and Thursday. Nearest: Monday, 26 October 2026 (tomorrow).", hl(r));
  r = await ask("is dr ajit karmakar available on sunday");
  ok("a closed day: still the banner (the OPD is closed that day, but when does he sit?)", r?.card.status?.tone === "closed" && /Nearest: Monday, 26 October 2026 \(tomorrow\)/.test(hl(r)), jc(r).slice(0, 200));
  r = await ask("is dr ajit karmakar available on monday");
  ok("a Yes has no banner", r?.card.status?.tone === "open" && !r?.card.highlight);
  ok("a doctor who has retired has no banner (he does not sit)", !(await ask("is dr ranjeet kumar available on tuesday"))?.card.highlight);
  r = await askAt("is dr mukherjee of dental available on tuesday", "2026-12-24T10:00:00");
  ok("the nearest date skips a closed day: Friday 25 December is a holiday, so Monday, 28 December 2026", /Nearest: Monday, 28 December 2026/.test(hl(r)) && !/25 December/.test(hl(r)), hl(r));
  r = await askAt("is dr ajit karmakar available on tuesday", "2026-12-24T10:00:00");
  ok("today counts while a session is ahead: Thursday 24 December at 10:00 is 'today'", /Nearest: Thursday, 24 December 2026 \(today\)/.test(hl(r)), hl(r));
  r = await askAt("is dr ajit karmakar available on tuesday", "2026-12-24T20:00:00");
  ok("...but not after the hours: at 20:00 the nearest is Monday, 28 December 2026", /Nearest: Monday, 28 December 2026/.test(hl(r)), hl(r));
  r = await ask("is medicine unit 2 open on tuesday");
  ok("a unit that does not sit: red No, the banner with its days and the nearest date, and the unit that sits that day", r?.card.status?.tone === "closed" && /^No: Medicine Unit II does not sit on Tuesday/.test(r?.card.status?.text ?? "") && hl(r) === "Medicine Unit II sits on Monday and Thursday. Nearest: Monday, 26 October 2026 (tomorrow)." && r?.card.extraTables?.[0].title === "Sitting on Tuesday, 27 October 2026" && r?.card.extraTables?.[0].table.rows[0][0] === "Unit III", jc(r).slice(0, 260));
  ok("a unit that sits: green Yes, no banner", (await ask("is medicine unit 2 open on monday"))?.card.status?.tone === "open" && !(await ask("is medicine unit 2 open on monday"))?.card.highlight);

  // ---- "is opd open on monday?": not yet a clear Yes
  r = await ask("is opd open on monday?");
  ok("no department: an amber 'Depends' first answer that is not a Yes, with when the day is", r?.card.status?.tone === "unknown" && r?.card.badge?.text === "Depends" && !/^(Yes|No)/.test(r?.card.status?.text ?? "") && /not yet a clear Yes/.test(r?.card.status?.text ?? "") && (r?.card.lines ?? [])[0] === "The coming Monday is 26 October 2026 (today is Sunday).", jc(r).slice(0, 300));
  ok("...it asks which department, in radio mode, with a legend of its own; every department is an option", r?.ask?.mode === "one" && r?.ask?.legend === "Choose the department you want to visit" && r?.ask?.options.length === SCHEDULE.departments.length && /Which department do you want to visit on Monday, 26 October 2026\?/.test(r?.ask?.message ?? ""), JSON.stringify(r?.ask?.options.map((o) => o.label)));
  ok("...the card carries the question as its last line, and the hours", /Which department/.test(r?.card.prompt ?? "") && (r?.card.notes ?? []).length === 3 && r?.summary === r?.ask?.message);
  ok("...Medicine's option says it has units; a department of rooms lists its rooms", r?.ask?.options.find((o) => o.label === "Medicine")?.detail === "Unit I, Unit II, Unit III: you belong to one of these units" && r?.ask?.options.find((o) => o.label === "Surgery")?.detail === "OPD 15, OPD 17, OPD 18");
  ok("...'I am not sure' gives the general OPD and the Emergency Department", /General Medicine OPD/.test(r?.ask?.none.reply ?? "") && /Emergency Department/.test(r?.ask?.none.reply ?? ""), r?.ask?.none.reply);
  r = await ask("is opd open today");
  ok("asked on Sunday 25 October, 'today': it is Sunday, so a clear No (not a question)", /^No: The OPD is closed on every Sunday/.test(r?.card.status?.text ?? "") && !r?.ask);
  r = await askAt("is opd open today", "2026-10-26T10:00:00");
  ok("Monday 10:00, 'today': soft, 'Today is Monday, 26 October 2026', in session until 1 PM", r?.card.status?.tone === "unknown" && (r?.card.lines ?? [])[0] === "Today is Monday, 26 October 2026." && (r?.card.lines ?? []).some((l) => /in session now, until 1 PM/.test(l)) && !!r?.ask, jc(r).slice(0, 260));
  r = await askAt("is opd open today", "2026-10-26T20:00:00");
  ok("Monday 20:00: the hours are over, a clear No at once (whatever the department)", /^No: Today's OPD hours are over/.test(r?.card.status?.text ?? "") && !r?.ask);
  r = await ask("is opd open on 11 november 2026");
  ok("a plant holiday whose closure is not known stays amber 'Not known', with no question", r?.card.status?.tone === "unknown" && r?.card.badge?.text === "Not known" && !r?.ask);
  r = await ask("is opd open on 5 january 2027");
  ok("a year whose holiday data is not loaded: the soft answer says so", !!r?.ask && (r?.card.notes ?? []).some((n2) => /2027 is not loaded/.test(n2)), jc(r).slice(0, 200));
  ok("a statement is not a question: 'opd open on monday' is a clear Yes with its table", (await ask("opd open on monday"))?.card.status?.tone === "open" && /^Yes: /.test((await ask("opd open on monday"))?.card.status?.text ?? "") && !(await ask("opd open on monday"))?.ask);

  // the round trip: EVERY department the person may choose leads to the next step, never to the same question again
  const vague = await ask("is opd open on monday?");
  for (const o of vague?.ask?.options ?? []) {
    const q2 = queryFor(vague!.ask!, [o.id]);
    const r2 = await ask(q2);
    const d = SCHEDULE.departments.find((x) => x.id === o.id)!;
    if (d.kind === "units") ok(`${o.label}: the next step is the question about the UNIT (Monday kept)`, !!r2?.ask && /^Which unit of Medicine do you already belong to\?/.test(r2.ask.message) && /monday/i.test(q2), `${q2} => ${r2?.summary}`);
    else ok(`${o.label}: a clear answer for Monday (kept), no question`, !!r2 && !r2.ask && (r2.card.status?.tone === "open" || r2.card.status?.tone === "closed") && /^(Yes|No): /.test(r2.card.status?.text ?? "") && /monday/i.test(q2), `${q2} => ${r2?.summary?.slice(0, 80)}`);
  }
  r = await ask("is medicine opd open on monday?");
  ok("a department of units named in the question: the unit is asked at once; the units, their days and doctors are shown to choose from", !!r?.ask && r?.ask?.options.map((o) => o.label).join("|") === "Unit I|Unit II|Unit III|I am a new patient (not in any unit yet)" && r?.card.extraTables?.[0].title === "Units of Medicine: find your doctor" && r?.card.status?.tone === "unknown", jc(r).slice(0, 240));
  ok("...each unit option says its days and its current doctors (no retired name)", r?.ask?.options[1].detail === "Monday and Thursday · Dr. Ajit Karmakar" && !/Ranjeet|Dadan/.test(JSON.stringify(r?.ask?.options)) && /Unit II, the unit that sits on Monday, 26 October 2026/.test(r?.ask?.options[3].detail ?? ""), JSON.stringify(r?.ask?.options.map((o) => o.detail)));
  ok("...'I am not sure' tells how a unit is decided", /first visit/.test(r?.ask?.none.reply ?? "") && /new patient/.test(r?.ask?.none.reply ?? ""));
  const unitAsk = r!.ask!;
  const clear: Record<string, [string, string]> = { u0: ["closed", "^No: Medicine Unit I does not sit on Monday"], u1: ["open", "^Yes: Medicine Unit II sits on Monday, 26 October 2026"], u2: ["closed", "^No: Medicine Unit III does not sit on Monday"], new: ["open", "^Yes: You can visit Medicine OPD on Monday, 26 October 2026"] };
  for (const o of unitAsk.options) {
    const q2 = queryFor(unitAsk, [o.id]);
    const r2 = await ask(q2);
    ok(`${o.label}: a clear ${clear[o.id][0] === "open" ? "green Yes" : "red No"} for Monday, and no further question`, !!r2 && !r2.ask && r2.card.status?.tone === clear[o.id][0] && new RegExp(clear[o.id][1]).test(r2.card.status?.text ?? "") && r2.card.badge?.tone === clear[o.id][0], `${q2} => ${r2?.card.status?.text?.slice(0, 90)}`);
  }
  r = await ask(queryFor(unitAsk, ["u0"]));
  ok("Unit I (Wednesday and Saturday) asked for Monday: a No with the banner (nearest Wednesday, 28 October) and the unit that sits on Monday", /Nearest: Wednesday, 28 October 2026/.test(hl(r)) && r?.card.extraTables?.[0].table.rows[0][0] === "Unit II", jc(r).slice(0, 260));
  r = await ask(queryFor(unitAsk, ["new"]));
  ok("a NEW patient on Monday: 'Yes: You can visit Medicine OPD on Monday, 26 October 2026. As a new patient you will be seen by Unit II, the unit that sits that day, and you will belong to it from then on.'", r?.card.status?.text === "Yes: You can visit Medicine OPD on Monday, 26 October 2026. As a new patient you will be seen by Unit II, the unit that sits that day, and you will belong to it from then on.", r?.card.status?.text);
  ok("...the banner: the first visit decides the unit; know the others before you go", hl(r) === "Your first visit decides your unit: on Monday, 26 October 2026 it is Unit II. Know the other units before you go.", hl(r));
  ok("...the unit that sits that day (room, doctor) and ALL units (unit, days, room, doctor), without any retired name", r?.card.extraTables?.[0].title === "Unit II on Monday, 26 October 2026" && JSON.stringify(r?.card.extraTables?.[0].table.rows) === JSON.stringify([["OPD 25", "Dr. Ajit Karmakar"], ["OPD 26", "Any doctor who is available"]]) && r?.card.extraTables?.[1].title === "All units of Medicine: know them before you go" && r?.card.extraTables?.[1].table.columns.join("|") === "Unit|Days|Room|Doctor" && !/Ranjeet|Dadan/.test(JSON.stringify(r?.card.extraTables)), jc(r).slice(0, 400));
  ok("...ALL units: each unit once with its days, and the three days-pairs are there", ["Wednesday and Saturday", "Monday and Thursday", "Tuesday and Friday"].every((dd) => r?.card.extraTables?.[1].table.rows.some((row) => row[1] === dd)));
  ok("a new patient on a Sunday: a clear No whoever he is", /^No: The OPD is closed on every Sunday/.test((await ask("is Medicine OPD (new patient) open on sunday"))?.card.status?.text ?? ""));
  ok("a new patient asked on Tuesday is told Unit III", /seen by Unit III/.test((await ask("is Medicine OPD (new patient) open on tuesday"))?.card.status?.text ?? "") && /on Tuesday, 27 October 2026 it is Unit III/.test(hl(await ask("is Medicine OPD (new patient) open on tuesday"))));
  ok("a statement about a department of units is still just the table: 'medicine opd monday'", !(await ask("medicine opd monday"))?.ask && (await ask("medicine opd monday"))?.card.table?.rows.length === 2);

  // ---- things that are NOT this route must be left alone
  for (const q of [
    "list all executives in M&HS", "how many doctors in M&HS", "holidays in 2026", "restricted holidays in March and April 2026", "rupak goswami", "ticket of dr ajit karmakar",
    "dr ajit karmakar designation", "who is more senior dr ajit karmakar or dr rajeev kumar", "what is the mediclaim opd reimbursement limit", "opd referral circular",
    "health check-up on 5 january 2026", "who has the health check-up on 15 january 2025", "when is Diwali in 2026", "how many executives in C&IT", "", "   ",
  ]) {
    ok(`left alone: "${q}"`, (await ask(q)) === null, all(await ask(q)).slice(0, 120));
  }
  // it never throws
  for (const q of ["opd opd opd", "OPD ???", "dr", "opd 0", "opd 1000000", "a".repeat(5000)]) {
    let threw = false;
    try { await ask(q); } catch { threw = true; }
    ok(`never throws: "${q.slice(0, 20)}"`, !threw);
  }
  console.log(`hospital engine selftest: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main();
