// src/lib/db/index.ts
import "pg"; // For Vercel bundler
import { Sequelize } from "sequelize";
import { getOracleConfig } from "./config/oracle.config";
// ✅ CHANGED: Import the *function* that creates the connection
import { getSequelize } from "./postgres.runtime";

// --- MODEL IMPORTS ---
// (These are correct and necessary for Vercel's bundler)
import "./models/account.model";
import "./models/announcement-read-status.model";
import "./models/announcement.model";
import "./models/circular.model";
import "./models/department.model";
import "./models/holiday-master.model";
import "./models/holiday-year.model";
import "./models/link.model";
import "./models/session.model";
import "./models/user.model";
import "./models/verification-token.model";
// --- END OF MODEL IMPORTS ---

import { initModels } from "./models";

/**
 * 💡 This is the "top-positioned file" you requested.
 * It manages a single, cached database connection.
 * All other files MUST import 'getDb' from this file.
 */

// These 'let' variables will be cached across serverless function invocations
let sequelize: Sequelize | null = null;
let db: any = null;

// Detects if we are in a Vercel build phase
const isBuildPhase =
  typeof process.env.NEXT_PHASE === "string" &&
  process.env.NEXT_PHASE.includes("build");

// --- DUMMY DB for build phase (no changes) ---
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
// --- End of DUMMY DB ---

/**
 * ✅ THE NEW CONNECTION MANAGER
 * This is now an ASYNC function that manages the single connection.
 */
export async function getDb() {
  // 1. ✅ Return the cached connection if it exists
  if (db && db.sequelize) {
    // console.log("🔌 Using cached DB connection.");
    return db;
  }

  // 2. 💤 Return dummy DB during build
  if (isBuildPhase) {
    console.log("🔌 BUILD PHASE detected — returning dummy DB.");
    return DUMMY_DB;
  }

  // 3. 🚀 Create new connection (this will only run once)
  const dbType = process.env.DB_TYPE || "postgres";

  try {
    // 'sequelize' is the global variable
    if (!sequelize) {
      console.log("🔌 No cached sequelize, creating new connection...");
      if (dbType === "oracle") {
        console.log("🔌 Connecting to Oracle...");
        sequelize = new Sequelize(getOracleConfig());
        await sequelize.authenticate();
      } else {
        console.log("🔌 Connecting to PostgreSQL (Supabase) via runtime...");
        // Call the function from postgres.runtime.ts
        sequelize = await getSequelize();
      }
      console.log("✅ Sequelize authenticated successfully.");
    }

    // 'db' is the global variable
    if (!db) {
      console.log("📚 Initializing models...");
      const models = initModels(sequelize!);
      db = { sequelize: sequelize!, ...models }; // Cache the connection and models
      console.log("✅ Sequelize models initialized successfully.");
    }

    return db; // Return the new, cached connection
  } catch (err) {
    console.error("❌ Failed to initialize Sequelize:", err);
    // Invalidate cache on error to force retry on next request
    sequelize = null;
    db = null;
    throw err;
  }
}

// ⛔️ REMOVED: export default getDb();
// This was creating a new connection on every file import.
