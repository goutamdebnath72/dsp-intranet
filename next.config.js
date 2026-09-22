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
      // pdf-to-img ITSELF must also be external, not just its dependencies.
      // Without this, webpack code-splits the dynamic `await
      // import("pdf-to-img")` call into its own chunk file
      // (.next/server/chunks/11.js locally). pdf-to-img's own code resolves
      // pdfjs-dist's bundled assets via
      // `createRequire(import.meta.url).resolve("pdfjs-dist/package.json")`
      // — a resolution relative to WHATEVER FILE THAT CODE PHYSICALLY RUNS
      // FROM. Once webpack relocates it into a chunk file, import.meta.url
      // no longer points at pdf-to-img's real node_modules location, so
      // that resolution breaks ("Cannot find module 'pdfjs-dist/package.json'")
      // even though pdfjs-dist itself is correctly traced and present.
      // Externalizing pdf-to-img keeps it as a plain, unbundled require()
      // from its real file location, where the relative resolution is valid.
      "pdf-to-img",
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
      // pg has been in serverComponentsExternalPackages since long before
      // tonight's changes, and the homepage/every DB-backed route worked
      // fine in every test tonight -- but confirmed directly by inspecting
      // .next/server/app/page.js.nft.json that pg is traced into ZERO
      // files for the homepage bundle, despite getDb() needing it. This
      // produced "DriverPackageNotInstalledError: Postgres package has
      // not been found" app-wide on a freshly deployed, cold build. Best
      // explanation: this project has Fluid Compute enabled, which can
      // share warm execution context across routes -- as long as SOME
      // route loaded pg first in a given warm instance, others could
      // piggyback on the cached module, masking this trace gap until a
      // fully cold deployment was hit. Applying broadly (not scoped to
      // one route) since many routes across the app touch the database.
      "/**": [
        "./node_modules/pg/**/*",
        "./node_modules/pg-hstore/**/*",
        "./node_modules/pg-connection-string/**/*",
      ],
    },
  },
};

module.exports = nextConfig;
