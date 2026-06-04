// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  // 1. ✅ Force Next.js to fall back to Terser to allow class preservation rules to apply
  swcMinify: false,

  webpack: (config, { isServer, dev }) => {
    // 2. ✅ PRESERVE ORIGINAL NATIVE DRIVER EXTERNAL SETTINGS
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

    // 3. ✅ PRESERVE CLASS & FUNCTION NAMES IN PRODUCTION BUILD
    // Prevents Terser from minifying "User" class to "l", resolving the TypeORM metadata error!
    if (!dev) {
      config.optimization.minimizer.forEach((minimizer) => {
        if (minimizer.options && minimizer.options.minimizerOptions) {
          // Provide both snake_case and camelCase parameters to cover all compiler versions
          minimizer.options.minimizerOptions.keep_classnames = true;
          minimizer.options.minimizerOptions.keep_fnames = true;
          minimizer.options.minimizerOptions.keepClassnames = true;
          minimizer.options.minimizerOptions.keepFnames = true;
        }
      });
    }

    return config;
  },

  experimental: {
    // ✅ Keep allowing native database modules to load correctly at runtime
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
