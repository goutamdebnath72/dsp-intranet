// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/lib/announcements/attachment.selftest.ts
// What I check here: the PDF of an announcement: what is accepted, how a name is cleaned, how a file is served, how the upload form is read, and the guards on the two routes.
import { readFileSync } from "node:fs";
import { MAX_PDF_BYTES, checkPdf, cleanFileName, fileHeaders, fileRoute, formatBytes, memoryFileStorage, readUploadForm } from "./attachment";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };
const PDF = Buffer.from("%PDF-1.7\nhello\n%%EOF");

// ---- names
ok("a name keeps its words and always ends in .pdf (once)", cleanFileName("SAIL DARPAN FAQ.pdf") === "SAIL DARPAN FAQ.pdf" && cleanFileName("policy") === "policy.pdf" && cleanFileName("A.PDF") === "A.pdf" && cleanFileName("a.pdf.pdf") === "a.pdf");
ok("a path becomes its last part, and quotes, slashes, control characters and line breaks go (no header or folder trick)", cleanFileName("C:\\Users\\x\\secret.pdf") === "secret.pdf" && cleanFileName("../../etc/passwd") === "passwd.pdf" && cleanFileName('a"b<c>d:e|f?g*.pdf') === "a b c d e f g.pdf" && !/[\r\n]/.test(cleanFileName("x\r\nSet-Cookie: a=b.pdf")));
ok("an empty or dots-only name becomes attachment.pdf, and a very long one is cut to 120 characters", cleanFileName("") === "attachment.pdf" && cleanFileName("...") === "attachment.pdf" && cleanFileName(undefined) === "attachment.pdf" && cleanFileName("x".repeat(500) + ".pdf").length <= 120);
ok("a Hindi or Bengali name is kept", cleanFileName("सेल दर्पण.pdf") === "सेल दर्पण.pdf" && cleanFileName("নীতি.pdf") === "নীতি.pdf");

// ---- what is accepted
ok("a real PDF with a .pdf name is accepted, under its clean name", (() => { const r = checkPdf({ name: "My Notice.PDF", bytes: PDF }); return r.ok && r.name === "My Notice.pdf"; })());
ok("an empty file, a missing file, a file that is not a PDF by its bytes (whatever its name), and a name that is not .pdf are all refused", !checkPdf({ name: "a.pdf", bytes: Buffer.alloc(0) }).ok && !checkPdf(null).ok && !checkPdf({ name: "a.pdf", bytes: Buffer.from("<html>hi</html>") }).ok && !checkPdf({ name: "a.txt", bytes: PDF }).ok);
ok("the PDF header may be a little way into the file (some files start with a few bytes first)", checkPdf({ name: "a.pdf", bytes: Buffer.concat([Buffer.from("\xef\xbb\xbf  \n", "latin1"), PDF]) }).ok);
ok("the size limit is 10 MB: exactly 10 MB is accepted, one byte more is refused", MAX_PDF_BYTES === 10 * 1024 * 1024 && checkPdf({ name: "a.pdf", bytes: Buffer.concat([Buffer.from("%PDF-"), Buffer.alloc(MAX_PDF_BYTES - 5)]) }).ok && !checkPdf({ name: "a.pdf", bytes: Buffer.concat([Buffer.from("%PDF-"), Buffer.alloc(MAX_PDF_BYTES - 4)]) }).ok);

// ---- sizes and serving
ok("sizes read plainly", formatBytes(812) === "812 bytes" && formatBytes(540 * 1024) === "540 KB" && formatBytes(2.34 * 1024 * 1024) === "2.3 MB" && formatBytes(-1) === "");
const inline = fileHeaders("SAIL DARPAN FAQ.pdf", 1234, false);
const dl = fileHeaders("सेल दर्पण.pdf", 99, true);
ok("a served file is a PDF, shown inline by default, with its length, nosniff, and a private no-cache rule", inline["Content-Type"] === "application/pdf" && inline["Content-Length"] === "1234" && /^inline; filename="SAIL DARPAN FAQ\.pdf"/.test(inline["Content-Disposition"]) && inline["X-Content-Type-Options"] === "nosniff" && /private/.test(inline["Cache-Control"]));
ok("a download says attachment, and a Hindi name is sent both in a plain safe form and UTF-8 encoded (no raw non-ASCII in the header)", /^attachment; /.test(dl["Content-Disposition"]) && /filename\*=UTF-8''%E0%A4/.test(dl["Content-Disposition"]) && !/[^\x20-\x7e]/.test(dl["Content-Disposition"]));
ok("the route of an announcement's file is /api/announcements/<id>/file", fileRoute(42) === "/api/announcements/42/file");

// ---- storage
(async () => {
  const m = memoryFileStorage();
  const url = await m.put("announcements/a.pdf", PDF, "application/pdf");
  ok("the memory storage keeps, gives back and deletes a file", (await m.get(url))?.equals(PDF) === true && (await m.del([url]), (await m.get(url)) === null) && m.urls().length === 0);

  // ---- the upload form
  const form = new FormData();
  form.append("op", "modify"); form.append("id", "42"); form.append("title", "T"); form.append("content", "<p>x</p>"); form.append("version", "v1"); form.append("removeFile", "true"); form.append("limit", "7");
  form.append("file", new File([PDF], "up.pdf", { type: "application/pdf" }));
  form.append("other", new File([PDF], "other.pdf"));
  const r = await readUploadForm(form);
  ok("the form becomes the manager's body: id and limit are numbers, removeFile a boolean, the rest text", r.body.op === "modify" && r.body.id === 42 && r.body.limit === 7 && r.body.removeFile === true && r.body.title === "T" && r.body.content === "<p>x</p>" && r.body.version === "v1");
  ok("only the file called 'file' is taken, with its name and bytes; a file under another field name is ignored", r.file?.name === "up.pdf" && r.file.bytes.equals(PDF) && !("other" in r.body) && !r.tooBig);
  const none = await readUploadForm(new FormData());
  ok("a form with no file gives no file", none.file === null && !none.tooBig);
  const big = new FormData(); big.append("file", new File([new Uint8Array(MAX_PDF_BYTES + 1)], "big.pdf"));
  const rb = await readUploadForm(big);
  ok("a file over the limit is flagged and not read into memory", rb.tooBig && rb.file === null);

  // ---- the routes' guards (source)
  const admin = readFileSync("src/app/api/announcements/admin/route.ts", "utf8");
  const fileRt = readFileSync("src/app/api/announcements/[id]/file/route.ts", "utf8");
  const list = readFileSync("src/app/api/announcements/route.ts", "utf8");
  ok("the admin route takes a multipart form as well as JSON, refuses an over-size file with 413, checks the origin first, and hands the upload to the handler", /multipart\/form-data/.test(admin) && /status: 413/.test(admin) && admin.indexOf("isSameOrigin") < admin.indexOf("multipart/form-data") && /upload,/.test(admin) && /readUploadForm/.test(admin));
  ok("the file route serves the PDF from our own route (never a redirect to the storage address), answers 404 when there is none, and its info answer has only name and bytes", !/redirect/i.test(fileRt) && /status: 404/.test(fileRt) && /NextResponse\.json\(\{ name: row\.name, bytes: row\.bytes \}/.test(fileRt) && /blobFileStorage\(\)\.get\(row\.url\)/.test(fileRt));
  ok("the public list adds each announcement's file (name and size) from a query of its own that cannot break the list, and never selects the address", /announcement_file/.test(list) && /SELECT announcement_id, name, bytes FROM public\.announcement_file/.test(list) && !/SELECT[^`]*\burl\b[^`]*announcement_file/.test(list) && /catch \{/.test(list) && /file: files\.get\(ann\.id\) \?\? null/.test(list));
  const sql = readFileSync("src/lib/nl2sql/sql/28_announcement_file.sql", "utf8");
  ok("the SQL file makes a table of its own (so the announcements work before it is run), keyed by the announcement and removed with it, with the address, name, size and who attached it, safe to run twice and closed to the browser roles", /CREATE TABLE IF NOT EXISTS public\.announcement_file/.test(sql) && /announcement_id\s+integer\s+PRIMARY KEY REFERENCES public\.announcement\(id\) ON DELETE CASCADE/.test(sql) && /uploaded_by/.test(sql) && /ENABLE ROW LEVEL SECURITY/.test(sql) && /REVOKE ALL ON public\.announcement_file FROM anon, authenticated/.test(sql) && !/ALTER TABLE public\.announcement\b(?!_file)/.test(sql));
  console.log(`attachment selftest: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
