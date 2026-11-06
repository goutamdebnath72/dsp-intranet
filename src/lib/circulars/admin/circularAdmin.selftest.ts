// src/lib/circulars/admin/circularAdmin.selftest.ts
// Run with: npx tsx src/lib/circulars/admin/circularAdmin.selftest.ts

import fs from "fs";
import path from "path";
import { detectCircularAdminIntent } from "./intent";
import { answerCircularAdmin } from "./omnibar";
import { handleCircularAdmin, isSameOrigin } from "./api";
import { listRecentCirculars } from "./store";

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
  console.log("Running Circular Admin Facility Selftest...");
  console.log("==========================================");

  // ----------------------------------------------------
  // TEST SET 1: Intent Detection
  // ----------------------------------------------------
  console.log("\n--- Intent Detection Tests ---");

  // User requirement: Must open with keyword "management"
  ok("circular management -> op: upload", detectCircularAdminIntent("circular management")?.op === "upload");
  ok("circulars management -> op: upload", detectCircularAdminIntent("circulars management")?.op === "upload");

  // Standard action phrases
  ok("post circular -> op: upload", detectCircularAdminIntent("post circular")?.op === "upload");
  ok("post new circular -> op: upload", detectCircularAdminIntent("post new circular")?.op === "upload");
  ok("upload circular -> op: upload", detectCircularAdminIntent("upload circular")?.op === "upload");
  ok("new circular -> op: upload", detectCircularAdminIntent("new circular")?.op === "upload");
  ok("manage circulars -> op: upload", detectCircularAdminIntent("manage circulars")?.op === "upload");
  ok("circular admin -> op: upload", detectCircularAdminIntent("circular admin")?.op === "upload");
  ok("circulars admin -> op: upload", detectCircularAdminIntent("circulars admin")?.op === "upload");
  ok("recent circulars -> op: recent", detectCircularAdminIntent("recent circulars")?.op === "recent");

  // Delegation & History
  ok("delegate circular to rakesh -> op: delegate", detectCircularAdminIntent("delegate circular to rakesh")?.op === "delegate");
  ok("authorise circular access -> op: delegate", detectCircularAdminIntent("authorise circular access")?.op === "delegate");
  ok("revoke circular permission -> op: delegate", detectCircularAdminIntent("revoke circular permission")?.op === "delegate");
  ok("circular audit history -> op: history", detectCircularAdminIntent("circular audit history")?.op === "history");

  // Prefill headline extraction
  const prefillTest = detectCircularAdminIntent('post circular "Festival Advance Scheme 2026"');
  ok("post circular with quoted title extracts prefill headline", prefillTest?.prefill?.headline === "Festival Advance Scheme 2026");

  // Negative tests: questions about circular content must NOT open admin panel
  ok("where is the mediclaim circular -> null", detectCircularAdminIntent("where is the mediclaim circular") === null);
  ok("what is the circular for ltc -> null", detectCircularAdminIntent("what is the circular for ltc") === null);
  ok("how to apply under circular 12 -> null", detectCircularAdminIntent("how to apply under circular 12") === null);
  ok("list all circulars on attendance -> null", detectCircularAdminIntent("list all circulars on attendance") === null);

  // ----------------------------------------------------
  // TEST SET 2: Omnibar Access Control
  // ----------------------------------------------------
  console.log("\n--- Omnibar Access Control Tests ---");

  const mockDeps = (userRole: "hod" | "delegate" | null) => ({
    authority: async () => userRole,
    nameOf: async () => (userRole === "hod" ? "MOHD ANWAR ULLAH" : "RAKESH OJHA"),
  });

  const loggedOut = await answerCircularAdmin("circular management", null, mockDeps(null));
  ok("Logged out user gets 'Please log in' prompt", loggedOut?.hospital?.headline?.text === "Please log in");

  const unauth = await answerCircularAdmin("circular management", "499999", mockDeps(null));
  ok("Unauthorised user gets 'Not allowed' response", unauth?.hospital?.headline?.text === "Not allowed");

  const hodResult = await answerCircularAdmin("circular management", "498301", mockDeps("hod"));
  ok("HOD gets circularAdmin payload", hodResult?.circularAdmin?.role === "hod");
  ok("HOD name is included in payload", hodResult?.circularAdmin?.name === "MOHD ANWAR ULLAH");

  const delegateResult = await answerCircularAdmin("post circular", "498880", mockDeps("delegate"));
  ok("Authorised delegate gets circularAdmin payload", delegateResult?.circularAdmin?.role === "delegate");

  const delegateDelegating = await answerCircularAdmin("delegate circular access", "498880", mockDeps("delegate"));
  ok("Delegate attempting to authorise is rejected", delegateDelegating?.hospital?.headline?.text === "Not allowed");

  // ----------------------------------------------------
  // TEST SET 3: API Security & Origin
  // ----------------------------------------------------
  console.log("\n--- API Security & Origin Tests ---");

  ok("Same origin check accepts matching host", isSameOrigin("http://localhost:3000", "localhost:3000"));
  ok("Same origin check rejects cross-site origin", !isSameOrigin("http://evil-site.com", "localhost:3000"));

  const mockDb: any = {
    run: async (fn: any) => fn(async () => []),
  };

  const recentTest = await listRecentCirculars(mockDb, 5);
  ok("listRecentCirculars runs cleanly on mock query runner", Array.isArray(recentTest) && recentTest.length === 0);

  const unauthApi = await handleCircularAdmin(
    { op: "recent" },
    {
      actor: null,
      db: mockDb,
      findByName: async () => [],
      findByTicket: async () => [],
    },
  );
  ok("Unauthenticated API call returns 401", unauthApi.status === 401);

  // ----------------------------------------------------
  // TEST SET 4: OmnibarModal Rendering Hook
  // ----------------------------------------------------
  console.log("\n--- OmnibarModal Rendering Hook Tests ---");

  const modalPath = path.resolve(process.cwd(), "src/components/OmnibarModal.tsx");
  const modalContent = fs.readFileSync(modalPath, "utf-8");
  ok(
    "OmnibarModal imports CircularAdminPanel",
    modalContent.includes('import { CircularAdminPanel } from "@/components/CircularAdminPanel";'),
  );
  ok(
    "OmnibarModal renders CircularAdminPanel on analytics.circularAdmin",
    modalContent.includes("<CircularAdminPanel open={analytics.circularAdmin} />"),
  );

  console.log("==========================================");
  console.log(`Circular Selftest Results: ${pass} PASSED, ${fail} FAILED`);
  console.log("==========================================");

  if (fail > 0) process.exit(1);
}

runTests().catch((e) => {
  console.error(e);
  process.exit(1);
});
