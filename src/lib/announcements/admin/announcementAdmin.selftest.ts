// src/lib/announcements/admin/announcementAdmin.selftest.ts
// Run with: npx tsx src/lib/announcements/admin/announcementAdmin.selftest.ts

import fs from "fs";
import path from "path";
import { detectAnnouncementAdminIntent } from "./intent";
import { answerAnnouncementAdmin } from "./omnibar";
import { handleAnnouncementAdmin, isSameOrigin } from "./api";
import { announcementVersion } from "./store";

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
  console.log("Running Announcement Admin Facility Selftest...");
  console.log("==============================================");

  // ----------------------------------------------------
  // TEST SET 1: Intent Detection
  // ----------------------------------------------------
  console.log("\n--- Intent Detection Tests ---");

  // User requirement: Must open with keyword "management" and "admin"
  ok("announcement management -> op: publish", detectAnnouncementAdminIntent("announcement management")?.op === "publish");
  ok("announcements management -> op: publish", detectAnnouncementAdminIntent("announcements management")?.op === "publish");
  ok("announcement admin -> op: publish", detectAnnouncementAdminIntent("announcement admin")?.op === "publish");
  ok("announcements admin -> op: publish", detectAnnouncementAdminIntent("announcements admin")?.op === "publish");

  // Standard action phrases
  ok("post announcement -> op: publish", detectAnnouncementAdminIntent("post announcement")?.op === "publish");
  ok("publish announcement -> op: publish", detectAnnouncementAdminIntent("publish announcement")?.op === "publish");
  ok("new announcement -> op: publish", detectAnnouncementAdminIntent("new announcement")?.op === "publish");
  ok("manage announcements -> op: publish", detectAnnouncementAdminIntent("manage announcements")?.op === "publish");
  ok("recent announcements -> op: recent", detectAnnouncementAdminIntent("recent announcements")?.op === "recent");
  ok("delegate announcement to rakesh -> op: delegate", detectAnnouncementAdminIntent("delegate announcement to rakesh")?.op === "delegate");
  ok("authorise announcement access -> op: delegate", detectAnnouncementAdminIntent("authorise announcement access")?.op === "delegate");
  ok("revoke announcement permission -> op: delegate", detectAnnouncementAdminIntent("revoke announcement permission")?.op === "delegate");
  ok("announcement audit history -> op: history", detectAnnouncementAdminIntent("announcement audit history")?.op === "history");

  // Prefill title from quotes
  const prefillTest = detectAnnouncementAdminIntent('post announcement "Safety Week Observance"');
  ok("post announcement with quoted title extracts prefill title", prefillTest?.prefill?.title === "Safety Week Observance");

  // Prefill editId from pattern
  const idTest = detectAnnouncementAdminIntent("edit announcement #42");
  ok("edit announcement with ID extracts prefill editId", idTest?.prefill?.editId === 42);

  // Pure questions must NOT match
  ok("what is the announcement on bonus -> null", detectAnnouncementAdminIntent("what is the announcement on bonus") === null);
  ok("show today's announcements -> null", detectAnnouncementAdminIntent("show today's announcements") === null);
  ok("is there any announcement regarding holiday -> null", detectAnnouncementAdminIntent("is there any announcement regarding holiday") === null);
  ok("list all announcements -> null", detectAnnouncementAdminIntent("list all announcements") === null);

  // ----------------------------------------------------
  // TEST SET 2: Omnibar Access Control
  // ----------------------------------------------------
  console.log("\n--- Omnibar Access Control Tests ---");

  const mockDeps = (role: "hod" | "delegate" | null, name: string | null = "MOHD ANWAR ULLAH") => ({
    authority: async () => role,
    nameOf: async () => name,
  });

  const loggedOut = await answerAnnouncementAdmin("announcement management", null, mockDeps(null));
  ok("Logged out user gets 'Please log in' prompt", loggedOut?.hospital?.headline?.text === "Please log in");

  const unauthorised = await answerAnnouncementAdmin("announcement management", "123456", mockDeps(null));
  ok("Unauthorised user gets 'Not allowed' response", unauthorised?.hospital?.headline?.text === "Not allowed");

  const hod = await answerAnnouncementAdmin("announcement management", "498301", mockDeps("hod"));
  ok("HOD gets announcementAdmin payload", (hod as any)?.announcementAdmin?.role === "hod");
  ok("HOD name is included in payload", (hod as any)?.announcementAdmin?.name === "MOHD ANWAR ULLAH");

  const delegate = await answerAnnouncementAdmin("announcement management", "498880", mockDeps("delegate", "RAKESH OJHA"));
  ok("Authorised delegate gets announcementAdmin payload", (delegate as any)?.announcementAdmin?.role === "delegate");

  const delegateDelegating = await answerAnnouncementAdmin("delegate announcement access", "498880", mockDeps("delegate"));
  ok("Delegate attempting to authorise is rejected", delegateDelegating?.hospital?.headline?.text === "Not allowed");

  // ----------------------------------------------------
  // TEST SET 3: Concurrency HMAC Versioning
  // ----------------------------------------------------
  console.log("\n--- Concurrency HMAC Versioning Tests ---");

  const rowA = { id: 1, title: "Blood Donation Camp", content: "<p>Room 4</p>", date: "2026-11-06T09:00:00Z" };
  const rowAClone = { id: 1, title: "Blood Donation Camp", content: "<p>Room 4</p>", date: "2026-11-06T09:00:00Z" };
  const rowB = { id: 1, title: "Blood Donation Camp (Postponed)", content: "<p>Room 4</p>", date: "2026-11-06T09:00:00Z" };

  const vA = announcementVersion(rowA);
  const vAClone = announcementVersion(rowAClone);
  const vB = announcementVersion(rowB);

  ok("HMAC version calculation is deterministic", vA === vAClone);
  ok("HMAC version changes when title changes (lost update guard)", vA !== vB);

  // ----------------------------------------------------
  // TEST SET 4: API Security & Origin
  // ----------------------------------------------------
  console.log("\n--- API Security & Origin Tests ---");

  ok("Same origin check accepts matching host", isSameOrigin("http://localhost:3000", "localhost:3000"));
  ok("Same origin check rejects cross-site origin", !isSameOrigin("http://evil-site.com", "localhost:3000"));

  const mockDb: any = {
    run: async (fn: any) => fn(async () => []),
  };

  const unauthApi = await handleAnnouncementAdmin(
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
  // TEST SET 5: OmnibarModal Rendering Hook
  // ----------------------------------------------------
  console.log("\n--- OmnibarModal Rendering Hook Tests ---");

  const modalPath = path.resolve(process.cwd(), "src/components/OmnibarModal.tsx");
  const modalContent = fs.readFileSync(modalPath, "utf-8");
  ok(
    "OmnibarModal imports AnnouncementAdminPanel",
    modalContent.includes('import { AnnouncementAdminPanel } from "@/components/AnnouncementAdminPanel";'),
  );
  ok(
    "OmnibarModal renders AnnouncementAdminPanel on analytics.announcementAdmin",
    modalContent.includes("<AnnouncementAdminPanel open={analytics.announcementAdmin} />"),
  );

  console.log("==============================================");
  console.log(`Announcement Selftest Results: ${pass} PASSED, ${fail} FAILED`);
  console.log("==============================================");

  if (fail > 0) process.exit(1);
}

runTests().catch((e) => {
  console.error(e);
  process.exit(1);
});
