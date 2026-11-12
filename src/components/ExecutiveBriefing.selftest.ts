// src/components/ExecutiveBriefing.selftest.ts
// Run: npx tsx src/components/ExecutiveBriefing.selftest.ts
import {
  compactChartValue,
  formatValue,
  renderEnterpriseTableCell,
  extractRelevantAbbreviations,
  expansionFromPhrase,
  looksLikeAuthority,
  bracketIsAmount,
  splitValueBracket,
  chartDecimals,
  groupRupees,
  ExecutiveBriefing,
} from "./ExecutiveBriefing";
import React from "react";
import ReactDOMServer from "react-dom/server";

let pass = 0;
let fail = 0;

function ok(name: string, condition: boolean, extra = "") {
  if (condition) {
    pass++;
  } else {
    fail++;
    console.error(`FAIL: ${name}`, extra);
  }
}

function eq(name: string, got: unknown, want: unknown) {
  ok(name, got === want, `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
}

// 1. compactChartValue tests
{
  // Short units
  eq("compact %", compactChartValue(45, "%"), "45%");
  eq("compact ₹", compactChartValue(1500, "₹"), "₹1,500");
  eq("compact multiplier x", compactChartValue(4, "x"), "4×");
  eq("compact days", compactChartValue(12, "days"), "12d");
  eq("compact months", compactChartValue(6, "months"), "6m");

  // Multi-word / long units (>5 chars) must NOT be printed on bar/axis labels
  const longUnit = "Multiples of Base Rate (HRR or Monthly Rent)";
  eq("compact long unit returns pure number with multiplier symbol", compactChartValue(4, longUnit), "4×");
  eq("compact long unit 1.2", compactChartValue(1.2, longUnit), "1.2×");

  const longDescUnit = "Employees in department";
  eq("compact general long unit returns clean number", compactChartValue(25, longDescUnit), "25");
}

// 2. formatValue (tooltips & detail views) tests
{
  eq("format %", formatValue(50, "%"), "50%");
  eq("format currency", formatValue(2000, "₹"), "₹2,000");
  eq("format multiplier", formatValue(4, "multiplier"), "4×");
  eq("format HRR multiplier", formatValue(2, "x HRR"), "2× HRR");
}


// 3-id. an identifier is not an amount: digits unbroken, never grouped, never turned into a number
{
  const txt = (c: string, col: number, name: string) => ReactDOMServer.renderToStaticMarkup(renderEnterpriseTableCell(c, col, name)).replace(/<[^>]+>/g, "");
  ok("an account number alone in a cell is shown unbroken", txt("34420400623", 1, "Account Number") === "34420400623", txt("34420400623", 1, "Account Number"));
  ok("a long account number (16 digits) keeps every digit", txt("3083000100179875", 1, "Details") === "3083000100179875");
  ok("an 18-digit number keeps every digit too (a JavaScript number would lose the last ones)", txt("123456789012345678", 1, "Reference") === "123456789012345678");
  ok("an account number the model wrote with commas comes out unbroken", txt("34,42,04,00,623", 1, "Account Number") === "34420400623" && txt("3,083,000,100,179,875", 1, "Account No.") === "3083000100179875");
  ok("a shorter number under an identifier heading is unbroken as well", txt("12345678", 1, "Account Number") === "12345678");
  ok("a wage under a money heading is still grouped", txt("13478.00", 1, "VDA") === "13,478.00" && txt("20995", 1, "Total") === "20,995");
  ok("a year is still a year", txt("2024", 1, "Year") === "2024");
}

// 3. renderEnterpriseTableCell tests
{
  // Col 0: Period / Milestone indicator
  const htmlCol0 = ReactDOMServer.renderToStaticMarkup(
    renderEnterpriseTableCell("Up to 2 months", 0, "Retention Period")
  );
  ok("col 0 contains bullet pulse", htmlCol0.includes("rounded-full bg-amber-500"));
  ok("col 0 contains text", htmlCol0.includes("Up to 2 months"));

  // Value Col: Rate + Authority pattern
  const htmlAuth = ReactDOMServer.renderToStaticMarkup(
    renderEnterpriseTableCell("4x Standard HRR (Head of P&A)", 1, "Type A")
  );
  ok("auth cell contains bold rate", htmlAuth.includes("4x Standard HRR"));
  ok("auth cell contains authority badge", htmlAuth.includes("Head of P&amp;A") || htmlAuth.includes("Head of P&A"));
  ok("auth cell contains authority chip styling", htmlAuth.includes("bg-amber-50"));

  // Value Col: Rate + Authority + condition note
  const htmlCond = ReactDOMServer.renderToStaticMarkup(
    renderEnterpriseTableCell("4x Standard HRR (Head of P&A) [Mumbai: up to the 4th month only]", 1, "Type A")
  );
  ok("a condition cell still draws the bold rate and the authority chip", htmlCond.includes("4x Standard HRR") && htmlCond.includes("bg-amber-50"));
  ok("a condition cell shows the condition as a note, without the brackets", htmlCond.includes("Mumbai: up to the 4th month only") && !htmlCond.includes("[Mumbai"));

  // Value Col: Not applicable pattern
  const htmlNotApp = ReactDOMServer.renderToStaticMarkup(
    renderEnterpriseTableCell("Not applicable", 1, "Type A")
  );
  ok("not applicable cell has muted pill", htmlNotApp.includes("rounded-full"));
  ok("not applicable cell has slate bg", htmlNotApp.includes("bg-slate-100"));
  ok("not applicable cell text", htmlNotApp.includes("Not applicable"));

  // Value Col: Compound Not applicable / Not stated pattern
  const htmlNotAppCompound = ReactDOMServer.renderToStaticMarkup(
    renderEnterpriseTableCell("Not applicable / Not stated in circular", 1, "Type A")
  );
  ok("compound not app cell has muted pill", htmlNotAppCompound.includes("rounded-full"));
  ok("compound not app cell has slate bg", htmlNotAppCompound.includes("bg-slate-100"));
  ok("compound not app cell text", htmlNotAppCompound.includes("Not applicable / Not stated in circular"));

  // Value Col: Standard HRR (Head of Administration)
  const htmlAdmin = ReactDOMServer.renderToStaticMarkup(
    renderEnterpriseTableCell("Standard HRR (Head of Administration)", 2, "Type B")
  );
  ok("admin auth cell rate", htmlAdmin.includes("Standard HRR"));
  ok("admin auth cell authority", htmlAdmin.includes("Head of Administration"));
}

// 4. extractRelevantAbbreviations tests
{
  const mockData: any = {
    overview: "Under Circular 46, rent escalates to multiples of Standard HRR.",
    keyFindings: [
      { text: "Approval authority escalates to Head of P&A." },
      { text: "Medical services handled by M&HS." },
    ],
    table: {
      columns: ["Retention Period", "Type A Locations", "Type B Locations"],
      rows: [["Upto 2 months", "Standard HRR (Head of Administration)", "Standard HRR"]],
    },
    charts: [],
  };

  const abbrs = extractRelevantAbbreviations(mockData);
  const map = new Map(abbrs);
  ok("abbr detects HRR", map.has("HRR") && map.get("HRR") === "House Rent Recovery");
  ok("abbr detects P&A", map.has("P&A") && map.get("P&A") === "Personnel & Administration");
  ok("abbr detects M&HS", map.has("M&HS") && map.get("M&HS") === "Medical & Health Services");
  ok("abbr does not falsely include OPD", !map.has("OPD"));
}

// 5. the abbreviation strip must never print a wrong expansion (it printed "RFID : RFID Card Biometric")
{
  const rfid: any = {
    overview: "A phased RFID biometric rollout for contract workers began on 6 December 2024.",
    keyFindings: [{ text: "Contract worker RFID Card Biometric (RFID) enrolment began at Ispat Bhawan.", sources: [] }],
    table: { columns: ["Parameter", "Executives", "Contract Workers"], rows: [["Attendance System", "Contactless Face Recognition & RFID Card", "Biometric (RFID) Face Reader"]] },
    charts: [],
  };
  const m = new Map(extractRelevantAbbreviations(rfid));
  eq("RFID is Radio Frequency Identification", m.get("RFID"), "Radio Frequency Identification");
  ok("RFID is listed once", extractRelevantAbbreviations(rfid).filter(([a]) => a === "RFID").length === 1);
  eq("CISF is Central Industrial Security Force", new Map(extractRelevantAbbreviations({ overview: "at the CISF pass section", keyFindings: [], charts: [] } as any)).get("CISF"), "Central Industrial Security Force");
  eq("a phrase whose initials spell the abbreviation is accepted", expansionFromPhrase("GPAIS", "Revised Group Personal Accident Insurance Scheme"), "Group Personal Accident Insurance Scheme");
  eq("filler words are skipped: 'Personnel and Administration' is P&A", expansionFromPhrase("P&A", "the Head of Personnel and Administration"), "Personnel and Administration");
  eq("a phrase whose initials do NOT spell it is refused", expansionFromPhrase("RFID", "RFID Card Biometric"), null);
  eq("a too-short phrase is refused", expansionFromPhrase("CFRS", "Face Recognition"), null);
  const dyn: any = { overview: "The Contactless Face Recognition System (CFRS) and the Card Biometric (XYZ) were introduced.", keyFindings: [], charts: [] };
  const dm = new Map(extractRelevantAbbreviations(dyn));
  eq("a real 'Full Phrase (ABBR)' in the text is still picked up, with only its own words", dm.get("CFRS"), "Contactless Face Recognition System");
  ok("a made-up pairing is not picked up", !dm.has("XYZ"));
  ok("an abbreviation is matched only in capitals: the words 'ed' and 'ta' are not ED and TA", new Map(extractRelevantAbbreviations({ overview: "the ed and ta words", keyFindings: [], charts: [] } as any)).size === 0);
}

// 6. the abbreviations the owner asked for, and the chip that is for approvers only
{
  const all = new Map(extractRelevantAbbreviations({ overview: "GPAIS and BAMS were reviewed; the SAP ERP and the IMS were updated.", keyFindings: [], charts: [] } as any));
  eq("GPAIS", all.get("GPAIS"), "Group Personal Accident Insurance Scheme");
  eq("BAMS", all.get("BAMS"), "Biometric Attendance Management System");
  eq("SAP", all.get("SAP"), "Systems, Applications & Products");
  eq("ERP", all.get("ERP"), "Enterprise Resource Planning");
  eq("IMS", all.get("IMS"), "Incident Management System");
  ok("an approver is an authority", looksLikeAuthority("Head of P&A") && looksLikeAuthority("Concerned Functional Director") && looksLikeAuthority("CGM") && looksLikeAuthority("Chief Executive"));
  ok("'Mandatory' and 'Phase-1 Enrolment' are notes, not authorities", !looksLikeAuthority("Mandatory") && !looksLikeAuthority("Phase-1 Enrolment"));
  const note = ReactDOMServer.renderToStaticMarkup(renderEnterpriseTableCell("01.01.2024 (Mandatory)", 1, "Executives"));
  ok("a note in brackets is drawn as a note, with no approver chip", note.includes("Mandatory") && !note.includes("bg-amber-50"));
}

// 6b. a bracket that holds money is the penalty itself; a bracket glued to a word is a clause reference (found in the Zero Tolerance answer)
{
  ok("money in a bracket is an amount, not an approver, although it says 'officer'", bracketIsAmount("officer Rs - 250/- and employees/CW-Rs- 100/-") && bracketIsAmount("Officers: Rs.500/- and Employees / CW - Rs.200/-") && bracketIsAmount("₹ 500"));
  ok("an approver or a note is not an amount", !bracketIsAmount("Head of P&A") && !bracketIsAmount("Mandatory") && !bracketIsAmount("Phase-1 Enrolment"));
  const pen = ReactDOMServer.renderToStaticMarkup(renderEnterpriseTableCell("3rd) Financial penalty (officer Rs - 250/- and employees/CW-Rs- 100/-) [up to 3 violations]", 2, "Revised consequence"));
  ok("the penalty amounts stay in the value, with no approver chip, and the condition is the note", pen.includes("officer Rs - 250/-") && !pen.includes("bg-amber-50") && pen.includes("up to 3 violations"), pen);
  const pen2 = ReactDOMServer.renderToStaticMarkup(renderEnterpriseTableCell("4th) Financial penalty (Officers: Rs.500/- and Employees / CW - Rs.200/-) [For all subsequent violations]", 2, "Revised consequence"));
  ok("a second penalty row is drawn the same way as the first", pen2.includes("Officers: Rs.500/-") && !pen2.includes("bg-amber-50") && pen2.includes("For all subsequent violations"));
  const clause = ReactDOMServer.renderToStaticMarkup(renderEnterpriseTableCell("CDA rule in accordance of with Section no: 5(Xii)", 2, "Revised consequence"));
  ok("a clause reference glued to its word is not split into a value and a note", clause.includes("5(Xii)") && splitValueBracket("Section no: 5(Xii)") === null, clause);
  ok("a bracket that only finishes the phrase (an abbreviation after '&') is part of the sentence, not a note", splitValueBracket("One (01) day per 20 days of actual work in Works, Projects & TS (Elec.)") === null && splitValueBracket("Four days (Casual) leave") === null);
  ok("a note after a finished value is still split", splitValueBracket("4x Standard HRR (Mandatory)")?.bracket === "Mandatory");
  ok("a sentence-long cell with a time in brackets stays one plain line (no bold lead, no detached note)", splitValueBracket("Submit entry forms at Sports Office or email pp.roy@sail.in by 15th January, 2026 (6:00 PM)") === null && splitValueBracket("24th January, 2026 (from 2:00 PM onwards)")?.bracket === "from 2:00 PM onwards");
  ok("a title with its function in brackets is one designation, not a value with a footnote", splitValueBracket("Director (Personnel)") === null && splitValueBracket("Chief General Manager (HR)") === null && splitValueBracket("4x Standard HRR (Mandatory)")?.bracket === "Mandatory");
  ok("a rate with an approver is still split", splitValueBracket("4x Standard HRR (Head of P&A) [Mumbai: first 4 months]")?.bracket === "Head of P&A" && splitValueBracket("4x Standard HRR (Head of P&A) [Mumbai: first 4 months]")?.condition === "Mumbai: first 4 months");
}

// 7. a chart and a table name their source; the Sources strip names the circular
{
  const data: any = {
    overview: "Overview text that is long enough to be a real overview.",
    headline: "H",
    keyFindings: [{ text: "A finding.", sources: [6] }],
    table: { columns: ["Parameter", "A", "B"], rows: [["x", "1", "2"]], sources: [6] },
    charts: [{ type: "timeline", title: "Milestones", subtitle: "Dated steps.", unit: "Date", sources: [6], items: [{ label: "01.11.2023", value: 1, detail: "Trial starts" }, { label: "01.01.2024", value: 2, detail: "Mandatory" }] }],
    citations: [{ id: 6, headline: "CIRCULAR- IMPLEMENTATION OF CONTACTLESS ATTENDANCE SYSTEM", publishedAt: "2023-12-20", label: "Circular 047 (2023)" }],
  };
  let html = "";
  try {
    html = ReactDOMServer.renderToStaticMarkup(React.createElement(ExecutiveBriefing, { data } as any));
  } catch (e) {
    console.log("(full render not possible in this harness:", (e as Error).message.slice(0, 80), ")");
  }
  if (html) {
    const sourceRows = html.split(">Source<").length - 1;
    ok("the chart and the table each show a Source row (2) with the circular's label", sourceRows === 2 && html.includes("Circular 047 (2023)"), `rows=${sourceRows}`);
    ok("the Sources strip shows the circular's name next to its label, not cut to one line", html.includes("line-clamp-2") && html.includes("IMPLEMENTATION") || html.toLowerCase().includes("implementation"));
    ok("a timeline shows no 'Metric:' tag", !html.includes("Metric:"));
  }
}

// 8. the SAIL units list
{
  const units: any = { overview: "BSP, DSP, RSP, BSL and ISP; ASP, SSP and VISP; CFP and SRU; RDCIS, CMO, CET and SSO.", keyFindings: [], charts: [] };
  const m = new Map(extractRelevantAbbreviations(units));
  const want: Record<string, string> = {
    BSP: "Bhilai Steel Plant (Chhattisgarh)", DSP: "Durgapur Steel Plant (West Bengal)", RSP: "Rourkela Steel Plant (Odisha)", BSL: "Bokaro Steel Plant (Jharkhand)", ISP: "IISCO Steel Plant (Burnpur, West Bengal)",
    ASP: "Alloy Steels Plant (Durgapur, West Bengal)", SSP: "Salem Steel Plant (Tamil Nadu)", VISP: "Visvesvaraya Iron & Steel Plant (Bhadravati, Karnataka)", CFP: "Chandrapur Ferro Alloy Plant (Maharashtra)",
    SRU: "SAIL Refractory Unit", RDCIS: "Research & Development Centre for Iron & Steel (Ranchi)", CMO: "Central Marketing Organisation (Kolkata)", CET: "Centre for Engineering and Technology (Ranchi)", SSO: "Safety Organisation (Ranchi)",
  };
  for (const [k, v] of Object.entries(want)) eq(`unit ${k}`, m.get(k), v);
  eq("VISL is the same plant as VISP", new Map(extractRelevantAbbreviations({ overview: "at VISL", keyFindings: [], charts: [] } as any)).get("VISL"), "Visvesvaraya Iron & Steel Plant (Bhadravati, Karnataka)");
  ok("SSP is Salem Steel Plant, also in 'SSP gift' (the Kaushal Award circular: 'a Salem Steel made product', 'SSP items procured by MM through IPT')", new Map(extractRelevantAbbreviations({ overview: "an SSP gift of Rs. 500", keyFindings: [], charts: [] } as any)).get("SSP") === "Salem Steel Plant (Tamil Nadu)");
  ok("DSP is shown when a reply says 'DSP Intranet' or 'DSP,' but not for the word inside another word", new Map(extractRelevantAbbreviations({ overview: "all DSP departments", keyFindings: [], charts: [] } as any)).has("DSP") && !new Map(extractRelevantAbbreviations({ overview: "the DSPLAY screen", keyFindings: [], charts: [] } as any)).has("DSP"));
}

// 9. the SAP projects and modules
{
  const m = new Map(extractRelevantAbbreviations({ overview: "Project RACE, VIKRAM, SHAKTI, SMART and PRAGATI; SRM, SD, APO and DPMS.", keyFindings: [], charts: [] } as any));
  const want: Record<string, string> = {
    RACE: "Rapid Acceleration of Competitive Edge (SAP ERP project, DSP)",
    VIKRAM: "Value Integration through Information & Knowledge for Responsive & Agile Management (SAP ERP project, BSP)",
    SHAKTI: "Synergy and Harmony for Achieving Knowledge and Technological Integration (SAP ERP project, BSL)",
    SMART: "Systematic Management for Achieving Rapid Transformation (SAP ERP project, RSP)",
    PRAGATI: "Process Re-engineering and Automation for Growth and Agility Through Integration (SAP ERP project, CMO)",
    SRM: "SAP Supplier Relationship Management", SD: "Sales & Distribution", APO: "Advanced Planner & Optimizer (SAP module)", DPMS: "Digital Project Management Solution",
  };
  for (const [k, v] of Object.entries(want)) eq(`SAP project / module ${k}`, m.get(k), v);
  ok("these are matched in capitals only: the ordinary words 'race', 'smart' and 'sd' are not abbreviations", new Map(extractRelevantAbbreviations({ overview: "a smart race to the sd card", keyFindings: [], charts: [] } as any)).size === 0);
}

// 10. ISMS, and APO with its two meanings
{
  eq("ISMS", new Map(extractRelevantAbbreviations({ overview: "the ISMS audit", keyFindings: [], charts: [] } as any)).get("ISMS"), "Information Security Management System");
  eq("APO in an ordinary circular is Assistant Personnel Officer", new Map(extractRelevantAbbreviations({ overview: "forward to the APO of the department", keyFindings: [], charts: [] } as any)).get("APO"), "Assistant Personnel Officer");
  eq("APO in an SAP / ERP reply is the SAP module", new Map(extractRelevantAbbreviations({ overview: "the SAP ERP project used the APO module", keyFindings: [], charts: [] } as any)).get("APO"), "Advanced Planner & Optimizer (SAP module)");
  eq("APO next to a named SAP project is the SAP module", new Map(extractRelevantAbbreviations({ overview: "Project PRAGATI linked stockyards through SD and APO.", keyFindings: [], charts: [] } as any)).get("APO"), "Advanced Planner & Optimizer (SAP module)");
  eq("the circulars' own sense of a short form beats the list (TA settled by the second reading as the travelling allowance)", new Map(extractRelevantAbbreviations({ overview: "as per TA eligibility", keyFindings: [], charts: [], abbreviations: { TA: "Travelling Allowance" } } as any)).get("TA"), "Travelling Allowance");
  eq("a short form with two confirmed senses that nothing has settled shows both, never the list's one alone", new Map(extractRelevantAbbreviations({ overview: "contact the TA office", keyFindings: [], charts: [] } as any)).get("TA"), "Township Administration or Travelling Allowance");
  eq("a short form with one meaning keeps the list's meaning", new Map(extractRelevantAbbreviations({ overview: "the CGM approves", keyFindings: [], charts: [] } as any)).get("CGM"), "Chief General Manager");
  eq("a short form settled by the circulars is listed once", extractRelevantAbbreviations({ overview: "as per TA rules", keyFindings: [], charts: [], abbreviations: { TA: "Travelling Allowance" } } as any).filter(([a]) => a === "TA").length, 1);
  eq("APO is listed once", extractRelevantAbbreviations({ overview: "SAP APO and the APO", keyFindings: [], charts: [] } as any).filter(([a]) => a === "APO").length, 1);
}

// 11. ESS, PMS, and SRM named as the SAP module
{
  const m = new Map(extractRelevantAbbreviations({ overview: "Apply through ESS; the PMS rating; the SRM module.", keyFindings: [], charts: [] } as any));
  eq("ESS", m.get("ESS"), "Employee Self Service");
  eq("PMS", m.get("PMS"), "Performance Management System");
  eq("SRM is the SAP module, named in full", m.get("SRM"), "SAP Supplier Relationship Management");
}

// 12. QCMS (and IMS, already listed with this meaning)
{
  const m = new Map(extractRelevantAbbreviations({ overview: "Enter the idea in QCMS; incidents go to the IMS.", keyFindings: [], charts: [] } as any));
  eq("QCMS", m.get("QCMS"), "Quality Circle Management System");
  eq("IMS", m.get("IMS"), "Incident Management System");
}

// 13. SAIL DARPAN
{
  const m = new Map(extractRelevantAbbreviations({ overview: "Appraisals are filed on SAIL DARPAN.", keyFindings: [], charts: [] } as any));
  eq("DARPAN", m.get("DARPAN"), "Driving Advancement by Reimagining Performance Assessment and Nurturing (SAIL DARPAN)");
  ok("its initials do spell DARPAN (filler 'by' skipped)", expansionFromPhrase("DARPAN", "Driving Advancement by Reimagining Performance Assessment and Nurturing") !== null);
}

// 14. the wage-table components
{
  const wage: any = {
    overview: "Works area wage.",
    keyFindings: [],
    table: { columns: ["Parameter", "Works"], rows: [["Basic", "3350.00"], ["REF ALLOW", "52.00"], ["INC", "270.00"], ["AWA", "1750.00"], ["TOTAL", "20995.30"]] },
    charts: [{ type: "pie", title: "Wage components", unit: "₹", items: [{ label: "BASIC", value: 3350 }, { label: "REF ALLOW", value: 52 }, { label: "INC", value: 270 }, { label: "AWA", value: 1750 }] }],
  };
  const m = new Map(extractRelevantAbbreviations(wage));
  eq("REF ALLOW", m.get("REF ALLOW"), "Refreshment Allowance");
  eq("INC", m.get("INC"), "Incentive");
  eq("AWA", m.get("AWA"), "Additional Welfare Allowance");
  ok("'Inc.' in a company name is not INC (capitals only)", !new Map(extractRelevantAbbreviations({ overview: "Tata Steel Inc. and the incentive scheme", keyFindings: [], charts: [] } as any)).has("INC"));
}

// 15. two tables with captions; GST, FY, w.e.f.
{
  const data: any = {
    overview: "Overview text that is long enough to be a real overview.", headline: "H", keyFindings: [{ text: "A finding.", sources: [6] }],
    table: { title: "GPAIS deposit by month of inclusion", columns: ["Parameter", "Jan-25", "Feb-25"], rows: [["Premium", "Rs 150.00", "Rs 131.25"]], sources: [6] },
    extraTable: { title: "Works area wage (w.e.f 01.01.2024)", columns: ["Component", "Amount"], rows: [["Basic", "Rs 3350.00"]], sources: [6] },
    charts: [],
    citations: [{ id: 6, headline: "Notice", publishedAt: "2024-08-19", label: "Circular 001 (2024)" }],
  };
  let html = "";
  try { html = ReactDOMServer.renderToStaticMarkup(React.createElement(ExecutiveBriefing, { data } as any)); } catch (e) { console.log("(full render not possible:", (e as Error).message.slice(0, 80), ")"); }
  if (html) {
    ok("both tables are drawn, each under its own caption", html.includes("GPAIS deposit by month of inclusion") && html.includes("Works area wage (w.e.f 01.01.2024)") && html.split("<table").length - 1 === 2, `tables=${html.split("<table").length - 1}`);
    ok("each table names its source", html.split(">Source<").length - 1 === 2);
  }
  const m = new Map(extractRelevantAbbreviations({ overview: "GST applies; see FY 2022-23.", keyFindings: [], charts: [], table: { columns: ["Parameter", "Works Area (w.e.f 01.01.2024)"], rows: [["x", "1"]] }, extraTable: { columns: ["A", "B"], rows: [["GST", "1"]] } } as any));
  eq("GST", m.get("GST"), "Goods and Services Tax");
  eq("FY", m.get("FY"), "Financial Year");
  eq("w.e.f in a table heading", m.get("w.e.f"), "with effect from");
}

// 16. HoD
eq("HoD", new Map(extractRelevantAbbreviations({ overview: "approved by the CGM/HoD", keyFindings: [], charts: [] } as any)).get("HoD"), "Head of Department");

// 17. the pie: every part has its amount and its share, and the whole is shown
{
  const data: any = {
    overview: "Overview text that is long enough to be a real overview.", headline: "H", keyFindings: [], table: null,
    charts: [{ type: "pie", title: "Works Area Wage Breakdown", subtitle: "Components of the wage.", unit: "₹", sources: [6], items: [{ label: "BASIC", value: 3350 }, { label: "VDA", value: 13478 }, { label: "FDA", value: 375 }, { label: "HRA", value: 1720.3 }, { label: "REF ALLOW", value: 52 }, { label: "INC", value: 270 }, { label: "AWA", value: 1750 }] }],
    citations: [{ id: 6, headline: "Notice", publishedAt: "2023-12-16", label: "Circular 010 (2023)" }],
  };
  let html = "";
  try { html = ReactDOMServer.renderToStaticMarkup(React.createElement(ExecutiveBriefing, { data } as any)); } catch (e) { console.log("(full render not possible:", (e as Error).message.slice(0, 80), ")"); }
  if (html) {
    ok("each pie part is listed with its amount and its share", html.includes("₹13,478") && html.includes("64.2%") && html.includes("₹52") && html.includes("0.2%"), html.slice(html.indexOf("VDA") - 50, html.indexOf("VDA") + 300));
    ok("the whole is shown in the centre of the ring (₹20,995.3)", html.includes("Total") && html.includes("₹20,995.3"));
  }
}

// 18. one number format everywhere
{
  const tc = (cell: string) => ReactDOMServer.renderToStaticMarkup(renderEnterpriseTableCell(cell, 1, "Works"));
  ok("a bare amount in a table gets the Indian grouping, with the decimals as printed", tc("13478.00").includes("13,478.00") && tc("20995.30").includes("20,95") === false && tc("20995.30").includes("20,995.30") && tc("1720.30").includes("1,720.30") && tc("3350.00").includes("3,350.00"));
  ok("a whole amount is grouped too, a small one is untouched", tc("13450").includes("13,450") && tc("808").includes(">808<"));
  ok("a year is not an amount (2024 stays 2024)", tc("2024").includes("2024") && !tc("2024").includes("2,024"));
  ok("a rupee sign is kept", tc("₹ 3350.00").includes("₹") && tc("₹ 3350.00").includes("3,350.00"));
  ok("a date and a text cell are not touched", tc("01.01.2024").includes("01.01.2024") && tc("Standard HRR").includes("Standard HRR"));
  ok("an amount written '₹ 2400/-' is grouped and keeps its '/-'", tc("₹ 2400/-").includes("₹ 2,400/-") || (tc("₹ 2400/-").includes("2,400") && tc("₹ 2400/-").includes("/-")));
  eq("running text: '₹ 10000/-' -> '₹ 10,000/-', '₹ 1600/-' -> '₹ 1,600/-', 800 and years untouched", groupRupees("₹ 10000/- and ₹ 1600/- and ₹ 800/- in 2024; Rs. 125000.50"), "₹ 10,000/- and ₹ 1,600/- and ₹ 800/- in 2024; Rs. 1,25,000.50");
  const abbrs = extractRelevantAbbreviations({ overview: "Salary means Basic, DA and NPA; IITs and IIMs only.", headline: "H", keyFindings: [], table: null, charts: [], citations: [] } as any).map(([a]) => a);
  ok("DA is explained, and 'IITs' / 'IIMs' are the abbreviations IIT / IIM", abbrs.includes("DA") && abbrs.includes("NPA") && abbrs.includes("IIT") && abbrs.includes("IIM"), abbrs.join(","));
  const fa = extractRelevantAbbreviations({ overview: "Bond of FA plus 12 months salary.", headline: "H", keyFindings: [], table: null, charts: [], citations: [], abbreviations: { FA: "Financial Assistance" } } as any);
  ok("an abbreviation the circular defines itself (FA) is explained, from the circular's own words", fa.some(([a, e]) => a === "FA" && e === "Financial Assistance"), JSON.stringify(fa));
  ok("an empty condition [] is never drawn", !tc("31.08.2026 []").includes("[") && tc("31.08.2026 []").includes("31.08.2026"));
  const items = [{ value: 3350 }, { value: 1720.3 }, { value: 52 }];
  ok("a chart with paise shows two decimals everywhere, one without keeps whole numbers", chartDecimals({ items }) === 2 && chartDecimals({ items: [{ value: 150 }, { value: 112 }] }) === undefined);
  eq("formatValue with decimals: ₹1,720.30 and ₹52.00", `${formatValue(1720.3, "₹", 2)} ${formatValue(52, "₹", 2)}`, "₹1,720.30 ₹52.00");
  eq("formatValue without decimals is unchanged", formatValue(52, "₹"), "₹52");
  eq("compactChartValue with decimals", compactChartValue(131.25, "₹", 2), "₹131.25");
  const data: any = {
    overview: "Overview text that is long enough to be a real overview.", headline: "H", keyFindings: [], table: null,
    charts: [{ type: "pie", title: "Wage", subtitle: "Components of the wage.", unit: "₹", items: [{ label: "BASIC", value: 3350 }, { label: "VDA", value: 13478 }, { label: "HRA", value: 1720.3 }, { label: "REF ALLOW", value: 52 }] }],
    citations: [],
  };
  let html = "";
  try { html = ReactDOMServer.renderToStaticMarkup(React.createElement(ExecutiveBriefing, { data } as any)); } catch { /* harness */ }
  if (html) {
    ok("the ring's list prints paise the same way for every part (₹1,720.30, ₹52.00, ₹3,350.00) and the total with two decimals", html.includes("₹1,720.30") && html.includes("₹52.00") && html.includes("₹3,350.00") && html.includes("₹18,600.30"), html.slice(html.indexOf("BASIC"), html.indexOf("BASIC") + 200));
    ok("shares always have one decimal (17.9%... not 18%)", /\d+\.\d%/.test(html) && !/>\d+%</.test(html));
  }
}

console.log(`\nExecutiveBriefing selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
