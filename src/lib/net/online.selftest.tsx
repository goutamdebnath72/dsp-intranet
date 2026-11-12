// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/lib/net/online.selftest.tsx
// The red "you are offline" message of the search window: the real check, the wording, the banner and the ping route.
import React from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { probeOnline, offlineAdvice, PING_URL } from "./online";
import { OfflineBanner } from "../../components/OfflineBanner";
import { GET, HEAD } from "../../app/api/ping/route";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };

async function main() {
  let calls = 0;
  ok("a server that answers (204, or even an error page) proves the way is open", (await probeOnline(async () => { calls++; return { status: 204 }; })) === true && (await probeOnline(async () => ({ status: 503 }))) === true);
  ok("a refused connection is offline", (await probeOnline(async () => { throw new TypeError("Failed to fetch"); })) === false);
  const t0 = Date.now();
  const slow = await probeOnline((_u, init) => new Promise((_res, rej) => { init.signal.addEventListener("abort", () => rej(new Error("aborted"))); }), true, 80);
  ok("no answer within the time is offline, and it does not wait longer", slow === false && Date.now() - t0 < 1000);
  calls = 0;
  ok("when the browser itself says offline, nothing is sent", (await probeOnline(async () => { calls++; return { status: 204 }; }, false)) === false && calls === 0);
  let asked = "";
  await probeOnline(async (u) => { asked = u; return { status: 204 }; });
  ok("it asks only our own tiny ping", asked === PING_URL && PING_URL === "/api/ping");

  ok("the wording differs for no network and for a network with no way out", /not connected to a network/.test(offlineAdvice(false)) && /joined to a network, but the intranet cannot be reached/.test(offlineAdvice(true)));

  const off = renderToStaticMarkup(<OfflineBanner online={false} browserOnline={false} />);
  ok("offline: a red alert with the Wi-Fi symbol struck through, the words, and what still works", /role="alert"/.test(off) && /You are offline/.test(off) && /border-red-300/.test(off) && /bg-red-600/.test(off) && /<svg/.test(off) && /lucide-wifi-off/.test(off) && /Calculators and unit converters still work/.test(off) && /not connected to a network/.test(off));
  ok("online: nothing is drawn", renderToStaticMarkup(<OfflineBanner online />) === "");

  const r = GET(), h = HEAD();
  ok("the ping route answers 204, empty, never cached", r.status === 204 && h.status === 204 && /no-store/.test(r.headers.get("Cache-Control") ?? "") && (await r.text()) === "");
  const route = readFileSync("src/app/api/ping/route.ts", "utf8").replace(/\/\/.*$/gm, "");
  ok("the ping route reads nothing and touches no database", !/request|cookies|headers\(|prisma|typeorm|supabase|getDataSource/i.test(route.replace(/Cache-Control/g, "")));
  const modal = readFileSync("src/components/OmnibarModal.tsx", "utf8");
  ok("the search window shows the banner, and does not send a search while offline", /<OfflineBanner online=\{net\.online\}/.test(modal) && /if \(!net\.online\) \{ net\.recheck\(\); return; \}/.test(modal) && modal.indexOf("if (!net.online)") > modal.indexOf("const tool = detectTool(qTrim)"));

  console.log(`online selftest: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
void main();
