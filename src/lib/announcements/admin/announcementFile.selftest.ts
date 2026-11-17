// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/lib/announcements/admin/announcementFile.selftest.ts
// The PDF of an announcement, through the Announcement Manager's REAL store and API code, on a fake database that behaves like the real one where it matters: the file table may not exist yet (and a failed
// read must not poison the transaction), a failed transaction is undone, and the PDF in storage is added and taken away with the announcement. (The same code against the real schema is the live test,
// announcementLive.selftest.ts, which needs ADMIN_LIVE_TEST_URL.)

export {}; // a module: the tests of this folder share local names
process.env.SUPERADMIN_TICKETS = "498301"; // before the facility code is loaded (it reads this once)

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };

type Row = { id: number; title: string; content: string | null; contentText: string | null; date: string; createdAt: string; authorTicketNo: string };

function fakeDb(opts: { tableExists: boolean; failNextInsert?: boolean } = { tableExists: false }) {
  const st = { rows: new Map<number, Row>(), files: new Map<number, { url: string; name: string; bytes: number; by: string }>(), tableExists: opts.tableExists, nextId: 1, audits: [] as unknown[][], failNextInsert: !!opts.failNextInsert, savepoints: 0, rolledBackToSavepoint: 0, created: 0 };
  const snapshot = () => ({ rows: new Map(st.rows), files: new Map(st.files), tableExists: st.tableExists, nextId: st.nextId, audits: st.audits.slice() });
  const q = async (sql: string, params: unknown[] = []): Promise<Array<Record<string, unknown>>> => {
    const s = sql.replace(/\s+/g, " ");
    if (/pg_advisory_xact_lock/.test(s)) return [];
    if (/^SAVEPOINT/.test(s)) { st.savepoints++; return []; }
    if (/^RELEASE SAVEPOINT/.test(s)) return [];
    if (/^ROLLBACK TO SAVEPOINT/.test(s)) { st.rolledBackToSavepoint++; return []; }
    if (/FROM public\.facility_delegate/.test(s)) return [];
    if (/INSERT INTO public\.facility_audit/.test(s)) { st.audits.push(params); return []; }
    if (/FROM public\.facility_audit/.test(s)) return [];
    if (/CREATE TABLE IF NOT EXISTS public\.announcement_file/.test(s)) { st.tableExists = true; st.created++; return []; }
    if (/announcement_file/.test(s)) {
      if (!st.tableExists) { const e: any = new Error('relation "public.announcement_file" does not exist'); e.code = "42P01"; throw e; }
      if (/^SELECT url, name, bytes/.test(s)) { const f = st.files.get(Number(params[0])); return f ? [{ url: f.url, name: f.name, bytes: f.bytes }] : []; }
      if (/^SELECT announcement_id, name, bytes/.test(s)) return (params[0] as number[]).filter((i) => st.files.has(i)).map((i) => ({ announcement_id: i, name: st.files.get(i)!.name, bytes: st.files.get(i)!.bytes }));
      if (/^INSERT INTO public\.announcement_file/.test(s)) { st.files.set(Number(params[0]), { url: String(params[1]), name: String(params[2]), bytes: Number(params[3]), by: String(params[4]) }); return []; }
      if (/^DELETE FROM public\.announcement_file/.test(s)) { st.files.delete(Number(params[0])); return []; }
    }
    if (/^INSERT INTO public\.announcement \(/.test(s)) {
      if (st.failNextInsert) { st.failNextInsert = false; throw new Error("the database fell over"); }
      const id = st.nextId++;
      st.rows.set(id, { id, title: String(params[0]), content: (params[1] as string) ?? null, contentText: (params[2] as string) ?? null, date: String(params[3]), createdAt: new Date().toISOString(), authorTicketNo: String(params[4]) });
      return [{ id }];
    }
    if (/FOR UPDATE OF a/.test(s)) { const r = st.rows.get(Number(params[0])); return r ? [{ ...r, author_name: "TEST HOD" }] : []; }
    if (/ORDER BY a\."createdAt" DESC/.test(s)) return [...st.rows.values()].sort((a, b) => b.id - a.id).map((r) => ({ ...r, author_name: "TEST HOD" }));
    if (/^UPDATE public\.announcement SET title/.test(s)) { const r = st.rows.get(Number(params[3]))!; r.title = String(params[0]); r.content = (params[1] as string) ?? null; r.contentText = (params[2] as string) ?? null; return []; }
    if (/^DELETE FROM public\.announcementreadstatus/.test(s)) return [];
    if (/^DELETE FROM public\.announcement WHERE id/.test(s)) { st.rows.delete(Number(params[0])); st.files.delete(Number(params[0])); return []; }
    throw new Error("the fake database does not know this statement: " + s.slice(0, 120));
  };
  const db = {
    async run<T>(fn: (q: any) => Promise<T>): Promise<T> {
      const before = snapshot();
      try { return await fn(q); } catch (e) { st.rows = before.rows; st.files = before.files; st.tableExists = before.tableExists; st.nextId = before.nextId; st.audits = before.audits; throw e; }
    },
  };
  return { st, db: db as any };
}

const pdf = (kb = 2, name = "SAIL DARPAN FAQ.pdf") => ({ name, bytes: Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(kb * 1024, 65), Buffer.from("\n%%EOF")]) });
const actor = { ticket: "498301", name: "TEST HOD" };

async function main() {
  const store = await import("./store");
  const { handleAnnouncementAdmin, errorReply } = await import("./api");
  const { memoryFileStorage } = await import("../attachment");
  console.error = () => {}; // the Gemini embedding of a new announcement is not reachable here and says so; that is not what this tests

  // ---- publish with a PDF and no body text (a title and a PDF: the DARPAN FAQ, the sexual-harassment policy)
  {
    const { st, db } = fakeDb({ tableExists: false });
    const storage = memoryFileStorage();
    const r = await store.publishAnnouncement(db, actor, { title: "SAIL DARPAN | Frequently Asked Questions", file: pdf() }, storage);
    ok("a title and a PDF alone is accepted (no body text needed)", r.status === "ok", JSON.stringify(r));
    ok("the first PDF creates the file table by itself, and the PDF is in storage and in the table with its name, size and who attached it", st.created === 1 && storage.urls().length === 1 && st.files.get(1)?.name === "SAIL DARPAN FAQ.pdf" && st.files.get(1)?.bytes === pdf().bytes.length && st.files.get(1)?.by === "498301");
    ok("the announcement has no body (null content and text)", st.rows.get(1)?.content === null && st.rows.get(1)?.contentText === null);
    ok("the audit says a PDF was published with it, naming the file", JSON.stringify(st.audits).includes("Published announcement with a PDF") && JSON.stringify(st.audits).includes("SAIL DARPAN FAQ.pdf"));
    const list = await store.listRecentAnnouncements(db, actor, 5);
    ok("the list tells the screen the file's name and size, and never its address", list[0].file?.name === "SAIL DARPAN FAQ.pdf" && list[0].file?.bytes === pdf().bytes.length && !JSON.stringify(list).includes("memory://"));
  }

  // ---- a database where the file table does not exist yet: announcements work as before
  {
    const { st, db } = fakeDb({ tableExists: false });
    const storage = memoryFileStorage();
    const pub = await store.publishAnnouncement(db, actor, { title: "Plain one", content: "<p>text</p>" }, storage);
    ok("a plain announcement does not need the file table (and does not create it)", pub.status === "ok" && st.created === 0 && storage.urls().length === 0);
    const list = await store.listRecentAnnouncements(db, actor, 5);
    ok("the list works with no file table: the failed read is rolled back to its savepoint and the transaction goes on, and there is simply no file", list.length === 1 && list[0].file === null && st.rolledBackToSavepoint >= 1);
    const mod = await store.modifyAnnouncement(db, actor, { id: 1, title: "Plain one, edited", content: "<p>t</p>", sentVersion: list[0].version }, storage);
    ok("an edit without a PDF works with no file table", mod.status === "ok");
    const del = await store.deleteAnnouncement(db, actor, { id: 1, sentVersion: (await store.listRecentAnnouncements(db, actor, 5))[0].version }, storage);
    ok("a delete works with no file table", del.status === "ok" && st.rows.size === 0);
  }

  // ---- bad files are refused and nothing is stored
  {
    const { st, db } = fakeDb({ tableExists: true });
    const storage = memoryFileStorage();
    const bad = async (file: { name: string; bytes: Buffer }) => store.publishAnnouncement(db, actor, { title: "x", file }, storage);
    const notPdf = await bad({ name: "notes.pdf", bytes: Buffer.from("just some text, not a PDF") });
    const wrongName = await bad({ name: "x.docx", bytes: pdf().bytes });
    const empty = await bad({ name: "e.pdf", bytes: Buffer.alloc(0) });
    const huge = await bad({ name: "h.pdf", bytes: Buffer.concat([Buffer.from("%PDF-"), Buffer.alloc(10 * 1024 * 1024 + 1)]) });
    ok("a file that is not a PDF, has another extension, is empty or is over 10 MB is refused with a reason", [notPdf, wrongName, empty, huge].every((r) => r.status === "invalid") && /not a PDF/.test((notPdf as any).reason) && /\.pdf/.test((wrongName as any).reason) && /empty/.test((empty as any).reason) && /10 MB/.test((huge as any).reason));
    ok("nothing was stored or saved for them", storage.urls().length === 0 && st.rows.size === 0 && st.files.size === 0);
  }

  // ---- a failed save takes the PDF back out of storage
  {
    const { st, db } = fakeDb({ tableExists: true, failNextInsert: true });
    const storage = memoryFileStorage();
    let threw = false;
    try { await store.publishAnnouncement(db, actor, { title: "x", file: pdf() }, storage); } catch { threw = true; }
    ok("when the database fails, the error goes up and the PDF is not left in storage", threw && storage.urls().length === 0 && st.rows.size === 0 && st.files.size === 0);
  }

  // ---- edit: keep, replace, remove
  {
    const { st, db } = fakeDb({ tableExists: true });
    const storage = memoryFileStorage();
    await store.publishAnnouncement(db, actor, { title: "Policy", content: "<p>read it</p>", file: pdf(2, "policy-v1.pdf") }, storage);
    const v = async () => (await store.listRecentAnnouncements(db, actor, 5))[0];
    const first = storage.urls()[0];

    const keep = await store.modifyAnnouncement(db, actor, { id: 1, title: "Policy (edited)", content: "<p>read it</p>", sentVersion: (await v()).version }, storage);
    ok("an edit that sends no PDF keeps the one it has", keep.status === "ok" && st.files.get(1)?.name === "policy-v1.pdf" && storage.urls().length === 1);

    const replace = await store.modifyAnnouncement(db, actor, { id: 1, title: "Policy (edited)", content: "<p>read it</p>", sentVersion: (await v()).version, file: pdf(3, "policy-v2.pdf") }, storage);
    ok("a new PDF replaces the old: the row names the new file and the OLD one is deleted from storage", replace.status === "ok" && st.files.get(1)?.name === "policy-v2.pdf" && storage.urls().length === 1 && !storage.urls().includes(first));
    ok("the audit of the edit says the PDF was replaced", JSON.stringify(st.audits).includes("PDF replaced: policy-v2.pdf"));

    const stale = await store.modifyAnnouncement(db, actor, { id: 1, title: "late", content: "", sentVersion: "0".repeat(64), file: pdf(1, "late.pdf") }, storage);
    ok("an edit made on an old version is refused as stale, its new PDF is taken back out of storage, and the PDF in place is untouched; the conflict reply carries the file it has now", stale.status === "stale" && storage.urls().length === 1 && st.files.get(1)?.name === "policy-v2.pdf" && (stale as any).current.file?.name === "policy-v2.pdf");

    const bad = await store.modifyAnnouncement(db, actor, { id: 1, title: "x", content: "", sentVersion: (await v()).version, file: { name: "a.pdf", bytes: Buffer.from("nope") } }, storage);
    ok("an edit with a file that is not a PDF is refused and changes nothing", bad.status === "invalid" && st.files.get(1)?.name === "policy-v2.pdf" && st.rows.get(1)?.title === "Policy (edited)");

    const remove = await store.modifyAnnouncement(db, actor, { id: 1, title: "Policy (edited)", content: "<p>read it</p>", sentVersion: (await v()).version, removeFile: true }, storage);
    ok("removing the PDF deletes its row and the file in storage, and the announcement stays", remove.status === "ok" && st.files.size === 0 && storage.urls().length === 0 && st.rows.has(1));
    ok("the audit says the PDF was removed, naming it", JSON.stringify(st.audits).includes("PDF removed: policy-v2.pdf"));
  }

  // ---- delete takes the PDF with it
  {
    const { st, db } = fakeDb({ tableExists: true });
    const storage = memoryFileStorage();
    await store.publishAnnouncement(db, actor, { title: "Gone soon", file: pdf() }, storage);
    const v = (await store.listRecentAnnouncements(db, actor, 5))[0].version;
    const wrong = await store.deleteAnnouncement(db, actor, { id: 1, sentVersion: "0".repeat(64) }, storage);
    ok("a delete on a wrong version is refused and keeps the PDF", wrong.status === "stale" && storage.urls().length === 1 && st.files.size === 1);
    const del = await store.deleteAnnouncement(db, actor, { id: 1, sentVersion: v }, storage);
    ok("deleting an announcement deletes its PDF from storage and its row", del.status === "ok" && storage.urls().length === 0 && st.files.size === 0 && st.rows.size === 0);
    ok("the audit says the announcement and its PDF were deleted", JSON.stringify(st.audits).includes("Deleted announcement and its PDF"));
  }

  // ---- words linked to the PDF
  {
    const LINKED = '<p>Read the <a data-pdf-link="true" role="button" tabindex="0" title="Opens the PDF">guidelines</a>.</p>';
    const PLAIN = "<p>Read the guidelines.</p>";
    const { st, db } = fakeDb({ tableExists: true });
    const storage = memoryFileStorage();
    const v = async () => (await store.listRecentAnnouncements(db, actor, 5))[0].version;
    await store.publishAnnouncement(db, actor, { title: "With a link", content: LINKED, file: pdf() }, storage);
    ok("published with a PDF, the linked words stay linked", st.rows.get(1)?.content === LINKED);
    await store.publishAnnouncement(db, actor, { title: "Link but no PDF", content: LINKED }, storage);
    ok("published WITHOUT a PDF, the same words are saved as plain words (a link needs a PDF)", st.rows.get(2)?.content === PLAIN);
    await store.modifyAnnouncement(db, actor, { id: 1, title: "With a link (edited)", content: LINKED, sentVersion: await v() }, storage);
    ok("an edit that leaves the PDF as it is keeps the links", st.rows.get(1)?.content === LINKED);
    const keepNew = await store.modifyAnnouncement(db, actor, { id: 2, title: "Link but no PDF", content: LINKED, sentVersion: (await store.listRecentAnnouncements(db, actor, 5)).find((a) => a.id === 2)!.version, file: pdf(1, "now.pdf") }, storage);
    ok("an edit that attaches a PDF to an announcement keeps the links it is saved with", keepNew.status === "ok" && st.rows.get(2)?.content === LINKED);
    await store.modifyAnnouncement(db, actor, { id: 1, title: "With a link (edited)", content: LINKED, sentVersion: (await store.listRecentAnnouncements(db, actor, 5)).find((a) => a.id === 1)!.version, removeFile: true }, storage);
    ok("an edit that REMOVES the PDF turns the linked words into plain words", st.rows.get(1)?.content === PLAIN && st.files.has(1) === false);
    ok("the plain text that is searched holds the words of the link and no markup", /^Read the guidelines/.test(String(st.rows.get(1)?.contentText)) && !/[<>]/.test(String(st.rows.get(1)?.contentText)));
  }

  // ---- the HTTP handler: the upload of the multipart form is passed on; an unsafe thing is not
  {
    const { st, db } = fakeDb({ tableExists: true });
    const storage = memoryFileStorage();
    const ctx = (upload: any) => ({ actor, db, findByName: async () => [], findByTicket: async () => [], upload, storage });
    const res = await handleAnnouncementAdmin({ op: "publish", title: "From the form" }, ctx(pdf(1, "form.pdf")));
    ok("the handler publishes a title with an uploaded PDF", res.status === 200 && st.files.get(1)?.name === "form.pdf");
    const refused = await handleAnnouncementAdmin({ op: "publish", title: "Bad one" }, ctx({ name: "x.pdf", bytes: Buffer.from("not pdf") }));
    ok("the handler answers 400 with the reason for a file that is not a PDF", refused.status === 400 && /not a PDF/.test(String((refused.body as any).error)));
    const mod = await handleAnnouncementAdmin({ op: "modify", id: 1, title: "From the form", content: "", version: (await store.listRecentAnnouncements(db, actor, 5))[0].version, removeFile: true }, ctx(null));
    ok("the handler takes a PDF off when removeFile is true", mod.status === 200 && st.files.size === 0 && storage.urls().length === 0);
    const noAuth = await handleAnnouncementAdmin({ op: "publish", title: "x" }, { ...ctx(pdf()), actor: null });
    ok("no one signed in: 401, and nothing uploaded", noAuth.status === 401 && storage.urls().length === 0);
    const e1 = errorReply(Object.assign(new Error('permission denied for schema public: CREATE TABLE announcement_file'), { code: "42501" }));
    ok("if the database user may not create the file table, the reply says which SQL file to run", e1.status === 503 && /28_announcement_file\.sql/.test(String(e1.body.error)) && e1.body.setupNeeded === true);
  }

  console.log(`announcementFile selftest: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.log("announcementFile selftest crashed:", e?.stack || e); process.exit(1); });
