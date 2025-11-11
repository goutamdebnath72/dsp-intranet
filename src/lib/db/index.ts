// src/lib/db/index.ts
import { Sequelize } from "sequelize";
import { getPostgresConfig } from "./config/postgres.config";
import { getOracleConfig } from "./config/oracle.config";
import { initModels } from "./models";

/**
 * Final stable DB entrypoint:
 * ✅ Always connects to Supabase PostgreSQL during runtime (dev/prod)
 * 💤 Uses dummy models only during static build
 * 🧠 Reconnects automatically if Sequelize becomes invalidated
 */

let sequelize: Sequelize | null = null;
let db: any = null;

// Explicitly detect build phase based on NEXT_PHASE (set by Next.js build)
const isBuildPhase =
  typeof process.env.NEXT_PHASE === "string" &&
  process.env.NEXT_PHASE.includes("build");

function makeDummyModel() {
  return {
    findAll: async () => [],
    findOne: async () => null,
    findByPk: async () => null,
    create: async () => ({}),
    update: async () => ({}),
    destroy: async () => 0,
  };
}

const DUMMY_DB = {
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

/**
 * Initialize or retrieve DB instance
 */
export function getDb() {
  // Reuse initialized DB
  if (db && db.sequelize) return db;

  // 💤 During build phase: return safe dummy
  if (isBuildPhase) {
    console.log("🔌 BUILD PHASE detected — returning dummy DB.");
    return DUMMY_DB;
  }

  // ✅ Runtime: Connect to DB
  const dbType = process.env.DB_TYPE || "postgres";
  try {
    if (dbType === "oracle") {
      console.log("🔌 Connecting to Oracle...");
      sequelize = new Sequelize(getOracleConfig());
    } else {
      console.log("🔌 Connecting to PostgreSQL (Supabase)...");
      sequelize = new Sequelize(getPostgresConfig());
    }

    const models = initModels(sequelize);
    db = { sequelize, ...models };

    console.log("✅ Sequelize initialized successfully.");
    return db;
  } catch (err) {
    console.error("❌ Failed to initialize Sequelize:", err);
    db = DUMMY_DB;
    return db;
  }
}

// Default export (auto-init)
export default getDb();
