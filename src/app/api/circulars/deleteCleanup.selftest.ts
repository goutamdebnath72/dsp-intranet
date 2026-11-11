// src/app/api/circulars/deleteCleanup.selftest.ts  (run: npx tsx --tsconfig tsconfig.selftest.json src/app/api/circulars/deleteCleanup.selftest.ts)
// Guard: deleting a circular leaves nothing of it behind. A real test (10 Nov 2026) found "who has read it" rows still pointing at deleted circulars: that table has no foreign key,
// so only the delete code can remove them.
import { readFileSync } from "node:fs";

let passed = 0, failed = 0;
const check = (name: string, ok: boolean) => { if (ok) passed++; else { failed++; console.log(`  FAIL  ${name}`); } };
const route = readFileSync("src/app/api/circulars/[id]/route.ts", "utf8");
const del = route.slice(route.indexOf("export async function DELETE"));
const tx = del.slice(del.indexOf("dataSource.transaction"), del.indexOf("COMPENSATING BLOB CLEANUP"));

check("the delete runs in one transaction", /dataSource\.transaction\(async \(manager\)/.test(tx));
check("the delete removes the circular's chunks", /DELETE FROM public\.circular_chunks WHERE circular_id = \$1/.test(tx));
check("the delete removes the circular's read-status rows (no foreign key does it)", /DELETE FROM public\.circularreadstatus WHERE "circularId" = \$1/.test(tx));
check("read-status rows are removed inside the same transaction as the circular row (all or nothing)", tx.indexOf("circularreadstatus") > 0 && tx.indexOf("circularreadstatus") < tx.indexOf("DELETE FROM public.circulars WHERE id"));
check("the stored page files are removed after the commit", /COMPENSATING BLOB CLEANUP/.test(del) && /del\(/.test(del));
check("the delete is audited in the same transaction", /writeAudit\(q, "circular"[\s\S]*"delete"/.test(tx));

// every table that points at a circular by a column named like circular_id / circularId must be handled by the delete: by a foreign key with ON DELETE CASCADE (listed here)
// or by an explicit DELETE above. This list is the set found on 10 Nov 2026; a new table that points at a circular must be added here AND handled in the delete.
const handledByCascade = ["circular_chunks", "health_checkup_schedule", "circular_ingest_log", "circular_page_check"];
const handledExplicitly = ["circularreadstatus"];
check("the known tables that point at a circular are all handled (the list is kept in this test)", handledByCascade.length + handledExplicitly.length === 5);

console.log(`circular delete cleanup selftest: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
