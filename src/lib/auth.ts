// src/lib/auth.ts
import { AuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { TypeORMAdapter } from "@auth/typeorm-adapter";
import { getDb } from "@/lib/db";
import { User } from "@/lib/db/models";
import { isSuperAdmin } from "@/lib/superAdmin";
import { createFailureLock } from "@/lib/security/rateLimit";

// WRONG PASSWORDS ARE COUNTED, and a key with too many in 15 minutes is refused without even checking the password (so guessing cannot go on, and a refused try costs no bcrypt work). Three keys: one ticket from one
// address (the person typing his own password wrongly: 6), one address (a script trying many tickets: 30), one ticket from anywhere (many addresses at one account: 40). A correct password clears the first.
// The tables live in one server copy (see src/lib/security/rateLimit.ts for what that can and cannot do).
const LOGIN_WINDOW = 15 * 60_000;
const failsPair = createFailureLock({ max: 6, windowMs: LOGIN_WINDOW });
const failsIp = createFailureLock({ max: 30, windowMs: LOGIN_WINDOW });
const failsTicket = createFailureLock({ max: 40, windowMs: LOGIN_WINDOW });
// a real bcrypt hash of a password nobody has: an unknown ticket is checked against it, so that "no such ticket" and "wrong password" take the same time (no way to find which tickets exist by timing)
const DUMMY_HASH = "$2a$10$bq9clt5D.7cD33rZO9FHR.c/rWo2N.qLkHqDl5zWqJRbpfLj9fwmS";
const headerOf = (h: unknown, name: string): string => { const v = (h as Record<string, unknown> | undefined)?.[name]; return Array.isArray(v) ? String(v[0] ?? "") : typeof v === "string" ? v : ""; };

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

    // 24 hours, then the person signs in again (a token used to live for the library default of 30 days, so a person whose account was withdrawn or whose password was found out stayed signed in for a month)
    session: { strategy: "jwt", maxAge: 24 * 60 * 60 },
    pages: { signIn: "/login" },

    providers: [
      CredentialsProvider({
        name: "Credentials",
        credentials: {
          ticketNo: { label: "Ticket Number", type: "text" },
          password: { label: "SAIL Personal No.", type: "password" },
        },
        async authorize(credentials, req) {
          if (!dataSource || !dataSource.isInitialized) {
            console.error(
              "❌ Auth failed: TypeORM DataSource is not initialized or available",
            );
            return null;
          }

          if (!credentials?.ticketNo || !credentials.password) return null;
          // A stray space (typed, or added by autofill) must not make a correct ticket number "unknown".
          const ticketNo = credentials.ticketNo.trim();
          if (!ticketNo || ticketNo.length > 32 || credentials.password.length > 128) return null;
          const ip = (headerOf(req?.headers, "x-forwarded-for").split(",")[0] || headerOf(req?.headers, "x-real-ip")).trim() || "unknown";
          const pairKey = `${ticketNo}|${ip}`;
          if (!failsPair.blocked(pairKey).ok || !failsIp.blocked(ip).ok || !failsTicket.blocked(ticketNo).ok) return null;
          const wrong = () => { failsPair.fail(pairKey); failsIp.fail(ip); failsTicket.fail(ticketNo); return null; };

          try {
            // Target the strictly typed TypeORM user entity repository matching the active model layer
            const userRepository = dataSource.getRepository<User>("User");
            const user = await userRepository.findOne({
              where: { ticketNo },
            });

            if (!user || !user.password) {
              await bcrypt.compare(credentials.password, DUMMY_HASH); // same work as for a real ticket
              return wrong();
            }

            const isValid = await bcrypt.compare(
              credentials.password,
              user.password,
            );
            if (!isValid) return wrong();
            failsPair.reset(pairKey);

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
          // ✅ Super-admin (HOD C&IT) flag, derived from ticket via SUPERADMIN_TICKETS env
          (session.user as any).isSuperAdmin = isSuperAdmin(token.ticketNo as string);
        }
        return session;
      },
    },
  };
}
