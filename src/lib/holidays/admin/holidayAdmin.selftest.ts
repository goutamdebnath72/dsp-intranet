// src/lib/holidays/admin/holidayAdmin.selftest.ts
// Run with: npx tsx src/lib/holidays/admin/holidayAdmin.selftest.ts

import "reflect-metadata";
import fs from "fs";
import path from "path";
import { detectHolidayAdminIntent } from "./intent";
import { answerHolidayAdmin } from "./omnibar";
import { parseHolidayUploadText } from "./store";
import { handleHolidayAdmin, isSameOrigin } from "./api";

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
  console.log("Running Holiday Admin Facility Selftest...");
  console.log("==========================================");

  // ----------------------------------------------------
  // TEST SET 1: Intent Detection
  // ----------------------------------------------------
  console.log("\n--- Intent Detection Tests ---");

  ok("manage holidays -> op: seed", detectHolidayAdminIntent("manage holidays")?.op === "seed");
  ok("holiday admin -> op: seed", detectHolidayAdminIntent("holiday admin")?.op === "seed");
  ok("holidays admin -> op: seed", detectHolidayAdminIntent("holidays admin")?.op === "seed");
  ok("holiday management -> op: seed", detectHolidayAdminIntent("holiday management")?.op === "seed");
  ok("holidays management -> op: seed", detectHolidayAdminIntent("holidays management")?.op === "seed");
  ok("seed holiday 2026 -> op: seed, year: 2026", detectHolidayAdminIntent("seed holiday 2026")?.op === "seed" && detectHolidayAdminIntent("seed holiday 2026")?.prefill?.year === 2026);
  ok("clear holiday 2026 -> op: clear, year: 2026", detectHolidayAdminIntent("clear holiday 2026")?.op === "clear" && detectHolidayAdminIntent("clear holiday 2026")?.prefill?.year === 2026);
  ok("unseed holiday 2027 -> op: clear, year: 2027", detectHolidayAdminIntent("unseed holiday 2027")?.op === "clear" && detectHolidayAdminIntent("unseed holiday 2027")?.prefill?.year === 2027);
  ok("review holiday extraction -> no separate staging flow any more: opens the seed screen", detectHolidayAdminIntent("review holiday extraction")?.op === "seed");
  ok("delegate holiday to rakesh -> op: delegate", detectHolidayAdminIntent("delegate holiday to rakesh")?.op === "delegate");
  ok("authorise holiday access -> op: delegate", detectHolidayAdminIntent("authorise holiday access")?.op === "delegate");
  ok("revoke holiday permission -> op: delegate", detectHolidayAdminIntent("revoke holiday permission")?.op === "delegate");
  ok("holiday audit history -> op: history", detectHolidayAdminIntent("holiday audit history")?.op === "history");

  // Pure questions must NOT trigger admin intent
  ok("when is durga puja -> null", detectHolidayAdminIntent("when is durga puja") === null);
  ok("is tomorrow a holiday -> null", detectHolidayAdminIntent("is tomorrow a holiday") === null);
  ok("list of holidays in 2026 -> null", detectHolidayAdminIntent("list of holidays in 2026") === null);

  // ----------------------------------------------------
  // TEST SET 2: Omnibar Access Control
  // ----------------------------------------------------
  console.log("\n--- Omnibar Access Control Tests ---");

  const mockDeps = (role: "hod" | "delegate" | null, name = "MOHD ANWAR ULLAH") => ({
    authority: async () => role,
    nameOf: async () => name,
  });

  const loggedOut = await answerHolidayAdmin("manage holidays", null, mockDeps("hod"));
  ok("Logged out user gets 'Please log in' prompt", loggedOut?.hospital?.headline?.text === "Please log in");

  const unauth = await answerHolidayAdmin("manage holidays", "499999", mockDeps(null));
  ok("Unauthorised user gets 'Not allowed' response", unauth?.hospital?.headline?.text === "Not allowed");

  const hodResp = await answerHolidayAdmin("seed holiday 2026", "498301", mockDeps("hod"));
  ok("HOD gets holidayAdmin payload", hodResp?.holidayAdmin?.role === "hod" && hodResp?.holidayAdmin?.op === "seed" && hodResp?.holidayAdmin?.prefill?.year === 2026);
  ok("HOD name is included in payload", hodResp?.holidayAdmin?.name === "MOHD ANWAR ULLAH");

  const delegateResp = await answerHolidayAdmin("manage holidays", "498880", mockDeps("delegate", "RAKESH OJHA"));
  ok("Authorised delegate gets holidayAdmin payload", delegateResp?.holidayAdmin?.role === "delegate" && delegateResp?.holidayAdmin?.name === "RAKESH OJHA");

  const delegateDelegating = await answerHolidayAdmin("delegate holiday access", "498880", mockDeps("delegate"));
  ok("Delegate attempting to authorise is rejected", delegateDelegating?.hospital?.headline?.text === "Not allowed");

  // ----------------------------------------------------
  // TEST SET 3: Payload Parsing
  // ----------------------------------------------------
  console.log("\n--- Payload Parsing Tests ---");

  const sampleFile = path.resolve(process.cwd(), "Holidays/holiday2026_enriched.json");
  if (fs.existsSync(sampleFile)) {
    const rawContent = fs.readFileSync(sampleFile, "utf-8");
    const parsed = parseHolidayUploadText(rawContent);
    ok("Parses 2026 enriched JSON year", parsed.year === 2026);
    ok("Parses exactly 53 holidays", parsed.holidays.length === 53, `got ${parsed.holidays.length}`);
    ok("Parses 4 RH quotas", parsed.rhQuota.length === 4);
    ok("Parses 3 policy notes", parsed.policyNotes.length === 3);
  } else {
    console.log("SKIP: Holidays/holiday2026_enriched.json not found on disk");
  }

  // ----------------------------------------------------
  // TEST SET 4: API Security & Origin
  // ----------------------------------------------------
  console.log("\n--- API Security & Origin Tests ---");

  ok("Same origin check accepts matching host", isSameOrigin("http://localhost:3000", "localhost:3000"));
  ok("Same origin check rejects cross-site origin", !isSameOrigin("http://evil-site.com", "localhost:3000"));

  const mockDb: any = {
    run: async (fn: any) => fn(async () => []),
  };

  const unauthApi = await handleHolidayAdmin(
    { op: "seed", year: 2026, content: "{}" },
    {
      actor: null,
      db: mockDb,
      findByName: async () => [],
      findByTicket: async () => [],
    },
  );
  ok("Unauthenticated API call returns 401", unauthApi.status === 401);

  // ----------------------------------------------------
  // TEST SET 5: OmnibarModal Rendering Hook
  // ----------------------------------------------------
  console.log("\n--- OmnibarModal Rendering Hook Tests ---");

  const modalSource = fs.readFileSync(
    path.resolve(process.cwd(), "src/components/OmnibarModal.tsx"),
    "utf-8",
  );
  ok("OmnibarModal imports HolidayAdminPanel", modalSource.includes('import { HolidayAdminPanel } from "@/components/HolidayAdminPanel";'));
  ok("OmnibarModal renders HolidayAdminPanel on analytics.holidayAdmin", modalSource.includes("<HolidayAdminPanel open={analytics.holidayAdmin} />"));

  console.log("\n==========================================");
  console.log(`Selftest Results: ${pass} PASSED, ${fail} FAILED`);
  console.log("==========================================");

  if (fail > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
