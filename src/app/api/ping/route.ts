// src/app/api/ping/route.ts
//
// THE CONNECTION CHECK. The search window asks this tiny question now and then ("can this computer reach the intranet?") so that it can say so, in red, when the answer is no.
// It reads nothing from the caller, touches no database and keeps nothing: it answers 204 with no body, never cached.
export const dynamic = "force-dynamic";

export function GET(): Response {
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store, max-age=0" } });
}

export function HEAD(): Response {
  return GET();
}
