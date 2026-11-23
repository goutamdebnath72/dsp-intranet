// src/lib/help/edsGuide.ts
//
// The "Deep search (EDS)" tab of the user guide: one data file, read by src/components/help/EdsTab.tsx. EDS is the main strength of the app, so I gave it a tab of its own, and NOTHING about it is described on the other three tabs.
// The tab says (1) what EDS covers today, (2) what EDS is, with examples, (3) what the back end does when a circular is uploaded, page by page, and which AI model works at each step, (4) what happens, and which model works, when an
// executive asks a deep question, and (5) the questions to test it with, and how to make more.
//
// Nothing here is guessed. Every step and every model name below was read from the code (the upload route, geminiOcr.ts, chunking.ts, geminiEmbedding.ts, executiveSynthesis.ts, edsVerify.ts, edsStore.ts, synthesisIntent.ts) and is pinned by
// src/lib/help/edsGuide.selftest.ts, which reads those files and fails when the guide and the code disagree. The list of questions is the project's own test questions of 9 to 12 November 2026 (the panel, the gold set, the fresh set, and the corrected forms of three of them), de-duplicated; the selftest runs every one through the real detector (synthesisIntent.ts) so that "reaches EDS as typed" is a measured fact, not a claim.
// Keep this file free of server-only imports: it is drawn in the browser.

export const EDS_TITLE = "Executive Deep Search (EDS)";

/** These are the models as the code names them today; the administrator can change them in the server settings, and the tab says so. */
export const MODELS = {
  ocrMain: "gemini-3.8-flash",
  ocrChecker: "gemini-3.6-flash",
  embedding: "gemini-embedding-001",
  router: "gemini-3.8-flash",
  writer: "gemini-3.8-flash",
  checker: "gemini-3.8-flash",
  writerFallbacks: ["gemini-flash-latest"],
} as const;

/** What EDS covers now and what it will cover. */
export const SCOPE = {
  now: "Today EDS works on uploaded circulars and on announcements (their text and the text of their PDFs).",
  later: "After its success, and when reliable, true data becomes available, it will be extended to many more scopes.",
  honest: "EDS is still being improved and is not yet perfect: it can miss a point or word something loosely. Open the circular behind every finding (the numbered chips) and check it before you act on it.",
  who: "It is for signed-in executives (a six-digit ticket starting with 4). A visitor who has not signed in is asked \"Are you an executive?\" and, if not, gets the simple answer of the normal search.",
};

/** I offer two ways in (23 Nov 2026): typing a deep question, and the Executive Deep Search button of the bar's second row ("More tools") */
export const WAYS_IN = "There are two ways in. Type a deep question and press Enter, or press the Executive Deep Search button under the box (the second row, More tools). The button is there for everyone: if you have not signed in it first asks \"Are you an executive?\", Yes opens the sign-in window at once and No takes you back to Everything. Signed in as an executive, the window shows the questions that have been proven to work: press one and it runs at once. Above them are the keywords to keep in a question of your own.";

export interface Example { kind: string; question: string; gets: string }
export const WHAT_IS = {
  lead: "A normal search finds the circular that answers one question. A deep search (EDS) is for a question that no single circular can answer, because the answer has to be built from several circulars (and announcements), years or versions put side by side.",
  points: [
    "It reads the full text of the best-matching circulars and announcements (up to five together), not just a snippet. An announcement is read as its text plus the text of its attached PDF; it is dated by the day it was published, and the dates inside it are reported as stated.",
    "It writes one briefing: an overview, findings, tables and, where the figures allow, charts and number cards. Every finding names the circulars it comes from, and a chip opens that circular.",
    "Where the circulars do not state something it says so (\"Not stated in circular\"); it does not fill the gap.",
    "A second AI reads the briefing against the circulars and plain code removes or corrects what the circulars do not support.",
  ],
  examples: [
    { kind: "Compare years", question: "How do the public holidays notified for DSP employees in 2024, 2025 and 2026 compare, and which festival dates differ between the years?", gets: "One table with a column for each year, the festival dates that differ, and \"Not stated\" where a year's circular is silent." },
    { kind: "Change over time", question: "How did the holidays and leave entitlements for contractor workers in DSP change between 2023, 2024 and 2025?", gets: "A column for each year, each value tied to a quotation from that year's circular, and what really differs between the lists." },
    { kind: "A fact and its correction", question: "Describe the 2026 gift card facility for DSP employees: amount, who can opt, how to opt, the last date, and what the corrigendum changed.", gets: "The facility in one place, with the amount as corrected by the corrigendum (Rs 14,999; the first circular said Rs 15,000) and the unchanged last date." },
    { kind: "Rules by category", question: "Under the rules for retention of company accommodation by ex-employees at city locations, how long can an ex-employee keep the accommodation in Type A and Type B cities, what rent and which authority apply to each period, and what security deposit is needed?", gets: "A table by city type and period with the rent and the approving authority, and number cards for the security deposits." },
    { kind: "Stages of a rule", question: "Under the revised Zero Tolerance Safety Rules, what consequence follows each violation at each stage, and through whom is it issued?", gets: "A table of every violation, its stage, the consequence and who issues it (\"Not stated in circular\" where nobody is named)." },
  ] as Example[],
};

export interface Step { no: number; title: string; what: string }

/** Here I list what the back end does, in order, when a circular is uploaded (src/app/api/circulars/route.ts) */
export const UPLOAD_STEPS: Step[] = [
  { no: 1, title: "Who may upload, and what", what: "Only the HOD of C&IT or an authorised delegate of the Circular manager can upload; the server checks that from the database before any page is read. The file must be a PDF, PNG or JPG of at most 15 MB, with a headline and the circular's own date (not in the future, not before the year 2000)." },
  { no: 2, title: "Every page is turned into a picture and saved", what: "A PDF is drawn page by page as a PNG picture at 300 dpi (a photo or a scan is one page). Each page picture is saved in Vercel Blob storage and its web link is kept with the circular: these pictures are what the circular viewer shows." },
  { no: 3, title: "Two AI readers read every page (OCR)", what: "The circulars we hold are scanned pictures, not the original PDF files, so the words have to be read from the pictures (OCR). Each page picture is shrunk to a 2,400-pixel JPEG and shown at the same moment to two Gemini models, a main reader and a checker. The main reader's text is the page's text. The two readings are compared number by number: a number only one of them saw is recorded as unconfirmed, and the answer card will not show an unconfirmed number as a fact. If one reader fails the other's text is used; if both fail, the upload is refused, because a circular with an unread page would silently lose its content. This step exists only because we do not get the original PDF files." },
  { no: 4, title: "English, Hindi and Bengali check each other", what: "Many circulars say the same thing in all three languages. Letter slips in Hindi and Bengali are repaired from the other reading, and the pages that repeat each other check each other's numbers (a number two pages agree on is confirmed; a reading another page contradicts is unconfirmed). An amount with a stray extra digit, the rupee sign misread as a figure, is flagged too. These checks are plain code, with no AI and no cost." },
  { no: 5, title: "The text is cut into chunks", what: "Page by page, the text is cut into pieces of about 200 words. Each piece remembers its page number, so that a search hit can open the circular at the right page." },
  { no: 6, title: "Each chunk becomes a vector (an embedding)", what: "Google's embedding model turns each chunk, and once more the whole circular (its first 8,192 characters), into a list of 768 numbers that stands for its meaning. Texts with a similar meaning get similar numbers, which is how a question can find a circular that uses different words." },
  { no: 7, title: "Everything is saved in PostgreSQL on Supabase, with pgvector", what: "One database transaction saves the circular's row (headline, date, page links, the whole-circular vector, a serial number within its year) and every chunk's row (text, page number and the 768-number vector in a pgvector column) together, with a record of who uploaded it. Either everything is saved or nothing is: if any step fails the database is left untouched and the page pictures are deleted from storage." },
  { no: 8, title: "Two kinds of circular are handled differently", what: "The employee holiday-list circular is not read or chunked (its facts come from a checked holiday file); it gets only a vector of its headline. A health check-up schedule (a ruled roster of names, dates and rooms) is read by Gemini, checked against the HR records and saved as rows, not as text." },
];

export interface ModelRow { stage: string; model: string; job: string }

export const UPLOAD_MODELS: ModelRow[] = [
  { stage: "Reading each page (main reader)", model: MODELS.ocrMain, job: "reads the page picture and gives the page's text" },
  { stage: "Reading each page (checker)", model: MODELS.ocrChecker, job: "reads the same page at the same time; its numbers are compared with the main reader's" },
  { stage: "Turning text into vectors", model: `${MODELS.embedding} (768 numbers)`, job: "one vector for every 200-word chunk and one for the whole circular" },
  { stage: "Everything else", model: "no AI", job: "drawing the PDF pages, storage, the Hindi/Bengali checks, cutting into chunks, saving to the database" },
];

/** What happens when an executive asks a deep question. */
export const ASK_STEPS: Step[] = [
  { no: 1, title: "The line is recognised as a deep question", what: "In the browser, plain rules (no AI) score the line: an analytic verb such as compare, trace or summarise; a version relation such as what changed or the corrected circular; several years or things named; two questions in one; a long question. A score of 5 or more is a deep question. A signed-in executive is sent on, and the server checks the ticket against the staff directory again. A visitor who has not signed in is first asked \"Are you an executive?\": Yes tells them to sign in with their own account (the question then runs by itself as EDS once they have), No gives the simple answer of the normal search. A question about people (who is the head, a phone number, an e-mail, a designation) is never a deep question: the employee directory answers it." },
  { no: 2, title: "A second way in: the language-model router", what: "For a line the browser did not recognise, a fast Gemini model reads it in any phrasing and names the tool it needs. If it judges that several circulars must be combined and the person is a signed-in executive, EDS runs. If the model is slow, unavailable or answers something invalid, the ordinary search answers; a wrong guess never replaces a right answer." },
  { no: 3, title: "The question becomes a vector and pgvector finds the nearest text", what: "The same embedding model turns the question into 768 numbers. PostgreSQL's pgvector then compares them with the vector of every stored chunk (cosine similarity) and, in the same search, looks for the question's literal words. The best chunks are ranked by circular." },
  { no: 4, title: "The best circulars are chosen and read in full", what: "Up to five relevant circulars are kept. The writer is given their text (condensed only to fit its budget), not search snippets." },
  { no: 5, title: "The writer builds the briefing", what: "The main Gemini model reads the question and the circulars and writes the briefing in a fixed structure: overview, findings (each with the circulars behind it), tables, and charts as data. By default it writes ONE draft (a second one is asked for only when the first is late); plain code scores it, and gives the writer one more attempt when it can see a structural fault such as a year asked for but missing from the table. The AI never chooses a chart type: code does." },
  { no: 6, title: "A second reading checks it", what: "A model (the checker) reads the circulars and the briefing again, sentence by sentence and cell by cell, and reports what is unsupported or contradicted, which rows the table lacks and which part of the question is unanswered. Plain code applies a report only where it can check it: a quotation must be found word for word in the circulars, and a corrected figure must be in the circulars. Nothing is changed on the model's word alone." },
  { no: 7, title: "Plain-code guards", what: "Code, not AI, makes sure every figure in the briefing appears in the circulars, restores abbreviations as the circulars print them, shows a short form's meaning only when the circulars or a confirmed sense give it, builds the tables and number cards, and says \"Not stated in circular\" where a value cannot be proven." },
  { no: 8, title: "It is shown, and kept", what: "The briefing appears with its circular chips (each opens that circular) and a PDF to download. The first good briefing of a question is saved in the database (the table eds_briefing), so the same question asked again, by anyone, gets the same briefing, until the archive of circulars changes. A briefing written by a weaker fallback model, because the main one was out of allowance, is shown once but never saved." },
];

export const ASK_MODELS: ModelRow[] = [
  { stage: "Recognising a deep question", model: "no AI", job: "scoring rules in the browser (5 or more), then the executive check on the server" },
  { stage: "The router (a second way in)", model: MODELS.router, job: "names the tool a line needs; short answer, little thinking" },
  { stage: "The question's vector", model: `${MODELS.embedding} (768 numbers)`, job: "turns the question into numbers that pgvector compares with the stored chunks" },
  { stage: "Finding the text", model: "PostgreSQL with pgvector", job: "cosine similarity over the chunk vectors, plus the literal words; no model writes anything here" },
  { stage: "Writing the briefing", model: `${MODELS.writer}, then ${MODELS.writerFallbacks.join(", then ")} if the one before is out of allowance`, job: "builds the briefing from the full text of the circulars (one draft by default; a second only when the first is late)" },
  { stage: "The second reading", model: `${MODELS.checker}, then the writer's models if the one before is out of allowance`, job: "checks the briefing against the circulars; code applies only what it can verify" },
  { stage: "Guards, tables, number cards, charts", model: "no AI", job: "code" },
];

export interface TestQuery {
  id: string;
  /** The question, exactly as it is to be typed. */
  q: string;
  kind: string;
  /** The circulars it needs: look for these in the Circulars list before trying the question */
  needs: string;
  /** The ids it has in the project's own test lists (P: the panel, G: the gold set, F: the fresh set); a corrected form of a question has none */
  also: string[];
  note?: string;
}

/** The questions that REACH EDS as typed: the selftest scores each with the real detector and wants 5 or more. */
export const TEST_QUERIES: TestQuery[] = [
  { id: "E01", kind: "Compare years", also: ["P03", "G01"], needs: "the holiday lists notified for DSP employees for 2024, 2025 and 2026", q: "How do the public holidays notified for DSP employees in 2024, 2025 and 2026 compare, and which festival dates differ between the years?" },
  { id: "E02", kind: "Compare years", also: ["F03"], needs: "the holiday lists notified for DSP for 2022 and for 2023", q: "Compare the holiday lists notified for DSP for 2022 and 2023: closed and public holidays, festival holidays for each category, restricted holidays, and what differs between the two years." },
  { id: "E03", kind: "Change over time", also: ["P04"], needs: "the holidays-and-leave circulars for contractor workers for 2023, 2024 and 2025", q: "How did the holidays and leave entitlements for contractor workers in DSP change between 2023, 2024 and 2025?" },
  { id: "E04", kind: "Two editions of a scheme", also: ["P06"], needs: "the Hindi Teaching Scheme circulars: the session starting in January 2024 and the one of January to May 2026", q: "How does the January to May 2026 Hindi Teaching Scheme session differ from the one starting in January 2024 in courses, eligibility, number of candidates and incentives?" },
  { id: "E05", kind: "Two editions of a scheme", also: ["G08"], needs: "the Hindi Teaching Scheme circulars of January 2024 and of January to May 2026", q: "Compare the DSP Hindi Teaching Scheme courses starting January 2024 with the January to May 2026 session: eligibility, duration, number of candidates and cash incentives for each course." },
  { id: "E06", kind: "Two seasons of one event", also: ["P15"], needs: "the Inter Steel Plant Football Championship circulars of 2022-23 and 2024-25 (trials, coaches, venues)", q: "What selection trials, coach selections, venues, dates and entry conditions were announced for the Inter Steel Plant Football Championship in 2022-23 and in 2024-25?" },
  { id: "E07", kind: "Two seasons of one event", also: ["G03"], needs: "the football selection-trial circulars of 2022-23 and 2024-25", q: "Compare the selection trials for the Inter Steel Plant Football Championship in 2022-23 and in 2024-25: dates, venues, timings, host plants and who could report." },
  { id: "E08", kind: "Two rollouts compared", also: ["P10", "G06"], needs: "the face-recognition attendance circulars for executives (2023) and for contractor workers (2024)", q: "Compare how face-recognition attendance was introduced for executives in 2023 and for contractor workers in 2024: start dates, who is covered, technology used and what happens to those who do not register." },
  { id: "E09", kind: "Recurring instructions", also: [], needs: "the non-executive health check-up circulars of December 2024, January 2025 and January 2026", q: "Compare the reporting time, venue, preparation instructions and report-collection arrangements for the non-executive health check-ups in December 2024, January 2025 and January 2026.", note: "The corrected form of the panel's P05, which as first written scored 4 and went to the normal search." },
  { id: "E10", kind: "Two notices side by side", also: ["P13", "G09"], needs: "the Joint Industrial Adviser vacancy (Ministry of Steel) and the ICVL MD & CEO deputation (Mozambique)", q: "Compare the Joint Industrial Adviser vacancy in the Ministry of Steel with the ICVL MD & CEO deputation in Mozambique: eligibility, pay, mode of filling and how to apply." },
  { id: "E11", kind: "Two notices side by side", also: ["G07"], needs: "the circular on submitting the Format B declaration for SIR and the circular naming the nodal officers", q: "Compare the circular on submitting the Format B declaration for SIR with the circular listing the nodal officers: how many copies, the deadline, to whom it goes and which nodal officers are named." },
  { id: "E12", kind: "A fact and its correction", also: ["P08"], needs: "the 2026 gift card circular and its corrigendum", q: "Describe the 2026 gift card facility for DSP employees: amount, who can opt, how to opt, the last date, and what the corrigendum changed." },
  { id: "E13", kind: "A fact and its correction", also: ["G02"], needs: "the 2026 gift card circular and its corrigendum", q: "Summarise the 2026 gift card facility for DSP employees and explain what the corrigendum changed: amount, who can opt, how to opt and the last date." },
  { id: "E14", kind: "Amendment of a scheme", also: ["G05"], needs: "the 2026 Merit Award Scheme circulars for contract workers (the scheme and its amendment)", q: "Summarise the 2026 amendment to the Merit Award Scheme for contract workers and what it changes.", note: "The corrected form of the panel's P18, which as first written scored 3 and went to the normal search." },
  { id: "E15", kind: "Stages of a rule", also: ["P01"], needs: "the revised Zero Tolerance Safety Rules circular", q: "Under the revised Zero Tolerance Safety Rules, what consequence follows each violation at each stage, and through whom is it issued?" },
  { id: "E16", kind: "A table across schemes", also: ["P02"], needs: "the circulars of the motivational award schemes of DSP", q: "Compare all the motivational award schemes of DSP by beneficiary grade, award amount, periodicity, executing authority and the occasion on which each is awarded." },
  { id: "E17", kind: "Rules by category", also: ["F01"], needs: "the circular on retention of company accommodation by ex-employees at city locations", q: "Under the rules for retention of company accommodation by ex-employees at city locations, how long can an ex-employee keep the accommodation in Type A and Type B cities, what rent and which authority apply to each period, and what security deposit is needed?" },
  { id: "E18", kind: "Rules by category", also: ["F05"], needs: "the circular on sponsoring executives for higher specialised education", q: "Under the scheme for sponsoring executives for higher specialised education, what bond amount and bond period apply to each type of sponsorship by course duration, and who approves study leave with financial assistance for each grade?" },
  { id: "E19", kind: "Two amounts from two circulars", also: ["F02"], needs: "the revised GPAIS premium circular (from 1 January 2025) and the contract workers' daily wage notice (from 1 January 2024)", q: "What revised GPAIS premium amounts apply to contract workers from 1 January 2025, and what are the minimum daily wages for contract workers in the Works, Projects and Town Services (Electrical) areas from 1 January 2024?" },
  { id: "E20", kind: "A procedure", also: ["P14"], needs: "the circular on the online Leave Management System for non-executives", q: "Explain the online Leave Management System procedure for non-executives: from when it is compulsory, who recommends, who sanctions and what the employee must do." },
  { id: "E21", kind: "Two subjects in one question", also: ["F04"], needs: "the SAIL Gaurav Diwas 2026 circular and the Armed Forces Flag Day circular", q: "What do the circulars say about SAIL Gaurav Diwas 2026 and about contributions on Armed Forces Flag Day: dates, how employees take part, and the ways to pay?" },
  { id: "E22", kind: "Deadlines gathered from many circulars", also: [], needs: "the circulars on Mediclaim renewal, ESS allowance entry by non-executives, PF loan repayment requests and the gift card option", q: "List every 2026 last date announced in the circulars and compare them across Mediclaim renewal, ESS allowance entry by non-executives, PF loan repayment requests and the gift card option.", note: "The corrected form of the panel's P09, which as first written scored 1 and went to the normal search." },
  { id: "E23", kind: "Boundary: the circulars do not cover it", also: ["B03"], needs: "none: on 9 November the archive had no circular on 2025 or 2026 bonus and productivity-linked reward rules for executives", q: "Summarise the 2026 bonus and productivity-linked reward rules for executives and compare them with the 2025 rules.", note: "A test of honesty: a good answer says plainly that the circulars do not state these rules, and does not offer another scheme's figures instead. Try it only to see that." },
];

export interface NotDeep { id: string; /** Other ids of the same question in the project's test lists. */ also?: string[]; q: string; why: string }
/** The project's other test questions. Typed as they stand they do NOT reach EDS (each scores below 5 or is blocked), so I let the normal search or another engine answer them. */
export const NOT_DEEP: NotDeep[] = [
  { id: "P05", q: "What are the reporting time, venue, preparation instructions and the report-collection arrangements for the non-executive health check-ups in December 2024, January 2025 and January 2026?", why: "scores 4: add a verb such as compare, as in E09" },
  { id: "P07", also: ["G04"], q: "Explain the refundable PF loan pre-mature repayment procedure and, separately, the PF contribution granted to Junior Officers of the 2008 and 2010 batches.", why: "scores 4: two unrelated subjects, no analytic cue; the normal search answers each part" },
  { id: "P09", q: "List every 2026 last date announced in the circulars for Mediclaim renewal, ESS allowance entry by non-executives, PF loan repayment requests and the gift card option.", why: "scores 1: add \"compare them\", as in E22" },
  { id: "P11", q: "Who has to submit the Format B declaration for SIR, in how many copies, to whom and by when, and who are the nodal officers?", why: "scores 4: a lookup in one circular; for the deep version see E11" },
  { id: "P12", q: "Which executives were promoted from E1 to E2 with effect from 31 December 2025, with their present designation, promoted designation and pay scale?", why: "a list of people from one order: the people-data guard keeps it out of EDS; the normal search answers it" },
  { id: "P16", q: "wat was the SAIL day walk/run 2026 - date, distance, start point and who all can participate categories", why: "scores 2: a simple fact in messy wording; the normal search answers it" },
  { id: "P17", q: "डीएसपी हिंदी शिक्षण योजना में प्रबोध, प्रवीण, प्राज्ञ और पारंगत पाठ्यक्रमों की पात्रता, अवधि और नकद पुरस्कार क्या हैं?", why: "scores 2: a Hindi question; the normal search answers it (EDS questions are asked in English)" },
  { id: "P18", q: "What amendment was made to the Merit Award Scheme for contract workers in 2026 and what does it change?", why: "scores 3: see E14 for the wording that reaches EDS" },
  { id: "B01", q: "Compare the OPD timings and consultant names of the DSP Main Hospital departments with the reporting time fixed for the non-executive health check-up.", why: "scores 4: doctors and OPD timings are not in circulars; the hospital engine holds them" },
  { id: "B02", q: "Give the phone extensions and email addresses of every officer in the Computers & Information Technology department and compare them with the nodal officers named for SIR.", why: "the people-data guard: phone numbers and e-mail addresses are in the directory, never in EDS" },
];

export const BEFORE_YOU_TEST: string[] = [
  "Open the Circulars list (the circulars archive) and look through its year tabs. Write down which circulars are already uploaded in our database.",
  "Pick a question from the list below only if every circular in its \"Needs\" line is on your list. A question about a circular that is not uploaded cannot be judged: EDS can only use what the database holds. (The one exception is E23, which is meant for a subject with no circular.)",
  "To make your own question, start from the circulars you found in step 1 (see \"Make a question like these\" below). Never write a question about a circular you have not seen in the list.",
  "Sign in as an executive, type the whole question in the search bar and press Enter. A deep answer takes longer than a normal one (up to about two minutes); wait for it.",
  "Check the answer: open every circular chip, compare each figure, date and name with the circular, and note any sentence that is wrong, missing or not in the circular. \"Not stated in circular\" is a correct answer where the circular really is silent.",
];

export const BUILD_TIPS: string[] = [
  "Choose one subject that is written in more than one circular (several years, an edition and its amendment, a rule and its corrigendum) or in two related circulars.",
  "Start with an analytic word: Compare, How did ... change between, List every ... and compare, Explain ... procedure, Under the rules for ..., Summarise ... and what it changes.",
  "Name the subject, the years or editions, and every thing you want to see: amounts, dates, eligibility, who approves, who is covered, the last date. A good question is 25 to 45 words long.",
  "Ask one question, in English, in full sentences. Several subjects are fine if they are joined by \"and\" and each is named.",
  "Keep people-directory words out (who is the head, phone, e-mail, designation, ticket): those go to the employee search, not to EDS.",
  "Check that it reaches EDS: the badge on each question below shows its score. A question that scores below 5 goes to the normal search; add the missing cue (an analytic word, a second year, the things to compare).",
];

export const TEMPLATES: string[] = [
  "Compare [scheme or rule] for [year 1] and [year 2]: [thing 1], [thing 2], [thing 3] and who approves.",
  "How did [subject] change between [year 1], [year 2] and [year 3]?",
  "Describe the [year] [facility] for DSP employees: amount, who can opt, how to opt, the last date, and what the corrigendum changed.",
  "List every [year] last date announced in the circulars and compare them across [subject 1], [subject 2] and [subject 3].",
];
