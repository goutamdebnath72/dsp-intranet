/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    if (isServer) {
      // ✅ Fix Sequelize dynamic imports for PostgreSQL and Oracle
      config.externals = config.externals || [];
      config.externals.push({
        pg: "commonjs pg",
        "pg-hstore": "commonjs pg-hstore",
        sequelize: "commonjs sequelize",
        oracledb: "commonjs oracledb",
      });
    }
    return config;
  },

  experimental: {
    // ✅ Allow these native modules to load at runtime
    serverComponentsExternalPackages: ["pg", "pg-hstore", "sequelize", "oracledb"],
  },
};

module.exports = nextConfig;
