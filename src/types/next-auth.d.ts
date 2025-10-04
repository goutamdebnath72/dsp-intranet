// src/types/next-auth.d.ts
import { DefaultSession } from "next-auth"

declare module "next-auth" {
  interface Session {
    user: {
      id: string; // Add the 'id' property here
    } & DefaultSession["user"]
  }
}