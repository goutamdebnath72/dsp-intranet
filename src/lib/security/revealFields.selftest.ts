// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/lib/security/revealFields.selftest.ts
// THE TICKET NUMBER AND THE SAIL P.No. ARE REVEALED ON A PRESS, AFTER SIGN-IN, AND LOGGED: the reveal route takes the four fields (mobile, email, sailpno, ticket), the P.No. has a cap of its own and is not
// shown if it cannot be logged, every route that returns people or tables masks its answer, and the card has a button for each.
import { readFileSync } from "node:fs";
import { mayReveal, mayRevealPno, PNO_REVEALS_PER_HOUR, REVEALS_PER_HOUR } from "./revealCap";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };
const src = (p: string) => readFileSync(p, "utf8");

(async () => {
  // the caps, with a fake log
  ok("the P.No. cap is far below the general one", PNO_REVEALS_PER_HOUR > 0 && PNO_REVEALS_PER_HOUR * 3 <= REVEALS_PER_HOUR, `${PNO_REVEALS_PER_HOUR} / ${REVEALS_PER_HOUR}`);
  const logOf = (n: number) => async (sql: string) => { void sql; return [{ n }]; };
  ok("below the P.No. cap a reveal is allowed, at the cap it is not", (await mayRevealPno(logOf(PNO_REVEALS_PER_HOUR - 1), "498301")) === true && (await mayRevealPno(logOf(PNO_REVEALS_PER_HOUR), "498301")) === false);
  ok("the general cap is unchanged", (await mayReveal(logOf(REVEALS_PER_HOUR - 1), "498301")) === true && (await mayReveal(logOf(REVEALS_PER_HOUR), "498301")) === false);
  let seen = "";
  await mayRevealPno(async (sql) => { seen = sql; return [{ n: 0 }]; }, "498301");
  ok("the P.No. cap counts only the sailpno rows of that viewer in the last hour", /field = 'sailpno'/.test(seen) && /"viewerTicketNo" = \$1/.test(seen) && /interval '1 hour'/.test(seen));

  // the reveal route
  const rev = src("src/app/api/employees/[id]/reveal/route.ts");
  ok("the route accepts mobile, email, sailpno and ticket, and nothing else", /field !== "mobile" && field !== "email" && field !== "sailpno" && field !== "ticket"/.test(rev));
  ok("it still needs a sign-in first and applies both caps", /Unauthorized/.test(rev) && /mayReveal\(/.test(rev) && /field === "sailpno" && !\(await mayRevealPno\(/.test(rev));
  ok("it takes the P.No. and the ticket from the person's own record (or the roster row of a card with no account)", /"sailPNo" AS "sailPNo"/.test(rev) && /roster:\(/.test(rev) && /FROM public\.employee_roster WHERE id = \$1/.test(rev));
  ok("every reveal is written to the log under its field name, and a P.No. is NOT shown when it could not be logged", /\[\s*crypto\.randomUUID\(\),[\s\S]*?\bfield,/.test(rev) && /field === "sailpno" && !logged/.test(rev));

  // every route that returns people or tables masks the answer
  const routes: Array<[string, RegExp]> = [
    ["src/app/api/employees/search/route.ts", /maskAnswer\(ticket \|\| !VISITOR_CUT_ENABLED \? results : visitorView\(results\), \{ signedIn: !!ticket \}\)/],
    ["src/app/api/ai-search/route.ts", /maskAnswer\(cut, \{ signedIn \}\)/],
    ["src/app/api/omnibar/more/route.ts", /maskAnswer\(\{[\s\S]*?\}, \{ signedIn: true \}\)/],
    ["src/app/api/employees/route.ts", /maskAnswer\(results, \{ signedIn: true \}\)/],
  ];
  for (const [f, re] of routes) ok(`${f} masks its answer on the way out`, re.test(src(f)));
  ok("the search route shapes every answer (it no longer passes a signed-in answer through untouched)", /const res = await shaped\(answered, !!\(await getSessionTicket\(\)\)\)/.test(src("src/app/api/ai-search/route.ts")));

  // the card
  const omni = src("src/components/OmnibarModal.tsx");
  ok("the card has a button for the ticket and for the P.No. that ask for the reveal", /onReveal\(emp\.id, "ticket"\)/.test(omni) && /onReveal\(emp\.id, "sailpno"\)/.test(omni));
  ok("a revealed value replaces the mask (ticket keeps its colour, read from the real ticket)", /rev\.ticket \? \(\s*<TicketText ticket=\{rev\.ticket\}/.test(omni) && /<span>\{rev\.sailpno\}<\/span>/.test(omni) && /origin=\{emp\.ticketOrigin\}/.test(omni));
  ok("Copy takes the ticket and the P.No. only if they were revealed", /rev\.ticket,\s*rev\.sailpno,/.test(omni) && !/^\s*emp\.ticketNo,\s*$/m.test(omni));
  ok("a refused reveal (the cap) or a log fault is said under the card", /setRevealNotice\(/.test(omni) && /role="alert"/.test(omni));
  ok("a masked ticket never decides who is the same person", /const whole = \(t: string\) => \/\^\\d\+\$\/\.test\(t\)/.test(src("src/lib/search/loginHints.ts")));
  console.log(`revealFields selftest: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
