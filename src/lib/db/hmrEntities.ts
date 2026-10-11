// src/lib/db/hmrEntities.ts
//
// DEV-ONLY protection against "EntityMetadataNotFoundError: No metadata for "Circular" was found".
//
// What happens: in `next dev` a route file is compiled the FIRST time it is used, and it then gets its OWN fresh copy of the
// entity classes (Circular, User, ...). TypeORM finds an entity's metadata by the class OBJECT (a Map keyed by the class), not
// by its name, so the new copy is a stranger to the connection that was created with the old copy -- even though they are
// identical -- and the first request fails. The next request works, because the connection has been rebuilt by then.
// That is the "error on the first open of a new circular, clean the second time" you saw.
//
// The fix: in development only, when TypeORM does not know a class OBJECT, accept the registered entity with the SAME NAME.
// Production has no hot reload and one copy of each class, so nothing changes there.

import type { DataSource } from "typeorm";

/** True only if the connection was built with this very class object (NOT merely one with the same name). */
export function hasExactMetadata(ds: DataSource, entity: unknown): boolean {
  return ds.entityMetadatas.some((m) => m.target === entity);
}

/** The name of a class (a function with a name), else undefined. */
const classNameOf = (x: unknown): string | undefined => (typeof x === "function" ? (x as { name: string }).name : undefined);

export function installDevEntityNameFallback(ds: DataSource): void {
  const anyDs = ds as any;
  if (anyDs.__devEntityNameFallback) return; // already installed on this connection
  const original = anyDs.findMetadata.bind(ds) as (target: unknown) => any;
  anyDs.findMetadata = (target: unknown) => {
    const exact = original(target);
    if (exact || typeof target !== "function") return exact;
    const name = classNameOf(target);
    // a re-evaluated copy of a registered class: same name, different object
    return ds.entityMetadatas.find((m) => classNameOf(m.target) === name);
  };
  anyDs.__devEntityNameFallback = true;
}
