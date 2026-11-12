// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/lib/tools/calcEngine.selftest.ts
import { initialState, press, setMode, displayNumber, pendingText, keyFor, recall, type CalcState, type Key, type Mode } from "./calcEngine";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };

/** press a run of keys written like "2+3*4=": digits and the usual signs, plus words for the others, separated by spaces: "5 fact" */
const MAP: Record<string, Key> = { "+": "add", "-": "sub", "*": "mul", "/": "div", "=": "eq", "(": "lp", ")": "rp", "^": "pow", "%": "pct", ".": ".", "~": "neg" };
function run(keys: string, mode: Mode = "basic", from?: CalcState): CalcState {
  let s = from ?? initialState(mode);
  for (const tok of keys.trim().split(/\s+/)) {
    const list = /^[0-9.+\-*/=()^%~]+$/.test(tok) ? tok.split("") : [tok];
    for (const k of list) s = press(s, (MAP[k] ?? k) as Key);
  }
  return s;
}
const show = (s: CalcState) => s.error ?? s.entry;

ok("basic: immediate execution, 2 + 3 × 4 = 20", show(run("2+3*4=")) === "20");
ok("scientific: precedence, 2 + 3 × 4 = 14; (2 + 3) × 4 = 20; 2 ^ 3 ^ 2 = 512", show(run("2+3*4=", "sci")) === "14" && show(run("(2+3)*4=", "sci")) === "20" && show(run("2^3^2=", "sci")) === "512");
ok("basic: a chain shows each running total: 2 + 3 + shows 5", show(run("2+3+")) === "5" && show(run("2+3+4=")) === "9");
ok("an operator pressed twice is changed, not added: 5 + × 3 = 15", show(run("5+*3=")) === "15");
ok("'=' again repeats the last operation: 2 + 3 = = is 8, 10 × 2 = = = is 80", show(run("2+3==")) === "8" && show(run("10*2===")) === "80");
ok("'2 + =' uses the number shown twice: 4", show(run("2+=")) === "4");
ok("decimals are cleaned: 0.1 + 0.2 = 0.3; 1 ÷ 3 shows 12 digits", show(run("0.1+0.2=")) === "0.3" && show(run("1/3=")) === "0.333333333333");
ok("a typed number grows, a second dot is ignored, a leading dot gives 0.", show(run("12.5.5")) === "12.55" && show(run("12.55")) === "12.55" && show(run(".5")) === "0.5" && show(run("1..2")) === "1.2");
ok("the sign key: 5 ± is -5, ± again is 5; zero stays zero", show(run("5~")) === "-5" && show(run("5~~")) === "5" && show(run("0~")) === "0");
ok("the percent of the pocket calculator: 200 + 10 % = 220, 200 × 10 % = 20, 50 % = 0.5, 200 - 10 % = 180", show(run("200+10%=")) === "220" && show(run("200*10%=")) === "20" && show(run("50%")) === "0.5" && show(run("200-10%=")) === "180");
ok("backspace deletes the last digit, down to 0; it does nothing to a result", show(run("123 back")) === "12" && show(run("5 back")) === "0" && show(run("2+3= back")) === "5" && show(run("-", "basic")) === "0");
ok("C clears the number being typed, AC clears everything (the memory stays)", (() => { const a = run("2+34 ac"); const b = run("2+34 ac ac"); return a.entry === "0" && a.stack.length === 2 && b.stack.length === 0 && run("5 mplus 7 ac ac").memory === 5; })());
ok("division by zero is an error that the next digit clears: 5 ÷ 0 =", (() => { const e = run("5/0="); return e.error === "Cannot divide by zero" && show(press(e, "7")) === "7"; })());
ok("memory: m+ adds, m- takes away, mr recalls, mc clears", (() => { let s = run("5 mplus 3 mplus 2 mminus"); const m = s.memory; s = run("mr", "basic", s); return m === 6 && s.entry === "6" && run("mc", "basic", s).memory === 0; })());
ok("x², x³, √, ∛, 1/x act on the number shown at once", show(run("7 sq")) === "49" && show(run("3 cube")) === "27" && show(run("81 sqrt")) === "9" && show(run("27 cbrt")) === "3" && show(run("8 inv")) === "0.125");
ok("√ of a negative number and 1/0 are errors; ∛ of a negative number is not", run("4~ sqrt").error === "Not a number" && run("0 inv").error === "Cannot divide by zero" && show(run("27~ cbrt")) === "-3");
ok("x!: 5! = 120, 0! = 1; a fraction or a negative number is an error", show(run("5 fact")) === "120" && show(run("0 fact")) === "1" && run("2.5 fact").error !== null && run("3~ fact").error !== null);
ok("sin, cos, tan in degrees: sin 30 = 0.5, cos 60 = 0.5, tan 45 = 1, sin 180 = 0, cos 90 = 0; tan 90 is an error", show(run("30 sin")) === "0.5" && show(run("60 cos")) === "0.5" && show(run("45 tan")) === "1" && show(run("180 sin")) === "0" && show(run("90 cos")) === "0" && run("90 tan").error !== null);
ok("in radians: sin of π/2 is 1; the angle key switches both ways", (() => { let s = run("degrad"); s = run("pi / 2 = sin", "basic", s); return s.deg === false && show(s) === "1"; })());
ok("the inverse trig functions answer in the angle unit: asin 0.5 = 30°, acos 0.5 = 60°, atan 1 = 45°; asin 2 is an error", show(run("0.5 asin")) === "30" && show(run("0.5 acos")) === "60" && show(run("1 atan")) === "45" && run("2 asin").error !== null);
ok("hyperbolic and inverse hyperbolic: sinh 0 = 0, cosh 0 = 1, tanh 0 = 0, asinh 0 = 0, acosh 1 = 0; acosh 0.5 is an error", show(run("0 sinh")) === "0" && show(run("0 cosh")) === "1" && show(run("0 tanh")) === "0" && show(run("0 asinh")) === "0" && show(run("1 acosh")) === "0" && run("0.5 acosh").error !== null);
ok("logs and powers: ln e = 1, log 1000 = 3, log₂ 8 = 3, e^0 = 1, 10^3 = 1000, 2^10 = 1024; ln 0 is an error", show(run("e ln")) === "1" && show(run("1000 log10")) === "3" && show(run("8 log2")) === "3" && show(run("0 exp")) === "1" && show(run("3 tenx")) === "1000" && show(run("10 twox")) === "1024" && run("0 ln").error !== null);
ok("x^y, ʸ√x and log_y: 2 ^ 10 = 1024; 27 ʸ√x 3 = 3; 8 log_y 2 = 3; 16 ʸ√x 4 = 2", show(run("2^10=", "sci")) === "1024" && show(run("27 root 3 =", "sci")) === "3" && show(run("8 logy 2 =", "sci")) === "3" && show(run("16 root 4 =", "sci")) === "2");
ok("brackets nest and close by themselves at '=': 2 × (3 + (4 × 5)) = 46; 2 × (3 + 4 = 14", show(run("2*(3+(4*5))=", "sci")) === "46" && show(run("2*(3+4=", "sci")) === "14");
ok("a closing bracket with none open does nothing; brackets are for the scientific mode only", show(run("5)", "sci")) === "5" && run("(", "basic").stack.length === 0);
ok("a result of a bracket takes part in what follows: (1 + 2) × 3 + 4 = 13", show(run("(1+2)*3+4=", "sci")) === "13");
ok("EE: 1.5 EE 3 = 1500; 2 EE 3 × 2 = 4000; EE with nothing typed means 1e", show(run("1.5 ee 3 =")) === "1500" && show(run("2 ee 3 * 2 =")) === "4000" && show(run("ee 3 =")) === "1000");
ok("pi and e are numbers: π × 2 = 6.28318530718; π is 3.14159265359", show(run("pi * 2 =")) === "6.28318530718" && show(run("pi")) === "3.14159265359");
ok("Rand gives the number it is handed", press(initialState(), "rand", 0.25).entry === "0.25");
ok("huge and tiny results go to an exponent: 10 ^ 20 and 1 ÷ 10 ^ 10", show(run("10^20=", "sci")) === "1e+20" && show(run("1/10^10=", "sci")).includes("e-10"));
ok("digits stop at 15", show(run("1234567890123456789")).length === 15);
ok("the pending work is shown: 2 + ( 3 ×", pendingText(run("2+(3*", "sci")) === "2 + ( 3 ×");
ok("numbers are shown in Indian grouping: 12,34,567.5; 999; -1,00,000; an exponent as it is", displayNumber("1234567.5") === "12,34,567.5" && displayNumber("999") === "999" && displayNumber("-100000") === "-1,00,000" && displayNumber("1e+20") === "1e+20" && displayNumber("0.") === "0.");
ok("the history keeps what was calculated, newest last, 30 at most, and holds no more than text", (() => { const s = run("2+3= 4*5=", "basic"); return s.history.length === 2 && s.history[0].expr === "2 + 3" && s.history[0].result === "5" && s.history[1].expr === "4 × 5" && s.history[1].result === "20"; })());
ok("changing the mode drops the pending work but keeps the number and the memory", (() => { let s = run("5 mplus 2+", "basic"); s = setMode(s, "sci"); return s.mode === "sci" && s.stack.length === 0 && s.memory === 5 && s.entry === "2"; })());
ok("2nd only toggles; the keys it chooses between are the screen's business", (() => { const s = press(initialState("sci"), "second"); return s.second === true && press(s, "second").second === false; })());
ok("a very long chain stays correct: 1 + 2 + … + 100 = 5050", (() => { let s = initialState(); for (let i = 1; i <= 100; i++) { for (const ch of String(i)) s = press(s, ch as Key); s = press(s, i === 100 ? "eq" : "add"); } return show(s) === "5050"; })());

ok("the keyboard: digits, signs, Enter, Backspace, Delete, and no key at all for a Ctrl or Cmd shortcut or a letter that is not ours", keyFor("7") === "7" && keyFor("+") === "add" && keyFor("-") === "sub" && keyFor("*") === "mul" && keyFor("x") === "mul" && keyFor("/") === "div" && keyFor("Enter") === "eq" && keyFor("=") === "eq" && keyFor("Backspace") === "back" && keyFor("Delete") === "ac" && keyFor("%") === "pct" && keyFor("(") === "lp" && keyFor("^") === "pow" && keyFor(",") === "." && keyFor("c", true) === null && keyFor("v", true) === null && keyFor("q") === null && keyFor("Tab") === null);
ok("a result from the history can be put back", (() => { const s = recall(run("2+3="), "42"); return s.entry === "42" && s.fresh && !s.awaiting; })());
console.log(`calcEngine selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
