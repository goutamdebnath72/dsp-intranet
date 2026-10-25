// src/lib/hospital/discipline.ts
//
// A doctor's DISCIPLINE (step 53a): Medicine, Surgery, ENT, Orthopaedics ... shown as a chip beside "EXE" on the person's card and as a "Discipline" column in the table.
// It is stated only when it is KNOWN: it comes from the qualification the hospital's staff list prints (MD(MEDICINE), MS(ENT), D.ORTHO, MDS, DGO ...), kept in data/hospital_staff.json
// as the field `discipline` of the person, which can be edited by hand. A doctor with MBBS alone, or one the staff list does not have, gets NO chip and NO value (never a guess).
// The person is found by TICKET (the roster's ticket number), and only for a doctor.

import { STAFF } from "./opdData";

const NAMES: Record<string, string> = {
  MEDICINE: "Medicine", SURGERY: "Surgery", ORTHO: "Orthopaedics", OPHTHALMOLOGY: "Ophthalmology", ENT: "ENT", DERMATOLOGY: "Dermatology", PSYCHIATRY: "Psychiatry",
  PAEDIATRICS: "Paediatrics", CHEST: "Chest medicine", ANAESTHESIOLOGY: "Anaesthesiology", PATHOLOGY: "Pathology", BIOCHEMISTRY: "Biochemistry", RADIOLOGY: "Radiology",
  "O&G": "Obstetrics and Gynaecology", "COMMUNITY MEDICINE": "Community medicine", "TRANSFUSION-MEDICINE": "Transfusion medicine",
};
const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s-])([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase());

/** The discipline a printed qualification states, or null when it states none (MBBS alone, "MS" with no subject). */
export function disciplineFromQualification(q: string | null | undefined): string | null {
  const u = String(q ?? "").toUpperCase().replace(/\s+/g, " ").trim();
  if (!u) return null;
  if (/PLASTIC SURGERY/.test(u)) return "Plastic surgery";
  const m = /\b(?:MD|MS|DNB)\s*\(([^)]+)\)/.exec(u);
  if (m) return NAMES[m[1].trim()] ?? titleCase(m[1].trim());
  if (/^D\.?\s?ORTHO/.test(u)) return "Orthopaedics";
  if (/\bMDS\b/.test(u)) return "Dental surgery";
  if (/\bDGO\b/.test(u)) return "Obstetrics and Gynaecology (DGO)";
  if (/\bMRCOG\b/.test(u)) return "Obstetrics and Gynaecology (MRCOG)";
  if (/\bDPM\b/.test(u)) return "Psychiatry (DPM)";
  if (/\bDIH\b/.test(u)) return "Industrial health (DIH)";
  return null;
}

const BY_TICKET = new Map<string, string>();
for (const p of STAFF.people) if (p.role === "doctor" && p.ticket && p.discipline) BY_TICKET.set(p.ticket, p.discipline);

/** The discipline of the doctor with this roster ticket, or null when it is not known. */
export function disciplineOfTicket(ticket: unknown): string | null {
  return BY_TICKET.get(String(ticket ?? "").trim()) ?? null;
}
