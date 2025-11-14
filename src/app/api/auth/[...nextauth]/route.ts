// src/app/api/auth/[...nextauth]/route.ts
import NextAuth from "next-auth";
// ⛔️ REMOVED: import { authOptions } from '@/lib/auth';
// ✅ ADDED: Import the new async function
import { getAuthOptions } from "@/lib/auth";
import { NextRequest } from "next/server";

/**
 * ✅ NEW: Dynamic handler for NextAuth
 * This is the correct pattern for using async AuthOptions in the App Router.
 */
async function handler(
  req: NextRequest,
  context: { params: { nextauth: string[] } }
) {
  // 1. Get the auth options (which are async)
  const authOptions = await getAuthOptions();

  // 2. Call NextAuth with the 1-argument overload (options)
  //    This returns a new handler function.
  const nextAuthHandler = NextAuth(authOptions);

  // 3. Call the returned handler with the request and context
  //    (We use 'as any' to satisfy older NextAuth type versions)
  return nextAuthHandler(req as any, context);
}

export { handler as GET, handler as POST };
