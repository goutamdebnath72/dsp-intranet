// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/lib/security/security.selftest.ts
// THE SECURITY HARDENING OF 21 NOV 2026, one assertion each: the limiters behave; the login counts wrong passwords and checks unknown tickets in the same time; no other sign-in provider exists; the session is
// 24 hours; the model route is limited; a reveal has a cap; the headers are set; the status page and the old debug route are closed; no raw error text goes to the browser.
import { readFileSync, existsSync } from "node:fs";
import { createFailureLock, createLimiter, clientIp } from "./rateLimit";
import { accessesInLastHour, mayReveal, REVEALS_PER_HOUR } from "./revealCap";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };
const src = (p: string) => readFileSync(p, "utf8");

async function main() {
  // ---- the limiter
  const L = createLimiter({ max: 3, windowMs: 1000 });
  ok("a limiter lets `max` calls through in a window, refuses the next with a wait time, and lets a new window start", L.take("a", 0).ok && L.take("a", 10).ok && L.take("a", 20).ok && !L.take("a", 30).ok && L.take("a", 30).retryAfterSec >= 1 && L.take("a", 1100).ok);
  ok("keys do not share a limit", L.take("b", 40).ok && L.take("b", 41).ok && L.take("b", 42).ok && !L.take("b", 43).ok && L.take("c", 44).ok);
  const big = createLimiter({ max: 1, windowMs: 1e9 });
  for (let i = 0; i < 7000; i++) big.take(`k${i}`, i);
  ok("the key table is bounded (it cannot grow without end under a flood of different keys)", big.size() <= 5000, String(big.size()));
  // ---- the failure lock
  const F = createFailureLock({ max: 3, windowMs: 1000 });
  F.fail("t", 0); F.fail("t", 1); F.fail("t", 2);
  ok("three wrong passwords lock the key; it opens again when the oldest is a window old; a success clears it", !F.blocked("t", 3).ok && F.blocked("t", 3).retryAfterSec >= 1 && F.blocked("t", 1001).ok === true && (() => { F.fail("u", 0); F.fail("u", 1); F.reset("u"); return F.blocked("u", 2).ok; })());
  ok("the caller's address is the first of x-forwarded-for, else x-real-ip, else unknown", clientIp(new Headers({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" })) === "1.2.3.4" && clientIp(new Headers({ "x-real-ip": "9.9.9.9" })) === "9.9.9.9" && clientIp(new Headers()) === "unknown");

  // ---- the login
  const auth = src("src/lib/auth.ts");
  ok("NO other sign-in provider exists: the GitHub provider is gone (anybody with a GitHub account could have signed in and passed every check that only asks for a session)", !/GitHubProvider|providers\/github|GITHUB_/.test(auth) && /CredentialsProvider\(/.test(auth));
  ok("a session lasts 24 hours (not the library's 30 days)", /session: \{ strategy: "jwt", maxAge: 24 \* 60 \* 60 \}/.test(auth));
  ok("wrong passwords are counted by three keys (ticket+address 6, address 30, ticket 40 in 15 minutes) and a locked key is refused BEFORE the database or bcrypt is touched", /createFailureLock\(\{ max: 6, windowMs: LOGIN_WINDOW \}\)/.test(auth) && /max: 30/.test(auth) && /max: 40/.test(auth) && auth.indexOf("failsPair.blocked(pairKey)") < auth.indexOf("userRepository.findOne"));
  ok("an unknown ticket is checked against a real bcrypt hash (same time as a wrong password: tickets cannot be told apart by timing), and counts as a wrong try", /await bcrypt\.compare\(credentials\.password, DUMMY_HASH\)/.test(auth) && /DUMMY_HASH = "\$2[aby]\$10\$/.test(auth) && /return wrong\(\);\s*\}\s*const isValid/.test(auth));
  ok("a correct password clears the ticket+address count; absurd lengths are refused outright", /failsPair\.reset\(pairKey\)/.test(auth) && /ticketNo\.length > 32 \|\| credentials\.password\.length > 128/.test(auth));

  // ---- the model route
  const ai = src("src/app/api/ai-search/route.ts");
  ok("the search route limits the questions that can reach the model: 60 a minute per signed-in ticket, 120 a minute per address, 429 with Retry-After; a very long question is refused", /createLimiter\(\{ max: 60, windowMs: 60_000 \}\)/.test(ai) && /createLimiter\(\{ max: 120, windowMs: 60_000 \}\)/.test(ai) && /status: 429, headers: retryHeaders/.test(ai) && /q\.length > 1000/.test(ai) && /mode === "semantic" \|\| mode === "intellectual"/.test(ai));
  ok("the limit comes BEFORE the model's router, the admin fast path and the directory loads", ai.indexOf("aiByTicket.take") < ai.indexOf("answerAdminFast(q") && ai.indexOf("aiByTicket.take") < ai.indexOf("parseQueryWithLlm(q)"));

  // ---- the reveal cap
  const calls: unknown[][] = [];
  const q = (n: number) => async (_s: string, p: unknown[]) => { calls.push(p); return [{ n }]; };
  ok("a reveal is allowed below the hourly cap and refused at it (the audit table is the counter)", await mayReveal(q(REVEALS_PER_HOUR - 1), "498301") && !(await mayReveal(q(REVEALS_PER_HOUR), "498301")) && (await accessesInLastHour(q(7), "x")) === 7 && calls[0][0] === "498301");
  const reveal = src("src/app/api/employees/[id]/reveal/route.ts");
  ok("the reveal route checks the cap before it reads the other person's contact, and answers 429", /mayReveal\(/.test(reveal) && reveal.indexOf("mayReveal(") < reveal.indexOf("SELECT id, \"ticketNo\"") && /status: 429/.test(reveal));

  // ---- headers
  const cfg = await import("../../../next.config.js").then((m) => (m.default ?? m) as { headers: () => Promise<Array<{ source: string; headers: Array<{ key: string; value: string }> }>>; poweredByHeader: boolean }).catch(async () => (await import("node:module")).createRequire(import.meta.url)("../../../next.config.js"));
  const hs = (await cfg.headers())[0];
  const get = (k: string) => hs.headers.find((h: { key: string; value: string }) => h.key === k)?.value ?? "";
  ok("every route gets the security headers: HSTS, nosniff, frame protection that still allows the app's own PDF frames, a referrer policy and a permissions policy", hs.source === "/:path*" && /max-age=63072000/.test(get("Strict-Transport-Security")) && get("X-Content-Type-Options") === "nosniff" && get("X-Frame-Options") === "SAMEORIGIN" && get("Referrer-Policy") === "strict-origin-when-cross-origin" && /camera=\(\)/.test(get("Permissions-Policy")) && /geolocation=\(\)/.test(get("Permissions-Policy")));
  ok("the framework's name is not announced (no X-Powered-By)", cfg.poweredByHeader === false);

  // ---- the doors that are closed
  const status = src("src/app/api/live/status/route.ts");
  ok("the live-status page is for the HOD only (anybody else gets 404), and the check comes before any source is asked", /isSuperAdmin\(await getSessionTicket\(\)\)\) return NextResponse\.json\(\{ error: "Not found" \}, \{ status: 404/.test(status) && status.indexOf("isSuperAdmin(") < status.indexOf("Promise.all"));
  ok("the old open debug route /api/employees/analytics is gone (nothing used it)", !existsSync("src/app/api/employees/analytics/route.ts"));
  ok("no raw error text goes to the browser from the holidays route (it stays in the server log)", !/error: err\.message/.test(src("src/app/api/holidays/get-by-year/route.ts")));
  console.log(`security selftest: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
void main();
