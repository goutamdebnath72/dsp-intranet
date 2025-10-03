import type { NextConfig } from 'next';

const config: NextConfig = {
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

export default config;