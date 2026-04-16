'use client';

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { AlertCircle, CheckCircle2, Clock, X, Camera, Receipt, TrendingUp, CreditCard, Fuel, Wrench, Calendar, FileText, QrCode, Copy, Loader2, Sparkles } from 'lucide-react';
import Image from 'next/image';
import { useAuth } from '@/contexts/auth';
import { getMyCharges, getFuelLog, createWooviCharge, getWooviChargeStatus, invalidateCache } from '@/services/api';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Charge {
  id: string;
  type: string;
  category?: string;
  description: string;
  amount: number;
  status: string;
  dueDate: string;
  paidAt?: string;
  reference?: string;
  boat?: { id: string; name: string };
  user?: { id: string; name: string };
  createdAt: string;
  wooviCorrelationID?: string;
  wooviBrCode?: string;
}

const statusConfig: Record<string, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  PAID:    { label: 'Pago',      color: '#10b981', icon: CheckCircle2 },
  PENDING: { label: 'Pendente',  color: '#f59e0b', icon: Clock },
  OVERDUE: { label: 'Atrasado',  color: '#ef4444', icon: AlertCircle },
};

const typeConfig: Record<string, { icon: typeof CreditCard; color: string }> = {
  MONTHLY_FEE: { icon: CreditCard, color: '#6366f1' },
  FUEL:        { icon: Fuel,        color: '#f59e0b' },
  MAINTENANCE: { icon: Wrench,      color: '#8b5cf6' },
  RESERVATION: { icon: Calendar,    color: '#10b981' },
  OTHER:       { icon: FileText,    color: '#64748b' },
};

export default function InvoicesPage() {
  const { user } = useAuth();
  const [charges, setCharges] = useState<Charge[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('ALL');
  const [fuelPhoto, setFuelPhoto] = useState<{ imageUrl: string; liters: number; totalCost: number; notes?: string } | null>(null);
  const [loadingPhoto, setLoadingPhoto] = useState(false);
  const [pixModal, setPixModal] = useState<{
    charge: Charge;
    brCode: string;
    qrCodeImage: string;
    pixKey: string;
    paymentLinkUrl: string;
    amount: number;
    description: string;
    correlationID: string;
    status: string;
    expiresIn?: number;
    expiresDate?: string;
  } | null>(null);
  const [pixLoading, setPixLoading] = useState(false);
  const [pixCopied, setPixCopied] = useState(false);
  const [pixCountdown, setPixCountdown] = useState<number | null>(null);
  const [showPaymentSuccessPulse, setShowPaymentSuccessPulse] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const refreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleFuelChargeClick = async (charge: Charge) => {
    if (charge.category !== 'FUEL' && charge.type !== 'FUEL') return;
    const ref = charge.reference || '';
    const match = ref.match(/^fuel-(.+)$/);
    if (!match) return;
    setLoadingPhoto(true);
    try {
      const { data } = await getFuelLog(match[1]);
      if (data?.imageUrl) {
        setFuelPhoto({ imageUrl: data.imageUrl, liters: data.liters, totalCost: data.totalCost, notes: data.notes });
      }
    } catch { /* empty */ } finally {
      setLoadingPhoto(false);
    }
  };

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  const stopRealtimeRefresh = useCallback(() => {
    if (refreshRef.current) {
      clearInterval(refreshRef.current);
      refreshRef.current = null;
    }
  }, []);

  const loadCharges = useCallback(async (showLoader = false) => {
    if (!user) return;
    if (showLoader) setLoading(true);
    try {
      // Avoid stale cached reads right after payment confirmation
      invalidateCache('/finance/my-charges');
      const { data } = await getMyCharges({ status: undefined, _ts: Date.now() });
      const items = Array.isArray(data) ? data : data.data || [];
      items.sort((a: Charge, b: Charge) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime());
      setCharges(items);

      // If modal is open, sync it with newest invoice status immediately
      setPixModal(prev => {
        if (!prev) return prev;
        const updated = items.find((c: Charge) => c.id === prev.charge.id);
        if (!updated) return prev;
        if (updated.status === 'PAID' && prev.status !== 'PAID') {
          stopPolling();
          setShowPaymentSuccessPulse(true);
          return { ...prev, status: 'PAID' };
        }
        return prev;
      });
    } catch {
      // keep current screen state
    } finally {
      if (showLoader) setLoading(false);
    }
  }, [user, stopPolling]);

  const handlePayWithPix = async (charge: Charge) => {
    setPixLoading(true);
    try {
      const { data } = await createWooviCharge(charge.id);
      setPixModal({
        charge,
        brCode: data.brCode || data.charge?.brCode || '',
        qrCodeImage: data.qrCodeImage || data.charge?.qrCodeImage || '',
        pixKey: data.pixKey || data.charge?.pixKey || '',
        paymentLinkUrl: data.paymentLinkUrl || data.charge?.paymentLinkUrl || '',
        amount: Number(charge.amount),
        description: charge.description,
        correlationID: data.correlationID || data.wooviCorrelationID || `charge-${charge.id}`,
        status: data.status || 'pending',
        expiresIn: data.expiresIn,
        expiresDate: data.expiresDate,
      });
      startPolling(data.wooviCorrelationID || data.correlationID || `charge-${charge.id}`);
    } catch (err: any) {
      alert(err?.response?.data?.message || err?.message || 'Erro ao gerar cobrança Pix');
    } finally {
      setPixLoading(false);
    }
  };

  const startPolling = (correlationID: string) => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const { data } = await getWooviChargeStatus(correlationID);
        if (data?.status === 'PAID' || data?.charge?.status === 'PAID') {
          stopPolling();
          await loadCharges(false);
          setShowPaymentSuccessPulse(true);
          setPixModal(prev => prev ? { ...prev, status: 'PAID' } : null);
        }
      } catch { /* keep polling */ }
    }, 10000);
  };

  const closePixModal = () => {
    stopPolling();
    setPixModal(null);
    setShowPaymentSuccessPulse(false);
  };

  // Compute effective status: PENDING + past due = OVERDUE (frontend-side)
  const effectiveStatus = (c: Charge) => {
    if (c.status === 'PENDING' && new Date(c.dueDate) < new Date()) return 'OVERDUE';
    return c.status;
  };

  useEffect(() => {
    if (!user) return;
    loadCharges(true);

    // Real-time refresh while user stays on invoices page
    stopRealtimeRefresh();
    refreshRef.current = setInterval(() => {
      loadCharges(false);
    }, 15000);

    // Refresh as soon as user comes back to this tab/page
    const onVisible = () => {
      if (document.visibilityState === 'visible') loadCharges(false);
    };
    const onFocus = () => loadCharges(false);

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
      stopRealtimeRefresh();
      stopPolling();
    };
  }, [user, loadCharges, stopRealtimeRefresh, stopPolling]);

  useEffect(() => {
    if (!showPaymentSuccessPulse) return;
    const t = setTimeout(() => setShowPaymentSuccessPulse(false), 1800);
    return () => clearTimeout(t);
  }, [showPaymentSuccessPulse]);

  // Single-pass summary calculation — avoids 5x array filter/reduce per render
  const summary = useMemo(() => {
    let totalPending = 0, countPending = 0, countOverdue = 0, countPaid = 0;
    const now = new Date();
    for (const c of charges) {
      const st = c.status === 'PENDING' && new Date(c.dueDate) < now ? 'OVERDUE' : c.status;
      if (st === 'PAID') { countPaid++; }
      else if (st === 'OVERDUE') { countOverdue++; totalPending += Number(c.amount); }
      else if (st === 'PENDING') { countPending++; totalPending += Number(c.amount); }
    }
    return { totalPending, countPending, countOverdue, countPaid };
  }, [charges]);

  const { totalPending, countPending, countOverdue, countPaid } = summary;

  const filtered = useMemo(() => {
    if (filter === 'PAID') return charges.filter(c => effectiveStatus(c) === 'PAID').sort((a, b) => new Date(b.paidAt || b.dueDate).getTime() - new Date(a.paidAt || a.dueDate).getTime());
    const open = charges.filter(c => effectiveStatus(c) !== 'PAID');
    if (filter !== 'ALL') return open.filter(c => effectiveStatus(c) === filter).sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
    return open.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  }, [charges, filter]);

  return (
    <div className="py-4">
      {/* Summary */}
      <div className="bg-[var(--card)] rounded-3xl border border-[var(--border)] p-5 mb-4 shadow-[0_2px_20px_var(--calendar-shadow)]">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-primary-500/15 to-primary-400/5 border border-primary-500/10 flex items-center justify-center">
              <TrendingUp size={18} className="text-primary-500" />
            </div>
            <div>
              <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-semibold">Total em aberto</p>
              <p className="text-xl font-bold text-[var(--text)]">
                R$ {totalPending.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        </div>
        <div className="flex gap-2.5">
          <div className="flex-1 rounded-2xl px-3 py-2.5 text-center" style={{ background: 'rgba(245,158,11,0.12)' }}>
            <p className="text-lg font-bold" style={{ color: '#f59e0b' }}>{countPending}</p>
            <p className="text-[9px] text-[var(--text-muted)] font-semibold">Pendentes</p>
          </div>
          <div className="flex-1 rounded-2xl px-3 py-2.5 text-center" style={{ background: 'rgba(239,68,68,0.12)' }}>
            <p className="text-lg font-bold" style={{ color: '#ef4444' }}>{countOverdue}</p>
            <p className="text-[9px] text-[var(--text-muted)] font-semibold">Atrasadas</p>
          </div>
          <div className="flex-1 rounded-2xl px-3 py-2.5 text-center" style={{ background: 'rgba(16,185,129,0.12)' }}>
            <p className="text-lg font-bold" style={{ color: '#10b981' }}>{countPaid}</p>
            <p className="text-[9px] text-[var(--text-muted)] font-semibold">Pagas</p>
          </div>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1.5 mb-4 bg-[var(--subtle)] rounded-2xl p-1.5">
        {[
          { key: 'ALL', label: 'Todas' },
          { key: 'PENDING', label: 'Pendentes' },
          { key: 'OVERDUE', label: 'Atrasadas' },
          { key: 'PAID', label: 'Pagas' },
        ].map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`flex-1 px-2 py-2 rounded-xl text-xs font-semibold transition-all ${
              filter === f.key
                ? 'bg-[var(--card)] text-[var(--text)] shadow-sm'
                : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-[var(--text-muted)]">
          <Receipt size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">Nenhuma fatura encontrada</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map(charge => {
            const st = statusConfig[effectiveStatus(charge)] || statusConfig.PENDING;
            const StatusIcon = st.icon;
            const isFuel = charge.category === 'FUEL' || charge.type === 'FUEL';
            const hasFuelRef = isFuel && (charge.reference || '').startsWith('fuel-');
            const typeKey = charge.type || charge.category || 'OTHER';
            const { icon: TypeIcon, color: typeColor } = typeConfig[typeKey] || typeConfig.OTHER;
            const canPayWithPix = effectiveStatus(charge) !== 'PAID';
            return (
              <div
                key={charge.id}
                className={`bg-[var(--card)] rounded-2xl border border-[var(--border)] overflow-hidden shadow-sm`}
              >
                <div className="px-4 py-3 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${typeColor}18` }}>
                    <TypeIcon size={18} style={{ color: typeColor }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-[var(--text)] truncate">
                        {charge.description || typeKey}
                      </p>
                      <p className="text-sm font-bold text-[var(--text)] shrink-0">
                        R$ {Number(charge.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <p className="text-[11px] text-[var(--text-muted)] flex items-center gap-1.5">
                        Venc. {format(parseISO(charge.dueDate), "dd/MM/yyyy")}
                        {charge.boat && <span> · {charge.boat.name}</span>}
                        {hasFuelRef && (
                          <span className="text-[10px] text-primary-500 flex items-center gap-0.5 ml-1">
                            <Camera size={10} /> ver foto
                          </span>
                        )}
                      </p>
                      <span
                        className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
                        style={{ background: `${st.color}18`, color: st.color }}
                      >
                        <StatusIcon size={10} /> {st.label}
                      </span>
                    </div>
                    {charge.paidAt && (
                      <p className="text-[10px] mt-0.5" style={{ color: '#10b981' }}>
                        Pago em {format(parseISO(charge.paidAt), "dd/MM/yyyy")}
                      </p>
                    )}
                    {canPayWithPix && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handlePayWithPix(charge); }}
                        className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-bold px-4 py-2 rounded-xl bg-gradient-to-r from-[#00b4d9] to-[#00c9f0] text-white active:scale-[0.97] transition-all shadow-[0_4px_14px_rgba(0,180,217,0.25)]"
                      >
                        <QrCode size={12} /> Pagar com Pix
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Loading photo indicator */}
      {loadingPhoto && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center">
          <div className="bg-[var(--card)] rounded-2xl p-6 flex items-center gap-3">
            <div className="animate-spin w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full" />
            <p className="text-sm text-[var(--text)]">Carregando foto...</p>
          </div>
        </div>
      )}

      {/* PIX Payment Modal */}
      {pixModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={closePixModal}>
          <div className="bg-[var(--card)] rounded-3xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(0,180,217,0.15)' }}>
                  <QrCode size={16} className="text-[#00b4d9]" />
                </div>
                <h3 className="font-bold text-[var(--text)]">Pagar com Pix</h3>
              </div>
              <button onClick={closePixModal} className="w-8 h-8 rounded-full bg-[var(--subtle)] flex items-center justify-center">
                <X size={16} className="text-[var(--text-secondary)]" />
              </button>
            </div>

            {pixModal.status === 'PAID' ? (
              <div className="px-5 pb-6 text-center">
                <div className="relative w-16 h-16 mx-auto mb-4">
                  <div className="absolute inset-0 rounded-full bg-green-500/20 animate-ping" />
                  <div className="absolute inset-0 rounded-full bg-green-500/10 animate-pulse" />
                  <div className="relative w-16 h-16 rounded-full bg-green-500/15 flex items-center justify-center">
                    <Sparkles size={32} className={`text-green-500 ${showPaymentSuccessPulse ? 'animate-bounce' : ''}`} />
                  </div>
                </div>
                <h4 className="font-bold text-lg text-[var(--text)] mb-1">Pagamento aprovado!</h4>
                <p className="text-sm text-[var(--text-muted)] mb-4">Sua fatura foi paga com sucesso.</p>
                <button
                  onClick={closePixModal}
                  className="w-full py-3 rounded-xl bg-green-500 text-white font-semibold text-sm"
                >
                  Fechar
                </button>
              </div>
            ) : (
              <div className="px-5 pb-6">
                {/* Amount & Description */}
                <div className="mb-4">
                  <p className="text-[11px] text-[var(--text-muted)] mb-1">Valor</p>
                  <p className="text-2xl font-bold text-[var(--text)]">
                    R$ {pixModal.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </p>
                  <p className="text-xs text-[var(--text-muted)] mt-1">{pixModal.description}</p>
                </div>

                {/* QR Code */}
                <div className="bg-white rounded-2xl p-4 flex items-center justify-center mb-4">
                  {pixModal.qrCodeImage ? (
                    <Image src={pixModal.qrCodeImage} alt="QR Code Pix" width={200} height={200} className="w-full max-w-[200px]" unoptimized />
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-[var(--text-muted)] py-6">
                      <QrCode size={48} className="opacity-30" />
                      <p className="text-xs">QR Code indisponível</p>
                      <p className="text-[10px]">Use o código abaixo</p>
                    </div>
                  )}
                </div>

                {/* Pix Copia e Cola */}
                {pixModal.brCode && (
                  <div className="mb-3">
                    <p className="text-[11px] text-[var(--text-muted)] mb-1.5">Pix Copia e Cola</p>
                    <div className="flex items-center gap-2">
                      <input
                        readOnly
                        value={pixModal.brCode}
                        className="flex-1 bg-[var(--subtle)] rounded-xl px-3 py-2.5 text-xs text-[var(--text)] font-mono truncate"
                      />
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(pixModal.brCode);
                          setPixCopied(true);
                          setTimeout(() => setPixCopied(false), 2000);
                        }}
                        className="px-3 py-2.5 rounded-xl bg-[#00b4d9] text-white text-xs font-medium shrink-0 active:opacity-80 transition-opacity"
                      >
                        {pixCopied ? <CheckCircle2 size={16} /> : <Copy size={16} />}
                      </button>
                    </div>
                  </div>
                )}

                {/* Payment Link */}
                {pixModal.paymentLinkUrl && (
                  <a
                    href={pixModal.paymentLinkUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full py-3 rounded-xl border-2 border-[#00b4d9] text-[#00b4d9] text-center text-sm font-semibold mb-3 active:bg-[#00b4d9] active:text-white transition-colors"
                  >
                    Abrir link de pagamento
                  </a>
                )}

                {/* Polling indicator */}
                <div className="flex items-center justify-center gap-2 text-[var(--text-muted)] pt-1">
                  <Loader2 size={14} className="animate-spin" />
                  <p className="text-[10px]">Aguardando pagamento...</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Fuel photo modal */}
      {fuelPhoto && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setFuelPhoto(null)}>
          <div className="bg-[var(--card)] rounded-3xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <h3 className="font-bold text-[var(--text)]">Foto do Abastecimento</h3>
              <button onClick={() => setFuelPhoto(null)} className="w-8 h-8 rounded-full bg-[var(--subtle)] flex items-center justify-center">
                <X size={16} className="text-[var(--text-secondary)]" />
              </button>
            </div>
            <div className="relative w-full bg-[var(--subtle)]" style={{ aspectRatio: '4/3' }}>
              <Image src={fuelPhoto.imageUrl} alt="Foto do abastecimento" fill className="object-contain" unoptimized />
            </div>
            <div className="p-5 grid grid-cols-2 gap-3">
              <div className="bg-[var(--subtle)] rounded-xl p-3 text-center">
                <p className="text-[10px] text-[var(--text-secondary)]">Litros</p>
                <p className="font-bold text-[var(--text)]">{fuelPhoto.liters?.toFixed(1)}L</p>
              </div>
              <div className="bg-primary-500/10 rounded-xl p-3 text-center">
                <p className="text-[10px] text-[var(--text-secondary)]">Total</p>
                <p className="font-bold text-primary-500">R$ {Number(fuelPhoto.totalCost).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
              </div>
              {fuelPhoto.notes && (
                <div className="col-span-2 bg-[var(--subtle)] rounded-xl p-3">
                  <p className="text-[10px] text-[var(--text-secondary)] mb-1">Observações</p>
                  <p className="text-xs text-[var(--text)]">{fuelPhoto.notes}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
