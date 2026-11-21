// src/app/layout.tsx

import type { Metadata } from "next";
import "./globals.css";
import AuthProvider from "@/components/AuthProvider";
import { ModalProvider } from "@/context/ModalContext";
import LoginModal from "@/components/LoginModal";
import { SessionGuard } from "@/components/SessionGuard"; // Import the guard
import AppToaster from "@/components/AppToaster";
import ImageGuard from "@/components/ImageGuard"; // no photograph can be saved: right-click and drag are refused on pictures
import { CONSOLE_BRIDGE_SCRIPT } from "@/lib/dev/consoleBridge"; // development only: the browser console goes to .browser-console.log
import { CLIENT_ERROR_SCRIPT } from "@/lib/errorLog/clientReport"; // production only: uncaught browser errors go to the error log

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
      {/* DEVELOPMENT: the browser console written to .browser-console.log (src/lib/dev/consoleBridge.ts). PRODUCTION: uncaught errors sent to the error log (src/lib/errorLog/clientReport.ts). Both listen before React hydrates. */}
      <head>
        <script dangerouslySetInnerHTML={{ __html: process.env.NODE_ENV === "development" ? CONSOLE_BRIDGE_SCRIPT : CLIENT_ERROR_SCRIPT }} />
      </head>
      <body className="bg-neutral-100">
        <AppToaster />
        <ImageGuard />
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
