// scripts/set-user-password.ts
//
// GIVE ONE ACCOUNT A NEW PASSWORD (the first password of every account is the person's SAIL P.No., which many people know: the HOD's was in the code and in the user manual, and is to be changed).
// The password is read from the keyboard (typed twice, not shown, never put on the command line, never in a file), hashed with bcrypt exactly as the sign-in checks it, and written to that one account.
//
//   npx tsx --env-file=.env.local scripts/set-user-password.ts 498301            asks for the new password twice, shows the person's name, asks "yes", then writes
//   npx tsx --env-file=.env.local scripts/set-user-password.ts 498301 --check    only shows who the ticket is (nothing is written)
//
// Needs DATABASE_URL (or DIRECT_DATABASE_URL). The new password must be at least 10 characters, and not the same as the person's P.No. The old password stops working at once; a session already open stays open
// until it ends (24 hours at most). Nothing here changes any other account.

import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import { Client } from "pg";
import bcrypt from "bcryptjs";

const ticket = (process.argv[2] ?? "").trim();
const checkOnly = process.argv.includes("--check");
if (!/^\d{6}$/.test(ticket)) { console.error("Usage: set-user-password.ts <six-digit ticket> [--check]"); process.exit(2); }

function ask(prompt: string, hidden: boolean): Promise<string> {
  return new Promise((resolve) => {
    let muted = false;
    const out = new Writable({ write(chunk, _e, cb) { if (!muted) process.stdout.write(chunk); cb(); } });
    const rl = createInterface({ input: process.stdin, output: out, terminal: true });
    rl.question(prompt, (a) => { rl.close(); if (hidden) process.stdout.write("\n"); resolve(a); });
    muted = hidden;
  });
}

async function main() {
  const url = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) { console.error("DATABASE_URL is not set (use --env-file=.env.local)."); process.exit(2); }
  const db = new Client({ connectionString: url, ssl: /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: false } });
  await db.connect();
  try {
    const r = await db.query(`SELECT id, name, "sailPNo" AS pno FROM public."user" WHERE "ticketNo" = $1`, [ticket]);
    if (r.rows.length !== 1) { console.error(`Ticket ${ticket}: ${r.rows.length === 0 ? "no such account" : "more than one account (not changed)"}.`); process.exit(1); }
    const who = r.rows[0] as { id: string; name: string; pno: string | null };
    console.log(`Ticket ${ticket} is ${who.name}.`);
    if (checkOnly) return;
    const a = await ask("New password (not shown): ", true);
    const b = await ask("Again: ", true);
    if (a !== b) { console.error("The two are not the same. Nothing was changed."); process.exit(1); }
    if (a.length < 10) { console.error("Use at least 10 characters. Nothing was changed."); process.exit(1); }
    if (who.pno && a.trim().toLowerCase() === who.pno.trim().toLowerCase()) { console.error("That is the person's SAIL P.No. Choose something else. Nothing was changed."); process.exit(1); }
    if ((await ask(`Change the password of ${who.name} (${ticket})? Type yes: `, false)).trim().toLowerCase() !== "yes") { console.log("Cancelled. Nothing was changed."); return; }
    const hash = await bcrypt.hash(a, 10);
    const u = await db.query(`UPDATE public."user" SET password = $1 WHERE id = $2`, [hash, who.id]);
    console.log(u.rowCount === 1 ? "Done: the new password is set." : "Nothing was updated.");
  } finally {
    await db.end();
  }
}
main().catch((e) => { console.error("Failed:", e instanceof Error ? e.message : e); process.exit(1); });
