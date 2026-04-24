'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef, useCallback } from 'react';
import { AuthProvider } from '@/contexts/auth';
import { BottomNav } from '@/components/layout/BottomNav';
import { PushManager } from '@/components/PushManager';
import { PushPermissionBanner } from '@/components/PushPermissionBanner';
import { ReservationReminderModal } from '@/components/ReservationReminderModal';

export function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname === '/login';
  const isPublicPage = isLoginPage || pathname === '/cadastro' || pathname.startsWith('/social/share/');
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
    let startX = 0;

    const onTouchStart = (e: TouchEvent) => {
      startY = e.touches[0].pageY;
      startX = e.touches[0].pageX;
    };

    const onTouchMove = (e: TouchEvent) => {
      const y = e.touches[0].pageY;
      const x = e.touches[0].pageX;
      const dy = y - startY; // positive = pulling down, negative = pulling up
      const dx = x - startX;

      // If swiping mostly horizontally, don't interfere (allow carousel swipes)
      if (Math.abs(dx) > Math.abs(dy)) return;

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
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'var(--bg)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <BottomNav />
          <ReservationReminderModal />
          <main
            ref={mainRef}
            className="flex-1 no-bounce"
            style={{ overflowY: 'auto', backgroundColor: 'var(--bg)' }}
          >
            <div className="px-4 main-safe-top">
              {children}
            </div>
            {/* Spacer to clear fixed nav — same bg as content */}
            <div className="nav-clearance" />
          </main>
        </div>
      )}
    </AuthProvider>
  );
}
