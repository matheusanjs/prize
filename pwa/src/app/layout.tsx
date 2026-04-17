import './globals.css';
import type { Metadata, Viewport } from 'next';
import { LayoutShell } from '@/components/layout/LayoutShell';

export const metadata: Metadata = {
  title: 'Prize Clube',
  description: 'Prize Clube — Portal do Cliente e Operador',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Prize Clube' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
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
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen">
        <LayoutShell>{children}</LayoutShell>
      </body>
    </html>
  );
}
