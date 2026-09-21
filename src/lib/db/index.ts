// src/lib/db/index.ts
import "reflect-metadata"; // Required core decorator metadata initialization step for TypeORM
import { DataSource, DataSourceOptions } from "typeorm";
import { getOracleConfig } from "./config/oracle.config";

// --- IMPORT TYPEORM ENTITIES ---
import { Account } from "./models/account.model";
import { AnnouncementReadStatus } from "./models/announcement-read-status.model";
import { Announcement } from "./models/announcement.model";
import { Circular } from "./models/circular.model";
import { CircularReadStatus } from "./models/circular-read-status.model";
import { CircularPage } from "./models/circular_pages.model";
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
  CircularReadStatus,
  CircularPage,
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
  // A single in-flight initialization promise so concurrent getDb() callers
  // share ONE init instead of racing to create/destroy pools (the root cause
  // of "Cannot use a pool after calling end on the pool" during dev HMR).
  // eslint-disable-next-line no-var
  var cachedTypeORMInitPromise: Promise<DataSource> | null;
}

// Global caching container lifecycle validation to handle Next.js hot module replacements safely
if (!global.cachedTypeORMDataSource) {
  global.cachedTypeORMDataSource = null;
}
if (!global.cachedTypeORMInitPromise) {
  global.cachedTypeORMInitPromise = null;
}

// Transient connection errors that should trigger a one-shot re-init instead of
// a 500 (Supabase's 6543 transaction pooler drops idle/over-loaded conns; dev
// HMR tears pools down mid-flight).
const TRANSIENT_DB_ERROR =
  /connection terminated|driver not connected|timeout exceeded|connection timeout|econnreset|server closed the connection|terminating connection/i;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
// Tears down a stale DataSource safely. Nulls the global reference FIRST so a
// concurrent caller can't grab the same instance and destroy it a second time,
// then swallows any pool-already-ended error from the actual destroy().
async function safeDestroy(ds: DataSource | null): Promise<void> {
  if (!ds) return;
  global.cachedTypeORMDataSource = null;
  global.cachedTypeORMInitPromise = null;
  try {
    if (ds.isInitialized) await ds.destroy();
  } catch (e) {
    // Double-destroy / already-ended pool during HMR churn — non-fatal.
    console.warn(
      "⚠️ TypeORM DataSource teardown noise (safe to ignore):",
      (e as Error)?.message ?? e,
    );
  }
}

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
        await safeDestroy(global.cachedTypeORMDataSource);
        // fall through to (re)initialization below
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
        keepAlive: true, // Keep TCP sockets warm so the pooler doesn't silently drop idle conns
        allowExitOnIdle: false, // Never auto-end the pool from under a cached DataSource
      },
    };
  }

  // If an initialized source already survived the checks above, reuse it.
  if (
    global.cachedTypeORMDataSource &&
    global.cachedTypeORMDataSource.isInitialized
  ) {
    return global.cachedTypeORMDataSource;
  }

  // Serialize initialization: the FIRST caller creates the init promise; every
  // concurrent caller awaits that same promise instead of building its own
  // DataSource and racing (which is what triggered the pool-end crash).
  if (!global.cachedTypeORMInitPromise) {
    global.cachedTypeORMInitPromise = (async () => {
      console.log(
        "🔌 Active structural connection instance unavailable. Instantiating fresh runtime client connection pool...",
      );
      const MAX_ATTEMPTS = 3;
      let lastErr: unknown;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const ds = new DataSource(dataSourceOptions);
        try {
          await ds.initialize();
          console.log(
            `✅ TypeORM DataSource context authenticated and synchronized successfully using [${dbType}] driver.`,
          );
          global.cachedTypeORMDataSource = ds;
          return ds;
        } catch (err) {
          lastErr = err;
          const msg = (err as Error)?.message ?? String(err);
          // Only retry transient connection drops; a real config/auth error
          // fails fast.
          try {
            if (ds.isInitialized) await ds.destroy();
          } catch {
            /* ignore teardown noise */
          }
          if (attempt < MAX_ATTEMPTS && TRANSIENT_DB_ERROR.test(msg)) {
            console.warn(
              `⚠️ Transient DB init failure (attempt ${attempt}/${MAX_ATTEMPTS}); retrying: ${msg}`,
            );
            await sleep(300 * attempt);
            continue;
          }
          throw err;
        }
      }
      throw lastErr;
    })();
  }

  try {
    const ds = await global.cachedTypeORMInitPromise;
    return ds;
  } catch (err) {
    console.error(
      "❌ Fatal validation crash processing current TypeORM runtime DataSource matrix configuration initialization:",
      err,
    );
    // Purge everything so the NEXT request retries a clean init instead of
    // reusing a half-dead source or a rejected promise.
    global.cachedTypeORMDataSource = null;
    global.cachedTypeORMInitPromise = null;
    throw err;
  }
}
