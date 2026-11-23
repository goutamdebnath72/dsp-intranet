// src/types/next-auth.d.ts

import NextAuth, { DefaultSession, DefaultUser } from "next-auth";
// --- ADDED: Import JWT types ---
import { JWT, DefaultJWT } from "next-auth/jwt";

// Here I extend the built-in session and user types.
declare module "next-auth" {
  /**
   * The shape of the user object returned in the session.
   * I extend the default session to include custom properties like id, role, and ticketNo.
   */
  interface Session {
    user: {
      id: string;
      role: string;
      ticketNo?: string | number; // Added ticketNo
    } & DefaultSession["user"]; // I keep the default properties like name, email, image
  }

  /**
   * The shape of the user object returned from the database.
   * I extend the default user to include the role and ticketNo properties.
   */
  interface User extends DefaultUser {
    role: string;
    ticketNo?: string | number; // Added ticketNo
  }
}

// --- ADDED: Extend the built-in JWT type ---
declare module "next-auth/jwt" {
  /**
   * The shape of the JWT token.
   * I extend the default JWT to include my custom role and ticketNo properties.
   */
  interface JWT extends DefaultJWT {
    role: string;
    ticketNo?: string | number; // Added ticketNo
  }
}
