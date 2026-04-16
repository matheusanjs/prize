'use client';

import { usePathname } from 'next/navigation';
import { AuthProvider } from '@/contexts/auth';
import { Sidebar } from '@/components/layout/Sidebar';

export function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname === '/login';
  const isFullscreen = pathname === '/cozinha' || pathname === '/kds';

  return (
    <AuthProvider>
      {isLoginPage ? (
        <>{children}</>
      ) : isFullscreen ? (
        <main className="min-h-screen bg-th-surface">{children}</main>
      ) : (
        <div className="flex min-h-screen bg-th-surface">
          <Sidebar />
          <main className="flex-1 ml-64 p-8 bg-th-surface">{children}</main>
        </div>
      )}
    </AuthProvider>
  );
}
