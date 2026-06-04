/** @type {import('next').NextConfig} */
const nextConfig = {
  // ✅ Restore Next.js high-performance SWC compiler (keeps builds fast!)
  swcMinify: true,

  webpack: (config, { isServer }) => {
    if (isServer) {
      // ✅ Fix Sequelize / database dynamic imports for PostgreSQL and Oracle
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
    // ✅ Keep allowing native modules to load correctly at runtime in Server Components
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
