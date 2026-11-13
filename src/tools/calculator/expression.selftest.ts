// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/tools/calculator/expression.selftest.ts
import { evaluateExpression, formatNumber, indianWords } from "./expression";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };
const v = (s: string) => evaluateExpression(s)?.value;
const close = (a: number | undefined, b: number) => a !== undefined && Math.abs(a - b) < 1e-9 * Math.max(1, Math.abs(b));

ok("plain arithmetic with precedence", v("12*45+7") === 547 && v("2+3*4") === 14 && v("(2+3)*4") === 20 && v("10/4") === 2.5);
ok("power is right-associative and ** and ^ are the same", v("2^3^2") === 512 && v("2**10") === 1024 && v("-2^2") === -4);
ok("the multiplication and division signs", v("6×7") === 42 && v("84÷2") === 42 && v("6 x 7") === 42);
ok("roots and powers written as words", v("sq rt of 4^3") === 8 && v("sqrt of 4^3") === 8 && v("square root of 64") === 8 && v("cube root of 27") === 3 && v("cb rt of 27") === 3 && v("cb rt 125") === 5 && v("what is the square root of 144?") === 12 && close(v("5th root of 32"), 2) && close(v("root 4 of 81"), 3) && v("square of 12") === 144 && v("cube of 3") === 27 && v("5 squared") === 25 && v("3 cubed") === 27);
ok("root symbols and the whole rest after 'of' is the argument", v("√64") === 8 && v("∛27") === 3 && v("√(4^3)") === 8 && v("square root of 16 + 9") === 5 && v("2 * cube root of 8") === 4 && v("sqrt(cube root of 64)") === 2);
ok("roots are shown back with their symbol; a bare phrase or a sentence is not a calculation", evaluateExpression("sq rt of 4^3")?.shown === "√(4^3)" && evaluateExpression("cube root of 27")?.shown === "∛27" && ["square root of india", "cube of", "sq rt of", "square root of -4"].every((q) => evaluateExpression(q) === null));
ok("pi and e: the constants themselves, to full length", ["pi", "π", "value of pi", "pi value", "what is pi"].every((q) => evaluateExpression(q)?.exact === "3.14159265358979323846") && ["value of e", "e value", "euler number", "value of euler's number"].every((q) => evaluateExpression(q)?.exact === "2.71828182845904523536") && evaluateExpression("e") === null && evaluateExpression("value of india") === null);
ok("the golden ratio: by name, by symbol, as a value question and inside sums", ["golden ratio", "φ", "value of phi", "what is the golden ratio", "phi value", "golden section"].every((q) => evaluateExpression(q)?.exact === "1.61803398874989484820") && evaluateExpression("phi") === null && close(v("2*phi"), 1 + Math.sqrt(5)) && close(v("phi^2 - phi"), 1) && close(v("100 * golden ratio"), 100 * (1 + Math.sqrt(5)) / 2) && close(v("phi*phi"), 1 + (1 + Math.sqrt(5)) / 2));
ok("pi and e inside sums, with 'times' implied: 2*pi*8, 2pi, 2 pi 8, 4/3*pi*5^3, (1+1)pi, 3(4+5)", close(v("2*pi*8"), 16 * Math.PI) && close(v("2pi"), 2 * Math.PI) && close(v("2 pi 8"), 16 * Math.PI) && close(v("4/3*pi*5^3"), (4 / 3) * Math.PI * 125) && close(v("(1+1)pi"), 2 * Math.PI) && v("3(4+5)") === 27 && close(v("pi 5^2"), 25 * Math.PI) && close(v("2e"), 2 * Math.E) && close(v("pi + e"), Math.PI + Math.E));
ok("two numbers side by side are still not a product, and a letter without a value is not a calculation", v("2 3") === undefined && v("pi*r^2") === undefined && v("2πr") === undefined);
ok("percent as a pocket calculator reads it", close(v("200+10%"), 220) && close(v("200-10%"), 180) && close(v("200*10%"), 20) && close(v("200/10%"), 2000));
ok("'15% of 2400' and 'what is 15% of 2400'", close(v("15% of 2400"), 360) && close(v("what is 15% of 2400"), 360));
ok("a percent of a bracket is plain arithmetic, not a pocket-calculator percent", close(v("100+(5+5)%"), 100.1));
ok("Indian number words and k", v("5 lakh * 12") === 6000000 && v("1.2 crore + 3 lakh") === 12300000 && v("5k*3") === 15000 && v("2 million/4") === 500000);
ok("Indian digit grouping is read", v("1,00,000 + 50,000") === 150000 && v("1,234.5*2") === 2469);
ok("constants and functions", close(v("2*pi"), 2 * Math.PI) && close(v("π*2"), 2 * Math.PI) && v("sqrt(144)+1") === 13 && v("sqrt 81 * 2") === 18 && close(v("sind(30)*2"), 1) && v("5!") === 120 && v("log(1000)") === 3);
ok("a trailing = or ? and 'calculate' are ignored", v("12*3=") === 36 && v("calculate 12*3") === 36 && v("what is 7+8?") === 15);
ok("scientific notation", v("2e3+1") === 2001);
ok("a lone number, a lone percent or a bare word is not a calculation (a lone pi is a question for its value, tested above)", ["100", "hello", "50%", "3.5", "e"].every((q) => evaluateExpression(q) === null));
ok("a date is not arithmetic", evaluateExpression("24-01-2026") === null && evaluateExpression("24/01/26") === null && evaluateExpression("2026-11-12") === null);
ok("a year range is not arithmetic", evaluateExpression("2025-26") === null && evaluateExpression("2025/2026") === null);
ok("a telephone-like or leading-zero number is not arithmetic", evaluateExpression("033-2345678") === null && evaluateExpression("0343-2345") === null);
ok("a sentence, a name, a site, a ticket are not arithmetic", ["who is in charge of blast furnace", "e-Str", "c&it", "ERP", "228757", "D111086", "5 km walk 2026", "holiday list 2026 - 2027"].every((q) => evaluateExpression(q) === null));
ok("an unknown word, division by zero, an open bracket and a stray character give nothing, never an error", ["5 + foo", "5/0", "(2+3", "2 + $3", "2 +", "* 3", "sqrt()"].every((q) => evaluateExpression(q) === null));
ok("nothing can run code: identifiers are only the listed functions and constants", evaluateExpression("process.exit(1)+1") === null && evaluateExpression("constructor+1") === null && evaluateExpression("alert(1)+1") === null);
ok("a very long text is refused", evaluateExpression("1+" + "1+".repeat(200) + "1") === null);
ok("deep brackets do not crash", evaluateExpression("(".repeat(100) + "1" + ")".repeat(100) + "+1") === null);
ok("huge results are refused, not shown as infinity", evaluateExpression("10^400") === null && evaluateExpression("200!") === null);
ok("what was understood is shown tidied", evaluateExpression("15%  of   2400")?.shown === "15% * 2400");

ok("Indian digit grouping in the result", formatNumber(1234567.891) === "12,34,567.891" && formatNumber(1000) === "1,000" && formatNumber(999) === "999" && formatNumber(-123456) === "-1,23,456" && formatNumber(0.5) === "0.5");
ok("floating-point dust is trimmed", formatNumber(0.1 + 0.2) === "0.3" && formatNumber(1 / 3) === "0.3333333333");
ok("very large and very small values use scientific form", /e\+?\d+$/.test(formatNumber(1.5e20)) && /e-\d+$/.test(formatNumber(1.5e-9)));
ok("a large value is also said in lakh and crore", indianWords(12500000) === "1.25 crore" && indianWords(250000) === "2.5 lakh" && indianWords(99999) === null && indianWords(-12500000) === "-1.25 crore");

console.log(`expression selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
