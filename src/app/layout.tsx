// src/app/layout.tsx

import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import AuthProvider from "@/components/AuthProvider";
import { ModalProvider } from "@/context/ModalContext";
import LoginModal from "@/components/LoginModal";
import { SessionGuard } from "@/components/SessionGuard"; // Import the guard
import { MonitorSizeSync } from "@/components/MonitorSizeSync";

// Fonts are now SELF-HOSTED from /public/fonts via @font-face in globals.css.
// The --font-poppins / --font-source-sans CSS variables are defined there too,
// so Tailwind (and any var(--font-*) usage) keeps working unchanged — nothing
// is fetched from Google Fonts anymore.

// Same monitor-size formula as MonitorSizeSync.tsx (window.screen, not
// innerWidth, so browser zoom never affects it; see that file for why).
// Duplicated here, not imported, because a `beforeInteractive` script has to
// be a self-contained inline string that runs before hydration -- this is
// what actually prevents a flash of the wrong --content-width on first load.
const MONITOR_SIZE_BOOTSTRAP = `
(function () {
  try {
    var w = window.screen.width;
    var h = window.screen.height;
    var diagonalInches = Math.sqrt(w * w + h * h) / 96;
    if (diagonalInches < 24) {
      document.documentElement.setAttribute("data-monitor-size", "small");
    }
  } catch (e) {}
})();
`;

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
      <head>
        <Script
          id="monitor-size-bootstrap"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: MONITOR_SIZE_BOOTSTRAP }}
        />
      </head>
      <body className="bg-neutral-100">
        <MonitorSizeSync />
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
