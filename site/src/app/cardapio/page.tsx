'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Image from 'next/image';

// ─── Types ─────────────────────────────────────────────────
interface MenuItem {
  id: string;
  name: string;
  description?: string;
  price: number;
  image?: string;
}

interface MenuCategory {
  id: string;
  name: string;
  slug: string;
  items: MenuItem[];
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

/** Convert full image URL → WebP thumb URL served from /uploads/menu/thumbs/ */
function toThumbUrl(imageUrl: string): string {
  if (!imageUrl) return '';
  // e.g. https://api.marinaprizeclub.com/uploads/menu/aperol-spritz.jpg
  //   → https://api.marinaprizeclub.com/uploads/menu/thumbs/aperol-spritz.webp
  return imageUrl.replace(/\/uploads\/menu\/([^/]+)\.(jpg|jpeg|png)$/i, '/uploads/menu/thumbs/$1.webp');
}

// ─── Category Icons ────────────────────────────────────────
const categoryIcons: Record<string, string> = {
  'entradas': '🥗',
  'sugestoes-do-chef': '👨‍🍳',
  'grill': '🔥',
  'executivos': '🍽️',
  'petiscos': '🍤',
  'sobremesas': '🍫',
  'bebidas': '🥤',
  'gin-prize': '🍸',
  'prize-drinks': '🍹',
  'caips-tropicais': '🍋',
  'shots-e-doses': '🥃',
  'cervejas-long-neck-e-600ml': '🍺',
  'garrafas': '🍾',
  'combos': '🎉',
};

function getCatIcon(slug: string) {
  return categoryIcons[slug] || '🍴';
}

// ─── Theme helper ──────────────────────────────────────────
const theme = (dark: boolean) => ({
  bg: dark ? 'bg-[#060E18]' : 'bg-[#F8F9FB]',
  card: dark
    ? 'bg-white/[0.04] border-white/[0.06] hover:border-[#FF6B00]/30 hover:bg-white/[0.07]'
    : 'bg-white border-gray-100 shadow-sm hover:border-[#FF6B00]/40 hover:shadow-lg hover:shadow-black/5',
  cardText: dark ? 'text-white' : 'text-gray-900',
  cardSub: dark ? 'text-white/40' : 'text-gray-500',
  heroText: dark ? 'text-white' : 'text-gray-900',
  heroSub: dark ? 'text-white/40' : 'text-gray-500',
  navBg: dark ? 'bg-[#060E18]/90 border-white/[0.05]' : 'bg-white/90 border-gray-200/60',
  searchBg: dark
    ? 'bg-white/[0.05] border-white/[0.08] text-white placeholder:text-white/25'
    : 'bg-gray-100 border-gray-200 text-gray-900 placeholder:text-gray-400',
  searchIcon: dark ? 'text-white/30' : 'text-gray-400',
  tabActive: 'bg-[#FF6B00] text-white shadow-lg shadow-[#FF6B00]/25',
  tabInactive: dark
    ? 'bg-white/[0.04] text-white/50 hover:text-white/80 hover:bg-white/[0.08]'
    : 'bg-gray-100 text-gray-500 hover:text-gray-800 hover:bg-gray-200',
  tabCount: dark ? 'text-white/30' : 'text-gray-400',
  footerBorder: dark ? 'border-white/[0.05]' : 'border-gray-200',
  footerText: dark ? 'text-white' : 'text-gray-900',
  footerSub: dark ? 'text-white/30' : 'text-gray-400',
  footerMuted: dark ? 'text-white/20' : 'text-gray-300',
  footerLink: dark ? 'text-white/30 hover:text-[#FF6B00]' : 'text-gray-400 hover:text-[#FF6B00]',
  skeletonBg: dark ? 'bg-white/[0.03]' : 'bg-gray-100',
  skeletonLine: dark ? 'bg-white/[0.05]' : 'bg-gray-200',
  modalBg: dark ? 'bg-[#0D1B2A] border-white/10' : 'bg-white border-gray-200',
  modalText: dark ? 'text-white' : 'text-gray-900',
  modalSub: dark ? 'text-white/50' : 'text-gray-500',
  modalClose: dark ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700',
  modalGrad: dark ? 'from-[#0D1B2A]' : 'from-white',
  toggleBg: dark ? 'bg-white/10' : 'bg-gray-200',
  backLink: dark ? 'text-white/40 hover:text-white' : 'text-gray-400 hover:text-gray-700',
  imgPlaceholder: dark ? 'from-white/[0.02] to-white/[0.05]' : 'from-gray-50 to-gray-100',
  unavailBg: dark ? 'bg-black/60' : 'bg-white/80',
  searchClear: dark ? 'text-white/30 hover:text-white/60' : 'text-gray-400 hover:text-gray-600',
  ambientOrange: dark ? 'bg-[#FF6B00]/[0.03]' : 'bg-[#FF6B00]/[0.02]',
  ambientBlue: dark ? 'bg-[#1E3A5F]/[0.08]' : 'bg-[#1E3A5F]/[0.03]',
  shimmerFrom: dark ? 'from-white/[0.02]' : 'from-gray-100',
  shimmerVia: dark ? 'via-white/[0.08]' : 'via-gray-200',
  shimmerTo: dark ? 'to-white/[0.02]' : 'to-gray-100',
});

// ─── Item Card ─────────────────────────────────────────────
function MenuItemCard({ item, dark }: { item: MenuItem & { isAvailable?: boolean }; index?: number; dark: boolean }) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const c = theme(dark);
  const thumbSrc = item.image ? toThumbUrl(item.image) : '';

  return (
    <>
      <div
        onClick={() => setShowModal(true)}
        className={`group relative border rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 ${c.card}`}
      >
        <div className={`relative aspect-[4/3] overflow-hidden bg-gradient-to-br ${c.imgPlaceholder}`}>
          {thumbSrc ? (
            <>
              {!imgLoaded && (
                <div className={`absolute inset-0 bg-gradient-to-br ${c.imgPlaceholder}`} />
              )}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={thumbSrc}
                alt={item.name}
                loading="lazy"
                decoding="async"
                width={400}
                height={300}
                onLoad={() => setImgLoaded(true)}
                className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 group-hover:scale-105 ${imgLoaded ? 'opacity-100' : 'opacity-0'}`}
                style={{ transform: 'translateZ(0)' }}
              />
            </>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-4xl opacity-20">🍽️</div>
          )}
          <div className="absolute bottom-2 right-2 bg-[#FF6B00] text-white text-xs font-bold px-2.5 py-1 rounded-lg shadow-lg shadow-[#FF6B00]/30 z-10">
            R$ {item.price.toFixed(2).replace('.', ',')}
          </div>
        </div>

        <div className="p-3 sm:p-4">
          <h3 className={`font-bold text-sm sm:text-[15px] leading-tight line-clamp-2 group-hover:text-[#FF6B00] transition-colors ${c.cardText}`}>
            {item.name}
          </h3>
          {item.description && (
            <p className={`text-xs mt-1 line-clamp-2 leading-relaxed ${c.cardSub}`}>{item.description}</p>
          )}
        </div>

        {item.isAvailable === false && (
          <div className={`absolute inset-0 flex items-center justify-center backdrop-blur-sm rounded-2xl ${c.unavailBg}`}>
            <span className="text-white font-bold text-sm bg-red-500/90 px-4 py-2 rounded-xl shadow-lg">Indisponível</span>
          </div>
        )}
      </div>

      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md lightbox-enter"
          onClick={() => setShowModal(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            className={`border rounded-3xl overflow-hidden w-full max-w-lg shadow-2xl lightbox-img-enter ${c.modalBg}`}
          >
            {item.image && (
              <div className="relative aspect-[16/10] overflow-hidden bg-gray-900">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.image}
                  alt={item.name}
                  loading="lazy"
                  decoding="async"
                  className="absolute inset-0 w-full h-full object-cover"
                />
                <div className={`absolute inset-0 bg-gradient-to-t ${c.modalGrad} via-transparent to-transparent`} />
              </div>
            )}
            <div className="p-6 -mt-8 relative">
              <h2 className={`text-2xl font-black mb-2 ${c.modalText}`}>{item.name}</h2>
              {item.description && <p className={`text-sm leading-relaxed mb-4 ${c.modalSub}`}>{item.description}</p>}
              <div className="flex items-center justify-between">
                <span className="text-[#FF6B00] font-black text-2xl">
                  R$ {item.price.toFixed(2).replace('.', ',')}
                </span>
                <button
                  onClick={() => setShowModal(false)}
                  className={`px-5 py-2.5 text-sm font-semibold rounded-xl transition-colors ${c.modalClose}`}
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Main Page ─────────────────────────────────────────────
export default function CardapioPublicPage() {
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [activeCat, setActiveCat] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [dark, setDark] = useState(false);
  const [isScrolling, setIsScrolling] = useState(false);
  const tabsRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    // Always start in light mode

    fetch(`${API_URL}/menu/public`)
      .then(r => r.json())
      .then((data: MenuCategory[]) => {
        const active = data.filter(c => c.items.length > 0);
        setCategories(active);
        if (active.length > 0) setActiveCat(active[0].id);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Sync html/body background to prevent white flash on overscroll
  useEffect(() => {
    const bg = dark ? '#060E18' : '#F8F9FB';
    document.documentElement.style.backgroundColor = bg;
    document.body.style.backgroundColor = bg;
    return () => {
      document.documentElement.style.backgroundColor = '';
      document.body.style.backgroundColor = '';
    };
  }, [dark]);

  // Intersection observer to highlight active tab on scroll
  useEffect(() => {
    if (categories.length === 0 || isScrolling) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveCat(entry.target.id.replace('cat-', ''));
          }
        }
      },
      { rootMargin: '-120px 0px -60% 0px', threshold: 0 }
    );
    for (const cat of categories) {
      const el = sectionRefs.current[cat.id];
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [categories, isScrolling]);

  // Scroll active tab into view in the tab bar
  useEffect(() => {
    if (!tabsRef.current || !activeCat) return;
    const btn = tabsRef.current.querySelector(`[data-cat-id="${activeCat}"]`) as HTMLElement;
    if (btn) btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [activeCat]);

  const scrollToCategory = useCallback((catId: string) => {
    setActiveCat(catId);
    setIsScrolling(true);
    const el = sectionRefs.current[catId];
    if (el) {
      const top = el.getBoundingClientRect().top + window.scrollY - 120;
      window.scrollTo({ top, behavior: 'smooth' });
    }
    setTimeout(() => setIsScrolling(false), 800);
  }, []);

  const toggleTheme = () => {
    setDark(prev => {
      const next = !prev;
      localStorage.setItem('cardapio-theme', next ? 'dark' : 'light');
      return next;
    });
  };

  const totalItems = useMemo(() => categories.reduce((s, cc) => s + cc.items.length, 0), [categories]);
  const c = theme(dark);

  const searchResults = useMemo(() => {
    if (!search) return [];
    const q = search.toLowerCase();
    return categories.flatMap(cat =>
      cat.items.filter(i =>
        i.name.toLowerCase().includes(q) || (i.description && i.description.toLowerCase().includes(q))
      )
    );
  }, [categories, search]);

  return (
    <main className={`min-h-screen relative transition-colors duration-300 ${c.bg}`}>
      {/* Ambient blobs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className={`absolute -top-[40%] -left-[20%] w-[70%] h-[70%] rounded-full blur-[120px] ${c.ambientOrange}`} />
        <div className={`absolute -bottom-[30%] -right-[20%] w-[60%] h-[60%] rounded-full blur-[120px] ${c.ambientBlue}`} />
      </div>

      <div className="relative z-10">
        {/* Header */}
        <header>
          <div className="flex items-center justify-between px-4 sm:px-6 py-4">
            <a href="/" className="flex items-center gap-3 group">
              <Image src="/logo.png" alt="Prize Club" width={110} height={42} className="object-contain" />
              <div>
                <p className={`text-[10px] font-medium tracking-wider uppercase ${c.footerSub}`}>Gastrobar</p>
              </div>
            </a>
            <div className="flex items-center gap-3">
              <button
                onClick={toggleTheme}
                className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${c.toggleBg}`}
                title={dark ? 'Modo claro' : 'Modo escuro'}
              >
                {dark ? (
                  <svg className="w-4 h-4 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4 text-gray-600" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
                  </svg>
                )}
              </button>
              <a href="/gastronomia" className={`text-xs font-medium transition-colors flex items-center gap-1.5 ${c.backLink}`}>
                <span>← Voltar</span>
              </a>
            </div>
          </div>

          <div className="px-4 sm:px-6 pt-4 pb-6 sm:pt-8 sm:pb-10 max-w-4xl mx-auto text-center">
            <div style={{ animation: 'fadeInUp 0.6s ease-out both' }}>
              <p className="text-[#FF6B00] text-xs font-bold tracking-[0.25em] uppercase mb-3">Cardápio Digital</p>
              <h1 className={`text-3xl sm:text-4xl lg:text-5xl font-black leading-tight ${c.heroText}`}>
                O melhor da{' '}
                <span className="bg-gradient-to-r from-[#FF6B00] to-[#FF8C38] bg-clip-text text-transparent">gastronomia</span>
              </h1>
            </div>
          </div>
        </header>

        {/* Sticky nav */}
        <div className={`sticky top-0 z-40 backdrop-blur-xl border-b transition-colors duration-300 ${c.navBg}`}>
          <div className="max-w-6xl mx-auto">
            <div className="px-4 sm:px-6 pt-3 pb-2">
              <div className="relative max-w-md mx-auto">
                <svg className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 ${c.searchIcon}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  placeholder="Buscar no cardápio..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className={`w-full rounded-xl pl-10 pr-4 py-2.5 text-sm border focus:outline-none focus:ring-2 focus:ring-[#FF6B00]/30 focus:border-[#FF6B00]/30 transition-all ${c.searchBg}`}
                />
                {search && (
                  <button onClick={() => setSearch('')} className={`absolute right-3 top-1/2 -translate-y-1/2 transition-colors ${c.searchClear}`}>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            </div>

            {!search && (
              <div ref={tabsRef} className="flex gap-1 overflow-x-auto px-4 sm:px-6 pb-3 scrollbar-hide">
                {categories.map(cat => (
                  <button
                    key={cat.id}
                    data-cat-id={cat.id}
                    onClick={() => scrollToCategory(cat.id)}
                    className={`relative whitespace-nowrap px-3.5 py-2 rounded-xl text-xs font-semibold transition-all shrink-0 flex items-center gap-1.5 ${
                      activeCat === cat.id ? c.tabActive : c.tabInactive
                    }`}
                  >
                    <span className="text-sm">{getCatIcon(cat.slug)}</span>
                    {cat.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Items */}
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className={`rounded-2xl overflow-hidden animate-pulse ${c.skeletonBg}`}>
                  <div className={`aspect-[4/3] ${c.skeletonLine}`} />
                  <div className="p-4 space-y-2">
                    <div className={`h-4 rounded-lg w-3/4 ${c.skeletonLine}`} />
                    <div className={`h-3 rounded-lg w-1/2 ${c.skeletonBg}`} />
                  </div>
                </div>
              ))}
            </div>
          ) : search ? (
            searchResults.length === 0 ? (
              <div className="text-center py-20">
                <span className="text-5xl block mb-4">🔍</span>
                <p className={`text-lg ${c.heroSub}`}>Nenhum item encontrado para &quot;{search}&quot;</p>
              </div>
            ) : (
              <div>
                <p className={`text-sm mb-4 ${c.cardSub}`}>
                  {searchResults.length} {searchResults.length === 1 ? 'resultado' : 'resultados'}
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                  {searchResults.map((item, i) => (
                    <MenuItemCard key={item.id} item={item} index={i} dark={dark} />
                  ))}
                </div>
              </div>
            )
          ) : (
            <div className="space-y-10 sm:space-y-14">
              {categories.map(cat => (
                <div
                  key={cat.id}
                  id={`cat-${cat.id}`}
                  ref={el => { sectionRefs.current[cat.id] = el; }}
                >
                  <div className="flex items-center gap-2 mb-4 sm:mb-6">
                    <span className="text-xl">{getCatIcon(cat.slug)}</span>
                    <h2 className={`text-lg sm:text-xl font-bold ${c.heroText}`}>{cat.name}</h2>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                    {cat.items.map((item, i) => (
                      <MenuItemCard key={item.id} item={item} index={i} dark={dark} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className={`border-t py-8 text-center ${c.footerBorder}`}>
          <div className="flex items-center justify-center gap-3 mb-3">
            <Image src="/logo.png" alt="Prize Club" width={85} height={32} className="object-contain" />
            <div className="text-left">
              <p className={`font-bold text-xs ${c.footerText}`}>Prize Club</p>
              <p className={`text-[10px] ${c.footerSub}`}>Gastrobar & Marina</p>
            </div>
          </div>
          <p className={`text-xs ${c.footerMuted}`}>Cabo Frio, RJ · Todos os direitos reservados</p>
          <div className="flex items-center justify-center gap-4 mt-3">
            <a href="/" className={`text-xs transition-colors ${c.footerLink}`}>Site</a>
            <span className={c.footerMuted}>·</span>
            <a href="/gastronomia" className={`text-xs transition-colors ${c.footerLink}`}>Gastronomia</a>
          </div>
        </footer>
      </div>
    </main>
  );
}
