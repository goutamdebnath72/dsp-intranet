// next.config.js
/* eslint-disable @typescript-eslint/no-var-requires -- this file is
   inherently CommonJS (Next.js loads it via require(), and it ends in
   module.exports below), so require() here is correct, not something to
   convert to import syntax. */
const fs = require("fs");
const path = require("path");

/** @type {import('next').NextConfig} */

// Recursively walks a package's own dependency tree (via each package.json's
// "dependencies" field) and returns glob patterns covering that package and
// every dependency, transitively. Exists because manually listing pg's
// dependencies once already went wrong: only pg-connection-string (1 of 5
// direct dependencies) was included, missing pg-pool, pg-protocol,
// pg-types, and pgpass -- plus everything THEY depend on (pg-types alone
// pulls in 5 more packages, one of which pulls in yet another). That gap
// meant pg's own internal require() calls failed at runtime even though
// pg's own files were correctly traced, which TypeORM reports as the
// misleading "Postgres package has not been found installed" rather than
// naming the actual missing sibling package. Walking the tree in code
// avoids ever repeating that mistake, including if pg's dependencies
// change in a future version bump.
function traceIncludesForPackage(pkgName, seen = new Set()) {
  if (seen.has(pkgName)) return [];
  seen.add(pkgName);
  const globs = [`./node_modules/${pkgName}/**/*`];
  try {
    const pkgJsonPath = path.join(
      __dirname,
      "node_modules",
      pkgName,
      "package.json",
    );
    const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8"));
    const deps = Object.keys(pkgJson.dependencies || {});
    for (const dep of deps) {
      globs.push(...traceIncludesForPackage(dep, seen));
    }
  } catch (e) {
    console.warn(
      `[next.config.js] Could not read dependencies for "${pkgName}" while building outputFileTracingIncludes -- if this package is genuinely needed at runtime, its files may be missing from the deployed bundle. Error: ${e.message}`,
    );
  }
  return globs;
}

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
      // .next/server/app/page.js.nft.json that pg was traced into ZERO
      // files for the homepage bundle, despite getDb() needing it. This
      // produced "DriverPackageNotInstalledError" app-wide on a freshly
      // deployed, cold build. Best explanation: this project has Fluid
      // Compute enabled, which can share warm execution context across
      // routes -- as long as SOME route loaded pg first in a given warm
      // instance, others could piggyback on the cached module, masking
      // this trace gap until a fully cold deployment was hit. A first fix
      // attempt manually listed pg + pg-hstore + pg-connection-string, but
      // the real Vercel runtime logs showed the SAME error persisting --
      // because pg also directly depends on pg-pool, pg-protocol, and
      // pg-types (which itself pulls in 5 more packages), and pgpass
      // (which pulls in split2) -- none of which were included, so
      // require("pg") kept failing from the inside. Now using the
      // dependency walker above to get the full, verified transitive tree
      // automatically instead of a hand-typed list.
      "/**": traceIncludesForPackage("pg"),
    },
  },
};

module.exports = nextConfig;
