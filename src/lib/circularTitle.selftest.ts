// src/lib/circularTitle.selftest.ts
// Run:  npx tsx src/lib/circularTitle.selftest.ts
// The titles below are REAL ones, copied from the circulars list and the legacy app's table of contents.
import { formatCircularTitle } from "./circularTitle";

let pass = 0;
let fail = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (ok) pass++;
  else {
    fail++;
    console.log(`  FAIL  ${label}${detail ? " -- " + detail : ""}`);
  }
};
const is = (input: string, expected: string) => {
  const got = formatCircularTitle(input);
  check(`${input}  ->  ${expected}`, got === expected, `got: ${got}`);
};

// ---- typed entirely in capitals: converted
is("CIRCULAR- IMPLEMENTATION OF CONTACTLESS ATTENDANCE SYSTEM", "Circular- Implementation of contactless attendance system");
is("CIRCULAR-HOLIDAY LIST FOR EMPLOYEES OF DSP-2024", "Circular-Holiday list for employees of DSP-2024");
is("CIRCULAR - HOLIDAYS AND LEAVES FOR CONTRACTOR WORKERS IN DSP -2025", "Circular - Holidays and leaves for contractor workers in DSP -2025");
is("CIRCULAR-HEALTH CHECK UP OF NON-EXECUTIVE EMPLOYEES DURING THE MONTH OF JANUARY-2025", "Circular-Health check up of non-executive employees during the month of January-2025");
is("CIRCULAR-HOLIDAY LIST-2025", "Circular-Holiday list-2025");
is("CIRCULAR-SELECTION OF PLAYERS FOR DSP TABLE TENNIS TEAM", "Circular-Selection of players for DSP table tennis team");
is("CIRCULAR-ZERO TOLERANCE SAFETY RULES (REVISED)", "Circular-Zero tolerance safety rules (revised)");
is("CIRCULAR-HEALTH CHECK-UP FOR NON-EXECUTIVE EMPLOYEES DURING THE MONTH OF DECEMBER-2024", "Circular-Health check-up for non-executive employees during the month of December-2024");
is("CIRCULAR-HOLIDAY LIST FOR THE YEAR 2026", "Circular-Holiday list for the year 2026");
is("CIRCULAR- HEALTH CHECK UP OF NON- EXECUTIVE EMPLOYEES FOR JAN-2026", "Circular- Health check up of non- executive employees for Jan-2026");
is("CIRCULSR-SAIL GAURAV DIWAS-2026", "Circulsr-SAIL Gaurav Diwas-2026");
is("CIRCULAR -EXTENSION OF SAIL MEDICLAIM POLICY(26-27)", "Circular -Extension of SAIL Mediclaim policy(26-27)");

// ---- half and half: only the shouted first word is put right
is("CIRCULAR - Pre-Mature (Part/Full) Repayment of Refundable PF Loan", "Circular - Pre-Mature (Part/Full) Repayment of Refundable PF Loan");
is("CIRCULAR - HTS Jan-May 2026 Session", "Circular - HTS Jan-May 2026 Session");
is("CIRCULAR- List of Nodal Officers w.r.t. submission of declaration (Format-B) by employees for SIR", "Circular- List of Nodal Officers w.r.t. submission of declaration (Format-B) by employees for SIR");
is("CIRCULAR-Commemoration of Armed Forces Flag Day", "Circular-Commemoration of Armed Forces Flag Day");

// ---- already in running letters: shown exactly as typed (typos included)
const MIXED = [
  "Circular-Holidays & Leaves for contract workers engaged by contractors for the year 2023",
  "Circular - Selection of players for SAIL Swarna Jayanti Volleyball Tournament 2022",
  "Scheme for Sponsoring Executives for Higher Specialized Education Training",
  "Circular - Leave Management System (LMS)",
  "Circular-Holiday List - 2023",
  "Circular - Rules for Retention of Company Accomodation by Ex-employees at City Locations",
  "Notice for cancellation of JO written examination",
  "Circular- Selection trial for Inter Steel Plant Football Championship 2022-23",
  "Circular- Selection of Coach for Inter Steel Plant Football Championship",
  "Circular - Motivational Award Schemes of DSP",
  "Circular - Application from SAIL Executives for LinkedIn membership",
  "Circular - Holidays and Leaves for Contractor Workers in DSP - 2024",
  "Circular for selction of employees for badminton",
  "Circular for Gate Pass No.-13 (valid from 01.01.2024 to 31.03.2024)",
  "Notice for Contract Workers - Daily Rate of Wages w.e.f 01.01.2024 (excluding Non-Works)",
  "Circular -Inter Department Volleyball Tournament 2023",
  "PF of Junior Officers of 2008 and 2010 batches",
  "Promotion Order E1-E2 dt 30-12-2023",
  "Notice for Contractor Workers - Revised GPAIS Premium Amount w.e.f 01.01.2025",
  "Notice - Football Coach for Inter Steel Football Championship -2024-25",
  "Circular- Selection Trial for Inter Steel Football Championship-2024-25",
  "Notice - Implementation of Biometric Attendance System for Contractor Workers",
  "Circular for Inter Department TT 2026-27",
  "Circular for Coach of DSP Volleyball Team",
  "Junior Manager Placement Order dated 12-12-2024",
  "Circular Submission of Declaration (Format B) by employees for SIR",
  "Circular for SAIL DAY WALK 5km RUN",
  "Internal Circular ICVL dated 25.08.2026",
  "Circular -, Merit Award Scheme,26 (Amendment), Contract Workers (Beng)",
  "Circular -, Merit Award Scheme,26 (Amendment), Contract Workers (Hindi)",
  "Circular -, Merit Award Scheme,26 (Amendment), Contract Workers (Eng.)",
  "Circular- Extension of SAIL Mediclaim policy (2026-2027)",
  "Circular - Online option for Gift Card Rs. 15000 to employees",
  "Circular- Gift card corrigendum",
  "Superannuation list (Exe-DSP) 2026",
  "Circular - DSP Hindi Teaching Scheme",
  "Interview Schedule for JO-2022",
  "Promotion order E1-E2 w.e.f. 31.12.2025",
  "Internal Circular dated 23.12.2022 for posting at Salem Steel Plant",
  "Cricular- Selection of Coach for Inter Steel Plant Football Championship",
];
for (const t of MIXED) check(`left as typed: ${t}`, formatCircularTitle(t) === t, `got: ${formatCircularTitle(t)}`);

// ---- other typical shapes (typed in capitals)
is("CIRCULAR FOR SAIL DAY WALK 5KM RUN", "Circular for SAIL day walk 5km run");
is("26TH ANNIVERSARY OF THE PLANT", "26th anniversary of the plant");
is("PART-II OF THE POLICY", "Part-II of the policy");
is("CIRCULAR FOR PHASE I OF THE SCHEME", "Circular for phase I of the scheme");
is("CIRCULAR FOR GATE PASS NO.-13", "Circular for gate pass No.-13");
is("PROMOTION ORDER E1-E2 W.E.F. 31.12.2025", "Promotion order E1-E2 w.e.f. 31.12.2025");
is("CIRCULAR FOR C&IT DEPARTMENT", "Circular for C&IT department");
is("WORKER'S COMPENSATION RULES", "Worker's compensation rules");
is("EMPLOYEES MAY APPLY BY MAY-2026", "Employees may apply by May-2026");
is("HTS JAN-MAY 2026 SESSION", "HTS Jan-May 2026 session");
is("ONLINE OPTION FOR GIFT CARD RS. 15000 TO EMPLOYEES", "Online option for gift card Rs. 15000 to employees");
is("NOTICE FOR CANCELLATION OF JO WRITTEN EXAMINATION", "Notice for cancellation of JO written examination");
is("CIRCULAR-DIWALI HOLIDAYS AT DURGAPUR", "Circular-Diwali holidays at Durgapur");

// ---- edges
check("empty and missing titles give an empty string", formatCircularTitle("") === "" && formatCircularTitle(null) === "" && formatCircularTitle(undefined) === "");
check("a title with no letters is left alone", formatCircularTitle("2024-25 / 12") === "2024-25 / 12");
check("spaces are kept exactly (a title is not re-spaced)", formatCircularTitle("CIRCULAR-  HOLIDAY   LIST") === "Circular-  Holiday   list");

// ---- two safety properties over every title above
const ALL = [...MIXED,
  "CIRCULAR- IMPLEMENTATION OF CONTACTLESS ATTENDANCE SYSTEM", "CIRCULAR-HOLIDAY LIST FOR EMPLOYEES OF DSP-2024", "CIRCULAR - HOLIDAYS AND LEAVES FOR CONTRACTOR WORKERS IN DSP -2025",
  "CIRCULAR-HEALTH CHECK UP OF NON-EXECUTIVE EMPLOYEES DURING THE MONTH OF JANUARY-2025", "CIRCULAR-HOLIDAY LIST-2025", "CIRCULAR-SELECTION OF PLAYERS FOR DSP TABLE TENNIS TEAM",
  "CIRCULAR-ZERO TOLERANCE SAFETY RULES (REVISED)", "CIRCULSR-SAIL GAURAV DIWAS-2026", "CIRCULAR -EXTENSION OF SAIL MEDICLAIM POLICY(26-27)", "CIRCULAR - HTS Jan-May 2026 Session",
  "CIRCULAR-Commemoration of Armed Forces Flag Day", "PROMOTION ORDER E1-E2 W.E.F. 31.12.2025", "WORKER'S COMPENSATION RULES", "CIRCULAR FOR C&IT DEPARTMENT"];
check("ONLY the case of letters ever changes (same letters, same order, every other character identical)", ALL.every((t) => formatCircularTitle(t).toLowerCase() === t.toLowerCase()));
check("applying it twice gives the same as once (idempotent)", ALL.every((t) => formatCircularTitle(formatCircularTitle(t)) === formatCircularTitle(t)));

console.log(`\ncircularTitle selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
