// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/lib/security/changePassword.selftest.ts
// What I test here: a person changes his own password, by the rules, with a fake database and real bcrypt. The HOD's own is not changed while the app is in its development phase.
import { readFileSync } from "node:fs";
import bcrypt from "bcryptjs";
import { createFailureLock } from "./rateLimit";
import { changePassword, checkNewPassword, HOD_LOCKED_MESSAGE, isProductionPhase, mayChange, type ChangeDeps } from "./changePassword";
import { REUSED_MESSAGE, SAME_AS_CURRENT_MESSAGE } from "./passwordPolicy";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };
const src = (p: string) => readFileSync(p, "utf8");

async function main() {
  const HOD = "498301";
  const rows: Record<string, { id: string; hash: string | null; pno: string | null; mobile?: string | null; email?: string | null }> = {
    "412345": { id: "u1", hash: bcrypt.hashSync("D123456", 4), pno: "D123456" },
    [HOD]: { id: "u2", hash: bcrypt.hashSync("shared-dev-secret", 4), pno: "D999999" },
    "500001": { id: "u3", hash: null, pno: "D111111" },
  };
  const saved: Array<[string, string]> = [];
  const replaced: string[] = [];
  const past: string[] = [];
  const make = (ticket: string | null, hodMayChange = false): ChangeDeps => ({
    ticket, isHod: (t) => t === HOD, hodMayChange,
    load: async (t) => rows[t] ?? null,
    save: async ({ id, newHash, replacedHash }) => { saved.push([id, newHash]); replaced.push(replacedHash); },
    compare: (p, h) => bcrypt.compare(p, h), hash: (p) => bcrypt.hash(p, 4),
    lock: createFailureLock({ max: 5, windowMs: 900_000 }),
    history: async () => past,
    otp: { on: false, noChannel: "allow", verify: async () => ({ ok: true as const }) },
  });

  // the rules of a new password
  const ctx = { current: "OldPass#1", ticket: "412345", pno: "D123456" };
  ok("a new password needs 8 characters, and is refused when it is the old one, the ticket, the P.No. (any case) or one repeated character", checkNewPassword("short", ctx) !== null && checkNewPassword("OldPass#1", ctx) !== null && checkNewPassword("412345", { ...ctx }) !== null && checkNewPassword("d123456", ctx) !== null && checkNewPassword("aaaaaaaaaa", ctx) !== null && checkNewPassword("x".repeat(129), ctx) !== null && checkNewPassword("Blue-River-42", ctx) === null);

  // who may
  ok("signed out: refused with 401, nothing read or written", (await changePassword(make(null), { current: "a", next: "bbbbbbbb1" })).status === 401 && saved.length === 0);
  const hod = await changePassword(make(HOD), { current: "shared-dev-secret", next: "My-Own-Choice-77" });
  ok("THE HOD, in the development phase: refused (403, the plain message), the password is NOT changed, even with the right current password", hod.status === 403 && !hod.body.ok && hod.body.code === "hod_locked" && hod.body.error === HOD_LOCKED_MESSAGE && saved.length === 0);
  ok("the HOD's message says why and when: both people know it in the development phase; he can change it when the app goes into production", /development phase/.test(HOD_LOCKED_MESSAGE) && /HOD and the developer/.test(HOD_LOCKED_MESSAGE) && /production/.test(HOD_LOCKED_MESSAGE));
  const hodProd = await changePassword(make(HOD, true), { current: "shared-dev-secret", next: "My-Own-Choice-77" });
  ok("THE HOD, in production: he changes his own like everybody else, to what he chooses", hodProd.status === 200 && saved.length === 1 && saved[0][0] === "u2" && await bcrypt.compare("My-Own-Choice-77", saved[0][1]));
  ok("what the window asks first: ordinary person yes; HOD no with the reason (development), yes (production); signed out no", mayChange(make("412345")).canChange && !mayChange(make(HOD)).canChange && mayChange(make(HOD)).reason === HOD_LOCKED_MESSAGE && mayChange(make(HOD, true)).canChange && !mayChange(make(null)).canChange);
  ok("only the exact word production (any case) is the production phase", isProductionPhase("production") && isProductionPhase(" Production ") && !isProductionPhase("") && !isProductionPhase(undefined) && !isProductionPhase("prod") && !isProductionPhase("development"));

  // an ordinary person
  saved.length = 0;
  const d1 = make("412345");
  const wrong = await changePassword(d1, { current: "not-it", next: "Blue-River-42" });
  ok("a wrong current password is refused (403), counted, and nothing is written", wrong.status === 403 && !wrong.body.ok && wrong.body.code === "wrong_current" && saved.length === 0);
  const weak = await changePassword(d1, { current: "D123456", next: "D123456" });
  ok("a new password equal to the old one (the P.No.) is refused with the reason (400), nothing written", weak.status === 400 && !weak.body.ok && weak.body.code === "weak" && saved.length === 0);
  const good = await changePassword(d1, { current: "D123456", next: "Blue-River-42" });
  ok("a right current password and a good new one: changed (200); a bcrypt hash of the NEW password is saved for that person's own row only", good.status === 200 && saved.length === 1 && saved[0][0] === "u1" && saved[0][1] !== "Blue-River-42" && /^\$2[aby]\$/.test(saved[0][1]) && await bcrypt.compare("Blue-River-42", saved[0][1]));
  const bad = [undefined, null, 5, "x", {}, { current: "a" }, { next: "bbbbbbbb" }, { current: 5, next: "bbbbbbbbb" }, { current: "a", next: ["b"] }, { current: "x".repeat(200), next: "bbbbbbbbb" }];
  ok("a body that is not {current, next} strings is refused (400)", (await Promise.all(bad.map((b) => changePassword(make("412345"), b)))).every((o) => o.status === 400 && !o.body.ok && o.body.code === "bad_input"));
  ok("an account with no password of its own (no hash) cannot be changed here (403)", (await changePassword(make("500001"), { current: "a", next: "Blue-River-42" })).status === 403);
  ok("an unknown ticket in the sign-in (no such row) is refused (403) and writes nothing", await (async () => { const n = saved.length; const o = await changePassword(make("999999"), { current: "a", next: "Blue-River-42" }); return o.status === 403 && saved.length === n; })());
  // the lock
  const d2 = make("412345");
  for (let i = 0; i < 5; i++) await changePassword(d2, { current: `wrong${i}`, next: "Blue-River-42" });
  const locked = await changePassword(d2, { current: "D123456", next: "Blue-River-42" });
  ok("five wrong current passwords lock the changes (429 with a wait), even for the right one afterwards", locked.status === 429 && !locked.body.ok && locked.body.code === "locked" && (locked.body.retryAfterSec ?? 0) > 0);
  const d3 = make("412345");
  for (let i = 0; i < 4; i++) await changePassword(d3, { current: `wrong${i}`, next: "Blue-River-42" });
  await changePassword(d3, { current: "D123456", next: "Blue-River-42" });
  ok("a right current password clears the count", d3.lock.blocked("412345").ok);

  // the wiring
  const route = src("src/app/api/account/password/route.ts");
  ok("the route reads WHO from the session only (no ticket from the body or the address), checks the origin, and has its own failure lock and pace limiter", /getSessionTicket\(\)/.test(route) && !/body\??\.ticket|searchParams\.get\("ticket"\)/.test(route) && /sameOrigin\(/.test(route) && /createFailureLock\(\{ max: 5/.test(route) && /createLimiter\(\{ max: 10/.test(route));
  ok("the route writes one row by its id, uses bcrypt cost 10, and reads the phase from APP_PHASE", /UPDATE public\."user" SET password = \$1 WHERE id = \$2/.test(route) && /bcrypt\.hash\(plain, 10\)/.test(route) && /APP_PHASE/.test(route));
  const top = src("src/components/TopBar.tsx");
  ok("the account menu has 'Change password' above Logout, and the window is drawn", top.indexOf("Change password") > 0 && top.indexOf("Change password") < top.indexOf("Logout") && /<ChangePasswordModal isOpen=\{isPasswordOpen\}/.test(top));
  ok("the sign-in's password field is called Password and says what the first password is and where to change it", /label="Password"/.test(src("src/components/StepTwo.tsx")) && /Your password is your SAIL Personal No\./.test(src("src/components/StepTwo.tsx")));
  ok("APP_PHASE is documented in .env.example", /APP_PHASE=/.test(src(".env.example")));
  console.log(`changePassword selftest: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
void main();
