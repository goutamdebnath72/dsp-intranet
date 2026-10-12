// src/lib/circulars/newStatus.ts
//
// The ONE definition of which circulars count as NEW: those uploaded within the last CIRCULAR_NEW_THRESHOLD_HOURS hours (24). It does not depend on who is
// asking, so the server can work it out without knowing anything about the visitor. Used by the /api/circulars/seen route (which then subtracts, for a
// logged-in person, the ones they have read) and by the home page (which hands this list to a logged-out visitor so the red badge shows at once).

import type { DataSource } from "typeorm";
import { DateTime } from "luxon";
import { Circular } from "@/lib/db/models/circular.model";
import { CIRCULAR_NEW_THRESHOLD_HOURS } from "@/lib/constants";

export async function getRecentCircularIds(dataSource: DataSource): Promise<number[]> {
  const threshold = DateTime.now().minus({ hours: CIRCULAR_NEW_THRESHOLD_HOURS });
  const rows = await dataSource
    .getRepository(Circular)
    .createQueryBuilder("c")
    .select(["c.id"])
    .where("c.uploadedAt > :threshold", { threshold: threshold.toJSDate() })
    .getMany();
  return rows.map((c) => c.id);
}
