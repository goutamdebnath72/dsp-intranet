// src/lib/db/postgres.runtime.ts
import { Sequelize } from "sequelize";
import { getPostgresConfig } from "./config/postgres.config";
import pg from "pg";

// This is the global cache for the connection
let sequelize: Sequelize | null = null;

export async function getSequelize(): Promise<Sequelize> {
  // 1. Return the cached connection (Your code, unchanged)
  if (sequelize) return sequelize;

  console.log("Connecting to PostgreSQL...");
  const config = getPostgresConfig();

  // 2. Create new connection (Your code, with one addition)
  const newSequelize = new Sequelize(
    config.database!,
    config.username!,
    config.password!,
    {
      host: config.host!,
      port: config.port!,
      dialect: "postgres",
      dialectModule: pg,
      logging: false,
      ssl: true,
      dialectOptions: {
        ssl: { require: true, rejectUnauthorized: false },
      },
      // ✅ ADDED: Connection Pooling
      // This is essential for Vercel's serverless environment
      // to fix the "MaxClients" error.
      pool: {
        max: 5, // Max 5 connections
        min: 0,
        acquire: 30000,
        idle: 10000,
      },
    }
  );

  try {
    // 3. Authenticate and cache (Your code, unchanged)
    await newSequelize.authenticate();
    console.log("✅ Sequelize connected successfully");
    sequelize = newSequelize; // Cache the new connection
  } catch (error) {
    console.error("❌ Database connection failed:", error);
    sequelize = null; // Do not cache on failure
    throw error;
  }

  return sequelize;
}
