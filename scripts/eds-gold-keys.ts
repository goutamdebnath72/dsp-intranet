// scripts/eds-gold-keys.ts: the GOLD test of the EDS engine. Each question has an answer KEY written from the circular's own text (checked against the stored text
// of 9 Nov 2026): the facts a correct answer MUST contain (a fact is found when any one of its patterns matches the normalised answer) and the statements it must NOT make.
// Normalisation (see eds-gold.ts): lower case; thousands commas removed; "24th" -> "24"; "Rs." / "₹" -> "rs".
export interface GoldFact { fact: string; any: RegExp[]; }
export interface GoldQuestion { id: string; topic: string; q: string; must: GoldFact[]; mustNot: Array<{ why: string; re: RegExp }>; }
const f = (fact: string, ...any: RegExp[]): GoldFact => ({ fact, any: any.length ? any : [new RegExp(fact, "i")] });

export const GOLD: GoldQuestion[] = [
  {
    id: "G01", topic: "holidays 2024/25/26 (circulars 72, 71, 81)",
    q: "How do the public holidays notified for DSP employees in 2024, 2025 and 2026 compare, and which festival dates differ between the years?",
    must: [
      f("Saraswati Puja 2024 14 Feb", /14 february/), f("Saraswati Puja 2026 23 Jan", /23 january/), f("Maha Shivaratri 2025 26 Feb", /26 february/),
      f("Doljatra/Holi 25 Mar 2024", /25 march/), f("Holi 14 Mar 2025", /14 march/), f("Doljatra 3 Mar 2026", /\b3 march/),
      f("Good Friday 29 Mar 2024", /29 march/), f("Good Friday 18 Apr 2025", /18 april/), f("Good Friday 3 Apr 2026", /\b3 april/),
      f("Id-ul-Fitr 11 Apr 2024", /11 april/), f("Id-ul-Fitr 31 Mar 2025", /31 march/), f("Id-ul-Fitr 21 Mar 2026", /21 march/),
      f("Buddha Purnima 23 May 2024", /23 may/), f("Buddha Purnima 12 May 2025", /12 may/),
      f("Bakrid 17 Jun 2024", /17 june/), f("Bakrid 7 Jun 2025", /\b7 june/), f("Bakrid 27 May 2026", /27 may/),
      f("Janmashtami 26 Aug 2024", /26 august/), f("Janmashtami 16 Aug 2025", /16 august/), f("Janmashtami 4 Sep 2026", /\b4 september/),
      f("Maha Ashtami 30 Sep 2025", /30 september/), f("Maha Ashtami 19 Oct 2026", /19 october/), f("Maha Navami 1 Oct 2025", /\b1 october/), f("Maha Navami 20 Oct 2026", /20 october/), f("Dasami 21 Oct 2026", /21 october/),
      f("Guru Nanak 15 Nov 2024", /15 november/), f("Guru Nanak 5 Nov 2025", /\b5 november/), f("Guru Nanak 24 Nov 2026", /24 november/),
      f("Bhatridwitiya 11 Nov 2026", /11 november/), f("Rath Yatra 16 Jul 2026", /16 july/),
      f("Bhatridwitiya 23 Oct 2025 as additional festival holiday for Category B", /23 october/),
      f("restricted holidays mentioned", /restricted/),
    ],
    mustNot: [
      { why: "says the public-holiday DATES shift (only the weekdays do)", re: /(closed|public)[^.\n]{0,160}dates? (shift|vary|change)|(five|5) [^.\n]{0,60}holidays[^.\n]{0,80}dates? shift/ },
      { why: "Bhatridwitiya 2024 and 2025 both 'Not stated' (circulars list it: restricted 2024, additional festival 2025)", re: /bhatridwitiya[^\n|]*\|[^|\n]*not stated[^|\n]*\|[^|\n]*not stated/ },
    ],
  },
  {
    id: "G02", topic: "gift card + corrigendum (circulars 51, 49)",
    q: "Summarise the 2026 gift card facility for DSP employees and explain what the corrigendum changed: amount, who can opt, how to opt and the last date.",
    must: [f("corrected amount 14,999", /14999/), f("original amount 15,000 mentioned", /15000/), f("last date 15.08.2026 (unchanged)", /15 august 2026|15\.08\.2026/), f("ESS portal", /\bess\b|employee self service/), f("E-Multi Benefit Card", /e-multi benefit/), f("non-executives covered", /non-?executives?/), f("executives covered", /\bexecutives\b/)],
    mustNot: [{ why: "restricts it to executives", re: /(only|exclusively) (for )?(the )?executives|executives only/ }, { why: "gives 15,000 as the final amount without 14,999", re: /^(?![\s\S]*14999)[\s\S]*15000/ }],
  },
  {
    id: "G03", topic: "football selection trials 2022-23 vs 2024-25 (circulars 8, 27)",
    q: "Compare the selection trials for the Inter Steel Plant Football Championship in 2022-23 and in 2024-25: dates, venues, timings, host plants and who could report.",
    must: [f("2022 trial 24 Dec 2022", /24 december,? 2022|24\.12\.2022/), f("Nehru Stadium", /nehru stadium/), f("3 pm", /\b3 ?(:00 )?pm|15:00/), f("Bokaro host", /bokaro/), f("2023 championship 4 Jan", /\b4 january,? 2023|04\.01\.2023/), f("2023 championship ends 8 Jan", /\b8 january,? 2023|08\.01\.2023/), f("employees and wards (2022)", /wards/),
      f("2024 trial 5 Dec 2024", /\b5 december,? 2024|05\.12\.2024/), f("ASP Stadium", /asp stadium/), f("10 AM", /10 ?(:|\.)?(00 )?a\.?m/), f("IISCO / Burnpur host", /iisco|burnpur/), f("2024 championship 15 Dec", /15 december,? 2024|15\.12\.2024/), f("2024 championship ends 20 Dec", /20 december,? 2024|20\.12\.2024/)],
    mustNot: [{ why: "wards allowed in 2024-25 (circular says employees only)", re: /(2024|2025)[^|\n]*\|[^|\n]*\|[^|\n]*wards|2024-25[^.\n]{0,80}(and|with|including) wards/ }],
  },
  {
    id: "G04", topic: "PF loan repayment + JO PF contribution (circulars 42, 19)",
    q: "Explain the refundable PF loan pre-mature repayment procedure and, separately, the PF contribution granted to Junior Officers of the 2008 and 2010 batches.",
    must: [f("last date 10th of every month", /10( ?th)? of (every|each) month|10th/), f("ESS portal", /\bess\b/), f("self-declaration form", /self-?declaration/), f("deposit in designated bank account", /designated/), f("Board of Trustees approval", /board of trustees|\bbot\b/), f("deposit before applying", /deposit/),
      f("JO contribution effective 01.01.2016", /1 january,? 2016|01\.01\.2016/), f("undertaking last date 28.12.2023", /28 december,? 2023|28\.12\.2023/), f("3 equal installments", /3 equal installments|three equal installments/), f("undertaking not to claim other benefit", /undertaking/), f("matching contribution by employee", /matching/)],
    mustNot: [],
  },
  {
    id: "G05", topic: "Merit Award amendment 2026 (circulars 46, 45, 44)",
    q: "Summarise the 2026 amendment to the Merit Award Scheme for contract workers and what it changes.",
    must: [f("last date extended to 31 Aug 2026", /31 august,? 2026|31\.08\.2026/), f("it is an extension", /extend/), f("Merit Scholarship Scheme 2026", /merit scholarship/), f("Shramik Kalyan Cell", /shramik kalyan/), f("Room 206 Ispat Bhawan", /\b206\b/), f("DSPCWWS registered office", /dspcwws/), f("circular dated 15.08.2026", /15 august,? 2026|15\.08\.2026/)],
    mustNot: [{ why: "claims an amount or eligibility change (the circular only extends the date)", re: /(increase[ds]?|reduce[ds]?|raise[ds]?) (the )?(award|scholarship|amount)/ }],
  },
  {
    id: "G06", topic: "face-recognition attendance executives 2023 vs contractor workers 2024 (circulars 13, 26)",
    q: "Compare how face-recognition attendance was introduced for executives in 2023 and for contractor workers in 2024: start dates, who is covered, technology used and what happens to those who do not register.",
    must: [f("executives trial from 01.11.2023", /1 november,? 2023|01\.11\.2023/), f("executives compulsory from 01.01.2024", /1 january,? 2024|01\.01\.2024/), f("RFID card", /rfid/), f("BAMS", /bams/), f("cards distributed from 28.12.2023", /28 december,? 2023|28\.12\.2023/), f("collect cards by 30.12.2023", /30 december,? 2023|30\.12\.2023/),
      f("contractor Phase-1 enrolment 06.12.2024", /6 december,? 2024|06\.12\.2024/), f("Ispat Bhawan first", /ispat bhawan/), f("15 minutes grace", /15 minutes?/), f("PIN is the unique identifier", /\bpin\b/), f("offline registers discontinued", /offline/), f("non-registration: RFID card may not be printed", /rfid card may not|may not (get|be) printed/)],
    mustNot: [{ why: "calls 01.11.2023 the mandatory date (it is the trial start)", re: /mandatory[^\n.]{0,80}(1 november,? 2023|01\.11\.2023)/ }],
  },
  {
    id: "G07", topic: "SIR Format B declaration + nodal officers (circulars 38, 35)",
    q: "Compare the circular on submitting the Format B declaration for SIR with the circular listing the nodal officers: how many copies, the deadline, to whom it goes and which nodal officers are named.",
    must: [f("in duplicate (2 copies)", /duplicate|2 cop|two cop/), f("deadline 31.12.2025", /31 december,? 2025|31\.12\.2025/), f("to the respective Nodal Officer", /nodal officer/), f("Format-A1 sent with Format B copy", /format-? ?a1/), f("a copy kept in personal file", /personal file/), f("Section 17 and 18 of the RP Act 1950", /section 17/), f("main circular dated 24.12.2025", /24 december,? 2025|24\.12\.2025/), f("list dated 27.12.2025", /27 december,? 2025|27\.12\.2025/), f("Ajaiy Agarwal (ACVS)", /ajaiy agarwal|ajay agarwal/), f("K K Sinha (BF)", /k k sinha/), f("Avas Sahu (HR-NW)", /avas sahu/), f("West Bengal CEO instruction", /west bengal/)],
    mustNot: [],
  },
  {
    id: "G08", topic: "Hindi Teaching Scheme Jan 2024 vs Jan-May 2026 (circulars 20, 31)",
    q: "Compare the DSP Hindi Teaching Scheme courses starting January 2024 with the January to May 2026 session: eligibility, duration, number of candidates and cash incentives for each course.",
    must: [f("2024 Prabodh Rs 1600", /\b1600\b/), f("2024 Prabodh 800", /\b800\b/), f("2024 Praveen 1800", /\b1800\b/), f("2024 Praveen 1200", /\b1200\b/), f("2024 Pragya 2400", /\b2400\b/), f("2024 Praveen 600", /\b600\b/),
      f("2026 Praveen 4500", /\b4500\b/), f("2026 Praveen 3000", /\b3000\b/), f("2026 Praveen 1500", /\b1500\b/), f("2026 Pragya 6000", /\b6000\b/), f("Parangat 10000", /\b10000\b/), f("Parangat 7000", /\b7000\b/), f("Parangat 4000", /\b4000\b/),
      f("25 candidates per course", /\b25 candidates|25 per course|25 candidates for each/), f("100 candidates in total", /\b100\b/), f("2024 start 2 January 2024", /2 january,? 2024|02 january,? 2024/), f("2026 nomination by 15 January 2026", /15 january,? 2026/), f("2026 language-based eligibility (Telugu/Mizo...)", /telugu|mizo/), f("Praveen Odia/Bangla...", /odia|bangla/), f("Pragya Punjabi/Urdu...", /punjabi|urdu/), f("2026 class: one hour thirty minutes", /one hour thirty|1\.5 hour|90 minutes|1 hour 30/), f("5 months", /5 months|five months/)],
    mustNot: [{ why: "says incentives increased for all courses (Parangat did not change)", re: /(increase[ds]?|higher|raised)[^\n.]{0,60}all (four |the )?courses/ }, { why: "says Parangat increased", re: /parangat[^\n]{0,100}(increase|higher|raised)/ }],
  },
  {
    id: "G09", topic: "Joint Industrial Adviser vs ICVL MD & CEO (circulars 60, 53)",
    q: "Compare the Joint Industrial Adviser vacancy in the Ministry of Steel with the ICVL MD & CEO deputation in Mozambique: eligibility, pay, mode of filling and how to apply.",
    must: [f("Level 12", /level-? ?12/), f("pay 78,800", /\b78800\b/), f("pay up to 2,09,200", /\b209200\b/), f("5 years in Level 11", /five years|5 years/), f("10 years in Level 10", /ten years|10 years/), f("seven years' experience", /seven years|7 years/), f("age limit 56", /\b56\b|fifty[- ]six/), f("deputation max 4 years", /four years|4 years/), f("composite method / deputation", /composite|deputation/),
      f("ICVL last date 14.09.2026", /14 september,? 2026|14\.09\.2026/), f("internal HR-OD date 11.09.2026", /11 september,? 2026|11\.09\.2026/), f("posting at Tete / Benga Mozambique", /tete|benga/), f("apply to Deputy Manager ICVL Scope Minar", /scope minar|deputy manager/), f("email icvldelhi.hr@gmail.com", /icvldelhi/)],
    mustNot: [{ why: "'5-10 years in Level 10/11' blends two alternatives", re: /5 ?(-|–|to) ?10 years/ }],
  },
];
