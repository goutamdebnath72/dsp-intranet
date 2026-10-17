// Run: npx tsx --tsconfig tsconfig.json src/lib/ingestion/pageReader.selftest.ts   (no network: a scripted fetch stands in for the services)
import { DEFAULT_GEMINI_MODEL, PAGE_READER_PROMPT, geminiReader, ollamaReader, readerFromEnv } from "./pageReader";

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
  ok("a wrong model name is NOT retried and is reported", await wrong.read(png).then(() => false, (e) => /404/.test(String(e))) && calls === 1, `calls=${calls}`);
  const blocked = geminiReader({ apiKey: "K", fetchImpl: async () => res(200, { candidates: [{ finishReason: "SAFETY" }] }) });
  ok("an empty answer is an error that says why", await blocked.read(png).then(() => false, (e) => /SAFETY/.test(String(e))));
  const thrower = geminiReader({ apiKey: "K", noWait: true, fetchImpl: async () => { throw new Error("offline"); } });
  ok("a network failure is an error", await thrower.read(png).then(() => false, (e) => /offline/.test(String(e))));
  ok("the default model is named", DEFAULT_GEMINI_MODEL.startsWith("gemini-"));

  // ---- Ollama
  let o: any = null;
  const ol = ollamaReader({ baseUrl: "http://10.0.0.5:11434/", model: "qwen2.5vl:7b", fetchImpl: async (url, init) => { o = { url, body: JSON.parse(init.body) }; return res(200, { message: { content: " page text " } }); } });
  ok("the local reader names its model", ol.name === "ollama:qwen2.5vl:7b");
  ok("the local reader returns the text", (await ol.read(png)) === "page text");
  ok("it calls the local server's chat address, with the page as an image", o.url === "http://10.0.0.5:11434/api/chat" && o.body.model === "qwen2.5vl:7b" && o.body.stream === false && o.body.messages[0].images[0] === png.toString("base64"));
  ok("no model set: a clear error", await ollamaReader({ model: "", fetchImpl: async () => res(200, {}) }).read(png).then(() => false, (e) => /PAGE_READER_OLLAMA_MODEL/.test(String(e))));
  ok("a failing local server is an error", await ollamaReader({ model: "m", fetchImpl: async () => res(500, { error: "x" }) }).read(png).then(() => false, (e) => /500/.test(String(e))));

  // ---- the project's own OLLAMA_MODEL (an embedding model) must never be taken for a page reader
  ok("the embeddings' OLLAMA_MODEL is ignored", readerFromEnv({ PAGE_READER: "ollama", OLLAMA_MODEL: "nomic-embed-text" })?.name === "ollama:(no model set)");
  ok("the embeddings' OLLAMA_HOST is used as the server when no other is given", await (async () => { let u = ""; const r = ollamaReader({ baseUrl: "http://mac:11434", model: "m", fetchImpl: async (url) => { u = url; return res(200, { message: { content: "x" } }); } }); await r.read(png); return u === "http://mac:11434/api/chat"; })());

  // ---- choosing by setting
  ok("no setting: no reader", readerFromEnv({}) === null && readerFromEnv({ PAGE_READER: "none" }) === null);
  ok("gemini by setting", readerFromEnv({ PAGE_READER: "gemini", GEMINI_API_KEY: "K", GEMINI_VISION_MODEL: "m1" })?.name === "gemini:m1");
  ok("a local model by setting", readerFromEnv({ PAGE_READER: "ollama", PAGE_READER_OLLAMA_MODEL: "qwen2.5vl:7b" })?.name === "ollama:qwen2.5vl:7b");
  ok("the setting is not case-sensitive", readerFromEnv({ PAGE_READER: " Gemini ", GEMINI_API_KEY: "K" })?.name.startsWith("gemini:") === true);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
