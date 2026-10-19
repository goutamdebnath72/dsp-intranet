// Run: npx tsx --tsconfig tsconfig.json src/lib/ingestion/pageReader.selftest.ts   (no network: a scripted fetch stands in for the services)
import { DEFAULT_GEMINI_MODEL, PAGE_READER_PROMPT, STOPPED_MARKER, cutAtLoop, geminiReader, parseQuotaError, readerFromEnv, sniffImageMime } from "./pageReader";

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

  // ---- a 429 keeps its whole body, says which limit it was, and is waited out only when waiting can help (step 39g)
  {
    const body = (id: string, value: string, retry?: string) => ({
      error: {
        code: 429, message: "You exceeded your current quota, please check your plan and billing details.", status: "RESOURCE_EXHAUSTED",
        details: [
          { "@type": "type.googleapis.com/google.rpc.QuotaFailure", violations: [{ quotaMetric: "generativelanguage.googleapis.com/generate_content_free_tier_requests", quotaId: id, quotaDimensions: { location: "global", model: "gemini-3.8-flash" }, quotaValue: value }] },
          ...(retry ? [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: retry }] : []),
        ],
      },
    });
    const perDay = body("GenerateRequestsPerDayPerProjectPerModel-FreeTier", "20", "31s");
    const perMinute = body("GenerateRequestsPerMinutePerProjectPerModel-FreeTier", "5", "17s");
    const tokens = body("GenerateContentInputTokensPerModelPerMinute-FreeTier", "250000", "9s");
    const q1 = parseQuotaError(JSON.stringify(perDay));
    ok("parseQuotaError: a daily limit says so, with its size, the model and that it renews daily", q1.kind === "per-day" && /^daily limit reached - 20 for gemini-3\.8-flash; it renews daily at midnight Pacific time$/.test(q1.summary) && q1.retryAfterMs === 31000, JSON.stringify(q1));
    const q2 = parseQuotaError(JSON.stringify(perMinute));
    ok("parseQuotaError: a per-minute limit says the wait the service asked for", q2.kind === "per-minute" && q2.summary === "per-minute limit reached - 5 for gemini-3.8-flash; the service says retry in 17 s" && q2.retryAfterMs === 17000, JSON.stringify(q2));
    ok("parseQuotaError: a tokens-per-minute limit is a per-minute limit", parseQuotaError(JSON.stringify(tokens)).kind === "per-minute");
    const q3 = parseQuotaError("You exceeded your quota. Please retry in 31.5s.");
    ok("parseQuotaError: only a message with a wait still gives the wait", q3.kind === "other" && q3.retryAfterMs === 31500 && /retry in 32 s/.test(q3.summary), JSON.stringify(q3));
    ok("parseQuotaError: nothing readable gives a plain 'quota exceeded' and never throws", parseQuotaError("").summary === "quota exceeded" && parseQuotaError("<html>").kind === "other" && parseQuotaError(undefined as unknown as string).kind === "other");
    ok("parseQuotaError: the summary has no brackets (it is put inside brackets)", ![q1, q2, q3].some((q) => /[()]/.test(q.summary)));

    let calls = 0;
    const day = geminiReader({ apiKey: "K", fetchImpl: async () => { calls++; return res(429, perDay); } });
    let dayError = "";
    await day.read(png).catch((e) => { dayError = String(e.message); });
    ok("a DAILY limit fails at once: one call, no waiting", calls === 1 && /^Gemini answered 429 \(daily limit reached - 20 for gemini-3\.8-flash/.test(dayError), `${calls} ${dayError.slice(0, 120)}`);
    ok("...and the message keeps the whole body (the quota id is in it)", /GenerateRequestsPerDayPerProjectPerModel-FreeTier/.test(dayError) && dayError.length > 400, String(dayError.length));

    const waits: number[] = [];
    calls = 0;
    const minute = geminiReader({ apiKey: "K", sleepImpl: async (ms) => { waits.push(ms); }, fetchImpl: async () => { calls++; return calls === 1 ? res(429, perMinute) : res(200, { candidates: [{ content: { parts: [{ text: "after the wait" }] }, finishReason: "STOP" }] }); } });
    const afterWait = await minute.read(png);
    ok("a PER-MINUTE limit is waited out for exactly what the service asked (17 s and half a second), then the read succeeds", afterWait === "after the wait" && calls === 2 && waits.join() === "17500", `${calls} ${waits.join()}`);

    calls = 0;
    const longWait = geminiReader({ apiKey: "K", sleepImpl: async () => undefined, fetchImpl: async () => { calls++; return res(429, body("GenerateRequestsPerMinutePerProjectPerModel-FreeTier", "5", "120s")); } });
    await longWait.read(png).catch(() => undefined);
    ok("a wait longer than 30 s is not waited for here: one call, then it fails", calls === 1);
    const waitsLong: number[] = [];
    let n = 0;
    const patient = geminiReader({ apiKey: "K", maxRetryWaitMs: 200_000, sleepImpl: async (ms) => { waitsLong.push(ms); }, fetchImpl: async () => { n++; return n === 1 ? res(429, body("GenerateRequestsPerMinutePerProjectPerModel-FreeTier", "5", "120s")) : res(200, { candidates: [{ content: { parts: [{ text: "patient" }] }, finishReason: "STOP" }] }); } });
    ok("maxRetryWaitMs allows a longer wait when asked", (await patient.read(png)) === "patient" && waitsLong.join() === "120500");

    const backoffs: number[] = [];
    calls = 0;
    const plain = geminiReader({ apiKey: "K", sleepImpl: async (ms) => { backoffs.push(ms); }, fetchImpl: async () => { calls++; return res(429, { error: { code: 429, message: "slow down" } }); } });
    await plain.read(png).catch(() => undefined);
    ok("a 429 with no detail keeps the fixed back-off (1.5 s, then 4 s) and three calls", calls === 3 && backoffs.join() === "1500,4000", `${calls} ${backoffs.join()}`);
    const seen: string[] = [];
    calls = 0;
    const hooked = geminiReader({ apiKey: "K", sleepImpl: async () => undefined, fetchImpl: async () => { calls++; return calls === 1 ? res(429, perMinute) : res(200, { candidates: [{ content: { parts: [{ text: "ok" }] }, finishReason: "STOP" }] }); } });
    await hooked.read(png, { onAttempt: (a) => seen.push(a.error) });
    ok("the failed attempt reported to the log starts with the plain summary (it survives any later cutting)", seen.length === 1 && /^Gemini answered 429 \(per-minute limit reached - 5 for gemini-3\.8-flash; the service says retry in 17 s\)/.test(seen[0]), seen[0]?.slice(0, 140));
    calls = 0;
    const err500 = geminiReader({ apiKey: "K", noWait: true, fetchImpl: async () => { calls++; return res(503, { error: "x" }); } });
    await err500.read(png).catch(() => undefined);
    ok("a 503 is still retried three times as before", calls === 3);
  }

console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
