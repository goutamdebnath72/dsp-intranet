// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/lib/nl2sql/adminFast.selftest.ts
// I made the search route answer the management page and the tools' own requests FIRST, before the name checks, the language-model router and the directory loads (which cost database round trips and a call to the model).
// No database and no model are used here: a request read with no login is answered by the sentence alone, and a sentence that is not a management request is not touched at all.
import { readFileSync } from "node:fs";
import { answerAdminFast } from "./omnibar";
import { HUB_TOOLS, detectManagementHubIntent } from "@/lib/facility/hub";
import { detectEmployeeAdminIntent } from "@/lib/employees/admin/intent";
import { detectPaxAdminIntent } from "@/lib/pax/admin/intent";
import { detectHolidayAdminIntent } from "@/lib/holidays/admin/intent";
import { detectCircularAdminIntent } from "@/lib/circulars/admin/intent";
import { detectAnnouncementAdminIntent } from "@/lib/announcements/admin/intent";
import { detectAccessLogAdminIntent } from "@/lib/accessLog/admin/intent";

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };

async function main() {
  // The page, signed out: the sign-in card, from the sentence alone.
  const a = (await answerAdminFast("management", null)) as { managementGate?: { state: string }; source?: string; attempt?: number } | null;
  ok("'management' with no login is answered at once by the sign-in card, in the shape the chain gives (source and attempt), without a database or a model", a?.managementGate?.state === "login" && a?.source === "holiday" && a?.attempt === 1);
  ok("every word that opens the page is answered the same way", (await Promise.all(["admin", "management page", "managers", "admin tools", "open the management page"].map((q) => answerAdminFast(q, null)))).every((r) => (r as { managementGate?: { state: string } } | null)?.managementGate?.state === "login"));
  // The tools' own requests are in the same early list (their own readers are tested in hub.selftest.tsx: each tool's words are read by its own reader and by no other's; the tools' database access modules need the app's login library, which the
  // test runner cannot load, so I do not run them here).
  const omniSrc = readFileSync("src/lib/nl2sql/omnibar.ts", "utf8");
  const listed = ["managementHub", "employeeAdmin", "paxAdmin", "holidayAdmin", "circularAdmin", "announcementAdmin", "accessLogAdmin"];
  ok("the early list holds the management page and all six tools' own requests, each with its own responder", listed.every((k) => new RegExp(`\\n    ${k}: async \\(qq, ticket\\) =>`).test(omniSrc.slice(omniSrc.indexOf("function adminResponders"), omniSrc.indexOf("export async function answerAdminFast")))) && Object.keys(HUB_TOOLS).length === 6);
  // anything else is none of its business
  const plain = ["who is the general manager", "goutam debnath", "leave policy", "hospital opd today", "how many dgms in mechanical", "pax number of fire service", "holidays in november", "12*45+7", "calculators", "what is the dob of goutam debnath", "emi calculator", "how to become a manager"];
  const got = await Promise.all(plain.map((q) => answerAdminFast(q, "412345").catch(() => "threw")));
  ok("a sentence that is not a management request is not answered (null) and nothing is asked of a database for it: the ordinary pipeline goes on as before", got.every((r) => r === null), JSON.stringify(plain.filter((_, i) => got[i] !== null)));

  const readers = [detectManagementHubIntent, detectEmployeeAdminIntent, detectPaxAdminIntent, detectHolidayAdminIntent, detectCircularAdminIntent, detectAnnouncementAdminIntent, detectAccessLogAdminIntent];
  ok("and the readers themselves (the pure first step of every responder, run here for real) claim none of those sentences, so the early try cannot take an ordinary question", plain.every((q) => readers.every((rd) => !rd(q))), JSON.stringify(plain.filter((q) => readers.some((rd) => rd(q)))));
  // THE ORDER IN THE ROUTE
  const route = readFileSync("src/app/api/ai-search/route.ts", "utf8");
  const iSession = route.indexOf("await getSessionTicket()"), iShort = route.indexOf("q.length < 2"), iFast = route.indexOf("answerAdminFast(q, userTicket"), iName = route.indexOf('traceStep("name-checks")'), iLlm = route.indexOf("parseQueryWithLlm(q)"), iGate = route.indexOf("loadDirectoryNameWords((sql)"), iChain = route.indexOf("await answerOmnibar(q, userTicket");
  ok("IN THE SEARCH ROUTE the management request comes right after the login is read and the empty line refused, and BEFORE the name checks, the model router, the directory loads and the omnibar chain", iSession > 0 && iShort > iSession && iFast > iShort && iFast < iName && iName < iLlm && iFast < iGate && iFast < iChain, JSON.stringify({ iSession, iShort, iFast, iName, iLlm, iGate, iChain }));
  ok("it is asked only for the plain search (mode semantic), by the session's ticket, and a failure of it falls through to the old path instead of failing the search", /if \(mode === "semantic"\) \{\s*const endAdmin = traceStep\("management"\);\s*const admin = await answerAdminFast\(q, userTicket \?\? null\)\.catch\(\(\) => null\);/.test(route) && /if \(admin\) return NextResponse\.json\(\{ analytics: admin \}\);/.test(route));
  const omni = readFileSync("src/lib/nl2sql/omnibar.ts", "utf8");
  ok("the chain keeps the same responders in the same order (the early try and the chain share ONE list, adminResponders), so the two can never disagree", /\.\.\.adminResponders\(\),/.test(omni) && /for \(const k of \["managementHub", "employeeAdmin", "paxAdmin", "holidayAdmin", "circularAdmin", "announcementAdmin", "accessLogAdmin"\] as const\)/.test(omni) && omni.indexOf('"managementHub", "employeeAdmin", "paxAdmin"') > 0);

  console.log(`adminFast selftest: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
void main();
