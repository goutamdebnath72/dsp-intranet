// src/lib/nl2sql/aliasHints.ts
//
// Static SNAPSHOT of the short forms people type, copied on 29 Sep 2026 from
// the legacy src/lib/employees/departments.ts and designationGrades.ts so this
// experiment stays self-contained (the legacy files are untouched and dormant).
// These are HINTS shown to the model, not code paths: adding one is a data
// edit. Department full names come live from the database at run time.

/** [department name as in the legacy list, [short forms]] -- names are
 *  approximate; the model must match them against the live department list. */
export const DEPARTMENT_SHORT_FORMS: [string, string[]][] = [
  ["ADMINISTRATION", ["admin"]],
  ["BUSINESS EXCELLENCE", ["be"]],
  ["C & IT", ["c&it", "cit", "c and it", "computer and it", "it department"]],
  ["CALCUTTA BRANCH", ["kolkata branch"]],
  ["CENTRAL STORES", ["csd"]],
  ["CHRD INDUSTRIAL 2", ["training institute"]],
  ["CO & CC", ["cocc"]],
  ["COKE OVEN REFRACTORY", ["refractory"]],
  ["ELECTRICAL TECHNICAL LAB", ["etl"]],
  ["FINANCE & A/C BRANCH", ["finance"]],
  ["FIRE SERVICES", ["fire"]],
  ["IPU", ["plant medical"]],
  ["LOCO REPAIR SHOP", ["lrs"]],
  ["M&HS", ["main hospital"]],
  ["MANAGEMENT TRAINEE", ["mt"]],
  ["MATERIAL MANAGEMENT", ["mm"]],
  ["R & C LABORATORY", ["rcl"]],
  ["RAJBHASHA", ["hindi cell"]],
  ["TOWNSHIP MAINTENANCE", ["ta building"]],
  ["WAGON REPAIR SHOP", ["wrs"]],
];

/** Departments that consist of SEVERAL department rows (sections). The model
 *  must include ALL of the listed department codes for such a department. */
export const MULTI_ROW_DEPARTMENTS: { name: string; aliases: string[]; codes: number[]; note: string }[] = [
  {
    name: "C & IT",
    aliases: ["C&IT", "CIT", "C and IT", "computer and IT", "IT department"],
    codes: [98500, 98530, 98540],
    note: "98500 = all executives; 98530 and 98540 = non-executive sections. All three are C&IT.",
  },
  {
    name: "PLANT GARAGE",
    aliases: ["garage", "plant garage"],
    codes: [85000, 85070, 85110, 85200, 85330, 85430],
    note: "85110 = Operation Garage (M.H.E.O.D.), 85200 = Maintenance Garage (M.H.E.M.D.); all six are Plant Garage.",
  },
];

/** Words that department names abbreviate (seen in the live list: "(ELECT)", "(MECH)", "(OPRN)", "ELECT.MAINT.", "DEPTT."). */
export const DEPARTMENT_WORD_ABBREVIATIONS: [string, string][] = [
  ["electrical", "ELECT"],
  ["mechanical", "MECH"],
  ["operation", "OPRN"],
  ["maintenance", "MAINT"],
  ["technical", "TECH"],
  ["department", "DEPTT"],
  ["laboratory", "LAB"],
];

/** Designation short forms -> the exact stored title(s). */
export const DESIGNATION_SHORT_FORMS: [string, string[]][] = [
  ["Director In-charge", ["DIC", "director incharge"]],
  ["Executive Director", ["ED"]],
  ["Chief General Manager", ["CGM", "chief GM"]],
  ["Director(M&HS)", ["director medical", "medical director"]],
  ["General Manager", ["GM"]],
  ["Joint Director", ["Jt Director"]],
  ["Dy. General Manager", ["DGM", "deputy general manager", "Dy GM"]],
  ["Sr. Deputy Director", ["senior deputy director"]],
  ["DMO/Consultant", ["DMO", "deputy medical officer"]],
  ["Asst.General Manager", ["AGM", "assistant general manager", "Asst GM"]],
  ["Asst. Director/Sr. Consultant", ["assistant director", "senior consultant"]],
  ["Sr. Manager", ["senior manager", "Sr Mgr"]],
  ["Manager", ["Mgr"]],
  ["Dy. Manager", ["deputy manager", "Dy Mgr"]],
  ["ADMO/Specialist", ["ADMO", "specialist"]],
  ["Asst. Manager", ["assistant manager", "Asst Mgr"]],
  ["Medical Officer", ["MO"]],
  ["Junior Manager", ["Jr Manager", "Jr Mgr"]],
];
