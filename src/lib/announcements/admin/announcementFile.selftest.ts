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
  const st = { idx: new Map<number, Record<string, any>>(), chunks: new Map<number, Array<{ source: string; index: number; page: number }>>(), pages: new Map<number, Map<number, string>>(), rows: new Map<number, Row>(), files: new Map<number, { url: string; name: string; bytes: number; by: string }>(), tableExists: opts.tableExists, nextId: 1, audits: [] as unknown[][], failNextInsert: !!opts.failNextInsert, savepoints: 0, rolledBackToSavepoint: 0, created: 0 };
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
    if (/CREATE TABLE IF NOT EXISTS public\.announcement_(index|chunk|page)|CREATE INDEX IF NOT EXISTS announcement_chunk/.test(s)) return [];
    if (/^DELETE FROM public\.announcement_chunk WHERE announcement_id = \$1 AND source = '(pdf|body)'/.test(s)) { const src = /'pdf'/.test(s) ? "pdf" : "body"; const id = Number(params[0]); const keep = (st.chunks.get(id) ?? []).filter((c) => c.source !== src); if (keep.length) st.chunks.set(id, keep); else st.chunks.delete(id); return []; }
    if (/^SELECT url FROM public\.announcement_page/.test(s)) return [...(st.pages.get(Number(params[0]))?.entries() ?? [])].sort((a, b) => a[0] - b[0]).map(([, url]) => ({ url }));
    if (/^DELETE FROM public\.announcement_page/.test(s)) { st.pages.delete(Number(params[0])); return []; }
    if (/^INSERT INTO public\.announcement_page/.test(s)) { const id = Number(params[0]); if (!st.pages.has(id)) st.pages.set(id, new Map()); st.pages.get(id)!.set(Number(params[1]), String(params[2])); return []; }
    if (/^INSERT INTO public\.announcement_chunk/.test(s)) { const id = Number(params[0]); st.chunks.set(id, [...(st.chunks.get(id) ?? []), { source: String(params[1]), index: Number(params[2]), page: Number(params[3]) }]); return []; }
    if (/^UPDATE public\.announcement_index SET pdf_status = NULL/.test(s)) { const r = st.idx.get(Number(params[0])); if (r) Object.assign(r, { pdf_status: null, pdf_note: null, pdf_pages: null, pdf_text_pages: null, pdf_ocr_pages: null, pdf_text: null }); return []; }
    if (/^UPDATE public\.announcement_index SET body_status = NULL/.test(s)) { const r = st.idx.get(Number(params[0])); if (r) Object.assign(r, { body_status: null, body_note: null, body_chunks: null }); return []; }
    if (/^INSERT INTO public\.announcement_index/.test(s)) {
      const id = Number(params[0]); const r = st.idx.get(id) ?? {}; st.idx.set(id, r);
      if (/pdf_status/.test(s) && /'ready'/.test(s)) Object.assign(r, { pdf_status: "ready", pdf_note: params[1] ?? null, pdf_pages: Number(params[2]), pdf_text_pages: Number(params[3]), pdf_ocr_pages: Number(params[4]), pdf_text: String(params[5]) });
      else if (/pdf_status/.test(s)) Object.assign(r, { pdf_status: "failed", pdf_note: String(params[1]), pdf_pages: null, pdf_text_pages: null, pdf_ocr_pages: null, pdf_text: null });
      else if (/body_status/.test(s) && /'ready'/.test(s)) Object.assign(r, { body_status: "ready", body_note: null, body_chunks: Number(params[1]) });
      else Object.assign(r, { body_status: "failed", body_note: String(params[1]) });
      return [];
    }
    if (/^SELECT announcement_id, pdf_status/.test(s)) return (params[0] as number[]).filter((i) => st.idx.has(i)).map((i) => ({ announcement_id: i, pdf_status: null, pdf_note: null, pdf_pages: null, pdf_text_pages: null, pdf_ocr_pages: null, body_status: null, body_note: null, body_chunks: null, ...st.idx.get(i)! }));
    if (/^SELECT "contentText" FROM public\.announcement WHERE id/.test(s)) { const r = st.rows.get(Number(params[0])); return r ? [{ contentText: r.contentText }] : []; }
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


  // ---- THE SEARCH INDEX (src/lib/announcements/searchIndex/): text and PDF prepared like a circular, through the real handler, store and indexer, on the fake database
  {
    type Page = { text: string; via: "text" | "ocr" | "none"; reason?: string };
    const png = () => Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    const two: Page[] = [
      { text: "Sexual harassment of women at the workplace is prohibited. A complaint goes to the Internal Committee.", via: "text" },
      { text: "The Committee must finish its inquiry within ninety days of the complaint.", via: "text" },
    ];
    const mkDeps = (storage: any, o: { pages?: Page[]; images?: Array<Buffer | null>; totalPages?: number; readThrows?: boolean; embedThrows?: boolean } = {}) => {
      const calls = { reads: 0, embeds: 0, reEmbeds: [] as number[] };
      return {
        calls,
        deps: {
          read: async () => { calls.reads++; if (o.readThrows) throw new Error("the PDF could not be opened"); const pages = o.pages ?? two; return { pages, images: o.images ?? pages.map(() => png()), totalPages: o.totalPages ?? pages.length }; },
          embed: async () => { calls.embeds++; if (o.embedThrows) throw new Error("429 quota"); return [0.1, 0.2, 0.3]; },
          reEmbedRecord: async (id: number) => { calls.reEmbeds.push(id); return true; },
          storage,
          now: () => 1_000_000,
        },
      };
    };
    const base = (db: any, storage: any, upload: any, deps?: any) => ({ actor, db, findByName: async () => [], findByTicket: async () => [], upload, storage, ...(deps ? { indexDeps: deps } : {}) });
    const pics = (storage: any) => storage.urls().filter((u: string) => /\/pages\//.test(u));
    const chunkSummary = (st: any, id: number, source: string) => (st.chunks.get(id) ?? []).filter((c: any) => c.source === source).map((c: any) => c.page).join(",");

    // publish with a body and a PDF
    {
      const { st, db } = fakeDb({ tableExists: false });
      const storage = memoryFileStorage();
      const m = mkDeps(storage);
      const res = await handleAnnouncementAdmin({ op: "publish", title: "Policy on sexual harassment at the workplace", content: "<p>Please read the <strong>policy</strong> carefully.</p>" }, base(db, storage, pdf(1, "policy.pdf"), m.deps));
      const idx = (res.body as any).indexing;
      ok("publishing a body and a PDF prepares both for the search bar and the reply says so, in sentences", res.status === 200 && idx?.status === "ready" && /2 pages \(from its own text\), 2 passages/.test(idx.message) && /text was indexed for the search bar \(1 passage\)/.test(idx.message), JSON.stringify(res.body));
      ok("the body has its own passage (source body), and the PDF has one passage for each page, with its page", chunkSummary(st, 1, "body") === "0" && chunkSummary(st, 1, "pdf") === "1,2");
      ok("the picture of every page is kept in storage and its address in announcement_page (never in the index state)", pics(storage).length === 2 && st.pages.get(1)?.size === 2);
      ok("the state says: PDF ready (2 pages, 2 from its own text, 0 read by AI) with the whole text, and the body ready", st.idx.get(1)?.pdf_status === "ready" && st.idx.get(1)?.pdf_pages === 2 && st.idx.get(1)?.pdf_text_pages === 2 && st.idx.get(1)?.pdf_ocr_pages === 0 && /Internal Committee/.test(String(st.idx.get(1)?.pdf_text)) && st.idx.get(1)?.body_status === "ready");
      ok("the announcement's own vector is made once, after both parts are saved", JSON.stringify(m.calls.reEmbeds) === "[1]");
      const list = await store.listRecentAnnouncements(db, actor, 5);
      ok("the manager's list tells how each part went", list[0].searchIndex?.pdf?.status === "ready" && list[0].searchIndex?.pdf?.pages === 2 && list[0].searchIndex?.body?.status === "ready" && !JSON.stringify(list).includes("memory://"));
    }

    // a PDF with scanned pages: the ones read by AI are counted
    {
      const { st, db } = fakeDb({ tableExists: true });
      const storage = memoryFileStorage();
      const m = mkDeps(storage, { pages: [two[0], { text: "Procedure for the issuance of a digital signature certificate; contact the DSC Coordinators.", via: "ocr" }] });
      const res = await handleAnnouncementAdmin({ op: "publish", title: "DSC procedure" }, base(db, storage, pdf(1, "dsc.pdf"), m.deps));
      ok("pages read by AI are counted and said", /2 pages \(1 from its own text, 1 read by AI\)/.test((res.body as any).indexing.message) && st.idx.get(1)?.pdf_ocr_pages === 1 && st.idx.get(1)?.pdf_text_pages === 1);
      ok("an announcement with no body has no body passage and no body state", chunkSummary(st, 1, "body") === "" && !st.idx.get(1)?.body_status);
    }

    // text only: the body is prepared, there is no PDF part
    {
      const { st, db } = fakeDb({ tableExists: true });
      const storage = memoryFileStorage();
      const m = mkDeps(storage);
      const res = await handleAnnouncementAdmin({ op: "publish", title: "Notice", content: "<p>Dress code from Monday.</p>" }, base(db, storage, null, m.deps));
      ok("an announcement with only text is prepared too (its body passages), and the reader of PDFs is not used", (res.body as any).indexing?.status === "ready" && chunkSummary(st, 1, "body") === "0" && m.calls.reads === 0 && pics(storage).length === 0 && !/PDF/.test((res.body as any).indexing.message));
    }

    // a PDF that cannot be read never fails the publish: the announcement and its text are saved, the failure is recorded with its reason
    {
      const { st, db } = fakeDb({ tableExists: true });
      const storage = memoryFileStorage();
      const m = mkDeps(storage, { readThrows: true });
      const res = await handleAnnouncementAdmin({ op: "publish", title: "Unreadable one", content: "<p>Important text.</p>" }, base(db, storage, pdf(1, "bad.pdf"), m.deps));
      ok("when the PDF cannot be read the publish still succeeds, and says plainly that it was not read; the text is still prepared", res.status === 200 && (res.body as any).indexing?.status === "failed" && /could not be read for the search bar: the PDF could not be opened/.test((res.body as any).indexing.message) && /text was indexed/.test((res.body as any).indexing.message) && st.rows.size === 1 && st.files.size === 1);
      ok("the failure is recorded (with why), no PDF passage and no page picture was kept, the body passage was", st.idx.get(1)?.pdf_status === "failed" && /could not be opened/.test(String(st.idx.get(1)?.pdf_note)) && chunkSummary(st, 1, "pdf") === "" && pics(storage).length === 0 && chunkSummary(st, 1, "body") === "0");
      ok("the announcement's own vector is still made", JSON.stringify(m.calls.reEmbeds) === "[1]");
      const list = await store.listRecentAnnouncements(db, actor, 5);
      ok("the list shows the PDF as failed with the reason", list[0].searchIndex?.pdf?.status === "failed" && /could not be opened/.test(String(list[0].searchIndex?.pdf?.note)));
    }

    // a vector that cannot be made: nothing of that part is saved, and no picture is kept
    {
      const { st, db } = fakeDb({ tableExists: true });
      const storage = memoryFileStorage();
      const m = mkDeps(storage, { embedThrows: true });
      const res = await handleAnnouncementAdmin({ op: "publish", title: "Quota day", content: "<p>text</p>" }, base(db, storage, pdf(), m.deps));
      ok("if any passage cannot be given a vector nothing of the PDF is saved (no passage, no picture) and the reason is kept", (res.body as any).indexing?.status === "failed" && chunkSummary(st, 1, "pdf") === "" && pics(storage).length === 0 && st.idx.get(1)?.pdf_status === "failed" && /vectors/.test(String(st.idx.get(1)?.pdf_note)));
      ok("the same for the text: it is recorded as failed and says its words are still found literally", st.idx.get(1)?.body_status === "failed" && chunkSummary(st, 1, "body") === "" && /still found literally/.test((res.body as any).indexing.message));
    }

    // a failed save takes the pictures back out of storage
    {
      const { st, db } = fakeDb({ tableExists: true });
      const storage = memoryFileStorage();
      const m = mkDeps(storage);
      const realRun = db.run.bind(db);
      const flaky = { ...db, run: async (fn: any) => realRun(async (q: any) => fn(async (sql: string, p?: unknown[]) => { if (/^INSERT INTO public\.announcement_page/.test(sql.replace(/\s+/g, " "))) throw new Error("the database fell over"); return q(sql, p); })) };
      const res = await handleAnnouncementAdmin({ op: "publish", title: "Falls over" }, base(flaky as any, storage, pdf(), m.deps));
      ok("when the write fails, the pictures put in storage for it are taken out again and the PDF is recorded as not prepared", (res.body as any).indexing?.status === "failed" && pics(storage).length === 0 && res.status === 200);
    }

    // pages not read are named; a long PDF says how many were read; a blank PDF is a failure
    {
      const { st, db } = fakeDb({ tableExists: true });
      const storage = memoryFileStorage();
      const m = mkDeps(storage, { pages: [{ text: "page one has words", via: "text" }, { text: "", via: "none", reason: "neither reader could read it" }, { text: "page three has words", via: "ocr" }], images: [png(), png(), null], totalPages: 55 });
      const res = await handleAnnouncementAdmin({ op: "publish", title: "Partly read" }, base(db, storage, pdf(), m.deps));
      const msg = String((res.body as any).indexing?.message);
      ok("a page that could not be read is named and the other pages are kept", (res.body as any).indexing?.status === "ready" && /Page 2 could not be read/.test(msg) && chunkSummary(st, 1, "pdf") === "1,3");
      ok("a PDF with more pages than are read says how many were read", /first 40 of 55 pages/.test(msg));
      ok("a page whose picture could not be drawn is named; the others keep theirs", /picture of page 3 was not kept/.test(msg) && st.pages.get(1)?.size === 2 && pics(storage).length === 2);
      const blank = await handleAnnouncementAdmin({ op: "publish", title: "Blank" }, base(fakeDb({ tableExists: true }).db, memoryFileStorage(), pdf(), mkDeps(memoryFileStorage(), { pages: [{ text: "", via: "none" }, { text: "", via: "none" }] }).deps));
      ok("a PDF with no text at all is a failure, not an empty success", (blank.body as any).indexing?.status === "failed" && /no text|no page/.test(String((blank.body as any).indexing.message)));
    }

    // tables missing and the database user may not create them: the reply says which SQL file to run
    {
      const { db } = fakeDb({ tableExists: true });
      const storage = memoryFileStorage();
      const m = mkDeps(storage);
      const realRun = db.run.bind(db);
      const strict = { ...db, run: async (fn: any) => realRun(async (q: any) => fn(async (sql: string, p?: unknown[]) => { if (/CREATE TABLE IF NOT EXISTS public\.announcement_index/.test(sql.replace(/\s+/g, " "))) throw Object.assign(new Error("permission denied for schema public"), { code: "42501" }); return q(sql, p); })) };
      const res = await handleAnnouncementAdmin({ op: "publish", title: "No rights", content: "<p>x</p>" }, base(strict as any, storage, pdf(), m.deps));
      ok("when the tables are missing and cannot be created, the publish still succeeds and the note says which SQL file to run", res.status === 200 && (res.body as any).indexing?.status === "failed" && /29_announcement_search_index\.sql/.test((res.body as any).indexing.message) && pics(storage).length === 0);
    }

    // no preparation wanted (the other tests of this file): nothing happens and the reply has no `indexing`
    {
      const { db } = fakeDb({ tableExists: true });
      const res = await handleAnnouncementAdmin({ op: "publish", title: "Quiet" }, base(db, memoryFileStorage(), pdf()));
      ok("with no preparation given the publish prepares nothing and says nothing of it", res.status === 200 && !("indexing" in (res.body as object)));
    }

    // edit: the text is prepared again; a kept PDF keeps its index; a replaced PDF drops the old text and pictures; a removed PDF drops everything of it
    {
      const { st, db } = fakeDb({ tableExists: true });
      const storage = memoryFileStorage();
      const m = mkDeps(storage);
      await handleAnnouncementAdmin({ op: "publish", title: "Policy", content: "<p>read it</p>" }, base(db, storage, pdf(1, "v1.pdf"), m.deps));
      const v = async () => (await store.listRecentAnnouncements(db, actor, 5))[0].version;
      const firstPics = pics(storage);
      ok("the first PDF was prepared", st.idx.get(1)?.pdf_status === "ready" && chunkSummary(st, 1, "pdf") === "1,2" && firstPics.length === 2);
      const keep = await handleAnnouncementAdmin({ op: "modify", id: 1, title: "Policy (edited)", content: "<p>read it again, and carefully</p>", version: await v() }, base(db, storage, null, m.deps));
      ok("editing the text and keeping the PDF prepares the text again, and does not read the PDF again or touch its pictures", keep.status === 200 && (keep.body as any).indexing?.status === "ready" && !/PDF/.test((keep.body as any).indexing.message) && m.calls.reads === 1 && chunkSummary(st, 1, "pdf") === "1,2" && pics(storage).join() === firstPics.join());
      const m2 = mkDeps(storage, { pages: [{ text: "The revised policy has one page only.", via: "text" }] });
      const rep = await handleAnnouncementAdmin({ op: "modify", id: 1, title: "Policy (edited)", content: "<p>read it again, and carefully</p>", version: await v() }, base(db, storage, pdf(1, "v2.pdf"), m2.deps));
      ok("replacing the PDF prepares the new one; the old passages are gone and the old page pictures are taken out of storage", rep.status === 200 && (rep.body as any).indexing?.pdf === undefined && /1 page/.test((rep.body as any).indexing.message) && chunkSummary(st, 1, "pdf") === "1" && /revised policy/.test(String(st.idx.get(1)?.pdf_text)) && pics(storage).length === 1 && !pics(storage).some((u: string) => firstPics.includes(u)));
      const rem = await handleAnnouncementAdmin({ op: "modify", id: 1, title: "Policy (edited)", content: "<p>read it again, and carefully</p>", version: await v(), removeFile: true }, base(db, storage, null, m2.deps));
      ok("removing the PDF drops its passages, its state and its page pictures; the text's passage stays", rem.status === 200 && chunkSummary(st, 1, "pdf") === "" && !st.idx.get(1)?.pdf_status && pics(storage).length === 0 && !st.pages.has(1) && chunkSummary(st, 1, "body") === "0");
    }

    // deleting an announcement takes its page pictures out of storage with its PDF
    {
      const { st, db } = fakeDb({ tableExists: true });
      const storage = memoryFileStorage();
      const m = mkDeps(storage);
      await handleAnnouncementAdmin({ op: "publish", title: "To be deleted" }, base(db, storage, pdf(), m.deps));
      ok("before the delete there are the PDF and two pictures", storage.urls().length === 3);
      const del = await store.deleteAnnouncement(db, actor, { id: 1, sentVersion: (await store.listRecentAnnouncements(db, actor, 5))[0].version }, storage);
      ok("a delete takes the PDF and every page picture out of storage", del.status === "ok" && storage.urls().length === 0 && st.rows.size === 0);
    }

    // "Index again": the text comes from the database and the PDF from storage; unknown announcements are refused; without the means it is said so
    {
      const { st, db } = fakeDb({ tableExists: true });
      const storage = memoryFileStorage();
      const m = mkDeps(storage, { readThrows: true });
      await handleAnnouncementAdmin({ op: "publish", title: "Retry me", content: "<p>Some text.</p>" }, base(db, storage, pdf(1, "r.pdf"), m.deps));
      ok("it starts with the PDF failed", st.idx.get(1)?.pdf_status === "failed");
      const m2 = mkDeps(storage);
      const again = await handleAnnouncementAdmin({ op: "reindex", id: 1 }, base(db, storage, null, m2.deps));
      ok("indexing again takes the text from the database and the PDF from storage and, this time, prepares both", again.status === 200 && (again.body as any).indexing?.status === "ready" && st.idx.get(1)?.pdf_status === "ready" && chunkSummary(st, 1, "pdf") === "1,2" && chunkSummary(st, 1, "body") === "0" && pics(storage).length === 2);
      const none = await handleAnnouncementAdmin({ op: "reindex", id: 99 }, base(db, storage, null, m2.deps));
      ok("an announcement that does not exist is refused", none.status === 404);
      const noMeans = await handleAnnouncementAdmin({ op: "reindex", id: 1 }, base(db, storage, null));
      ok("where preparing is not available it says so instead of pretending", noMeans.status === 503);
      const stranger = await handleAnnouncementAdmin({ op: "reindex", id: 1 }, { ...base(db, storage, null, m2.deps), actor: null });
      ok("it needs a signed-in manager like every other operation", stranger.status === 401);
    }
  }

  console.log(`announcementFile selftest: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.log("announcementFile selftest crashed:", e?.stack || e); process.exit(1); });
