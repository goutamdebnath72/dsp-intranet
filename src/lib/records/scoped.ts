// src/lib/records/scoped.ts
//
// A QUESTION UNDER A CHOSEN SELECTION (src/records): answered by that selection's own engines only, never trafficked to the others, and when it finds nothing it SAYS so (it does not fall through to the
// circulars). Under "Everything" none of this runs and the route behaves exactly as before. The management pages stay reachable under every selection (answered earlier by the route).
//
// Hospital is the one selection that may ask the language model, and only AFTER the no-AI hospital engine did not understand the line: the model is asked for clean parameters of the doctor and the day
// (the same call the "Everything" path makes), never for the answer.

import type { OmnibarPayload, RetryInfo } from "@/lib/nl2sql/omnibar";
import { answerOmnibar, runRosterFinder } from "@/lib/nl2sql/omnibar";
import { withDefaultClient } from "@/lib/nl2sql/db";
import { nothingInScope } from "@/records/scope";
import { domainById } from "@/records/domains";
import type { PeopleFacet, ScopeId } from "@/records/types";

export interface ScopedRequest {
  scope: Exclude<ScopeId, "auto" | "documents">;
  facet: PeopleFacet;
  q: string;
  userKey: string | null;
  retry: RetryInfo | null;
  departmentId: string | null;
  gradeId: string | null;
  name: string | null;
}

const none = (scope: ScopeId, q: string): OmnibarPayload => ({ kind: "clarify", answer: nothingInScope(scope, q), source: "none", attempt: 1 });

export async function answerScoped(r: ScopedRequest): Promise<OmnibarPayload> {
  // Admin: the management pages are answered by the route BEFORE this runs (and only for the words that ask for them); any other line has nothing under Admin
  if (r.scope === "admin") return none(r.scope, r.q);
  // People, picked from the two lists: a fixed template, no model
  if (r.scope === "people" && r.facet === "roster") {
    return runRosterFinder({ departmentId: r.departmentId as unknown as number, gradeId: r.gradeId as unknown as number, name: r.name }, r.userKey, { withClient: withDefaultClient });
  }

  const payload = await answerOmnibar(r.q, r.userKey, r.retry, { scope: r.scope });

  // Hospital: the engine that needs no model did not understand the line (nothing, or its own "I could not find a doctor named ..."): the model is asked only for clean parameters
  if (r.scope === "hospital" && (!payload || payload.hospital?.status?.tone === "unknown")) {
    try {
      const { parseQueryWithLlm } = await import("@/lib/search/pureAiEngine");
      const { answerHospitalQuestion } = await import("@/lib/search/hospitalDispatch");
      const call = await parseQueryWithLlm(r.q).catch(() => null);
      if (call?.tool === "hospital") {
        const h = await answerHospitalQuestion(domainById("hospital")!.scopeLines(r.q)[0], call.params);
        if (h) return { ...h, source: "holiday", attempt: 1 } as OmnibarPayload;
      }
    } catch {
      /* the first answer stands */
    }
  }
  return payload ?? none(r.scope, r.q);
}
