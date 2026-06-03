// src/lib/db/postgres.runtime.ts

import { getDb } from "./index";

/**
 * @deprecated
 * Legacy Sequelize connection entry point.
 * This helper has been decommissioned in favor of the unified TypeORM engine.
 * * Redirects directly to getDb() to prevent runtime crashes, but returns
 * the TypeORM DataSource instance instead of Sequelize. Any files calling this
 * should be updated to use import { getDb } from "@/lib/db" directly.
 */
export async function getSequelize(): Promise<any> {
  console.warn(
    "⚠️ Warning: A legacy file invoked getSequelize(). Redirecting call directly to the TypeORM engine.",
  );
  return await getDb();
}
