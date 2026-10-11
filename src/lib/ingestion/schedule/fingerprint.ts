// src/lib/ingestion/schedule/fingerprint.ts
//
// The import tool saves what it read from the pages (health-cache/) so that --apply does not read them again. A saved reading is only good if
// the reader that made it is the reader that is running now. A version number someone must remember to bump is not good enough (a changed
// row filter was once NOT picked up and the old reading, with its wrong row, was reused). So the saved reading is tied to a fingerprint of the
// reader's own source files: change any of them and every saved reading is read again.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** SHA-1 of the reader's source files in `dir` (the self-tests are not part of the reader). Stable for the same code, different for any change. */
export function extractorFingerprint(dir: string): string {
  const h = createHash("sha1");
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".ts") && !/\.selftest\.ts$/.test(n)).sort()) {
    h.update(f);
    h.update("\0");
    h.update(readFileSync(join(dir, f)));
    h.update("\0");
  }
  return h.digest("hex").slice(0, 16);
}
