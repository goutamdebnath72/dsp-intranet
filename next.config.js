/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    // ✅ Ensure pg stays in the bundle for Sequelize
    config.externals = config.externals || [];
    config.externals.push({ pg: "commonjs pg" });
    return config;
  },
};

module.exports = nextConfig;
