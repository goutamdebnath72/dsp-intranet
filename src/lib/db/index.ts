// src/lib/db/index.ts
import "reflect-metadata"; // TypeORM needs this core decorator metadata initialization step first
import { DataSource, DataSourceOptions } from "typeorm";
import { getOracleConfig } from "./config/oracle.config";
import { TRANSIENT_DB_ERROR, retireDataSource, sleep } from "./resilience";
import { hasExactMetadata, installDevEntityNameFallback } from "./hmrEntities";

// --- IMPORT TYPEORM ENTITIES ---
import { Account } from "./models/account.model";
import { AnnouncementReadStatus } from "./models/announcement-read-status.model";
import { Announcement } from "./models/announcement.model";
import { Circular } from "./models/circular.model";
import { CircularReadStatus } from "./models/circular-read-status.model";
import { CircularPage } from "./models/circular_pages.model";
import { Department } from "./models/department.model";
import { HolidayExtractionStaging } from "./models/holiday-extraction-staging.model";
import { HolidayMaster } from "./models/holiday-master.model";
import { HolidayNotificationSubscription } from "./models/holiday-notification-subscription.model";
import { HolidayPolicyChunk } from "./models/holiday-policy-chunk.model";
import { HolidayRhQuota } from "./models/holiday-rh-quota.model";
import { HolidayYear } from "./models/holiday-year.model";
import { Link } from "./models/link.model";
import { Session } from "./models/session.model";
import { User } from "./models/user.model";
import { VerificationToken } from "./models/verification-token.model";
import { PERF } from "@/lib/perf/switches";

// One array that consolidates all the active database entities
const entities = [
  Account,
  AnnouncementReadStatus,
  Announcement,
  Circular,
  CircularReadStatus,
  CircularPage,
  Department,
  HolidayExtractionStaging,
  HolidayMaster,
  HolidayNotificationSubscription,
  HolidayPolicyChunk,
  HolidayRhQuota,
  HolidayYear,
  Link,
  Session,
  User,
  VerificationToken,
];

// Explicit type declaration for the global cache of the Node execution context
declare global {
  // eslint-disable-next-line no-var
  var cachedTypeORMDataSource: DataSource | null;
  // A single in-flight initialization promise so concurrent getDb() callers
  // share ONE init instead of racing to create/destroy pools (the root cause
  // of "Cannot use a pool after calling end on the pool" during dev HMR).
  // eslint-disable-next-line no-var
  var cachedTypeORMInitPromise: Promise<DataSource> | null;
}

// I validate the lifecycle of the global cache here so that Next.js hot module replacements are handled safely
if (!global.cachedTypeORMDataSource) {
  global.cachedTypeORMDataSource = null;
}
if (!global.cachedTypeORMInitPromise) {
  global.cachedTypeORMInitPromise = null;
}

// Transient-error detection, retry and graceful pool retirement live in ./resilience, where they can be tested on their own.

// Detects whether the app is running under a production deployment compression phase
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
 * My central, high-performance factory for the database connection.
 * It manages pool recycling, handles Next.js dev HMR reloads safely, and switches drivers dynamically.
 */
export async function getDb(): Promise<DataSource> {
  // Step 1: I reuse the globally cached DataSource if it is already connected and initialized
  if (
    global.cachedTypeORMDataSource &&
    global.cachedTypeORMDataSource.isInitialized
  ) {
    // Important, HMR safety: in local development I check whether modules/classes have reloaded in memory.
    // If a class reference has changed, I must safely close the old pool and instantiate a fresh one.
    if (process.env.NODE_ENV === "development") {
      // I make this identity check STRICT on purpose: installDevEntityNameFallback (below) makes hasMetadata() answer "yes" for a reloaded
      // copy of a class, which would hide a real reload from this test.
      const isHmrReloaded = entities.some((entity) => {
        try {
          return !hasExactMetadata(global.cachedTypeORMDataSource!, entity);
        } catch {
          return true;
        }
      });

      if (isHmrReloaded) {
        console.log(
          "🔄 Next.js HMR reload detected. Replacing the TypeORM DataSource pool (the old one finishes its work first)...",
        );
        // Do NOT destroy the old pool now: requests that started a moment ago (the home page, announcements ...)
        // are still running queries on it, and closing it under them is what crashed the page right after login.
        // I detach it, let it drain, and close it later.
        const old = global.cachedTypeORMDataSource;
        global.cachedTypeORMDataSource = null;
        global.cachedTypeORMInitPromise = null;
        retireDataSource(old);
        // I fall through to the (re)initialization below
      } else {
        return global.cachedTypeORMDataSource;
      }
    } else {
      return global.cachedTypeORMDataSource;
    }
  }

  // Step 2: during a production compilation I safely step around the live connection routines
  if (isBuildPhase) {
    console.log(
      "🔌 BUILD PHASE detected — returning dummy TypeORM target engine.",
    );
    return DUMMY_DATA_SOURCE;
  }

  const dbType = process.env.DB_TYPE || "postgres";
  let dataSourceOptions: DataSourceOptions;

  // Step 3: I construct the exact, optimized configuration for the chosen enterprise driver
  if (dbType === "oracle") {
    if (!global.cachedTypeORMInitPromise) console.log(
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
      synchronize: false, // I keep schema mutations isolated away from the active runtime execution paths
      entities: entities,
      extra: {
        poolMax: 10,
        poolMin: 2,
        poolIncrement: 1,
      },
    };
  } else {
    // I say this once per start, not for every request that arrives while the connection is still being made (they all pass here)
    if (!global.cachedTypeORMInitPromise) console.log(
      "🔌 Configuring TypeORM client connectivity options for Supabase Postgres Cluster...",
    );
    dataSourceOptions = {
      type: "postgres",
      url: process.env.DATABASE_URL, // I use the Supabase optimized pool connection strings directly
      logging: false,
      synchronize: false, // I keep the multi-tenant schema safety protection switch locked on
      // TypeORM would run `CREATE EXTENSION IF NOT EXISTS "vector"` at every cold start (the entities have vector columns): one more round trip to the database before the first answer. The extension is already installed (the vector search runs on it), so I do not ask for it again.
      installExtensions: PERF.installPgExtensionsAtStart, // src/lib/perf/switches.js
      entities: entities,
      extra: {
        max: 5, // A safety ceiling on connections protects the Supabase transaction slots
        idleTimeoutMillis: 10000, // I evict inactive connections immediately
        connectionTimeoutMillis: 5000, // I give slow handshakes room to stabilize
        keepAlive: true, // I keep TCP sockets warm so the pooler does not silently drop idle connections
        allowExitOnIdle: false, // I never auto-end the pool from under a cached DataSource
      },
    };
  }

  // If an initialized source already survived the checks above, I reuse it.
  if (
    global.cachedTypeORMDataSource &&
    global.cachedTypeORMDataSource.isInitialized
  ) {
    return global.cachedTypeORMDataSource;
  }

  // Initialization is serialized: the FIRST caller creates the init promise, and every
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
          // Dev only: a route file compiled on demand brings its own copy of the entity classes, so I accept it by name
          // instead of failing the first request (see hmrEntities.ts).
          if (process.env.NODE_ENV === "development") installDevEntityNameFallback(ds);
          console.log(
            `✅ TypeORM DataSource context authenticated and synchronized successfully using [${dbType}] driver.`,
          );
          global.cachedTypeORMDataSource = ds;
          return ds;
        } catch (err) {
          lastErr = err;
          const msg = (err as Error)?.message ?? String(err);
          // I only retry transient connection drops; a real config or auth error
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
    // I purge everything so the NEXT request retries a clean init instead of
    // reusing a half-dead source or a rejected promise.
    global.cachedTypeORMDataSource = null;
    global.cachedTypeORMInitPromise = null;
    throw err;
  }
}
