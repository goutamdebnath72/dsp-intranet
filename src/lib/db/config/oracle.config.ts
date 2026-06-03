// Stubs for legacy Sequelize types during TypeORM migration
type Options = any;
type Dialect = any;

export const getOracleConfig = (): Options => {
  const config: any = {
    dialect: "oracle" as Dialect,
    host: process.env.ORACLE_HOST || "localhost",
    port: parseInt(process.env.ORACLE_PORT || "1521", 10),
    username: process.env.ORACLE_USER || "system",
    password: process.env.ORACLE_PASSWORD || "oracle",
    database: process.env.ORACLE_DATABASE || "xe",
    logging: false,
    dialectOptions: {
      connectString: process.env.ORACLE_CONN_STR || undefined,
    },
  };
  return config;
};
