// src/lib/peopleEvents/api.ts
//
// THE REPLY OF /api/people-events (step 65a). Kept apart from the route so it can be tested. The lists are public like the rest of the home page (a name, a post, a department, a photo); no date of birth and no
// date of joining ever leaves the server. A missing column (sql/14 not yet run) gets a reply that NAMES the fix; any other failure stays generic (no detail leaked).

import { DateTime } from "luxon";
import type { QueryFn } from "@/lib/pax/store";
import { fetchPeopleEvents, type PeopleEvents } from "./query";

export interface ApiReply { status: number; body: PeopleEvents | { error: string; setupNeeded?: boolean } }

export function errorReply(e: unknown): ApiReply {
  const err = e as { code?: string; message?: string; driverError?: { code?: string } };
  const code = err?.code ?? err?.driverError?.code;
  if (code === "42703" && /date_of_birth|date_of_joining|dates_source/.test(String(err?.message ?? ""))) {
    return { status: 503, body: { error: "The birthday and service dates have not been added to the database yet. Run src/lib/nl2sql/sql/14_people_events.sql once in the Supabase SQL editor.", setupNeeded: true } };
  }
  return { status: 500, body: { error: "The list could not be loaded just now." } };
}

export async function handlePeopleEvents(query: QueryFn, now: DateTime = DateTime.now()): Promise<ApiReply> {
  try {
    return { status: 200, body: await fetchPeopleEvents(query, now) };
  } catch (e) {
    return errorReply(e);
  }
}
