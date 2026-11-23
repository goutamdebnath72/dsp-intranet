// src/lib/ai/noPro.ts
//
// No Pro models. My decision (23 Nov 2026): "we will no way use Pro any more" (an Executive Deep Search answer on gemini-3.1-pro-preview cost about Rs 35, on Flash about Rs 7). A model whose name says it is a Pro model
// (gemini-3.1-pro-preview, gemini-pro-latest, gemini-2.5-pro ...) is refused at the three places that can send a request to one, whatever asks for it (a code default, an environment variable on this machine or on Vercel,
// a script): geminiGenerate (src/lib/ai/geminiChat.ts: every text and JSON call), the page readers (src/lib/ingestion/pageReader.ts, geminiOcr.ts) and the model-name helpers that feed them.
// I made the refusal a switch: PERF.allowProModels in src/lib/perf/switches.js (false = refused; true = the previous behaviour). Pure: no network, no database.
import { PERF } from "@/lib/perf/switches";

/** Matches a name that says "Pro": gemini-3.1-pro-preview, gemini-pro-latest, models/gemini-2.5-pro, and the same for any other maker's "-pro" tier. */
export const isProModel = (name: string): boolean => /(^|[-_./\s])pro([-_./\s]|$)/i.test(String(name ?? ""));

/** True when this model may be asked: it is not a Pro model, or the switch allows Pro models. */
export const modelAllowed = (name: string): boolean => PERF.allowProModels || !isProModel(name);

const told = new Set<string>();
/** I say once, in the server log, that a Pro model was asked for and refused. */
function tell(name: string, where: string): void {
  const key = `${where}|${name}`;
  if (told.has(key)) return;
  told.add(key);
  console.warn(`[no-pro] ${where}: the Pro model "${name}" was asked for and is REFUSED (PERF.allowProModels is false in src/lib/perf/switches.js); a Flash model is used instead`);
}

/** Returns the models of a chain without the Pro ones; the order of the rest is kept. */
export function withoutPro(models: string[], where = "model chain"): string[] {
  return models.filter((m) => {
    if (modelAllowed(m)) return true;
    tell(m, where);
    return false;
  });
}

/** Returns one model name: itself when allowed, otherwise the replacement. */
export function orReplacement(name: string, replacement: string, where = "model"): string {
  if (modelAllowed(name)) return name;
  tell(name, where);
  return replacement;
}
