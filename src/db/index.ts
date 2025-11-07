// src/db/index.ts
// Database switchboard: chooses the active adapter by DB_TYPE.

import { PrismaClient } from "@prisma/client";
import * as pg from "./postgres/client";

const DB_TYPE = (process.env.DB_TYPE || "postgres").toLowerCase();

let dbClient: PrismaClient | null = null;
let dbModels: any = null;
let dbServices: any = null;

switch (DB_TYPE) {
  case "postgres":
    dbClient = pg.dbClient;
    dbModels = pg.models;
    dbServices = pg.services;
    console.log("[db] using PostgreSQL adapter");
    break;

  case "oracle":
    console.error("[db] Oracle adapter not implemented yet.");
    throw new Error("Oracle adapter not implemented. (DB_TYPE=oracle)");
  // When implemented:
  // const oracle = await import("./oracle/client");
  // dbClient = oracle.dbClient;
  // dbModels = oracle.models;
  // dbServices = oracle.services;
  // break;

  default:
    throw new Error(`[db] Unsupported DB_TYPE="${DB_TYPE}"`);
}

export { dbClient, dbModels, dbServices, DB_TYPE };
export default { dbClient, dbModels, dbServices, DB_TYPE };
