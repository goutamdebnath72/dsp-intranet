// src/lib/hospital/nonPermanentDoctors.ts
//
// The NON-PERMANENT (contractual or temporary) doctors of the hospital, kept apart from the permanent doctors (step 52a).
//
// WHAT IS HERE: every doctor of the intranet's "Select Doctor" list whose number is not a plain 6-digit ticket: "D" + 6 digits (51 doctors) or "DTN" + digits (15 doctors), 66 in all
// (read from the list the owner showed on 24 Oct 2026). The owner's rule: a permanent doctor has a ticket of at most 6 digits; a non-permanent doctor's number has letters first.
// Not here: Dr. Manish Kumar (listed as D490196: a stray D, he is permanent with ticket 490196) and Dr. Debdip Saha 490107 (permanent); the doctor of the same name with D499964 IS here.
//
// HOW IT GROWS: the SPECIALIZATION (and the department, the qualification) of most of these doctors is not known yet. When the owner collects it, edit the entry: set `specialization`
// (and `department`, `qualification`); nothing else needs to change. `staffId` links an entry to the person in data/hospital_staff.json when the hospital's staff list or the OPD schedule has him
// or her (then the department and the qualification come from there). A doctor who turns out to be permanent: delete the entry and give him or her the ticket in hospital_staff.json.
// Why a TypeScript file and not a database table: the list is short and edited by hand, the compiler checks every edit, no SQL migration is needed, and it can move into a table later
// (when there is an admin screen) without changing the questions that use it.

import type { Person } from "./opdData";

export interface NonPermanentDoctor {
  id: string;
  /** The name as the intranet doctor list prints it (without "Dr"). */
  name: string;
  /** The number the intranet doctor list shows: "D" + 6 digits or "DTN" + digits. */
  listId: string;
  kind: "D" | "DTN";
  department: string | null;
  qualification: string | null;
  /** null = not collected yet. */
  specialization: string | null;
  /** The person in data/hospital_staff.json, when the hospital's own lists have this doctor. */
  staffId: string | null;
  note: string | null;
}

export const NON_PERMANENT_DOCTORS: NonPermanentDoctor[] = [
  { id: "a-k-sahay-dtn0766", name: "A K SAHAY", listId: "DTN0766", kind: "DTN", department: "Surgery", qualification: "MCH & DRNB PLASTIC SURGERY", specialization: "Plastic surgery", staffId: "a-k-sahay", note: "the staff list spells the name 'capt.a.k.sahay'" },
  { id: "abhishek-mandal-dtn00763", name: "ABHISHEK MANDAL", listId: "DTN00763", kind: "DTN", department: "Surgery", qualification: "MS(SURGERY)", specialization: "Surgery", staffId: "abhishek-mandal", note: "the staff list spells the name 'Avishek Mondal'" },
  { id: "ajay-varghese-d499962", name: "AJAY VARGHESE", listId: "D499962", kind: "D", department: null, qualification: null, specialization: null, staffId: null, note: null },
  { id: "akash-kumar-rai-d499959", name: "AKASH KUMAR RAI", listId: "D499959", kind: "D", department: null, qualification: null, specialization: null, staffId: null, note: null },
  { id: "aluka-chaitanya-d490174", name: "ALUKA CHAITANYA", listId: "D490174", kind: "D", department: null, qualification: null, specialization: null, staffId: null, note: null },
  { id: "apoorv-deokuliar-d490097", name: "APOORV DEOKULIAR", listId: "D490097", kind: "D", department: null, qualification: null, specialization: null, staffId: null, note: null },
  { id: "arunima-datta-d499960", name: "ARUNIMA DATTA", listId: "D499960", kind: "D", department: null, qualification: null, specialization: null, staffId: null, note: null },
  { id: "arunima-mallick-dtn0459", name: "ARUNIMA MALLICK", listId: "DTN0459", kind: "DTN", department: "Anaesthesiology", qualification: "MD(ANAESTHESIOLOGY)", specialization: "Anaesthesiology", staffId: "arunima-mallick", note: "matched to the staff list's 'Dr. A. Mallick' (Anaesthesiology) by the initial only: to be confirmed" },
  { id: "ashwini-kumar-panda-d490099", name: "ASHWINI KUMAR PANDA", listId: "D490099", kind: "D", department: null, qualification: null, specialization: null, staffId: null, note: null },
  { id: "atul-pradhan-d490103", name: "ATUL PRADHAN", listId: "D490103", kind: "D", department: null, qualification: null, specialization: null, staffId: null, note: null },
  { id: "avirupa-k-banik-dtn00754", name: "AVIRUPA K.BANIK", listId: "DTN00754", kind: "DTN", department: null, qualification: null, specialization: null, staffId: null, note: null },
  { id: "bedaprakash-dash-d490019", name: "BEDAPRAKASH DASH", listId: "D490019", kind: "D", department: null, qualification: null, specialization: null, staffId: null, note: null },
  { id: "biswanath-bandyopadhyay-d499957", name: "BISWANATH BANDYOPADHYAY", listId: "D499957", kind: "D", department: null, qualification: null, specialization: null, staffId: null, note: null },
  { id: "c-karunasree-d499916", name: "C KARUNASREE", listId: "D499916", kind: "D", department: null, qualification: null, specialization: null, staffId: null, note: null },
  { id: "cheekolu-bhanu-supriya-d490025", name: "CHEEKOLU BHANU SUPRIYA", listId: "D490025", kind: "D", department: null, qualification: null, specialization: null, staffId: null, note: null },
  { id: "daisy-bhengra-dtn00725", name: "DAISY BHENGRA", listId: "DTN00725", kind: "DTN", department: "MOPD", qualification: "MBBS", specialization: null, staffId: "daisy-bhengra", note: null },
  { id: "debdip-saha-d499964", name: "DEBDIP SAHA", listId: "D499964", kind: "D", department: null, qualification: null, specialization: null, staffId: null, note: null },
  { id: "deepsikha-patro-d490172", name: "DEEPSIKHA PATRO", listId: "D490172", kind: "D", department: null, qualification: null, specialization: null, staffId: null, note: null },
  { id: "dipendra-singh-d490169", name: "DIPENDRA SINGH", listId: "D490169", kind: "D", department: null, qualification: null, specialization: null, staffId: null, note: null },
  { id: "divya-pherwani-d490013", name: "DIVYA PHERWANI", listId: "D490013", kind: "D", department: null, qualification: null, specialization: null, staffId: null, note: null },
  { id: "gauri-arun-mankar-d499970", name: "GAURI ARUN MANKAR", listId: "D499970", kind: "D", department: null, qualification: null, specialization: null, staffId: null, note: null },
  { id: "gourav-mukherjee-dtn0767", name: "GOURAV MUKHERJEE", listId: "DTN0767", kind: "DTN", department: "Chest", qualification: "MD(CHEST)", specialization: "Chest medicine", staffId: "gourav-mukherjee", note: null },
  { id: "gowra-gopal-d490096", name: "GOWRA GOPAL", listId: "D490096", kind: "D", department: null, qualification: null, specialization: null, staffId: null, note: null },
  { id: "kalyan-chakrabarti-dtn0539", name: "KALYAN CHAKRABARTI", listId: "DTN0539", kind: "DTN", department: "Gynae & Obs", qualification: "MBBS,DGO", specialization: "Obstetrics and Gynaecology (DGO)", staffId: "kalyan-chakrabarti", note: "the staff list spells the name 'Kalyan Chakraborty'" },
  { id: "khooshbu-gayen-dtn00756", name: "KHOOSHBU GAYEN", listId: "DTN00756", kind: "DTN", department: "Dental", qualification: "MDS", specialization: "Dental surgery", staffId: "khooshbu-gayen", note: "the staff list spells the name 'Khoosbu Gayen'" },
  { id: "kommerla-dorathy-d490124", name: "KOMMERLA DORATHY", listId: "D490124", kind: "D", department: null, qualification: null, specialization: null, staffId: null, note: null },
  { id: "kumud-sahu-d490014", name: "KUMUD SAHU", listId: "D490014", kind: "D", department: null, qualification: null, specialization: null, staffId: null, note: null },
  { id: "lalam-sree-chandan-d490128", name: "LALAM SREE CHANDAN", listId: "D490128", kind: "D", department: null, qualification: null, specialization: null, staffId: null, note: null },
  { id: "madhur-pantola-d499915", name: "MADHUR PANTOLA", listId: "D499915", kind: "D", department: null, qualification: null, specialization: null, staffId: null, note: null },
  { id: "madhurima-das-d490119", name: "MADHURIMA DAS", listId: "D490119", kind: "D", department: null, qualification: null, specialization: null, staffId: null, note: null },
  { id: "mahendra-kumar-pandey-d499917", name: "MAHENDRA KUMAR PANDEY", listId: "D499917", kind: "D", department: null, qualification: null, specialization: null, staffId: null, note: null },
  { id: "mude-tapani-d490021", name: "MUDE TAPANI", listId: "D490021", kind: "D", department: null, qualification: null, specialization: null, staffId: null, note: null },
  { id: "n-yansaroni-ngullie-d490100", name: "N YANSARONI NGULLIE", listId: "D490100", kind: "D", department: null, qualification: null, specialization: null, staffId: null, note: null },
  { id: "navin-yadav-dtn0456", name: "NAVIN YADAV", listId: "DTN0456", kind: "DTN", department: "Orthopaedics", qualification: "D.ORTHO", specialization: "Orthopaedics", staffId: "navin-yadav", note: null },
  { id: "nazia-naseem-d490015", name: "NAZIA NASEEM", listId: "D490015", kind: "D", department: null, qualification: null, specialization: null, staffId: null, note: null },
  { id: "neeldeep-kumar-panigrahi-d490098", name: "NEELDEEP KUMAR PANIGRAHI", listId: "D490098", kind: "D", department: null, qualification: null, specialization: null, staffId: null, note: null },
  { id: "p-m-praveen-d490168", name: "P M PRAVEEN", listId: "D490168", kind: "D", department: null, qualification: null, specialization: null, staffId: null, note: null },
  { id: "palla-satya-sudheer-d499958", name: "PALLA SATYA SUDHEER", listId: "D499958", kind: "D", department: null, qualification: null, specialization: null, staffId: null, note: null },
  { id: "pogula-siddartha-d490017", name: "POGULA SIDDARTHA", listId: "D490017", kind: "D", department: null, qualification: null, specialization: null, staffId: null, note: null },
  { id: "praveen-garg-d490173", name: "PRAVEEN GARG", listId: "D490173", kind: "D", department: null, qualification: null, specialization: null, staffId: null, note: null },
  { id: "priyanka-roy-dtn00670", name: "PRIYANKA ROY", listId: "DTN00670", kind: "DTN", department: "Gynae & Obs", qualification: "MS", specialization: null, staffId: "priyanka-roy", note: null },
  { id: "purra-nikesh-d499914", name: "PURRA NIKESH", listId: "D499914", kind: "D", department: null, qualification: null, specialization: null, staffId: null, note: null },
  { id: "rahul-ashok-salunkhe-d499956", name: "RAHUL ASHOK SALUNKHE", listId: "D499956", kind: "D", department: null, qualification: null, specialization: null, staffId: null, note: null },
  { id: "rahul-kumar-dtn00769", name: "RAHUL KUMAR", listId: "DTN00769", kind: "DTN", department: null, qualification: null, specialization: null, staffId: null, note: null },
  { id: "ritu-d490121", name: "RITU", listId: "D490121", kind: "D", department: null, qualification: null, specialization: null, staffId: null, note: null },
  { id: "samsudheen-k-d490022", name: "SAMSUDHEEN K", listId: "D490022", kind: "D", department: null, qualification: null, specialization: null, staffId: null, note: null },
  { id: "sandeep-raghunath-nedre-d490170", name: "SANDEEP RAGHUNATH NEDRE", listId: "D490170", kind: "D", department: null, qualification: null, specialization: null, staffId: null, note: null },
  { id: "shaik-rumman-d490122", name: "SHAIK RUMMAN", listId: "D490122", kind: "D", department: null, qualification: null, specialization: null, staffId: null, note: null },
  { id: "shama-naaz-d490104", name: "SHAMA NAAZ", listId: "D490104", kind: "D", department: null, qualification: null, specialization: null, staffId: null, note: null },
  { id: "shreyashi-d499963", name: "SHREYASHI", listId: "D499963", kind: "D", department: null, qualification: null, specialization: null, staffId: null, note: null },
  { id: "shubha-singh-d490018", name: "SHUBHA SINGH", listId: "D490018", kind: "D", department: null, qualification: null, specialization: null, staffId: null, note: null },
  { id: "shweta-moreshwar-bawankar-d490127", name: "SHWETA MORESHWAR BAWANKAR", listId: "D490127", kind: "D", department: null, qualification: null, specialization: null, staffId: null, note: null },
  { id: "shyamal-hansda-dtn00795", name: "SHYAMAL HANSDA", listId: "DTN00795", kind: "DTN", department: "Surgery", qualification: "MS(SURGERY)", specialization: "Surgery", staffId: "shyamal-hansda", note: null },
  { id: "siddhartha-shankar-acharya-d490125", name: "SIDDHARTHA SHANKAR ACHARYA", listId: "D490125", kind: "D", department: null, qualification: null, specialization: null, staffId: null, note: null },
  { id: "siva-prasad-botla-d499913", name: "SIVA PRASAD BOTLA", listId: "D499913", kind: "D", department: null, qualification: null, specialization: null, staffId: null, note: null },
  { id: "somika-mitharwal-d490171", name: "SOMIKA MITHARWAL", listId: "D490171", kind: "D", department: null, qualification: null, specialization: null, staffId: null, note: null },
  { id: "soumitra-chakraborty-d499912", name: "SOUMITRA CHAKRABORTY", listId: "D499912", kind: "D", department: null, qualification: null, specialization: null, staffId: null, note: null },
  { id: "sudipta-kundu-d490012", name: "SUDIPTA KUNDU", listId: "D490012", kind: "D", department: null, qualification: null, specialization: null, staffId: null, note: null },
  { id: "suhit-kar-d490120", name: "SUHIT KAR", listId: "D490120", kind: "D", department: null, qualification: null, specialization: null, staffId: null, note: null },
  { id: "sulagna-lala-d499961", name: "SULAGNA LALA", listId: "D499961", kind: "D", department: null, qualification: null, specialization: null, staffId: null, note: null },
  { id: "sumit-damodhar-mungre-d490123", name: "SUMIT DAMODHAR MUNGRE", listId: "D490123", kind: "D", department: null, qualification: null, specialization: null, staffId: null, note: null },
  { id: "tapati-pradhan-dtn00757", name: "TAPATI PRADHAN", listId: "DTN00757", kind: "DTN", department: "Surgery", qualification: "MBBS", specialization: null, staffId: "tapati-pradhan", note: "the staff list spells the name 't.pradhan'" },
  { id: "tarundeb-gupta-d490101", name: "TARUNDEB GUPTA", listId: "D490101", kind: "D", department: null, qualification: null, specialization: null, staffId: null, note: null },
  { id: "thara-gopinath-dtn00752", name: "THARA GOPINATH", listId: "DTN00752", kind: "DTN", department: "MOPD", qualification: "MBBS", specialization: null, staffId: "thara-gopinath", note: null },
  { id: "titas-chakraborty-dtn0455", name: "TITAS CHAKRABORTY", listId: "DTN0455", kind: "DTN", department: "Surgery", qualification: "MBBS", specialization: null, staffId: "titas-chakraborty", note: null },
  { id: "vimukta-kumari-d490020", name: "VIMUKTA KUMARI", listId: "D490020", kind: "D", department: null, qualification: null, specialization: null, staffId: null, note: null },
];

const byStaffId = new Map(NON_PERMANENT_DOCTORS.filter((d) => d.staffId).map((d) => [d.staffId as string, d]));
/** The non-permanent record of a person of hospital_staff.json, if he or she is one. */
export const nonPermanentOf = (staffId: string): NonPermanentDoctor | undefined => byStaffId.get(staffId);

/** The entries the hospital's own lists do not have, as people, so that a question about them finds them (their OPD days are not known). */
export function unlistedAsPeople(): Person[] {
  return NON_PERMANENT_DOCTORS.filter((d) => !d.staffId).map((d) => ({
    id: `np-${d.listId.toLowerCase()}`, name: d.name, title: "Dr", department: d.department ?? "", qualification: d.qualification, role: "doctor" as const,
    printed: [d.name], employment: "contractual" as const, ticket: null, doctorListId: d.listId, status: "current" as const, note: d.note,
  }));
}

/** Problems in this file (empty when it is consistent). */
export function validateNonPermanent(known: Set<string>): string[] {
  const out: string[] = [];
  const ids = new Set<string>();
  for (const d of NON_PERMANENT_DOCTORS) {
    if (ids.has(d.id)) out.push(`two entries share the id ${d.id}`);
    ids.add(d.id);
    if (!/^D\d{6}$/.test(d.listId) && !/^DTN\d+$/.test(d.listId)) out.push(`${d.id}: ${d.listId} is not a D or DTN number`);
    if ((d.kind === "D") !== /^D\d{6}$/.test(d.listId)) out.push(`${d.id}: kind ${d.kind} does not fit ${d.listId}`);
    if (d.staffId && !known.has(d.staffId)) out.push(`${d.id}: staffId ${d.staffId} is not in the staff file`);
  }
  return out;
}
