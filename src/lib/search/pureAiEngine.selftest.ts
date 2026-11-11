// src/lib/search/pureAiEngine.selftest.ts
// Run with: npx tsx src/lib/search/pureAiEngine.selftest.ts
//
// DETERMINISTIC: no .env is loaded and no model is called (the router test passes the model's raw text in). The
// first version of this file loaded .env.local, so its language cases hit the live model or a keyword fallback
// depending on what was configured; it also pinned snapshot counts. Every defect found in the 7 Nov 2026 review is
// a regression check below.

import { DOCTOR_POOL } from "../hospital/engine";
import { parseQueryWithLlm, executePureHospital, findDoctors, nameTokens, dayFrom } from "./pureAiEngine";

let pass = 0;
let fail = 0;
function ok(name: string, cond: boolean, extra = "") {
  if (cond) pass++;
  else {
    fail++;
    console.error(`FAIL: ${name} ${extra}`);
  }
}
const gone = (p: { status: string }) => p.status === "retired" || p.status === "transferred";

async function main() {
  // ---------------------------------------------------------------- hospital lists
  const perm = executePureHospital({ action: "list_doctors", employment: "permanent" });
  const expectPerm = DOCTOR_POOL.filter((p) => !gone(p) && p.employment !== "contractual" && p.status !== "not_on_list").length;
  ok("permanent list: title", perm?.card?.title === "Permanent doctors");
  ok("permanent list: count equals the staff list's own count", perm?.card?.table?.rows?.length === expectPerm, `got ${perm?.card?.table?.rows?.length}, want ${expectPerm}`);
  ok("permanent list: Ticket column", perm?.card?.table?.columns?.includes("Ticket") ?? false);

  const contr = executePureHospital({ action: "list_doctors", employment: "contractual" });
  const expectContr = DOCTOR_POOL.filter((p) => !gone(p) && p.employment === "contractual").length;
  ok("non-permanent list: count", contr?.card?.table?.rows?.length === expectContr);
  ok("non-permanent list: List number column", contr?.card?.table?.columns?.includes("List number") ?? false);

  // ---------------------------------------------------------------- qualification is a WHOLE word (MD is not MDS)
  const md = executePureHospital({ action: "list_doctors", qualification: "MD" });
  const mdRows = md?.card?.table?.rows ?? [];
  ok("MD list: not empty", mdRows.length > 0);
  ok("MD list: no row holds only MDS (a dentist)", mdRows.every((r) => !/\bMDS\b/i.test(r[3]) || /\bMD\b/i.test(r[3].replace(/\bMDS\b/gi, ""))), JSON.stringify(mdRows.filter((r) => /\bMDS\b/i.test(r[3]))));
  ok("MD list: every row's printed qualification contains the word MD", mdRows.every((r) => /(^|[^A-Z])MD([^A-Z]|$)/i.test(r[3])));
  const ms = executePureHospital({ action: "list_doctors", qualification: "MS" });
  ok("MS list: no MSc / MS-less rows", (ms?.card?.table?.rows ?? []).every((r) => /(^|[^A-Z])MS([^A-Z]|$)/i.test(r[3])));
  const dnb = executePureHospital({ action: "list_doctors", employment: "permanent", qualification: "DNB" });
  ok("DNB on roll: card has NO notes (no fat)", dnb?.card?.notes === undefined);

  // ---------------------------------------------------------------- doctor lookup
  const k = executePureHospital({ action: "doctor_schedule", doctorName: "karmakar" });
  ok("Karmakar: found", !!k && (k.card.title ?? "").includes("Karmakar"));
  ok("Karmakar: sits Monday and Thursday", k?.summary?.includes("Monday and Thursday") ?? false);
  ok("Karmakar: table row 0 starts with the doctor", (k?.card?.table?.rows?.[0]?.[0] ?? "").startsWith("Dr. "));

  // a name made only of filler ("I") is NO doctor: it must never match somebody by substring
  const filler = executePureHospital({ action: "doctor_schedule", doctorName: "I", rawQuery: "where can I see a doctor" });
  ok('filler name "I" is no doctor: nothing is answered (the original pipeline continues)', filler === null, filler?.summary);
  ok("nameTokens drops pronouns and filler", nameTokens("can I see dr karmakar please").join(",") === "karmakar");
  ok("findDoctors: a short fragment does not match inside a longer name", findDoctors("ohit").length === 0);
  ok("findDoctors: nothing for filler only", findDoctors("i").length === 0);

  // two doctors share a word: ASK, never pick the first
  const parts = new Map<string, number>();
  for (const p of DOCTOR_POOL.filter((x) => !gone(x))) for (const w of new Set(p.name.toLowerCase().split(/[^a-z]+/).filter((x) => x.length >= 4))) parts.set(w, (parts.get(w) ?? 0) + 1);
  const shared = [...parts.entries()].find(([, n]) => n >= 2)?.[0];
  if (shared) {
    const r = executePureHospital({ action: "doctor_schedule", doctorName: shared });
    const cands = findDoctors(shared);
    if (cands.length > 1) ok(`shared name "${shared}" asks "Which doctor?"`, r?.card?.title === "Which doctor?", r?.card?.title);
  }
  const nobody = executePureHospital({ action: "doctor_schedule", doctorName: "zzqx" });
  ok("unknown doctor: says so", /could not find/i.test(nobody?.summary ?? ""));

  // ---------------------------------------------------------------- days: checked, never assumed
  const tue = executePureHospital({ action: "doctor_schedule", doctorName: "karmakar", rawQuery: "is dr karmakar there at 5pm on tuesday" });
  ok("Karmakar on Tuesday at 5pm: NO (he sits Monday and Thursday)", tue?.summary?.startsWith("No") ?? false, tue?.summary);
  ok("...and the tone is closed", tue?.card?.status?.tone === "closed");
  const thuShort = executePureHospital({ action: "doctor_schedule", doctorName: "karmakar", weekday: "Thu" });
  ok('weekday "Thu" is Thursday: Yes', thuShort?.summary?.startsWith("Yes") ?? false, thuShort?.summary);
  const thuFull = executePureHospital({ action: "doctor_schedule", doctorName: "karmakar", weekday: "Thursday" });
  ok("weekday Thursday: Yes", thuFull?.summary?.startsWith("Yes") ?? false);
  const noDay = executePureHospital({ action: "doctor_schedule", doctorName: "karmakar", rawQuery: "Can I consult with Dr. Karmakar with token after 5 pm?" });
  ok("token/5pm without a day: NO unconditional 'Yes, you can consult'", !/^Yes/.test(noDay?.summary ?? "") && !/you can consult/i.test(noDay?.summary ?? ""), noDay?.summary);
  ok("token/5pm: hours come from the schedule data", (noDay?.card?.lines ?? []).some((l) => /OPD hours:/.test(l)) && (noDay?.card?.lines ?? []).some((l) => /afternoon OPD/i.test(l)));
  ok("token/5pm: honest that the session of the day is not in the data", (noDay?.card?.lines ?? []).some((l) => /not the session/i.test(l)));
  const noTok = executePureHospital({ action: "doctor_schedule", doctorName: "karmakar", rawQuery: "Can I consult with Dr. Karmakar without a token after 5pm?" });
  ok("without a token: nothing invented ('mandatory')", !/mandatory/i.test(JSON.stringify(noTok)));
  ok("dayFrom", dayFrom("thu") === "thursday" && dayFrom("Thursdays") === "thursday" && dayFrom("x") === null && dayFrom("hello") === null);

  // ---------------------------------------------------------------- departments and timings
  const med = executePureHospital({ action: "department_opd", department: "Medicine" });
  ok("Medicine OPD at a glance", med?.card?.title === "Medicine OPD at a glance" && (med?.card?.table?.rows?.length ?? 0) >= 3);
  const chest = executePureHospital({ action: "department_opd", department: "Chest" });
  ok("Chest OPD: no hard-coded room numbers or doctor names", !/OPD 4|OPD 25|Karmakar/.test(JSON.stringify(chest ?? {})), chest?.summary);
  const sunday = executePureHospital({ action: "department_opd", department: "Medicine", rawQuery: "medicine opd on sunday" });
  ok("Sunday: the OPD is closed", /closed/i.test(sunday?.summary ?? ""), sunday?.summary);
  const tim = executePureHospital({ action: "timings" });
  ok("timings come from the data", (tim?.card?.lines ?? []).some((l) => /OPD hours: .*8:00 AM|OPD hours: .*8 AM/i.test(l)), JSON.stringify(tim?.card?.lines));

  // ---------------------------------------------------------------- the router: a guess must never replace the original pipeline
  let called = 0;
  const llm = (json: string) => async () => {
    called++;
    return json;
  };
  const fails = async () => {
    called++;
    throw new Error("model unavailable");
  };
  ok('model unavailable: "MD approval for gate pass" -> null (not the hospital list)', (await parseQueryWithLlm("MD approval for gate pass", { llm: fails })) === null);
  ok('model unavailable: "what is dr reddys policy" -> null', (await parseQueryWithLlm("what is dr reddys policy", { llm: fails })) === null);
  ok('model unavailable: "list engineers in coke ovens" -> null', (await parseQueryWithLlm("list engineers in coke ovens", { llm: fails })) === null);
  ok("invalid JSON -> null", (await parseQueryWithLlm("anything", { llm: llm("not json") })) === null);
  ok("empty object -> null", (await parseQueryWithLlm("anything", { llm: llm("{}") })) === null);
  ok("unknown tool -> null", (await parseQueryWithLlm("anything", { llm: llm('{"tool":"drop_tables"}') })) === null);

  const good = await parseQueryWithLlm("on which day can I see dr karmakar", {
    llm: llm('{"tool":"hospital","reasoning":"doctor","params":{"action":"doctor_schedule","doctorName":"karmakar","weekday":"thu","evil":"x","employment":"nonsense"}}'),
  });
  ok("valid hospital call is accepted", good?.tool === "hospital" && good.params.doctorName === "karmakar");
  ok("weekday normalised to a day name", good?.params.weekday === "thursday");
  ok("unknown parameters and invalid enum values are dropped", good?.params.evil === undefined && good?.params.employment === undefined);
  ok("raw query is kept for the executor", good?.params.rawQuery === "on which day can I see dr karmakar");

  const notConv = await parseQueryWithLlm("how do I repay pf", { llm: llm('{"tool":"circular_search","params":{"topic":"pf repayment"},"conversationalReply":"<script>alert(1)</script>"}') });
  ok("a reply is kept ONLY for the conversational tool", notConv?.conversationalReply === null);
  const longReply = await parseQueryWithLlm("what can you do now please", { llm: llm(`{"tool":"conversational","params":{"reply":"${"x".repeat(2000)}"}}`) });
  ok("the conversational reply is read from params.reply and capped", (longReply?.conversationalReply ?? "").length === 400);

  const before = called;
  ok("a question with a ticket number is never sent to the model", (await parseQueryWithLlm("who is 498301", { llm: llm('{"tool":"hospital"}') })) === null && called === before);
  ok("a question with a phone number is never sent to the model", (await parseQueryWithLlm("whose number is 9434791234", { llm: llm('{"tool":"hospital"}') })) === null && called === before);
  const hi = await parseQueryWithLlm("hello", { llm: fails });
  ok("a bare greeting needs no model", hi?.tool === "conversational");
  ok('"help me find quarters retention rules" is NOT a greeting', (await parseQueryWithLlm("help me find quarters retention rules", { llm: fails })) === null);

  console.log(`pureAiEngine selftest: ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
