// src/lib/announcements/searchIndex/defaults.ts
//
// The real parts of the search index (the PDF reader, the embedding, the page storage, the clock), put together for the manager's route and the catch-up script. Tests pass their own.

import { generateEmbedding, normalizeVector } from "@/lib/ai/embedding.service";
import { embedAnnouncementById } from "@/lib/announcements/embedAnnouncement";
import { blobFileStorage } from "@/lib/announcements/attachment";
import { readPdf } from "./reader";
import type { IndexDeps } from "./indexer";

export function realIndexDeps(): IndexDeps {
  return {
    read: readPdf,
    embed: async (text) => normalizeVector(await generateEmbedding(text, "search_document")),
    reEmbedRecord: (id) => embedAnnouncementById(id),
    storage: blobFileStorage(),
    now: () => Date.now(),
  };
}
