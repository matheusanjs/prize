import './globals.css';
import type { Metadata } from 'next';
import { LayoutShell } from '@/components/layout/LayoutShell';
import { ThemeProvider } from '@/contexts/theme';
import { QueryProvider } from './providers';

export const metadata: Metadata = {
  title: 'Prize Clube — Admin',
  description: 'Painel administrativo da marina Prize Clube',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className="dark" suppressHydrationWarning>
      <body className="min-h-screen bg-th-surface text-th">
        <QueryProvider>
          <ThemeProvider>
            <LayoutShell>{children}</LayoutShell>
          </ThemeProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
