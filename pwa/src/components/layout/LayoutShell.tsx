'use client';

import { usePathname } from 'next/navigation';
import { AuthProvider } from '@/contexts/auth';
import { BottomNav } from '@/components/layout/BottomNav';
import { PushManager } from '@/components/PushManager';
import { PushPermissionBanner } from '@/components/PushPermissionBanner';

export function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname === '/login';
  const isPublicPage = isLoginPage || pathname.startsWith('/social/share/');

  return (
    <AuthProvider>
      <PushManager />
      <PushPermissionBanner />
      {isPublicPage ? (
        <>{children}</>
      ) : (
        <div style={{ minHeight: '100dvh' }}>
          <BottomNav />
          <main className="pb-20 px-4" style={{ paddingTop: 'calc(3.5rem + env(safe-area-inset-top, 0px))', paddingBottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))' }}>{children}</main>
        </div>
      )}
    </AuthProvider>
  );
}
