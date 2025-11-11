// src/lib/db/index.ts
import { Sequelize } from "sequelize";
import { getPostgresConfig } from "./config/postgres.config";
import { getOracleConfig } from "./config/oracle.config";
import { initModels } from "./models";

/**
 * Defensive DB entrypoint that:
 * - Exports getDb() for other modules that need the DB object on-demand
 * - Exports a default db object that contains either real Sequelize models
 *   or build-time dummy models (with safe stubbed methods) so server-side
 *   rendering / build doesn't crash.
 */

// Detect build-phase when connection env-vars are missing
const isBuilding =
  !process.env.POSTGRES_HOST && !process.env.ORACLE_CONNECT_STRING;

type ModelStub = {
  findAll: (...args: any[]) => Promise<any[]>;
  findOne?: (...args: any[]) => Promise<any | null>;
  findByPk?: (...args: any[]) => Promise<any | null>;
  create?: (...args: any[]) => Promise<any>;
  update?: (...args: any[]) => Promise<any>;
  destroy?: (...args: any[]) => Promise<number>;
  [k: string]: any;
};

function makeDummyModel(): ModelStub {
  return {
    findAll: async () => [],
    findOne: async () => null,
    findByPk: async () => null,
    create: async () => ({}),
    update: async () => ({}),
    destroy: async () => 0,
  };
}

const EMPTY_DUMMY_DB = {
  sequelize: null,
  Account: makeDummyModel(),
  Announcement: makeDummyModel(),
  AnnouncementReadStatus: makeDummyModel(),
  Circular: makeDummyModel(),
  Department: makeDummyModel(),
  HolidayMaster: makeDummyModel(),
  HolidayYear: makeDummyModel(),
  Link: makeDummyModel(),
  Session: makeDummyModel(),
  User: makeDummyModel(),
  VerificationToken: makeDummyModel(),
};

let _db: any = null;

/**
 * Returns the application DB object:
 * - In build phase: a dummy object (safe to import)
 * - At runtime: a real object with `sequelize` and model instances
 */
export function getDb() {
  if (_db) return _db;

  if (isBuilding) {
    // Build-time: return safe dummy object (so importers like page.tsx won't crash while Next builds)
    console.log("🔌 DETECTED BUILD PHASE. Returning dummy DB object.");
    _db = EMPTY_DUMMY_DB;
    return _db;
  }

  // Runtime: set up Sequelize and models
  const dbType = process.env.DB_TYPE || "postgres";
  let sequelize: Sequelize;

  if (dbType === "oracle") {
    console.log("🔌 Connecting to Oracle...");
    sequelize = new Sequelize(getOracleConfig());
  } else {
    console.log("🔌 Connecting to PostgreSQL...");
    sequelize = new Sequelize(getPostgresConfig());
  }

  const models = initModels(sequelize);

  _db = {
    sequelize,
    ...models,
  };

  return _db;
}

// default export: the current DB object (may be dummy during build-time)
const defaultDb = getDb();
export default defaultDb;
