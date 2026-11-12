// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/lib/ui/identifiers.selftest.ts
import { isIdentifierLabel, isLongDigitRun, stripIdentifierSeparators } from "./identifiers";
let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };
const s = (t: string) => stripIdentifierSeparators(t).text;

ok("an account number after its label loses the commas", s("Account Number: 34,42,04,00,623 at SBI") === "Account Number: 34420400623 at SBI");
ok("also in the western grouping and with spaces", s("A/c No. 3,083,000,100,179,875") === "A/c No. 3083000100179875" && s("account 1824 0100 1380") === "account 182401001380");
ok("a policy and a cheque number", s("Policy Number: 0315,054,224,110 and cheque no 123,456,789") === "Policy Number: 0315054224110 and cheque no 123456789");
ok("an unbroken number is left as it is", s("Account Number: 34420400623") === "Account Number: 34420400623" && stripIdentifierSeparators("Account Number: 34420400623").changed.length === 0);
ok("a rupee amount keeps its grouping", s("deposit ₹ 10,00,000 and Rs. 1,00,00,000/- and Rs 13,478.00") === "deposit ₹ 10,00,000 and Rs. 1,00,00,000/- and Rs 13,478.00");
ok("a grouped amount with no label and fewer than nine digits is an amount", s("up to 45,000 employees and 12,50,000 votes") === "up to 45,000 employees and 12,50,000 votes");
ok("a grouped run of nine digits or more with no rupee sign is an identifier", s("the number 34,42,04,00,623 is printed") === "the number 34420400623 is printed");
ok("a date or a year is untouched", s("on 24.01.2026 and 2026, 2027") === "on 24.01.2026 and 2026, 2027");
ok("labels: account, IFSC, policy, cheque are identifier labels; amount, premium, rent are not", isIdentifierLabel("Account Number") && isIdentifierLabel("IFSC Code") && isIdentifierLabel("Policy No.") && !isIdentifierLabel("Premium Amount") && !isIdentifierLabel("Monthly Rent") && !isIdentifierLabel("Total") && !isIdentifierLabel("Number of employees") && !isIdentifierLabel("No. of candidates"));
ok("nine digits or more is a long run; a year and an amount are not", isLongDigitRun("34420400623") && isLongDigitRun("3083000100179875") && !isLongDigitRun("20995") && !isLongDigitRun("2026") && !isLongDigitRun("13478.00"));

console.log(`identifiers selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
