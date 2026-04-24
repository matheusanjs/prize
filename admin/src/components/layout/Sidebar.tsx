'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useState, useEffect, useMemo } from 'react';
import { clsx } from 'clsx';
import { useAuth } from '@/contexts/auth';
import { useTheme } from '@/contexts/theme';
import {
  LayoutDashboard, Ship, Calendar, Wallet,
  AlertTriangle, BarChart3, Sparkles, Fuel, Wrench, LogOut, Coins,
  Sun, Moon, HandCoins, Activity, UtensilsCrossed, ClipboardList, Monitor,
  ChefHat, ChevronRight, Anchor, ShoppingCart, MessageCircle, Users, Compass,
  Mail, Bell, Search, SlidersHorizontal, FileBarChart, Receipt, Megaphone, X,
} from 'lucide-react';

type LIcon = React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
type NavLeaf  = { type: 'link'; label: string; href: string; icon: LIcon; badge?: string };
type ChildLeaf = { label: string; href: string; icon: LIcon; badge?: string };
type NavGroup = { type: 'group'; label: string; icon: LIcon; children: ChildLeaf[] };
type NavEntry = NavGroup | NavLeaf;
type Section  = { id: string; label: string; entries: NavEntry[] };

const sections: Section[] = [
  {
    id: 'overview',
    label: 'Visão Geral',
    entries: [
      { type: 'link', label: 'Dashboard',   href: '/dashboard',   icon: LayoutDashboard },
      { type: 'link', label: 'IA Insights', href: '/ai-insights', icon: Sparkles },
    ],
  },
  {
    id: 'operations',
    label: 'Operação',
    entries: [
      {
        type: 'group', label: 'Marina', icon: Anchor,
        children: [
          { label: 'Reservas',     href: '/reservations', icon: Calendar },
          { label: 'Embarcações',  href: '/boats',        icon: Ship },
          { label: 'Operações',    href: '/operations',   icon: SlidersHorizontal },
          { label: 'Combustível',  href: '/fuel',         icon: Fuel },
          { label: 'Usos',         href: '/usos',         icon: Activity },
          { label: 'Manutenções',  href: '/maintenance',  icon: Wrench },
          { label: 'Avarias',      href: '/damages',      icon: AlertTriangle },
          { label: 'KDS Marina',   href: '/kds',          icon: Monitor },
        ],
      },
      {
        type: 'group', label: 'Cotas', icon: Coins,
        children: [
          { label: 'Cotas',         href: '/shares',      icon: Coins },
          { label: 'Venda de Cotas', href: '/share-sales', icon: HandCoins },
        ],
      },
      {
        type: 'group', label: 'Restaurante', icon: ChefHat,
        children: [
          { label: 'Pedidos',     href: '/pedidos',  icon: ClipboardList },
          { label: 'Cardápio',    href: '/cardapio', icon: UtensilsCrossed },
          { label: 'PDV',         href: '/pdv',      icon: ShoppingCart },
          { label: 'KDS Cozinha', href: '/cozinha',  icon: Monitor },
        ],
      },
    ],
  },
  {
    id: 'finance',
    label: 'Financeiro',
    entries: [
      { type: 'link', label: 'Financeiro',   href: '/finance',     icon: Receipt },
      { type: 'link', label: 'Inadimplência', href: '/delinquency', icon: AlertTriangle },
    ],
  },
  {
    id: 'people',
    label: 'Pessoas',
    entries: [
      { type: 'link', label: 'Clientes',     href: '/clients', icon: Users },
      { type: 'link', label: 'Prize Social', href: '/social',  icon: Compass },
    ],
  },
  {
    id: 'reports',
    label: 'Relatórios',
    entries: [
      {
        type: 'group', label: 'Relatórios', icon: BarChart3,
        children: [
          { label: 'Financeiro',  href: '/reports/finance',      icon: Wallet },
          { label: 'Reservas',    href: '/reports/reservations', icon: Calendar },
          { label: 'Combustível', href: '/reports/fuel',         icon: Fuel },
          { label: 'Embarcações', href: '/reports/boats',        icon: Ship },
          { label: 'Manutenção',  href: '/reports/maintenance',  icon: Wrench },
          { label: 'Operações',   href: '/reports/operations',   icon: Activity },
          { label: 'Restaurante', href: '/reports/restaurant',   icon: UtensilsCrossed },
          { label: 'Clientes',    href: '/reports/clients',      icon: Users },
          { label: 'Abastec. Pendentes', href: '/reports/pending-fuel', icon: Fuel },
        ],
      },
    ],
  },
  {
    id: 'comms',
    label: 'Comunicação',
    entries: [
      { type: 'link', label: 'Notificações', href: '/notifications', icon: Bell },
      { type: 'link', label: 'WhatsApp',     href: '/whatsapp',      icon: MessageCircle },
      { type: 'link', label: 'E-mail',       href: '/email',         icon: Mail },
    ],
  },
];

function isLinkActive(href: string, pathname: string) {
  return pathname === href || pathname.startsWith(href + '/');
}
function isGroupActive(children: ChildLeaf[], pathname: string) {
  return children.some(c => isLinkActive(c.href, pathname));
}

export function Sidebar({ mobileOpen = false, onCloseMobile }: { mobileOpen?: boolean; onCloseMobile?: () => void } = {}) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [query, setQuery] = useState('');

  const closeMobile = () => onCloseMobile?.();

  // Auto-open the group that contains the active route
  const initialOpen = useMemo(() => {
    const acc: Record<string, boolean> = {};
    sections.forEach(s => s.entries.forEach(e => {
      if (e.type === 'group') acc[e.label] = isGroupActive(e.children, pathname);
    }));
    return acc;
  }, [pathname]);

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(initialOpen);
  useEffect(() => {
    sections.forEach(s => s.entries.forEach(e => {
      if (e.type === 'group' && isGroupActive(e.children, pathname)) {
        setOpenGroups(prev => ({ ...prev, [e.label]: true }));
      }
    }));
  }, [pathname]);

  const toggleGroup = (label: string) =>
    setOpenGroups(prev => ({ ...prev, [label]: !prev[label] }));

  const q = query.trim().toLowerCase();
  const filteredSections: Section[] = useMemo(() => {
    if (!q) return sections;
    return sections
      .map(sec => {
        const entries: NavEntry[] = [];
        for (const e of sec.entries) {
          if (e.type === 'link') {
            if (e.label.toLowerCase().includes(q)) entries.push(e);
          } else {
            const matches = e.children.filter(c => c.label.toLowerCase().includes(q));
            if (e.label.toLowerCase().includes(q)) entries.push(e);
            else if (matches.length) entries.push({ ...e, children: matches });
          }
        }
        return { ...sec, entries };
      })
      .filter(sec => sec.entries.length > 0);
  }, [q]);

  return (
    <aside
      className={clsx(
        'fixed left-0 top-0 bottom-0 w-72 md:w-64 bg-th-card text-th flex flex-col z-50 border-r border-th',
        'transform transition-transform duration-300 ease-out will-change-transform',
        'md:translate-x-0 md:shadow-none',
        mobileOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full',
      )}
      aria-hidden={!mobileOpen ? undefined : false}
    >
      {/* Brand */}
      <div className="px-5 pt-5 pb-3 border-b border-th">
        <div className="flex items-center justify-between gap-2">
          <Link href="/dashboard" onClick={closeMobile} className="flex items-center gap-3 min-w-0">
            <Image
              src="/logo.png"
              alt="Prize Club"
              width={120}
              height={40}
              className={clsx('h-8 w-auto', theme === 'dark' && 'brightness-0 invert')}
            />
          </Link>
          <button
            onClick={closeMobile}
            aria-label="Fechar menu"
            className="md:hidden p-1.5 rounded-lg text-th-muted hover:text-th hover:bg-primary-500/10 transition"
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex items-center justify-between mt-2">
          <p className="text-[10px] text-th-muted font-bold tracking-[0.18em] uppercase">
            Painel Admin
          </p>
          <button
            onClick={toggleTheme}
            className="p-1.5 rounded-lg hover:bg-primary-500/10 transition text-th-muted hover:text-primary-500"
            title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
          >
            {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="px-4 pt-3">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-th-muted" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar no menu..."
            className="w-full pl-8 pr-3 py-2 text-xs rounded-lg bg-th-surface border border-th focus:border-primary-500 focus:ring-1 focus:ring-primary-500/40 outline-none transition placeholder:text-th-muted"
          />
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 px-1 overflow-y-auto custom-scroll">
        {filteredSections.length === 0 && (
          <div className="px-5 py-6 text-xs text-th-muted text-center">
            Nada encontrado para “{query}”.
          </div>
        )}

        {filteredSections.map((section, idx) => (
          <div key={section.id} className={clsx(idx > 0 && 'mt-3')}>
            <div className="px-5 mb-1.5 flex items-center gap-2">
              <p className="text-[10px] text-th-muted font-bold tracking-[0.18em] uppercase">
                {section.label}
              </p>
              <div className="flex-1 h-px bg-th opacity-40" />
            </div>

            {section.entries.map(entry => {
              if (entry.type === 'link') {
                const active = isLinkActive(entry.href, pathname);
                return (
                  <Link
                    key={entry.href}
                    href={entry.href}
                    onClick={closeMobile}
                    className={clsx(
                      'flex items-center gap-3 px-4 py-2 mx-2 rounded-xl text-sm font-medium transition-all duration-200',
                      active
                        ? 'bg-primary-500/15 text-primary-500 dark:text-primary-400 shadow-sm shadow-primary-500/5'
                        : 'text-th-secondary hover:bg-primary-500/5 hover:text-th'
                    )}
                  >
                    <entry.icon size={17} strokeWidth={active ? 2.5 : 1.6} />
                    <span className="flex-1">{entry.label}</span>
                    {entry.badge && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-primary-500/15 text-primary-500">
                        {entry.badge}
                      </span>
                    )}
                    {active && <div className="w-1.5 h-1.5 rounded-full bg-primary-500" />}
                  </Link>
                );
              }

              const isOpen   = openGroups[entry.label] ?? !!q;
              const hasActive = isGroupActive(entry.children, pathname);
              return (
                <div key={entry.label} className="mx-2">
                  <button
                    onClick={() => toggleGroup(entry.label)}
                    className={clsx(
                      'w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200',
                      hasActive
                        ? 'text-primary-500 dark:text-primary-400'
                        : 'text-th-secondary hover:bg-primary-500/5 hover:text-th'
                    )}
                  >
                    <entry.icon size={17} strokeWidth={hasActive ? 2.5 : 1.6} />
                    <span className="flex-1 text-left">{entry.label}</span>
                    <span className="text-[10px] text-th-muted font-semibold">
                      {entry.children.length}
                    </span>
                    <ChevronRight
                      size={13}
                      className={clsx(
                        'transition-transform duration-200 text-th-muted',
                        isOpen && 'rotate-90'
                      )}
                    />
                  </button>

                  {isOpen && (
                    <div className="ml-4 border-l border-th pl-1 mt-0.5 mb-1">
                      {entry.children.map(child => {
                        const active = isLinkActive(child.href, pathname);
                        return (
                          <Link
                            key={child.href}
                            href={child.href}
                            onClick={closeMobile}
                            className={clsx(
                              'flex items-center gap-3 px-3 py-1.5 mx-1 rounded-lg text-[13px] font-medium transition-all duration-200',
                              active
                                ? 'bg-primary-500/15 text-primary-500 dark:text-primary-400'
                                : 'text-th-secondary hover:bg-primary-500/5 hover:text-th'
                            )}
                          >
                            <child.icon size={14} strokeWidth={active ? 2.5 : 1.6} />
                            <span className="flex-1">{child.label}</span>
                            {active && <div className="w-1.5 h-1.5 rounded-full bg-primary-500" />}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Footer / user */}
      <div className="p-3 border-t border-th">
        <div className="flex items-center gap-3 bg-th-surface rounded-xl p-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary-500 to-orange-400 flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-primary-500/20">
            {user?.name?.charAt(0) || 'A'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-th truncate">{user?.name || 'Admin'}</p>
            <p className="text-[11px] text-th-muted truncate">{user?.email || ''}</p>
          </div>
          <button
            onClick={logout}
            className="p-2 hover:bg-red-500/10 rounded-lg transition text-th-muted hover:text-red-400"
            title="Sair"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}
