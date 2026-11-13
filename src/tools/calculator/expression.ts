// src/tools/calculator/expression.ts
//
// THE CALCULATOR OF THE SEARCH BAR. A small hand-written parser: it never calls eval or Function, so what a user types can only ever be arithmetic.
// Pure: no I/O, no model, nothing is stored or sent anywhere.
//
// Understands: + - * / ^ (and ** × ÷), brackets, "%" the way a pocket calculator does (200 + 10% = 220, 200 - 10% = 180, 200 * 10% = 20), "15% of 2400",
// Indian number words (5 lakh, 1.2 crore, 3 thousand) and 5k, Indian digit grouping (1,00,000), constants pi and e, and the usual functions.
//
// The detector is STRICT: the whole text must be arithmetic, with at least one operator or function. A date ("24-01-2026"), a year range ("2025-26"), a telephone-like number
// ("033-2345678"), a ticket number or any sentence is NOT an expression: such text goes to the ordinary search untouched.

export interface ExpressionResult {
  /** the value */
  value: number;
  /** the expression as it was understood, tidied ("200 + 10%") */
  shown: string;
  /** set when the question was for a constant itself ("value of pi"): its digits to full display length */
  exact?: string;
}

const CONSTANT_DIGITS: Record<string, string> = {
  pi: "3.14159265358979323846",
  e: "2.71828182845904523536",
  phi: "1.61803398874989484820",
};

type Tok =
  | { t: "num"; v: number }
  | { t: "op"; v: string }
  | { t: "id"; v: string };

const FUNCS: Record<string, (x: number) => number> = {
  sqrt: Math.sqrt,
  cbrt: Math.cbrt,
  abs: Math.abs,
  round: Math.round,
  floor: Math.floor,
  ceil: Math.ceil,
  ln: Math.log,
  log: Math.log10,
  log10: Math.log10,
  log2: Math.log2,
  exp: Math.exp,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  sind: (x) => Math.sin((x * Math.PI) / 180),
  cosd: (x) => Math.cos((x * Math.PI) / 180),
  tand: (x) => Math.tan((x * Math.PI) / 180),
};
const CONSTS: Record<string, number> = { pi: Math.PI, e: Math.E, phi: (1 + Math.sqrt(5)) / 2 };
const MULTIPLIERS: Record<string, number> = { thousand: 1e3, k: 1e3, lakh: 1e5, lakhs: 1e5, lac: 1e5, lacs: 1e5, crore: 1e7, crores: 1e7, cr: 1e7, million: 1e6, mn: 1e6, billion: 1e9, bn: 1e9 };

const MAX_LENGTH = 200;
const MAX_DEPTH = 40;

/** Text that only looks like arithmetic: dates, year ranges, telephone-like numbers. */
function looksLikeNonMath(s: string): boolean {
  const t = s.trim();
  if (/^\d{1,2}\s*[-/.]\s*\d{1,2}\s*[-/.]\s*\d{2,4}$/.test(t)) return true; // 24-01-2026, 24/01/26
  if (/^\d{4}\s*[-/]\s*\d{2,4}$/.test(t)) return true; // 2025-26, 2025/2026
  if (/^\d{4}\s*[-/]\s*\d{1,2}\s*[-/]\s*\d{1,2}$/.test(t)) return true; // 2026-11-12
  if (/(^|[\s(+\-*/^])0\d+/.test(t) && !/0\./.test(t)) return true; // a number with a leading zero (a code, a telephone number)
  return false;
}

function tokenize(src: string): Tok[] | null {
  const s = src
    .replace(/[×✕]/g, "*")
    .replace(/[÷]/g, "/")
    .replace(/[−–—]/g, "-")
    .replace(/π/g, " pi ")
    .replace(/φ/g, " phi ")
    .replace(/\*\*/g, "^");
  const out: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === " " || c === "\t") { i++; continue; }
    // number: 1,00,000 / 1,234.5 / .5 / 2e5
    const num = /^(?:\d{1,3}(?:,\d{2,3})+|\d+)(?:\.\d+)?(?:e[+-]?\d+)?|^\.\d+(?:e[+-]?\d+)?/i.exec(s.slice(i));
    if (num && /[\d.]/.test(c)) {
      const text = num[0];
      // "2e" followed by a letter is not an exponent ("2e" then "x"): the regex already needs digits after e
      const v = Number(text.replace(/,/g, ""));
      if (!Number.isFinite(v)) return null;
      out.push({ t: "num", v });
      i += text.length;
      continue;
    }
    if ("+-*/^()%!".includes(c)) { out.push({ t: "op", v: c }); i++; continue; }
    if (c === "x" && out.length && out[out.length - 1].t !== "op" && /^x\s*[\d(.]/i.test(s.slice(i))) { out.push({ t: "op", v: "*" }); i++; continue; } // "2 x 3"
    const id = /^[a-z]+\d*/i.exec(s.slice(i));
    if (id) { out.push({ t: "id", v: id[0].toLowerCase() }); i += id[0].length; continue; }
    return null; // any other character: not arithmetic
  }
  return out;
}

class Parser {
  private p = 0;
  private depth = 0;
  /** an operator or a function was used (a lone number is not a calculation) */
  used = false;
  constructor(private toks: Tok[]) {}

  private peek(): Tok | undefined { return this.toks[this.p]; }
  private isOp(v: string): boolean { const t = this.peek(); return !!t && t.t === "op" && t.v === v; }

  done(): boolean { return this.p >= this.toks.length; }

  expr(): number {
    if (++this.depth > MAX_DEPTH) throw new Error("too deep");
    let left = this.term();
    while (this.isOp("+") || this.isOp("-")) {
      const op = (this.peek() as { v: string }).v;
      this.p++;
      this.used = true;
      const rightStart = this.p;
      const right = this.term();
      // a pocket calculator: 200 + 10% means 200 + 10% of 200
      const a = this.toks[rightStart], b = this.toks[rightStart + 1];
      const pct = this.p - rightStart === 2 && a?.t === "num" && b?.t === "op" && b.v === "%"; // exactly "10%"; "10%*3" or "(5+5)%" are plain arithmetic
      const amount = pct ? left * right : right;
      left = op === "+" ? left + amount : left - amount;
    }
    this.depth--;
    return left;
  }

  /** "2pi", "2(3+4)", "(1+1)pi", "pi 5": a number, bracket or constant straight before a constant, a function or an opening bracket means "times" (a number straight before a number does not) */
  private implicitTimes(prev: Tok | undefined): boolean {
    const t = this.peek();
    if (!t || !prev) return false;
    const afterValue = prev.t === "num" || (prev.t === "op" && (prev.v === ")" || prev.v === "%" || prev.v === "!")) || (prev.t === "id" && CONSTS[prev.v] !== undefined);
    if (!afterValue) return false;
    if (t.t === "op") return t.v === "(";
    if (t.t === "id") return CONSTS[t.v] !== undefined || FUNCS[t.v] !== undefined;
    return prev.t === "id" && CONSTS[prev.v] !== undefined; // "pi 5"
  }

  private term(): number {
    let left = this.unary();
    for (;;) {
      const prev = this.toks[this.p - 1];
      if (this.isOp("*") || this.isOp("/")) {
        const op = (this.peek() as { v: string }).v;
        this.p++;
        this.used = true;
        const right = this.unary();
        if (op === "/" && right === 0) throw new Error("division by zero");
        left = op === "*" ? left * right : left / right;
      } else if (this.implicitTimes(prev)) {
        this.used = true;
        left = left * this.power();
      } else {
        return left;
      }
    }
  }

  private power(): number {
    const base = this.postfix();
    if (this.isOp("^")) {
      this.p++;
      this.used = true;
      return Math.pow(base, this.unary()); // right-associative: 2^3^2 = 2^9; and -2^2 = -(2^2), because the sign is read before the power
    }
    return base;
  }

  private unary(): number {
    if (this.isOp("-")) { this.p++; this.used = true; return -this.unary(); }
    if (this.isOp("+")) { this.p++; return this.unary(); }
    return this.power();
  }

  private postfix(): number {
    let v = this.primary();
    for (;;) {
      if (this.isOp("%")) { this.p++; v = v / 100; continue; } // a percent alone is not a calculation (it does not set `used`)
      if (this.isOp("!")) {
        this.p++;
        this.used = true;
        if (!Number.isInteger(v) || v < 0 || v > 170) throw new Error("factorial");
        let f = 1;
        for (let k = 2; k <= v; k++) f *= k;
        v = f;
        continue;
      }
      return v;
    }
  }

  private primary(): number {
    const t = this.peek();
    if (!t) throw new Error("unexpected end");
    if (t.t === "num") {
      this.p++;
      let v = t.v;
      const nx = this.peek();
      if (nx && nx.t === "id" && MULTIPLIERS[nx.v] !== undefined) { this.p++; v *= MULTIPLIERS[nx.v]; this.used = true; }
      return v;
    }
    if (t.t === "op" && t.v === "(") {
      this.p++;
      const v = this.expr();
      if (!this.isOp(")")) throw new Error("missing )");
      this.p++;
      return v;
    }
    if (t.t === "id") {
      this.p++;
      if (CONSTS[t.v] !== undefined) return CONSTS[t.v];
      const fn = FUNCS[t.v];
      if (fn) {
        this.used = true;
        // sqrt(9), sqrt 9
        if (this.isOp("(")) {
          this.p++;
          const arg = this.expr();
          if (!this.isOp(")")) throw new Error("missing )");
          this.p++;
          return fn(arg);
        }
        return fn(this.unary());
      }
      throw new Error(`unknown word ${t.v}`);
    }
    throw new Error("unexpected token");
  }
}

/** Roots and powers written as words: "sq rt of 4^3", "square root of 64", "cube root of 27", "5th root of 32", "square of 12", "cube of 3", "5 squared".
 *  After "of" the WHOLE rest is the argument ("square root of 16 + 9" is the root of 25), which the card shows back as "√(16 + 9)". */
const SQRT_WORDS = /\b(?:sq(?:uare)?\.?\s*r(?:oo)?t|sqrt)\b/gi;
const CBRT_WORDS = /\b(?:(?:cb|cu)(?:be)?\.?\s*r(?:oo)?t|cbrt)\b/gi;
function rewriteWordedMaths(input: string, depth = 0): string {
  if (depth > 8) return input;
  let s = input
    .replace(CBRT_WORDS, "cbrt")
    .replace(SQRT_WORDS, "sqrt")
    .replace(/√/g, " sqrt ")
    .replace(/∛/g, " cbrt ");
  const nth = /(\d+)\s*(?:st|nd|rd|th)\s+root\s+of\s+|\broot\s+(\d+)\s+of\s+/i.exec(s);
  const fn = /\b(sqrt|cbrt)\s+of\s+/i.exec(s);
  const pw = /\b(square|cube)\s+of\s+/i.exec(s);
  const hits = [nth, fn, pw].filter((m): m is RegExpExecArray => !!m).sort((a, b) => a.index - b.index);
  const m = hits[0];
  if (m) {
    const before = s.slice(0, m.index);
    const rest = rewriteWordedMaths(s.slice(m.index + m[0].length), depth + 1);
    if (m === nth) return `${before}(${rest})^(1/${m[1] ?? m[2]})`;
    if (m === fn) return `${before}${m[1].toLowerCase()}(${rest})`;
    return `${before}(${rest})^${m[1].toLowerCase() === "square" ? 2 : 3}`;
  }
  s = s.replace(/(\d(?:[\d.,]*)|\))\s+(squared|cubed)\b/gi, (_a, x: string, w: string) => `(${x})^${w.toLowerCase() === "squared" ? 2 : 3}`);
  return s;
}

/** "what is", "calculate", "calc", "=" around the arithmetic are noise; "15% of 2400" becomes "15% * 2400". */
function tidy(raw: string): string {
  let s = (raw || "").trim();
  s = s.replace(/^(?:what\s+is|what's|calculate|calc|compute|solve|find|evaluate)\s+/i, "");
  s = s.replace(/\s*=\s*\??$/, "").replace(/\?+$/, "").trim();
  s = s.replace(/\bgolden\s+(?:ratio|number|section|mean)\b/gi, "phi");
  s = rewriteWordedMaths(s.replace(/\bthe\s+(?=sq|cu|cb|square|cube|root|\d+\s*(?:st|nd|rd|th)\s+root)/gi, ""));
  s = s.replace(/(\d)\s*%\s*of\s+/gi, "$1% * ");
  return s.replace(/\s+/g, " ").trim();
}

/** The expression as the card shows it back: roots as √ and ∛, simple squares and cubes as ² and ³. */
function prettyShown(s: string): string {
  return s
    .replace(/\s+/g, " ")
    .replace(/\bsqrt\s*/g, "√")
    .replace(/\bcbrt\s*/g, "∛")
    .replace(/([√∛])\((\d[\d.,]*)\)/g, "$1$2")
    .replace(/\((\d[\d.,]*)\)\^2/g, "$1²")
    .replace(/\((\d[\d.,]*)\)\^3/g, "$1³");
}

/** "pi", "π", "value of pi", "pi value", "what is e", "euler's number", "golden ratio", "φ": the constant itself, to full length.
 *  A lone "e" or a lone "phi" is not taken (a letter, a name people may type); "golden ratio" and the symbols π and φ are. */
function constantQuestion(raw: string): { name: "pi" | "e" | "phi"; shown: string } | null {
  const t = (raw || "").trim().toLowerCase().replace(/[?.!]+$/, "").replace(/\s+/g, " ");
  const NAME = "(pi|π|e|phi|φ|euler'?s?(?: number| constant)?|golden (?:ratio|number|section|mean))";
  const which = (w: string): { name: "pi" | "e" | "phi"; shown: string } =>
    w === "pi" || w === "π" ? { name: "pi", shown: "π" } : w === "e" || w.startsWith("euler") ? { name: "e", shown: "e" } : { name: "phi", shown: "φ" };
  if (t === "pi" || t === "π" || t === "φ" || /^golden (?:ratio|number|section|mean)$/.test(t) || /^euler'?s? (?:number|constant)$/.test(t)) return which(t.startsWith("golden") ? "phi" : t);
  const m = new RegExp(`^(?:(?:what is|what's|value of|the value of|show|give me|find)\\s+(?:the\\s+)?(?:value of\\s+)?${NAME}|${NAME}\\s+(?:value|constant|number|digits))$`).exec(t);
  if (!m) return null;
  const w = m[1] ?? m[2];
  return which(w.startsWith("golden") ? "phi" : w);
}

/** The value of an arithmetic expression, or null when the text is not one (or cannot be evaluated: division by zero, an unknown word). */
export function evaluateExpression(raw: string): ExpressionResult | null {
  const c = constantQuestion(raw);
  if (c) return { value: CONSTS[c.name], shown: c.shown, exact: CONSTANT_DIGITS[c.name] };
  const s = tidy(raw);
  if (!s || s.length > MAX_LENGTH || !/[\d]|\b(?:pi|e|phi)\b|[πφ]/i.test(s)) return null;
  if (looksLikeNonMath(s)) return null;
  const toks = tokenize(s);
  if (!toks || toks.length < 2) return null;
  const parser = new Parser(toks);
  let value: number;
  try {
    value = parser.expr();
  } catch {
    return null;
  }
  if (!parser.done() || !parser.used || !Number.isFinite(value)) return null;
  return { value, shown: prettyShown(s) };
}

/** Indian digit grouping: 1234567.891 -> "12,34,567.891". Up to 10 significant digits; very large or small values in scientific form. */
export function formatNumber(v: number, sig = 10): string {
  if (!Number.isFinite(v)) return "—";
  if (v === 0) return "0";
  const abs = Math.abs(v);
  if (abs >= 1e15 || abs < 1e-6) return v.toExponential(6).replace(/\.?0+e/, "e");
  const rounded = Number(v.toPrecision(sig));
  const [int, frac] = Math.abs(rounded).toString().split(".");
  let g = int;
  if (int.length > 3) {
    const last3 = int.slice(-3);
    const rest = int.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
    g = `${rest},${last3}`;
  }
  return `${rounded < 0 ? "-" : ""}${g}${frac ? "." + frac : ""}`;
}

/** The same value in Indian words when it is large: 12500000 -> "1.25 crore"; null below one lakh. */
export function indianWords(v: number): string | null {
  const abs = Math.abs(v);
  if (!Number.isFinite(v) || abs < 1e5 || abs >= 1e15) return null;
  const part = (x: number, unit: string) => `${v < 0 ? "-" : ""}${Number(x.toPrecision(6))} ${unit}`;
  if (abs >= 1e12) return part(abs / 1e12, "lakh crore");
  if (abs >= 1e7) return part(abs / 1e7, "crore");
  return part(abs / 1e5, "lakh");
}
