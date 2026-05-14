import type { Metadata, Viewport } from 'next';
import '@/app/globals.css';

export const viewport: Viewport = {
  themeColor: '#060b14',
  width: 'device-width',
  initialScale: 1,
};

export const metadata: Metadata = {
  metadataBase: new URL('https://adisyum.com'),
  title: {
    default: 'Adisyum — Restaurant Operating Platform',
    template: '%s | Adisyum',
  },
  description:
    'Türkiye\'nin en gelişmiş restoran operasyon platformu. Cloud POS, offline-first, mutfak yazıcıları, QR menü, canlı izleme ve çok şubeli yönetim tek çatı altında.',
  keywords: [
    'restoran yönetim sistemi',
    'cloud pos',
    'qr menü',
    'adisyon sistemi',
    'restoran yazılımı',
    'kds',
    'mutfak ekranı',
    'çok şubeli restoran',
    'adisyum',
  ],
  authors: [{ name: 'Adisyum', url: 'https://adisyum.com' }],
  creator: 'Adisyum',
  publisher: 'Adisyum',
  openGraph: {
    type: 'website',
    locale: 'tr_TR',
    url: 'https://adisyum.com',
    siteName: 'Adisyum',
    title: 'Adisyum — Restaurant Operating Platform',
    description: 'Türkiye\'nin en gelişmiş restoran operasyon platformu.',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'Adisyum Platform' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Adisyum — Restaurant Operating Platform',
    description: 'Cloud POS, QR Menü, Mutfak Ekranı & Canlı İzleme.',
    images: ['/og-image.png'],
    creator: '@adisyum',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 },
  },
  alternates: {
    canonical: 'https://adisyum.com',
    languages: { 'tr-TR': 'https://adisyum.com', 'en-US': 'https://adisyum.com/en' },
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr" className="antialiased">
      <head>
        <link rel="preconnect" href="https://fonts.bunny.net" />
        <link href="https://fonts.bunny.net/css?family=inter:300,400,500,600,700,800,900|inter-var" rel="stylesheet" />
        {/* JSON-LD Schema.org */}
        <script
          type="application/ld+json"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: static JSON-LD
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'SoftwareApplication',
              name: 'Adisyum',
              applicationCategory: 'BusinessApplication',
              operatingSystem: 'Web, Android, iOS, Windows',
              url: 'https://adisyum.com',
              description: 'Enterprise restaurant operating platform',
              offers: {
                '@type': 'Offer',
                price: '0',
                priceCurrency: 'TRY',
                description: 'Ücretsiz demo talebi',
              },
              sameAs: ['https://twitter.com/adisyum'],
            }),
          }}
        />
      </head>
      <body className="min-h-screen bg-[#060b14] text-slate-100 selection:bg-brand-500/30 selection:text-white">
        {children}
      </body>
    </html>
  );
}
