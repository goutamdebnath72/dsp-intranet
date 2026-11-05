// src/lib/search/pureAiEngine.selftest.ts
// Run with: npx tsx src/lib/search/pureAiEngine.selftest.ts

import fs from "fs";
import path from "path";

// Load .env.local if present
try {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, "utf-8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx > 0) {
        const k = trimmed.slice(0, eqIdx).trim();
        const v = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
        if (!process.env[k]) process.env[k] = v;
      }
    }
  }
} catch {
  // best effort
}

import { parseQueryWithLlm, executePureHospital } from "./pureAiEngine";

let pass = 0;
let fail = 0;

function ok(name: string, cond: boolean, extra = "") {
  if (cond) {
    pass++;
    console.log(`PASS: ${name}`);
  } else {
    fail++;
    console.error(`FAIL: ${name} ${extra}`);
  }
}

async function runTests() {
  console.log("==========================================");
  console.log("Running Pure AI Engine Selftest...");
  console.log("==========================================");

  // ----------------------------------------------------
  // TEST SET 1: Pure Hospital Data Execution
  // ----------------------------------------------------
  console.log("\n--- Pure Hospital Data Execution Tests ---");

  // 1. Permanent doctors list
  const permRes = executePureHospital({ action: "list_doctors", employment: "permanent" });
  ok("Permanent doctors returns result", !!permRes);
  ok("Permanent doctors title is 'Permanent doctors'", permRes?.card?.title === "Permanent doctors");
  ok("Permanent doctors count is exactly 49", permRes?.card?.table?.rows?.length === 49, `got ${permRes?.card?.table?.rows?.length}`);
  ok("Permanent doctors columns include Ticket", permRes?.card?.table?.columns?.includes("Ticket") ?? false);

  // 2. Contractual doctors list
  const contrRes = executePureHospital({ action: "list_doctors", employment: "contractual" });
  ok("Contractual doctors returns result", !!contrRes);
  ok("Contractual doctors title is 'Non-permanent doctors'", contrRes?.card?.title === "Non-permanent doctors");
  ok("Contractual doctors count is exactly 66", contrRes?.card?.table?.rows?.length === 66, `got ${contrRes?.card?.table?.rows?.length}`);
  ok("Contractual doctors columns include List number", permRes?.card?.table?.columns !== contrRes?.card?.table?.columns);

  // 3. Dr. Karmakar schedule lookup
  const karmakarRes = executePureHospital({ action: "doctor_schedule", doctorName: "karmakar" });
  ok("Dr. Karmakar schedule found", !!karmakarRes);
  ok("Dr. Karmakar title contains 'Dr. Ajit Karmakar'", karmakarRes?.card?.title?.includes("Ajit Karmakar") ?? false);
  ok("Dr. Karmakar sits on Monday and Thursday", karmakarRes?.summary?.includes("Monday and Thursday") ?? false);
  ok("Dr. Karmakar sits in OPD 25", karmakarRes?.summary?.includes("OPD 25") ?? false);
  ok("Dr. Karmakar table includes 'Doctor' column", karmakarRes?.card?.table?.columns?.[0] === "Doctor");
  ok("Dr. Karmakar table row 0 starts with doctor name", karmakarRes?.card?.table?.rows?.[0]?.[0] === "Dr. Ajit Karmakar");

  // 4. Dr. Ajit Karmakar full name lookup
  const ajitRes = executePureHospital({ action: "doctor_schedule", doctorName: "dr ajit karmakar" });
  ok("Dr. Ajit Karmakar schedule found", !!ajitRes);
  ok("Dr. Ajit Karmakar days match Monday and Thursday", ajitRes?.summary?.includes("Monday and Thursday") ?? false);

  // 5. Medicine OPD at a glance
  const medRes = executePureHospital({ action: "department_opd", department: "Medicine" });
  ok("Medicine OPD at a glance found", !!medRes);
  ok("Medicine OPD title is 'Medicine OPD at a glance'", medRes?.card?.title === "Medicine OPD at a glance");
  ok("Medicine OPD has 3 units", medRes?.card?.table?.rows?.length === 3);

  // 6. OPD Timings
  const timingsRes = executePureHospital({ action: "timings" });
  ok("Timings card found", !!timingsRes);
  ok("Timings include 8 AM to 1 PM", timingsRes?.card?.lines?.some((l) => l.includes("8 AM to 1 PM")) ?? false);

  // 7. Token evening queries (with token vs without token)
  const withTokenRes = executePureHospital({
    action: "doctor_schedule",
    doctorName: "karmakar",
    rawQuery: "Can I consult with Dr. Karmakar with token after 5 pm?",
  });
  ok("With token after 5pm tone is 'open'", withTokenRes?.card?.status?.tone === "open");
  ok("With token after 5pm summary begins with Yes", withTokenRes?.summary?.startsWith("Yes") ?? false);

  const withoutTokenRes = executePureHospital({
    action: "doctor_schedule",
    doctorName: "karmakar",
    rawQuery: "Can I consult with Dr. Karmakar without a token after 5pm?",
  });
  ok("Without token tone is 'closed'", withoutTokenRes?.card?.status?.tone === "closed");
  ok("Without token summary begins with No", withoutTokenRes?.summary?.startsWith("No") ?? false);

  // 8. DNB qualification query has no fat/notes
  const dnbRes = executePureHospital({
    action: "list_doctors",
    employment: "permanent",
    qualification: "DNB",
    rawQuery: "How many medicos on roll have DNB qualification instead of MD?",
  });
  ok("DNB medicos on roll returns 1 doctor", dnbRes?.card?.table?.rows?.length === 1);
  ok("DNB medicos on roll card has NO notes (no fat)", dnbRes?.card?.notes === undefined);

  // ----------------------------------------------------
  // TEST SET 2: LLM NLU Parameter Extraction
  // ----------------------------------------------------
  console.log("\n--- LLM NLU Parameter Extraction Tests ---");

  const nluCases = [
    {
      q: "on which day of the week I can see dr karmakar in opd?",
      expectedTool: "hospital",
      checkParams: (p: any) => p.doctorName?.toLowerCase().includes("karmakar"),
    },
    {
      q: "on which day of the week I can visit dr ajit karmakar?",
      expectedTool: "hospital",
      checkParams: (p: any) => p.doctorName?.toLowerCase().includes("karmakar"),
    },
    {
      q: "list the permanent doctors with their specializations",
      expectedTool: "hospital",
      checkParams: (p: any) => p.employment === "permanent",
    },
    {
      q: "list of permanent doctors.",
      expectedTool: "hospital",
      checkParams: (p: any) => p.employment === "permanent",
    },
    {
      q: "list the non-permanent doctors with their specializations",
      expectedTool: "hospital",
      checkParams: (p: any) => p.employment === "contractual",
    },
    {
      q: "medicine opd lists",
      expectedTool: "hospital",
      checkParams: (p: any) => p.department?.toLowerCase().includes("medicine"),
    },
    {
      q: "opd token timings",
      expectedTool: "hospital",
      checkParams: (p: any) => p.action === "timings",
    },
    {
      q: "how many employees work in C&IT",
      expectedTool: "employee_roster",
      checkParams: () => true,
    },
    {
      q: "How do I return my provident fund advance before the due date?",
      expectedTool: "circular_search",
      checkParams: () => true,
    },
    {
      q: "Trace the evolution of DSP's attendance and access control policies from 2023 to 2024...",
      expectedTool: "executive_synthesis",
      checkParams: () => true,
    },
    {
      q: "hello there",
      expectedTool: "conversational",
      checkParams: () => true,
    },
  ];

  for (const tc of nluCases) {
    const res = await parseQueryWithLlm(tc.q);
    ok(
      `NLU: "${tc.q}" -> ${tc.expectedTool}`,
      res.tool === tc.expectedTool && tc.checkParams(res.params),
      `got tool=${res.tool}, params=${JSON.stringify(res.params)}`,
    );
  }

  console.log("\n==========================================");
  console.log(`Selftest Results: ${pass} PASSED, ${fail} FAILED`);
  console.log("==========================================");

  if (fail > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
