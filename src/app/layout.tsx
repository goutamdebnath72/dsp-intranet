// src/app/layout.tsx
import type { Metadata } from 'next';
// 1. Import Poppins and Source Sans 3 instead of Inter
import { Poppins, Source_Sans_3 } from 'next/font/google';
import './globals.css';
import Header from '@/components/Header';
import AuthProvider from '@/components/AuthProvider';

// 2. Configure the fonts
const poppins = Poppins({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-poppins', // Create a CSS variable
  weight: ['400', '500', '600', '700'],
});

const sourceSans = Source_Sans_3({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-source-sans', // Create another CSS variable
  weight: ['400', '600'],
});

export const metadata: Metadata = {
  title: 'DSP Intranet',
  description: 'Durgapur Steel Plant Intranet Portal',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // 3. Apply both font variables to the html tag
    <html lang="en" className={`${poppins.variable} ${sourceSans.variable}`}>
      <body>
        <AuthProvider>
          <Header />
          <main>{children}</main> {/* It's good practice to wrap children in a <main> tag */}
        </AuthProvider>
      </body>
    </html>
  );
}