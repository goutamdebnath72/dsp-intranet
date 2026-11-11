// scripts/eds-panel-queries.ts: a panel of NEW Executive Deep Synthesis questions, written from what the 53 archived circulars really contain.
// Each question has a "shape" (what kind of answer it needs) so that a weakness can be traced to a KIND of question, not to one circular.
export interface PanelQuery { id: string; shape: string; q: string; }

export const PANEL: PanelQuery[] = [
  { id: "P01", shape: "ladder / stages table", q: "Under the revised Zero Tolerance Safety Rules, what consequence follows each violation at each stage, and through whom is it issued?" },
  { id: "P02", shape: "big multi-column table", q: "Compare all the motivational award schemes of DSP by beneficiary grade, award amount, periodicity, executing authority and the occasion on which each is awarded." },
  { id: "P03", shape: "year-on-year comparison", q: "How do the public holidays notified for DSP employees in 2024, 2025 and 2026 compare, and which festival dates differ between the years?" },
  { id: "P04", shape: "3-year evolution", q: "How did the holidays and leave entitlements for contractor workers in DSP change between 2023, 2024 and 2025?" },
  { id: "P05", shape: "recurring instructions", q: "What are the reporting time, venue, preparation instructions and the report-collection arrangements for the non-executive health check-ups in December 2024, January 2025 and January 2026?" },
  { id: "P06", shape: "scheme edition comparison", q: "How does the January to May 2026 Hindi Teaching Scheme session differ from the one starting in January 2024 in courses, eligibility, number of candidates and incentives?" },
  { id: "P07", shape: "two unrelated topics, one answer", q: "Explain the refundable PF loan pre-mature repayment procedure and, separately, the PF contribution granted to Junior Officers of the 2008 and 2010 batches." },
  { id: "P08", shape: "single facility, details + corrigendum", q: "Describe the 2026 gift card facility for DSP employees: amount, who can opt, how to opt, the last date, and what the corrigendum changed." },
  { id: "P09", shape: "deadlines across circulars", q: "List every 2026 last date announced in the circulars for Mediclaim renewal, ESS allowance entry by non-executives, PF loan repayment requests and the gift card option." },
  { id: "P10", shape: "two rollouts compared", q: "Compare how face-recognition attendance was introduced for executives in 2023 and for contractor workers in 2024: start dates, who is covered, technology used and what happens to those who do not register." },
  { id: "P11", shape: "who / how many / by when (names must not leak contacts)", q: "Who has to submit the Format B declaration for SIR, in how many copies, to whom and by when, and who are the nodal officers?" },
  { id: "P12", shape: "people list from an order", q: "Which executives were promoted from E1 to E2 with effect from 31 December 2025, with their present designation, promoted designation and pay scale?" },
  { id: "P13", shape: "two vacancy notices compared", q: "Compare the Joint Industrial Adviser vacancy in the Ministry of Steel with the ICVL MD & CEO deputation in Mozambique: eligibility, pay, mode of filling and how to apply." },
  { id: "P14", shape: "procedure", q: "Explain the online Leave Management System procedure for non-executives: from when it is compulsory, who recommends, who sanctions and what the employee must do." },
  { id: "P15", shape: "two seasons of the same event", q: "What selection trials, coach selections, venues, dates and entry conditions were announced for the Inter Steel Plant Football Championship in 2022-23 and in 2024-25?" },
  { id: "P16", shape: "simple fact, messy wording", q: "wat was the SAIL day walk/run 2026 - date, distance, start point and who all can participate categories" },
  { id: "P17", shape: "Hindi question", q: "डीएसपी हिंदी शिक्षण योजना में प्रबोध, प्रवीण, प्राज्ञ और पारंगत पाठ्यक्रमों की पात्रता, अवधि और नकद पुरस्कार क्या हैं?" },
  { id: "P18", shape: "amendment of a scheme", q: "What amendment was made to the Merit Award Scheme for contract workers in 2026 and what does it change?" },
  { id: "B01", shape: "BOUNDARY: other engine (doctors / OPD)", q: "Compare the OPD timings and consultant names of the DSP Main Hospital departments with the reporting time fixed for the non-executive health check-up." },
  { id: "B02", shape: "BOUNDARY: other engine (phone directory / roster)", q: "Give the phone extensions and email addresses of every officer in the Computers & Information Technology department and compare them with the nodal officers named for SIR." },
  { id: "B03", shape: "BOUNDARY: not in the archive", q: "Summarise the 2026 bonus and productivity-linked reward rules for executives and compare them with the 2025 rules." },
];
