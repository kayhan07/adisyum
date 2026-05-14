import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Inter, Space_Grotesk } from 'next/font/google';
import { QueryProvider } from '@/components/providers/query-provider';
import { AppRuntimeProvider } from '@/components/providers/app-runtime-provider';
import './globals.css';

const inter = Inter({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-sans',
});

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-display',
});

export const metadata: Metadata = {
  title: 'Adisyon | Modern Restoran Yönetim Sistemi',
  description:
    'Adisyon, masa yönetimi, stok, finans, KDS ve entegrasyonları tek panelde buluşturan premium restoran yönetim sistemi.',
};

const themeScript = `
  try {
    const stored = window.localStorage.getItem('aurelia-theme');
    document.documentElement.dataset.theme = stored || 'dark';
  } catch (error) {
    document.documentElement.dataset.theme = 'dark';
  }
`;

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="tr" suppressHydrationWarning>
      <body className={`${inter.variable} ${spaceGrotesk.variable}`}>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <QueryProvider>
          <AppRuntimeProvider>{children}</AppRuntimeProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
