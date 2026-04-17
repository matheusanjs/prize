'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { clsx } from 'clsx';
import { useAuth } from '@/contexts/auth';
import { Ship, Calendar, FileText, Fuel, Wrench, Settings, LogOut, ClipboardCheck, Sun, Moon, ShoppingBag, User, Compass, Home } from 'lucide-react';
import Image from 'next/image';
import { useState, useEffect } from 'react';

const clientNav = [
  { label: 'Início', href: '/boats', icon: Home },
  { label: 'Reservas', href: '/reservations', icon: Calendar },
  { label: 'Social', href: '/social', icon: Compass },
  { label: 'Faturas', href: '/invoices', icon: FileText },
  { label: 'Perfil', href: '/profile', icon: User },
];

const operatorNav = [
  { label: 'Combustível', href: '/fuel', icon: Fuel },
  { label: 'Operações', href: '/operations', icon: Settings },
  { label: 'Manutenção', href: '/maintenance', icon: Wrench },
  { label: 'Perfil', href: '/profile', icon: User },
];

export function BottomNav() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    setIsDark(!document.documentElement.classList.contains('light'));
  }, []);

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    if (next) {
      document.documentElement.classList.remove('light');
      localStorage.setItem('pwa_theme', 'dark');
    } else {
      document.documentElement.classList.add('light');
      localStorage.setItem('pwa_theme', 'light');
    }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', next ? '#0D1B2A' : '#F4F9F9');
  };

  if (!user) return null;

  const items = user.role === 'OPERATOR' ? operatorNav : clientNav;

  return (
    <>
      {/* Top header — bg extends behind status bar via before pseudo-element */}
      <header
        className="border-b border-[var(--border)] px-4 py-2.5 flex items-center justify-between"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 9999,
          paddingTop: 'calc(env(safe-area-inset-top, 0px) + 10px)',
          backgroundColor: 'var(--header-bg)',
        }}
      >
        <Link href="/boats">
          <Image src="/logo.png" alt="Prize Club" width={90} height={34} className="h-7 w-auto brightness-0 invert light:brightness-100 light:invert-0" style={{ filter: isDark ? 'brightness(0) invert(1)' : 'none' }} />
        </Link>
        <div className="flex items-center gap-2">
          <button onClick={toggleTheme} className="p-1.5 rounded-lg bg-[var(--subtle)] text-[var(--text-secondary)] hover:bg-[var(--subtle-hover)] transition">
            {isDark ? <Sun size={14} /> : <Moon size={14} />}
          </button>
          <button onClick={logout} className="p-1.5 hover:bg-[var(--subtle-hover)] rounded-lg transition">
            <LogOut size={14} className="text-[var(--text-muted)]" />
          </button>
        </div>
      </header>

      {/* Bottom navigation — menu sits ABOVE safe area, safe area is just bg fill */}
      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 9999,
        }}
      >
        <nav
          className="border-t border-[var(--nav-border)]"
          style={{ backgroundColor: 'var(--nav-bg)' }}
        >
          <div className="flex items-center justify-evenly py-2.5 px-1">
            {items.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={clsx(
                    'relative flex flex-col items-center gap-0.5 px-3.5 py-1 rounded-lg transition-colors min-w-[68px]',
                    isActive ? 'text-primary-500' : 'text-[var(--text-muted)]'
                  )}
                >
                  {isActive && (
                    <span className="absolute -top-[11px] left-1/2 -translate-x-1/2 w-14 h-1 rounded-full bg-primary-500" />
                  )}
                  <item.icon size={22} strokeWidth={isActive ? 2.5 : 1.5} />
                  <span className={clsx('text-[10px]', isActive ? 'font-semibold' : 'font-medium')}>
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </div>
        </nav>
        {/* Safe area fill below the menu */}
        <div style={{ height: 'env(safe-area-inset-bottom, 0px)', backgroundColor: 'var(--nav-bg)' }} />
      </div>
    </>
  );
}
