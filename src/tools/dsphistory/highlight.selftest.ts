// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/tools/dsphistory/highlight.selftest.ts
// I test here where the words of a quote are on a PDF page: pieces of a line, a raised "th", curly quotes, a sentence over two lines, a quote that is not there, two places, and the part of a piece the quote covers.
import { findQuote, multiply, pieceOf, plain, type Piece } from "./highlight";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };
const P = (str: string, x: number, y: number, w: number, h = 10): Piece => ({ str, x, y, w, h });

ok("plain: lower case, no spaces, straight quotes and hyphens", plain("  The Plant’s  “first” – iron\n") === "theplant's\"first\"-iron");
const one = findQuote([P("The Plant started iron production on ", 10, 20, 370), P("26", 380, 20, 20), P("th", 400, 14, 10, 6), P(" December 1959.", 410, 20, 140)], "The Plant started iron production on 26th December 1959.");
ok("a sentence cut into pieces, with a raised 'th' of its own, is found and covers every piece from the first to the last", one.length === 4 && one[0].x === 10 && one[3].x + one[3].w > 540);
const two = findQuote([P("with an investment of Rs. 189.6 Crores including", 40, 100, 400), P("Rs. 17.36 Crores for township development", 40, 120, 300), P("Other text on the line below", 40, 140, 250)], "with an investment of Rs. 189.6 Crores including Rs. 17.36 Crores for township development");
ok("a sentence over two lines gives a rectangle on each line and none on the next line", two.length === 2 && two[0].y === 100 && two[1].y === 120);
ok("curly quotes and a different hyphen on the page still match the straight ones in the quote", findQuote([P("the ‘SAILCON’ co–operation", 0, 0, 100)], "'SAILCON' co-operation").length === 1);
ok("words that are not on the page give no rectangle (nothing is guessed)", findQuote([P("Some other sentence", 0, 0, 100)], "The Plant started iron production").length === 0 && findQuote([P("x", 0, 0, 1)], "").length === 0);
ok("a quote written twice on the page is marked in both places", findQuote([P("iron production", 0, 0, 100), P("and again iron production", 0, 20, 200)], "iron production").length === 2);
const part = findQuote([P("ABCDEFGHIJ", 100, 50, 100)], "defg");
ok("inside one piece only the part the quote covers is marked, in proportion to the characters (D..G of ten is 30 to 70 per cent of its width)", part.length === 1 && Math.abs(part[0].x - 130) < 1e-9 && Math.abs(part[0].w - 40) < 1e-9);
const colL = (y: number, str: string) => P(str, 40, y, 400), colR = (y: number, str: string) => P(str, 520, y, 400);
const cols = findQuote([colL(10, "ISCON, the British consortium of 13 companies,"), colR(10, "Kumaresh Chandra Ghosh recalls: the Tamla Bridge had"), colL(30, "was awarded the construction contract in 1956."), colR(30, "broken, causing obstruction to the GT Road. So, the Chief"), colL(50, "Simultaneously, a total of 6,568 hectares"), colR(50, "Minister ordered that all vehicles be diverted into"), colL(70, "of land was acquired."), colR(70, "the DSP premises through the ASP Main Gate and then")], "ISCON, the British consortium of 13 companies, was awarded the construction contract in 1956.");
ok("a page in two columns, cut by pdf.js line by line ACROSS the columns, still finds a sentence that runs down one column (read column by column), and marks only that column's lines", cols.length === 2 && cols.every((r) => r.x === 40));
const stray = findQuote([P("Minister. Threads of his dream of transforming India from an", 10, 10, 400), P("I", 10, 30, 22), P("agrarian country into an industrially advanced nation were", 40, 30, 400)], "Threads of his dream of transforming India from an agrarian country into an industrially advanced nation");
ok("a stray one-letter piece between two lines (a decorative 'I' kept by the text layer) does not stop the sentence being found", stray.length === 2);
const wide = findQuote([P("iii WWW", 0, 0, 100)], "www", (t) => [...t].reduce((n, c) => n + (c === "W" || c === "w" ? 3 : c === " " ? 1 : 1), 0));
ok("when the caller measures widths the rectangle follows them: 'WWW' after 'iii ' (4 narrow, 9 wide of 13) starts 4/13 of the way and is 9/13 wide", wide.length === 1 && Math.abs(wide[0].x - (100 * 4) / 13) < 1e-9 && Math.abs(wide[0].w - (100 * 9) / 13) < 1e-9);
const m = multiply([2, 0, 0, -2, 0, 800], [1, 0, 0, 1, 50, 60]);
ok("the matrix product places a page point: (50,60) under a scale of 2 that flips the page on a height of 800 is (100, 680)", m[4] === 100 && m[5] === 680);
const pc = pieceOf({ str: "Hello", transform: [10, 0, 0, 10, 50, 60], width: 30 }, [2, 0, 0, -2, 0, 800], 2);
ok("a pdf.js text item becomes a piece: its left edge, its top (baseline minus the font height) and its width at the page's scale", pc.x === 100 && pc.w === 60 && pc.y === 680 - 20 && pc.h === 20);

console.log(`highlight: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
