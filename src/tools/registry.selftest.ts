// Run (from the project root): npx tsx --tsconfig tsconfig.selftest.json src/tools/registry.selftest.ts
//
// THE GUARD OF MODULARITY. Every topic of the search bar's tools is ONE folder (src/tools/<topic>/) and ONE line in each of the two registries; nothing else may name a topic. This test fails when
// someone breaks that: a topic missing its two descriptor files or its own test, a topic that answers a line nobody can draw, a sample question that its own topic does not answer, a shared file that
// has started to import a topic's internals, or two topics that reach into each other.
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { TOPICS } from "./registry";
import { TOPIC_UIS } from "./registry.ui";
import { MENU_SAMPLES } from "./menu";
import { detectForm, detectTool } from "@/lib/tools/detect";
import type { TopicLogic } from "./types";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, d = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, d); } };
const topics: readonly TopicLogic[] = TOPICS;
const ids = topics.map((t) => t.id);
const files = (d: string): string[] => readdirSync(d).flatMap((n) => (statSync(`${d}/${n}`).isDirectory() ? files(`${d}/${n}`) : [`${d}/${n}`]));
const strip = (f: string) => readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

// the live-data topics keep their data engines and cards in src/lib/live and src/components/tools/live, and are tested there (live.selftest.tsx)
const LIVE = ["gold", "markets", "fuel", "news", "sports"];
// the folder of a topic is not always its id
const FOLDER: Record<string, string> = { calc: "calculator" };
const folder = (id: string) => `src/tools/${FOLDER[id] ?? id}`;

ok("the two registries list the same topics in the same order", ids.join() === TOPIC_UIS.map((u) => u.id).join(), `${ids.join()} / ${TOPIC_UIS.map((u) => u.id).join()}`);
ok("topic names are unique", new Set(ids).size === ids.length);
ok("every topic has a folder with its two descriptors, topic.ts (what the search line needs) and ui.tsx (how it looks)", ids.every((id) => existsSync(`${folder(id)}/topic.ts`) && existsSync(`${folder(id)}/ui.tsx`)), ids.filter((id) => !existsSync(`${folder(id)}/ui.tsx`)).join());
ok("every folder of src/tools is a listed topic (no folder is left out of the registry)", readdirSync("src/tools").filter((n) => statSync(`src/tools/${n}`).isDirectory()).every((n) => ids.some((id) => (FOLDER[id] ?? id) === n)));
ok("every topic with logic of its own has its own selftest in its folder (a new topic cannot be added untested)", ids.filter((id) => !LIVE.includes(id)).every((id) => files(folder(id)).some((f) => /\.selftest\.tsx?$/.test(f))), ids.filter((id) => !LIVE.includes(id) && !files(folder(id)).some((f) => /\.selftest\.tsx?$/.test(f))).join());

// what a topic says it does, it must do
ok("every form is drawn: a title, a tone, an icon and a tile in the list of calculators", topics.filter((t) => t.form).every((t) => { const f = TOPIC_UIS.find((u) => u.id === t.id)?.form; return !!f && f.title.length > 5 && !!f.tone && !!f.icon && f.menu.title.length > 3 && f.menu.text.length > 10; }));
ok("a topic has a form in one registry exactly when it has one in the other", topics.every((t) => !!t.form === !!TOPIC_UIS.find((u) => u.id === t.id)?.form));
ok("every live topic has its card, every card its words", topics.filter((t) => t.live).every((t) => !!TOPIC_UIS.find((u) => u.id === t.id)?.live && t.live!.keys.length > 0) && TOPIC_UIS.filter((u) => u.live).every((u) => !!topics.find((t) => t.id === u.id)?.live));
ok("form ranks are unique (the order in which plain-word requests are tried is never a tie)", new Set(topics.filter((t) => t.form).map((t) => t.form!.rank)).size === topics.filter((t) => t.form).length);
ok("every form has nouns, and a request that is only its nouns and fillers can be told from a sentence", topics.filter((t) => t.form).every((t) => t.form!.nouns.length > 0));

// every sample question is answered by its own topic, the way it says
const hitKindsOf = (id: string) => (TOPIC_UIS.find((u) => u.id === id)?.hits ?? []).map((h) => h.kind as string);
const bad: string[] = [];
for (const t of topics) {
  for (const s of t.samples ?? []) {
    if (s.instant) {
      const h = detectTool(s.q);
      const mine = !!h && (h.kind === "live" ? h.topic === t.id : hitKindsOf(t.id).includes(h.kind));
      if (!mine) bad.push(`${t.id}: "${s.q}" is not answered as you type by ${t.id} (${h?.kind ?? "nothing"})`);
    } else if (detectForm(s.q) !== t.id) bad.push(`${t.id}: "${s.q}" does not open the form of ${t.id} (${detectForm(s.q)})`);
  }
}
ok("every sample question is answered by the topic that lists it: instant ones as you type, the others by opening its form", bad.length === 0, bad.join("\n"));
ok("the list of calculators answers its own sample", MENU_SAMPLES.every((s) => detectForm(s.q) === "menu"));
ok("every kind of answer a topic gives has a card (every sample that is answered as you type can be drawn)", topics.flatMap((t) => (t.samples ?? []).filter((s) => s.instant)).every((s) => { const h = detectTool(s.q); return !!h && (h.kind === "live" ? !!TOPIC_UIS.find((u) => u.id === h.topic)?.live : TOPIC_UIS.some((u) => u.hits?.some((x) => x.kind === h.kind))); }));

// the shared files name no topic
const SHARED = ["src/lib/tools/detect.ts", "src/components/tools/ToolPanel.tsx", "src/lib/help/sampleQuestions.ts"];
const SHARED_OK = /^@\/tools\/(registry|registry\.ui|menu|types|uiTypes|converter\/useRates)$/;
const importsOf = (src: string) => [...src.matchAll(/from\s+["'](@\/tools\/[^"']+)["']/g)].map((m) => m[1]);
ok("detect.ts, ToolPanel.tsx and sampleQuestions.ts import only the registries and the contract (plus the one rate-table hook): they name no topic", SHARED.every((f) => importsOf(strip(f)).every((i) => SHARED_OK.test(i))), SHARED.flatMap((f) => importsOf(strip(f)).filter((i) => !SHARED_OK.test(i)).map((i) => `${f}: ${i}`)).join("\n"));
ok("the shared files do not mention a topic by its words either (no 'tyre', 'vin', 'gratuity'... in detect.ts or ToolPanel.tsx outside comments)", ["src/lib/tools/detect.ts", "src/components/tools/ToolPanel.tsx"].every((f) => !/\b(tyre|vin|gratuity|encashment|bharat|emi|pf)\b/i.test(strip(f).replace(/"[^"]*"/g, '""'))), "");

// topics do not reach into each other (tyre and rim are one reader in two parts: a declared dependency)
const DEPENDS: Record<string, string[]> = { tyre: ["rim"], rim: ["tyre"] };
const reach: string[] = [];
for (const id of ids) {
  const dir = FOLDER[id] ?? id;
  for (const f of files(folder(id)).filter((x) => /\.tsx?$/.test(x))) {
    for (const i of importsOf(strip(f))) {
      const other = /^@\/tools\/([A-Za-z]+)\//.exec(i)?.[1];
      if (other && other !== dir && !(DEPENDS[dir] ?? []).includes(other) && !["types", "uiTypes"].includes(other)) reach.push(`${f}: ${i}`);
    }
  }
}
ok("a topic imports only its own folder, the shared libraries and the contract, apart from the declared tyre/rim dependency", reach.length === 0, reach.join("\n"));

// the stylesheet is built only from the folders that tailwind.config.js lists: a topic folder outside them would be drawn unstyled (this once happened when the topics were moved into src/tools)
const tw = readFileSync("tailwind.config.js", "utf8");
const globs = [...tw.matchAll(/"\.\/(src\/[^*"]+)\/\*\*/g)].map((m) => m[1]);
const withClasses = files("src").filter((f) => /\.tsx$/.test(f) && !/selftest/.test(f) && /className=/.test(readFileSync(f, "utf8")));
const uncovered = withClasses.filter((f) => !globs.some((g) => f.startsWith(g + "/")));
ok("every file that draws markup with Tailwind classes is inside a folder that tailwind.config.js scans", uncovered.length === 0 && globs.includes("src/tools"), uncovered.join("\n"));

console.log(`registry selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
