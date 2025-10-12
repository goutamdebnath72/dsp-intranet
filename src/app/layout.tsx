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
      <body className="bg-neutral-100">
        <AuthProvider>
          <ModalProvider>
            <div className="w-full lg-custom:w-[75%] xl-custom:w-[70%] mx-auto bg-neutral-50 min-h-screen shadow-lg">
              <Header />
              <main>{children}</main>
            </div>
            <LoginModal />
          </ModalProvider>
        </AuthProvider>
      </body>
    </html>
  );
}