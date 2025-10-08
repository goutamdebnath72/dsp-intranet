// src/types/next-auth.d.ts
import NextAuth, { DefaultSession, DefaultUser } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      /** The user's id. */
      id: string; // <-- ADD THIS LINE
      /** The user's role. */
      role: string;
    } & DefaultSession["user"];
  }

  interface User extends DefaultUser {
    /** The user's role. */
    role: string;
  }
}