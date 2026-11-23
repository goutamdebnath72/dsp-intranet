// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/lib/announcements/contentProcessing.selftest.ts
// What I check here: what an announcement's body keeps when it is saved, and what the editor does to pasted text: the five palette colours stay, any other colour goes (it dimmed the body), nothing else of the markup survives.
import { readFileSync } from "node:fs";
import { htmlToPlainText, sanitizeAnnouncementHtml } from "./contentProcessing";
import { TEXT_COLOURS, paletteColourPatterns } from "./palette";
import { stripPastedColours } from "./pasteClean";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };
const span = (style: string, text = "x") => `<p><span style="${style}">${text}</span></p>`;

// ---- the palette
ok("the palette is the toolbar's five colours: red, blue, green, amber, purple", TEXT_COLOURS.map((c) => c.name).join() === "Red,Blue,Green,Amber,Purple" && TEXT_COLOURS.every((c) => /^#[0-9a-f]{6}$/.test(c.value)));
ok("each colour has two patterns: as #rrggbb (any case) and as rgb(r, g, b), which is how a browser gives it back", paletteColourPatterns().length === 10);

// ---- what is kept on saving
for (const c of TEXT_COLOURS) {
  ok(`${c.name} (${c.value}) is kept, as the editor writes it`, sanitizeAnnouncementHtml(span(`color: ${c.value}`)).toLowerCase().includes(c.value));
}
ok("a palette colour in capitals, or as rgb() (the form a browser gives back when a saved announcement is opened for editing), is kept", sanitizeAnnouncementHtml(span("color: #DC2626")).toLowerCase().includes("#dc2626") && /rgb\(220, 38, 38\)/.test(sanitizeAnnouncementHtml(span("color: rgb(220, 38, 38)"))) && /rgb\(37,\s*99,\s*235\)/.test(sanitizeAnnouncementHtml(span("color:rgb(37,99,235)"))));
ok("the pale grey that pasted text carries is dropped, and the words stay", (() => { const out = sanitizeAnnouncementHtml(span("color: rgb(170, 170, 170)", "Pasted words")); return !/color|170/.test(out) && /Pasted words/.test(out); })());
ok("any other colour goes: a keyword, a short hex, another hex, another rgb", ["color: red", "color: #aaa", "color: #123456", "color: rgb(1, 2, 3)", "color: rgb(220, 38, 39)", "color: grey"].every((st) => !/color/.test(sanitizeAnnouncementHtml(span(st)))));
ok("every other style property goes (background, size, font, position), even beside a palette colour, which stays", (() => { const out = sanitizeAnnouncementHtml(span("color: #dc2626; background-color: yellow; font-size: 40px; position: fixed")); return /#dc2626/.test(out) && !/background|font-size|position|yellow/.test(out); })());
ok("bold, italic, underline, strike, paragraphs and line breaks are kept", sanitizeAnnouncementHtml("<p><strong>a</strong> <em>b</em> <u>c</u> <s>d</s><br>e</p>") === "<p><strong>a</strong> <em>b</em> <u>c</u> <s>d</s><br />e</p>");
ok("headings, lists, links, images and scripts are not kept (their words are, where they have any)", (() => { const out = sanitizeAnnouncementHtml('<h1>Head</h1><ul><li>one</li></ul><a href="http://x.example">link</a><img src=x onerror=alert(1)><script>alert(1)</script>'); return !/<h1|<ul|<li|<a |<img|<script|href|onerror/.test(out) && /Head/.test(out) && /one/.test(out) && /link/.test(out); })());
ok("saving twice changes nothing, and an empty document collapses to nothing", (() => { const once = sanitizeAnnouncementHtml(span("color: #dc2626", "a") + span("color: rgb(170, 170, 170)", "b")); return sanitizeAnnouncementHtml(once) === once; })() && sanitizeAnnouncementHtml("<p></p>") === "" && sanitizeAnnouncementHtml(null) === "");
ok("blank paragraphs between paragraphs (a blank line typed for readability) are kept as they are and add nothing to the plain text that is searched", (() => { const out = sanitizeAnnouncementHtml("<p>One</p><p></p><p>Two</p>"); return out === "<p>One</p><p></p><p>Two</p>" && htmlToPlainText(out) === "One Two"; })());

// ---- words that open the PDF
const LINK = '<p>Read <a data-pdf-link="true" role="button" tabindex="0" title="Opens the PDF">the guidelines</a>.</p>';
ok("a PDF link is kept, exactly as the editor writes it (marker, role, tabindex, title) and nothing else", sanitizeAnnouncementHtml(LINK) === LINK);
ok("whatever else a PDF link carries is dropped, an address above all (it can never point anywhere)", (() => { const out = sanitizeAnnouncementHtml('<p><a data-pdf-link="x" href="http://evil.example" target="_blank" onclick="alert(1)" class="c" style="color:red">go</a></p>'); return out === '<p><a data-pdf-link="true" role="button" tabindex="0" title="Opens the PDF">go</a></p>'; })());
ok("an ordinary link (pasted from a page) becomes plain words: no <a>, no address, the words stay", (() => { const out = sanitizeAnnouncementHtml('<p>See <a href="https://example.org/x" target="_blank">this page</a>.</p>'); return !/<a |href|example\.org/.test(out) && /See <span>this page<\/span>\./.test(out); })());
ok("a link with a javascript: address is flattened the same way", !/javascript|<a /.test(sanitizeAnnouncementHtml('<a href="javascript:alert(1)">x</a>')));
ok("a PDF link beside a palette colour keeps both, and saving twice changes nothing", (() => { const once = sanitizeAnnouncementHtml('<p><span style="color: #dc2626">red</span> <a data-pdf-link="true">link</a></p>'); return /#dc2626/.test(once) && /data-pdf-link="true"/.test(once) && sanitizeAnnouncementHtml(once) === once; })());
ok("the words of a PDF link are in the plain text that is searched, the markup is not", htmlToPlainText(LINK).replace(/\s+([.,])/g, "$1") === "Read the guidelines." && !/[<>]/.test(htmlToPlainText(LINK)));

// ---- what the editor does to pasted text
ok("pasted colour is removed from the style of every element, the words and the other markup stay", stripPastedColours('<p><span style="color: rgb(170, 170, 170)">Pasted</span> <b style="color:#999;font-weight:600">bold</b></p>') === '<p><span>Pasted</span> <b style="font-weight:600">bold</b></p>');
ok("background-color is not mistaken for color, and single-quoted style attributes are handled", stripPastedColours(`<span style='color: red; background-color: yellow'>a</span>`) === `<span style="background-color: yellow">a</span>`);
ok("HTML with no style is returned untouched, and so is an empty or missing input", stripPastedColours("<p>plain <strong>x</strong></p>") === "<p>plain <strong>x</strong></p>" && stripPastedColours("") === "" && stripPastedColours(undefined as unknown as string) === "");
ok("a style that held only a colour is removed altogether", stripPastedColours('<span style="color: #aaa;">a</span>') === "<span>a</span>");

// ---- the editor uses both
const editor = readFileSync("src/components/RichTextEditor.tsx", "utf8");
ok("the editor takes its swatches from the palette (Default first), and strips the colour of pasted text", /const COLORS = \[\{ name: "Default", value: "" \}, \.\.\.TEXT_COLOURS\]/.test(editor) && /transformPastedHTML: stripPastedColours/.test(editor) && !/#dc2626/.test(editor));
const proc = readFileSync("src/lib/announcements/contentProcessing.ts", "utf8");
ok("the saving code allows only the palette's colours", /color: paletteColourPatterns\(\)/.test(proc) && !/\[a-zA-Z\]\+/.test(proc));
console.log(`contentProcessing selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
