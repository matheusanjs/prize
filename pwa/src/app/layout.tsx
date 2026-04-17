import './globals.css';
import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { LayoutShell } from '@/components/layout/LayoutShell';
import { Toaster } from 'sonner';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
  preload: true,
});

export const metadata: Metadata = {
  title: 'Prize Clube',
  description: 'Prize Clube — Portal do Cliente e Operador',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Prize Clube' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Accessibility: do NOT lock zoom — WCAG 2.5.5 requires user-scalable
  // Only disable on explicit native Capacitor shell via meta tag
  maximumScale: 5,
  userScalable: true,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0D1B2A' },
    { media: '(prefers-color-scheme: light)', color: '#F4F9F9' },
  ],
};

const themeScript = `
(function(){
  try {
    var t = localStorage.getItem('pwa_theme');
    if (t === 'light') document.documentElement.classList.add('light');
    var c = t === 'light' ? '#F4F9F9' : '#0D1B2A';
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', c);
  } catch(e){}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning className={inter.variable}>
      <head>
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen font-sans">
        <LayoutShell>{children}</LayoutShell>
        <Toaster
          position="top-center"
          richColors
          closeButton
          expand={false}
          toastOptions={{
            style: { marginTop: 'env(safe-area-inset-top, 0px)' },
          }}
        />
      </body>
    </html>
  );
}
