'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef, useCallback } from 'react';
import { AuthProvider } from '@/contexts/auth';
import { BottomNav } from '@/components/layout/BottomNav';
import { PushManager } from '@/components/PushManager';
import { PushPermissionBanner } from '@/components/PushPermissionBanner';

export function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname === '/login';
  const isPublicPage = isLoginPage || pathname.startsWith('/social/share/');
  const mainRef = useRef<HTMLElement>(null);

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
    const obs = new MutationObserver(sync);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, [isPublicPage]);

  // Kill WKWebView bounce: clamp scroll at boundaries
  useEffect(() => {
    if (isPublicPage) return;
    const el = mainRef.current;
    if (!el) return;

    let startY = 0;

    const onTouchStart = (e: TouchEvent) => {
      startY = e.touches[0].pageY;
    };

    const onTouchMove = (e: TouchEvent) => {
      const y = e.touches[0].pageY;
      const dy = y - startY; // positive = pulling down, negative = pulling up
      const { scrollTop, scrollHeight, clientHeight } = el;

      const atTop = scrollTop <= 0 && dy > 0;
      const atBottom = scrollTop + clientHeight >= scrollHeight && dy < 0;

      if (atTop || atBottom) {
        e.preventDefault();
      }
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
    };
  }, [isPublicPage]);

  return (
    <AuthProvider>
      <PushManager />
      <PushPermissionBanner />
      {isPublicPage ? (
        <>{children}</>
      ) : (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'var(--nav-bg)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <BottomNav />
          <main
            ref={mainRef}
            className="flex-1 no-bounce"
            style={{ overflowY: 'auto', backgroundColor: 'var(--nav-bg)' }}
          >
            <div className="px-4 main-safe-top main-safe-bottom" style={{ backgroundColor: 'var(--bg)' }}>
              {children}
            </div>
          </main>
        </div>
      )}
    </AuthProvider>
  );
}
