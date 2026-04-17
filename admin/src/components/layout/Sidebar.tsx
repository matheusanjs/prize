'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { clsx } from 'clsx';
import { useAuth } from '@/contexts/auth';
import { useTheme } from '@/contexts/theme';
import {
  LayoutDashboard, Ship, Calendar, Wallet,
  AlertTriangle, BarChart3, Sparkles, Fuel, Wrench, LogOut, Settings, Coins,
  Sun, Moon, HandCoins, Activity, UtensilsCrossed, ClipboardList, Monitor,
  ChefHat, ChevronRight, Anchor, ShoppingCart, MessageCircle, Users, Compass,
  Mail,
} from 'lucide-react';

type LIcon = React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
type NavItem = { label: string; href: string; icon: LIcon };
type NavGroup = { type: 'group'; label: string; icon: LIcon; children: NavItem[] };
type NavLink  = { type: 'link';  label: string; href: string; icon: LIcon };
type NavEntry = NavGroup | NavLink;

const navEntries: NavEntry[] = [
  { type: 'link', label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  {
    type: 'group', label: 'Marina', icon: Anchor,
    children: [
      { label: 'Reservas',     href: '/reservations', icon: Calendar },
      { label: 'Embarcações',  href: '/boats',        icon: Ship },
      { label: 'Venda Cotas',  href: '/share-sales',  icon: HandCoins },
      { label: 'Cotas',        href: '/shares',       icon: Coins },
      { label: 'Operações',    href: '/operations',   icon: Settings },
      { label: 'Marina KDS',   href: '/kds',          icon: Monitor },
      { label: 'Combustível',  href: '/fuel',         icon: Fuel },
      { label: 'Usos',         href: '/usos',         icon: Activity },
      { label: 'Manutenções',  href: '/maintenance',  icon: Wrench },
      { label: 'Avarias',      href: '/damages',      icon: AlertTriangle },
    ],
  },
  {
    type: 'group', label: 'Cozinha', icon: ChefHat,
    children: [
      { label: 'Pedidos',     href: '/pedidos',  icon: ClipboardList },
      { label: 'Cardápio',    href: '/cardapio', icon: UtensilsCrossed },
      { label: 'Cozinha KDS', href: '/cozinha',  icon: Monitor },
      { label: 'PDV',          href: '/pdv',      icon: ShoppingCart },
    ],
  },
  {
    type: 'group', label: 'Finanças', icon: Wallet,
    children: [
      { label: 'Financeiro',   href: '/finance',    icon: Wallet },
      { label: 'Inadimplência', href: '/delinquency', icon: AlertTriangle },
    ],
  },
  { type: 'link', label: 'Clientes',    href: '/clients',     icon: Users },
  { type: 'link', label: 'Relatórios', href: '/reports',    icon: BarChart3 },
  { type: 'link', label: 'IA Insights', href: '/ai-insights', icon: Sparkles },
  { type: 'link', label: 'Prize Social', href: '/social', icon: Compass },
  { type: 'link', label: 'WhatsApp',   href: '/whatsapp',    icon: MessageCircle },
  { type: 'link', label: 'E-mail',     href: '/email',       icon: Mail },
];

function isGroupActive(children: NavItem[], pathname: string) {
  return children.some(c => pathname === c.href || pathname.startsWith(c.href + '/'));
}

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    navEntries.reduce<Record<string, boolean>>((acc, entry) => {
      if (entry.type === 'group') {
        acc[entry.label] = isGroupActive(entry.children, pathname);
      }
      return acc;
    }, {})
  );

  useEffect(() => {
    navEntries.forEach(entry => {
      if (entry.type === 'group' && isGroupActive(entry.children, pathname)) {
        setOpenGroups(prev => ({ ...prev, [entry.label]: true }));
      }
    });
  }, [pathname]);

  const toggleGroup = (label: string) =>
    setOpenGroups(prev => ({ ...prev, [label]: !prev[label] }));

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-64 bg-th-card text-th flex flex-col z-50 border-r border-th">
      {/* Logo */}
      <div className="p-5 border-b border-th">
        <Link href="/dashboard" className="flex items-center gap-3">
          <Image src="/logo.png" alt="Prize Club" width={120} height={40} className={clsx('h-8 w-auto', theme === 'dark' && 'brightness-0 invert')} />
        </Link>
        <p className="text-[10px] text-th-muted font-medium tracking-widest uppercase mt-1.5">Painel Administrativo</p>
      </div>

      <nav className="flex-1 py-3 overflow-y-auto">
        <div className="px-4 mb-2 flex items-center justify-between">
          <p className="text-[10px] text-th-muted font-bold tracking-widest uppercase">Menu</p>
          <button
            onClick={toggleTheme}
            className="p-1.5 rounded-lg hover:bg-primary-500/10 transition text-th-muted hover:text-primary-500"
            title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
          >
            {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
          </button>
        </div>

        {navEntries.map(entry => {
          if (entry.type === 'link') {
            const isActive = pathname === entry.href;
            return (
              <Link
                key={entry.href}
                href={entry.href}
                className={clsx(
                  'flex items-center gap-3 px-5 py-2.5 mx-2 rounded-xl text-sm font-medium transition-all duration-200',
                  isActive
                    ? 'bg-primary-500/15 text-primary-500 dark:text-primary-400 shadow-sm shadow-primary-500/5'
                    : 'text-th-secondary hover:bg-primary-500/5 hover:text-th'
                )}
              >
                <entry.icon size={18} strokeWidth={isActive ? 2.5 : 1.5} />
                {entry.label}
                {isActive && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary-500" />}
              </Link>
            );
          }

          // Group
          const isOpen   = openGroups[entry.label] ?? false;
          const hasActive = isGroupActive(entry.children, pathname);

          return (
            <div key={entry.label} className="mx-2">
              <button
                onClick={() => toggleGroup(entry.label)}
                className={clsx(
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200',
                  hasActive
                    ? 'text-primary-500 dark:text-primary-400'
                    : 'text-th-secondary hover:bg-primary-500/5 hover:text-th'
                )}
              >
                <entry.icon size={18} strokeWidth={hasActive ? 2.5 : 1.5} />
                <span className="flex-1 text-left">{entry.label}</span>
                <ChevronRight
                  size={14}
                  className={clsx('transition-transform duration-200 text-th-muted', isOpen && 'rotate-90')}
                />
              </button>

              {isOpen && (
                <div className="ml-3 border-l border-th pl-1 mb-1">
                  {entry.children.map(child => {
                    const isChildActive = pathname === child.href || pathname.startsWith(child.href + '/');
                    return (
                      <Link
                        key={child.href}
                        href={child.href}
                        className={clsx(
                          'flex items-center gap-3 px-4 py-2 mx-1 rounded-xl text-sm font-medium transition-all duration-200',
                          isChildActive
                            ? 'bg-primary-500/15 text-primary-500 dark:text-primary-400 shadow-sm shadow-primary-500/5'
                            : 'text-th-secondary hover:bg-primary-500/5 hover:text-th'
                        )}
                      >
                        <child.icon size={15} strokeWidth={isChildActive ? 2.5 : 1.5} />
                        {child.label}
                        {isChildActive && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary-500" />}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="p-4 border-t border-th">
        <div className="flex items-center gap-3 bg-th-surface rounded-xl p-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary-500 to-orange-400 flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-primary-500/20">
            {user?.name?.charAt(0) || 'A'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-th truncate">{user?.name || 'Admin'}</p>
            <p className="text-[11px] text-th-muted truncate">{user?.email || ''}</p>
          </div>
          <button onClick={logout} className="p-2 hover:bg-red-500/10 rounded-lg transition text-th-muted hover:text-red-400" title="Sair">
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}
