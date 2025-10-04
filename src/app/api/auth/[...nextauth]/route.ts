import NextAuth from "next-auth";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import GitHubProvider from "next-auth/providers/github";
import prisma from "@/lib/prisma";
import { getNextAuthUrl } from "@/lib/env";

const authOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    GitHubProvider({
      clientId: process.env.GITHUB_ID!,
      clientSecret: process.env.GITHUB_SECRET!,
    }),
  ],
  // Optional — sets correct callback URLs for both envs
  pages: {
    signIn: `${getNextAuthUrl()}/api/auth/signin`,
  },
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
