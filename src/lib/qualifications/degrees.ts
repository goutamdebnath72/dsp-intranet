// src/lib/qualifications/degrees.ts
//
// THE TABLE OF DEGREES: what each one is called and what LEVEL it is (step 58a).
// Owner, 26 Oct 2026: "the system does not understand what post graduate means ... we need to teach it all the graduate degrees, that post graduate means a higher degree than graduate, and the
// list of all the PG degrees". Until now the system knew a flat list of letters (MD, MS, DNB ...) and a pattern for "postgraduate": it listed MBBS doctors for "post graduate degree on medicine".
//
// The LEVELS, lowest to highest (a question says "post graduate": every degree ABOVE graduate counts):
//   certificate    school and trade certificates (Class X, Class XII, ITI)
//   diploma        a diploma BELOW graduate level (polytechnic engineering, D.Pharm, GNM ...)
//   graduate       a bachelor's degree, or a professional degree of the same level (MBBS, BDS, B.Tech, BCA, B.Com, LLB ...)
//   postgraduate   a master's degree, or higher than graduate: MD, MS, DNB, MDS, M.Tech, MCA, MBA, M.Sc, LLM ... and every POST-graduate diploma (DGO, DPM, PGDM, PGDCA ...)
//   superspecialty above MD / MS: DM, MCh, DrNB, FNB
//   doctorate      PhD, DSc, D.Litt ...
// Note: an MD is a POSTGRADUATE degree although it is called "Doctor of Medicine"; a doctorate is a PhD-type degree.
//
// HOW TO EDIT: one line per degree, d(abbreviation, full name, level, segment, [other ways it is written], "what to confirm", "a note"). The abbreviation, the full name and every other spelling are matched
// without dots, spaces or capitals ("M.B.B.S." = "mbbs"). A line with a `confirm` text is one the author was NOT sure of: it is listed at the top of docs/QUALIFICATION_LEVELS.md for the owner to
// confirm; a line with a `note` only explains. qualifications.selftest.ts checks the table (no spelling twice, every level and segment valid) and that docs/QUALIFICATION_LEVELS.md lists every line; regenerate it with
// `npx tsx scripts/make-qualification-reference.ts > docs/QUALIFICATION_LEVELS.md`.
// The list comes from general knowledge of Indian degrees: it has NOT been checked against an official source.

export type Level = "certificate" | "diploma" | "graduate" | "postgraduate" | "superspecialty" | "doctorate";
export const LEVELS: readonly Level[] = ["certificate", "diploma", "graduate", "postgraduate", "superspecialty", "doctorate"];
export const LEVEL_RANK: Record<Level, number> = { certificate: 1, diploma: 2, graduate: 3, postgraduate: 4, superspecialty: 5, doctorate: 6 };
export const LEVEL_LABEL: Record<Level, string> = { certificate: "Certificate", diploma: "Diploma (below graduate)", graduate: "Graduate", postgraduate: "Postgraduate", superspecialty: "Super-specialty (above MD / MS)", doctorate: "Doctorate" };

export type Segment =
  | "School and trade"
  | "Medical (allopathy)"
  | "Dental"
  | "AYUSH (Ayurveda, Unani, Homeopathy, Siddha, Naturopathy)"
  | "Nursing and paramedical"
  | "Pharmacy"
  | "Veterinary and agriculture"
  | "Engineering and technology"
  | "Architecture and design"
  | "Science"
  | "Computer applications"
  | "Arts, humanities and social sciences"
  | "Commerce and management"
  | "Law"
  | "Education"
  | "Professional bodies"
  | "Research (any field)"
  | "Any field";
export const SEGMENTS: readonly Segment[] = ["School and trade", "Medical (allopathy)", "Dental", "AYUSH (Ayurveda, Unani, Homeopathy, Siddha, Naturopathy)", "Nursing and paramedical", "Pharmacy", "Veterinary and agriculture", "Engineering and technology", "Architecture and design", "Science", "Computer applications", "Arts, humanities and social sciences", "Commerce and management", "Law", "Education", "Professional bodies", "Research (any field)", "Any field"];

export interface DegreeDef {
  /** The abbreviation as it is usually written. */
  code: string;
  name: string;
  level: Level;
  segment: Segment;
  /** Other ways it is written (without dots and spaces they are compared with what is printed). */
  aliases: string[];
  /** Set when the author was NOT sure of the level or the spelling: what the owner is asked to confirm. */
  confirm?: string;
  /** A plain explanation (not a doubt): why the degree has the level it has. */
  note?: string;
}

const d = (code: string, name: string, level: Level, segment: Segment, aliases: string[] = [], confirm?: string, note?: string): DegreeDef => ({ code, name, level, segment, aliases, ...(confirm ? { confirm } : {}), ...(note ? { note } : {}) });

const SCH = "School and trade", MED = "Medical (allopathy)", DEN = "Dental", AYU = "AYUSH (Ayurveda, Unani, Homeopathy, Siddha, Naturopathy)", NUR = "Nursing and paramedical", PHA = "Pharmacy", VET = "Veterinary and agriculture";
const ENG = "Engineering and technology", ARC = "Architecture and design", SCI = "Science", COM = "Computer applications", ART = "Arts, humanities and social sciences", CMG = "Commerce and management";
const LAW = "Law", EDU = "Education", PRO = "Professional bodies", RES = "Research (any field)", ANY = "Any field";

export const DEGREES: DegreeDef[] = [
  // ---------------------------------------------------------------- certificate
  d("Matric", "Matriculation or Secondary School Certificate (Class X)", "certificate", SCH, ["10th", "Class X", "SSC", "HSLC", "Madhyamik", "Secondary"]),
  d("HS", "Higher Secondary Certificate (Class XII)", "certificate", SCH, ["12th", "Class XII", "HSC", "Intermediate", "Plus Two"]),
  d("ITI", "Industrial Training Institute certificate (NCVT National Trade Certificate)", "certificate", SCH, ["NCVT", "NTC"]),
  // ---------------------------------------------------------------- diploma, BELOW graduate
  d("Diploma (Engg)", "Diploma in Engineering (polytechnic)", "diploma", ENG, ["Diploma in Engineering", "Diploma Engineering", "DME", "DEE", "DCE", "DECE"]),
  d("Diploma", "Diploma (after Class X or XII)", "diploma", ANY, [], "A bare 'Diploma' is taken as BELOW graduate level. A diploma taken AFTER a bachelor's degree is a postgraduate diploma (PGDM, PGDCA, DGO ...): write it with its own name."),
  d("D.Pharm", "Diploma in Pharmacy", "diploma", PHA, ["DPharma"]),
  d("GNM", "General Nursing and Midwifery (diploma)", "diploma", NUR),
  d("ANM", "Auxiliary Nurse Midwife", "diploma", NUR),
  d("DMLT", "Diploma in Medical Laboratory Technology", "diploma", NUR),
  d("D.El.Ed", "Diploma in Elementary Education", "diploma", EDU, ["BTC"]),
  d("DCA", "Diploma in Computer Applications", "diploma", COM),
  // ---------------------------------------------------------------- graduate: medical, dental, AYUSH, nursing, pharmacy, veterinary
  d("MBBS", "Bachelor of Medicine and Bachelor of Surgery", "graduate", MED),
  d("BDS", "Bachelor of Dental Surgery", "graduate", DEN),
  d("BAMS", "Bachelor of Ayurvedic Medicine and Surgery", "graduate", AYU),
  d("BHMS", "Bachelor of Homeopathic Medicine and Surgery", "graduate", AYU),
  d("BUMS", "Bachelor of Unani Medicine and Surgery", "graduate", AYU),
  d("BSMS", "Bachelor of Siddha Medicine and Surgery", "graduate", AYU),
  d("BNYS", "Bachelor of Naturopathy and Yogic Sciences", "graduate", AYU),
  d("B.Sc (Nursing)", "Bachelor of Science in Nursing", "graduate", NUR, ["BSc Nursing", "BScN"]),
  d("BPT", "Bachelor of Physiotherapy", "graduate", NUR),
  d("BOT", "Bachelor of Occupational Therapy", "graduate", NUR),
  d("BMLT", "Bachelor of Medical Laboratory Technology", "graduate", NUR),
  d("B.Optom", "Bachelor of Optometry", "graduate", NUR),
  d("BASLP", "Bachelor of Audiology and Speech-Language Pathology", "graduate", NUR),
  d("B.Pharm", "Bachelor of Pharmacy", "graduate", PHA, ["BPharma"]),
  d("Pharm.D", "Doctor of Pharmacy", "graduate", PHA, ["PharmD"], "In India Pharm.D is a six-year course after Class XII, a first professional degree: classed GRADUATE although it is called a doctor's degree."),
  d("BVSc & AH", "Bachelor of Veterinary Science and Animal Husbandry", "graduate", VET, ["BVSc", "BVSc and AH"]),
  d("B.Sc (Ag)", "Bachelor of Science in Agriculture", "graduate", VET, ["BSc Agriculture", "BScAg"]),
  d("BFSc", "Bachelor of Fisheries Science", "graduate", VET),
  // ---------------------------------------------------------------- graduate: engineering, architecture, design
  d("B.E.", "Bachelor of Engineering", "graduate", ENG, ["BE"]),
  d("B.Tech", "Bachelor of Technology", "graduate", ENG, ["BTech", "B Tech"]),
  d("AMIE", "Associate Member of the Institution of Engineers (India)", "graduate", ENG, ["AMIIE"], "Treated as equal to B.E. / B.Tech (recognised so by the Government for many purposes): confirm for DSP."),
  d("B.Voc", "Bachelor of Vocation", "graduate", ENG, ["BVoc"]),
  d("B.Arch", "Bachelor of Architecture", "graduate", ARC),
  d("B.Plan", "Bachelor of Planning", "graduate", ARC),
  d("B.Des", "Bachelor of Design", "graduate", ARC, ["BDes"]),
  // ---------------------------------------------------------------- graduate: science, computer, arts, commerce, management, law, education
  d("B.Sc", "Bachelor of Science", "graduate", SCI, ["BSc"]),
  d("BCA", "Bachelor of Computer Applications", "graduate", COM),
  d("BA", "Bachelor of Arts", "graduate", ART),
  d("BFA", "Bachelor of Fine Arts", "graduate", ART),
  d("BJMC", "Bachelor of Journalism and Mass Communication", "graduate", ART, ["BJ", "BMC"]),
  d("BSW", "Bachelor of Social Work", "graduate", ART),
  d("B.Lib", "Bachelor of Library and Information Science", "graduate", ART, ["BLISc", "BLibSc"]),
  d("B.P.Ed", "Bachelor of Physical Education", "graduate", EDU, ["BPEd"]),
  d("B.Com", "Bachelor of Commerce", "graduate", CMG, ["BCom"]),
  d("BBA", "Bachelor of Business Administration", "graduate", CMG),
  d("BBM", "Bachelor of Business Management", "graduate", CMG),
  d("BMS", "Bachelor of Management Studies", "graduate", CMG),
  d("BHM", "Bachelor of Hotel Management", "graduate", CMG),
  d("LLB", "Bachelor of Laws", "graduate", LAW, ["BL", "BA LLB", "BBA LLB", "BCom LLB", "BSc LLB"], undefined, "Both the three-year LLB (after a bachelor's degree) and the five-year integrated forms are classed GRADUATE."),
  d("B.Ed", "Bachelor of Education", "graduate", EDU, ["BEd"], undefined, "Taken after a bachelor's degree, but it is a bachelor's degree by name: classed GRADUATE."),
  // ---------------------------------------------------------------- postgraduate: medical (allopathy) and dental
  d("MD", "Doctor of Medicine", "postgraduate", MED, [], undefined, "An MD is a POSTGRADUATE degree although it is called a doctor's degree."),
  d("MS", "Master of Surgery", "postgraduate", MED, ["M.S. (Surgery)"], undefined, "'MS' is also written for a Master of Science by research: both are postgraduate."),
  d("DNB", "Diplomate of National Board", "postgraduate", MED, ["Diplomate NB"], undefined, "Equal to MD / MS: classed POSTGRADUATE."),
  d("MDS", "Master of Dental Surgery", "postgraduate", DEN),
  d("MRCOG", "Member of the Royal College of Obstetricians and Gynaecologists", "postgraduate", MED, [], "A UK college membership: classed POSTGRADUATE."),
  d("MRCP", "Member of the Royal College of Physicians", "postgraduate", MED, [], "A UK college membership: classed POSTGRADUATE."),
  d("MRCS", "Member of the Royal College of Surgeons", "postgraduate", MED, [], "A UK college membership: classed POSTGRADUATE."),
  d("MRCPCH", "Member of the Royal College of Paediatrics and Child Health", "postgraduate", MED, [], "A UK college membership: classed POSTGRADUATE."),
  d("FRCS", "Fellow of the Royal College of Surgeons", "postgraduate", MED, [], "A UK college fellowship: classed POSTGRADUATE (not super-specialty)."),
  d("FRCP", "Fellow of the Royal College of Physicians", "postgraduate", MED, [], "A UK college fellowship: classed POSTGRADUATE (not super-specialty)."),
  d("FRCOG", "Fellow of the Royal College of Obstetricians and Gynaecologists", "postgraduate", MED, [], "A UK college fellowship: classed POSTGRADUATE (not super-specialty)."),
  d("DGO", "Diploma in Gynaecology and Obstetrics", "postgraduate", MED),
  d("DCH", "Diploma in Child Health", "postgraduate", MED),
  d("DPM", "Diploma in Psychological Medicine", "postgraduate", MED),
  d("DO", "Diploma in Ophthalmology", "postgraduate", MED, ["DOMS"]),
  d("DLO", "Diploma in Laryngology and Otology (ENT)", "postgraduate", MED, ["DORL"]),
  d("D.Ortho", "Diploma in Orthopaedics", "postgraduate", MED, ["DOrth"]),
  d("DA", "Diploma in Anaesthesia", "postgraduate", MED),
  d("DMRD", "Diploma in Medical Radio-Diagnosis", "postgraduate", MED, ["DMRE", "DMRT"]),
  d("DCP", "Diploma in Clinical Pathology", "postgraduate", MED),
  d("DIH", "Diploma in Industrial Health", "postgraduate", MED),
  d("DPH", "Diploma in Public Health", "postgraduate", MED),
  d("DTM&H", "Diploma in Tropical Medicine and Hygiene", "postgraduate", MED, ["DTMH"]),
  d("DVD", "Diploma in Venereology and Dermatology", "postgraduate", MED, ["DDVL", "DD"]),
  d("DTCD", "Diploma in Tuberculosis and Chest Diseases", "postgraduate", MED, ["DTD"]),
  d("MPH", "Master of Public Health", "postgraduate", MED),
  d("MHA", "Master of Hospital Administration", "postgraduate", MED),
  // ---------------------------------------------------------------- postgraduate: AYUSH, nursing, pharmacy, veterinary, agriculture
  d("M.Sc (Nursing)", "Master of Science in Nursing", "postgraduate", NUR, ["MSc Nursing", "MScN"]),
  d("MPT", "Master of Physiotherapy", "postgraduate", NUR),
  d("MOT", "Master of Occupational Therapy", "postgraduate", NUR),
  d("M.Pharm", "Master of Pharmacy", "postgraduate", PHA, ["MPharma"]),
  d("MVSc", "Master of Veterinary Science", "postgraduate", VET),
  d("M.Sc (Ag)", "Master of Science in Agriculture", "postgraduate", VET, ["MSc Agriculture", "MScAg"]),
  // ---------------------------------------------------------------- postgraduate: engineering, architecture, science, computer
  d("M.E.", "Master of Engineering", "postgraduate", ENG, ["ME"]),
  d("M.Tech", "Master of Technology", "postgraduate", ENG, ["MTech", "M Tech"]),
  d("M.Arch", "Master of Architecture", "postgraduate", ARC),
  d("M.Plan", "Master of Planning", "postgraduate", ARC),
  d("M.Des", "Master of Design", "postgraduate", ARC, ["MDes"]),
  d("M.Sc", "Master of Science", "postgraduate", SCI, ["MSc"]),
  d("M.Stat", "Master of Statistics", "postgraduate", SCI),
  d("MCA", "Master of Computer Applications", "postgraduate", COM),
  d("PGDCA", "Post Graduate Diploma in Computer Applications", "postgraduate", COM),
  // ---------------------------------------------------------------- postgraduate: arts, commerce, management, law, education, professional, generic
  d("MA", "Master of Arts", "postgraduate", ART),
  d("MFA", "Master of Fine Arts", "postgraduate", ART),
  d("MSW", "Master of Social Work", "postgraduate", ART),
  d("M.Lib", "Master of Library and Information Science", "postgraduate", ART, ["MLISc", "MLibSc"]),
  d("MJMC", "Master of Journalism and Mass Communication", "postgraduate", ART, ["MJ", "MMC"]),
  d("M.P.Ed", "Master of Physical Education", "postgraduate", EDU, ["MPEd"]),
  d("M.Com", "Master of Commerce", "postgraduate", CMG, ["MCom"]),
  d("MBA", "Master of Business Administration", "postgraduate", CMG, ["EMBA"]),
  d("PGDM", "Post Graduate Diploma in Management", "postgraduate", CMG, ["PGDBM", "PGDBA", "PGPM", "PGP", "PGDHRM"]),
  d("MMS", "Master of Management Studies", "postgraduate", CMG, ["MHRM"]),
  d("LLM", "Master of Laws", "postgraduate", LAW),
  d("M.Ed", "Master of Education", "postgraduate", EDU, ["MEd"]),
  d("PG Diploma", "Post Graduate Diploma", "postgraduate", ANY, ["PGDiploma", "PGD", "Post Graduate Diploma in"], undefined, "Any diploma that says POST graduate is classed POSTGRADUATE."),
  d("M.Phil", "Master of Philosophy", "postgraduate", RES, ["MPhil"], "A research degree above a master's and below a PhD: classed POSTGRADUATE."),
  d("CA", "Chartered Accountant (ICAI)", "postgraduate", PRO, ["ACA", "FCA"], "Treated as equal to a postgraduate degree for some purposes (for example by the UGC for NET), as a graduate qualification by some employers: confirm how DSP classes it."),
  d("CMA", "Cost and Management Accountant (ICMAI, formerly ICWA)", "postgraduate", PRO, ["ICWA", "ICMA", "CWA", "ACMA", "FCMA"], "Same question as CA: confirm how DSP classes it."),
  d("CS", "Company Secretary (ICSI)", "postgraduate", PRO, ["ACS", "FCS"], "Same question as CA: confirm how DSP classes it."),
  // ---------------------------------------------------------------- super-specialty
  d("DM", "Doctor of Medicine (super-specialty)", "superspecialty", MED, [], undefined, "DM is a SUPER-specialty degree taken after an MD: above postgraduate."),
  d("MCh", "Master of Chirurgiae (super-specialty surgery)", "superspecialty", MED, ["Mch"], undefined, "MCh is a SUPER-specialty degree taken after an MS: above postgraduate."),
  d("DrNB", "Doctorate of National Board (super-specialty)", "superspecialty", MED, ["Dr NB", "DNB (Super-specialty)"], undefined, "Equal to DM / MCh: classed SUPER-specialty."),
  d("FNB", "Fellow of National Board", "superspecialty", MED, [], "A fellowship after a DNB: classed SUPER-specialty."),
  // ---------------------------------------------------------------- doctorate
  d("PhD", "Doctor of Philosophy", "doctorate", RES, ["Ph.D", "DPhil", "D.Phil"]),
  d("DSc", "Doctor of Science", "doctorate", RES, ["D.Sc"]),
  d("D.Litt", "Doctor of Letters", "doctorate", RES, ["DLitt"]),
  d("LLD", "Doctor of Laws", "doctorate", LAW),
  d("DBA", "Doctor of Business Administration", "doctorate", CMG),
  d("Ed.D", "Doctor of Education", "doctorate", EDU, ["EdD"]),
];
