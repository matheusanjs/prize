'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { AuthProvider } from '@/contexts/auth';
import { BottomNav } from '@/components/layout/BottomNav';
import { PushManager } from '@/components/PushManager';
import { PushPermissionBanner } from '@/components/PushPermissionBanner';

export function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname === '/login';
  const isPublicPage = isLoginPage || pathname.startsWith('/social/share/');

  // Sync html/body bg with theme to cover iOS safe-area gaps on all pages
  useEffect(() => {
    if (isPublicPage) return;
    const sync = () => {
      const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
      if (bg) {
        document.documentElement.style.backgroundColor = bg;
        document.body.style.backgroundColor = bg;
      }
    };
    sync();
    // Re-sync when theme toggles (class change on <html>)
    const obs = new MutationObserver(sync);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, [isPublicPage]);

  return (
    <AuthProvider>
      <PushManager />
      <PushPermissionBanner />
      {isPublicPage ? (
        <>{children}</>
      ) : (
        <div style={{ height: '100dvh', backgroundColor: 'var(--bg)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <BottomNav />
          <main
            className="px-4 flex-1 main-safe-padding"
            style={{
              overflowY: 'auto',
              WebkitOverflowScrolling: 'touch',
              overscrollBehavior: 'none',
            }}
          >{children}</main>
        </div>
      )}
    </AuthProvider>
  );
}
