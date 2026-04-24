'use client';

import { useEffect, useState, useCallback, useRef, useMemo, memo } from 'react';
import {
  ShoppingBag, Plus, Minus, ChevronRight, ChevronLeft,
  QrCode, Copy, CheckCircle2, Loader2, ShoppingCart, AlertCircle, X, Sparkles,
} from 'lucide-react';
import { useAuth } from '@/contexts/auth';
import { useRouter } from 'next/navigation';
import { getConvenienceItems, createConvenienceOrder, getWooviChargeStatus } from '@/services/api';

// Category emoji map
const CAT_ICONS: Record<string, string> = {
  'entradas': '🥗', 'sugestoes-do-chef': '👨‍🍳', 'grill': '🔥', 'executivos': '🍽️',
  'petiscos': '🍤', 'sobremesas': '🍫', 'bebidas': '🥤', 'gin-prize': '🍸',
  'prize-drinks': '🍹', 'caips-tropicais': '🍋', 'shots-e-doses': '🥃',
  'cervejas-long-neck-e-600ml': '🍺', 'garrafas': '🍾', 'combos': '🎉',
  'conveniencia': '🛒', 'conveniência': '🛒', 'lanches': '🥪', 'doces': '🍬',
};
function getCatIcon(slug: string) { return CAT_ICONS[slug] || '🛍️'; }

// Item card matching site cardapio design
const ItemCard = memo(function ItemCard({ item, qty, onAdd, onRemove }: {
  item: ConvenienceItem; qty: number; onAdd: () => void; onRemove: () => void;
}) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const thumb = toThumbUrl(item.image);
  return (
    <div className="group relative bg-white/[0.04] border border-white/[0.06] hover:border-orange-500/40 hover:bg-white/[0.07] rounded-2xl overflow-hidden transition-all duration-200">
      <div className="relative aspect-[4/3] overflow-hidden bg-gradient-to-br from-white/[0.02] to-white/[0.05]">
        {thumb ? (
          <>
            {!imgLoaded && <div className="absolute inset-0 bg-white/[0.03] animate-pulse" />}
            <img src={thumb} alt={item.name} loading="lazy" decoding="async"
              onLoad={() => setImgLoaded(true)}
              className={`absolute inset-0 w-full h-full object-cover transition-all duration-300 group-hover:scale-105 ${imgLoaded ? 'opacity-100' : 'opacity-0'}`}
            />
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-3xl opacity-20">🛍️</div>
        )}
        <div className="absolute bottom-2 right-2 bg-orange-500 text-white text-xs font-bold px-2 py-1 rounded-lg shadow-lg shadow-orange-500/30 z-10">
          R$ {item.price.toFixed(2).replace('.', ',')}
        </div>
      </div>
      <div className="p-3">
        <h3 className="font-bold text-sm text-[var(--text)] leading-tight line-clamp-2 group-hover:text-orange-400 transition-colors">{item.name}</h3>
        {item.description && <p className="text-xs text-[var(--text-muted)] mt-1 line-clamp-2 leading-relaxed">{item.description}</p>}
      </div>
      <div className="px-3 pb-3">
        {qty === 0 ? (
          <button onClick={onAdd} className="w-full py-2 rounded-xl bg-orange-500 hover:bg-orange-400 active:scale-95 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-lg shadow-orange-500/20">
            <Plus size={13} /> Adicionar
          </button>
        ) : (
          <div className="flex items-center justify-between bg-[var(--subtle)] rounded-xl px-2 py-1.5">
            <button onClick={onRemove} className="w-7 h-7 rounded-lg bg-[var(--card)] flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text)] transition"><Minus size={12} /></button>
            <span className="text-sm font-black text-orange-500">{qty}</span>
            <button onClick={onAdd} className="w-7 h-7 rounded-lg bg-orange-500 flex items-center justify-center text-white hover:bg-orange-400 transition"><Plus size={12} /></button>
          </div>
        )}
      </div>
    </div>
  );
});

const API_ORIGIN = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1').replace(/\/api\/v\d+$/, '');

function toThumbUrl(url: string | undefined | null): string {
  if (!url) return '';
  const full = url.startsWith('http') ? url : `${API_ORIGIN}${url}`;
  return full.replace(/\/uploads\/menu\/([^/]+)\.(jpg|jpeg|png|webp)$/i, '/uploads/menu/thumbs/$1.webp');
}

interface ConvenienceItem {
  id: string; name: string; description?: string; price: number; image?: string;
  category: { id: string; name: string; slug: string };
}
interface CartEntry { item: ConvenienceItem; quantity: number; }
type Step = 'browse' | 'review' | 'payment' | 'pix' | 'done';

// ─── Main page ────────────────────────────────────────────
export default function ConvenientePage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  const [items, setItems] = useState<ConvenienceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cart, setCart] = useState<CartEntry[]>([]);
  const [step, setStep] = useState<Step>('browse');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // PIX state
  const [pixData, setPixData] = useState<{ qrCode: string; brCode: string; correlationID: string } | null>(null);
  const [copiedPix, setCopiedPix] = useState(false);
  const [pixStatus, setPixStatus] = useState<'waiting' | 'confirmed'>('waiting');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Done state
  const [orderNumber, setOrderNumber] = useState<number | null>(null);
  const [paidWithPix, setPaidWithPix] = useState(false);

  useEffect(() => {
    if (!isLoading && !user) router.replace('/login');
  }, [user, isLoading, router]);

  const load = useCallback(async () => {
    try {
      setLoading(true); setError('');
      const { data } = await getConvenienceItems();
      setItems(Array.isArray(data) ? data : []);
    } catch { setError('Não foi possível carregar os produtos.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  // ─── Cart ─────────────────────────────────────────────────
  const addToCart = useCallback((item: ConvenienceItem) => {
    setCart(prev => {
      const ex = prev.find(c => c.item.id === item.id);
      if (ex) return prev.map(c => c.item.id === item.id ? { ...c, quantity: c.quantity + 1 } : c);
      return [...prev, { item, quantity: 1 }];
    });
  }, []);
  const removeFromCart = useCallback((id: string) => {
    setCart(prev => {
      const ex = prev.find(c => c.item.id === id);
      if (!ex) return prev;
      if (ex.quantity === 1) return prev.filter(c => c.item.id !== id);
      return prev.map(c => c.item.id === id ? { ...c, quantity: c.quantity - 1 } : c);
    });
  }, []);
  const deleteFromCart = useCallback((id: string) => { setCart(prev => prev.filter(c => c.item.id !== id)); }, []);
  const cartCount = useMemo(() => cart.reduce((s, c) => s + c.quantity, 0), [cart]);
  const cartTotal = useMemo(() => cart.reduce((s, c) => s + c.item.price * c.quantity, 0), [cart]);
  const itemQty = useCallback((id: string) => cart.find(c => c.item.id === id)?.quantity ?? 0, [cart]);

  // ─── Groups ───────────────────────────────────────────────
  const groups = useMemo(() => Object.values(
    items.reduce<Record<string, { catId: string; catName: string; slug: string; catItems: ConvenienceItem[] }>>((acc, item) => {
      const k = item.category.id;
      if (!acc[k]) acc[k] = { catId: k, catName: item.category.name, slug: item.category.slug || '', catItems: [] };
      acc[k].catItems.push(item);
      return acc;
    }, {})
  ), [items]);

  // ─── PIX polling ─────────────────────────────────────────
  function startPolling(correlationID: string) {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const { data } = await getWooviChargeStatus(correlationID);
        if (data?.charge?.status === 'COMPLETED') {
          clearInterval(pollRef.current!); pollRef.current = null;
          setPixStatus('confirmed');
        }
      } catch { /* keep polling */ }
    }, 5000);
  }

  // ─── Submit ───────────────────────────────────────────────
  async function submitOrder(paymentMethod: 'PIX' | 'PICKUP') {
    setSubmitting(true);
    try {
      const { data } = await createConvenienceOrder({
        items: cart.map(c => ({ menuItemId: c.item.id, quantity: c.quantity })),
        notes: notes.trim() || undefined,
        paymentMethod,
      });
      setOrderNumber(data.order?.number ?? null);
      if (paymentMethod === 'PIX' && data.pix?.brCode) {
        const correlationID = `appco-${data.order.id}`;
        setPixData({ qrCode: data.pix.qrCode || '', brCode: data.pix.brCode, correlationID });
        setPixStatus('waiting');
        setStep('pix');
        startPolling(correlationID);
      } else {
        setPaidWithPix(false);
        setStep('done');
      }
    } catch (e: any) {
      alert(e.response?.data?.message || 'Erro ao criar pedido. Tente novamente.');
    } finally { setSubmitting(false); }
  }

  async function copyPix() {
    if (!pixData?.brCode) return;
    try { await navigator.clipboard.writeText(pixData.brCode); setCopiedPix(true); setTimeout(() => setCopiedPix(false), 3000); }
    catch { /* empty */ }
  }

  function handlePixDone() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    setPaidWithPix(pixStatus === 'confirmed');
    setStep('done');
  }

  function resetFlow() {
    setCart([]); setNotes(''); setPixData(null); setPixStatus('waiting');
    setCopiedPix(false); setPaidWithPix(false); setStep('browse');
  }

  // ─── Auth guard ───────────────────────────────────────────
  if (!user || isLoading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 size={28} className="animate-spin text-orange-500" />
    </div>
  );

  // ═══════════════════════════════════════════════════════════
  // STEP: PIX — QR Code + polling
  // ═══════════════════════════════════════════════════════════
  if (step === 'pix') {
    return (
      <div className="max-w-md mx-auto py-6 px-4">
        {pixStatus === 'confirmed' ? (
          <div className="text-center py-8">
            <div className="relative w-20 h-20 mx-auto mb-5">
              <div className="absolute inset-0 rounded-full bg-green-500/20 animate-ping" />
              <div className="relative w-20 h-20 rounded-full bg-green-500/15 border border-green-500/30 flex items-center justify-center">
                <Sparkles size={36} className="text-green-400" />
              </div>
            </div>
            <h2 className="text-2xl font-black text-[var(--text)] mb-2">Pagamento confirmado!</h2>
            <p className="text-sm text-[var(--text-muted)] mb-6">Pedido #{orderNumber} pago com sucesso.</p>
            <button onClick={handlePixDone} className="w-full py-3.5 rounded-2xl bg-green-500 hover:bg-green-400 text-white font-bold transition">
              Ver resumo do pedido
            </button>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-orange-500/15 flex items-center justify-center shrink-0">
                <QrCode size={18} className="text-orange-500" />
              </div>
              <div>
                <h2 className="font-black text-[var(--text)]">Pague com Pix</h2>
                <p className="text-xs text-[var(--text-muted)]">Pedido #{orderNumber} · R$ {cartTotal.toFixed(2).replace('.', ',')}</p>
              </div>
            </div>

            {/* QR Code box */}
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 mb-4 text-center">
              {pixData?.qrCode ? (
                <div className="flex justify-center mb-4">
                  <div className="bg-white p-3 rounded-xl inline-block shadow-lg">
                    <img src={`data:image/png;base64,${pixData.qrCode}`} alt="QR Code Pix" className="w-48 h-48" />
                  </div>
                </div>
              ) : (
                <div className="w-48 h-48 mx-auto bg-[var(--subtle)] rounded-xl flex items-center justify-center mb-4">
                  <Loader2 size={28} className="animate-spin text-[var(--text-muted)]" />
                </div>
              )}
              <p className="text-xs text-[var(--text-muted)] mb-3">Abra seu banco e escaneie o QR Code ou copie o código abaixo</p>
              <button
                onClick={copyPix}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-[var(--border)] bg-[var(--subtle)] hover:bg-[var(--card)] text-[var(--text)] text-sm font-semibold transition"
              >
                {copiedPix ? <><CheckCircle2 size={15} className="text-green-500" /> Copiado!</> : <><Copy size={15} /> Copiar código Pix</>}
              </button>
            </div>

            {/* Status pill */}
            <div className="flex items-center gap-3 bg-orange-500/10 border border-orange-500/20 rounded-2xl px-4 py-3 mb-4">
              <Loader2 size={16} className="animate-spin text-orange-400 shrink-0" />
              <p className="text-sm text-orange-300 font-medium">Aguardando confirmação do pagamento…</p>
            </div>

            <p className="text-center text-xs text-[var(--text-muted)] mb-4">
              O pedido é confirmado automaticamente após o pagamento
            </p>

            <button
              onClick={handlePixDone}
              className="w-full py-2.5 rounded-xl text-[var(--text-muted)] text-xs hover:text-[var(--text)] transition border border-[var(--border)]"
            >
              Já paguei, ver pedido →
            </button>
          </>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // STEP: DONE
  // ═══════════════════════════════════════════════════════════
  if (step === 'done') {
    return (
      <div className="max-w-md mx-auto py-8 px-4 text-center">
        <div className="w-16 h-16 rounded-full bg-green-500/15 border border-green-500/20 flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 size={32} className="text-green-500" />
        </div>
        <h2 className="text-xl font-black text-[var(--text)] mb-1">Pedido #{orderNumber} realizado!</h2>
        <p className="text-sm text-[var(--text-muted)] mb-6">
          {paidWithPix ? 'Pagamento confirmado. Retire no balcão.' : 'Apresente-se ao balcão para retirar e efetuar o pagamento.'}
        </p>
        <div className={`rounded-2xl p-4 mb-6 text-left border ${paidWithPix ? 'bg-green-500/10 border-green-500/20' : 'bg-orange-500/10 border-orange-500/20'}`}>
          <p className={`font-bold text-sm mb-1 ${paidWithPix ? 'text-green-400' : 'text-orange-400'}`}>
            {paidWithPix ? '✅ Pago com Pix' : '🛒 Retirada no balcão'}
          </p>
          <p className="text-xs text-[var(--text-muted)]">
            Pedido <strong className="text-[var(--text)]">#{orderNumber}</strong>
            {paidWithPix ? ' — confirmado, retire no balcão.' : ' — informe ao atendente ao retirar.'}
          </p>
        </div>
        <button onClick={resetFlow} className="w-full py-3.5 rounded-2xl bg-orange-500 hover:bg-orange-400 text-white font-bold transition mb-2 shadow-lg shadow-orange-500/20">
          Novo pedido
        </button>
        <button onClick={() => router.push('/boats')} className="w-full py-2.5 text-[var(--text-muted)] text-sm hover:text-[var(--text)] transition">
          Voltar ao início
        </button>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // STEP: PAYMENT
  // ═══════════════════════════════════════════════════════════
  if (step === 'payment') {
    return (
      <div className="max-w-md mx-auto py-6 px-4">
        <button onClick={() => setStep('review')} className="flex items-center gap-1 text-sm text-[var(--text-muted)] hover:text-[var(--text)] mb-5 transition">
          <ChevronLeft size={16} /> Voltar
        </button>
        <h2 className="text-lg font-black text-[var(--text)] mb-1">Como deseja pagar?</h2>
        <p className="text-sm text-[var(--text-muted)] mb-6">Total: <strong className="text-orange-500">R$ {cartTotal.toFixed(2).replace('.', ',')}</strong></p>
        <div className="space-y-3">
          <button onClick={() => submitOrder('PIX')} disabled={submitting}
            className="w-full py-4 rounded-2xl bg-[var(--card)] border border-[var(--border)] hover:border-green-500/40 hover:bg-green-500/5 transition flex items-center gap-4 px-5 disabled:opacity-50 group">
            {submitting ? <Loader2 size={20} className="animate-spin text-green-500 shrink-0" />
              : <div className="w-10 h-10 rounded-xl bg-green-500/15 flex items-center justify-center shrink-0 group-hover:bg-green-500/25 transition"><QrCode size={20} className="text-green-500" /></div>}
            <div className="text-left flex-1">
              <p className="font-bold text-[var(--text)] text-sm">Pagar agora com Pix</p>
              <p className="text-xs text-[var(--text-muted)]">QR Code — confirmação instantânea</p>
            </div>
            <ChevronRight size={16} className="text-[var(--text-muted)] shrink-0" />
          </button>
          <button onClick={() => submitOrder('PICKUP')} disabled={submitting}
            className="w-full py-4 rounded-2xl bg-[var(--card)] border border-[var(--border)] hover:border-orange-500/40 hover:bg-orange-500/5 transition flex items-center gap-4 px-5 disabled:opacity-50 group">
            {submitting ? <Loader2 size={20} className="animate-spin text-orange-500 shrink-0" />
              : <div className="w-10 h-10 rounded-xl bg-orange-500/15 flex items-center justify-center shrink-0 group-hover:bg-orange-500/25 transition"><ShoppingBag size={20} className="text-orange-500" /></div>}
            <div className="text-left flex-1">
              <p className="font-bold text-[var(--text)] text-sm">Pagar na retirada</p>
              <p className="text-xs text-[var(--text-muted)]">Pague no balcão ao retirar</p>
            </div>
            <ChevronRight size={16} className="text-[var(--text-muted)] shrink-0" />
          </button>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // STEP: REVIEW
  // ═══════════════════════════════════════════════════════════
  if (step === 'review') {
    return (
      <div className="max-w-md mx-auto py-6 px-4">
        <button onClick={() => setStep('browse')} className="flex items-center gap-1 text-sm text-[var(--text-muted)] hover:text-[var(--text)] mb-5 transition">
          <ChevronLeft size={16} /> Continuar comprando
        </button>
        <h2 className="text-lg font-black text-[var(--text)] mb-4">Seu pedido</h2>
        <div className="space-y-2.5 mb-5">
          {cart.map(({ item, quantity }) => (
            <div key={item.id} className="flex items-center gap-3 bg-[var(--card)] border border-[var(--border)] rounded-2xl p-3">
              {item.image && <img src={toThumbUrl(item.image)} alt={item.name} className="w-12 h-12 rounded-xl object-cover shrink-0" />}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-[var(--text)] truncate">{item.name}</p>
                <p className="text-xs text-orange-500 font-semibold">R$ {(item.price * quantity).toFixed(2).replace('.', ',')}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => removeFromCart(item.id)} className="w-7 h-7 rounded-lg bg-[var(--subtle)] flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text)] transition"><Minus size={12} /></button>
                <span className="text-sm font-black text-[var(--text)] min-w-[16px] text-center">{quantity}</span>
                <button onClick={() => addToCart(item)} className="w-7 h-7 rounded-lg bg-orange-500 flex items-center justify-center text-white hover:bg-orange-400 transition"><Plus size={12} /></button>
                <button onClick={() => deleteFromCart(item.id)} className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:text-red-400 transition ml-0.5"><X size={12} /></button>
              </div>
            </div>
          ))}
        </div>
        <div className="mb-5">
          <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-2 block">Observações (opcional)</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Ex: sem gelo, separado..." rows={3} maxLength={200}
            className="w-full bg-[var(--card)] border border-[var(--border)] focus:border-orange-500/40 rounded-xl px-4 py-3 text-sm text-[var(--text)] placeholder-[var(--text-muted)] resize-none focus:outline-none transition" />
        </div>
        <div className="flex items-center justify-between py-3 border-t border-[var(--border)] mb-5">
          <span className="text-sm text-[var(--text-muted)]">{cartCount} {cartCount === 1 ? 'item' : 'itens'}</span>
          <span className="text-xl font-black text-[var(--text)]">R$ {cartTotal.toFixed(2).replace('.', ',')}</span>
        </div>
        <button onClick={() => setStep('payment')}
          className="w-full py-3.5 rounded-2xl bg-orange-500 hover:bg-orange-400 active:scale-[0.98] text-white font-bold text-sm flex items-center justify-center gap-2 transition shadow-lg shadow-orange-500/20">
          Escolher pagamento <ChevronRight size={16} />
        </button>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // STEP: BROWSE — matches site cardapio design
  // ═══════════════════════════════════════════════════════════
  return (
    <div className="relative">
      {/* Hero header */}
      <div className="px-4 pt-4 pb-3">
        <p className="text-orange-500 text-[10px] font-bold tracking-[0.2em] uppercase mb-1">Conveniência</p>
        <h1 className="text-2xl font-black text-[var(--text)] leading-tight">
          Produtos para{' '}
          <span className="bg-gradient-to-r from-orange-500 to-orange-300 bg-clip-text text-transparent">retirada</span>
        </h1>
      </div>

      {/* Category tabs — sticky, horizontal scroll */}
      {groups.length > 1 && (
        <div className="sticky top-0 z-30 bg-[var(--bg,#060E18)]/90 backdrop-blur-xl border-b border-[var(--border)] overflow-x-auto scrollbar-hide">
          <div className="flex gap-1.5 px-4 py-2">
            {groups.map(g => (
              <button key={g.catId} onClick={() => {
                const el = document.getElementById(`cat-${g.catId}`);
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
                className="flex items-center gap-1.5 whitespace-nowrap px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0 bg-[var(--card)] border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] hover:border-orange-500/30">
                <span>{getCatIcon(g.slug)}</span> {g.catName}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Grid content */}
      <div className="px-4 pt-4 pb-32">
        {loading && (
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-2xl overflow-hidden animate-pulse bg-white/[0.03]">
                <div className="aspect-[4/3] bg-white/[0.05]" />
                <div className="p-3 space-y-2"><div className="h-3 rounded w-3/4 bg-white/[0.05]" /><div className="h-3 rounded w-1/2 bg-white/[0.03]" /></div>
              </div>
            ))}
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
            <AlertCircle size={16} /> {error}
          </div>
        )}
        {!loading && !error && items.length === 0 && (
          <div className="text-center py-16">
            <div className="text-5xl mb-3 opacity-20">🛍️</div>
            <p className="text-sm text-[var(--text-muted)]">Nenhum produto disponível no momento.</p>
          </div>
        )}
        {!loading && groups.map(({ catId, catName, slug, catItems }) => (
          <div key={catId} id={`cat-${catId}`} className="mb-8 scroll-mt-20">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">{getCatIcon(slug)}</span>
              <h2 className="text-xs font-black text-[var(--text-muted)] uppercase tracking-widest">{catName}</h2>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {catItems.map(item => (
                <ItemCard key={item.id} item={item} qty={itemQty(item.id)} onAdd={() => addToCart(item)} onRemove={() => removeFromCart(item.id)} />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Floating cart bar */}
      {cartCount > 0 && (
        <div className="fixed bottom-[calc(env(safe-area-inset-bottom)+64px)] left-4 right-4 z-50">
          <button onClick={() => setStep('review')}
            className="w-full py-4 rounded-2xl bg-orange-500 hover:bg-orange-400 active:scale-[0.98] text-white font-bold text-sm flex items-center justify-between px-5 shadow-xl shadow-orange-500/30 transition-all">
            <span className="bg-white/20 rounded-lg px-2 py-0.5 text-xs font-black min-w-[24px] text-center">{cartCount}</span>
            <span className="flex items-center gap-1.5"><ShoppingCart size={15} /> Ver pedido</span>
            <span className="font-black">R$ {cartTotal.toFixed(2).replace('.', ',')}</span>
          </button>
        </div>
      )}
    </div>
  );
}
