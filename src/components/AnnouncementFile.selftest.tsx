// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/components/AnnouncementFile.selftest.tsx
// The PDF of an announcement on the screens: the card and frame in the announcement's window, the picker of the manager, the mark on its cards and on the home page's two lists.
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AnnouncementFile } from "./AnnouncementFile";
import AnnouncementModal from "./AnnouncementModal";
import { AnnouncementCard, PdfPicker, PdfSearchState } from "./AnnouncementAdminUi";
import { FULL_SCREEN_VIEW, PdfViewerView, fullScreenView } from "./AnnouncementPdfViewer";
import { ViewerShell } from "./ViewerShell";
import type { AnnouncementItemView } from "@/lib/announcements/admin/types";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };
const h = (el: React.ReactElement) => renderToStaticMarkup(el).replace(/<!-- -->/g, "");
const noop = () => {};
const file = { name: "SAIL DARPAN FAQ.pdf", bytes: 2_400_000 };
const base = { id: 7, createdAt: "2026-11-17T04:00:00.000Z", title: "SAIL DARPAN | Frequently Asked Questions", date: "2026-11-17T04:00:00.000Z" };

// ---- the card and frame
const open = h(<AnnouncementFile id={7} file={file} startOpen onOpenFull={noop} />);
const closed = h(<AnnouncementFile id={7} file={file} startOpen={false} onOpenFull={noop} />);
ok("the card names the file, says PDF and its size, and has a Download link through our own route", /SAIL DARPAN FAQ\.pdf/.test(open) && /PDF · 2\.3 MB/.test(open) && /href="\/api\/announcements\/7\/file\?download=1"/.test(open) && !/memory:|blob\.vercel|https?:\/\//.test(open.replace(/<svg[\s\S]*?<\/svg>/g, "")));
const fsBtn = (open.match(/<button[^>]*data-pdf-fullscreen[^>]*>[\s\S]*?<\/button>/) ?? [""])[0];
ok("the old 'Open' (a link to a new tab) is gone: in its place a button with only an icon, the expand icon (one arrow to the top-right corner, one to the bottom-left: lucide Maximize2), named for screen readers and in a tooltip", /lucide-maximize-2/.test(fsBtn) && /aria-label="View the PDF full screen"/.test(fsBtn) && /title="View full screen"/.test(fsBtn) && fsBtn.replace(/<svg[\s\S]*?<\/svg>/g, "").replace(/<[^>]+>/g, "").trim() === "" && !/>\s*Open\s*</.test(open) && !/target="_blank"/.test(open) && !/data-pdf-open/.test(open));
ok("when the PDF stands alone the frame is shown at once, with no View-here toggle", /data-pdf-frame/.test(open) && /src="\/api\/announcements\/7\/file#view=FitH"/.test(open) && !/data-pdf-toggle/.test(open));
ok("when there is body text too, the frame waits for 'View here'", !/data-pdf-frame/.test(closed) && /data-pdf-toggle/.test(closed) && />View here</.test(closed.replace(/<[^>]+>/g, ">$&<").replace(/>\s*</g, "><")) || /View here/.test(closed));

// ---- the announcement's window
const pdfOnly = h(<AnnouncementModal announcement={{ ...base, content: null, file }} onClose={noop} />);
ok("an announcement of only a title and a PDF shows the PDF at once in a wide window, and does not say 'No additional details'", /max-w-4xl/.test(pdfOnly) && /data-pdf-frame/.test(pdfOnly) && !/No additional details/.test(pdfOnly) && /SAIL DARPAN \| Frequently Asked Questions/.test(pdfOnly));
const both = h(<AnnouncementModal announcement={{ ...base, content: "<p>Read <strong>this</strong>.</p>", file }} onClose={noop} />);
ok("an announcement with body text and a PDF shows the text first, then the PDF card (frame closed), in the usual window", /announcement-content/.test(both) && /<strong>this<\/strong>/.test(both) && both.indexOf("announcement-content") < both.indexOf("data-announcement-file") && !/data-pdf-frame/.test(both) && /max-w-2xl/.test(both) && !/max-w-4xl/.test(both));
const textOnly = h(<AnnouncementModal announcement={{ ...base, content: "<p>just text</p>", file: null }} onClose={noop} />);
ok("an announcement with no PDF is as it was", /just text/.test(textOnly) && !/data-announcement-file/.test(textOnly) && /max-w-2xl/.test(textOnly));
const empty = h(<AnnouncementModal announcement={{ ...base, content: null, file: null }} onClose={noop} />);
ok("one with neither says 'No additional details'", /No additional details/.test(empty) && !/data-announcement-file/.test(empty));
const unknown = h(<AnnouncementModal announcement={{ ...base, content: null }} onClose={noop} />);
ok("when the caller does not know about a PDF (a search result), nothing is claimed before the window has asked", !/No additional details/.test(unknown) && !/data-announcement-file/.test(unknown));
const modalSrc = readFileSync("src/components/AnnouncementModal.tsx", "utf8");
ok("the window asks for the file's name and size by itself (?info=1) only when the caller left it out", /announcement\.file !== undefined\) return/.test(modalSrc) && /\?info=1/.test(modalSrc));

// ---- the full-screen viewer (the circular viewer's layer, with the PDF)
const view = h(<PdfViewerView id={7} title="SAIL DARPAN | Frequently Asked Questions" fileName="SAIL DARPAN FAQ.pdf" onClose={noop} />);
ok("the viewer is a full-screen dialog in the circular viewer's own layer (dark, blurred), above everything (z 400), with a cross named 'Close the PDF' and the announcement's title in its header", /role="dialog"/.test(view) && /aria-modal="true"/.test(view) && /fixed inset-0 bg-black\/85 backdrop-blur-md z-\[400\]/.test(view) && /aria-label="Close the PDF"/.test(view) && /data-viewer-close/.test(view) && /<h1[^>]*>SAIL DARPAN \| Frequently Asked Questions<\/h1>/.test(view));
ok("it shows the PDF of that announcement from our own route, and takes Escape for itself (data-escape-own)", /data-pdf-viewer-frame/.test(view) && /src="\/api\/announcements\/7\/file#navpanes=0&amp;zoom=150"/.test(view) && /data-escape-own="true"/.test(view));
const frame = (view.match(/<iframe[^>]*data-pdf-viewer-frame[^>]*>/) ?? [""])[0];
const canvas = (view.match(/<div[^>]*data-pdf-viewer-canvas[^>]*>/) ?? [""])[0];
ok("the PDF fills ALL the room below the header (the first frame of the card is not kept here): the canvas has no padding and the frame is stretched to its four edges with no width limit, no rounded corners, no border and no shadow", /absolute inset-0 h-full w-full border-0/.test(frame) && !/max-w-|rounded|shadow|\bp-\d|\bsm:p-/.test(frame + canvas) && /min-h-0 flex-1/.test(canvas));
ok("the browser's thumbnail panel is closed and the page opens at a fixed 150% zoom (never fit-to-width, which stretched it over a wide screen)", FULL_SCREEN_VIEW === "#navpanes=0&zoom=150" && !/FitH/.test(FULL_SCREEN_VIEW));
const maskSrc = readFileSync("src/components/PdfBarMask.tsx", "utf8");
const markFile = h(<AnnouncementFile id={7} file={{ name: "x.pdf", bytes: 1500 }} startOpen={true} onOpenFull={noop} />);
ok("the PDF viewer's own scrollbars are hidden until the pointer is over the frame: two strips in the viewer's background colour, painted over where the bars sit, that fade away on hover of the frame's box (group-hover), never catch the pointer, and leave the toolbar uncovered (the vertical one starts below it)", /pointer-events-none/.test(maskSrc) && /group-hover:opacity-0/.test(maskSrc) && /bg-\[#282828\]/.test(maskSrc) && /top-14/.test(maskSrc) && /data-pdf-bar-mask="vertical"/.test(maskSrc) && /data-pdf-bar-mask="horizontal"/.test(maskSrc));
ok("both frames carry the strips inside a hover group: the card's frame (clipped, rounded box) and the full-screen canvas", /class="group relative h-\[68vh\] overflow-hidden/.test(markFile) && /data-pdf-bar-mask="vertical"/.test(markFile) && /data-pdf-bar-mask="vertical"/.test(view) && /class="group relative min-h-0 flex-1"/.test(canvas));

// ---- SEARCH INSIDE A PDF: the page the words were found on, and the state of the PDF's reading in the manager
const atPage = h(<AnnouncementFile id={7} file={file} startOpen={false} onOpenFull={noop} page={3} />);
ok("a result found inside the PDF opens the window with the PDF shown at once, on that page (no View-here toggle), and says so", /data-pdf-frame/.test(atPage) && /src="\/api\/announcements\/7\/file#page=3&amp;view=FitH"/.test(atPage) && !/data-pdf-toggle/.test(atPage) && /found on page 3/.test(atPage));
ok("with no page the card is as it was (frame closed, View here, fit-to-width, no 'found on page')", !/found on page/.test(closed) && !/data-pdf-frame/.test(closed) && /data-pdf-toggle/.test(closed) && /#view=FitH/.test(open));
ok("the full-screen viewer opens on the page too, still at 150%, thumbnail panel closed", fullScreenView(5) === "#page=5&navpanes=0&zoom=150" && fullScreenView() === FULL_SCREEN_VIEW && fullScreenView(0) === FULL_SCREEN_VIEW && /file#page=5&amp;navpanes=0&amp;zoom=150/.test(h(<PdfViewerView id={7} title="t" fileName="f.pdf" onClose={noop} page={5} />)));
const modalAt = h(<AnnouncementModal announcement={{ ...base, content: "<p>The text.</p>", file }} onClose={noop} pdfPage={2} />);
ok("the announcement's window passes the page on: body text, then the PDF card with its frame on that page", /announcement-content/.test(modalAt) && /file#page=2&amp;view=FitH/.test(modalAt) && /found on page 2/.test(modalAt));
const itemSrc = (extra: Partial<AnnouncementItemView>): AnnouncementItemView => ({ id: 7, title: "Policy", content: "", contentText: null, date: "2026-11-17T04:00:00.000Z", createdAt: "2026-11-17T04:00:00.000Z", authorTicketNo: "498301", authorName: "X", canEdit: true, hoursLeft: 10, version: "v", file, ...extra });
const stReady = h(<PdfSearchState item={itemSrc({ searchIndex: { pdf: { status: "ready", note: null, pages: 3, textPages: 2, ocrPages: 1 }, body: null } })} onReindex={noop} />);
const stFail = h(<PdfSearchState item={itemSrc({ searchIndex: { pdf: { status: "failed", note: "GEMINI_API_KEY is not set", pages: null, textPages: null, ocrPages: null }, body: null } })} onReindex={noop} />);
const stNone = h(<PdfSearchState item={itemSrc({ searchIndex: null })} onReindex={noop} />);
const stBodyFail = h(<PdfSearchState item={itemSrc({ file: null, searchIndex: { pdf: null, body: { status: "failed", note: "quota", chunks: null } } })} onReindex={noop} />);
ok("a PDF that was read says it is searchable inside, with its pages and how they were read, and has no button", /data-pdf-search="ready"/.test(stReady) && /Searchable inside/.test(stReady) && /\(3 pages read: 2 from its own text, 1 read by AI\)/.test(stReady) && !/data-pdf-reindex/.test(stReady));
ok("a PDF taken wholly from its own text does not mention AI", !/read by AI/.test(h(<PdfSearchState item={itemSrc({ searchIndex: { pdf: { status: "ready", note: null, pages: 2, textPages: 2, ocrPages: 0 }, body: null } })} />)));
ok("a PDF that could not be read says why and offers 'Index again'", /data-pdf-search="failed"/.test(stFail) && /Not searchable inside: GEMINI_API_KEY is not set/.test(stFail) && /data-pdf-reindex/.test(stFail) && />Index again</.test(stFail));
ok("a PDF not prepared yet says that only its title is searchable and offers the same button; without the handler there is no button", /data-pdf-search="unread"/.test(stNone) && /only its title is searchable/.test(stNone) && /data-pdf-reindex/.test(stNone) && !/data-pdf-reindex/.test(h(<PdfSearchState item={itemSrc({ searchIndex: null })} />)));
ok("a text that could not be indexed is told even where there is no PDF, with the button; an announcement with no PDF and a fine text shows nothing", /data-body-search="failed"/.test(stBodyFail) && /still found literally/.test(stBodyFail) && /data-pdf-reindex/.test(stBodyFail) && h(<PdfSearchState item={itemSrc({ file: null, searchIndex: null })} onReindex={noop} />) === "");
ok("the manager's card shows that state under the PDF chip, and the button is off while something is running", /data-pdf-search/.test(h(<AnnouncementCard item={itemSrc({ searchIndex: null })} onReindex={noop} />)) && /disabled=""[^>]*data-pdf-reindex|data-pdf-reindex[^>]*disabled=""/.test(h(<PdfSearchState item={itemSrc({ searchIndex: null })} onReindex={noop} busy />)) && !/data-pdf-search/.test(h(<AnnouncementCard item={itemSrc({ file: null })} onReindex={noop} />)));
const omniSrc = readFileSync("src/components/OmnibarModal.tsx", "utf8");
ok("on the search results an announcement found inside its PDF says 'In the PDF, page N' with the passage, and a click opens the window on that page", /data-match-in-pdf/.test(omniSrc) && /data-pdf-passage/.test(omniSrc) && /data-pdf-page-picture/.test(omniSrc) && /\/api\/announcements\/\$\{realSourceId\(result\.id\)\}\/page\/\$\{result\.matchPage\}/.test(omniSrc) && /openAnnouncement\(realSourceId\(result\.id\), result\.matchInPdf \? result\.matchPage \?\? null : null\)/.test(omniSrc) && /setSelectedAnnouncement\(\{ \.\.\.data, pdfPage \}\)/.test(omniSrc) && /pdfPage=\{selectedAnnouncement\.pdfPage \?\? null\}/.test(omniSrc));
const panelSrc = readFileSync("src/components/AnnouncementAdminPanel.tsx", "utf8");
ok("after a publish or edit the manager reads what happened to the PDF's reading (a failure is a warning, the announcement is saved); 'Read it again' calls the reindex operation", /indexingNotice\(/.test(panelSrc) && /op: "reindex"/.test(panelSrc) && /onReindex=\{reindex\}/.test(panelSrc) && /tone: indexing\.status === "failed" \? "warn" : "ok"/.test(panelSrc));
const shellOnly = h(<ViewerShell title="A circular" onClose={noop}><i>body</i></ViewerShell>);
ok("the layer is ONE component, shared: by default it is the circular viewer's own (z 150, cross named 'Close viewer')", /bg-black\/85 backdrop-blur-md z-\[150\]/.test(shellOnly) && /aria-label="Close viewer"/.test(shellOnly) && /<h1[^>]*>A circular<\/h1>/.test(shellOnly) && /<i>body<\/i>/.test(shellOnly) && !/data-escape-own/.test(shellOnly));
const circSrc = readFileSync("src/components/CircularViewerLightbox.tsx", "utf8");
const viewerSrc = readFileSync("src/components/AnnouncementPdfViewer.tsx", "utf8");
ok("the circular viewer now draws its layer with that shared component (it has no layer markup of its own any more) and keeps its page scroller and match markers", /import \{ ViewerShell \} from "@\/components\/ViewerShell"/.test(circSrc) && /<ViewerShell/.test(circSrc) && !/fixed inset-0/.test(circSrc) && !/<motion\.div/.test(circSrc) && /scrollerRef/.test(circSrc) && /Match/.test(circSrc));
ok("the PDF viewer is drawn in a portal on <body>, closes on Escape in the capture phase (so neither TopBar nor the search window closes behind it), locks the page's scrolling, and a click in it does not reach the announcement's window", /createPortal\(/.test(viewerSrc) && /document\.body/.test(viewerSrc) && /onEscape\(window, onClose\)/.test(viewerSrc) && /lockPageScroll\(\)/.test(viewerSrc) && /lock\.release\(\)/.test(viewerSrc) && /onClick=\{\(e\) => e\.stopPropagation\(\)\} data-pdf-viewer-root/.test(viewerSrc));
const fileSrc = readFileSync("src/components/AnnouncementFile.tsx", "utf8");
ok("the full-screen button only asks the window to open the viewer (the window owns it, so the button, the linked words and the title open the same one); the window shows it, with its own title", /onClick=\{onOpenFull\}/.test(fileSrc) && !/AnnouncementPdfViewer/.test(fileSrc) && /setPdfOpen\(true\)/.test(modalSrc) && /<AnnouncementPdfViewer open=\{pdfOpen\} id=\{announcement\.id\} title=\{announcement\.title\}/.test(modalSrc) && /onOpenFull=\{openPdf\}/.test(modalSrc));
const feedSrc0 = readFileSync("src/components/AnnouncementsFeed.tsx", "utf8");
ok("on the home page's card the title text shows the hand cursor when the card opens something, and the plain cursor only when it does not", /\$\{hasContent \|\| isClickableToMarkRead \? "cursor-pointer" : "cursor-default"\}/.test(feedSrc0) && !/truncate cursor-default">/.test(feedSrc0));

// ---- words of the body linked to the PDF (the title is never a link)
const linked = '<p>Read the <a data-pdf-link="true" role="button" tabindex="0" title="Opens the PDF">attached guidelines</a> before 12th.</p>';
const withLink = h(<AnnouncementModal announcement={{ ...base, content: linked, file }} onClose={noop} />);
ok("with a body and a PDF, the linked words are drawn as a link that opens the PDF (a button for the keyboard and screen readers, no address), and the body is wired for click and keys", /<a data-pdf-link="true" role="button" tabindex="0" title="Opens the PDF">attached guidelines<\/a>/.test(withLink) && !/href=/.test((withLink.match(/<a data-pdf-link[^>]*>/) ?? [""])[0]) && /announcement-content/.test(withLink));
ok("with body text, the title is plain text (not a link), and the PDF card is under the text", !/data-title-pdf-link/.test(withLink) && withLink.indexOf("announcement-content") < withLink.indexOf("data-announcement-file"));
ok("when the announcement is known to have no PDF, linked words are plain words (no link, the words stay)", (() => { const none = h(<AnnouncementModal announcement={{ ...base, content: linked, file: null }} onClose={noop} />); return !/data-pdf-link/.test(none) && /attached guidelines/.test(none); })());
ok("an announcement that is only a title and a PDF keeps a PLAIN title (no link, no button in the heading, no blue underline): the PDF opens full screen only by the card's expand button, which is there", /<h2[^>]*>SAIL DARPAN \| Frequently Asked Questions<\/h2>/.test(pdfOnly) && !/data-title-pdf-link/.test(pdfOnly) && !/<h2[^>]*><button/.test(pdfOnly) && /data-pdf-fullscreen/.test(pdfOnly));
ok("an announcement with no PDF has a plain title", /<h2[^>]*>just text|<h2[^>]*>SAIL DARPAN/.test(textOnly) && !/data-title-pdf-link/.test(textOnly) && !/data-title-pdf-link/.test(empty));
ok("a click, or Enter or Space, on words with the marker opens the PDF; nothing opens when the announcement has no PDF; the viewer is mounted only when there is a PDF", /closest\?\.\(`\[\$\{PDF_LINK_ATTR\}\]`\)\) openPdf\(\)/.test(modalSrc) && /e\.key === "Enter" \|\| e\.key === " "/.test(modalSrc) && /const openPdf = \(\) => \{ if \(file\) setPdfOpen\(true\); \}/.test(modalSrc) && /\{file && <AnnouncementPdfViewer/.test(modalSrc));

// ---- the manager's picker
const picker = (o: Partial<React.ComponentProps<typeof PdfPicker>> = {}) => h(<PdfPicker chosen={null} current={null} removeCurrent={false} onChoose={noop} onClear={noop} onRemoveCurrent={noop} {...o} />);
const fresh = picker();
ok("the picker says PDF is optional, one PDF up to 10 MB, a title and a PDF alone is enough; has an accessible file input for PDFs only", /PDF \(Optional\)/.test(fresh) && /up to 10 MB/.test(fresh) && /A title and a PDF alone is enough/.test(fresh) && /accept="application\/pdf,\.pdf"/.test(fresh) && /aria-label="Choose a PDF to attach"/.test(fresh) && /Choose a PDF<\/button>/.test(fresh));
const chosen = picker({ chosen: new File([new Uint8Array(1500)], "notice.pdf") });
ok("a chosen file shows its name and size and can be taken off", /notice\.pdf · 1 KB/.test(chosen) && /Take it off/.test(chosen) && /data-pdf-chosen/.test(chosen));
const editing = picker({ current: file });
ok("when editing an announcement that has a PDF, the picker shows it with 'Remove this PDF' and offers to replace it", /data-pdf-current/.test(editing) && /SAIL DARPAN FAQ\.pdf · 2\.3 MB/.test(editing) && /Remove this PDF/.test(editing) && /Replace with another PDF/.test(editing));
const removing = picker({ current: file, removeCurrent: true });
ok("a PDF marked for removal says it will be removed when you update, and offers to keep it", /data-pdf-removing/.test(removing) && /will be removed when you update/.test(removing) && /Keep it/.test(removing));
const replacing = picker({ current: file, chosen: new File([new Uint8Array(10)], "new.pdf") });
ok("a new file chosen over an existing PDF says it replaces it", /replaces SAIL DARPAN FAQ\.pdf/.test(replacing));
ok("a problem with the file is shown as an alert", /role="alert"[^>]*>Only a PDF/.test(picker({ error: "Only a PDF can be attached." })));

// ---- the manager's cards
const item: AnnouncementItemView = { id: 7, title: "T", content: "", contentText: null, date: "2026-11-17T04:00:00.000Z", createdAt: "2026-11-17T04:00:00.000Z", authorTicketNo: "498301", authorName: "TEST", canEdit: true, hoursLeft: 100, version: "v", file };
ok("a card of the manager marks an announcement that has a PDF (name and size), and one that has none carries no mark", /data-card-pdf/.test(h(<AnnouncementCard item={item} />)) && /PDF: SAIL DARPAN FAQ\.pdf · 2\.3 MB/.test(h(<AnnouncementCard item={item} />)) && !/data-card-pdf/.test(h(<AnnouncementCard item={{ ...item, file: null }} />)));

// ---- the panel and the two lists (source guards)
const panel = readFileSync("src/components/AnnouncementAdminPanel.tsx", "utf8");
ok("the panel sends a form (not JSON) only when a PDF is chosen or one is to be removed; a plain publish and edit stay JSON", /pdf \|\| removePdf \? await callForm\(\{ \.\.\.fields, removeFile: removePdf && !pdf \}, pdf\) : await call\(fields\)/.test(panel) && /const res = pdf \? await callForm\(fields, pdf\) : await call\(fields\)/.test(panel));
ok("the form call waits two minutes (a PDF is slow to send), the picker checks name, emptiness and size before anything is sent, and the PDF state is cleared on publish, update and cancel", /120_000/.test(panel) && /function pdfProblem/.test(panel) && /MAX_PDF_BYTES/.test(panel) && (panel.match(/clearPdfState\(\)/g) ?? []).length >= 3 && /setCurrentPdf\(item\.file \?\? null\)/.test(panel));
ok("the picker sits under the content editor in the publish form", panel.indexOf("<PdfPicker") > panel.indexOf("<RichTextEditor") && panel.indexOf("<PdfPicker") < panel.indexOf('id="announcement-datetime"'));
const feed = readFileSync("src/components/AnnouncementsFeed.tsx", "utf8");
const side = readFileSync("src/components/Announcements.tsx", "utf8");
ok("both lists of the home page open an announcement that has only a PDF (they opened only those with body text), and mark it with a PDF icon", [feed, side].every((s) => /const hasContent = !!item\.content \|\| !!item\.file/.test(s) && /FileText/.test(s) && /aria-label="PDF"/.test(s)));
console.log(`AnnouncementFile selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
