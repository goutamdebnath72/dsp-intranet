// src/app/layout.tsx
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Header from '@/components/Header';
import AuthProvider from '@/components/AuthProvider'; // 1. Import AuthProvider

const inter = Inter({ subsets: ['latin'] });

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
    <html lang="en">
      <body className={inter.className}>
        <AuthProvider> {/* 2. Wrap everything inside AuthProvider */}
          <Header />
          {children}
        </AuthProvider> {/* 3. Close the provider */}
      </body>
    </html>
  );
}