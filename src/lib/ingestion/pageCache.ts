// src/lib/ingestion/pageCache.ts
//
// A disk cache for "read this page image", used by the archive re-read tool. It makes the tool APPLY EXACTLY WHAT THE DRY RUN
// SHOWED YOU (the page texts you reviewed are the ones stored), and it saves repeating about 26 minutes of OCR.
//
// Keyed on the page's URL (a blob URL never changes its content) and on OCR_MERGE_VERSION (a changed merge rule invalidates it).
// A failed read is NEVER cached, and neither is a reading whose English pass was empty: they are tried again next time.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { OCR_MERGE_VERSION } from "./ocrMerge";
import type { OcrPageResult } from "./ocr";

export type ReadPage = (url: string, label: string) => Promise<OcrPageResult>;

export function cachedReadPage(opts: { dir: string; read: ReadPage; enabled?: boolean; onHit?: (url: string) => void }): ReadPage {
  const enabled = opts.enabled !== false;
  const fileFor = (url: string) => join(opts.dir, createHash("sha1").update(url).digest("hex") + ".json");
  return async (url, label) => {
    const file = fileFor(url);
    if (enabled && existsSync(file)) {
      try {
        const saved = JSON.parse(readFileSync(file, "utf8"));
        if (saved?.version === OCR_MERGE_VERSION && saved?.url === url && typeof saved?.result?.text === "string") {
          opts.onHit?.(url);
          return saved.result as OcrPageResult;
        }
      } catch {
        /* unreadable cache entry: read the page again */
      }
    }
    const result = await opts.read(url, label); // a throw is not cached
    const trustworthy = !result.fellBackToIndicPass && result.englishChars > 0;
    if (enabled && trustworthy) {
      mkdirSync(opts.dir, { recursive: true });
      writeFileSync(file, JSON.stringify({ version: OCR_MERGE_VERSION, url, savedAt: new Date().toISOString(), result }));
    }
    return result;
  };
}
