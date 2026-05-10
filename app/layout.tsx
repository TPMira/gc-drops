import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ToastProvider } from '@/app/components/ToastProvider';
import Navbar from '@/app/components/Navbar';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Grand Chase Drops Tracker",
  description: "Acompanhe e analise drops de itens no Grand Chase",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-[#08080f] text-white">
        <ToastProvider>
          <Navbar />
          <main className="pt-16">
            {children}
          </main>
        </ToastProvider>
      </body>
    </html>
  );
}
