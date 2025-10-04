export const getNextAuthUrl = () => {
  // ✅ Check if running on Vercel
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  // ✅ Fallback for local dev
  return process.env.NEXTAUTH_URL || "http://localhost:3000";
};
