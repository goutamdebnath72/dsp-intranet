// Run: npx tsx --tsconfig tsconfig.json src/lib/ingestion/pageReader.selftest.ts   (no network: a scripted fetch stands in for the services)
import { DEFAULT_GEMINI_MODEL, PAGE_READER_PROMPT, STOPPED_MARKER, cutAtLoop, geminiReader, readerFromEnv, sniffImageMime } from "./pageReader";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => { if (cond) pass++; else { fail++; console.log(`FAIL ${name} ${extra}`); } };
const png = Buffer.from([137, 80, 78, 71, 1, 2, 3]);
const res = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body), json: async () => body });

(async () => {
  // ---- Gemini: what is sent
  let seen: any = null;
  const g = geminiReader({ apiKey: "KEY", model: "gemini-test", fetchImpl: async (url, init) => { seen = { url, init, body: JSON.parse(init.body) }; return res(200, { candidates: [{ content: { parts: [{ text: "Hello " }, { text: "page" }] } }] }); } });
  ok("the reader names its model", g.name === "gemini:gemini-test");
  const text = await g.read(png);
  ok("the text of all parts is joined and trimmed", text === "Hello page");
  ok("the request goes to the model's generateContent address", seen.url === "https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent");
  ok("the key travels in a header, not in the address", seen.init.headers["x-goog-api-key"] === "KEY" && !seen.url.includes("KEY"));
  const parts = seen.body.contents[0].parts;
  ok("the request carries the instructions and the page as inline image data", parts[0].text === PAGE_READER_PROMPT && parts[1].inline_data.mime_type === "image/png" && parts[1].inline_data.data === png.toString("base64"));
  ok("the temperature is zero", seen.body.generationConfig.temperature === 0);
  ok("the instructions forbid guessing digits and ask for table rows as 'Column: value'", /NEVER guess a digit/.test(PAGE_READER_PROMPT) && /Column heading: value/.test(PAGE_READER_PROMPT) && /\[illegible\]/.test(PAGE_READER_PROMPT));

  // ---- Gemini: failures
  const noKey = geminiReader({ apiKey: "", fetchImpl: async () => res(200, {}) });
  ok("no key: a clear error", await noKey.read(png).then(() => false, (e) => /GEMINI_API_KEY/.test(String(e))));
  let calls = 0;
  const flaky = geminiReader({ apiKey: "K", noWait: true, fetchImpl: async () => { calls++; return calls < 3 ? res(429, { error: "slow down" }) : res(200, { candidates: [{ content: { parts: [{ text: "ok" }] } }] }); } });
  ok("a busy service (429) is retried and then succeeds", (await flaky.read(png)) === "ok" && calls === 3, `calls=${calls}`);
  calls = 0;
  const down = geminiReader({ apiKey: "K", noWait: true, fetchImpl: async () => { calls++; return res(503, { error: "down" }); } });
  ok("a service that stays down fails after the retries", await down.read(png).then(() => false, (e) => /503/.test(String(e))) && calls === 3, `calls=${calls}`);
  calls = 0;
  const wrong = geminiReader({ apiKey: "K", noWait: true, fetchImpl: async () => { calls++; return res(404, { error: "model not found" }); } });
  ok("a wrong model name is NOT retried and is reported, with what to do about it", await wrong.read(png).then(() => false, (e) => /404/.test(String(e)) && /GEMINI_VISION_MODEL/.test(String(e))) && calls === 1, `calls=${calls}`);
  const blocked = geminiReader({ apiKey: "K", fetchImpl: async () => res(200, { candidates: [{ finishReason: "SAFETY" }] }) });
  ok("an empty answer is an error that says why", await blocked.read(png).then(() => false, (e) => /SAFETY/.test(String(e))));
  const thrower = geminiReader({ apiKey: "K", noWait: true, fetchImpl: async () => { throw new Error("offline"); } });
  ok("a network failure is an error", await thrower.read(png).then(() => false, (e) => /offline/.test(String(e))));
  ok("the default model is the one Google named (gemini-3.8-flash)", DEFAULT_GEMINI_MODEL === "gemini-3.8-flash");

  // ---- the image kind is read from the bytes, not assumed
  ok("a PNG is image/png", sniffImageMime(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) === "image/png");
  ok("a JPEG is image/jpeg", sniffImageMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16])) === "image/jpeg");
  ok("a WebP is image/webp", sniffImageMime(Buffer.concat([Buffer.from("RIFF"), Buffer.from([1, 2, 3, 4]), Buffer.from("WEBPVP8 ")])) === "image/webp");
  ok("anything unknown is sent as image/png", sniffImageMime(Buffer.from([1, 2, 3])) === "image/png" && sniffImageMime(Buffer.alloc(0)) === "image/png");
  let sentMime = "";
  await geminiReader({ apiKey: "K", noWait: true, fetchImpl: async (_u, init) => { sentMime = JSON.parse(init.body).contents[0].parts[1].inline_data.mime_type; return res(200, { candidates: [{ content: { parts: [{ text: "x" }] }, finishReason: "STOP" }] }); } }).read(Buffer.from([0xff, 0xd8, 0xff, 0xe0]));
  ok("the request carries the real kind of the image", sentMime === "image/jpeg", sentMime);

  // ---- Gemini: a reply that did not reach the end of the page is marked, never taken for a complete reading
  const gem = (finish: string | undefined, text: string) => geminiReader({ apiKey: "K", noWait: true, fetchImpl: async () => res(200, { candidates: [{ content: { parts: [{ text }] }, ...(finish ? { finishReason: finish } : {}) }] }) });
  ok("a normal reply (STOP) is returned as it is", (await gem("STOP", "Premium: 150.00").read(png)) === "Premium: 150.00");
  ok("a reply without a finish reason is returned as it is", (await gem(undefined, "Premium: 150.00").read(png)) === "Premium: 150.00");
  ok("a reply cut off at the length limit is marked incomplete", (await gem("MAX_TOKENS", "Premium: 150.00 | Servi").read(png)) === "Premium: 150.00 | Servi\n" + STOPPED_MARKER);
  ok("a reply stopped by a safety rule is marked incomplete too", (await gem("SAFETY", "Some text").read(png)).endsWith(STOPPED_MARKER));
  const rows = "| Head |\n| 150.00 |\n" + "|  |  |  |\n".repeat(40) + "after the form\n";
  const looped = await gem("STOP", rows).read(png);
  ok("a model that began repeating blank table rows is cut: what came before stays, one blank row stays, the marker is written", looped === cutAtLoop(rows) && looped.startsWith("| Head |\n| 150.00 |\n|  |  |  |") && looped.endsWith(STOPPED_MARKER) && !/after the form/.test(looped), JSON.stringify(looped));
  ok("the marker is written once even when the reply was also cut off", ((await gem("MAX_TOKENS", rows).read(png)).match(/reading incomplete/g) ?? []).length === 1);
  ok("six blank table rows in a row are a loop", cutAtLoop("a\n" + "|  |  |\n".repeat(6)).endsWith(STOPPED_MARKER));
  ok("five blank rows are not a loop", cutAtLoop("a\n" + "|  |  |\n".repeat(5) + "b\n") === "a\n" + "|  |  |\n".repeat(5) + "b\n");
  ok("six identical text lines are a loop too", cutAtLoop("x\n" + "same line\n".repeat(7)).endsWith(STOPPED_MARKER));
  ok("a text without a loop is unchanged", cutAtLoop("one\ntwo\nthree\n") === "one\ntwo\nthree\n");
  ok("the prompt tells the model not to write blank form rows out", /\[blank form rows\]/.test(PAGE_READER_PROMPT));

  // ---- choosing by setting
  ok("no setting: no reader", readerFromEnv({}) === null && readerFromEnv({ PAGE_READER: "none" }) === null);
  ok("gemini by setting", readerFromEnv({ PAGE_READER: "gemini", GEMINI_API_KEY: "K", GEMINI_VISION_MODEL: "m1" })?.name === "gemini:m1");
  ok("the local-model setting no longer exists: no reader", readerFromEnv({ PAGE_READER: "ollama", PAGE_READER_OLLAMA_MODEL: "qwen2.5vl:7b" }) === null);
  ok("the setting is not case-sensitive", readerFromEnv({ PAGE_READER: " Gemini ", GEMINI_API_KEY: "K" })?.name.startsWith("gemini:") === true);

    // ---- attempts: how many, how long each ran, and why it failed (step 39c)
  {
    let n = 0;
    const two = geminiReader({ apiKey: "K", noWait: true, maxAttempts: 2, fetchImpl: async () => { n++; return res(503, { error: "down" }); } });
    ok("maxAttempts 2: a service that stays down is asked twice, then fails", await two.read(png).then(() => false, (e) => /503/.test(String(e))) && n === 2, `calls=${n}`);
    n = 0;
    const one = geminiReader({ apiKey: "K", noWait: true, maxAttempts: 1, fetchImpl: async () => { n++; return res(429, { error: "slow" }); } });
    ok("maxAttempts 1: asked once", await one.read(png).then(() => false, () => true) && n === 1);
    n = 0;
    const seenAttempts: { attempt: number; ms: number; error: string }[] = [];
    const hangs = geminiReader({
      apiKey: "K", noWait: true, timeoutMs: 40,
      fetchImpl: (_u, init) => {
        n++;
        if (n === 1) return new Promise((_r, reject) => init.signal?.addEventListener("abort", () => reject(new Error("This operation was aborted")))) as any;
        return Promise.resolve(res(200, { candidates: [{ content: { parts: [{ text: "second try" }] }, finishReason: "STOP" }] }));
      },
    });
    const text2 = await hangs.read(png, { onAttempt: (a) => seenAttempts.push(a) });
    ok("a hung attempt is abandoned at the timeout and the retry succeeds", text2 === "second try" && n === 2, `n=${n} text=${text2}`);
    ok("the failed attempt is reported with its number, how long it ran and why", seenAttempts.length === 1 && seenAttempts[0].attempt === 1 && seenAttempts[0].ms >= 30 && /aborted/.test(seenAttempts[0].error), JSON.stringify(seenAttempts));
    const viaOpts: number[] = [];
    n = 0;
    const flaky2 = geminiReader({ apiKey: "K", noWait: true, fetchImpl: async () => { n++; return n < 3 ? res(503, { error: "x" }) : res(200, { candidates: [{ content: { parts: [{ text: "ok" }] }, finishReason: "STOP" }] }); } });
    await flaky2.read(png, { onAttempt: (a) => viaOpts.push(a.attempt) });
    ok("every failed attempt before a success is reported (two here)", viaOpts.join() === "1,2", viaOpts.join());
    ok("a read that succeeds first time reports nothing", await (async () => { const got: unknown[] = []; await geminiReader({ apiKey: "K", fetchImpl: async () => res(200, { candidates: [{ content: { parts: [{ text: "fine" }] }, finishReason: "STOP" }] }) }).read(png, { onAttempt: (a) => got.push(a) }); return got.length === 0; })());
  }

console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
