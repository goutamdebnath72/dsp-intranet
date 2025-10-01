import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header"; // 1. IMPORT our new component

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "SAIL DSP Intranet",
  description: "Durgapur Steel Plant Intranet Portal",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Header /> {/* 2. ADD the component here */}
        <main>{children}</main> {/* This is where page content will go */}
      </body>
    </html>
  );
}