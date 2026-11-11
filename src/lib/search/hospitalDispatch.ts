// src/lib/search/hospitalDispatch.ts
//
// A question the router sent to the hospital. Order matters: the original hospital engine (answerHospital:
// its own understanding of doctors, units, dates and closures, ambiguity questions, retired-doctor notes; 530
// tests) answers first. Only when it does not recognise the phrasing does the pure executor answer from the
// model's clean parameters. (Before this, the pure executor ran first and bypassed all of those rules.)

import { executePureHospital } from "./pureAiEngine";

export interface HospitalPayload {
  kind: "count" | "clarify";
  answer: string;
  hospital?: unknown;
  ask?: unknown;
}

export async function answerHospitalQuestion(q: string, params: Record<string, any>): Promise<HospitalPayload | null> {
  let original: HospitalPayload | null = null;
  let originalUnknown = false;
  try {
    const { answerHospital } = await import("@/lib/hospital/engine");
    const { holidaysOn } = await import("@/lib/hospital/holidaysOn");
    const { DateTime } = await import("luxon");
    const r = await answerHospital(q, { now: DateTime.now().setZone("Asia/Kolkata"), holidaysOn });
    if (r) {
      if (r.ask) return { kind: "clarify", answer: r.summary, ask: r.ask, ...(r.card.status ? { hospital: r.card } : {}) };
      original = { kind: "count", answer: r.summary, hospital: r.card };
      // tone "unknown" = the original engine ADMITS it did not understand ("I could not find a doctor named
      // 'karmakar there 5pm'": its parser kept filler words as part of the name). Then the model's clean parameters get a try.
      originalUnknown = r.card.status?.tone === "unknown";
      if (!originalUnknown) return original;
    }
  } catch (e: any) {
    console.warn(`[hospital] engine failed, using the pure executor: ${e?.message || e}`);
  }
  const pure = executePureHospital(params);
  const pureAnswer: HospitalPayload | null = pure ? { kind: "count", answer: pure.summary, hospital: pure.card } : null;
  // the pure answer wins over an "I did not understand" answer only when it really answers (it is not "unknown" itself)
  if (pureAnswer && (!original || (originalUnknown && pure!.card.status?.tone !== "unknown"))) return pureAnswer;
  return original ?? pureAnswer;
}
