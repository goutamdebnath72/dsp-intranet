// src/lib/db/force-pg.ts
// ✅ Force the pg driver to load before Sequelize initializes
import pg from "pg";
import { Sequelize } from "sequelize";

// Attach pg explicitly so Sequelize doesn't fail dynamic import
(Sequelize as any).postgres = pg;

export { pg };
