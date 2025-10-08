/** @type {import('next').NextConfig} */
const config = {
  // Add the 'images' configuration here
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'avatars.githubusercontent.com',
        port: '',
        pathname: '**',
      },
    ],
  },
};

module.exports = config;