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

// SECURITY HEADERS on every response (none of them changes what a page does or how fast it comes):
//  - Strict-Transport-Security: the browser uses https only, for two years;
//  - X-Content-Type-Options: a file is what its Content-Type says (no guessing a script out of a picture or a PDF);
//  - X-Frame-Options SAMEORIGIN: another site cannot put this one in a frame (clickjacking); the app's own pages may (the PDF viewers frame /api/... files of the same address);
//  - Referrer-Policy: another site is told only the address's origin, never the path or the search words;
//  - Permissions-Policy: the page cannot ask for the camera, microphone, location, payment or USB (nothing here uses them).
// A Content-Security-Policy is the next step and is NOT here: it needs a pass in a real browser over every page first (the PDF viewers, the history card's pdf.js worker, the lightbox, the login window),
// because a policy that is too tight breaks a page without a word.
const SECURITY_HEADERS = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
];

const nextConfig = {
  // the response no longer says which framework (and so which version's weaknesses) is behind it
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },

  // (the old `swcMinify: false` option is gone in Next 16; minification is switched off for the webpack build below, which is what keeps TypeORM's class names)

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

    // 4. ✅ Suppress noisy face-api critical dependency warnings
    config.ignoreWarnings = [
      ...(config.ignoreWarnings || []),
      {
        module: /@vladmandic\/face-api/,
        message: /Critical dependency: require function is used in a way in which dependencies cannot be statically extracted/,
      },
    ];

    return config;
  },

  // Next 16: these three settings are top-level (they were under `experimental` in Next 14)
  // ✅ Keep allowing native database modules to load correctly at runtime
  serverExternalPackages: [
      "pg",
      "pg-hstore",
      "sequelize",
      "oracledb",
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
      // sharp is native: it must stay an external require(), never bundled (see outputFileTracingIncludes below)
      "sharp",
      // pdf-parse loads its PDF engine (pdf.js) by a computed path; kept as a plain require() from its own folder so that path resolves (the live fuel-trend route reads PPAC's price table with it)
      "pdf-parse",
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
        // sharp (and its platform binaries under @img) is used by the roster check and the health check-up schedule reading that now run inside
        // the upload (src/lib/ingestion/schedule/*). Like @napi-rs/canvas above it is a native module that the build-time tracer can leave out
        // of the deployed route, which would silently turn that feature off (the roster check would fail and every page would be read as an
        // ordinary one), so it is force-included here.
        "./node_modules/sharp/**/*",
        "./node_modules/@img/**/*",
      ],
      // the live fuel-trend route reads PPAC's daily price table (a PDF) with pdf-parse, whose engine is found by a computed path that the build-time tracer cannot follow: included by hand
      "/api/live/fuel-trend": ["./node_modules/pdf-parse/**/*"],
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
    // WHAT THE DEPLOYED FUNCTIONS DO NOT CARRY (measured on a production build; every deployment stores a copy of every route's files, and the Hobby plan stores 10 GB of them).
    // 1. Next matches a key of outputFileTracingIncludes/Excludes against any route that CONTAINS the text, so the includes of "/api/circulars" above (the upload: pdfjs-dist, the canvas and sharp binaries)
    //    also reached /api/circulars/seen, /[id], /[id]/read and /admin, which read the database and never touch a PDF: 85 MB each instead of about 5. Those four are cleaned here ("/api/circulars/*" matches them
    //    and not the upload itself, which has no "/" after "circulars").
    // 2. pdfjs-dist is force-included as a whole (see above), but the server only ever runs its legacy build (pdf-to-img imports "pdfjs-dist/legacy/build/pdf.mjs"): the source maps (18 MB), the viewer (web),
    //    the type files, the second, non-legacy build and the scripting sandbox are never read.
    // 3. pdf-parse ships four copies of pdf.js and loads one, v1.10.100, which is its default (nothing here asks for another version); the other three are never read.
    // Checked: a real PDF (src/lib/announcements/searchIndex/__fixtures__/true.pdf) drawn page by page with pdf-to-img and read with pdf-parse gives byte-for-byte the same pictures and the same text before and
    // after these files are removed. If pdfjs-dist or pdf-parse is upgraded, draw a PDF again before trusting this list.
    outputFileTracingExcludes: {
      "/api/circulars/*": [
        "./node_modules/pdfjs-dist/**",
        "./node_modules/@napi-rs/**",
        "./node_modules/@img/**",
        "./node_modules/sharp/**",
      ],
      "/**": [
        "./node_modules/pdfjs-dist/**/*.map",
        "./node_modules/pdfjs-dist/web/**",
        "./node_modules/pdfjs-dist/legacy/web/**",
        "./node_modules/pdfjs-dist/types/**",
        "./node_modules/pdfjs-dist/build/**",
        "./node_modules/pdfjs-dist/legacy/build/pdf.sandbox*",
        "./node_modules/pdfjs-dist/**/*.d.mts",
        "./node_modules/pdf-parse/lib/pdf.js/v1.10.88/**",
        "./node_modules/pdf-parse/lib/pdf.js/v1.9.426/**",
        "./node_modules/pdf-parse/lib/pdf.js/v2.0.550/**",
      ],
    },
};

module.exports = nextConfig;
