// src/lib/nl2sql/eval/seed-local.ts
// TEST ONLY: deterministic synthetic roster for the local self-test. Contains
// the tricky names from the real conversations (Kumar/Nath/Debnath families,
// initials, Roy/Ray/Rai) so the taught phonetic recipes are exercised.

export const GRADES: [number, number, string, string, number][] = [
  [1, 227, "Director In-charge", "managerial", 1], [2, 223, "Executive Director", "managerial", 2],
  [3, 222, "Chief General Manager", "managerial", 3], [4, 222, "Director(M&HS)", "medical", 3],
  [5, 221, "General Manager", "managerial", 4], [6, 221, "Joint Director", "medical", 4],
  [7, 216, "Dy. General Manager", "managerial", 5], [8, 216, "Sr. Deputy Director", "medical", 5],
  [9, 213, "DMO/Consultant", "medical", 6], [10, 212, "Asst.General Manager", "managerial", 7],
  [11, 212, "Asst. Director/Sr. Consultant", "medical", 7], [12, 211, "Sr. Manager", "managerial", 8],
  [13, 208, "Manager", "managerial", 9], [14, 207, "Dy. Manager", "managerial", 10],
  [15, 206, "ADMO/Specialist", "medical", 11], [16, 204, "Asst. Manager", "managerial", 12],
  [17, 204, "Medical Officer", "medical", 12], [18, 201, "Asst. Manager", "managerial", 13],
  [19, 201, "Junior Manager", "managerial", 13], [20, 415, "S-11", "nonexec", 14],
  [21, 414, "S-10", "nonexec", 15], [22, 409, "S-9", "nonexec", 16], [23, 408, "S-8", "nonexec", 17],
  [24, 407, "S-7", "nonexec", 18], [25, 406, "S-6", "nonexec", 19], [26, 405, "S-5", "nonexec", 20],
  [27, 404, "S-4", "nonexec", 21], [28, 403, "S-3", "nonexec", 22], [29, 402, "S-2", "nonexec", 23],
  [30, 401, "S-1", "nonexec", 24],
];

// id, code, name, cohort_scope
export const DEPARTMENTS: [number, number, string, string][] = [
  [1, 98500, "C & IT", "executive"], [2, 98530, "COMPUTER and IT STAFF", "nonexecutive"],
  [3, 98540, "C & IT (TECH)", "nonexecutive"], [4, 85000, "PLANT GARAGE", "shared"],
  [5, 85110, "PLANT GARAGE (M.H.E.O.D.)", "shared"], [6, 85200, "PLANT GARAGE (M.H.E.M.D.)", "shared"],
  [7, 10174, "ELECTRICAL TECHNICAL LAB", "shared"], [8, 20001, "BLAST FURNACE (OPERATION)", "shared"],
  [9, 20002, "MERCHANT MILL (ELECT)", "shared"], [10, 20003, "MEDICAL ORGANISATION", "shared"],
  [11, 20004, "PROJECT ENGINEERING DEPTT.", "shared"], [12, 20005, "WHEEL & AXLE PLANT (OPRN)", "shared"],
  [13, 20006, "POWER MANAGEMENT DEPTT.", "shared"], [14, 103, "P.R.O.", "executive"], [15, 103, "LAW", "nonexecutive"],
];

// Fixed edge-case people: [name, gradeId, deptId]
const EDGE: [string, number, number][] = [
  ["SANJAY DEBNATH", 5, 9], ["BIMAL DEBNATH", 5, 13], ["SUKANTA DEBNATH", 5, 13], ["CHINMAY SARAN NATH", 5, 8],
  ["NIRUPAM NATH", 5, 11], ["PRANAB NATH", 10, 12], ["AMAR NATH DEBNATH", 13, 7], ["AMAR NATH BANERJEE", 13, 7],
  ["JAYANTA NATH DAS", 13, 7], ["JAYANTA DEBNATH", 26, 7], ["JAYANTA NATH", 26, 7], ["G D KUMAR KISPOTTA", 24, 12],
  ["V S GOPINATH", 27, 5], ["GOUTAM DEBNATH", 20, 3], ["PRADIP NATH", 5, 1], ["AJIT KUMAR", 5, 1],
  ["SURESH RAMANATH", 13, 7], ["UPENDRANATH BARMAN", 5, 11], ["VISHWANATH SINGH KANWAR", 5, 9],
  ["KUMAR BOURI", 21, 8], ["KUMAR CHANDAN SUMAN", 10, 12], ["ASHOK KUMAR", 22, 5], ["KUMAR", 30, 5],
  ["KUMAR KUMAR DAS", 27, 6], ["RAJ KUMAR KUMAR", 27, 6], ["SUSIL KUMAR DALEI", 10, 4],
  ["ARUP RAY", 13, 7], ["ARUP ROY", 13, 7], ["ARUP RAI", 13, 7], ["SANJAY KUMAR GAJBHIYE", 2, 11],
  ["RUPAK KUMAR GOSWAMI", 4, 10], ["DILIP KUMAR MISHRA", 3, 6], ["ALOK KUMAR MOHANTY", 3, 6],
];

const FIRST = ["AMIT", "RAJESH", "SURESH", "MANOJ", "DEEPAK", "ANIL", "SUNIL", "VIJAY", "RAMESH", "PRADEEP", "ASHISH", "SANDIP",
  "TAPAN", "GOPAL", "HARI", "KRISHNA", "SUBRATA", "PARTHA", "DEBASIS", "ARIJIT", "MRINAL", "NIKHIL", "BIPLAB", "SAMIR", "RANJAN", "MUKESH"];
const MID = ["KUMAR", "CHANDRA", "KANTA", "NATH", "PRASAD", "SHANKAR", "G", "D", "S", "K", "KUMAR", "KUMAR"];
const LAST = ["SINGH", "ROY", "RAY", "GHOSH", "GHOSE", "BANERJEE", "BANDYOPADHYAY", "MAZUMDAR", "MAJUMDER", "DAS", "SARKAR",
  "KUMAR", "MISHRA", "JHA", "SAHU", "DEBNATH", "NATH", "PAUL", "SEN", "DUTTA", "DUTT", "BOSE", "BASU", "PRASAD", "YADAV"];

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const q = (v: string | null) => (v === null ? "NULL" : "'" + v.replace(/'/g, "''") + "'");

export function buildSeedSql(extraRandom = 900): string {
  const r = rng(20260929);
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  const people: { name: string; grade: number; dept: number }[] = EDGE.map(([name, grade, dept]) => ({ name, grade, dept }));
  const gradeIds = GRADES.map((g) => g[0]);
  const nonexecWeighted = GRADES.filter((g) => g[3] === "nonexec").map((g) => g[0]);
  for (let i = 0; i < extraRandom; i++) {
    const words = [pick(FIRST)];
    if (r() < 0.55) words.push(pick(MID));
    words.push(pick(LAST));
    const grade = r() < 0.75 ? pick(nonexecWeighted) : pick(gradeIds.filter((g) => !nonexecWeighted.includes(g)));
    people.push({ name: words.join(" "), grade, dept: DEPARTMENTS[Math.floor(r() * DEPARTMENTS.length)][0] });
  }
  const rankOf = new Map(GRADES.map((g) => [g[0], g[4]]));
  const trackOf = new Map(GRADES.map((g) => [g[0], g[3]]));
  const pos = new Map<number, number>();
  const out: string[] = [];
  out.push("INSERT INTO public.designation_grade VALUES " + GRADES.map((g) => `(${g[0]},${g[1]},${q(g[2])},${q(g[3])},${g[4]})`).join(",") + ";");
  out.push("INSERT INTO public.sail_department VALUES " + DEPARTMENTS.map((d) => `(${d[0]},${d[1]},${q(d[2])},${q(d[3])})`).join(",") + ";");
  const users: string[] = [];
  const rows: string[] = [];
  people.forEach((p, i) => {
    const n = (pos.get(p.grade) ?? 0) + 1;
    pos.set(p.grade, n);
    const cohort = trackOf.get(p.grade) === "nonexec" ? "nonexecutive" : "executive";
    const ticket = String((cohort === "executive" ? 490000 : 200000) + i);
    const linked = r() < 0.7;
    const uid = linked ? `u${i}` : null;
    if (linked) users.push(`(${q(uid)},${q(p.name)},${r() < 0.6 ? q(`u${i}@sail.in`) : "NULL"},'HASHED-SECRET-${i}',${r() < 0.5 ? q("9434790" + String(i).padStart(3, "0")) : "NULL"},${q(ticket)},NULL)`);
    rows.push(
      `(${q(ticket)},${q("P" + i)},${q(p.name)},${p.grade},${p.dept},${q(cohort)},${n},${rankOf.get(p.grade)! * 10000 + n},${q(uid)},` +
        `${r() < 0.7 ? q("QTR " + i) : "NULL"},${r() < 0.3 ? q(`w${i}@saildsp.co.in`) : "NULL"},${r() < 0.9 && cohort === "executive" ? q(`n${i}@sail.in`) : "NULL"})`,
    );
  });
  out.push(`INSERT INTO public."user" VALUES ${users.join(",")};`);
  out.push(
    `INSERT INTO public.employee_roster (ticket_no,sail_pno,name,designation_grade_id,sail_department_id,cohort,within_grade_position,global_seniority_rank,user_id,address,webmail_saildsp,email_nic) VALUES ${rows.join(",")};`,
  );
  return out.join("\n");
}
