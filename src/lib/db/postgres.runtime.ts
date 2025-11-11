import { Sequelize } from "sequelize";
import { getPostgresConfig } from "./config/postgres.config";
import pg from "pg";

let sequelize: Sequelize | null = null;

export async function getSequelize(): Promise<Sequelize> {
  if (sequelize) return sequelize;

  console.log("Connecting to PostgreSQL...");
  const config = getPostgresConfig();

  sequelize = new Sequelize(
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
    }
  );

  try {
    await sequelize.authenticate();
    console.log("✅ Sequelize connected successfully");
  } catch (error) {
    console.error("❌ Database connection failed:", error);
    throw error;
  }

  return sequelize;
}
