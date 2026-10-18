/** Self-test of the replay of logged answer attempts. Run: npx tsx --tsconfig tsconfig.json src/lib/search/answerReplay.selftest.ts (no model, no network). */
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendAnswerLog, logAnswer } from "./answerLog";
import { parseJsonl, replay } from "./answerReplay";
import type { Passage } from "./circularAnswer";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };

const text = readFileSync(join(__dirname, "__fixtures__", "answer-replies.jsonl"), "utf8");
const attempts = parseJsonl(text);
ok("the fixture holds the three real replies of 18 Oct", attempts.length === 3 && attempts.every((a) => a.passages.length >= 1 && a.reply.startsWith("{")), String(attempts.length));
const r = replay(attempts);
ok("REAL REPLIES: all three, refused when they were logged, are accepted by the current rules", r.summary.refusedThenAccepted === 3 && r.summary.nowRefused === 0 && r.summary.acceptedThenRefused === 0, JSON.stringify(r.summary));
ok("...the gift card with its labels tied to the document, the mediclaim and sports answers with the assistant's own wording marked", r.rows[0].looseRows === 0 && r.rows[1].looseRows === 2 && r.rows[2].looseRows === 2, JSON.stringify(r.rows.map((x) => x.looseRows)));
ok("each row says what happened when it was logged", r.rows[1].before.includes("last date of renewal") && r.rows[2].before.includes("Event dates"));

// a half-written last line and junk lines are skipped
ok("a half-written last line is skipped", parseJsonl(text + '{"question":"half').length === 3 && parseJsonl("\n\nnot json\n").length === 0);

// the regression signal: an attempt that was accepted and is refused NOW must be counted
const falseClaim = JSON.stringify({ question: "x", ok: true, reply: JSON.stringify({ answerable: true, title: "T", note: "", rows: [{ label: "Last date", column: "Last date", value: "Rs.14,999/-", source: 1, quote: 'may please be read as "Rs.14,999/-"' }] }), passages: attempts[0].passages });
const reg = replay(parseJsonl(falseClaim));
ok("an attempt logged as accepted and refused now is counted as a regression", reg.summary.acceptedThenRefused === 1 && /says a date but the value/.test(reg.rows[0].now), JSON.stringify(reg.summary));
const unreadable = replay([{ question: "u", ok: true, reply: "not json at all", passages: attempts[0].passages }]);
ok("an unreadable model reply is a refusal, not a crash", unreadable.summary.nowRefused === 1);

// the log: written only when asked, one line per attempt, never breaks an answer
const dir = mkdtempSync(join(tmpdir(), "alog-"));
const file = join(dir, "sub", "answers.jsonl");
const passage: Passage = attempts[0].passages[0];
delete process.env.ANSWER_LOG_FILE;
logAnswer("q", [passage], { ok: false, reason: "unverified: x", reply: "{}" });
ok("nothing is written without ANSWER_LOG_FILE", readdirSync(dir).length === 0);
process.env.ANSWER_LOG_FILE = file;
logAnswer("q1", [passage], { ok: false, reason: "unverified: x", reply: '{"a":1}' });
logAnswer("q2", [passage], { ok: false, reason: "no_passages" });
appendAnswerLog(file, { at: "t", question: "q3", ok: true, reply: "{}", passages: [passage] });
const lines = readFileSync(file, "utf8").trim().split("\n");
ok("an attempt with a model reply is logged, one JSON line each, in a folder made on demand", lines.length === 2 && JSON.parse(lines[0]).question === "q1" && JSON.parse(lines[0]).reason === "unverified: x" && JSON.parse(lines[0]).passages[0].id === passage.id, String(lines.length));
ok("an attempt with no model reply (nothing to replay) is not logged", !lines.some((l) => JSON.parse(l).question === "q2"));
process.env.ANSWER_LOG_FILE = join(dir, "file-is-a-folder");
appendAnswerLog(join(dir, "sub"), { at: "t", question: "bad", ok: true, reply: "{}", passages: [] });
ok("a log that cannot be written never throws", true);
delete process.env.ANSWER_LOG_FILE;
rmSync(dir, { recursive: true, force: true });

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
