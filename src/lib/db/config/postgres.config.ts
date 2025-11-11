// src/lib/db/config/postgres.config.ts
// Parse a single DATABASE_URL (or DIRECT_DATABASE_URL) into a Sequelize-friendly config.
// This file intentionally uses the WHATWG URL API so username/password are decoded correctly.

import type { Options } from "sequelize";

function parseDatabaseUrl(url?: string) {
  if (!url) return null;
  try {
    const u = new URL(url);
    const host = u.hostname;
    const port = u.port ? parseInt(u.port, 10) : 5432;
    // pathname starts with '/'
    const database = u.pathname ? u.pathname.replace(/^\//, "") : undefined;
    // URL.username / URL.password are percent-decoded by the WHATWG URL implementation,
    // but we defensively decodeURIComponent in case of differences.
    const username = u.username ? decodeURIComponent(u.username) : undefined;
    const password = u.password ? decodeURIComponent(u.password) : undefined;
    return { host, port, database, username, password };
  } catch (err) {
    return null;
  }
}

export function getPostgresConfig(): Options & {
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
} {
  // Prefer an explicit DIRECT_DATABASE_URL, then DATABASE_URL, then individual vars.
  const urlSource =
    process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL || undefined;

  const parsed = parseDatabaseUrl(urlSource);

  // If parsed successfully, return a config object for Sequelize.
  if (parsed) {
    return {
      dialect: "postgres",
      host: parsed.host,
      port: parsed.port,
      database: parsed.database,
      username: parsed.username,
      password: parsed.password,
      ssl: true,
      dialectOptions: {
        ssl: { require: true, rejectUnauthorized: false },
      },
    } as any;
  }

  // Fallback: read individual POSTGRES_* env vars if present
  const host = process.env.POSTGRES_HOST;
  const port = process.env.POSTGRES_PORT
    ? Number(process.env.POSTGRES_PORT)
    : undefined;
  const database = process.env.POSTGRES_DATABASE;
  const username = process.env.POSTGRES_USER;
  const password = process.env.POSTGRES_PASSWORD;

  if (!host || !database || !username) {
    throw new Error(
      "DATABASE_URL or DIRECT_DATABASE_URL not set and POSTGRES_* variables are incomplete."
    );
  }

  return {
    dialect: "postgres",
    host,
    port: port ?? 5432,
    database,
    username,
    password,
    ssl: true,
    dialectOptions: {
      ssl: { require: true, rejectUnauthorized: false },
    },
  } as any;
}
