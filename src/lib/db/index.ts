// src/lib/db/index.ts
import "reflect-metadata"; // Required core decorator metadata initialization step for TypeORM
import { DataSource, DataSourceOptions } from "typeorm";
import { getOracleConfig } from "./config/oracle.config";

// --- IMPORT TYPEORM ENTITIES ---
import { Account } from "./models/account.model";
import { AnnouncementReadStatus } from "./models/announcement-read-status.model";
import { Announcement } from "./models/announcement.model";
import { Circular } from "./models/circular.model";
import { Department } from "./models/department.model";
import { HolidayMaster } from "./models/holiday-master.model";
import { HolidayYear } from "./models/holiday-year.model";
import { Link } from "./models/link.model";
import { Session } from "./models/session.model";
import { User } from "./models/user.model";
import { VerificationToken } from "./models/verification-token.model";

// Consolidation array of all active structural database entities (All 11 Preserved!)
const entities = [
  Account,
  AnnouncementReadStatus,
  Announcement,
  Circular,
  Department,
  HolidayMaster,
  HolidayYear,
  Link,
  Session,
  User,
  VerificationToken,
];

// Explicit type definition hook for global node execution caching context
declare global {
  // eslint-disable-next-line no-var
  var cachedTypeORMDataSource: DataSource | null;
}

// Global caching container lifecycle validation to handle Next.js hot module replacements safely
if (!global.cachedTypeORMDataSource) {
  global.cachedTypeORMDataSource = null;
}

// Detects if the operational state is running under a production deployment compression phase
const isBuildPhase =
  typeof process.env.NEXT_PHASE === "string" &&
  process.env.NEXT_PHASE.includes("build");

// --- DUMMY DB PATTERN ENGINE FOR EMULATING TYPEORM AT BUILD LIFECYCLES ---
const makeDummyRepository = () => ({
  find: async () => [],
  findOne: async () => null,
  findAndCount: async () => [[], 0],
  create: () => ({}),
  save: async (entity: any) => entity,
  update: async () => ({ affected: 0 }),
  delete: async () => ({ affected: 0 }),
  remove: async () => ({}),
});

const DUMMY_DATA_SOURCE = {
  isInitialized: false,
  initialize: async () => DUMMY_DATA_SOURCE as any,
  destroy: async () => {},
  getRepository: () => makeDummyRepository(),
  manager: {
    find: async () => [],
    findOne: async () => null,
    save: async (entity: any) => entity,
  },
} as unknown as DataSource;

/**
 * Centralized High-Performance Database Connection Manager Factory.
 * Manages pool recycling, handles Next.js dev HMR reloads safely, and dynamically switches drivers.
 */
export async function getDb(): Promise<DataSource> {
  // 1. Manage globally cached DataSource instance if already connected and initialized
  if (
    global.cachedTypeORMDataSource &&
    global.cachedTypeORMDataSource.isInitialized
  ) {
    // 💡 HMR Safety: In local development, check if modules/classes have reloaded in memory.
    // If a class reference has changed, we must safely close the old pool and instantiate a fresh one.
    if (process.env.NODE_ENV === "development") {
      const isHmrReloaded = entities.some((entity) => {
        try {
          return !global.cachedTypeORMDataSource!.hasMetadata(entity);
        } catch {
          return true;
        }
      });

      if (isHmrReloaded) {
        console.log(
          "🔄 Next.js HMR reload detected. Re-initializing TypeORM DataSource pool...",
        );
        await global.cachedTypeORMDataSource.destroy();
        global.cachedTypeORMDataSource = null;
      } else {
        return global.cachedTypeORMDataSource;
      }
    } else {
      return global.cachedTypeORMDataSource;
    }
  }

  // 2. Safely step around live connection routines during a production compilation lifecycle
  if (isBuildPhase) {
    console.log(
      "🔌 BUILD PHASE detected — returning dummy TypeORM target engine.",
    );
    return DUMMY_DATA_SOURCE;
  }

  const dbType = process.env.DB_TYPE || "postgres";
  let dataSourceOptions: DataSourceOptions;

  // 3. Construct exact, optimized structural configurations mapped by enterprise driver targets
  if (dbType === "oracle") {
    console.log(
      "🔌 Configuring TypeORM client ecosystem connection for Oracle Database Enterprise Matrix...",
    );
    const oracleConfig = getOracleConfig();
    dataSourceOptions = {
      type: "oracle",
      host: oracleConfig.host,
      port: oracleConfig.port || 1521,
      username: oracleConfig.username,
      password: oracleConfig.password,
      sid: oracleConfig.sid,
      database: oracleConfig.database,
      serviceName: oracleConfig.serviceName,
      logging: false,
      synchronize: false, // Schema mutations are isolated safely away from active runtime execution paths
      entities: entities,
      extra: {
        poolMax: 10,
        poolMin: 2,
        poolIncrement: 1,
      },
    };
  } else {
    console.log(
      "🔌 Configuring TypeORM client connectivity options for Supabase Postgres Cluster...",
    );
    dataSourceOptions = {
      type: "postgres",
      url: process.env.DATABASE_URL, // Directly utilizes Supabase optimized pool connection strings
      logging: false,
      synchronize: false, // Multi-tenant environment schema safety protection switch locked on
      entities: entities,
      extra: {
        max: 5, // Safety connection ceiling limits to protect Supabase transaction slots
        idleTimeoutMillis: 10000, // Instantly evict inactive connections
        connectionTimeoutMillis: 5000, // Ensure slow Handshakes have room to stabilize
      },
    };
  }

  try {
    if (!global.cachedTypeORMDataSource) {
      console.log(
        "🔌 Active structural connection instance unavailable. Instantiating fresh runtime client connection pool...",
      );
      global.cachedTypeORMDataSource = new DataSource(dataSourceOptions);
    }

    if (!global.cachedTypeORMDataSource.isInitialized) {
      await global.cachedTypeORMDataSource.initialize();
      console.log(
        `✅ TypeORM DataSource context authenticated and synchronized successfully using [${dbType}] driver.`,
      );
    }

    return global.cachedTypeORMDataSource;
  } catch (err) {
    console.error(
      "❌ Fatal validation crash processing current TypeORM runtime DataSource matrix configuration initialization:",
      err,
    );
    global.cachedTypeORMDataSource = null; // Purge pool allocations to guarantee zero dead states on subsequent request loops
    throw err;
  }
}
