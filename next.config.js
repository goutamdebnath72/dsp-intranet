/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "ui-avatars.com",
      },
      {
        protocol: "https",
        hostname: "avatars.githubusercontent.com",
      },
    ],
  },
  // --- NEW CONFIGURATION ---
  // This tells Next.js to not bundle these packages and instead
  // treat them as external dependencies at runtime, which resolves the build errors.
  experimental: {
    serverComponentsExternalPackages: ["canvas", "pdfjs-dist"],
  },
  // --- END NEW CONFIGURATION ---
};

module.exports = nextConfig;
