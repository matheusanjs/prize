'use client';

import { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import {
  Fuel, Plus, Ship, DollarSign, Camera, Loader2, X,
  ChevronLeft, AlertCircle, CheckCircle2, RefreshCw, Settings, Search,
} from 'lucide-react';
import {
  getMyFuelLogs, getBoats, createFuelLog, getFuelPrice, setFuelPrice,
  getRecentUsers, getLastReturnInspection, getSharesByBoat,
} from '@/services/api';
import WeatherWidget from '@/components/WeatherWidget';
import { useCachedState, hasCached } from '@/hooks/useCachedState';

interface FuelLog {
  id: string;
  boat?: { id: string; name: string };
  liters: number;
  pricePerLiter: number;
  totalCost: number;
  createdAt?: string;
  loggedAt?: string;
  operator?: { id: string; name: string };
  imageUrl?: string;
  notes?: string;
}

interface Boat {
  id: string;
  name: string;
  model: string;
  fuelCapacity: number;
  currentFuel: number;
  fuelType: string;
}

const fmtCurrency = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = (s?: string) =>
  s ? new Date(s).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'America/Sao_Paulo' }) : '—';

export default function FuelPage() {
  const [logs, setLogs] = useCachedState<FuelLog[]>('pc:fuel:logs', []);
  const [loading, setLoading] = useState(() => !hasCached('pc:fuel:logs'));
  const [showModal, setShowModal] = useState(false);
  const [viewLog, setViewLog] = useState<FuelLog | null>(null);
  const [currentPrice, setCurrentPrice] = useCachedState<number>('pc:fuel:currentPrice', 0);
  const [showPriceModal, setShowPriceModal] = useState(false);

  const loadData = useCallback(async (silent = false) => {
    if (!silent && !hasCached('pc:fuel:logs')) setLoading(true);
    try {
      const [logsRes, priceRes] = await Promise.all([
        getMyFuelLogs(),
        getFuelPrice().catch(() => ({ data: { price: 0 } })),
      ]);
      const d = logsRes.data;
      setLogs(Array.isArray(d) ? d : d?.data || []);
      setCurrentPrice(priceRes.data?.price || 0);
    } catch { setLogs([]); }
    finally { if (!silent) setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const totalLiters = useMemo(() => logs.reduce((s, l) => s + (l.liters || 0), 0), [logs]);
  const totalCost = useMemo(() => logs.reduce((s, l) => s + (l.totalCost || l.liters * l.pricePerLiter || 0), 0), [logs]);

  return (
    <div className="p-4 pb-4 space-y-4">
      <WeatherWidget variant="operator" />
      <div className="flex items-center justify-between pt-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center">
            <Fuel className="w-5 h-5 text-orange-500" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-[var(--text)]">Combustível</h1>
            <p className="text-xs text-[var(--text-secondary)]">Meus registros de abastecimento</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => loadData(true)} className="p-2 hover:bg-[var(--subtle)] rounded-xl text-[var(--text-muted)]">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={() => setShowPriceModal(true)}
            className="p-2 border border-[var(--border)] rounded-xl text-[var(--text-secondary)] hover:border-orange-300 transition-colors" title={`${fmtCurrency(currentPrice)}/L`}>
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      <button onClick={() => setShowModal(true)}
        className="w-full flex items-center justify-center gap-2 py-3.5 bg-orange-500 hover:bg-orange-400 active:scale-[0.98] text-white rounded-2xl text-sm font-bold shadow-lg shadow-orange-500/20 transition-all">
        <Plus className="w-4 h-4" />Registrar Abastecimento
      </button>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-3">
          <Fuel className="w-4 h-4 text-orange-500 mb-1.5" />
          <p className="text-lg font-bold text-[var(--text)]">{totalLiters.toFixed(0)}L</p>
          <p className="text-xs text-[var(--text-muted)]">Total</p>
        </div>
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-3">
          <DollarSign className="w-4 h-4 text-green-500 mb-1.5" />
          <p className="text-sm font-bold text-[var(--text)]">{fmtCurrency(totalCost)}</p>
          <p className="text-xs text-[var(--text-muted)]">Custo</p>
        </div>
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-3">
          <Ship className="w-4 h-4 text-blue-500 mb-1.5" />
          <p className="text-lg font-bold text-[var(--text)]">{logs.length}</p>
          <p className="text-xs text-[var(--text-muted)]">Registros</p>
        </div>
      </div>

      {currentPrice > 0 && (
        <div className="flex items-center gap-2 px-3 py-2.5 bg-orange-500/10 border border-orange-500/20 dark:border-orange-500/20 rounded-xl">
          <Fuel className="w-3.5 h-3.5 text-orange-500" />
          <p className="text-xs text-orange-700 dark:text-orange-400">Preço atual: <strong>{fmtCurrency(currentPrice)}/L</strong></p>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-orange-500" /></div>
      ) : logs.length === 0 ? (
        <div className="text-center py-16">
          <Fuel className="w-12 h-12 mx-auto mb-3 text-[var(--text-muted)]" />
          <p className="text-sm text-[var(--text-muted)] font-medium">Nenhum abastecimento registrado</p>
          <p className="text-xs text-[var(--text-muted)] mt-1">Toque em "Registrar Abastecimento" para começar</p>
        </div>
      ) : (
        <div className="space-y-2">
          {logs.map(log => (
            <button key={log.id} onClick={() => setViewLog(log)}
              className="w-full text-left bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 hover:border-orange-500/20 transition-all flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center flex-shrink-0">
                {log.imageUrl
                  ? <Camera className="w-5 h-5 text-orange-400" />
                  : <Fuel className="w-5 h-5 text-orange-300" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-[var(--text)] text-sm truncate">{log.boat?.name || '—'}</p>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">{log.liters?.toFixed(1)}L · {fmtCurrency(log.pricePerLiter || 0)}/L</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="font-bold text-orange-500 text-sm">{fmtCurrency(log.totalCost || 0)}</p>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">{fmtDate(log.createdAt || log.loggedAt)}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {showModal && (
        <NewFuelingModal currentPrice={currentPrice}
          onClose={() => setShowModal(false)}
          onSuccess={() => { setShowModal(false); loadData(); }} />
      )}
      {viewLog && <LogDetailSheet log={viewLog} onClose={() => setViewLog(null)} />}
      {showPriceModal && (
        <PriceModal currentPrice={currentPrice}
          onClose={() => setShowPriceModal(false)}
          onSuccess={() => { setShowPriceModal(false); loadData(); }} />
      )}
    </div>
  );
}

const LogDetailSheet = memo(function LogDetailSheet({ log, onClose }: { log: FuelLog; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end" onClick={onClose}>
      <div className="bg-[var(--card)] rounded-t-3xl w-full max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-[var(--border)]">
          <div>
            <h2 className="font-bold text-[var(--text)]">Abastecimento</h2>
            <p className="text-xs text-[var(--text-secondary)]">{log.boat?.name} · {fmtDate(log.createdAt || log.loggedAt)}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-[var(--subtle)] rounded-xl"><X className="w-5 h-5 text-[var(--text-secondary)]" /></button>
        </div>
        <div className="p-5 space-y-4 pb-10">
          {log.imageUrl ? (
            <img loading="lazy" decoding="async" src={log.imageUrl} alt="Foto" className="w-full rounded-2xl object-contain max-h-72 bg-[var(--subtle)] border border-[var(--border)]" />
          ) : (
            <div className="flex items-center justify-center h-24 bg-[var(--subtle)] rounded-2xl border border-dashed border-[var(--border)]">
              <p className="text-[var(--text-muted)] text-sm">Sem foto registrada</p>
            </div>
          )}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-[var(--subtle)] rounded-xl p-3 border border-[var(--border)] text-center">
              <p className="text-[var(--text-muted)] text-xs">Litros</p>
              <p className="text-[var(--text)] font-bold text-lg">{log.liters?.toFixed(1)}L</p>
            </div>
            <div className="bg-[var(--subtle)] rounded-xl p-3 border border-[var(--border)] text-center">
              <p className="text-[var(--text-muted)] text-xs">Preço/L</p>
              <p className="text-[var(--text)] font-bold">{fmtCurrency(log.pricePerLiter || 0)}</p>
            </div>
            <div className="bg-orange-500/10 rounded-xl p-3 border border-orange-500/20 text-center">
              <p className="text-orange-400 text-xs">Total</p>
              <p className="text-orange-500 font-bold">{fmtCurrency(log.totalCost || 0)}</p>
            </div>
          </div>
          {log.notes && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
              <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 mb-1">Observações</p>
              <p className="text-sm text-amber-700 dark:text-amber-300">{log.notes}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

function NewFuelingModal({ currentPrice, onClose, onSuccess }: {
  currentPrice: number; onClose: () => void; onSuccess: () => void;
}) {
  const [boats, setBoats] = useState<Boat[]>([]);
  const [selectedBoatId, setSelectedBoatId] = useState('');
  const [step, setStep] = useState<'select' | 'form'>('select');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState('');
  const [imageMime, setImageMime] = useState('image/jpeg');
  const [manualLiters, setManualLiters] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [pendingBoats, setPendingBoats] = useState<Set<string>>(new Set());
  const [shareholderNamesMap, setShareholderNamesMap] = useState<Record<string, string[]>>({});
  const [shareholders, setShareholders] = useState<{
    userId: string; userName: string; shareNumber: number; hasReservationToday?: boolean; hasFuelCharge?: boolean; isShareholder?: boolean; source?: string; lastChecklistAt?: string;
  }[]>([]);
  const [targetUserId, setTargetUserId] = useState('');
  const [returnInspection, setReturnInspection] = useState<{ fuelPhotoUrl?: string; returnFuelPhotoUrl?: string; cotistaUserId?: string; cotistaName?: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getBoats().then(async (res: any) => {
      const d = res.data;
      const boatList = (Array.isArray(d) ? d : d?.data || []).filter((b: Boat) => b.fuelCapacity > 0);
      setBoats(boatList);
      const results = await Promise.allSettled(
        boatList.map((b: Boat) => getRecentUsers(b.id).catch(() => ({ data: [] })))
      );
      const pending = new Set<string>();
      const namesMap: Record<string, string[]> = {};
      results.forEach((result, idx) => {
        const boatId = boatList[idx].id;
        const list = result.status === 'fulfilled'
          ? (Array.isArray(result.value.data) ? result.value.data : result.value.data?.data || [])
          : [];
        namesMap[boatId] = list.map((u: Record<string, unknown>) => u.userName as string).filter(Boolean);
        const hasUncharged = list.some((u: Record<string, unknown>) => !u.hasFuelCharge && u.isShareholder);
        if (hasUncharged) pending.add(boatId);
      });
      setPendingBoats(pending);
      setShareholderNamesMap(namesMap);
    }).catch(() => setBoats([]));
  }, []);

  useEffect(() => {
    if (!selectedBoatId) { setShareholders([]); setTargetUserId(''); setReturnInspection(null); return; }
    Promise.all([
      getRecentUsers(selectedBoatId).catch(() => ({ data: [] })),
      getLastReturnInspection(selectedBoatId).catch(() => ({ data: null })),
      getSharesByBoat(selectedBoatId).catch(() => ({ data: [] })),
    ]).then(([recentRes, returnRes, sharesRes]) => {
      const recentList = Array.isArray(recentRes.data) ? recentRes.data : recentRes.data?.data || [];
      const sharesList = Array.isArray(sharesRes.data) ? sharesRes.data : sharesRes.data?.data || [];
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
      const mapped = recentList.map((u: Record<string, unknown>, idx: number) => {
        const lastUsedDate = u.lastUsedAt ? new Date(u.lastUsedAt as string).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }) : '';
        return {
          userId: u.userId as string,
          userName: (u.userName as string) || 'Usuário',
          shareNumber: idx + 1,
          hasReservationToday: lastUsedDate === today,
          hasFuelCharge: u.hasFuelCharge as boolean,
          isShareholder: u.isShareholder as boolean,
          source: u.source as string,
          lastChecklistAt: u.lastUsedAt as string | undefined,
        };
      });

      const existingIds = new Set(mapped.map((m: typeof mapped[number]) => m.userId));
      for (const share of sharesList) {
        const user = (share as Record<string, unknown>).user as Record<string, unknown> | undefined;
        if (!user || existingIds.has(user.id as string)) continue;
        mapped.push({
          userId: user.id as string,
          userName: (user.name as string) || 'Usuário',
          shareNumber: ((share as Record<string, unknown>).shareNumber as number) || mapped.length + 1,
          hasReservationToday: false,
          hasFuelCharge: true,
          isShareholder: true,
          source: 'shareholder',
          lastChecklistAt: undefined,
        });
      }

      mapped.sort((a: typeof mapped[number], b: typeof mapped[number]) => {
        if (a.hasFuelCharge !== b.hasFuelCharge) return a.hasFuelCharge ? 1 : -1;
        const aDate = a.lastChecklistAt ? new Date(a.lastChecklistAt).getTime() : 0;
        const bDate = b.lastChecklistAt ? new Date(b.lastChecklistAt).getTime() : 0;
        return aDate - bDate;
      });
      setShareholders(mapped);

      const ri = returnRes.data;
      setReturnInspection(ri || null);
      if (ri?.cotistaUserId && mapped.some((s: { userId: string }) => s.userId === ri.cotistaUserId)) {
        setTargetUserId(ri.cotistaUserId);
      } else {
        const uncharged = mapped.find((s: { hasFuelCharge?: boolean }) => !s.hasFuelCharge);
        setTargetUserId(uncharged ? uncharged.userId : (mapped.length > 0 ? mapped[0].userId : ''));
      }
    }).catch(() => setShareholders([]));
  }, [selectedBoatId]);

  const selectedBoat = boats.find(b => b.id === selectedBoatId);

  const filteredBoats = useMemo(() => boats
    .filter(b => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const names = shareholderNamesMap[b.id] || [];
      return b.name.toLowerCase().includes(q)
        || b.model.toLowerCase().includes(q)
        || names.some(n => n.toLowerCase().includes(q));
    })
    .sort((a, b) => {
      const aPending = pendingBoats.has(a.id) ? 0 : 1;
      const bPending = pendingBoats.has(b.id) ? 0 : 1;
      return aPending - bPending;
    }), [boats, searchQuery, shareholderNamesMap, pendingBoats]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { setError('Imagem muito grande. Máximo 10MB.'); return; }
    setImageMime(file.type || 'image/jpeg');
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setImagePreview(result);
      setImageBase64(result.split(',')[1]);
      setError('');
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async () => {
    const liters = parseFloat(manualLiters);
    if (!liters || liters <= 0) { setError('Informe a quantidade de litros.'); return; }
    if (!selectedBoatId) { setError('Selecione uma embarcação.'); return; }
    if (!targetUserId) { setError('Selecione o cotista para cobrança.'); return; }
    setSubmitting(true); setError('');
    try {
      await createFuelLog({
        boatId: selectedBoatId, liters, pricePerLiter: currentPrice,
        notes: notes || undefined,
        targetUserId,
        imageUrl: imageBase64 ? `data:${imageMime};base64,${imageBase64}` : undefined,
      });
      setSuccessMsg('Abastecimento registrado com sucesso!');
      setTimeout(onSuccess, 2000);
    } catch (e: unknown) {
      setError((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Erro ao registrar');
    } finally { setSubmitting(false); }
  };

  const totalCost = parseFloat(manualLiters || '0') * currentPrice;

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.5)' }} onClick={onClose} />
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50, background: 'var(--card)', borderTopLeftRadius: '1.5rem', borderTopRightRadius: '1.5rem', height: '90vh', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
        {/* HEADER */}
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '0.75rem', paddingBottom: '0.25rem' }}>
          <div style={{ width: '2.5rem', height: '0.25rem', borderRadius: '9999px', background: 'var(--subtle-hover)' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 1.25rem 0.75rem', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {step !== 'select' && (
              <button onClick={() => setStep('select')} className="p-1.5 hover:bg-[var(--subtle)] rounded-xl mr-0.5">
                <ChevronLeft className="w-5 h-5 text-[var(--text-secondary)]" />
              </button>
            )}
            <Fuel className="w-5 h-5 text-orange-500" />
            <p className="font-bold text-[var(--text)] text-sm">
              {step === 'select' ? 'Novo Abastecimento' : 'Confirmar Dados'}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-[var(--subtle)] rounded-xl"><X className="w-5 h-5 text-[var(--text-secondary)]" /></button>
        </div>

        {/* SCROLLABLE CONTENT — pb-24 leaves room for the floating button */}
        <div style={{ height: 'calc(100% - 4rem)', overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '0.75rem 1.25rem 8rem' }} className="space-y-3">
          {successMsg ? (
            <div className="flex flex-col items-center justify-center py-12 gap-4 text-center">
              <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center">
                <CheckCircle2 className="w-10 h-10 text-green-500" />
              </div>
              <p className="font-bold text-[var(--text)]">{successMsg}</p>
            </div>
          ) : (
            <>
              {error && (
                <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400">
                  <AlertCircle className="w-4 h-4 shrink-0" />{error}
                </div>
              )}

              {/* STEP 1: Select Boat */}
              {step === 'select' && (
                <div className="space-y-2">
                  {boats.length > 1 && (
                    <div className="relative">
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder="Buscar por nome, modelo ou cotista..."
                        className="w-full bg-[var(--subtle)] border border-[var(--border)] focus:border-orange-400 rounded-xl px-4 py-2.5 pl-10 text-sm text-[var(--text)] focus:outline-none transition"
                      />
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                      {searchQuery && (
                        <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2">
                          <X className="w-4 h-4 text-[var(--text-muted)]" />
                        </button>
                      )}
                    </div>
                  )}

                  {filteredBoats.length === 0 && boats.length > 0 ? (
                    <div className="text-center py-8">
                      <Ship className="w-10 h-10 mx-auto mb-2 text-[var(--text-muted)]" />
                      <p className="text-sm text-[var(--text-muted)]">Nenhuma embarcação encontrada</p>
                    </div>
                  ) : boats.length === 0 ? (
                    <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-orange-500" /></div>
                  ) : filteredBoats.map(boat => (
                    <button key={boat.id} onClick={() => setSelectedBoatId(boat.id)}
                      className={`w-full flex items-center gap-2.5 p-3 rounded-xl border-2 text-left transition-all ${
                        selectedBoatId === boat.id ? 'border-orange-400 bg-orange-500/10' : 'border-[var(--border)] bg-[var(--subtle)] hover:border-[var(--border)]'
                      }`}>
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${selectedBoatId === boat.id ? 'bg-orange-500/20' : 'bg-[var(--subtle)]'}`}>
                        <Ship className={`w-4 h-4 ${selectedBoatId === boat.id ? 'text-orange-500' : 'text-[var(--text-muted)]'}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="font-semibold text-[var(--text)] text-sm truncate">{boat.name}</p>
                          {pendingBoats.has(boat.id) && (
                            <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-500 dark:text-amber-400 border border-amber-500/30">Pendente</span>
                          )}
                        </div>
                        <p className="text-xs text-[var(--text-secondary)] truncate">{boat.model} · {boat.fuelCapacity}L</p>
                      </div>
                    </button>
                  ))}

                  {selectedBoatId && (returnInspection?.returnFuelPhotoUrl || returnInspection?.fuelPhotoUrl) && (
                    <div className="border border-blue-300 dark:border-blue-500/30 bg-blue-50 dark:bg-blue-500/10 rounded-xl p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-base">⛽</span>
                        <span className="text-sm font-semibold text-blue-700 dark:text-blue-400">
                          {returnInspection.returnFuelPhotoUrl ? 'Foto do tanque — Retorno' : 'Foto do tanque — Saída'}
                        </span>
                        {returnInspection.cotistaName && (
                          <span className="text-xs text-blue-500 ml-auto">Cotista: {returnInspection.cotistaName}</span>
                        )}
                      </div>
                      <img loading="lazy" decoding="async" src={returnInspection.returnFuelPhotoUrl || returnInspection.fuelPhotoUrl} alt="Tanque" className="w-full max-h-40 object-contain rounded-lg" />
                    </div>
                  )}
                </div>
              )}

              {/* STEP 2: Form */}
              {step === 'form' && (
                <div className="space-y-4">
                  {selectedBoat && (
                    <div className="flex items-center gap-3 bg-[var(--subtle)] rounded-xl p-3 border border-[var(--border)]">
                      <Ship className="w-5 h-5 text-orange-500 shrink-0" />
                      <div>
                        <p className="font-semibold text-[var(--text)] text-sm">{selectedBoat.name}</p>
                        <p className="text-xs text-[var(--text-secondary)]">{selectedBoat.model} · {selectedBoat.fuelCapacity}L</p>
                      </div>
                    </div>
                  )}

                  {(returnInspection?.returnFuelPhotoUrl || returnInspection?.fuelPhotoUrl) && (
                    <div className="border border-blue-300 dark:border-blue-500/30 bg-blue-50 dark:bg-blue-500/10 rounded-xl p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-base">⛽</span>
                        <span className="text-sm font-semibold text-blue-700 dark:text-blue-400">
                          {returnInspection.returnFuelPhotoUrl ? 'Foto do tanque — Inspeção de Retorno' : 'Foto do tanque — Checklist de Saída'}
                        </span>
                      </div>
                      <img loading="lazy" decoding="async" src={returnInspection.returnFuelPhotoUrl || returnInspection.fuelPhotoUrl} alt="Tanque" className="w-full max-h-48 object-contain rounded-lg" />
                      {returnInspection.cotistaName && (
                        <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">Cotista: {returnInspection.cotistaName}</p>
                      )}
                    </div>
                  )}

                  <div>
                    <p className="text-sm text-[var(--text-secondary)] mb-2 font-medium">Litros a abastecer</p>
                    <div className="relative">
                      <input type="number" value={manualLiters} onChange={e => setManualLiters(e.target.value)}
                        placeholder="0.0" step="0.1" min="0.1"
                        className="w-full bg-[var(--subtle)] border-2 border-[var(--border)] focus:border-orange-400 rounded-xl px-4 py-3 text-2xl font-bold text-center text-[var(--text)] focus:outline-none transition" />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)] text-sm">L</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-[var(--subtle)] rounded-xl p-3 border border-[var(--border)]">
                      <p className="text-[var(--text-muted)] text-xs mb-1">Preço/L</p>
                      <p className="font-bold text-[var(--text)]">{fmtCurrency(currentPrice)}</p>
                    </div>
                    <div className="bg-orange-500/10 rounded-xl p-3 border border-orange-500/20">
                      <p className="text-orange-400 text-xs mb-1">Total estimado</p>
                      <p className="font-bold text-orange-500">{fmtCurrency(totalCost)}</p>
                    </div>
                  </div>

                  {shareholders.length > 0 && (
                    <div>
                      <p className="text-sm text-[var(--text-secondary)] mb-2 font-medium">Cobrar cotista</p>
                      <select value={targetUserId} onChange={e => setTargetUserId(e.target.value)}
                        className="w-full bg-[var(--subtle)] border-2 border-[var(--border)] focus:border-orange-400 rounded-xl px-4 py-3 text-[var(--text)] text-sm focus:outline-none transition">
                        {shareholders.map(s => {
                          const dateStr = s.lastChecklistAt
                            ? new Date(s.lastChecklistAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'America/Sao_Paulo' })
                            : null;
                          return (
                            <option key={s.userId} value={s.userId}>
                              {s.userName}
                              {dateStr ? ` (${dateStr})` : ''}
                              {s.source === 'reservation' && !s.isShareholder ? ' — reserva avulsa' : ''}
                              {s.hasFuelCharge ? ' ✅ cobrado' : ' ⚠️ pendente'}
                            </option>
                          );
                        })}
                      </select>
                      {returnInspection?.cotistaUserId && returnInspection.cotistaUserId === targetUserId && (
                        <p className="text-xs text-green-600 dark:text-green-400 mt-1 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Último cotista que usou — selecionado automaticamente
                        </p>
                      )}
                    </div>
                  )}

                  <div>
                    <p className="text-sm text-[var(--text-secondary)] mb-2 font-medium">Foto do abastecimento (opcional)</p>
                    {imagePreview ? (
                      <div className="relative rounded-xl overflow-hidden border border-[var(--border)]">
                        <img loading="lazy" decoding="async" src={imagePreview} alt="Foto" className="w-full h-36 object-cover" />
                        <button onClick={() => { setImagePreview(null); setImageBase64(''); }}
                          className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1.5"><X className="w-3.5 h-3.5" /></button>
                      </div>
                    ) : (
                      <button onClick={() => fileRef.current?.click()}
                        className="w-full border-2 border-dashed border-[var(--border)] rounded-xl p-5 flex items-center justify-center gap-2 hover:border-orange-300 transition">
                        <Camera className="w-5 h-5 text-[var(--text-muted)]" />
                        <span className="text-sm text-[var(--text-muted)]">Adicionar foto</span>
                      </button>
                    )}
                    <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={handleImageSelect} className="hidden" />
                  </div>

                  <div>
                    <p className="text-sm text-[var(--text-secondary)] mb-2 font-medium">Observações (opcional)</p>
                    <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
                      placeholder="Observações adicionais..."
                      className="w-full bg-[var(--subtle)] border border-[var(--border)] focus:border-orange-400 rounded-xl px-4 py-2.5 text-sm text-[var(--text)] focus:outline-none transition" />
                  </div>

                  {targetUserId && shareholders.length > 0 && (
                    <div className="flex items-center gap-2 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs text-emerald-500 dark:text-emerald-400">
                      <DollarSign className="w-3.5 h-3.5 shrink-0" />
                      Fatura será gerada para <strong>{shareholders.find(s => s.userId === targetUserId)?.userName}</strong>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* FLOATING ACTION BUTTON — absolute, above tab bar */}
        {!successMsg && (
          <div style={{ position: 'absolute', bottom: '4.5rem', left: 0, right: 0, zIndex: 60, padding: '0 1.25rem', pointerEvents: 'none' }}>
            <div style={{ padding: '1.25rem 0 0.5rem', background: 'linear-gradient(to top, var(--card) 70%, transparent)', pointerEvents: 'auto' }}>
              {step === 'select' && (
                <button onClick={() => selectedBoatId && setStep('form')} disabled={!selectedBoatId}
                  className="w-full py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 bg-orange-500 text-white shadow-lg shadow-orange-500/30 disabled:bg-[var(--subtle-hover)] disabled:text-[var(--text-muted)] disabled:shadow-none active:scale-[0.98] transition-all">
                  Continuar
                </button>
              )}
              {step === 'form' && (
                <button onClick={handleSubmit} disabled={submitting || !parseFloat(manualLiters)}
                  className="w-full py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 bg-orange-500 text-white shadow-lg shadow-orange-500/30 disabled:bg-[var(--subtle-hover)] disabled:text-[var(--text-muted)] disabled:shadow-none active:scale-[0.98] transition-all">
                  {submitting
                    ? <><Loader2 className="w-4 h-4 animate-spin" />Registrando...</>
                    : <><CheckCircle2 className="w-4 h-4" />Confirmar Abastecimento</>}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

const PriceModal = memo(function PriceModal({ currentPrice, onClose, onSuccess }: { currentPrice: number; onClose: () => void; onSuccess: () => void }) {
  const [price, setPrice] = useState(currentPrice.toString());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    const val = parseFloat(price);
    if (!val || val <= 0) { setError('Preço inválido'); return; }
    setSaving(true);
    try {
      await setFuelPrice(val, 'GASOLINE', `Preço atualizado para R$ ${val.toFixed(2)}`);
      onSuccess();
    } catch {
      setError('Erro ao salvar preço');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end" onClick={onClose}>
      <div className="bg-[var(--card)] rounded-t-3xl w-full" onClick={e => e.stopPropagation()}>
        <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1 bg-[var(--subtle-hover)] rounded-full" /></div>
        <div className="flex items-center justify-between px-5 pb-3 border-b border-[var(--border)]">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-orange-500" />
            <p className="font-bold text-[var(--text)]">Preço do Combustível</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-[var(--subtle)] rounded-xl"><X className="w-5 h-5 text-[var(--text-secondary)]" /></button>
        </div>
        <div className="p-5 space-y-4 pb-10">
          {error && <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>}
          <div>
            <p className="text-sm text-[var(--text-secondary)] mb-2">Preço por litro (R$)</p>
            <input type="number" value={price} onChange={e => setPrice(e.target.value)}
              step="0.01" min="0.01"
              className="w-full bg-[var(--subtle)] border-2 border-[var(--border)] focus:border-orange-400 rounded-xl px-4 py-4 text-2xl font-bold text-center text-[var(--text)] focus:outline-none transition" />
          </div>
          <p className="text-[var(--text-muted)] text-xs text-center">Este valor será usado como referência para novos abastecimentos.</p>
          <button onClick={handleSave} disabled={saving}
            className="w-full flex items-center justify-center gap-2 bg-orange-500 text-white py-3.5 rounded-xl font-bold text-sm disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            Salvar Preço
          </button>
        </div>
      </div>
    </div>
  );
});