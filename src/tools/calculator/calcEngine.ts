// src/tools/calculator/calcEngine.ts
//
// The engine of the full calculator (basic and scientific, laid out like the Mac's). It is a pure state machine: `press(state, key)` gives the next state. No screen, no storage, nothing sent anywhere;
// the memory (mc, m+, m-, mr) and the history live only in the state of the window.
//
// How it behaves, as the Mac's does:
//   BASIC      immediate execution: 2 + 3 × 4 = 20 (each operator finishes the one before it).
//   SCIENTIFIC the usual precedence: 2 + 3 × 4 = 14, with brackets, powers, roots and the functions; "2nd" swaps the inverse and alternate functions.
//   "=" pressed again repeats the last operation (2 + 3 = = gives 8); "%" is the pocket-calculator percent (200 + 10 % = 220);
//   trig works in degrees or radians (Rad / Deg); EE enters an exponent (1.5 EE 3 = 1500); a function (sin, √, x²…) acts on the number shown at once.
// I clean answers to 12 significant digits, so that 0.1 + 0.2 shows 0.3 and sin 180° shows 0.
// Number base (scientific only): DEC, BIN, OCT or HEX. In BIN, OCT and HEX the entry is the digits of the number in that base ("FF", "-1010"), whole numbers only: I make a result with a fraction an error ("Whole numbers
// only"), never rounded, and so is one beyond 2^53 - 1, which a float cannot hold exactly ("Too large for this base"). `enabled(state, key)` says which keys mean something in the base (a digit the base does not
// have, and the keys that make fractions, do not); the calculator greys the others and the engine ignores them, from this one list. The working numbers (the stack, the memory) are plain values, so a change of base
// only changes how they are written.

export type Mode = "basic" | "sci";
export type Base = 2 | 8 | 10 | 16;
export type BinOp = "add" | "sub" | "mul" | "div" | "pow" | "root" | "logy";

type Item = { t: "n"; v: number } | { t: "o"; v: BinOp } | { t: "(" };

export interface HistoryItem {
  expr: string;
  /** Holds the value, as plain decimal text. */
  result: string;
  /** Holds the base the line was calculated in (decimal when not said). */
  base?: Base;
}

export interface CalcState {
  mode: Mode;
  /** Holds the number being typed or shown, as text ("12.5", "-3", "1.5e+3"). */
  entry: string;
  /** True when the next digit starts a new number (a result, an operator or a function has just been pressed). */
  fresh: boolean;
  /** True when an operator or an opening bracket was the last thing pressed: the next number is still to come. */
  awaiting: boolean;
  /** Holds what is waiting to be calculated: numbers, operators, opening brackets. */
  stack: Item[];
  memory: number;
  deg: boolean;
  second: boolean;
  /** The number base of the entry (decimal in the basic calculator). */
  base: Base;
  error: string | null;
  /** I keep the last operation here, for a repeated "=". */
  repeat: { op: BinOp; operand: number } | null;
  history: HistoryItem[];
}

export const initialState = (mode: Mode = "basic"): CalcState => ({ mode, entry: "0", fresh: true, awaiting: false, stack: [], memory: 0, deg: true, second: false, base: 10, error: null, repeat: null, history: [] });

export type Key =
  | "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "hA" | "hB" | "hC" | "hD" | "hE" | "hF" | "." | "ac" | "back" | "neg" | "pct" | "ee"
  | "add" | "sub" | "mul" | "div" | "pow" | "root" | "logy" | "eq" | "lp" | "rp"
  | "sq" | "cube" | "sqrt" | "cbrt" | "inv" | "fact" | "sin" | "cos" | "tan" | "asin" | "acos" | "atan" | "sinh" | "cosh" | "tanh" | "asinh" | "acosh" | "atanh"
  | "ln" | "log10" | "log2" | "exp" | "tenx" | "twox" | "pi" | "e" | "rand"
  | "mc" | "mplus" | "mminus" | "mr" | "second" | "degrad";

export const SYMBOL: Record<BinOp, string> = { add: "+", sub: "−", mul: "×", div: "÷", pow: "^", root: "ʸ√", logy: "log" };
const PREC: Record<BinOp, number> = { add: 1, sub: 1, mul: 2, div: 2, pow: 3, root: 3, logy: 3 };

const MAX_DIGITS = 15;

class CalcError extends Error {}
const fail = (msg = "Not a number"): never => { throw new CalcError(msg); };

/** Gives the number of a typed entry. */
export const valueOf = (entry: string): number => Number(entry);

/** Turns a result into an entry: 12 significant digits, plain unless huge or tiny. */
export function toEntry(v: number): string {
  if (!Number.isFinite(v)) return fail("Not a number");
  if (v === 0) return "0";
  const r = Number(v.toPrecision(12));
  const a = Math.abs(r);
  if (a >= 1e15 || a < 1e-9) return r.toExponential().replace(/e\+?(-?)(\d)/, (_m, s: string, d: string) => `e${s || "+"}${d}`);
  return String(r);
}

// ---- number bases ----
export const BASES: ReadonlyArray<readonly [Base, string, string]> = [[10, "DEC", "decimal"], [2, "BIN", "binary"], [8, "OCT", "octal"], [16, "HEX", "hexadecimal"]];
/** The largest whole number a float holds exactly. */
export const BASE_LIMIT = Number.MAX_SAFE_INTEGER;

/** Gives the digit a key types ("7", "hC" is C), or null. */
export function digitOf(key: Key): string | null {
  if (/^[0-9]$/.test(key)) return key;
  return /^h[A-F]$/.test(key) ? key.slice(1) : null;
}

/** Writes a whole number in the base, upper case ("FF", "-1010"); I treat a fraction or a number beyond 2^53 - 1 as an error. */
export function toBaseText(v: number, base: Base): string {
  if (!Number.isInteger(v)) return fail("Whole numbers only");
  if (Math.abs(v) > BASE_LIMIT) return fail("Too large for this base");
  return `${v < 0 ? "-" : ""}${Math.abs(v).toString(base).toUpperCase()}`;
}

/** Gives the value of an entry of the state's base. */
export const valueIn = (s: { entry: string; base: Base }): number => (s.base === 10 ? Number(s.entry) : parseInt(s.entry, s.base));

/** Turns a result into an entry of the base: 12 significant digits in decimal, every digit in another base. */
const entryOf = (base: Base, v: number): string => (base === 10 ? toEntry(v) : toBaseText(v, base));
/** Writes a whole value as plain decimal text with every digit ("9007199254740991"), which the history and a change to decimal need. */
const wholeText = (v: number): string => (Number.isInteger(v) && Math.abs(v) <= BASE_LIMIT ? String(v) : toEntry(v));

/** Gives a whole number in each of the four bases, as the display writes them (null for a fraction or a number too large). */
export function inAllBases(v: number): Array<{ base: Base; label: string; text: string }> | null {
  if (!Number.isInteger(v) || Math.abs(v) > BASE_LIMIT) return null;
  return BASES.map(([base, label]) => ({ base, label, text: base === 10 ? displayNumber(String(v)) : displayNumber(toBaseText(v, base), base) }));
}

/** Says which keys mean something in the number base: all of them in decimal; in the others I allow the digits the base has (A-F only in HEX), the four rules, powers, brackets, memory, the square, cube and factorial, and nothing that makes a fraction. */
const WHOLE_KEYS = new Set<Key>(["ac", "back", "neg", "add", "sub", "mul", "div", "pow", "eq", "lp", "rp", "sq", "cube", "fact", "mc", "mplus", "mminus", "mr", "second"]);
export function enabled(s: Pick<CalcState, "base">, key: Key): boolean {
  const d = digitOf(key);
  if (s.base === 10) return !/^h[A-F]$/.test(key);
  if (d) return parseInt(d, 16) < s.base;
  return WHOLE_KEYS.has(key);
}

function apply(op: BinOp, a: number, b: number): number {
  switch (op) {
    case "add": return a + b;
    case "sub": return a - b;
    case "mul": return a * b;
    case "div": return b === 0 ? fail("Cannot divide by zero") : a / b;
    case "pow": { const r = Math.pow(a, b); return Number.isNaN(r) ? fail() : r; }
    case "root": {
      if (b === 0) return fail();
      if (a < 0) return Number.isInteger(b) && Math.abs(b) % 2 === 1 ? -Math.pow(-a, 1 / b) : fail();
      return Math.pow(a, 1 / b);
    }
    case "logy": return a > 0 && b > 0 && b !== 1 ? Math.log(a) / Math.log(b) : fail();
  }
}

/** Evaluates numbers and operators in turn: left to right (basic) or by precedence (scientific). */
function evalItems(items: Item[], sci: boolean): number {
  const nums: number[] = [];
  const ops: BinOp[] = [];
  const reduce = () => { const b = nums.pop() as number, a = nums.pop() as number; nums.push(apply(ops.pop() as BinOp, a, b)); };
  for (const it of items) {
    if (it.t === "n") nums.push(it.v);
    else if (it.t === "o") {
      while (ops.length && (sci ? PREC[ops[ops.length - 1]] > PREC[it.v] || (PREC[ops[ops.length - 1]] === PREC[it.v] && it.v !== "pow") : true)) reduce();
      ops.push(it.v);
    }
  }
  while (ops.length) reduce();
  if (nums.length !== 1) return fail();
  return nums[0];
}

const rad = (x: number, deg: boolean): number => (deg ? (x * Math.PI) / 180 : x);
const unrad = (x: number, deg: boolean): number => (deg ? (x * 180) / Math.PI : x);
/** Catches a trig result that is zero but for the error of a float. */
const clean = (x: number): number => (Math.abs(x) < 1e-14 ? 0 : x);

function unary(key: Key, v: number, deg: boolean): number {
  switch (key) {
    case "sq": return v * v;
    case "cube": return v * v * v;
    case "sqrt": return v < 0 ? fail() : Math.sqrt(v);
    case "cbrt": return Math.cbrt(v);
    case "inv": return v === 0 ? fail("Cannot divide by zero") : 1 / v;
    case "fact": {
      if (!Number.isInteger(v) || v < 0 || v > 170) return fail();
      let f = 1;
      for (let k = 2; k <= v; k++) f *= k;
      return f;
    }
    case "sin": return clean(Math.sin(rad(v, deg)));
    case "cos": return clean(Math.cos(rad(v, deg)));
    case "tan": { const c = Math.cos(rad(v, deg)); return Math.abs(c) < 1e-14 ? fail() : clean(Math.tan(rad(v, deg))); }
    case "asin": return Math.abs(v) > 1 ? fail() : clean(unrad(Math.asin(v), deg));
    case "acos": return Math.abs(v) > 1 ? fail() : clean(unrad(Math.acos(v), deg));
    case "atan": return clean(unrad(Math.atan(v), deg));
    case "sinh": return Math.sinh(v);
    case "cosh": return Math.cosh(v);
    case "tanh": return Math.tanh(v);
    case "asinh": return Math.asinh(v);
    case "acosh": return v < 1 ? fail() : Math.acosh(v);
    case "atanh": return Math.abs(v) >= 1 ? fail() : Math.atanh(v);
    case "ln": return v <= 0 ? fail() : Math.log(v);
    case "log10": return v <= 0 ? fail() : Math.log10(v);
    case "log2": return v <= 0 ? fail() : Math.log2(v);
    case "exp": return Math.exp(v);
    case "tenx": return Math.pow(10, v);
    case "twox": return Math.pow(2, v);
    default: return fail();
  }
}
const UNARY = new Set<Key>(["sq", "cube", "sqrt", "cbrt", "inv", "fact", "sin", "cos", "tan", "asin", "acos", "atan", "sinh", "cosh", "tanh", "asinh", "acosh", "atanh", "ln", "log10", "log2", "exp", "tenx", "twox"]);
const BINARY = new Set<Key>(["add", "sub", "mul", "div", "pow", "root", "logy"]);

/** Writes what is waiting as text: "2 + ( 3 ×" */
export function pendingText(s: CalcState): string {
  return s.stack.map((it) => (it.t === "n" ? shownValue(it.v, s.base) : it.t === "o" ? SYMBOL[it.v] : "(")).join(" ");
}

/** Writes a value as the display writes it in the base (a value that cannot be written in the base is written in decimal). */
export function shownValue(v: number, base: Base): string {
  if (base !== 10 && Number.isInteger(v) && Math.abs(v) <= BASE_LIMIT) return displayNumber(toBaseText(v, base), base);
  return displayNumber(toEntry(v));
}

/** Writes an entry as it is shown: Indian digit grouping (12,34,567.5), the decimals as typed, an exponent as it is. */
export function displayNumber(entry: string, base: Base = 10): string {
  if (base !== 10) {
    // I group BIN and HEX in fours and OCT in threes, from the right.
    const neg = entry.startsWith("-");
    const body = neg ? entry.slice(1) : entry;
    const n = base === 8 ? 3 : 4;
    const parts: string[] = [];
    for (let i = body.length; i > 0; i -= n) parts.unshift(body.slice(Math.max(0, i - n), i));
    return `${neg ? "-" : ""}${parts.join(" ")}`;
  }
  if (/e/.test(entry)) return entry;
  const neg = entry.startsWith("-");
  const body = neg ? entry.slice(1) : entry;
  const [int, dec] = body.split(".");
  let g = int;
  if (int.length > 3) { const last3 = int.slice(-3); const rest = int.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ","); g = `${rest},${last3}`; }
  return `${neg ? "-" : ""}${g}${dec !== undefined ? `.${dec}` : ""}`;
}

const lastIs = (s: CalcState, t: "o" | "("): boolean => s.stack.length > 0 && s.stack[s.stack.length - 1].t === t;

/** Finishes everything that is waiting: a closing bracket for each open one, then the sum. */
function finish(stack: Item[], v: number, sci: boolean): { result: number; single: { op: BinOp; operand: number } | null } {
  let cur = v;
  let rest = stack;
  while (rest.some((i) => i.t === "(")) {
    const i = rest.map((x) => x.t).lastIndexOf("(");
    cur = evalItems([...rest.slice(i + 1), { t: "n", v: cur }], sci);
    rest = rest.slice(0, i);
  }
  const all: Item[] = [...rest, { t: "n", v: cur }];
  const single = rest.length === 2 && rest[0].t === "n" && rest[1].t === "o" ? { op: rest[1].v, operand: cur } : null;
  return { result: evalItems(all, sci), single };
}

const wipe = (s: CalcState): CalcState => ({ ...initialState(s.mode), memory: s.memory, deg: s.deg, second: s.second, base: s.base, history: s.history });

/** Gives the next state when `key` is pressed. `random` is a number in [0,1) for the Rand key; I pass it in from outside to keep this function pure. */
export function press(prev: CalcState, key: Key, random = 0.5): CalcState {
  if (!enabled(prev, key)) return prev; // I ignore a key the number base does not have (a 9 in binary, a sine in hexadecimal)
  const s: CalcState = prev.error ? (/^[0-9.]$|^h[A-F]$|^ac$/.test(key) ? wipe(prev) : prev) : prev;
  if (s.error) return s;
  try {
    return step(s, key, random);
  } catch (e) {
    if (e instanceof CalcError) return { ...s, error: e.message, stack: [], fresh: true, awaiting: false, repeat: null };
    throw e;
  }
}

function step(s: CalcState, key: Key, random: number): CalcState {
  const sci = s.mode === "sci";
  const v = valueIn(s);
  const done = (patch: Partial<CalcState>): CalcState => ({ ...s, ...patch });

  const dig = digitOf(key);
  if (dig && s.base !== 10) {
    if (s.fresh) return done({ entry: dig, fresh: false, awaiting: false, repeat: s.stack.length ? s.repeat : null });
    const next = s.entry === "0" ? dig : s.entry + dig;
    return Math.abs(parseInt(next, s.base)) > BASE_LIMIT ? s : done({ entry: next });
  }
  if (/^[0-9]$/.test(key)) {
    if (s.fresh) return done({ entry: key, fresh: false, awaiting: false, repeat: s.stack.length ? s.repeat : null });
    if (/e[+-]0$/.test(s.entry)) return done({ entry: s.entry.slice(0, -1) + key });
    if (/e/.test(s.entry)) return /e[+-]\d{3}$/.test(s.entry) ? s : done({ entry: s.entry + key });
    if (s.entry === "0") return done({ entry: key });
    if (s.entry.replace(/[-.]/g, "").length >= MAX_DIGITS) return s;
    return done({ entry: s.entry + key });
  }
  if (key === ".") {
    if (s.fresh) return done({ entry: "0.", fresh: false, awaiting: false });
    return /[.e]/.test(s.entry) ? s : done({ entry: s.entry + "." });
  }
  if (key === "ee") {
    if (/e/.test(s.entry)) return s;
    return done({ entry: `${s.fresh ? "1" : s.entry}e+0`, fresh: false, awaiting: false });
  }
  if (key === "neg") return s.entry === "0" ? s : done({ entry: s.entry.startsWith("-") ? s.entry.slice(1) : `-${s.entry}` });
  if (key === "back") {
    if (s.fresh) return s;
    let e = s.entry.slice(0, -1).replace(/e[+-]?$/, ""); // I drop an exponent sign with no digit after it as well
    if (e === "" || e === "-") e = "0";
    return done({ entry: e });
  }
  if (key === "ac") {
    if (!s.fresh && s.entry !== "0") return done({ entry: "0", fresh: true }); // "C" clears the number being typed only
    return wipe(s);
  }
  if (key === "second") return done({ second: !s.second });
  if (key === "degrad") return done({ deg: !s.deg });
  if (key === "mc") return done({ memory: 0 });
  if (key === "mr") return done({ entry: entryOf(s.base, s.memory), fresh: true, awaiting: false });
  if (key === "mplus") return done({ memory: s.memory + v, fresh: true });
  if (key === "mminus") return done({ memory: s.memory - v, fresh: true });
  if (key === "pi") return done({ entry: toEntry(Math.PI), fresh: true, awaiting: false });
  if (key === "e") return done({ entry: toEntry(Math.E), fresh: true, awaiting: false });
  if (key === "rand") return done({ entry: toEntry(random), fresh: true, awaiting: false });

  if (key === "pct") {
    const top = s.stack[s.stack.length - 1];
    const prevNum = s.stack[s.stack.length - 2];
    let r = v / 100;
    if (top && top.t === "o" && (top.v === "add" || top.v === "sub") && prevNum && prevNum.t === "n") r = (prevNum.v * v) / 100; // Percent here: 200 + 10 % is 200 + 20
    return done({ entry: toEntry(r), fresh: true, awaiting: false });
  }

  if (UNARY.has(key)) return done({ entry: entryOf(s.base, unary(key, v, s.deg)), fresh: true, awaiting: false });

  if (key === "lp") {
    if (!sci) return s;
    return done({ stack: [...s.stack, { t: "(" }], entry: "0", fresh: true, awaiting: true, repeat: null });
  }
  if (key === "rp") {
    if (!s.stack.some((i) => i.t === "(")) return s;
    const i = s.stack.map((x) => x.t).lastIndexOf("(");
    const r = evalItems([...s.stack.slice(i + 1), { t: "n", v }], sci);
    return done({ stack: s.stack.slice(0, i), entry: entryOf(s.base, r), fresh: true, awaiting: false });
  }

  if (BINARY.has(key)) {
    const op = key as BinOp;
    if (s.awaiting && lastIs(s, "o")) {
      const st = [...s.stack];
      st[st.length - 1] = { t: "o", v: op };
      return done({ stack: st });
    }
    if (s.awaiting && lastIs(s, "(")) return s;
    if (!sci) {
      // Immediate execution: I finish the operation before this one.
      if (s.stack.length === 2 && !s.awaiting) {
        const r = evalItems([...s.stack, { t: "n", v }], false);
        return done({ stack: [{ t: "n", v: r }, { t: "o", v: op }], entry: toEntry(r), fresh: true, awaiting: true, repeat: null });
      }
      return done({ stack: [{ t: "n", v }, { t: "o", v: op }], fresh: true, awaiting: true, repeat: null });
    }
    return done({ stack: [...s.stack, { t: "n", v }, { t: "o", v: op }], fresh: true, awaiting: true, repeat: null });
  }

  if (key === "eq") {
    if (s.stack.length === 0) {
      if (!s.repeat) return done({ entry: entryOf(s.base, v), fresh: true }); // Shows a typed 1.5e+3 as 1500
      const r = apply(s.repeat.op, v, s.repeat.operand);
      const text = `${shownValue(v, s.base)} ${SYMBOL[s.repeat.op]} ${shownValue(s.repeat.operand, s.base)}`;
      return done({ entry: entryOf(s.base, r), fresh: true, history: [...s.history, { expr: text, result: s.base === 10 ? toEntry(r) : wholeText(r), base: s.base }].slice(-30) });
    }
    const text = `${pendingText(s)} ${s.awaiting && lastIs(s, "o") ? shownValue(v, s.base) : displayNumber(s.entry, s.base)}`.replace(/\s+/g, " ").trim();
    const { result, single } = finish(s.stack, v, sci);
    return done({ stack: [], entry: entryOf(s.base, result), fresh: true, awaiting: false, repeat: single, history: [...s.history, { expr: text, result: s.base === 10 ? toEntry(result) : wholeText(result), base: s.base }].slice(-30) });
  }
  return s;
}

/** The scientific mode and the basic one share the entry; I drop the pending work when the mode changes. */
export function setMode(s: CalcState, mode: Mode): CalcState {
  if (s.mode === mode) return s;
  // The basic calculator is decimal only, so a number in another base goes over as the same value in decimal.
  const toDecimal = mode === "basic" && s.base !== 10 ? { base: 10 as Base, entry: wholeText(valueIn(s)) } : {};
  return { ...s, mode, stack: [], awaiting: false, repeat: null, second: false, fresh: true, ...toDecimal };
}

/**
 * The number base changed: the entry is the same value written in the new base. Only the scientific calculator has bases. A fraction (or a number too large) cannot be written in BIN, OCT or HEX: I make that an
 * error ("Whole numbers only"), never a rounded number, and the same for a fraction waiting among the working numbers.
 */
export function setBase(s: CalcState, base: Base): CalcState {
  if (s.base === base || s.mode !== "sci") return s;
  try {
    const v = valueIn(s);
    if (base !== 10) for (const it of s.stack) if (it.t === "n") toBaseText(it.v, base);
    return { ...s, base, entry: base === 10 ? wholeText(v) : toBaseText(v, base), error: null };
  } catch (e) {
    if (e instanceof CalcError) return { ...s, error: e.message, stack: [], fresh: true, awaiting: false, repeat: null };
    throw e;
  }
}

/** Builds a calculator that opens on a value in a base (what a typed "0xFF" or "255 to binary" opens): the scientific calculator showing the value; a value that cannot be written in the base opens in decimal. */
export function startAt(base: Base, value: number): CalcState {
  const s0 = initialState("sci");
  try {
    return { ...s0, base, entry: base === 10 ? wholeText(value) : toBaseText(value, base), fresh: true };
  } catch {
    return { ...s0, entry: toEntry(value) };
  }
}

/** Gives the calculator key that a keyboard key stands for (null for any other key, and for a shortcut with Ctrl or Cmd, which does not belong to the calculator). */
export function keyFor(k: string, ctrlOrMeta = false, base: Base = 10): Key | null {
  if (ctrlOrMeta) return null;
  if (/^[0-9]$/.test(k)) return k as Key;
  if (base === 16 && /^[a-fA-F]$/.test(k)) return `h${k.toUpperCase()}` as Key; // In HEX I take the letters A-F as digits (C is no longer Clear: Delete still is)
  switch (k) {
    case ".": case ",": return ".";
    case "+": return "add";
    case "-": return "sub";
    case "*": case "x": case "X": return "mul";
    case "/": return "div";
    case "Enter": case "=": return "eq";
    case "Backspace": return "back";
    case "Delete": case "c": case "C": return "ac";
    case "%": return "pct";
    case "(": return "lp";
    case ")": return "rp";
    case "^": return "pow";
    case "!": return "fact";
    default: return null;
  }
}

/** Puts a result from the history back as the number shown. */
export function recall(s: CalcState, entry: string): CalcState {
  if (s.base === 10) return { ...s, entry, fresh: true, awaiting: false, error: null };
  try {
    return { ...s, entry: toBaseText(Number(entry), s.base), fresh: true, awaiting: false, error: null };
  } catch (e) {
    if (e instanceof CalcError) return { ...s, error: e.message, stack: [], fresh: true, awaiting: false, repeat: null };
    throw e;
  }
}

/** Gives a history line's result as it was calculated: in its own base, written as the display writes it. */
export function historyResult(h: HistoryItem): string {
  const base = h.base ?? 10;
  return base === 10 ? displayNumber(h.result) : shownValue(Number(h.result), base);
}
