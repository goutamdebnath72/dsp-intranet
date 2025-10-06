// src/lib/auth.ts

import { PrismaAdapter } from '@next-auth/prisma-adapter';
import prisma from '@/lib/prisma';
import { AuthOptions } from 'next-auth';
import GitHubProvider from 'next-auth/providers/github';
import CredentialsProvider from 'next-auth/providers/credentials';

export const authOptions: AuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    GitHubProvider({
      clientId: process.env.GITHUB_ID as string,
      clientSecret: process.env.GITHUB_SECRET as string,
    }),
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials.password) {
          return null;
        }

        // TODO: Replace this with a real database lookup
        const user = { id: '1', name: 'Mock User', email: credentials.email };

        if (user) {
          return user;
        }
        return null;
      },
    }),
  ],

  // CRITICAL CHANGE HERE
  session: {
    strategy: 'database', // Use 'database' strategy with PrismaAdapter
  },
  pages: {
    signIn: '/login',
  },
};