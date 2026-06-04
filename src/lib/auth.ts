// src/lib/auth.ts
import { AuthOptions } from "next-auth";
import GitHubProvider from "next-auth/providers/github";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { TypeORMAdapter } from "@auth/typeorm-adapter";
import { getDb } from "@/lib/db";
import { User } from "@/lib/db/models";

/**
 * Async function to build AuthOptions matching TypeORM connection states.
 * Connects directly to the globally cached DataSource factory to ensure zero pool leaks.
 */
export async function getAuthOptions(): Promise<AuthOptions> {
  // 1. Retrieve the central runtime DataSource connection pool matrix
  const dataSource = await getDb();

  // 2. Build and return the NextAuth configuration block
  return {
    // Inject the modern TypeORM adapter only if the connection pool is fully initialized
    adapter: dataSource.isInitialized
      ? (TypeORMAdapter(dataSource as any) as any)
      : undefined,

    session: { strategy: "jwt" },
    pages: { signIn: "/login" },

    providers: [
      GitHubProvider({
        clientId: process.env.GITHUB_ID as string,
        clientSecret: process.env.GITHUB_SECRET as string,
      }),

      CredentialsProvider({
        name: "Credentials",
        credentials: {
          ticketNo: { label: "Ticket Number", type: "text" },
          password: { label: "SAIL Personal No.", type: "password" },
        },
        async authorize(credentials) {
          if (!dataSource || !dataSource.isInitialized) {
            console.error(
              "❌ Auth failed: TypeORM DataSource is not initialized or available",
            );
            return null;
          }

          if (!credentials?.ticketNo || !credentials.password) return null;

          try {
            // Target the strictly typed TypeORM user entity repository matching the active model layer
            const userRepository = dataSource.getRepository<User>("User");
            const user = await userRepository.findOne({
              where: { ticketNo: credentials.ticketNo },
            });

            if (!user || !user.password) return null;

            const isValid = await bcrypt.compare(
              credentials.password,
              user.password,
            );
            if (!isValid) return null;

            // Return matching application payload parameters
            return {
              id: user.id,
              name: user.name,
              email: user.email,
              image: user.image,
              role: user.role,
              ticketNo: user.ticketNo, // ✅ Passed database ticketNo attribute through the login token
            };
          } catch (error) {
            console.error(
              "❌ Exception captured during Credentials authentication process flow:",
              error,
            );
            return null;
          }
        },
      }),
    ],

    callbacks: {
      async jwt({ token, user }) {
        if (user) {
          token.id = (user as any).id;
          token.role = (user as any).role;
          token.ticketNo = (user as any).ticketNo; // ✅ Attached database ticketNo attribute to JWT token
        }
        return token;
      },
      async session({ session, token }) {
        if (session.user) {
          (session.user as any).id = token.id;
          (session.user as any).role = token.role;
          (session.user as any).ticketNo = token.ticketNo as string; // ✅ Attached database ticketNo attribute to active user session
        }
        return session;
      },
    },
  };
}
