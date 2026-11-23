// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/lib/security/passwordLife.selftest.ts
// What I test here: the life of a password. 180 days, the last 5 not reusable, the window that comes up by itself, no copy and paste in the three boxes, and the one-time code (built, switched off).
import { readFileSync } from "node:fs";
import bcrypt from "bcryptjs";
import { DateTime } from "luxon";
import { createFailureLock } from "./rateLimit";
import { changePassword, passwordStatus, HOD_LOCKED_MESSAGE, type ChangeDeps, type StatusDeps } from "./changePassword";
import { ageStatus, destinationFor, expiredMessage, HISTORY_KEEP, maskDestination, otpConfig, PASSWORD_VALID_DAYS, REUSED_MESSAGE } from "./passwordPolicy";
import { OTP_MAX_PER_HOUR, OTP_MAX_TRIES, OTP_RESEND_SEC, OTP_TTL_SEC, sendOtp, verifyOtp, type OtpDeps, type OtpRow, type OtpStore } from "./otp";
import { senderFromEnv, notConfiguredSender, OtpNotConfigured } from "./otpSender";
import { otpStoreOver, recordChange, TABLE_STATEMENTS } from "./passwordStore";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };
const src = (p: string) => readFileSync(p, "utf8");
const DAY = 86_400_000;

async function main() {
  // ---- the age
  const t0 = DateTime.fromISO("2026-06-01T10:00:00Z").toMillis();
  const at = (days: number) => t0 + days * DAY;
  ok("a password is valid for 180 days; the days left count down to 1; the day after, it has expired (with the days over)", PASSWORD_VALID_DAYS === 180 && (() => { const a = ageStatus(t0, at(0)); const b = ageStatus(t0, at(179.5)); const c = ageStatus(t0, at(180)); const d = ageStatus(t0, at(185)); return a.state === "valid" && a.daysLeft === 180 && b.state === "valid" && b.daysLeft === 1 && c.state === "expired" && d.state === "expired" && d.daysOver === 5; })());
  ok("no recorded change is its own state (neither valid nor expired); a broken date too", ageStatus(null, t0).state === "unrecorded" && ageStatus(undefined, t0).state === "unrecorded" && ageStatus(NaN, t0).state === "unrecorded");
  ok("the expiry sentence says the duration in days, that a new password is valid for as long, and the last-5 rule", /expired/.test(expiredMessage()) && /180 days/.test(expiredMessage()) && /last 5 passwords/.test(expiredMessage()) && HISTORY_KEEP === 5);

  // ---- the window comes up by itself: the status
  const HOD = "498301";
  let recorded: number | null | undefined = at(-200);
  let clockStarted = 0;
  const st = (ticket: string | null, o: Partial<StatusDeps> = {}): StatusDeps => ({
    ticket, isHod: (t) => t === HOD, hodMayChange: false, now: () => t0,
    changedAt: async () => recorded, startClock: async () => { clockStarted++; },
    otp: { on: false, noChannel: "allow" }, destination: async () => null, ...o,
  });
  const expired = await passwordStatus(st("412345"));
  ok("a password older than 180 days is REQUIRED to change: the status carries the message with the duration and the date it expired", expired.required && /180 days/.test(expired.requiredMessage ?? "") && /expired on/.test(expired.note ?? "") && expired.canChange);
  recorded = at(-30);
  const fresh = await passwordStatus(st("412345"));
  ok("a password of 30 days is not required; the note says 150 more days and what a new one is", !fresh.required && fresh.daysLeft === 150 && /150 more days/.test(fresh.note ?? "") && /180 days/.test(fresh.note ?? "") && /last 5/.test(fresh.note ?? ""));
  recorded = null; clockStarted = 0;
  const first = await passwordStatus(st("412345"));
  ok("a person with no recorded change is not shut out: his 180 days start now (written once), and he is not required to change today", !first.required && clockStarted === 1 && first.daysLeft === 180);
  recorded = undefined; clockStarted = 0;
  const noRecords = await passwordStatus(st("412345"));
  ok("when the records are not available the rule is not applied (not required, nothing written) and a change still works", !noRecords.required && clockStarted === 0 && noRecords.canChange);
  recorded = at(-500);
  const hod = await passwordStatus(st(HOD));
  ok("THE HOD in the development phase is never taken to the window, however old his password: the window says why and has no form", !hod.canChange && !hod.required && hod.reason === HOD_LOCKED_MESSAGE);
  const hodProd = await passwordStatus(st(HOD, { hodMayChange: true }));
  ok("the HOD in production follows the same rule as everybody", hodProd.canChange && hodProd.required);
  ok("signed out: nothing", !(await passwordStatus(st(null))).canChange);

  // ---- the new password cannot be one of the last 5
  const old = ["Old-One-1", "Old-Two-2", "Old-Three-3", "Old-Four-4", "Old-Five-5"];
  const hashes = old.map((p) => bcrypt.hashSync(p, 4));
  const cur = bcrypt.hashSync("Current-Pass-0", 4);
  const saved: Array<{ id: string; ticket: string; newHash: string; replacedHash: string }> = [];
  const make = (o: Partial<ChangeDeps> = {}): ChangeDeps => ({
    ticket: "412345", isHod: (t) => t === HOD, hodMayChange: false,
    load: async () => ({ id: "u1", hash: cur, pno: "D123456", mobile: null, email: null }),
    save: async (c) => { saved.push(c); },
    compare: (p, h) => bcrypt.compare(p, h), hash: (p) => bcrypt.hash(p, 4),
    lock: createFailureLock({ max: 5, windowMs: 900_000 }),
    history: async () => hashes,
    otp: { on: false, noChannel: "allow", verify: async () => ({ ok: true }) },
    ...o,
  });
  const reuse = await changePassword(make(), { current: "Current-Pass-0", next: "Old-Three-3" });
  ok("a new password equal to any of the last 5 is refused with the plain sentence, nothing written", reuse.status === 400 && !reuse.body.ok && reuse.body.code === "reused" && reuse.body.error === REUSED_MESSAGE && /last 5 passwords/.test(REUSED_MESSAGE) && saved.length === 0);
  const same = await changePassword(make(), { current: "Current-Pass-0", next: "Current-Pass-0" });
  ok("the same as the current (last) password is refused too", same.status === 400 && !same.body.ok && /current \(last\) password/.test(same.body.error));
  const fine = await changePassword(make(), { current: "Current-Pass-0", next: "Brand-New-Pass-9" });
  ok("a password not among them is accepted, and the replaced hash is handed on to the history", fine.status === 200 && saved.length === 1 && saved[0].replacedHash === cur && saved[0].ticket === "412345");

  // ---- the one-time code inside a change
  const phone = { id: "u1", hash: cur, pno: "D123456", mobile: "9434791234", email: null };
  const noMobile = { id: "u2", hash: cur, pno: "D111111", mobile: null, email: null };
  let verifyCalls = 0;
  const withOtp = (load: ChangeDeps["load"], noChannel: "allow" | "block" = "allow", good = "123456"): ChangeDeps => make({ load, otp: { on: true, noChannel, verify: async (_t, code) => { verifyCalls++; return code === good ? { ok: true } : { ok: false, error: "The code is not correct. 4 tries left." }; } } });
  saved.length = 0;
  const needs = await changePassword(withOtp(async () => phone), { current: "Current-Pass-0", next: "Brand-New-Pass-9" });
  ok("with the OTP on and a mobile on record, a change without the code is refused and says where the code was sent (masked)", needs.status === 400 && !needs.body.ok && needs.body.code === "otp_needed" && /XXXXXX1234/.test(needs.body.error) && saved.length === 0 && verifyCalls === 0);
  const badCode = await changePassword(withOtp(async () => phone), { current: "Current-Pass-0", next: "Brand-New-Pass-9", otp: "000000" });
  ok("a wrong code is refused (403) and nothing is written", badCode.status === 403 && !badCode.body.ok && badCode.body.code === "otp_wrong" && saved.length === 0);
  const goodCode = await changePassword(withOtp(async () => phone), { current: "Current-Pass-0", next: "Brand-New-Pass-9", otp: "123456" });
  ok("the right code lets the change through", goodCode.status === 200 && saved.length === 1);
  verifyCalls = 0; saved.length = 0;
  const weakFirst = await changePassword(withOtp(async () => phone), { current: "Current-Pass-0", next: "short", otp: "123456" });
  ok("a refused new password does not use up a code (the code is checked last)", weakFirst.status === 400 && verifyCalls === 0);
  const allow = await changePassword(withOtp(async () => noMobile), { current: "Current-Pass-0", next: "Brand-New-Pass-9" });
  ok("a person with no mobile and no e-mail on record: allowed with the current password alone by default (otherwise the 180-day rule would shut him out)", allow.status === 200);
  const block = await changePassword(withOtp(async () => noMobile, "block"), { current: "Current-Pass-0", next: "Brand-New-Pass-9" });
  ok("...or refused, with the words to ask C&IT to add his mobile number, when the host says block", block.status === 403 && !block.body.ok && block.body.code === "no_channel" && /ask C&IT/.test(block.body.error));
  const email = { id: "u3", hash: cur, pno: null, mobile: null, email: "someone@sail.in" };
  const viaMail = await changePassword(withOtp(async () => email), { current: "Current-Pass-0", next: "Brand-New-Pass-9" });
  ok("a person with no mobile but an e-mail gets his code by e-mail (masked)", !viaMail.body.ok && viaMail.body.code === "otp_needed" && /s•••@sail\.in/.test(viaMail.body.error));
  const off = await changePassword(make({ load: async () => phone }), { current: "Current-Pass-0", next: "Brand-New-Pass-9" });
  ok("with the OTP switched off (the default) no code is asked for", off.status === 200);

  // ---- the destination, the switch and the sender
  ok("a mobile of 10 digits or more goes by SMS (the last 10), else a valid e-mail, else nowhere; the screen sees only a masked form", JSON.stringify(destinationFor({ mobile: "+91 94347 91234" })) === '{"channel":"sms","to":"9434791234"}' && destinationFor({ mobile: "12345", email: "a@b.in" })?.channel === "email" && destinationFor({ mobile: "", email: "not-an-email" }) === null && maskDestination({ channel: "sms", to: "9434791234" }) === "XXXXXX1234");
  ok("the OTP is off unless the host says on (on, 1, true, yes); the no-mobile policy is allow unless block", !otpConfig({}).on && !otpConfig({ PASSWORD_OTP: "off" }).on && otpConfig({ PASSWORD_OTP: "ON" }).on && otpConfig({ PASSWORD_OTP: "1" }).on && otpConfig({}).noChannel === "allow" && otpConfig({ PASSWORD_OTP_NO_CHANNEL: "Block" }).noChannel === "block");
  ok("with no gateway, the sender says so plainly (it never pretends to send); the developer echo works only outside production", await notConfiguredSender.send({ channel: "sms", to: "x" }, "m").then(() => false, (e) => e instanceof OtpNotConfigured) && senderFromEnv({}) === notConfiguredSender && senderFromEnv({ PASSWORD_OTP_DEV_ECHO: "true", NODE_ENV: "production" }) === notConfiguredSender && senderFromEnv({ PASSWORD_OTP_DEV_ECHO: "true", NODE_ENV: "development" }) !== notConfiguredSender);

  // ---- the code itself
  const rows = new Map<string, OtpRow & { channel: string; sentTo: string }>();
  const log: Array<[string, number]> = [];
  const store: OtpStore = {
    get: async (t) => rows.get(t) ?? null,
    put: async (t, r) => { rows.set(t, r); log.push([t, r.sentAt]); },
    setTries: async (t, n) => { const r = rows.get(t); if (r) r.tries = n; },
    clear: async (t) => { rows.delete(t); },
    sentInLastHour: async (t, now) => log.filter(([k, at]) => k === t && now - at < 3_600_000).length,
  };
  let now = 1_000_000; const nextCode = "424242"; const sent: string[] = [];
  const od: OtpDeps = { now: () => now, digits: () => nextCode, hash: (t, c) => `h(${t}:${c})`, store, sender: { send: async (_d, m) => { sent.push(m); } } };
  const dest = { channel: "sms" as const, to: "9434791234" };
  const r1 = await sendOtp(od, "412345", dest);
  ok("a code is sent to the destination, kept only as a keyed hash (never the code), valid 5 minutes; the answer carries the masked destination", r1.ok && r1.maskedTo === "XXXXXX1234" && r1.expiresInSec === OTP_TTL_SEC && sent.length === 1 && /424242/.test(sent[0]) && rows.get("412345")!.codeHash === "h(412345:424242)" && !JSON.stringify([...rows.values()]).includes('"424242"'));
  const r2 = await sendOtp(od, "412345", dest);
  ok("another code within 60 seconds is refused with the seconds to wait, and nothing is sent", !r2.ok && r2.code === "too_soon" && (r2.retryAfterSec ?? 0) > 0 && sent.length === 1 && OTP_RESEND_SEC === 60);
  const wrong = await verifyOtp(od, "412345", "111111");
  ok("a wrong code is refused and counted (4 tries left), the code stays", !wrong.ok && /4 tries left/.test(wrong.error) && rows.get("412345")!.tries === 1);
  const right = await verifyOtp(od, "412345", " 424242 ");
  ok("the right code (spaces ignored) is accepted ONCE: it is gone afterwards", right.ok && !rows.has("412345") && !(await verifyOtp(od, "412345", "424242")).ok);
  await sendOtp({ ...od, now: () => (now += 61_000) }, "412345", dest);
  for (let i = 0; i < OTP_MAX_TRIES; i++) await verifyOtp(od, "412345", "999999");
  ok("after 5 wrong tries the code is destroyed (even the right one then fails)", !rows.has("412345") && !(await verifyOtp(od, "412345", "424242")).ok && OTP_MAX_TRIES === 5);
  now += 61_000; await sendOtp(od, "412345", dest);
  now += OTP_TTL_SEC * 1000 + 1;
  const late = await verifyOtp(od, "412345", "424242");
  ok("a code older than 5 minutes is refused as expired and destroyed", !late.ok && /expired/.test(late.error) && !rows.has("412345"));
  const rows2 = new Map(); log.length = 0; rows2.clear();
  let n = 0; const tick = { ...od, now: () => 5_000_000 + n++ * 61_000 };
  const results = []; for (let i = 0; i < OTP_MAX_PER_HOUR + 1; i++) results.push(await sendOtp(tick, "500001", dest));
  ok("more than 3 codes an hour for one person are refused", results.slice(0, 3).every((x) => x.ok) && !results[3].ok && (results[3] as { code: string }).code === "too_many" && OTP_MAX_PER_HOUR === 3);
  const failing: OtpDeps = { ...od, store: { ...store, clear: async (t) => { rows.delete(t); } }, now: () => 9_000_000_000, sender: { send: async () => { throw new Error("gateway down"); } } };
  const nf = await sendOtp(failing, "600001", dest);
  ok("when the sending fails the stored code is removed (no live code the person never got) and he is told plainly", !nf.ok && nf.code === "not_sent" && !rows.has("600001"));

  // ---- the stored life (SQL shape, with a recording query)
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  const rec = async (sql: string, params?: unknown[]) => { calls.push({ sql, params }); return [{ n: 2 }]; };
  await recordChange(rec, "412345", "$2a$10$replaced");
  ok("a change is recorded in ONE statement with placeholders: the day is now, the replaced hash goes to the front, only the 5 newest are kept", calls.length === 1 && /ON CONFLICT \(ticket_no\) DO UPDATE/.test(calls[0].sql) && /LIMIT 5/.test(calls[0].sql) && /\$1/.test(calls[0].sql) && /\$2::text/.test(calls[0].sql) && JSON.stringify(calls[0].params) === '["412345","$2a$10$replaced"]' && !/412345|replaced/.test(calls[0].sql));
  calls.length = 0; const os = otpStoreOver(rec); await os.put("412345", { codeHash: "h", expiresAt: 1, tries: 0, sentAt: 1, channel: "sms", sentTo: "XXXXXX1234" }); await os.sentInLastHour("412345", 5);
  ok("the code store uses placeholders only and logs each send (to count three an hour)", calls.every((c) => !/412345/.test(c.sql)) && calls.some((c) => /password_otp_log/.test(c.sql)));
  ok("the three tables are closed to the browser (row level security, nothing for anon or authenticated), here and in the SQL file", ["password_meta", "password_otp", "password_otp_log"].every((t) => TABLE_STATEMENTS.some((s) => s.includes(`ENABLE ROW LEVEL SECURITY`) && s.includes(t)) && TABLE_STATEMENTS.some((s) => s.includes(`REVOKE ALL ON public.${t} FROM anon, authenticated`)) && src("src/lib/nl2sql/sql/30_password_policy.sql").includes(`REVOKE ALL ON public.${t} FROM anon, authenticated`)));

  // ---- the window and the wiring
  const modal = src("src/components/ChangePasswordModal.tsx");
  ok("ALL THREE password boxes refuse copy, cut, paste, drop, drag-out and the context menu (one shared set of handlers, spread on each of the three)", (modal.match(/\{\.\.\.NO_CLIPBOARD\}/g) ?? []).length === 3 && /onCopy: \(e: React\.ClipboardEvent\) => e\.preventDefault\(\)/.test(modal) && /onCut:/.test(modal) && /onPaste: \(e: React\.ClipboardEvent\) => e\.preventDefault\(\)/.test(modal) && /onDrop:/.test(modal) && /onContextMenu:/.test(modal) && /autoComplete="current-password"[\s\S]{0,260}?\{\.\.\.NO_CLIPBOARD\}/.test(modal) && (modal.match(/autoComplete="new-password"[\s\S]{0,260}?\{\.\.\.NO_CLIPBOARD\}/g) ?? []).length === 2);
  ok("the one-time code box is NOT one of them (a code may be pasted); it is shown only when the server says a code is needed", !/placeholder="6-digit code"[^>]*NO_CLIPBOARD/.test(modal) && /needsCode && \(/.test(modal) && /const needsCode = !!s\?\.otp\?\.required/.test(modal));
  ok("when the password has run out the window cannot be closed: no cross, no Escape, no click outside; it says the message and offers Sign out", /\{!required && <button[^>]*aria-label="Close"/.test(modal) && /if \(!isOpen \|\| required\) return/.test(modal) && /onClick=\{required \? undefined : onClose\}/.test(modal) && /s\.requiredMessage/.test(modal) && /signOut\(\)/.test(modal));
  ok("the window names the last-5 rule under the new-password box and says that a new password is valid for the number of days from the server", /any of your last 5 passwords/.test(modal) && /valid for \{days\} days/.test(modal) && /validDays/.test(modal));
  const top = src("src/components/TopBar.tsx");
  ok("after sign-in the top bar asks the server once per ticket and, when the password has run out, opens the window by itself in its closed-in form; finishing clears it", /fetch\("\/api\/account\/password"/.test(top) && /d\?\.required\) \{ setPasswordRequired\(true\); setIsPasswordOpen\(true\)/.test(top) && /required=\{passwordRequired\} onChanged=\{\(\) => setPasswordRequired\(false\)\}/.test(top) && /\}, \[userTicket\]\)/.test(top));
  const route = src("src/app/api/account/password/route.ts");
  ok("the route changes the hash and records the change in ONE transaction, reads the last 5 from the records, and fails closed on the code (never open) when the OTP is on", /ds\.transaction\(/.test(route) && /recordChange\(/.test(route) && /history: async/.test(route) && /return od \? verifyOtp\(od, t, code\) : \{ ok: false/.test(route));
  const otpRoute = src("src/app/api/account/password/otp/route.ts");
  ok("the code route answers 404 while the OTP is off, takes no destination from the request (only the person's own record), and is limited", /if \(!PASSWORD_MODULE_ENABLED \|\| !config\(\)\.on\) return fail\(404/.test(otpRoute) && /destinationOf\(ticket\)/.test(otpRoute) && !/request\.json|searchParams|formData/.test(otpRoute) && /createLimiter\(\{ max: 6/.test(otpRoute) && /sameOrigin\(/.test(otpRoute));
  ok("the OTP switch is documented, off by default, in .env.example", /PASSWORD_OTP=\n/.test(src(".env.example")) && /BUILT BUT OFF/.test(src(".env.example")));
  console.log(`passwordLife selftest: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
void main();
