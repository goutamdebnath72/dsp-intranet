// scripts/eds-new-keys.ts: SIX NEW QUESTIONS for the EDS gold test, written on 23 Nov 2026 from the circulars' own text BEFORE any run of the engine, on circulars no earlier gold, fresh or shelf question used
// (9, 28, 18, 32, 4, 43, 55, 34, 33). Same shape as eds-gold-keys.ts. Use:  GOLD_KEYS=./scripts/eds-new-keys.ts npx tsx --env-file=.env.local --tsconfig tsconfig.selftest.json scripts/eds-gold.ts
// Each key was checked against the stored text of its circular (the pattern matches it), except the ones marked DERIVED: those are conclusions a good answer draws, and the circular does not print them.
import type { GoldFact, GoldQuestion } from "./eds-gold-keys";
const f = (fact: string, ...any: RegExp[]): GoldFact => ({ fact, any: any.length ? any : [new RegExp(fact, "i")] });

export const GOLD: GoldQuestion[] = [
  {
    id: "N01", topic: "football coach notices Dec 2022 vs Dec 2024 (circulars 9, 28)",
    q: "Compare the notices seeking a football coach for the Inter Steel Plant Football Championship in December 2022 and December 2024: which plant hosts it, on what dates, by when and where documents are sent, and what credentials are asked.",
    must: [
      f("2022: hosted by Bokaro Steel Plant", /bokaro/),
      f("2022: championship 4 to 8 January 2023", /04\.01\.2023|\b4 january 2023|\b4\.1\.2023/),
      f("2022: documents by 23 December 2022", /23\.12\.2022|23 december 2022/),
      f("2022: email admn.dsp@sail.in", /admn\.dsp@sail\.in/),
      f("2024-25: hosted by IISCO Steel Plant, Burnpur", /iisco|burnpur/),
      f("2024: championship 15 to 20 December 2024", /15\.12\.2024|15 december 2024/),
      f("2024: documents by 4 December 2024", /04\.12\.2024|\b4 december 2024|\b4\.12\.2024/),
      f("2024: email pp.roy@sail.in", /pp\.roy@sail\.in/),
      f("credential: NIS certificate holder", /nis certificate/),
      f("credential: All India certificate holder", /all india certificate/),
      f("credential: national player", /national player/),
      f("credential: district level selector", /district[- ]level selector/),
      f("DERIVED: the credentials are the same in both notices", /same|unchanged|identical|did not change|no change|remain/),
    ],
    mustNot: [
      { why: "says the credentials changed between the notices (they are the same four)", re: /(credentials?|qualifications?|requirements?)[^.\n]{0,60}(was|were|are|have been|had been) (changed|revised|different|added|dropped|removed)/ },
      { why: "gives the 2024 championship to Bokaro or the 2022 one to IISCO", re: /2024[^.\n]{0,80}(hosted|organi[sz]ed) by bokaro|2022[^.\n]{0,80}(hosted|organi[sz]ed) by iisco/ },
    ],
  },
  {
    id: "N02", topic: "volleyball: inter-department tournament 2023 vs championship coach notice Dec 2025 (circulars 18, 32)",
    q: "How do the Inter Department Night Volleyball Tournament 2023 circular and the December 2025 notice for the All India Inter Steel Plants Volleyball Championship differ in who takes part and how entries, the team or the coach are chosen?",
    must: [
      f("2023: at Nehru Stadium", /nehru stadium/),
      f("2023: starts 19 December 2023", /19 december 2023/),
      f("2023: entries only through the head of department", /head of (the )?department|\bhod\b/),
      f("2023: no entries after 18 December 2023 12.30 pm", /18 december 2023/),
      f("2023: team of 11 including one coach and one manager", /\b11\b|eleven/),
      f("2023: departmental safety officer is the manager", /safety officer|\bdso\b/),
      f("2023: one player from a non-participating department on lien", /lien/),
      f("2023: no relaxation or spent-on-duty", /spent[- ]on[- ]duty|no relaxation/),
      f("2025: championship 15 to 17 January 2026", /15\.01\.2026|15 january 2026/),
      f("2025: hosted by Alloy Steels Plant, Durgapur", /alloy steels? plant/),
      f("2025: the employee with the highest credential is the coach", /highest credential/),
      f("2025: players chosen by the coach and a senior volleyball player (ex-employee of DSP)", /senior volleyball player|ex-?\s?employee/),
      f("2025: documents by 5 January 2026", /05\.01\.2026|\b5 january 2026|\b5\.1\.2026/),
      f("2025: email pp.roy@sail.in", /pp\.roy@sail\.in/),
    ],
    mustNot: [
      { why: "says the 2025 championship is organised by Durgapur Steel Plant itself (it is Alloy Steels Plant)", re: /championship[^.\n]{0,100}(organi[sz]ed|hosted) by (the )?durgapur steel plant/ },
    ],
  },
  {
    id: "N03", topic: "the online Leave Management System procedure (circular 4)",
    q: "What is the procedure of the online Leave Management System for DSP employees: from when it is compulsory, how to log in, who sanctions, how leave is cancelled, and how it feeds salary processing?",
    must: [
      f("applications through LMS only on and after 1 January 2023", /01\.01\.2023|1 january 2023|\b1\.1\.2023/),
      f("log in with the ESS user id and password", /ess/),
      f("each employee is mapped to a recommending and a sanctioning authority, kept by the department", /recommending/, /sanctioning/),
      f("the application goes to the recommending and sanctioning authorities", /sanctioning authorit/),
      f("a leave can be cancelled by the employee only before it is granted", /prior to grant|before (it is )?(granted|sanction)|before grant/),
      f("once granted, a request must be raised and only the granting authority can cancel", /granting authority/),
      f("the status and balance update at every stage", /every stage|balance/),
      f("the last date of grant of leave through LMS is the 10th of the succeeding month", /\b10\b[^.\n]{0,40}(succeeding|following|next) month|10th of (the )?(succeeding|following|next)/),
      f("granted leave is combined with duty days of the previous month from the attendance recording system for salary", /duty days/),
      f("non-executives of Works and Non-Works areas / all employees", /non[- ]executive/),
    ],
    mustNot: [
      { why: "gives another last date for granting leave (it is the 10th of the succeeding month)", re: /last date[^.\n]{0,80}\b(?:5|15|20|25|30)\b[^.\n]{0,25}(succeeding|following|next) month/ },
    ],
  },
  {
    id: "N04", topic: "two 2026 deadline extensions: SAIL Mediclaim renewal and non-executives' perks and allowances entry (circulars 43, 55)",
    q: "What deadline extensions did the 2026 circulars announce for the SAIL Mediclaim Scheme renewal and for the non-executives' entry of options for perks and allowances through ESS: the old and new last dates and who issued each?",
    must: [
      f("Mediclaim: renewal had been open till 20 August 2026", /20\.08\.2026|20 august 2026/),
      f("Mediclaim: extended to 31 August 2026", /31\.08\.2026|31 august 2026/),
      f("Mediclaim: including Gap cases", /gap/),
      f("Mediclaim: communication from the Corporate Office, New Delhi", /corporate office|new delhi/),
      f("Mediclaim: scheme 2026-27", /2026-27|2026-2027/),
      f("perks: last date extended to 17 July 2026", /17 july 2026|17\.07\.2026/),
      f("perks: entry through ESS, Pay, Allowance Entry on the DSP intranet", /allowance entry/),
      f("perks: for non-executives", /non[- ]exec/),
      f("perks: follows earlier circulars of 11.06.2026 and 16.06.2026", /11\.06\.2026|11 june 2026/, /16\.06\.2026|16 june 2026/),
      f("perks: circular dated 10 July 2026", /10\.07\.2026|10 july 2026/),
    ],
    mustNot: [
      { why: "swaps the two dates (Mediclaim to 17 July, or the perks entry to 31 August)", re: /mediclaim[^.\n]{0,120}17 july|(perks|allowances?)[^.\n]{0,120}31 august/ },
    ],
  },
  {
    id: "N05", topic: "promotion order E1-E2 w.e.f. 31.12.2025 (circular 34)",
    q: "Which executives were promoted from Assistant Manager to Deputy Manager with effect from 31 December 2025, in which departments, to what pay scale, and who else was promoted?",
    must: [
      f("Deputy Manager (MSM)", /msm/),
      f("Deputy Manager (Oxygen Plant)", /oxygen plant/),
      f("two in Safety", /safety/),
      f("Deputy Manager (R&C Lab)", /r&c lab|r & c lab/),
      f("Deputy Manager (C&IT)", /c&it|c & it/),
      f("two Medical Officers promoted to Senior Medical Officer (M&HS)", /sr\.? ?medical offi\w*|senior medical offi\w*/),
      f("scale of pay 70000-3%-200000", /70000[- ]*3%[- ]*200000|70,?000/),
      f("effective 31 December 2025", /31[-.]12[-.]2025|31 december 2025/),
      f("pay on promotion fixed as per rules", /as per rules|per rules/),
      f("eight executives in all", /\b8\b|eight/),
    ],
    mustNot: [
      { why: "gives a scale other than 70000-3%-200000", re: /scale[^.\n]{0,60}(60000|80000|90000|100000)-/ },
    ],
  },
  {
    id: "N06", topic: "SAIL Foundation Day 5 km walk/run, 24 Jan 2026 (circular 33)",
    q: "For the SAIL Foundation Day 5 km walk/run of 24 January 2026, who can take part, how and by when must entries be made, what is the programme timing, and what are the conditions about identity and leave?",
    must: [
      f("on 24 January 2026 (Saturday)", /24 january,? 2026|24\.01\.2026/),
      f("starts and ends at DSP Nehru Stadium", /nehru stadium/),
      f("registration by 15 January 2026, 6 pm", /15 january,? 2026|15\.01\.2026/),
      f("no registration after that date and time", /no (request|registration)|not (be )?(accepted|entertained|acceptable)/),
      f("children of employees: entries through the head of department", /head of (the )?department|\bhod\b/),
      f("employees send age proof certified by their personnel officer (APO)", /\bapo\b|personnel officer/),
      f("entry forms from the Sports Office of Nehru Stadium, or by email to pp.roy@sail.in", /pp\.roy@sail\.in/),
      f("groups by class (up to VI, VII and above) and by age (up to 45, 46 to 60) for employees and family", /class[- ]?(vi|vii|6|7)/, /45/),
      f("ex-employees of DSP may take part", /ex-?\s?employees?|former employees?/),
      f("flag off at 8:00 am", /8[:.]00|08[:.]00/),
      f("chief guest arrives 7:45 am and the oath at 7:50 am", /7[:.]45/, /7[:.]50/),
      f("prize distribution and refreshments 9:00 to 9:30 am", /9[:.]00|09[:.]00/),
      f("medical card needed for wards (employees' children) and ex-employees", /medical card/),
      f("no spent-on-duty (no leave) is allowed for taking part or officiating", /spent[- ]on[- ]duty|no additional (leave|holiday)|additional leave/),
    ],
    mustNot: [
      { why: "gives another registration date (it is 15 January 2026)", re: /registration[^.\n]{0,80}\b(?:10|12|18|20|22|24) january 2026/ },
    ],
  },
];
