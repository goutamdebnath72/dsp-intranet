// src/lib/live/savedAnswers.ts
//
// THE SAVED LAST GOOD ANSWER, for the routes that opt in (liveRoute's `persist`): the database's snapshot table, or none when the database cannot be had (a card must never fail because of its saved copy).
import { getDb } from "@/lib/db";
import { NO_SNAPSHOT_STORE, snapshotStoreFor, type SnapshotStore } from "./snapshotStore";

export async function savedAnswers(): Promise<SnapshotStore> {
  try { return snapshotStoreFor(await getDb()); } catch { return NO_SNAPSHOT_STORE; }
}
