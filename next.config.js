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
    // serverComponentsExternalPackages alone does NOT get every file these
    // two packages need at runtime into the traced serverless bundle —
    // confirmed by inspecting .next/server/app/api/circulars/route.js.nft.json:
    // @napi-rs/canvas's native .node binary was entirely absent, and pdfjs-dist
    // was reduced to just its single entry file (missing package.json,
    // standard_fonts/, cmaps/). pdf-to-img resolves both of these at runtime
    // via dynamic require()/createRequire().resolve() calls that Next's
    // build-time tracer can't follow, so both must be force-included here.
    outputFileTracingIncludes: {
      "/api/circulars": [
        "./node_modules/@napi-rs/canvas*/**/*",
        "./node_modules/pdfjs-dist/**/*",
      ],
    },
  },
};

module.exports = nextConfig;
