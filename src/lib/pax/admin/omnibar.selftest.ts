// Run (from the project root): npx tsx --tsconfig tsconfig.json src/lib/pax/admin/omnibar.selftest.ts
// Step 64a: the search bar and the PAX editor. A sentence that means "change the PAX directory" opens the editor for the HOD C&IT and for an executive he authorised; for anyone else a plain message says why not.
// The person is the LOGIN's ticket, never anything typed. A question about the directory is NOT such a sentence and goes on exactly as before.

import { readFileSync } from "node:fs";
import { runOmnibar } from "../../nl2sql/omnibar";
import { answerPaxAdmin } from "./omnibar";
import type { Authority } from "./store";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) pass++;
  else { fail++; console.log(`FAIL ${name} ${extra}`); }
};

const asked: string[] = [];
const authorityIs = (role: Authority | null) => ({ authority: async (t: string) => { asked.push(t); return role; } });
const headline = (p: Awaited<ReturnType<typeof answerPaxAdmin>>) => p?.hospital?.headline?.text;

async function main() {
  // ---- who gets the editor ----
  let p = await answerPaxAdmin("add new pax number", "400001", authorityIs("hod"));
  ok("the HOD asking to add a pax number gets the editor (op add, role hod)", p?.paxAdmin?.op === "add" && p.paxAdmin.role === "hod" && !p.hospital, JSON.stringify(p));
  p = await answerPaxAdmin("add pax 42555 for Garage", "400001", authorityIs("hod"));
  ok("...with the number and the department already in the form", p?.paxAdmin?.prefill?.number === "42555" && p.paxAdmin.prefill.department === "garage", JSON.stringify(p?.paxAdmin));
  p = await answerPaxAdmin("delete pax 42046", "400001", authorityIs("hod"));
  ok("'delete pax 42046' opens the delete search on that number", p?.paxAdmin?.op === "delete" && p.paxAdmin.prefill?.number === "42046");
  p = await answerPaxAdmin("delegate pax to Rakesh Ojha", "400001", authorityIs("hod"));
  ok("the HOD asking to delegate gets the editor on the people tab (op delegate)", p?.paxAdmin?.op === "delegate" && p.paxAdmin.role === "hod");
  p = await answerPaxAdmin("edit pax number", "412345", authorityIs("delegate"));
  ok("an authorised executive gets the editor, as a delegate", p?.paxAdmin?.op === "modify" && p.paxAdmin.role === "delegate");
  p = await answerPaxAdmin("revoke pax access of Rakesh Ojha", "412345", authorityIs("delegate"));
  ok("an authorised executive asking to authorise or revoke is told that only the HOD does that (no editor)", !p?.paxAdmin && headline(p) === "Not allowed" && /Only the HOD of C&IT can authorise/.test(p?.answer ?? ""), JSON.stringify(p));
  // ---- who does not ----
  p = await answerPaxAdmin("add new pax number", null, authorityIs("hod"));
  ok("nobody logged in: asked to log in, no editor", !p?.paxAdmin && headline(p) === "Please log in" && /Log in with your ticket number/.test(p?.answer ?? ""));
  p = await answerPaxAdmin("add new pax number", "123456", authorityIs(null));
  ok("logged in without authority: 'Not allowed', and it says who can", !p?.paxAdmin && headline(p) === "Not allowed" && p?.hospital?.headline?.tone === "no" && /Only the HOD of C&IT, or an executive he has authorised/.test(p?.answer ?? ""));
  p = await answerPaxAdmin("add new pax number", "400001", { authority: async () => { throw new Error("db down"); } });
  ok("when the authority cannot be read, the editor is NEVER opened on doubt", !p?.paxAdmin && headline(p) === "Not allowed");
  ok("the person is the login's ticket: the ticket is what is asked, whatever the sentence says ('add pax as 400001')", await (async () => { asked.length = 0; await answerPaxAdmin("add pax as ticket 400001", "123456", authorityIs(null)); return asked.join() === "123456"; })());
  // ---- what is not a request ----
  asked.length = 0;
  for (const q of ["pax number of fire service", "who has 42043", "pax", "how many pax numbers", "phone number of Rakesh Ojha", "contact number of departments", "show new pax numbers", "add a holiday", "update the leave policy", "delete my account"]) {
    ok(`"${q}" is not a request to change the directory: null, and nobody is asked`, (await answerPaxAdmin(q, "400001", authorityIs("hod"))) === null);
  }
  ok("...the database is never asked about a sentence that is not such a request", asked.length === 0);

  // ---- inside runOmnibar ----
  const c = { pax: [] as string[], paxAdmin: [] as Array<[string, string | null]>, hospital: 0, model: 0, client: 0 };
  const deps = (over: object = {}) =>
    ({
      enabled: true, verifiedMin: 1, skipModel: true, legacy: async () => null, holiday: async () => null,
      hospital: async () => { c.hospital++; return null; },
      paxAdmin: async (q: string, t: string | null) => { c.paxAdmin.push([q, t]); return answerPaxAdmin(q, t, authorityIs(t === "400001" ? "hod" : null)); },
      pax: async (q: string) => { c.pax.push(q); return null; },
      llm: async () => { c.model++; throw new Error("no model"); },
      withClient: async () => { c.client++; throw new Error("the model's client must not be used"); },
      ...over,
    }) as never;
  type P = { kind: string; paxAdmin?: { op: string; role: string }; hospital?: { headline?: { text: string } }; source?: string; attempt?: number };
  let o = (await runOmnibar("add new pax number", "400001", deps())) as P;
  ok("runOmnibar: the HOD's sentence returns the editor, tagged with the feedback source of the other PAX answers, attempt 1", o?.paxAdmin?.op === "add" && o.paxAdmin.role === "hod" && o.source === "holiday" && o.attempt === 1, JSON.stringify(o));
  ok("...it never reached the PAX search, the hospital route, the model or the model's client; the ticket given is the login's", c.pax.length === 0 && c.hospital === 0 && c.model === 0 && c.client === 0 && c.paxAdmin[0][1] === "400001");
  c.pax = []; c.paxAdmin = [];
  o = (await runOmnibar("pax number of fire service", "400001", deps())) as P;
  ok("a QUESTION about the directory still goes to the PAX search (the editor route read it and let it pass)", c.pax.length === 1 && !o?.paxAdmin);
  o = (await runOmnibar("add new pax number", "123456", deps())) as P;
  ok("a stranger's sentence returns the plain message, never the editor", o?.hospital?.headline?.text === "Not allowed" && !o.paxAdmin);
  c.paxAdmin = [];
  o = (await runOmnibar("add new pax number", "400001", deps(), { logId: null, reason: "other" as never, note: null, attempt: 1 })) as P;
  ok("a RETRY (a 'No' on an earlier answer) does not open the editor again", c.paxAdmin.length === 0);
  o = (await runOmnibar("add new pax number", "400001", deps({ paxAdmin: async () => { throw new Error("db down"); } }))) as P;
  ok("a failing editor route never breaks the omnibar: the other routes go on", o === null || !o.paxAdmin);
  o = (await runOmnibar("add new pax number", "400001", { ...(deps() as object), paxAdmin: undefined } as never)) as P;
  ok("an older caller without the dependency still works (optional, like the others)", !o?.paxAdmin);

  // ---- the wiring in the files ----
  const src = readFileSync("src/lib/nl2sql/omnibar.ts", "utf8");
  const wiring = src.slice(src.indexOf("paxAdmin: async (qq, ticket)"), src.indexOf("pax: async (qq)"));
  const code = (t: string) => t.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
  ok("omnibar.ts wires the editor route to the application's own connection (getDb) and to authorityForTicket", wiring.includes("getDb") && wiring.includes("authorityForTicket") && wiring.includes("answerPaxAdmin"), wiring.slice(0, 200));
  ok("...never to the model's client (withClient, nlq_reader, NL2SQL_DATABASE_URL)", !/withClient|withDefaultClient|nlq_reader|NL2SQL_DATABASE_URL/.test(code(wiring)));
  ok("...and the editor route comes BEFORE the PAX search in runOmnibar", src.indexOf("deps.paxAdmin ?") > 0 && src.indexOf("deps.paxAdmin ?") < src.indexOf("deps.pax ?"));
  const modal = readFileSync("src/components/OmnibarModal.tsx", "utf8");
  ok("the modal draws the editor when the answer carries it, before the other cards", modal.includes('import { PaxAdminPanel } from "@/components/PaxAdminPanel"') && modal.indexOf("analytics.paxAdmin ?") > 0 && modal.indexOf("analytics.paxAdmin ?") < modal.indexOf("analytics.hospital ?"));
  const route = readFileSync("src/app/api/pax/admin/route.ts", "utf8");
  ok("the request route takes the person from the login (sessionActor), checks the origin, and never reads a ticket from the body", route.includes("sessionActor") && route.includes("isSameOrigin") && !/body\.ticket|b\.actor/.test(route));
  ok("...its code never touches the model's client either", !/withClient|withDefaultClient|nlq_reader/.test(code(route)) && !/withClient|withDefaultClient|nlq_reader/.test(code(readFileSync("src/lib/pax/admin/access.ts", "utf8"))));
  ok("the tables of the editor are not in the model's schema: no nlq view or prompt mentions them", !/pax_delegate|pax_directory_audit|facility_delegate|facility_audit/.test(readFileSync("src/lib/nl2sql/context.ts", "utf8")));

  // ---- THE NAME TRAVELS WITH THE ANSWER (step 67b): the editor's header has it on the first paint ----
  const NAMES: Record<string, string | null> = { "400001": "MOHD ANWAR ULLAH", "412345": "  RAKESH OJHA  " };
  const nameOf = async (t: string) => NAMES[t] ?? null;
  p = await answerPaxAdmin("add new pax number", "400001", { ...authorityIs("hod"), nameOf });
  ok("the HOD's name is in the payload that opens the editor (so the header has it at once, with no request)", p?.paxAdmin?.name === "MOHD ANWAR ULLAH" && p.paxAdmin.role === "hod");
  p = await answerPaxAdmin("edit pax number", "412345", { ...authorityIs("delegate"), nameOf });
  ok("an authorised executive's own name is sent, trimmed", p?.paxAdmin?.name === "RAKESH OJHA" && p.paxAdmin.role === "delegate");
  p = await answerPaxAdmin("add new pax number", "400001", { ...authorityIs("hod"), nameOf: async () => "   " });
  ok("a blank name is left out of the payload (the panel will ask for it)", p?.paxAdmin !== undefined && !("name" in (p?.paxAdmin ?? {})));
  p = await answerPaxAdmin("add new pax number", "400001", { ...authorityIs("hod"), nameOf: async () => { throw new Error("directory down"); } });
  ok("if the name cannot be read the editor STILL opens, without a name", p?.paxAdmin?.op === "add" && !("name" in (p?.paxAdmin ?? {})));
  p = await answerPaxAdmin("add new pax number", "400001", authorityIs("hod"));
  ok("without a name function (as before) the payload is what it always was", p?.paxAdmin?.role === "hod" && !("name" in (p?.paxAdmin ?? {})));
  p = await answerPaxAdmin("add new pax number", "499999", { ...authorityIs(null), nameOf: async () => "SOMEBODY" });
  ok("a person with no authority gets a plain sentence and his name is not sent anywhere", !p?.paxAdmin && JSON.stringify(p).indexOf("SOMEBODY") < 0);
  let nameAsked = 0;
  const notRequest = await answerPaxAdmin("who has pax 42046", "400001", { ...authorityIs("hod"), nameOf: async () => { nameAsked++; return "X"; } });
  ok("a question about the directory (not a change request) never reaches the name lookup", notRequest === null && nameAsked === 0);
  ok("the authority and the name are asked TOGETHER (both start before either answers): the name adds no waiting", await (async () => {
    let release!: () => void;
    const nameStarted = new Promise<void>((res) => { release = res; });
    const run = answerPaxAdmin("add new pax number", "400001", { authority: async () => { await nameStarted; return "hod" as Authority; }, nameOf: async () => { release(); return "MOHD ANWAR ULLAH"; } });
    const out = await Promise.race([run, new Promise<"timeout">((res) => setTimeout(() => res("timeout"), 800))]);
    return out !== "timeout" && (out as Awaited<ReturnType<typeof answerPaxAdmin>>)?.paxAdmin?.name === "MOHD ANWAR ULLAH";
  })());
  ok("the search bar's wiring hands the editor the directory's name function (the one the session's actor already uses)", /nameOf: async \(t\) => nameOfTicket\(await getDb\(\), t\)/.test(wiring) && /authorityForTicket, nameOfTicket \} = await import\("@\/lib\/pax\/admin\/access"\)/.test(wiring));

  console.log(`pax admin omnibar selftest: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main();
