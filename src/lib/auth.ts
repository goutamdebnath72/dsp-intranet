// src/lib/auth.ts
import { AuthOptions } from "next-auth";
import GitHubProvider from "next-auth/providers/github";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import SequelizeAdapter from "@next-auth/sequelize-adapter";
import { getDb } from "@/lib/db";

let adapterInstance: ReturnType<typeof SequelizeAdapter> | undefined =
  undefined;

// Lazily initialize DB + adapter once
async function initAdapter() {
  try {
    const db = await getDb();
    if (db?.sequelize) {
      if (!adapterInstance) {
        adapterInstance = SequelizeAdapter(db.sequelize);
        console.log("✅ SequelizeAdapter initialized");
      }
    } else {
      console.warn("⚠️ Sequelize not initialized yet");
    }
  } catch (err) {
    console.error("❌ Failed to initialize SequelizeAdapter:", err);
  }
}

void initAdapter();

export const authOptions: AuthOptions = {
  adapter: adapterInstance,
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
        const db = await getDb();
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
