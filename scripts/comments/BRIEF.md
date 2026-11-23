# Brief for the comment writer

You rewrite the WORDS of code comments in the project `dsp-intranet` (the intranet of SAIL Durgapur Steel Plant: a Next.js app with a search box that answers questions about people, circulars, announcements, holidays, hospital doctors and more). You never touch code.

## Whose voice

Every comment must read as if **Goutam Debnath**, the developer who owns and runs this project, wrote it himself, for his own reference and for the programmers who will read the code after him. He is the "owner" the old comments talk about. The old comments were written by an assistant that recorded his requests in the third person ("the owner wanted…", "Owner, 26 Oct 2026: …"). Turn all of that into HIS first-person voice.

Rules of the voice:
1. First person singular where the comment states a decision, a want, a preference, a rule or a reason: "I want…", "I decided…", "My rule: …", "I chose X because…", "I do not want…". "Owner, 26 Oct 2026: "Keep the previous names as aliases"" becomes "My rule (26 Oct 2026): keep the previous names as aliases …". "the owner" / "the owner's" always becomes "I" / "my" (never leave the word "owner" for him). The HOD (Head of Department of C&IT) is a different person: keep "the HOD" in the third person. "the user" meaning a person who uses the app stays "the user".
2. Warnings and instructions to the next programmer are direct and plain: "Do not …", "If you add a new topic, add one line in …", "Change this value and …".
3. Facts about what was measured, run or checked stay neutral and passive ("checked on screen", "measured: 10.4 MB to 1.3 MB", "verified against the database on 23 Nov 2026"). Do not claim "I measured/tested" unless it is obviously his own decision. Never invent who did something.
4. Plain, personal, direct English. No flourish, no marketing words, no jokes. Do not mention Claude, an assistant, or AI authorship. Keep the technical vocabulary exactly.
5. Do NOT add any fact, number, name or reason that is not in the old comment. Do NOT drop any fact, number, id, file name, function name, date, quoted string, URL, step number ("step 59a", "row 312") or cross-reference. If the old text names an item, the new text names it. Keep the length about the same (a little shorter is fine, never much longer).
6. Keep the structure: each input block is a list of lines; return a list of lines. Keep the line breaks where they mark a list, a heading or a paragraph. A line should stay under about 230 characters. JSDoc tags (`@param`, `@returns`, `@type`…) and their names stay as they are. Section-heading lines such as `---- the server ----` keep their dashes and their meaning; only reword the words when they are a sentence.
7. EVERY explanatory comment is re-voiced; this is the whole point. A plain description such as "This picks the best candidate chunk for DISPLAY only" becomes "I use this to pick the best candidate chunk for DISPLAY only; it never affects ranking." A design statement ("the engine answers X") becomes "I made the engine answer X" or "Here I answer X" when that reads naturally. "we" always becomes "I" (it is one developer). Vary the sentences: not every one starts with "I"; use "I", "my", "you" (the next programmer), and plain statements of fact in the same paragraph, as a person writing his own notes would. Expect to rewrite 85 to 95 percent of the blocks. Leave a block out ONLY when it is: commented-out code; a divider or banner with no sentence; a bare label of one to four words; a table, ASCII drawing or list of data where re-voicing would damage it; or a sentence that is already clearly in his first-person voice. Remove emoji and ALL-CAPS shouting such as "CRITICAL FIX" only by rephrasing it calmly ("Important:").
8. Never put `*/` inside a text. Never wrap your text in comment markers (`//`, `/*`, `*`): return the words only.

Examples (old → new):
- `Owner, 26 Oct 2026: "CHRD was initially the Training Department, later CHRD, and now the Centre for L & D. Keep the previous names as aliases."` → `My rule (26 Oct 2026): CHRD was first the Training Department, later CHRD, and is now the Centre for L & D (CL&D). Keep the previous names as aliases: people still say Training Department or CHRD.` (only if those facts were all in the old text)
- `The owner wants the timer in the top right corner.` → `I want the timer in the top right corner.`
- `Verified on screen 23 Nov 2026: the row sits 0.3 px from the centre line.` → unchanged in meaning: `Checked on screen on 23 Nov 2026: the row sits 0.3 px from the centre line.`
- `Do not add a long browser cache to /public pictures: src/middleware.ts must see each request.` → `Do not add a long browser cache to /public pictures: src/middleware.ts has to see each request.`
- `Free of server-only imports (drawn in the browser).` → `Keep this file free of server-only imports: it is drawn in the browser.`

## How strong the change must be (read this twice)

A light touch (adding "The", fixing a comma) is NOT enough: the owner wants to open any file and hear his own voice. Whenever a comment explains what the code does, why it does it, or what it must never do, say it as the developer talking about HIS code: "I", "my", "here I", "I keep", "I do not", "I chose", "I check", "I never", "I need", "I rely on". About half of your rewritten blocks should contain such a first-person marker (I, my, I'm, I've, I'll); the rest may be plain facts or instructions to the next programmer ("Do not…", "Add one line here when…", "you"). A description of what a function returns can stay plain ("Returns the…") but one sentence in the block should usually carry my reasoning or my rule. Do not start more than a third of the sentences of one block with "I".

Heavier examples (old → new):
- `headline fold is best-effort; body/semantic results still stand.` → `I fold the headline search in on a best-effort basis; if it fails, the body and semantic results still stand.`
- `A "perfect" lexical match must cover most of what was asked, not just any two words (a notice that only shares "contract workers" with "leave policy for contract workers" is not a perfect match).` → `I only call a lexical match "perfect" when it covers most of what was asked, not just any two words: a notice that shares only "contract workers" with "leave policy for contract workers" does not count.`
- `Readability score: share of tokens that look like real words. OCR gibberish scores low.` → `I score readability as the share of tokens that look like real words, so OCR gibberish scores low.`
- `This picks the best candidate chunk for DISPLAY only; it never affects ranking.` → `I use this only to pick the chunk to DISPLAY. It never touches ranking, and you should not make it.`
- `nothing in the circulars either: the data's own explanation stands` → `Nothing in the circulars either, so I let the data's own explanation stand.`
- `2. Call NextAuth with the 1-argument overload (options). This returns a new handler function.` → `Step 2: I call NextAuth with the 1-argument overload (options); it returns a new handler function.`
- A route header listing `GET /api/x  what it returns` lines stays as that list (it is a reference table); only reword the prose sentences around it.

## Input and output

The input file is a JSON array of blocks: `{ "id": "path#n", "file": "...", "kind": "line" | "block" | "trail", "context": "the first code line after the comment", "lines": ["...", "..."] }`. The `context` and `file` are only there so you understand what the comment is about; never copy the context.

Write ONE JSON file (path given in your task) shaped `{ "<id>": ["new line 1", "new line 2"], ... }` containing every block you rewrote (keep the ids exactly). Use the Write tool; make sure the file is valid JSON (escape quotes and backslashes). A `trail` block (a comment after code on the same line) must stay ONE short line.

When you finish, reply with one line only: how many blocks you rewrote and how many you left alone.
