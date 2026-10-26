// src/lib/nl2sql/departmentAliases.ts
//
// THE ONE PLACE where the nicknames and groupings of the departments are written (step 45a). Pure data, no logic: to teach the search a new nickname, add or edit ONE line here.
//
// A group says: when a question contains one of these ALIASES (as whole words, capitals and punctuation do not matter), the department means ALL the rows of the live list whose
// normalised name STARTS WITH one of the PREFIXES (a whole word: "hr" finds "HR (NW)" but not "HRX") or begins with one of the STEMS (part of a word: "fire service" also finds
// "FIRE SERVICES"). The people sit in the SECTION rows, so asking for the department means all its sections; the model is told to use department_id IN (the ids), and to use one
// row only when the person names one section.
//
// Normalised = lower case, "&" read as "and", every other mark a space: "M&HS(1)" is "m and hs 1", "S.M.S. ELECT.MAINT." is "s m s elect maint".
//
// Departments NOT listed here still work when named by their own name (the part before the bracket): ACVS includes "ACVS - OFFICE", L & D includes "L & D IND" and "L & D OFFICE",
// FOUNDRY its 12 sections ... (context.ts departmentFamilies). This file is for what the NAMES cannot tell: a nickname (cocc, W&A, hydraulic lab), a department known by another word
// (health centres, public health and PMU sit in the main hospital), a variant spelling (FIRE SERVICE / FIRE SERVICES, ETL / ELECTRICAL TECHNICAL LAB).
//
// The test departmentAliases.selftest.ts checks this file against a saved copy of the 300 real rows (src/lib/nl2sql/__fixtures__/departments.real.json): an entry that matches no
// row, an alias claimed by two groups and a changed row count all fail the test, so the file cannot go stale unnoticed. When the departments change, refresh the saved copy.
//
// STILL TO BE FILLED (the owner checks the legacy intranet): 
//   - (CLOSED on 26 Oct 2026 by the owner's list of the CL&D employees: CHRD = the Training Department = Centre for L & D (CL&D) = the five L & D rows, see the first group below. The legacy "CHRD INDUSTRIAL 2 / training institute"
//     of employees/departments.ts (code 10143) has no row in the 300 and is NOT part of CL&D.)
//   - A-Zone Maintenance and B-Zone Maintenance are sections of Town Administration (its six rows were filled in on 24 Oct 2026) but have no row of their own: the words are NOT mapped,
//     because a count for one zone would silently be the count for all of Town Administration.
//   - PMU / Plant Medical is placed under MAIN HOSPITAL on the owner's guess ("probably a branch of M&HS"): confirm.
//   - Heavy Maintenance has 3 sites (Site 1, 2, 3) but only 2 rows (92500 and 92530): the sites cannot be told apart.

export interface DepartmentGroup {
  name: string;
  aliases: string[];
  prefixes: string[];
  stems?: string[];
}

export const DEPARTMENT_GROUPS: DepartmentGroup[] = [
  // step 59a: the Training Department was renamed CHRD and is now the Centre for L & D (CL&D). People still say the old names: ALL of them mean the five L & D rows (107, 9001, 9003, 10770, 9008: the sections of the
  // owner's list of 26 Oct 2026). "l & d" itself is found by the department's own name. The notice "CHRD is now called ..." is src/lib/search/formerNames.ts; the link and the menu entry carry the same names.
  // The FULL FORMS are the ones CONFIRMED on 26 Oct 2026: L & D = Learning and Development (the HOD), CHRD = Centre for Human Resource Development. NOT "Centre for HRD": it is not used at the plant.
  // Another plant's CHRD is not this department.
  { name: "CL&D (Centre for L & D = Centre for Learning and Development, formerly CHRD = Centre for Human Resource Development, formerly the Training Department)", aliases: ["cl&d", "cl & d", "cl and d", "c l & d", "centre for l&d", "centre for l & d", "center for l&d", "center for l & d", "learning and development", "centre for learning and development", "center for learning and development", "chrd", "c h r d", "c.h.r.d", "centre for human resource development", "center for human resource development", "training department", "training dept", "training deptt"], prefixes: ["l and d"] },
  { name: "CO & CC", aliases: ["cocc", "co&cc", "co & cc", "co and cc", "coke oven and coal chemical"], prefixes: ["co and cc"] },
  { name: "BLAST FURNACE (BF)", aliases: ["bf", "blast furnace", "blast furnaces"], prefixes: ["bf", "b f", "blast furnace"] },
  { name: "SMS (STEEL MELTING SHOP, with CCP)", aliases: ["sms", "s m s", "steel melting shop"], prefixes: ["sms", "s m s", "ccp", "continuous casting"] },
  { name: "CCP (CONTINUOUS CASTING PLANT, part of SMS)", aliases: ["ccp", "continuous casting plant", "continuous casting"], prefixes: ["sms ccp", "ccp", "continuous casting"] },
  { name: "WHEEL & AXLE (W&A)", aliases: ["w&a", "w & a", "w and a", "wheel and axle", "wheel & axle", "wheel axle"], prefixes: ["w and a", "wheel"] },
  { name: "MERCHANT MILL", aliases: ["merchant mill"], prefixes: ["merchant mill"] },
  { name: "SECTION MILL", aliases: ["section mill", "sec mill"], prefixes: ["section mill", "sec mill"] },
  { name: "HEAVY MAINTENANCE (HM)", aliases: ["hm", "hmd", "heavy maintenance", "heavy maint"], prefixes: ["hm", "h m", "hmd"], stems: ["heavy maint"] },
  { name: "MAIN HOSPITAL (M&HS)", aliases: ["m&hs", "m & hs", "m and hs", "mhs", "main hospital", "hospital", "medical organisation", "medical organization", "plant medical", "pmu", "health centre", "health centres", "health center", "health centers", "public health"], prefixes: ["m and hs", "medical organisation", "medical and health serv", "hospital"] },
  { name: "FIRE SERVICES", aliases: ["fire", "fire service", "fire services", "fire brigade"], prefixes: [], stems: ["fire service"] },
  { name: "MTB (HYDRAULIC LAB)", aliases: ["mtb", "hydraulic lab", "hydraulic laboratory", "hydraulic"], prefixes: ["mtb"] },
  { name: "R & C LABORATORY (RCL)", aliases: ["rcl", "r & c laboratory", "r and c laboratory", "r & c lab"], prefixes: ["r and c laboratory"] },
  { name: "ELECTRICAL TECHNICAL LAB (ETL)", aliases: ["etl", "electrical technical lab", "electrical technical laboratory"], prefixes: ["electrical technical lab", "etl"] },
  { name: "CSR", aliases: ["csr", "corporate social responsibility"], prefixes: ["csr", "corporate social responsibility"] },
  { name: "F&A (FINANCE & ACCOUNTS)", aliases: ["f&a", "f & a", "f and a", "finance and accounts", "finance & accounts", "finance"], prefixes: ["f and a", "finance and a c"] },
  { name: "HR", aliases: ["hr", "human resources", "human resource"], prefixes: ["hr"] },
  { name: "ED (WORKS)", aliases: ["ed works", "ed (works)", "executive director works"], prefixes: ["ed works"] },
  { name: "TOWN ADMINISTRATION (TA BUILDING)", aliases: ["town administration", "town admin", "ta building", "ta bldg"], prefixes: ["township maintenance", "s e township maintenance", "estate and township branch"], stems: ["town serv"] },
];
