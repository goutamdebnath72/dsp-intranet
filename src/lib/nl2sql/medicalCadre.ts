// src/lib/nl2sql/medicalCadre.ts
//
// Doctors and non-medical executives (step 46a).
//
// The hospital (M&HS) has two cadres of executives with PARALLEL designations. Checked on the live data, 24 Oct 2026, on the main hospital's 63 executives:
//   medical (40):    Director(M&HS) 1, Joint Director 11, Sr. Deputy Director 13, Asst. Director/Sr. Consultant 4, DMO/Consultant 3, ADMO/Specialist 1, Medical Officer 7
//   managerial (23): Director In-charge 1, Dy. General Manager 1, Asst. General Manager 4, Sr. Manager 12, Dy. Manager 2, Asst. Manager 3
//   "Dr" at the start of a name: 0 of the 63. The data does NOT carry the title, so a doctor is never found by name: nlq.employees.is_doctor (the medical track OR doctor_override, step 48b) is the signal.
// Nothing here knows a title: the track comes from the designation table (dg.track), so a new medical title needs no change.

/** A question about doctors or non-medical executives (the search model then gets DOCTOR_DOC; every other question's prompt is untouched: the prompt has a size limit). */
export const isDoctorQuestion = (q: string): boolean =>
  /\b(doctors?|physicians?|non[- ]?medical|not (?:a )?doctors?|medical (?:staff|executives?|cadre)|dnb|drnb|mbbs)\b/i.test(q || "") || /\bdr\b\.?\s*[a-z]/i.test(q || "");

/** A doctor question that names a QUALIFICATION (DNB, MD, MS, MBBS ...): only then does the model get QUALIFICATION_DOC (the doctor prompt has only about 60 characters of budget to spare, see medicalCadre.selftest.ts). */
export const isQualificationQuestion = (q: string): boolean =>
  isDoctorQuestion(q) && /\b(dnb|drnb|mbbs|mch|dm|md|ms|mds|dgo|dpm|dih|mrcog|qualif\w*|degrees?|diplomas?|post ?graduates?)\b/i.test(q || "");

/** "DNB doctors" once came back as ALL 52 doctors (the model used is_doctor): the directory holds no qualification. */
export const QUALIFICATION_DOC = `QUALIFICATIONS (DNB, DrNB, MD, MS, MBBS, MCh ...) are NOT in the directory, and is_doctor is not one: "DNB doctors" is NOT "doctors". Return sql = null with unanswerable_reason = "The employee directory does not record qualifications."
`;

export const DOCTOR_DOC = `DOCTORS AND NON-MEDICAL EXECUTIVES -- the hospital's executives are two cadres with PARALLEL designations, told apart by the column nlq.employees.is_doctor (true / false):
  doctors = is_doctor (the medical track: Director(M&HS), Joint Director, Sr. Deputy Director, Asst. Director/Sr. Consultant, DMO/Consultant, ADMO/Specialist, Medical Officer, AND the few doctors whose designation is a normal managerial one, flagged in the roster)
  non-medical executives = NOT is_doctor (the normal ED, GM, DGM, AGM, Sr. Manager, Manager, Asst. Manager ... titles)
  Names do NOT carry "Dr" in the data (checked: none of the main hospital's 63 executives): NEVER find a doctor by name, and never by designation_track alone (a doctor can carry a managerial designation, a Sr. Manager who is an eye specialist): always by is_doctor.
  A "Dr" or "Dr." before a name is a TITLE added on the screen: names are stored WITHOUT it. Leave it out when matching a name ("Dr. Anil Kumar" means the name "Anil Kumar") and do not add is_doctor unless the question asks for doctors.
  "doctors" alone means every doctor of the plant: add NO department condition. A department the question names (main hospital, M&HS ...) is a second, separate condition, written as the question's department ids say.
  A designation the question also names ("Joint Directors", "Medical Officers") is a third condition, found by its title as usual.
  Example -- "how many doctors are there in each designation": SELECT designation, count(*) AS count FROM nlq.employees WHERE cohort = 'executive' AND is_doctor GROUP BY designation, rank_order ORDER BY rank_order
`;

/**
 * The first line of a list of people: "63 people found." and, when the WHOLE list is loaded, every person's track is known and both cadres are in it,
 * "63 people found: 40 doctors and 23 non-medical." A partly loaded list (more than the page holds) never gets a split: it would count only what is on screen.
 */
export function peopleHeadline(total: number, truncated: boolean, people: ReadonlyArray<unknown> | null | undefined): string {
  const base = `${total.toLocaleString()} ${total === 1 ? "person" : "people"} found`;
  if (truncated || !people || people.length === 0 || people.length !== total) return base + ".";
  const tracks = people.map((p) => (p as { designationTrack?: unknown } | null)?.designationTrack);
  if (tracks.some((t) => typeof t !== "string" || !t)) return base + ".";
  // a doctor: the medical track or flagged in the roster (a managerial designation, but a doctor): the person carries isDoctor
  const doctors = people.filter((p) => (p as { isDoctor?: unknown } | null)?.isDoctor === true).length;
  const others = tracks.length - doctors;
  if (!doctors || !others) return base + ".";
  return `${base}: ${doctors} ${doctors === 1 ? "doctor" : "doctors"} and ${others} non-medical.`;
}
