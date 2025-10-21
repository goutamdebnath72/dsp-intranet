/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      // Your existing domains
      {
        protocol: "https",
        hostname: "ui-avatars.com",
      },
      {
        protocol: "https",
        hostname: "avatars.githubusercontent.com",
      },
      // --- ADDED: The new domain for placeholders ---
      {
        protocol: "https",
        hostname: "placehold.co",
      },
    ],
  },
  // Your existing experimental configuration
  experimental: {
    serverComponentsExternalPackages: ["canvas", "pdfjs-dist"],
  },
};

module.exports = nextConfig;
