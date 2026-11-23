// src/lib/live/savedAnswers.ts
//
// The saved last good answer, for the routes that opt in (liveRoute's `persist`): it lives in the database's snapshot table, or there is none when the database cannot be had. I never let a card fail because of its saved copy.
import { getDb } from "@/lib/db";
import { NO_SNAPSHOT_STORE, snapshotStoreFor, type SnapshotStore } from "./snapshotStore";

export async function savedAnswers(): Promise<SnapshotStore> {
  try { return snapshotStoreFor(await getDb()); } catch { return NO_SNAPSHOT_STORE; }
}
