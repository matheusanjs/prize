'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Menu, X } from 'lucide-react';
import { clsx } from 'clsx';
import { AuthProvider } from '@/contexts/auth';
import { useTheme } from '@/contexts/theme';
import { Sidebar } from '@/components/layout/Sidebar';

function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { theme } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close drawer on route change
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  // Lock body scroll while drawer open (mobile)
  useEffect(() => {
    if (mobileOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
  }, [mobileOpen]);

  // Close on Escape
  useEffect(() => {
    if (!mobileOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setMobileOpen(false); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [mobileOpen]);

  return (
    <div className="min-h-screen bg-th-surface">
      {/* Mobile top bar */}
      <header className="md:hidden sticky top-0 z-40 flex items-center justify-between gap-3 px-4 h-14 bg-th-card/95 backdrop-blur border-b border-th">
        <button
          onClick={() => setMobileOpen(true)}
          aria-label="Abrir menu"
          className="p-2 -ml-2 rounded-lg text-th hover:bg-primary-500/10 active:scale-95 transition"
        >
          <Menu size={22} />
        </button>
        <Link href="/dashboard" className="flex items-center gap-2">
          <Image
            src="/logo.png"
            alt="Prize Club"
            width={120}
            height={40}
            priority
            className={clsx('h-7 w-auto', theme === 'dark' && 'brightness-0 invert')}
          />
        </Link>
        {/* Spacer to balance hamburger button width */}
        <div className="w-10" aria-hidden="true" />
      </header>

      {/* Backdrop */}
      <div
        onClick={() => setMobileOpen(false)}
        className={clsx(
          'fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden transition-opacity duration-200',
          mobileOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
        )}
        aria-hidden="true"
      />

      {/* Sidebar (slides on mobile, fixed on desktop) */}
      <Sidebar mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} />

      {/* Main content */}
      <main className="md:ml-64 p-4 sm:p-6 md:p-8 bg-th-surface min-h-[calc(100vh-3.5rem)] md:min-h-screen">
        {children}
      </main>
    </div>
  );
}

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
        <Shell>{children}</Shell>
      )}
    </AuthProvider>
  );
}
