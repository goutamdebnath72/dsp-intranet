/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer, dev }) => {
    // 1. ✅ PRESERVE ORIGINAL EXTERNAL BUNDLING ROUTINES
    if (isServer) {
      // Fix Sequelize dynamic imports for PostgreSQL and Oracle
      config.externals = config.externals || [];
      config.externals.push({
        pg: "commonjs pg",
        "pg-hstore": "commonjs pg-hstore",
        sequelize: "commonjs sequelize",
        oracledb: "commonjs oracledb",
      });
    }

    // 2. ✅ PRESERVE CLASS & FUNCTION NAMES IN PRODUCTION BUILD
    // Prevents SWC from minifying "User" class to "l" or "e", resolving the TypeORM metadata error!
    if (!dev) {
      config.optimization.minimizer.forEach((minimizer) => {
        if (minimizer.options && minimizer.options.minimizerOptions) {
          minimizer.options.minimizerOptions.keepClassnames = true;
          minimizer.options.minimizerOptions.keepFnames = true;
        }
      });
    }

    return config;
  },

  experimental: {
    // ✅ Keep allowing native modules to load correctly at runtime
    serverComponentsExternalPackages: [
      "pg",
      "pg-hstore",
      "sequelize",
      "oracledb",
      "tesseract.js",
      "typeorm",
    ],
  },
};

module.exports = nextConfig;
