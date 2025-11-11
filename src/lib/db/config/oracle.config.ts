import { Options, Dialect } from "sequelize"; // Import Dialect

export const getOracleConfig = (): Options => {
  const config = {
    dialect: "oracle" as Dialect, // Cast to Dialect
    username: process.env.ORACLE_USER,
    password: process.env.ORACLE_PASSWORD,
    // e.g., "192.168.1.10:1521/ORCLPDB1"
    connectString: process.env.ORACLE_CONNECT_STRING,
  };

  // Basic check
  if (!config.username || !config.password || !config.connectString) {
    // We only throw an error if the app is *trying* to use Oracle
    // This allows the dev (postgres) mode to work without these vars
    if (process.env.DB_TYPE === "oracle") {
      throw new Error("Missing Oracle environment variables!");
    }
  }

  return config;
};
