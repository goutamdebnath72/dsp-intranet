// src/lib/employees/departments.ts
//
// Canonical department map: logical department -> member department codes
// (join user.departmentId -> departments.id, filter departments.code).
// Auto-grouped from the 300-row department list by base name, then curated:
//   C&IT = {98500, 98540, 10153};  ELECTRICAL TECHNICAL LAB (ETL) = {10174,10181,10396}.
// Aliases are the short forms people type. To add/merge later, edit this file.

import { normTerm } from "./designations";

export interface DeptGroup {
  name: string;      // canonical logical department
  codes: number[];   // member department codes
  aliases: string[]; // extra user-typable terms (normalized at match time)
}

export const DEPARTMENTS: DeptGroup[] = [
  { name: "A.G.M. MARKETING", codes: [10101], aliases: [] },
  { name: "ACVS", codes: [10102, 10103], aliases: [] },
  { name: "ADMIN-MOVEMENT", codes: [10104], aliases: [] },
  { name: "ADMINISTRATION", codes: [10105], aliases: ["admin"] },
  { name: "AXLE MACHINE SHOP", codes: [10106], aliases: [] },
  { name: "BLAST FURNACE", codes: [10107, 10108, 10109, 10110, 10111, 10112, 10113, 10114, 10115, 10116, 10117, 10118, 10119], aliases: [] },
  { name: "BUSINESS EXCELLENCE", codes: [10120, 10121], aliases: ["be"] },
  { name: "BUSINESS PLANNING & MKTG", codes: [10122], aliases: [] },
  { name: "C & IT", codes: [10153, 98500, 98540], aliases: ["c&it", "cit", "c and it", "computer and it", "it department"] },
  { name: "CALCUTTA BRANCH", codes: [10123, 10124], aliases: ["kolkata branch"] },
  { name: "CCM & RMW", codes: [10125, 10126], aliases: [] },
  { name: "CEM", codes: [10127, 10128, 10129, 10130, 10131, 10132, 10133, 10134, 10135, 10136], aliases: [] },
  { name: "CENTRAL CRANE MAINT", codes: [10137], aliases: [] },
  { name: "CENTRAL ELECTRICAL POOL", codes: [10138], aliases: [] },
  { name: "CENTRAL STORES", codes: [10139, 10140, 10141], aliases: ["csd"] },
  { name: "CENTRALISED COMPRESSED AIR STATION", codes: [10142], aliases: [] },
  { name: "CHRD INDUSTRIAL 2", codes: [10143], aliases: ["training institute"] },
  { name: "CO & CC", codes: [10144, 10145, 10146, 10147, 10148, 10149, 10150], aliases: ["cocc"] },
  { name: "COKE OVEN REFRACTORY", codes: [10151], aliases: ["refractory"] },
  { name: "COMPRESSOR AIR STATION", codes: [10152], aliases: [] },
  { name: "CONTRACT", codes: [10154, 10155], aliases: [] },
  { name: "CORPORATE SOCIAL RESPONSIBILITY", codes: [10156], aliases: [] },
  { name: "COST CONTROL", codes: [10157], aliases: [] },
  { name: "CSR", codes: [10399], aliases: [] },
  { name: "DELHI BRANCH OFFICE", codes: [10158], aliases: [] },
  { name: "DELHI RESIDANCE OFFICE", codes: [10159], aliases: [] },
  { name: "DESIGN", codes: [10160], aliases: [] },
  { name: "DIC'S OFFICE", codes: [10163], aliases: [] },
  { name: "DIC'S OFFICE COORDINATION", codes: [10161], aliases: [] },
  { name: "DIC'S TECHNICAL CELL", codes: [10162], aliases: [] },
  { name: "ED", codes: [10164], aliases: [] },
  { name: "ED (WORKS) OFFICE", codes: [10165], aliases: [] },
  { name: "ED (WORKS) SECTT", codes: [10166], aliases: [] },
  { name: "ED WORKS", codes: [10167], aliases: [] },
  { name: "EDUCATION", codes: [10168, 10169], aliases: [] },
  { name: "ELE.COORDINATION", codes: [10170], aliases: [] },
  { name: "ELECT.COORDINATION", codes: [10171], aliases: [] },
  { name: "ELECTRICAL REPAIR SHOP", codes: [10172, 10173], aliases: [] },
  { name: "ELECTRICAL TECHNICAL LAB", codes: [10174, 10181, 10396], aliases: ["etl"] },
  { name: "ENERGY MANAGEMENT", codes: [10175, 10176], aliases: [] },
  { name: "ENVIRONMENT CONTROL", codes: [10177, 10178], aliases: [] },
  { name: "ESTATE & TOWNSHIP BRANCH", codes: [10179], aliases: [] },
  { name: "ESTATE-ACCOUNTS", codes: [10180], aliases: [] },
  { name: "F&A-CASH", codes: [10182], aliases: [] },
  { name: "F&A-CENTRAL BILL DOCKETING", codes: [10183], aliases: [] },
  { name: "F&A-COST", codes: [10184], aliases: [] },
  { name: "F&A-ESTABLISHMENT", codes: [10185], aliases: [] },
  { name: "F&A-EXCISE CELL", codes: [10186], aliases: [] },
  { name: "F&A-FINAL SETTLE CELL-PAY", codes: [10187], aliases: [] },
  { name: "F&A-IPU PAYMENTS AND ACCOUNT", codes: [10188], aliases: [] },
  { name: "F&A-MAIN ACCOUNTS", codes: [10189], aliases: [] },
  { name: "F&A-MISC WORKS BILL", codes: [10190], aliases: [] },
  { name: "F&A-OPERATION BILL", codes: [10191], aliases: [] },
  { name: "F&A-PAY ACCOUNTS CELL", codes: [10192], aliases: [] },
  { name: "F&A-PAY-EXECUTIVES", codes: [10193], aliases: [] },
  { name: "F&A-PAY-GENERAL", codes: [10194], aliases: [] },
  { name: "F&A-PAY-LTC", codes: [10195], aliases: [] },
  { name: "F&A-PAY-PRODUCTION", codes: [10196], aliases: [] },
  { name: "F&A-PROVIDENT FUND", codes: [10197], aliases: [] },
  { name: "F&A-RAW MATERIAL ACCOUNTS", codes: [10198], aliases: [] },
  { name: "F&A-RLY FREIGHT", codes: [10199], aliases: [] },
  { name: "F&A-SALES ACCOUNTS", codes: [10200], aliases: [] },
  { name: "F&A-SALES INVOICE", codes: [10201], aliases: [] },
  { name: "F&A-SALES TAX", codes: [10202], aliases: [] },
  { name: "F&A-STOCK VERIFICATION", codes: [10203, 10204], aliases: [] },
  { name: "F&A-WELF & MISC BILLS & A/CS", codes: [10205], aliases: [] },
  { name: "FINANCE & A/C BRANCH", codes: [10206], aliases: ["finance"] },
  { name: "FIRE SERVICE", codes: [10207], aliases: [] },
  { name: "FIRE SERVICES", codes: [10208, 10209], aliases: ["fire"] },
  { name: "FOUNDRY", codes: [10210, 10211, 10212, 10213, 10214, 10215, 10216, 10217, 10218, 10219, 10220, 10221, 10222], aliases: [] },
  { name: "G.M. PROJECTS OFFICE", codes: [10223], aliases: [] },
  { name: "GARAGE-OFFICE STAFF", codes: [10224], aliases: [] },
  { name: "GARAGE-SUPVRS", codes: [10225], aliases: [] },
  { name: "GM IT", codes: [10226], aliases: [] },
  { name: "HEAVY MAINTENANCE & CONSTN", codes: [10227], aliases: [] },
  { name: "HEAVY MAINTENANCE & CONSTN.(OFFICE", codes: [10228], aliases: [] },
  { name: "HOSPITAL", codes: [10229], aliases: [] },
  { name: "HOSPITAL OFFICE", codes: [10230], aliases: [] },
  { name: "HOSPITAL-TECHNICAL-INDU", codes: [10231], aliases: [] },
  { name: "HR", codes: [10232, 10233, 10234, 10235, 10236, 10237, 10239], aliases: [] },
  { name: "HR (TS) IND", codes: [10238], aliases: [] },
  { name: "HR (WORKS) IND", codes: [10240], aliases: [] },
  { name: "HR (WORKS) TECH", codes: [10241], aliases: [] },
  { name: "INDUSTRIAL ENGINEERING", codes: [10242], aliases: [] },
  { name: "INSTRUMENTATION", codes: [10243, 10244], aliases: [] },
  { name: "INTERNAL AUDIT", codes: [10245], aliases: [] },
  { name: "IPU", codes: [10246], aliases: ["plant medical"] },
  { name: "L & D", codes: [10247, 10248, 10249, 10250], aliases: [] },
  { name: "L & D IND", codes: [10251], aliases: [] },
  { name: "L & D OFFICE", codes: [10252], aliases: [] },
  { name: "LAW", codes: [10253, 10254], aliases: [] },
  { name: "LAW OFFICER", codes: [10255], aliases: [] },
  { name: "LOCO REPAIR SHOP", codes: [10256, 10257], aliases: ["lrs"] },
  { name: "M&HS", codes: [10258, 10259], aliases: ["main hospital"] },
  { name: "MANAGEMENT TRAINEE", codes: [10260], aliases: ["mt"] },
  { name: "MARKETING DIVISION", codes: [10261], aliases: [] },
  { name: "MATERIAL MANAGEMENT", codes: [10262], aliases: ["mm"] },
  { name: "MEDICAL AND HEALTH SERV", codes: [10263], aliases: [] },
  { name: "MEDICAL ORGANISATION", codes: [10264], aliases: [] },
  { name: "MERCHANT MILL", codes: [10265, 10266, 10267, 10268, 10269, 10270], aliases: [] },
  { name: "MRD", codes: [10271, 10273], aliases: [] },
  { name: "MRD & SBO", codes: [10272], aliases: [] },
  { name: "MSM", codes: [10274, 10275, 10276, 10397], aliases: [] },
  { name: "MTB", codes: [10277, 10278], aliases: [] },
  { name: "OXYGEN PLANT", codes: [10279, 10280, 10281, 10282, 10283], aliases: [] },
  { name: "P.R.O", codes: [10284], aliases: [] },
  { name: "PERMANENT WAY ENGINEERING", codes: [10285, 10286], aliases: [] },
  { name: "PLANT CIVIL ENGG", codes: [10287], aliases: [] },
  { name: "PLANT CIVIL ENGINEERING", codes: [10288, 10289, 10290, 10291, 10292], aliases: [] },
  { name: "PLANT DESIGN & DRAWING", codes: [10293], aliases: [] },
  { name: "PLANT DESIGN & DRAWING DEPTT(OFFIC", codes: [10294], aliases: [] },
  { name: "PLANT GARAGE", codes: [10295, 10296, 10297, 10298, 10299, 10300], aliases: [] },
  { name: "POWER MANAGEMENT", codes: [10301, 10302], aliases: [] },
  { name: "POWER PLANT", codes: [10303, 10304, 10305, 10306, 10307], aliases: [] },
  { name: "PPCD", codes: [10308, 10309], aliases: [] },
  { name: "PROJECT ENGINEERING", codes: [10310], aliases: [] },
  { name: "PROJECT TECHNICAL", codes: [10316], aliases: [] },
  { name: "PROJECTS", codes: [10311], aliases: [] },
  { name: "PUBLIC RELATIONS", codes: [10312, 10313], aliases: [] },
  { name: "PURCHASE", codes: [10314, 10315], aliases: [] },
  { name: "R & C LABORATORY", codes: [10317, 10318], aliases: ["rcl"] },
  { name: "RAJBHASHA", codes: [10319], aliases: ["hindi cell"] },
  { name: "RAJBHASHA VIBHAG", codes: [10320], aliases: [] },
  { name: "RAW MATERIALS", codes: [10321, 10322], aliases: [] },
  { name: "REFRACTORY", codes: [10323, 10324], aliases: [] },
  { name: "RMD", codes: [10325], aliases: [] },
  { name: "RMHP", codes: [10326, 10327, 10328, 10329, 10330], aliases: [] },
  { name: "ROLL SHOP", codes: [10331, 10332], aliases: [] },
  { name: "S E TOWNSHIP MAINTENANCE", codes: [10333], aliases: [] },
  { name: "S M S OFFICE STAFF", codes: [10334], aliases: [] },
  { name: "S.M.S. ELECT.MAINT", codes: [10398], aliases: [] },
  { name: "SAFETY ENGG", codes: [10335, 10336, 10337], aliases: [] },
  { name: "SECTION MILL", codes: [10338, 10339, 10340, 10341, 10342], aliases: [] },
  { name: "SINTER PLANT", codes: [10343, 10344], aliases: [] },
  { name: "SINTERING PLANT", codes: [10345, 10346, 10347, 10348], aliases: [] },
  { name: "SLAG BANK", codes: [10349, 10350], aliases: [] },
  { name: "SMS", codes: [10351, 10352, 10353, 10354], aliases: [] },
  { name: "SMS-AUX", codes: [10355, 10356, 10357], aliases: [] },
  { name: "SMS-BOF", codes: [10358, 10359, 10360], aliases: [] },
  { name: "SMS-CCP", codes: [10361, 10362, 10363], aliases: [] },
  { name: "SPU", codes: [10364, 10365], aliases: [] },
  { name: "STRUCTURAL INSPECTION", codes: [10366], aliases: [] },
  { name: "TELECOM", codes: [10367], aliases: [] },
  { name: "TOTAL QUALITY MANAGEMENT", codes: [10368], aliases: [] },
  { name: "TOWN SERV-B&R/PHM", codes: [10369], aliases: [] },
  { name: "TOWN SERV-ELECT MAINT", codes: [10370], aliases: [] },
  { name: "TOWN SERVICES", codes: [10371], aliases: [] },
  { name: "TOWNSHIP MAINTENANCE", codes: [10372], aliases: ["ta building"] },
  { name: "TRAFFIC", codes: [10373, 10374], aliases: [] },
  { name: "TXR", codes: [10375, 10376], aliases: [] },
  { name: "VIGILANCE", codes: [10377, 10378], aliases: [] },
  { name: "VIGILANCE FIELD STAFF", codes: [10379], aliases: [] },
  { name: "WAGON REPAIR SHOP", codes: [10380, 10381], aliases: ["wrs"] },
  { name: "WHEEL & AXLE PLANT", codes: [10382, 10383, 10384, 10385, 10386, 10387, 10388], aliases: [] },
  { name: "WMD", codes: [10389, 10390, 10391, 10392, 10393, 10394, 10395], aliases: [] },
];

/** Resolve a department term (name / alias) to its group, or null. */
export function resolveDepartment(term: string): DeptGroup | null {
  const n = normTerm(term);
  if (!n) return null;
  for (const d of DEPARTMENTS) {
    if (normTerm(d.name) === n) return d;
    if (d.aliases.some((a) => normTerm(a) === n)) return d;
  }
  const hits = DEPARTMENTS.filter(
    (d) =>
      normTerm(d.name).includes(n) ||
      d.aliases.some((a) => normTerm(a).includes(n)),
  );
  return hits.length === 1 ? hits[0] : null;
}


/**
 * Find a department mentioned ANYWHERE in a free query (order-independent),
 * matching a name or alias as whole words. Longest match wins. Returns the
 * group and the matched (normalized) phrase, or null. Used for the
 * "name fragment + department" people search (e.g. "soumit c&it" / "c&it roy").
 */
export function findDepartmentInText(
  query: string,
): { group: DeptGroup; phrase: string } | null {
  const nq = ` ${normTerm(query)} `;
  let best: { group: DeptGroup; phrase: string; len: number } | null = null;
  for (const d of DEPARTMENTS) {
    for (const c of [d.name, ...d.aliases]) {
      const nc = normTerm(c);
      if (nc.length < 2) continue;
      if (nq.includes(` ${nc} `) && (!best || nc.length > best.len)) {
        best = { group: d, phrase: nc, len: nc.length };
      }
    }
  }
  return best ? { group: best.group, phrase: best.phrase } : null;
}
