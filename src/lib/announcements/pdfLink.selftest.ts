// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/lib/announcements/pdfLink.selftest.ts
// Words of an announcement that open its PDF: the marker, taking it off, and what the editor, the saving code and the panel do with it.
import { readFileSync } from "node:fs";
import { PDF_LINK_ATTR, hasPdfLinks, stripPdfLinks } from "./pdfLink";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };
const A = '<a data-pdf-link="true" role="button" tabindex="0" title="Opens the PDF">attached guidelines</a>';

ok("the marker is data-pdf-link", PDF_LINK_ATTR === "data-pdf-link");
ok("a body is found to have a PDF link, or not", hasPdfLinks(`<p>Read the ${A}.</p>`) && !hasPdfLinks("<p>Read the guidelines.</p>") && !hasPdfLinks('<p><a href="http://x.example">other link</a></p>') && !hasPdfLinks(null) && !hasPdfLinks(""));
ok("taking the links off keeps the words, in place, and every link of the body goes", stripPdfLinks(`<p>Read the ${A}, and the ${A.replace("attached guidelines", "form")}.</p>`) === "<p>Read the attached guidelines, and the form.</p>");
ok("taking them off when there are none changes nothing (and nothing breaks on empty input)", stripPdfLinks("<p>a <strong>b</strong></p>") === "<p>a <strong>b</strong></p>" && stripPdfLinks(null) === "" && stripPdfLinks(undefined) === "");
ok("words with other marks inside the link survive: bold, red", stripPdfLinks('<p><a data-pdf-link="true"><strong>bold</strong> <span style="color: #dc2626">red</span></a></p>') === '<p><strong>bold</strong> <span style="color: #dc2626">red</span></p>');
ok("an ordinary link with an address is not a PDF link and is left for the saving code to flatten", stripPdfLinks('<a href="http://x.example">x</a>') === '<a href="http://x.example">x</a>');

const mark = readFileSync("src/lib/announcements/pdfLinkMark.ts", "utf8");
const editor = readFileSync("src/components/RichTextEditor.tsx", "utf8");
const panel = readFileSync("src/components/AnnouncementAdminPanel.tsx", "utf8");
ok("the editor's mark writes an <a> with the marker and no address, reads it back from a saved body, and does not extend when typing at its end", /name: "pdfLink"/.test(mark) && /tag: "a\[data-pdf-link\]"/.test(mark) && /"data-pdf-link": "true"/.test(mark) && !/href/.test(mark) && /inclusive: false/.test(mark));
ok("the editor switches StarterKit's own Link off (it keeps an address and links typed web addresses), adds the PDF link mark, and has the toolbar button, switched off unless a PDF is available, which toggles the mark on selected words and off inside linked words", /StarterKit\.configure\(\{ link: false \}\)/.test(editor) && /\bPdfLink,/.test(editor) && /data-pdf-link-button/.test(editor) && /disabled=\{!pdfLinkAvailable\}/.test(editor) && /setMark\("pdfLink"\)/.test(editor) && /extendMarkRange\("pdfLink"\)\.unsetMark\("pdfLink"\)/.test(editor) && /!editor\.state\.selection\.empty/.test(editor));
ok("the panel allows the button only when the announcement has a PDF (one chosen now, or its own not being removed), shows how to use it, and warns when linked words have no PDF to open", /const pdfAvailable = !!pdf \|\| \(!!currentPdf && !removePdf\)/.test(panel) && /pdfLinkAvailable=\{pdfAvailable\}/.test(panel) && /data-pdf-link-hint/.test(panel) && /data-pdf-link-warning/.test(panel) && /will be saved as plain text/.test(panel));
const store = readFileSync("src/lib/announcements/admin/store.ts", "utf8");
ok("the store keeps links only where there is a PDF: a publish without a file, and an edit that ends with none, save plain words", /input\.file \? sanitizeAnnouncementHtml\(input\.content\) : stripPdfLinks\(sanitizeAnnouncementHtml\(input\.content\)\)/.test(store) && /hasFile \? sanitizedContent : stripPdfLinks\(sanitizedContent\)/.test(store));
console.log(`pdfLink selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
