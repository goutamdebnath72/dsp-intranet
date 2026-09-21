// src/app/layout.tsx

import type { Metadata } from "next";
import "./globals.css";
import AuthProvider from "@/components/AuthProvider";
import { ModalProvider } from "@/context/ModalContext";
import LoginModal from "@/components/LoginModal";
import { SessionGuard } from "@/components/SessionGuard"; // Import the guard

// Fonts are now SELF-HOSTED from /public/fonts via @font-face in globals.css.
// The --font-poppins / --font-source-sans CSS variables are defined there too,
// so Tailwind (and any var(--font-*) usage) keeps working unchanged — nothing
// is fetched from Google Fonts anymore.

export const metadata: Metadata = {
  title: "DSP Intranet",
  description: "Durgapur Steel Plant Intranet Portal",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-neutral-100">
        <AuthProvider>
          <ModalProvider>
            {/* Wrap the content in SessionGuard to ensure tab-session integrity */}
            <SessionGuard>
              <div className="bg-neutral-50 min-h-screen">
                <main>{children}</main>
              </div>
              <LoginModal />
            </SessionGuard>
          </ModalProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
