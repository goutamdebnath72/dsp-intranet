import type { Metadata } from 'next';
import { Poppins, Source_Sans_3 } from 'next/font/google';
import './globals.css';
import Header from '@/components/Header';
import AuthProvider from '@/components/AuthProvider';
import { ModalProvider } from '@/context/ModalContext';
import LoginModal from '@/components/LoginModal';


const poppins = Poppins({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-poppins',
  weight: ['400', '500', '600', '700'],
});

const sourceSans = Source_Sans_3({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-source-sans',
  weight: ['400', '600'],
});

export const metadata: Metadata = {
  title: 'DSP Intranet',
  description: 'Durgapur Steel Plant Intranet Portal',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${poppins.variable} ${sourceSans.variable}`}>
      <body>
        <AuthProvider>
          <ModalProvider>
            <Header />
            <main>{children}</main>
            <LoginModal />
          </ModalProvider>
        </AuthProvider>
      </body>
    </html>
  );
}