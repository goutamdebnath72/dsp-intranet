// src/app/api/auth/[...nextauth]/route.ts
import NextAuth from "next-auth";
// Removed: import { authOptions } from '@/lib/auth';
// Added: I import the new async function instead.
import { getAuthOptions } from "@/lib/auth";
import { NextRequest } from "next/server";

/**
 * A dynamic handler for NextAuth.
 * I use this pattern because it is the correct one for async AuthOptions in the App Router.
 */
async function handler(
  req: NextRequest,
  context: { params: Promise<{ nextauth: string[] }> }
) {
  // Step 1: I get the auth options (which are async)
  const authOptions = await getAuthOptions();

  // Step 2: I call NextAuth with the 1-argument overload (options);
  //    it returns a new handler function.
  const nextAuthHandler = NextAuth(authOptions);

  // Step 3: I call the returned handler with the request and context
  //    (I use 'as any' to satisfy older NextAuth type versions)
  return nextAuthHandler(req as any, context);
}

export { handler as GET, handler as POST };
