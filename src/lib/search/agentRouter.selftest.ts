// src/lib/search/agentRouter.selftest.ts
// Run with: npx tsx src/lib/search/agentRouter.selftest.ts

import { routeQueryWithAgent, type AgentTool } from "./agentRouter";

let pass = 0;
let fail = 0;

function ok(name: string, cond: boolean, extra = "") {
  if (cond) {
    pass++;
  } else {
    fail++;
    console.error(`FAIL: ${name} ${extra}`);
  }
}

async function runTests() {
  console.log("Running Agent Router Selftest...");

  // 1. Conversational Queries
  for (const q of ["hello", "hi", "hey there", "who are you", "good morning"]) {
    const res = await routeQueryWithAgent(q);
    ok(`conversational: "${q}"`, res.tool === "conversational", `got ${res.tool}`);
  }

  // 2. Hospital Queries
  for (const q of [
    "list the permanent doctors with their specializations",
    "list the permanent doctors with their qualifications",
    "list the permanent doctors",
    "list the contractual doctors with their specializations",
    "who is in medicine opd on tuesday",
    "is dr rajeev kumar permanent",
    "contractual doctors of surgery",
    "list of DNB doctors",
    "opd token timings",
  ]) {
    const res = await routeQueryWithAgent(q);
    ok(`hospital: "${q}"`, res.tool === "hospital", `got ${res.tool}`);
  }

  // 3. Employee Roster Queries
  for (const q of [
    "how many employees work in C&IT",
    "who is the HOD of C&IT",
    "senior most non-executive in Blast Furnace",
    "find employee 498301",
    "list executive engineers in Coke Oven",
  ]) {
    const res = await routeQueryWithAgent(q);
    ok(`employee_roster: "${q}"`, res.tool === "employee_roster", `got ${res.tool}`);
  }

  // 4. Holiday Queries
  for (const q of [
    "when is Durga Puja in 2026",
    "list of holidays in November",
    "is tomorrow a holiday",
    "how many restricted holidays in 2026",
  ]) {
    const res = await routeQueryWithAgent(q);
    ok(`holiday_calendar: "${q}"`, res.tool === "holiday_calendar", `got ${res.tool}`);
  }

  // 5. PAX Directory Queries
  for (const q of [
    "pax number of fire service",
    "who has intercom 42046",
    "pax numbers outside plant",
    "telecom phone number of central store",
  ]) {
    const res = await routeQueryWithAgent(q);
    ok(`pax_directory: "${q}"`, res.tool === "pax_directory", `got ${res.tool}`);
  }

  // 6. Circular Queries from DSP_Circulars_Query_Test_Set.pdf
  for (const q of [
    "Pre-Mature Repayment of Refundable PF Loan",
    "Zero Tolerance Safety Rules",
    "Contactless Attendance System",
    "Gate Pass #13",
    "How do I return my provident fund advance before the due date?",
    "Can a retired employee keep their company quarters in Kolkata or Mumbai?",
    "What is the punishment if I am caught using my mobile phone while walking on the shop floor?",
    "Does the company provide money or study leave to do an MBA or engineering degree?",
    "How to get the cash reward for passing Hindi language exams?",
  ]) {
    const res = await routeQueryWithAgent(q);
    ok(`circular_search: "${q}"`, res.tool === "circular_search", `got ${res.tool}`);
  }

  // 7. Executive Deep Synthesis Queries from PDF
  for (const q of [
    "Trace the evolution of DSP's attendance and access control policies from 2023 to 2024. Specifically, contrast the Contactless Face Recognition System rollout for executives with the phased RFID biometric implementation for contract workers, and detail the Gate Pass #13 transition from Pink to Blue.",
    "Synthesize the financial and welfare adjustments made for contract workers between 2022 and 2025. Detail the revised GPAIS premium structures, the January 2024 minimum wage calculations for the Works area, and their specific eligibility under DSP's Motivational Award Schemes, specifically the Kaushal Award.",
    "Compare the financial assistance and bond requirements for an executive pursuing a 2-year non-medical higher education course with the cash incentive structures provided under the 2024 and 2025 DSP Hindi Teaching Schemes for the Pragya and Parangat levels.",
    "Provide a briefing on mandatory employee compliance by cross-referencing the Zero Tolerance Safety Rules (ZTSR) revised consequence management steps with the Special Intensive Revision (SIR) Format B declaration requirements.",
  ]) {
    const res = await routeQueryWithAgent(q);
    ok(`executive_synthesis: "${q.slice(0, 40)}..."`, res.tool === "executive_synthesis", `got ${res.tool}`);
  }

  console.log(`\nAgent Router Selftest finished: ${pass} passed, ${fail} failed.`);
  if (fail > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
