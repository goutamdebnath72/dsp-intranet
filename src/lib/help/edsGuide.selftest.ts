// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/lib/help/edsGuide.selftest.ts
// The Deep search (EDS) tab of the guide must say what the code really does: every model, number and step is pinned to the code that has it, every question of the list is run through the real detector,
// and the list is checked against the project's own test files. If the code changes and the guide does not, this fails.
import { readFileSync } from "node:fs";
import { ASK_MODELS, ASK_STEPS, BEFORE_YOU_TEST, BUILD_TIPS, MODELS, NOT_DEEP, SCOPE, TEMPLATES, TEST_QUERIES, UPLOAD_MODELS, UPLOAD_STEPS, WHAT_IS } from "./edsGuide";
import { detectSynthesisIntent } from "../search/synthesisIntent";
import { DEFAULT_CHECK_MODEL, DEFAULT_PRIMARY_MODEL } from "../ingestion/geminiOcr";
import { CHUNK_WORDS } from "../ingestion/chunking";
import { SHRINK_EDGE, SHRINK_QUALITY } from "../ingestion/pageImage";
import { chatModels, synthesisModels } from "../ai/geminiChat";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };
const read = (f: string) => readFileSync(f, "utf8");
const ALL = JSON.stringify({ UPLOAD_STEPS, UPLOAD_MODELS, ASK_STEPS, ASK_MODELS, WHAT_IS, SCOPE });

// ---- the models are the code's models
delete process.env.GEMINI_CHAT_MODEL; delete process.env.GEMINI_SYNTHESIS_MODEL; delete process.env.OCR_PRIMARY_MODEL; delete process.env.OCR_CHECK_MODEL; delete process.env.GEMINI_VISION_MODEL;
ok("the two OCR readers are the code's defaults: the main reader gemini-3.1-pro-preview, the checker gemini-3.8-flash", MODELS.ocrMain === DEFAULT_PRIMARY_MODEL && MODELS.ocrChecker === DEFAULT_CHECK_MODEL);
ok("the router is the first chat model of the code (gemini-3.8-flash)", MODELS.router === chatModels()[0]);
ok("the writer and the second reader use the synthesis chain of the code: gemini-3.1-pro-preview, then gemini-pro-latest, then gemini-3.8-flash", [MODELS.writer, ...MODELS.writerFallbacks].join("|") === synthesisModels().join("|"));
const emb = read("src/lib/ai/geminiEmbedding.ts");
ok("the embedding model is gemini-embedding-001 with 768 numbers, a document type for what is stored and a query type for a question", emb.includes(`models/${MODELS.embedding}:embedContent`) && /outputDimensionality: 768/.test(emb) && /RETRIEVAL_DOCUMENT/.test(emb) && /RETRIEVAL_QUERY/.test(emb));
const sw = read("src/lib/search/executiveSynthesis.ts");
ok("the writer and the second reading both call the synthesis chain, with the thinking at low, and the briefing is stored only when it is good and the main model wrote it", (sw.match(/models: synthesisModels\(\)/g) ?? []).length >= 2 && /STORE_MIN_SCORE && verifyState !== "failed" && !weakerModel/.test(sw));
const route = read("src/app/api/ai-search/route.ts");
ok("the router is used only for the plain search (not for a line already sent as a deep question), with ONE chat model", /mode === "semantic" && !retrievalOnly && !retryInfo \? await parseQueryWithLlm/.test(route) && /models: \[chatModels\(\)\[0\]\]/.test(read("src/lib/search/pureAiEngine.ts")));
ok("an executive is a six-digit ticket starting with 4, checked in the staff directory by the server", /\^4\\d\{5\}\$/.test(route) && /"ticketNo" LIKE '4%'/.test(route));

// ---- the upload steps are the upload route's
const up = read("src/app/api/circulars/route.ts");
ok("an upload: only the HOD of C&IT or a delegate, PDF/PNG/JPG up to 15 MB, a headline and a date not in the future and not before 2000", /Only the HOD of C&IT, or an authorised delegate/.test(up) && /15 \* 1024 \* 1024/.test(up) && /application\/pdf", "image\/png", "image\/jpeg"/.test(up) && /publishedAt\.year < 2000/.test(up) && UPLOAD_STEPS[0].what.includes("15 MB") && UPLOAD_STEPS[0].what.includes("year 2000"));
ok("the pages: drawn at 300 dpi as PNG and saved in Vercel Blob", /PDF_RENDER_SCALE = 300 \/ 72/.test(up) && /format: "png"/.test(up) && /from "@vercel\/blob"/.test(up) && UPLOAD_STEPS[1].what.includes("300 dpi") && UPLOAD_STEPS[1].what.includes("Vercel Blob"));
ok("the OCR: two Gemini readers at the same moment on a page shrunk to a 2,400-pixel JPEG; a page neither can read refuses the upload", SHRINK_EDGE === 2400 && UPLOAD_STEPS[2].what.includes("2,400-pixel") && /createGeminiOcr\(\{ readers: geminiOcrReaders\(\)/.test(up) && /OcrUnavailableError/.test(up) && UPLOAD_STEPS[2].what.includes("if both fail, the upload is refused") && SHRINK_QUALITY > 0);
ok("the chunks are about 200 words and keep their page; the vectors are one per chunk and one for the whole circular's first 8,192 characters", CHUNK_WORDS === 200 && UPLOAD_STEPS[4].what.includes("200 words") && /8192/.test(up) && UPLOAD_STEPS[5].what.includes("8,192") && UPLOAD_STEPS[5].what.includes("768"));
ok("the save: one transaction, the circular row and every chunk row (text, page number, vector), an audit row, a serial number within the year; a failure deletes the page pictures", /dataSource\.transaction/.test(up) && /INSERT INTO public\.circular_chunks \(circular_id, chunk_index, page_number, text, embedding\)/.test(up) && /writeAudit/.test(up) && /MAX\("serialNumber"\)/.test(up) && /cleanupBlobs/.test(up) && `${UPLOAD_STEPS[6].title} ${UPLOAD_STEPS[6].what}`.includes("PostgreSQL on Supabase") && `${UPLOAD_STEPS[6].title} ${UPLOAD_STEPS[6].what}`.includes("pgvector"));
ok("the two special cases: a holiday-list circular is not read or chunked (a headline vector only); a roster is saved as rows", /detectHolidayListCircular/.test(up) && /skipOcrAndEmbedding/.test(up) && /applyScheduleStage/.test(up) && UPLOAD_STEPS[7].what.includes("holiday-list") && UPLOAD_STEPS[7].what.includes("rows"));
ok("the search finds text by cosine similarity on the 768-number vectors in pgvector (<=>) and by the literal words", /<=> \$1::vector\(768\)/.test(read("src/lib/search/semanticContentSearch.ts")) && ASK_STEPS[2].what.includes("cosine similarity") && ASK_STEPS[2].what.includes("literal words"));
ok("up to five circulars are given to the writer; two drafts are written by default; the question's identity is its words without capitals or punctuation and the archive's fingerprint", /filterSourcesForRelevance\(q, records\)\.slice\(0, 5\)/.test(sw) && /EDS_CANDIDATES \?\? 2|process\.env\.EDS_CANDIDATES \?\? 2/.test(sw) && ASK_STEPS[3].what.includes("five") && ASK_STEPS[4].what.includes("two drafts") && /table public\.eds_briefing/.test(read("src/lib/search/edsStore.ts")) && ASK_STEPS[7].what.includes("eds_briefing"));

// ---- the shape of the tab
ok("eight steps for an upload and eight for a question, numbered in order, each with a title and an explanation", [UPLOAD_STEPS, ASK_STEPS].every((st) => st.length === 8 && st.every((x, i) => x.no === i + 1 && x.title.length > 8 && x.what.length > 80)));
ok("a table of models for each: the upload (reader, checker, embeddings, no AI) and the question (no AI, router, vector, pgvector, writer, second reading, guards)", UPLOAD_MODELS.length === 4 && ASK_MODELS.length === 7 && [UPLOAD_MODELS, ASK_MODELS].every((rows) => rows.every((r) => r.stage && r.model && r.job)) && ASK_MODELS.some((r) => r.model.includes("pgvector")));
ok("the scope says what EDS covers now, what it will cover later, that it is still being improved, and who may use it", SCOPE.now === "Today EDS works on uploaded circulars only." && /extended to many more scopes/.test(SCOPE.later) && /reliable, true data/.test(SCOPE.later) && /not yet perfect/.test(SCOPE.honest) && /six-digit ticket starting with 4/.test(SCOPE.who));
ok("what EDS is: a lead, four points and five examples, each example with the kind, a real question and what you get", WHAT_IS.points.length === 4 && WHAT_IS.examples.length === 5 && WHAT_IS.examples.every((e) => e.kind && e.question.length > 60 && e.gets.length > 40));
ok("every example question is one of the test questions of the list, word for word (so each can be tried)", WHAT_IS.examples.every((e) => TEST_QUERIES.some((t) => t.q === e.question)));
ok("the guide names no person, no ticket number, no phone and no e-mail address", !/\b\d{6}\b|@[a-z]|\b\d{10}\b/i.test(ALL + JSON.stringify(TEST_QUERIES) + JSON.stringify(NOT_DEEP)));
ok("it says before anything else to look at the uploaded circulars first, and to prepare a question only on those", /Open the Circulars list/.test(BEFORE_YOU_TEST[0]) && /uploaded in our database/.test(BEFORE_YOU_TEST[0]) && /only if every circular/.test(BEFORE_YOU_TEST[1]) && /never write a question about a circular you have not seen/i.test(BEFORE_YOU_TEST[2]) && BUILD_TIPS.length >= 6 && TEMPLATES.length >= 4 && TEMPLATES.every((t) => /\[[^\]]+\]/.test(t)));

// ---- the list of questions: every one reaches EDS as typed (measured), and comes from the project's own test files
const files: Record<string, Map<string, string>> = { P: new Map(), G: new Map(), F: new Map() };
const grab = (f: string, m: Map<string, string>, re: RegExp) => { for (const x of read(f).matchAll(re)) m.set(x[1], x[2]); };
grab("scripts/eds-panel-queries.ts", files.P, /\{ id: "([A-Z]\d+)", shape: "[^"]*", q: "((?:[^"\\]|\\.)*)" \}/g);
grab("scripts/eds-gold-keys.ts", files.G, /id: "([A-Z]\d+)", topic: "[^"]*",\s*\n?\s*q: "((?:[^"\\]|\\.)*)"/g);
grab("scripts/eds-fresh-keys.ts", files.F, /id: "([A-Z]\d+)", topic: "[^"]*",\s*\n?\s*q: "((?:[^"\\]|\\.)*)"/g);
const unescape = (q: string) => q.replace(/\\"/g, '"');
ok("the project's test files hold the panel (21), the gold set (9) and the fresh set (5)", files.P.size === 21 && files.G.size === 9 && files.F.size === 5, `${files.P.size}/${files.G.size}/${files.F.size}`);
ok("23 questions, ids E01 to E23 in order, none written twice", TEST_QUERIES.length === 23 && TEST_QUERIES.every((t, i) => t.id === `E${String(i + 1).padStart(2, "0")}`) && new Set(TEST_QUERIES.map((t) => t.q)).size === 23);
const badReach = TEST_QUERIES.filter((t) => !detectSynthesisIntent(t.q).synthesis).map((t) => `${t.id}:${detectSynthesisIntent(t.q).score}`);
ok("EVERY question of the list reaches EDS as typed: the real detector scores 5 or more", badReach.length === 0, badReach.join(" "));
const badText = TEST_QUERIES.flatMap((t) => t.also.filter((a) => /^[PGF]/.test(a) && files[a[0]].has(a)).filter((a) => unescape(files[a[0]].get(a)!) !== t.q).map((a) => `${t.id}~${a}`));
ok("a question that has an id in the project's test files is word for word that file's question (no typo, no drift)", badText.length === 0, badText.join(" "));
const unknownIds = TEST_QUERIES.flatMap((t) => t.also.filter((a) => /^[PGF]\d+$/.test(a) && !files[a[0]].has(a)));
ok("every P, G or F id named in the list exists in the project's test files", unknownIds.length === 0, unknownIds.join(" "));
const named = new Set([...TEST_QUERIES.flatMap((t) => t.also), ...NOT_DEEP.flatMap((n) => [n.id, ...(n.also ?? [])])]);
const missing = [...files.P.keys(), ...files.G.keys(), ...files.F.keys()].filter((id) => !named.has(id));
ok("EVERY question of the panel, the gold set and the fresh set is in the guide, either in the list or among those that do not reach EDS as typed (none is lost)", missing.length === 0, missing.join(" "));
ok("every question has a 'needs' line saying which circulars to look for in the list, and a kind", TEST_QUERIES.every((t) => t.needs.length > 20 && t.kind.length > 5));
ok("only the boundary question (E23) says that no circular covers it, and it carries a note saying what a good answer is", TEST_QUERIES.filter((t) => /^none/.test(t.needs)).map((t) => t.id).join() === "E23" && /plainly that the circulars do not state/.test(TEST_QUERIES[22].note ?? ""));
ok("the three corrected questions say what they correct: E09 (the panel's P05, scored 4), E14 (P18, scored 3), E22 (P09, scored 1)", /P05.*scored 4/.test(TEST_QUERIES[8].note ?? "") && /P18.*scored 3/.test(TEST_QUERIES[13].note ?? "") && /P09.*scored 1/.test(TEST_QUERIES[21].note ?? ""));

// ---- the questions that do not reach EDS: measured too
ok("ten questions, each word for word the panel's, none reaching EDS as typed (below 5, or kept out by the people-data guard)", NOT_DEEP.length === 10 && NOT_DEEP.every((n) => unescape(files.P.get(n.id) ?? "") === n.q) && NOT_DEEP.every((n) => !detectSynthesisIntent(n.q).synthesis));
const badScore = NOT_DEEP.filter((n) => { const m = /scores (\d+)/.exec(n.why); return m ? Number(m[1]) !== detectSynthesisIntent(n.q).score : false; }).map((n) => n.id);
ok("a question listed with another id (P07 = G04) is the same text in both of the project's files", NOT_DEEP.every((n) => (n.also ?? []).every((a) => unescape((files[a[0]] ?? new Map()).get(a) ?? "") === n.q)));
ok("where the reason says 'scores N', N is the detector's score", badScore.length === 0, badScore.join(" "));
ok("the people-data questions (P12, B02) are said to be kept out by the guard, and the detector agrees", ["P12", "B02"].every((id) => { const n = NOT_DEEP.find((x) => x.id === id)!; return /people-data guard/.test(n.why) && !!detectSynthesisIntent(n.q).blockedBy; }));

ok("the guide says a visitor who has not signed in is asked 'Are you an executive?' (Yes: sign in, then it runs by itself; No: the simple answer), and the code has that question", /Are you an executive\?/.test(ASK_STEPS[0].what) && /runs by itself/.test(ASK_STEPS[0].what) && /simple answer/.test(ASK_STEPS[0].what) && /Are you an executive\?/.test(SCOPE.who) && /shouldAskExecutive\(/.test(readFileSync("src/components/OmnibarModal.tsx", "utf8")) && /aria-label="Are you an executive\?"/.test(readFileSync("src/components/OmniExecutiveAsk.tsx", "utf8")));

console.log(`edsGuide: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
