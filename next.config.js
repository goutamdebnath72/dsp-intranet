// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  // 1. ✅ Disable the SWC minifier
  swcMinify: false,

  webpack: (config, { isServer, dev }) => {
    // 2. ✅ PRESERVE ORIGINAL NATIVE DRIVER EXTERNAL SETTINGS
    if (isServer) {
      config.externals = config.externals || [];
      config.externals.push({
        pg: "commonjs pg",
        "pg-hstore": "commonjs pg-hstore",
        sequelize: "commonjs sequelize",
        oracledb: "commonjs oracledb",
      });
    }

    // 3. ✅ DISABLE WEBPACK MINIFICATION ENTIRELY FOR PRODUCTION
    // This stops Webpack/Terser from renaming "User" to "l" or "p", making TypeORM 100% stable!
    if (!dev) {
      config.optimization.minimize = false;
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
      // pdf-to-img -> pdfjs-dist's Node canvas factory needs the native
      // @napi-rs/canvas binary at runtime.
      "pdfjs-dist",
      "@napi-rs/canvas",
    ],
    // serverComponentsExternalPackages alone does NOT get the native
    // @napi-rs/canvas .node binary into the traced serverless bundle —
    // confirmed by inspecting .next/server/app/api/circulars/route.js.nft.json,
    // which listed zero canvas/napi-rs files even with the package
    // externalized. Next's build-time trace can't follow @napi-rs/canvas's
    // own runtime `require()` of a platform-specific package
    // (@napi-rs/canvas-<platform>-<arch>), so it must be force-included here.
    outputFileTracingIncludes: {
      "/api/circulars": ["./node_modules/@napi-rs/canvas*/**/*"],
    },
  },
};

module.exports = nextConfig;
