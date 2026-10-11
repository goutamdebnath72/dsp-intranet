// src/lib/db/hmrEntities.selftest.ts
// Run:  TEST_DATABASE_URL=postgres://user:pass@host:5432/dbname npx tsx src/lib/db/hmrEntities.selftest.ts
// Needs any scratch/dev Postgres it may CREATE and DROP a table named zz_hmr_probe in. Skips itself if TEST_DATABASE_URL is unset.
import "reflect-metadata";
import { Column, DataSource, Entity, PrimaryGeneratedColumn } from "typeorm";
import { hasExactMetadata, installDevEntityNameFallback } from "./hmrEntities";

const url = process.env.TEST_DATABASE_URL;
if (!url) {
  console.log("hmrEntities selftest SKIPPED: set TEST_DATABASE_URL to a scratch Postgres.");
  process.exit(0);
}
let pass = 0;
let fail = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (ok) pass++;
  else {
    fail++;
    console.log(`  FAIL  ${label}${detail ? " -- " + detail : ""}`);
  }
};

// Each call = a NEW class object with the same name and mapping: what a re-evaluated module produces in `next dev`.
function defineCircular() {
  @Entity({ name: "zz_hmr_probe" })
  class Circular {
    @PrimaryGeneratedColumn({ type: "integer" }) id!: number;
    @Column({ type: "text" }) headline!: string;
  }
  return Circular;
}
function defineOther() {
  @Entity({ name: "zz_hmr_other" })
  class Stranger {
    @PrimaryGeneratedColumn({ type: "integer" }) id!: number;
  }
  return Stranger;
}

(async () => {
  const C1 = defineCircular(); // the copy the connection was built with
  const C2 = defineCircular(); // the copy a freshly compiled route imports
  const S = defineOther();
  const ds = new DataSource({ type: "postgres", url, entities: [C1], synchronize: false });
  await ds.initialize();
  await ds.query(`CREATE TABLE IF NOT EXISTS zz_hmr_probe (id serial PRIMARY KEY, headline text)`);
  await ds.query(`DELETE FROM zz_hmr_probe`);
  await ds.query(`INSERT INTO zz_hmr_probe (headline) VALUES ('first'), ('second')`);
  try {
    check("the two copies really are different objects with the same name", C1 !== C2 && C1.name === C2.name);

    // 1. the bug, before the fix
    let err = "";
    try {
      await ds.getRepository(C2).find();
    } catch (e: any) {
      err = `${e.constructor.name}: ${e.message}`;
    }
    check("BEFORE the fix: a reloaded copy of the class fails exactly like the log (EntityMetadataNotFoundError, No metadata for \"Circular\")", /EntityMetadataNotFoundError/.test(err) && /No metadata for "Circular" was found/.test(err), err);
    check("BEFORE the fix: the strict check and TypeORM's own hasMetadata agree the copy is unknown", !hasExactMetadata(ds, C2) && !ds.hasMetadata(C2));

    // 2. the fix
    installDevEntityNameFallback(ds);
    const rows = await ds.getRepository(C2).find({ order: { id: "ASC" } });
    check("AFTER the fix: find() through the reloaded copy returns the rows", rows.length === 2 && rows[0].headline === "first", JSON.stringify(rows));
    const one = await ds.getRepository(C2).findOne({ where: { id: rows[1].id } });
    check("AFTER the fix: findOne() works", one?.headline === "second");
    const saved = await ds.getRepository(C2).save(ds.getRepository(C2).create({ headline: "third" }));
    check("AFTER the fix: create() + save() work and write to the real table", !!saved.id && (await ds.query(`SELECT count(*)::int n FROM zz_hmr_probe`))[0].n === 3);
    check("AFTER the fix: manager.find() works", (await ds.manager.find(C2)).length === 3);
    check("AFTER the fix: the metadata found is the registered Circular", ds.getMetadata(C2).name === "Circular" && ds.getMetadata(C2).tableName === "zz_hmr_probe");
    await ds.getRepository(C2).delete({ id: saved.id });
    check("AFTER the fix: delete() works", (await ds.query(`SELECT count(*)::int n FROM zz_hmr_probe`))[0].n === 2);

    // 3. reload detection must still work: the strict check must NOT be fooled by the fallback
    check("the strict check still says the copy is NOT the registered class (a real reload stays detectable)", hasExactMetadata(ds, C1) && !hasExactMetadata(ds, C2));
    check("...while hasMetadata() now says yes for the copy (which is why the strict check exists)", ds.hasMetadata(C2));

    // 4. only the SAME NAME is accepted
    let err2 = "";
    try {
      ds.getMetadata(S);
    } catch (e: any) {
      err2 = e.constructor.name;
    }
    check("a class with a different name is still rejected", err2 === "EntityMetadataNotFoundError");
    check("a string target and the registered class itself behave as before", ds.getMetadata("Circular").name === "Circular" && ds.getMetadata(C1).target === C1);

    // 5. installing twice must not stack wrappers
    installDevEntityNameFallback(ds);
    installDevEntityNameFallback(ds);
    check("installing it again is harmless", (await ds.getRepository(C2).find()).length === 2 && (ds as any).__devEntityNameFallback === true);
  } finally {
    await ds.query(`DROP TABLE IF EXISTS zz_hmr_probe`);
    await ds.destroy();
  }
  console.log(`\nhmrEntities selftest: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
