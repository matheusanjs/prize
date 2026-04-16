'use client';

import { usePathname } from 'next/navigation';
import { AuthProvider } from '@/contexts/auth';
import { BottomNav } from '@/components/layout/BottomNav';
import { PushManager } from '@/components/PushManager';

export function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname === '/login';
  const isPublicPage = isLoginPage || pathname.startsWith('/social/share/');

  return (
    <AuthProvider>
      <PushManager />
      {isPublicPage ? (
        <>{children}</>
      ) : (
        <div className="min-h-screen">
          <BottomNav />
          <main className="pt-14 pb-20 px-4">{children}</main>
        </div>
      )}
    </AuthProvider>
  );
}
