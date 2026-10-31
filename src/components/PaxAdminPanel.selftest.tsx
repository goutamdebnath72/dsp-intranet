// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/components/PaxAdminPanel.selftest.tsx
// Step 64a: the PAX directory editor as it is drawn: the three inputs, the questions when an entry clashes with a saved one, the lists, the tabs each person sees, and that all text is escaped.
// (The clicks and the requests are covered by the server tests: src/lib/pax/admin/*.selftest.ts.)

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ConflictView, EntryFormView, EntryList, HistoryList, PaxAdminPanel, conflictText } from "./PaxAdminPanel";
import type { PaxConflict, PaxEntryView } from "@/lib/pax/admin/types";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) pass++;
  else { fail++; console.log(`FAIL ${name} ${extra}`); }
};
const h = (el: React.ReactElement) => renderToStaticMarkup(el);
const noop = () => {};

// ---- the three inputs ----
const form = h(<EntryFormView idPrefix="pax-add" values={{ department: "Stores", location: "", number: "42555" }} errors={{}} busy={false} submitLabel="Check and save" onChange={noop} onSubmit={noop} />);
ok("three labelled inputs: Department, Location, PAX number", /for="pax-add-department"[^>]*>Department</.test(form) && /for="pax-add-location"[^>]*>Location</.test(form) && /for="pax-add-number"[^>]*>PAX number</.test(form) && (form.match(/<input /g) ?? []).length === 3);
ok("the number input allows five characters and a numeric keypad, and says the rule in words", /id="pax-add-number"[^>]*maxLength="5"/.test(form) && /inputMode="numeric"/.test(form) && form.includes("exactly 5 digits and starts with 4"));
ok("the location hint says what an empty location shows (Office)", form.includes("Leave empty if there is none: the table then shows Office."));
ok("what was typed is in the fields", form.includes('value="Stores"') && form.includes('value="42555"'));
ok("NO <form> tag (the search modal holds a text area: forms must not nest)", !/<form/i.test(form));
const bad = h(<EntryFormView idPrefix="pax-add" values={{ department: "", location: "", number: "52555" }} errors={{ department: "Type the department.", number: "A PAX number is exactly 5 digits and starts with 4 (for example 42046)." }} busy={false} submitLabel="Go" onChange={noop} onSubmit={noop} />);
ok("an error replaces the hint, is announced (role alert), and is red", /role="alert"[^>]*>Type the department\./.test(bad) && /text-red-700/.test(bad) && !bad.includes("For example CISF, Weigh Bridge, Fire Service."), bad.slice(0, 300));
ok("...only the fields that are wrong are marked invalid", (bad.match(/aria-invalid="true"/g) ?? []).length === 2);
const off = h(<EntryFormView idPrefix="pax-edit" values={{ department: "Weigh Bridge", location: "60T", number: "40173" }} errors={{}} busy={false} submitLabel="Check and save the change" submitDisabled={true} submitHint="To save, change the PAX number to a different number: exactly 5 digits, starting with 4." onChange={noop} onSubmit={noop} />);
ok("a form can keep its button OFF (greyed) and says in words what is still needed", /<button[^>]*disabled=""[^>]*>Check and save the change</.test(off) && off.includes('data-submit-hint="true"') && off.includes("To save, change the PAX number to a different number"));
ok("...when the button is on, there is no hint", !h(<EntryFormView idPrefix="pax-edit" values={{ department: "A1", location: "", number: "42046" }} errors={{}} busy={false} submitLabel="Go" submitDisabled={false} submitHint="x" onChange={noop} onSubmit={noop} />).includes("data-submit-hint"));
ok("the add form is unchanged: its button is on when not busy", !/<button[^>]*disabled=""[^>]*>Check and save</.test(form));
ok("a busy form cannot be sent again: the button is disabled", /<button[^>]*disabled=""[^>]*>Check and save</.test(h(<EntryFormView idPrefix="p" values={{ department: "", location: "", number: "" }} errors={{}} busy={true} submitLabel="Check and save" onChange={noop} onSubmit={noop} />)));
ok("all typed text is escaped (a script in a field is text, not markup)", !h(<EntryFormView idPrefix="p" values={{ department: "<img src=x onerror=alert(1)>", location: "", number: "" }} errors={{}} busy={false} submitLabel="Go" onChange={noop} onSubmit={noop} />).includes("<img"));

// ---- the questions when an entry clashes ----
const W60: PaxEntryView = { id: 6, department: "Weigh Bridge", location: "60T", number: "40173" };
const T1: PaxEntryView = { id: 4, department: "CISF", location: "Tumla Gate", number: "40926" };
const T2: PaxEntryView = { id: 5, department: "CISF", location: "Tumla Gate", number: "42043" };
const cn: PaxConflict[] = [{ kind: "same-number", existing: [W60] }];
const c1 = h(<ConflictView conflicts={cn} acknowledgeable={[]} entry={{ department: "Canteen", location: "", number: "40173" }} busy={false} onEdit={noop} onFix={noop} onAcknowledge={noop} />);
ok("a number clash names the line that has it, in the table's words, and says a number belongs to one place", c1.includes("The number 40173 is already assigned to Weigh Bridge - 60T. A PAX number belongs to one place only."));
ok("...asks the owner's question: edit an existing line, or a mistake?", c1.includes("Do you want to edit an existing line, or have you made a mistake?"));
ok("...offers to EDIT that very line, and to correct the entry", c1.includes("Edit Weigh Bridge - 60T (40173)") && c1.includes("I made a mistake: let me correct my entry"));
ok("...a number clash has NO 'add it anyway' button", !c1.includes("another number of this place") && !c1.includes("It is a different place"));
ok("...it is announced (role alert)", c1.includes('role="alert"'));
const cp: PaxConflict[] = [{ kind: "same-place", existing: [T1, T2] }];
const c2 = h(<ConflictView conflicts={cp} acknowledgeable={["second-number"]} entry={{ department: "CISF", location: "Tumla Gate", number: "42777" }} busy={false} onEdit={noop} onFix={noop} onAcknowledge={noop} />);
ok("a same-place clash says the place is saved and lists ALL its numbers (40926 / 42043)", c2.includes("CISF - Tumla Gate is already saved with 40926 / 42043."));
ok("...offers 'another number of this place' (only because it can be true), and an edit button for each saved line", c2.includes("Yes, 42777 is another number of this place") && c2.includes("Edit CISF - Tumla Gate (40926)") && c2.includes("Edit CISF - Tumla Gate (42043)") && !c2.includes("It is a different place"));
const cs: PaxConflict[] = [{ kind: "similar-place", existing: [{ id: 11, department: "Fire Service", location: "", number: "42050" }] }];
const c3 = h(<ConflictView conflicts={cs} acknowledgeable={["different"]} entry={{ department: "Fire Servise", location: "", number: "42888" }} busy={false} onEdit={noop} onFix={noop} onAcknowledge={noop} />);
ok("a similar-place clash says it reads almost like the saved line (an empty location left out), and offers 'a different place'", c3.includes("What you typed reads almost like Fire Service (42050).") && c3.includes("It is a different place: add it") && !c3.includes("another number of this place"));
ok("conflictText for a number on two lines names both", conflictText({ kind: "same-number", existing: [{ id: 4, department: "CISF", location: "Tumla Gate", number: "42043" }, { id: 10, department: "Weigh Bridge", location: "Tumla Gate", number: "42043" }] }, { department: "x", location: "", number: "42043" }).includes("CISF - Tumla Gate; Weigh Bridge - Tumla Gate"));
ok("a line listed twice in two clashes gets ONE edit button", (h(<ConflictView conflicts={[{ kind: "same-number", existing: [W60] }, { kind: "similar-place", existing: [W60] }]} acknowledgeable={[]} entry={{ department: "x", location: "", number: "40173" }} busy={false} onEdit={noop} onFix={noop} onAcknowledge={noop} />).match(/>Edit Weigh Bridge/g) ?? []).length === 1);
ok("the buttons of a busy question are disabled", (h(<ConflictView conflicts={cp} acknowledgeable={["second-number"]} entry={{ department: "CISF", location: "Tumla Gate", number: "42777" }} busy={true} onEdit={noop} onFix={noop} onAcknowledge={noop} />).match(/disabled=""/g) ?? []).length >= 4);
ok("saved text is escaped in a clash message", !h(<ConflictView conflicts={[{ kind: "same-number", existing: [{ id: 1, department: "<b>x</b>", location: "<script>", number: "42000" }] }]} acknowledgeable={[]} entry={{ department: "a", location: "", number: "42000" }} busy={false} onEdit={noop} onFix={noop} onAcknowledge={noop} />).match(/<script>|<b>x<\/b>/));

// ---- the lists ----
const list = h(<EntryList entries={[W60, T1]} actionLabel="Change" actionClass="x" busy={false} onPick={noop} />);
ok("the list shows Department, Location, PAX and a button per line that says which line it is for", list.includes(">Department<") && list.includes(">Location<") && list.includes(">PAX<") && list.includes('aria-label="Change Weigh Bridge - 60T (40173)"') && list.includes("Tumla Gate"));
ok("an empty location is shown as Office", h(<EntryList entries={[{ id: 1, department: "Fire Service", location: "", number: "42050" }]} actionLabel="Change" actionClass="x" busy={false} onPick={noop} />).includes(">Office<"));
ok("no lines: a plain sentence", h(<EntryList entries={[]} actionLabel="Change" actionClass="x" busy={false} onPick={noop} />).includes("No saved line matches."));
ok("a long list is cut with a word about narrowing it", h(<EntryList entries={Array.from({ length: 45 }, (_, i) => ({ id: i + 1, department: `D${i}`, location: "", number: String(40000 + i) }))} actionLabel="Change" actionClass="x" busy={false} onPick={noop} />).includes("5 more: type more of the name or the number to narrow the list."));
const H = (over: Partial<import("@/lib/pax/admin/types").PaxAuditView>): import("@/lib/pax/admin/types").PaxAuditView => ({ at: "2026-10-31T10:00:00.000Z", actorName: "MOHD ANWAR ULLAH", actorTicket: "498301", actorRole: "hod", actorDesignation: "Chief Manager", action: "add", department: "Stores", location: "Main Gate", number: "42555", detail: "", summary: "", ...over });
const hist = h(<HistoryList history={[
  H({}),
  H({ action: "modify", department: "Weigh Bridge", location: "60 Ton", number: "40174", detail: "Weigh Bridge - 60T (40173)", at: "2026-10-31T11:00:00.000Z" }),
  H({ action: "delete", department: "Garage", location: "", number: "42556", actorName: "RAKESH OJHA", actorTicket: "412345", actorRole: "delegate", actorDesignation: "Manager", at: "2026-10-31T12:00:00.000Z" }),
  H({ action: "grant", department: "", location: "", number: "", detail: "RAKESH OJHA (412345)", at: "2026-10-31T13:00:00.000Z" }),
]} />);
ok("the history is a TABLE with these columns: When, What, Department, Location, PAX, Done by", ["When", "What", "Department", "Location", "PAX", "Done by"].every((c) => hist.includes(`>${c}<`)) && hist.includes("<table") && hist.includes('data-pax-history="true"'));
ok("an added line: Added, then its department, location and number in their own cells", /<td[^>]*><span[^>]*>Added<\/span><\/td><td[^>]*>Stores<\/td><td[^>]*>Main Gate<\/td><td[^>]*>42555<\/td>/.test(hist), hist.slice(0, 600));
ok("a changed line shows the NEW line and says what it was", hist.includes(">Changed<") && hist.includes("was Weigh Bridge - 60T (40173)") && hist.includes(">60 Ton<") && hist.includes(">40174<"));
ok("a deleted line shows the line that went; an empty location is shown as Office", hist.includes(">Deleted<") && hist.includes(">Garage<") && hist.includes(">42556<") && />Garage<\/td><td[^>]*>Office<\/td>/.test(hist));
ok("an authorisation has no line: three dashes, and the executive is named under the action", hist.includes(">Authorised<") && hist.includes("RAKESH OJHA (412345)") && (hist.match(/>—</g) ?? []).length === 3);
ok("who did it: the name, the TICKET NUMBER, and the DESIGNATION (with the role)", hist.includes("MOHD ANWAR ULLAH") && hist.includes("(498301)") && hist.includes("Chief Manager · HOD of C&amp;IT") && hist.includes("RAKESH OJHA") && hist.includes("(412345)") && hist.includes("Manager · authorised executive"));
ok("without a post in the directory, only the role is shown (no empty dot)", h(<HistoryList history={[H({ actorDesignation: "" })]} />).includes(">HOD of C&amp;IT<") && !h(<HistoryList history={[H({ actorDesignation: "" })]} />).includes("· HOD"));
ok("history text is escaped", !h(<HistoryList history={[H({ department: "<img src=x onerror=alert(1)>", actorName: "<b>x</b>" })]} />).match(/<img|<b>x/));
ok("an empty history says so", h(<HistoryList history={[]} />).includes("No change has been made from this panel yet."));

// ---- the panel: what each person sees first ----
const hod = h(<PaxAdminPanel open={{ op: "add", role: "hod" }} />);
ok("the HOD sees all five tabs, with the role named", ["Add", "Change", "Delete", "Authorised people", "Recent changes"].every((t) => hod.includes(t)) && hod.includes('data-role="hod"') && hod.includes("HOD of C&amp;IT"));
const del = h(<PaxAdminPanel open={{ op: "add", role: "delegate" }} />);
ok("an authorised executive sees NO 'Authorised people' tab, and is named as such", !del.includes("Authorised people") && del.includes("Authorised executive") && del.includes('data-role="delegate"') && del.includes("Recent changes"));
ok("'add' opens the add form first (three inputs)", hod.includes('data-pax-form="pax-add"') && hod.includes("Every entry is checked against what is saved."));
ok("the number the HOD typed in the search bar is already in the form: 'add pax 42555 for Garage'", (() => { const x = h(<PaxAdminPanel open={{ op: "add", role: "hod", prefill: { number: "42555", department: "garage" } }} />); return x.includes('value="42555"') && x.includes('value="garage"'); })());
ok("'modify' opens on the search for a saved line, with his words in it", (() => { const x = h(<PaxAdminPanel open={{ op: "modify", role: "hod", prefill: { query: "fire service" } }} />); return x.includes("Find a saved line") && x.includes('value="fire service"') && !x.includes('data-pax-form="pax-add"'); })());
ok("'delete' opens on the same search", h(<PaxAdminPanel open={{ op: "delete", role: "hod" }} />).includes("Find a saved line"));
ok("'delegate' opens the authorised-people tab for the HOD", h(<PaxAdminPanel open={{ op: "delegate", role: "hod" }} />).includes("Executives who may change PAX numbers") && !h(<PaxAdminPanel open={{ op: "delegate", role: "hod" }} />).includes('data-pax-form="pax-add"'));
ok("a delegate who somehow gets the 'delegate' op still gets no people tab content (the server refuses anyway)", !h(<PaxAdminPanel open={{ op: "delegate", role: "delegate" }} />).includes("Authorise an executive"));
ok("the tabs are a real tab list with the chosen one marked", hod.includes('role="tablist"') && /role="tab" aria-selected="true"[^>]*>[^<]*(<svg[^>]*>.*?<\/svg>)?Add/.test(hod.replace(/\n/g, "")));
ok("all panel text is escaped (a prefill with a tag is text)", !h(<PaxAdminPanel open={{ op: "add", role: "hod", prefill: { department: "<img src=x onerror=alert(1)>" } }} />).includes("<img"));

// ---- guards for the two ways a form can hang (the tests above draw on the server, where effects never run; the clicks are covered by the sandbox run described in STATUS) ----
import { readFileSync } from "node:fs";
const src = readFileSync("src/components/PaxAdminPanel.tsx", "utf8");
ok("the 'still mounted' flag is switched ON again at every mount (React's StrictMode, used by npm run dev, mounts, unmounts and mounts again: without this every answer is thrown away and the button stays greyed)", /useEffect\(\(\) => \{\s*alive\.current = true;\s*return \(\) => \{ alive\.current = false; \};\s*\}, \[\]\);/.test(src) && !/useEffect\(\(\) => \(\) => \{ alive\.current = false; \}, \[\]\)/.test(src));
ok("a request that is not answered ends: the call is aborted after a time limit and the timer is cleared", /AbortController/.test(src) && /REQUEST_TIMEOUT_MS = 20_000/.test(src) && /signal: ctl\.signal/.test(src) && /clearTimeout\(timer\)/.test(src));
ok("a missing-table reply (503) shows the server's own sentence on screen, not a generic one", /String\(r\.body\.error \?\? "Something went wrong/.test(src));

console.log(`PaxAdminPanel selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
