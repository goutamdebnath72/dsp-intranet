// Run: npx tsx --tsconfig tsconfig.json src/lib/ingestion/pageReader.selftest.ts   (no network: a scripted fetch stands in for the services)
import { DEFAULT_GEMINI_MODEL, DEFAULT_OLLAMA_CTX, OLLAMA_MAX_REPLY_TOKENS, PAGE_READER_PROMPT, geminiReader, ollamaReader, readerFromEnv } from "./pageReader";

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

  // ---- Ollama
  let o: any = null;
  const ol = ollamaReader({ baseUrl: "http://10.0.0.5:11434/", model: "qwen2.5vl:7b", fetchImpl: async (url, init) => { o = { url, body: JSON.parse(init.body) }; return res(200, { message: { content: " page text " } }); } });
  ok("the local reader names its model", ol.name === "ollama:qwen2.5vl:7b");
  ok("the local reader returns the text", (await ol.read(png)) === "page text");
  ok("it calls the local server's chat address, with the page as an image", o.url === "http://10.0.0.5:11434/api/chat" && o.body.model === "qwen2.5vl:7b" && o.body.stream === true && o.body.messages[0].images[0] === png.toString("base64"));
  ok("the request asks for enough working memory (the default 4096 was too little for a page: 4272 tokens) and caps the reply", o.body.options.num_ctx === DEFAULT_OLLAMA_CTX && DEFAULT_OLLAMA_CTX >= 8192 && o.body.options.num_predict === OLLAMA_MAX_REPLY_TOKENS && o.body.options.temperature === 0);
  let o2: any = null;
  await ollamaReader({ model: "m", numCtx: 12000, fetchImpl: async (_u, init) => { o2 = JSON.parse(init.body); return res(200, { message: { content: "x" } }); } }).read(png);
  ok("the working memory can be set", o2.options.num_ctx === 12000);
  ok("a refusal for lack of working memory says what to change", await ollamaReader({ model: "m", fetchImpl: async () => res(400, { error: "request (4272 tokens) exceeds the available context size (4096 tokens), try increasing it" }) }).read(png).then(() => false, (e) => /400/.test(String(e)) && /PAGE_READER_OLLAMA_CTX/.test(String(e))));
  // the reply is STREAMED (a reply that has not started after 300 s makes Node's fetch give up): pieces may end in the middle of a line
  const enc = new TextEncoder();
  const streamOf = (chunks: string[]) => new ReadableStream<Uint8Array>({ start(c) { for (const k of chunks) c.enqueue(enc.encode(k)); c.close(); } });
  const streamed = (chunks: string[]) => ollamaReader({ model: "m", fetchImpl: async () => ({ ok: true, status: 200, text: async () => "", json: async () => ({}), body: streamOf(chunks) }) });
  ok("a streamed reply is put together, even when a piece ends in the middle of a line", (await streamed(['{"message":{"content":"Hel"},"done":false}\n{"message":{"content":"lo "}', ',"done":false}\n{"message":{"content":"page"},"done":true}\n']).read(png)) === "Hello page");
  ok("a last line without a newline is read too", (await streamed(['{"message":{"content":"a"},"done":false}\n{"message":{"content":"b"},"done":true}']).read(png)) === "ab");
  ok("an error inside the stream is reported", await streamed(['{"error":"model runner crashed"}\n']).read(png).then(() => false, (e) => /model runner crashed/.test(String(e))));
  ok("an empty stream is an error", await streamed(["\n"]).read(png).then(() => false, (e) => /no text/.test(String(e))));
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
