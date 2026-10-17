// Run: npx tsx --tsconfig tsconfig.json src/lib/ingestion/pageReader.selftest.ts   (no network: a scripted fetch stands in for the services)
import { DEFAULT_GEMINI_MODEL, PAGE_READER_PROMPT, STOPPED_MARKER, cutAtLoop, geminiReader, readerFromEnv } from "./pageReader";

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

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
