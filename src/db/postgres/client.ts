// src/db/postgres/client.ts
// Postgres adapter: wraps the Prisma client for consistency across DB types.

import { prisma as prismaClient } from "@/lib/prisma";

const dbClient = prismaClient;

const models = {
  announcement: dbClient.announcement,
  account: dbClient.account,
  session: dbClient.session,
  user: dbClient.user,
  department: dbClient.department,
  circular: dbClient.circular,
  holidayMaster: dbClient.holidayMaster,
  holidayYear: dbClient.holidayYear,
  link: dbClient.link,
};

const services = {
  /**
   * Run a raw SQL query safely.  Use only for trusted inputs.
   */
  raw: async (query: string, ...params: unknown[]) =>
    dbClient.$queryRawUnsafe(query, ...params),
};

export { dbClient, models, services };
export default { dbClient, models, services };
