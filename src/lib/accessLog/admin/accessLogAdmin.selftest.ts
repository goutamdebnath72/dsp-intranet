// src/lib/accessLog/admin/accessLogAdmin.selftest.ts
// Run with: npx tsx src/lib/accessLog/admin/accessLogAdmin.selftest.ts

import fs from "fs";
import path from "path";
import { HOD_CIT, HOD_CIT_TICKET } from "@/lib/constants";

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
  console.log("==============================================");
  console.log("Running Contact Access Log Facility Selftest...");
  console.log("==============================================");

  const { detectAccessLogAdminIntent } = await import("./intent");
  const { answerAccessLogAdmin } = await import("./omnibar");
  const { handleAccessLogAdmin } = await import("./api");
  const { FACILITIES } = await import("@/lib/facility/registry");
  const { isSuperAdmin } = await import("@/lib/superAdmin");

  // ----------------------------------------------------
  // TEST SET 1: Registry and Security Constraints
  // ----------------------------------------------------
  console.log("\n--- Facility Registry & Safeguard Tests ---");
  ok("access_log is registered in FACILITIES", "access_log" in FACILITIES);
  ok("access_log lock is 'access_log'", FACILITIES.access_log.lock === "access_log");
  ok(
    "access_log strictly forbids non-executives (allowNonExecutive: false)",
    FACILITIES.access_log.allowNonExecutive === false,
  );
  ok("HOD_CIT constants defined with post details", HOD_CIT.post === "HOD of C&IT" && HOD_CIT.name === "Mohd Anwar Ullah");
  ok("HOD_CIT ticketNo is 498301 and sailPNo is D000896", HOD_CIT_TICKET === "498301" && HOD_CIT.sailPNo === "D000896");
  ok(
    "HOD_CIT has true designation, department code, and department name",
    HOD_CIT.designation === "GM" &&
      HOD_CIT.departmentCode === "98500" &&
      HOD_CIT.department === "C&IT",
  );
  ok("isSuperAdmin recognizes HOD_CIT_TICKET automatically", isSuperAdmin(HOD_CIT_TICKET) === true);

  // ----------------------------------------------------
  // TEST SET 2: Intent Detection (Universal Keywords)
  // ----------------------------------------------------
  console.log("\n--- Intent Detection Tests ---");

  // User requirement: "All six forms must open with the keyword 'management'."
  // User requirement: "yes like circular admin, the keyword admin should work with all the six."
  ok("contact access log management -> op: logs", detectAccessLogAdminIntent("contact access log management")?.op === "logs");
  ok("contact access log admin -> op: logs", detectAccessLogAdminIntent("contact access log admin")?.op === "logs");
  ok("access log management -> op: logs", detectAccessLogAdminIntent("access log management")?.op === "logs");
  ok("access log admin -> op: logs", detectAccessLogAdminIntent("access log admin")?.op === "logs");
  ok("contact access management -> op: logs", detectAccessLogAdminIntent("contact access management")?.op === "logs");
  ok("contact access admin -> op: logs", detectAccessLogAdminIntent("contact access admin")?.op === "logs");
  ok("contact log management -> op: logs", detectAccessLogAdminIntent("contact log management")?.op === "logs");
  ok("contact log admin -> op: logs", detectAccessLogAdminIntent("contact log admin")?.op === "logs");

  // Natural language phrasing
  ok("contact access log -> op: logs", detectAccessLogAdminIntent("contact access log")?.op === "logs");
  ok("contact access logs -> op: logs", detectAccessLogAdminIntent("contact access logs")?.op === "logs");
  ok("access log -> op: logs", detectAccessLogAdminIntent("access log")?.op === "logs");
  ok("access logs -> op: logs", detectAccessLogAdminIntent("access logs")?.op === "logs");
  ok("view access log -> op: logs", detectAccessLogAdminIntent("view access log")?.op === "logs");
  ok("open access log -> op: logs", detectAccessLogAdminIntent("open access log")?.op === "logs");
  ok("contact privacy audit -> op: logs", detectAccessLogAdminIntent("contact privacy audit")?.op === "logs");
  ok("who viewed contacts -> op: logs", detectAccessLogAdminIntent("who viewed contacts")?.op === "logs");

  // Operations
  ok("delegate access log -> op: delegate", detectAccessLogAdminIntent("delegate access log")?.op === "delegate");
  ok("authorise access log permission -> op: delegate", detectAccessLogAdminIntent("authorise access log permission")?.op === "delegate");
  ok("access log history -> op: history", detectAccessLogAdminIntent("access log history")?.op === "history");

  // Prefill detection
  const viewerPrefill = detectAccessLogAdminIntent("access log by 498301");
  ok("prefill viewer ticket", viewerPrefill?.prefill?.viewer === "498301");

  const mobilePrefill = detectAccessLogAdminIntent("contact access log mobile reveals");
  ok("prefill field mobile and action reveal", mobilePrefill?.prefill?.field === "mobile" && mobilePrefill?.prefill?.action === "reveal");

  // Negative tests (pure questions or unrelated topics)
  ok("what is the network access policy -> null", detectAccessLogAdminIntent("what is the network access policy") === null);
  ok("where is gate access office -> null", detectAccessLogAdminIntent("where is gate access office") === null);
  ok("how to login intranet -> null", detectAccessLogAdminIntent("how to login intranet") === null);

  // ----------------------------------------------------
  // TEST SET 3: Omnibar Access Control
  // ----------------------------------------------------
  console.log("\n--- Omnibar Access Control Tests ---");

  const mockDeps = (role: "hod" | "delegate" | null, name: string | null = "MOHD ANWAR ULLAH") => ({
    authority: async () => role,
    nameOf: async () => name,
  });

  const loggedOut = await answerAccessLogAdmin("access log management", null, mockDeps(null));
  ok("Logged out user gets 'Please log in' prompt", loggedOut?.hospital?.headline?.text === "Please log in");

  const unauthorised = await answerAccessLogAdmin("access log management", "123456", mockDeps(null));
  ok("Unauthorised user gets 'Not allowed' response", unauthorised?.hospital?.headline?.text === "Not allowed");

  const hod = await answerAccessLogAdmin("access log management", "498301", mockDeps("hod"));
  ok("HOD gets accessLogAdmin payload", (hod as any)?.accessLogAdmin?.role === "hod");
  ok("HOD name is included in payload", (hod as any)?.accessLogAdmin?.name === "MOHD ANWAR ULLAH");

  const delegate = await answerAccessLogAdmin("access log management", "498880", mockDeps("delegate", "RAKESH OJHA"));
  ok("Authorised delegate gets accessLogAdmin payload", (delegate as any)?.accessLogAdmin?.role === "delegate");

  const delegateDelegating = await answerAccessLogAdmin("delegate access log", "498880", mockDeps("delegate"));
  ok("Delegate attempting to authorise is rejected", delegateDelegating?.hospital?.headline?.text === "Not allowed");

  // ----------------------------------------------------
  // TEST SET 4: Non-Executive Delegation Safeguard
  // ----------------------------------------------------
  console.log("\n--- Non-Executive Safeguard Tests ---");

  const mockContext = {
    actor: { ticket: "498301", name: "MOHD ANWAR ULLAH" },
    db: {
      run: async (fn: any) => fn(async () => []),
      cacheKey: {},
    } as any,
    ds: {} as any,
    findByName: async () => [],
    findByTicket: async (t: string) => [
      {
        ticketNo: t,
        name: t.startsWith("4") ? "EXECUTIVE USER" : "NON-EXEC USER",
        designation: t.startsWith("4") ? "AGM" : "OCT",
        department: "C&IT",
      } as any,
    ],
  };

  // Attempting to grant to a non-executive (e.g. ticket 123456)
  const nonExecGrant = await handleAccessLogAdmin(
    { op: "grant", ticket: "123456", name: "NON-EXEC USER" },
    mockContext,
  );
  ok(
    "Non-executive delegation attempt is blocked with confidentiality reason",
    (nonExecGrant.body as any)?.result?.status === "invalid" &&
      /confidential|non-executives/.test((nonExecGrant.body as any)?.result?.reason),
  );

  // ----------------------------------------------------
  // TEST SET 5: UI & Architecture Parity
  // ----------------------------------------------------
  console.log("\n--- UI & Architecture Parity Tests ---");

  const headerUiFile = fs.readFileSync(path.resolve(process.cwd(), "src/components/AccessLogAdminUi.tsx"), "utf8");
  ok(
    "AccessLogAdminHeader uses inline row: flex flex-wrap items-center gap-x-3 gap-y-1",
    headerUiFile.includes("flex flex-wrap items-center gap-x-3 gap-y-1"),
  );
  ok(
    "AccessLogAdminHeader includes HOD of C&IT / Authorised delegate badge",
    headerUiFile.includes("HOD of C&IT") && headerUiFile.includes("Authorised delegate"),
  );
  ok(
    "AccessLogAdminUi renders viewer designation and department",
    headerUiFile.includes("row.viewerDesignation") && headerUiFile.includes("row.viewerDepartment"),
  );
  ok(
    "AccessLogAdminUi renders viewed designation and department",
    headerUiFile.includes("row.viewedDesignation") && headerUiFile.includes("row.viewedDepartment"),
  );

  const omnibarModalFile = fs.readFileSync(path.resolve(process.cwd(), "src/components/OmnibarModal.tsx"), "utf8");
  ok("OmnibarModal imports AccessLogAdminPanel", omnibarModalFile.includes("AccessLogAdminPanel"));
  ok("OmnibarModal renders AccessLogAdminPanel", omnibarModalFile.includes("<AccessLogAdminPanel open={analytics.accessLogAdmin} />"));

  const omnibarEngineFile = fs.readFileSync(path.resolve(process.cwd(), "src/lib/nl2sql/omnibar.ts"), "utf8");
  ok("nl2sql/omnibar.ts supports accessLogAdmin in defaultDeps", omnibarEngineFile.includes("accessLogAdmin: async"));

  console.log("\n==============================================");
  console.log(`Results: ${pass} passed, ${fail} failed.`);
  console.log("==============================================");

  if (fail > 0) process.exit(1);
}

runTests().catch((e) => {
  console.error(e);
  process.exit(1);
});
