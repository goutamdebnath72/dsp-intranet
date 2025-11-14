// src/lib/auth.ts
import { AuthOptions } from "next-auth";
import GitHubProvider from "next-auth/providers/github";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import SequelizeAdapter from "@next-auth/sequelize-adapter";
// ✅ CHANGED: We now only import 'getDb'
import { getDb } from "@/lib/db";

// ⛔️ REMOVED: All the old, broken adapter logic
// let adapterInstance: ReturnType<typeof SequelizeAdapter> | undefined =
//   undefined;
// async function initAdapter() { ... }
// void initAdapter();

/**
 * ✅ NEW: Async function to build AuthOptions
 * This function is now the "child" that calls your "top-positioned"
 * getDb() function, ensuring the shared connection is used.
 * This fixes the root cause of the MaxClients crash.
 */
export async function getAuthOptions(): Promise<AuthOptions> {
  // 1. Get the shared, cached database connection
  const db = await getDb();

  // 2. Throw an error if the DB isn't ready
  //    (This check is important for serverless)
  if (!db.sequelize && db.sequelize !== null) {
    throw new Error("Sequelize connection is not available for NextAuth");
  }

  // 3. Build and return the AuthOptions
  return {
    // 4. Pass the *full db object* to the adapter
    //    This is the correct way to initialize it.
    adapter: db.sequelize
      ? SequelizeAdapter(db.sequelize, {
          models: {
            User: db.User,
            Account: db.Account,
            Session: db.Session,
            VerificationToken: db.VerificationToken,
          },
        })
      : undefined,
    session: { strategy: "jwt" }, // Your setting, unchanged
    pages: { signIn: "/login" }, // Your setting, unchanged

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
        // This 'authorize' function was already correct in your file,
        // so it is just moved inside here, unchanged.
        async authorize(credentials) {
          // 'db' is now the shared connection we got at the top
          const User = db?.User;

          if (!User) {
            console.error("❌ Auth failed: DB not connected");
            return null;
          }

          if (!credentials?.ticketNo || !credentials.password) return null;

          const user = await User.findOne({
            where: { ticketNo: credentials.ticketNo },
            raw: true,
          });

          if (!user || !user.password) return null;

          const isValid = await bcrypt.compare(
            credentials.password,
            user.password
          );

          if (!isValid) return null;

          return {
            id: user.id,
            name: user.name,
            email: user.email,
            image: user.image,
            role: user.role,
          };
        },
      }),
    ],

    callbacks: {
      // (Your callbacks, unchanged)
      async jwt({ token, user }) {
        if (user) {
          token.id = (user as any).id;
          token.role = (user as any).role;
        }
        return token;
      },
      async session({ session, token }) {
        if (session.user) {
          (session.user as any).id = token.id;
          (session.user as any).role = token.role;
        }
        return session;
      },
    },
  };
}
