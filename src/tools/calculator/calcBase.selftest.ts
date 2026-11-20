// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/tools/calculator/calcBase.selftest.ts
// The number bases of the scientific calculator: BIN, OCT, HEX and DEC; whole numbers only, nothing rounded; the keys a base does not have do nothing; the typed line that opens the calculator on a number in a base.
import { initialState, press, setBase, setMode, startAt, enabled, keyFor, recall, inAllBases, displayNumber, pendingText, historyResult, toBaseText, type Base, type CalcState, type Key } from "./calcEngine";
import { parseBaseLine } from "./numberBase";
import { detectTool } from "@/lib/tools/detect";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };

const MAP: Record<string, Key> = { "+": "add", "-": "sub", "*": "mul", "/": "div", "=": "eq", "(": "lp", ")": "rp", "^": "pow", "~": "neg", ".": "." };
/** press a run of keys: digits, A-F (as digits when the calculator is in HEX), the signs, and words for the others */
function run(keys: string, from: CalcState): CalcState {
  let s = from;
  for (const tok of keys.trim().split(/\s+/)) {
    const list = /^[0-9A-F.+\-*/=()^~]+$/.test(tok) && !/^(?:mc|mr)$/.test(tok) ? tok.split("") : [tok];
    for (const k of list) s = press(s, (/^[A-F]$/.test(k) ? `h${k}` : MAP[k] ?? k) as Key);
  }
  return s;
}
const sci = (b: Base = 10, from?: string): CalcState => { const s = setMode(initialState("basic"), "sci"); return b === 10 ? s : setBase(from ? run(from, s) : s, b); };

// the switch
ok("a new calculator is decimal; the basic calculator has no base to change (setBase does nothing there)", initialState("sci").base === 10 && setBase(initialState("basic"), 2).base === 10);
ok("the entry is the same value written in the new base: 255 -> HEX FF, BIN 11111111, OCT 377, and back to DEC 255", (() => { let s = run("255", sci()); s = setBase(s, 16); const a = s.entry; s = setBase(s, 2); const b = s.entry; s = setBase(s, 8); const c = s.entry; s = setBase(s, 10); return a === "FF" && b === "11111111" && c === "377" && s.entry === "255"; })());
ok("a fraction cannot be written in BIN, OCT or HEX: 2.5 gives the error 'Whole numbers only' and is not rounded; DEC is left as it was by AC", (() => { const s = setBase(run("2.5", sci()), 2); return s.error === "Whole numbers only" && s.base === 10; })());
ok("a fraction waiting among the working numbers is refused too: 0.5 + then BIN is an error", setBase(run("0.5+", sci()), 2).error === "Whole numbers only");
ok("a negative number keeps its sign: -10 -> HEX -A -> DEC -10", (() => { let s = run("10 neg", sci()); s = setBase(s, 16); const a = s.entry; s = setBase(s, 10); return a === "-A" && s.entry === "-10"; })());
ok("leaving the scientific calculator for the basic one puts the number back in decimal: HEX FF -> basic 255", (() => { const s = setMode(setBase(run("255", sci()), 16), "basic"); return s.base === 10 && s.entry === "255" && s.mode === "basic"; })());

// typing digits
ok("BIN takes only 0 and 1 (a 2 or a 9 does nothing), OCT takes 0-7, HEX takes 0-9 and A-F", (() => { const b = run("1 2 0 9 1", sci(2)); const o = run("7 8 9 1", sci(8)); const h = run("1 F A 9", sci(16)); return b.entry === "101" && o.entry === "71" && h.entry === "1FA9"; })());
ok("a letter is not a digit in DEC, BIN or OCT: the A key does nothing there", ["10", "2", "8"].every((b) => run("5 A", sci(Number(b) as Base)).entry === (b === "2" ? "0" : "5")));
ok("which keys mean something: DEC all but A-F; BIN 0 and 1; OCT 0-7; HEX every digit and A-F", enabled({ base: 10 }, "9") && !enabled({ base: 10 }, "hA") && enabled({ base: 2 }, "1") && !enabled({ base: 2 }, "2") && enabled({ base: 8 }, "7") && !enabled({ base: 8 }, "8") && enabled({ base: 16 }, "9") && enabled({ base: 16 }, "hF") && !enabled({ base: 2 }, "hA"));
ok("in BIN, OCT and HEX the keys that make fractions are off (point, EE, percent, sin, √, 1/x, π, Rand, ln, 10ˣ, Rad) and the whole-number keys stay on", [2, 8, 16].every((b) => (["." , "ee", "pct", "sin", "cosh", "sqrt", "inv", "pi", "e", "rand", "ln", "log10", "tenx", "twox", "degrad", "root", "logy", "cbrt", "atan"] as Key[]).every((k) => !enabled({ base: b as Base }, k)) && (["add", "sub", "mul", "div", "pow", "sq", "cube", "fact", "eq", "lp", "rp", "neg", "back", "ac", "mr", "mplus"] as Key[]).every((k) => enabled({ base: b as Base }, k))));
ok("a key that is off does nothing to the state (a sine in HEX, a point in BIN)", (() => { const s = run("1 F", sci(16)); return press(s, "sin") === s && press(sci(2), ".").entry === "0" && press(s, "pi") === s; })());
ok("the number stops growing before it passes 2^53 - 1 (the largest whole number a float holds exactly): 53 ones in BIN, then a 54th does nothing", (() => { const s = run("1".repeat(54), sci(2)); return s.entry === "1".repeat(53); })());
ok("the keyboard: in HEX the letters a-f (either case) are digits; elsewhere they are not (c stays Clear in DEC)", keyFor("a", false, 16) === "hA" && keyFor("F", false, 16) === "hF" && keyFor("c", false, 16) === "hC" && keyFor("c", false, 10) === "ac" && keyFor("a", false, 2) === null && keyFor("7", false, 2) === "7");

// arithmetic in a base
ok("HEX: FF + 1 = 100; A × B = 6E; BIN: 1010 + 11 = 1101; OCT: 77 + 1 = 100", run("F F + 1 =", sci(16)).entry === "100" && run("A * B =", sci(16)).entry === "6E" && run("1010+11=", sci(2)).entry === "1101" && run("77+1=", sci(8)).entry === "100");
ok("precedence and brackets work in a base: HEX 2 + 3 × 4 = E; (2 + 3) × 4 = 14", run("2+3*4=", sci(16)).entry === "E" && run("(2+3)*4=", sci(16)).entry === "14");
ok("a power, a square, a cube and a factorial: HEX 2 ^ 8 = 100; BIN 11 x² = 1001; OCT 3 x³ = 33; HEX 5 x! = 78", run("2^8=", sci(16)).entry === "100" && run("11 sq", sci(2)).entry === "1001" && run("3 cube", sci(8)).entry === "33" && run("5 fact", sci(16)).entry === "78");
ok("a division that comes out whole is shown: HEX 64 ÷ A = A; one that does not is an error, not a rounded number: BIN 111 ÷ 10 = 'Whole numbers only'", run("6 4 / A =", sci(16)).entry === "A" && run("111/10=", sci(2)).error === "Whole numbers only");
ok("a negative result carries its sign: HEX 1 - 2 = -1; and a number too large for a float to hold is refused, not shown wrong: HEX 1FFFFFFFFFFFFF × 2 = 'Too large for this base'", run("1-2=", sci(16)).entry === "-1" && run("1 F F F F F F F F F F F F F * 2 =", sci(16)).error === "Too large for this base");
ok("memory works in a base: HEX FF m+ , 0 , mr shows FF", (() => { let s = run("F F mplus", sci(16)); s = run("0 mr", s); return s.entry === "FF"; })());
ok("an error is cleared by the next digit and the base is kept: HEX error, then 1 -> HEX 1", (() => { let s = run("1/0 =", sci(16)); s = run("1", s); return s.base === 16 && s.entry === "1" && !s.error; })());
ok("repeated = repeats the last operation in the base: HEX 10 + 1 = = is 12", run("1 0 + 1 = =", sci(16)).entry === "12");

// how it is written
ok("the digits are grouped for reading: BIN and HEX in fours from the right, OCT in threes, DEC in the Indian way", displayNumber("11111111", 2) === "1111 1111" && displayNumber("1FA9", 16) === "1FA9" && displayNumber("12FA9", 16) === "1 2FA9" && displayNumber("-7777", 8) === "-7 777" && displayNumber("1234567") === "12,34,567");
ok("the value in all four bases: 255 is 255 · FF · 377 · 1111 1111 in the order DEC, BIN, OCT, HEX; a fraction or a number too large gives null", (() => { const a = inAllBases(255); return !!a && a.map((x) => `${x.label}=${x.text}`).join(" ") === "DEC=255 BIN=1111 1111 OCT=377 HEX=FF" && inAllBases(2.5) === null && inAllBases(2 ** 54) === null; })());
ok("toBaseText: a whole number, in capitals; a fraction and a huge number are errors", toBaseText(255, 16) === "FF" && toBaseText(-8, 2) === "-1000" && (() => { try { toBaseText(0.5, 2); return false; } catch { return true; } })() && (() => { try { toBaseText(2 ** 60, 2); return false; } catch { return true; } })());
ok("the pending line is written in the base: HEX F F + shows 'FF +'", pendingText(run("F F +", sci(16))) === "FF +");
ok("the history keeps the line in its own base: HEX FF + 1 = is 'FF + 1 =' with the result 100, and the value as plain decimal text (256)", (() => { const s = run("F F + 1 =", sci(16)); const h = s.history[0]; return h.expr === "FF + 1" && h.result === "256" && h.base === 16 && historyResult(h) === "100"; })());
ok("a decimal history line is shown as before (the Indian grouping)", (() => { const s = run("1 0 0 0 0 0 0 + 1 =", sci()); return historyResult(s.history[0]) === "10,00,001"; })());
ok("a history result put back in another base is written in it (256 in HEX is 100); a fraction put back in BIN is an error", recall(sci(16), "256").entry === "100" && recall(sci(2), "2.5").error === "Whole numbers only" && recall(initialState("sci"), "256").entry === "256");

// the calculator opened on a value
ok("startAt opens the scientific calculator on the value in the base: 255 in HEX is FF; a value that does not fit the base opens in decimal", (() => { const a = startAt(16, 255), b = startAt(2, 2.5); return a.mode === "sci" && a.base === 16 && a.entry === "FF" && b.base === 10 && b.entry === "2.5"; })());
ok("DEC is unchanged by all this: 12 + 30 = 42 and 0.1 + 0.2 = 0.3 in decimal, as before", run("1 2 + 3 0 =", sci()).entry === "42" && press(press(press(press(press(press(sci(), "0"), "."), "1"), "add"), "0"), ".").entry === "0.");

// the typed line
const P = parseBaseLine;
ok("0xFF, 0b1010 and 0o17 are read in their own base (and the value is right): 255, 10, 15", P("0xFF")?.value === 255 && P("0xFF")?.base === 16 && P("0b1010")?.value === 10 && P("0b1010")?.base === 2 && P("0o17")?.value === 15 && P("0o17")?.base === 8);
ok("'255 to binary', '10 in hex', '1010 binary to decimal', 'ff hex to octal', '0xFF to decimal', '0b1010 in hex' ask for the base after 'to' or 'in'", (() => { const a = P("255 to binary"), b = P("10 in hex"), c = P("1010 binary to decimal"), d = P("ff hex to octal"), e = P("0xFF to decimal"), f = P("0b1010 in hex"); return a?.value === 255 && a.base === 2 && b?.value === 10 && b.base === 16 && c?.value === 10 && c.base === 10 && d?.value === 255 && d.base === 8 && e?.value === 255 && e.base === 10 && f?.value === 10 && f.base === 16; })());
ok("a digit the base does not have is no number: 0b102, 0o18, 19 binary to hex, 0xZZ; and a bare 'ff to binary' (letters in a number not said to be hex) is not read", ["0b102", "0o18", "19 binary to hex", "0xZZ", "ff to binary", "12 binary to octal"].every((q) => P(q) === null));
ok("a number beyond 2^53 - 1 is not read (nothing is rounded): 9007199254740993 to hex; the largest, 9007199254740991, is", P("9007199254740993 to hex") === null && P("9007199254740991 to hex")?.value === 9007199254740991 && P("0x20000000000000") === null);
ok("ordinary lines are not taken for a number in a base: a number, a sum, a date, a unit conversion, a phrase, 'bad to hex'", ["255", "12*45+7", "24-01-2026", "5 km to miles", "binary", "convert to hex", "bad to hex", "10 to 20", "hex", "0x", "100 usd to inr"].every((q) => P(q) === null));
ok("the search line answers them as a calculator hit that carries the value and the base; a sum is still a sum", (() => { const a = detectTool("0xFF") as { kind?: string; value?: number; base?: number } | null; const b = detectTool("255 to binary") as { kind?: string; value?: number; base?: number } | null; const c = detectTool("12*45+7") as { kind?: string } | null; return a?.kind === "calcbase" && a.value === 255 && a.base === 16 && b?.kind === "calcbase" && b.base === 2 && c?.kind === "expression"; })());
ok("the converter and the other readers still answer their own lines: '5 km in miles', '#ff5733 to rgb', '100 usd to inr'", ["5 km in miles", "#ff5733 to rgb", "100 usd to inr"].every((q) => { const h = detectTool(q) as { kind?: string } | null; return !!h && h.kind !== "calcbase"; }));

console.log(`calcBase selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
