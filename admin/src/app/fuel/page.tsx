'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Fuel, Plus, Ship, DollarSign, Camera, Loader2, X, Settings, AlertCircle, CheckCircle2 } from 'lucide-react';
import { getFuelLogs, getBoats, createFuelLog, getFuelPrice, setFuelPrice, getSharesByBoat, getBoatReservations, getLastReturnInspection } from '@/services/api';

const API_ORIGIN = (process.env.NEXT_PUBLIC_API_URL || 'https://api.marinaprizeclub.com/api/v1').replace(/\/api\/v1$/, '');
function resolveMediaUrl(url: string | undefined | null): string {
  if (!url) return '';
  if (url.startsWith('/uploads/')) return `${API_ORIGIN}${url}`;
  return url;
}
interface FuelLog {
  id: string;
  boatName?: string;
  boat?: { name: string };
  liters: number;
  pricePerLiter: number;
  totalCost: number;
  date?: string;
  loggedAt?: string;
  createdAt?: string;
  operatorName?: string;
  operator?: { name: string };
  chargedShareholders?: number;
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

export default function FuelPage() {
  const [logs, setLogs] = useState<FuelLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewLog, setViewLog] = useState<FuelLog | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showPriceModal, setShowPriceModal] = useState(false);
  const [currentPrice, setCurrentPrice] = useState<number>(0);

  const loadData = useCallback(async () => {
    try {
      const [logsRes, priceRes] = await Promise.all([getFuelLogs(), getFuelPrice()]);
      const logsData = logsRes.data;
      setLogs(Array.isArray(logsData) ? logsData : logsData.data || logsData.items || []);
      setCurrentPrice(priceRes.data.price || 0);
    } catch {
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const totalLiters = logs.reduce((sum, l) => sum + (l.liters || 0), 0);
  const totalCost = logs.reduce((sum, l) => sum + (l.totalCost || l.liters * l.pricePerLiter || 0), 0);
  const formatCurrency = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-th flex items-center gap-2">
            <Fuel className="text-primary-500" />
            Combustível
          </h1>
          <p className="text-th-muted text-sm mt-1">Registro de abastecimentos</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowPriceModal(true)}
            className="flex items-center gap-2 bg-th-surface border border-th text-th-secondary px-4 py-2.5 rounded-lg font-medium hover:bg-primary-500/10 transition text-sm"
          >
            <Settings size={16} />
            Preço: {formatCurrency(currentPrice)}
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 bg-primary-500 text-white px-4 py-2.5 rounded-lg font-medium hover:bg-primary-600 transition text-sm"
          >
            <Plus size={16} />
            Novo Abastecimento
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-th-card rounded-2xl p-5 border border-th">
          <Fuel size={20} className="text-primary-500 mb-2" />
          <p className="text-2xl font-bold text-th">{totalLiters.toFixed(0)}L</p>
          <p className="text-xs text-th-muted mt-1">Total abastecido</p>
        </div>
        <div className="bg-th-card rounded-2xl p-5 border border-th">
          <DollarSign size={20} className="text-green-500 mb-2" />
          <p className="text-2xl font-bold text-th">{formatCurrency(totalCost)}</p>
          <p className="text-xs text-th-muted mt-1">Custo total</p>
        </div>
        <div className="bg-th-card rounded-2xl p-5 border border-th">
          <Ship size={20} className="text-blue-500 mb-2" />
          <p className="text-2xl font-bold text-th">{logs.length}</p>
          <p className="text-xs text-th-muted mt-1">Registros</p>
        </div>
      </div>

      <div className="bg-th-card rounded-2xl border border-th p-6">
        {loading ? (
          <p className="text-center py-8 text-th-muted">Carregando...</p>
        ) : logs.length === 0 ? (
          <p className="text-center py-8 text-th-muted">Nenhum registro de combustível encontrado</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-th">
                <th className="text-left py-3 text-xs font-semibold text-th-muted uppercase">Embarcação</th>
                <th className="text-center py-3 text-xs font-semibold text-th-muted uppercase">Litros</th>
                <th className="text-center py-3 text-xs font-semibold text-th-muted uppercase">Preço/L</th>
                <th className="text-right py-3 text-xs font-semibold text-th-muted uppercase">Total</th>
                <th className="text-center py-3 text-xs font-semibold text-th-muted uppercase">Data</th>
                <th className="text-left py-3 text-xs font-semibold text-th-muted uppercase">Operador</th>
                <th className="text-center py-3 text-xs font-semibold text-th-muted uppercase">Foto</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} onClick={() => setViewLog(log)} className="border-b border-th hover:bg-th-hover cursor-pointer">
                  <td className="py-3 text-sm font-medium text-th">{log.boatName || log.boat?.name || '-'}</td>
                  <td className="py-3 text-sm text-th-secondary text-center">{log.liters?.toFixed(1)}L</td>
                  <td className="py-3 text-sm text-th-secondary text-center">{formatCurrency(log.pricePerLiter || 0)}</td>
                  <td className="py-3 text-sm font-semibold text-th text-right">{formatCurrency(log.totalCost || log.liters * log.pricePerLiter || 0)}</td>
                  <td className="py-3 text-sm text-th-muted text-center">
                    {log.loggedAt || log.date || log.createdAt ? new Date(log.loggedAt || log.date || log.createdAt!).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '-'}
                  </td>
                  <td className="py-3 text-sm text-th-secondary">{log.operatorName || log.operator?.name || '-'}</td>
                  <td className="py-3 text-center">
                    {log.imageUrl ? (
                      <Camera size={16} className="mx-auto text-primary-500" />
                    ) : (
                      <span className="text-th-muted text-xs">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <NewFuelingModal
          currentPrice={currentPrice}
          onClose={() => setShowModal(false)}
          onSuccess={() => { setShowModal(false); loadData(); }}
        />
      )}

      {showPriceModal && (
        <PriceModal
          currentPrice={currentPrice}
          onClose={() => setShowPriceModal(false)}
          onSuccess={() => { setShowPriceModal(false); loadData(); }}
        />
      )}

      {/* Fuel Log Detail Modal */}
      {viewLog && (
        <div className="fixed inset-0 bg-th-overlay backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setViewLog(null)}>
          <div className="bg-th-card rounded-2xl border border-th w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-th">
              <div>
                <h3 className="text-lg font-bold text-th">Abastecimento</h3>
                <p className="text-th-muted text-xs mt-0.5">
                  {viewLog.boatName || viewLog.boat?.name || '-'} • {viewLog.loggedAt || viewLog.createdAt ? new Date(viewLog.loggedAt || viewLog.createdAt!).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '-'}
                </p>
              </div>
              <button onClick={() => setViewLog(null)} className="text-th-muted hover:text-primary-500 transition"><X size={20} /></button>
            </div>
            <div className="p-5 space-y-4">
              {viewLog.imageUrl && (
                <img
                  src={resolveMediaUrl(viewLog.imageUrl)}
                  alt="Foto do abastecimento"
                  className="w-full rounded-xl object-contain max-h-72 bg-th-surface border border-th"
                />
              )}
              {!viewLog.imageUrl && (
                <div className="flex items-center justify-center h-24 bg-th-surface rounded-xl border border-th border-dashed">
                  <p className="text-th-muted text-sm">Sem foto registrada</p>
                </div>
              )}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-th-surface rounded-xl p-3 border border-th text-center">
                  <p className="text-th-muted text-xs">Litros</p>
                  <p className="text-th font-bold text-lg">{viewLog.liters?.toFixed(1)}L</p>
                </div>
                <div className="bg-th-surface rounded-xl p-3 border border-th text-center">
                  <p className="text-th-muted text-xs">Preço/L</p>
                  <p className="text-th font-bold">{formatCurrency(viewLog.pricePerLiter || 0)}</p>
                </div>
                <div className="bg-primary-500/10 rounded-xl p-3 border border-primary-500/20 text-center">
                  <p className="text-primary-400 text-xs">Total</p>
                  <p className="text-primary-500 font-bold">{formatCurrency(viewLog.totalCost || 0)}</p>
                </div>
              </div>
              {viewLog.notes && (
                <div className="bg-th-surface rounded-xl p-3 border border-th">
                  <p className="text-th-muted text-xs mb-1">Observações</p>
                  <p className="text-th text-sm">{viewLog.notes}</p>
                </div>
              )}
              <p className="text-th-muted text-xs text-center">Operador: {viewLog.operatorName || viewLog.operator?.name || '-'}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// MODAL: Novo Abastecimento
// ============================================================

function NewFuelingModal({ currentPrice, onClose, onSuccess }: { currentPrice: number; onClose: () => void; onSuccess: () => void }) {
  const [boats, setBoats] = useState<Boat[]>([]);
  const [selectedBoatId, setSelectedBoatId] = useState('');
  const [step, setStep] = useState<'select' | 'review'>('select');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string>('');
  const [imageMime, setImageMime] = useState<string>('image/jpeg');
  const [manualLiters, setManualLiters] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [shareholders, setShareholders] = useState<{ userId: string; userName: string; shareNumber: number; hasReservationToday?: boolean }[]>([]);
  const [targetUserId, setTargetUserId] = useState('');
  const [returnInspection, setReturnInspection] = useState<{ fuelPhotoUrl?: string; returnFuelPhotoUrl?: string; cotistaUserId?: string; cotistaName?: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getBoats().then(res => {
      const data = res.data;
      const list = Array.isArray(data) ? data : data.data || data.items || [];
      setBoats(list.filter((b: Boat) => b.fuelCapacity > 0));
    }).catch(() => setBoats([]));
  }, []);

  useEffect(() => {
    if (!selectedBoatId) { setShareholders([]); setTargetUserId(''); setReturnInspection(null); return; }
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    Promise.all([
      getSharesByBoat(selectedBoatId),
      getBoatReservations(selectedBoatId, today).catch(() => ({ data: [] })),
      getLastReturnInspection(selectedBoatId).catch(() => ({ data: null })),
    ]).then(([sharesRes, reservRes, returnRes]) => {
      const sharesList = Array.isArray(sharesRes.data) ? sharesRes.data : sharesRes.data?.data || [];
      const reservations = Array.isArray(reservRes.data) ? reservRes.data : reservRes.data?.data || [];
      const todayUserIds = new Set(reservations.map((r: any) => r.userId));
      const mapped = sharesList.filter((s: any) => s.isActive !== false).map((s: any) => ({
        userId: s.userId,
        userName: s.user?.name || s.userName || 'Cotista',
        shareNumber: s.shareNumber,
        hasReservationToday: todayUserIds.has(s.userId),
      }));
      // Sort: shareholders with reservation today come first
      mapped.sort((a: any, b: any) => (b.hasReservationToday ? 1 : 0) - (a.hasReservationToday ? 1 : 0));
      setShareholders(mapped);

      // Auto-select cotista: prefer return inspection cotista, then today's reservation, then first
      const ri = returnRes.data;
      setReturnInspection(ri || null);
      if (ri?.cotistaUserId && mapped.some((s: any) => s.userId === ri.cotistaUserId)) {
        setTargetUserId(ri.cotistaUserId);
      } else {
        const todayShareholder = mapped.find((s: any) => s.hasReservationToday);
        setTargetUserId(todayShareholder ? todayShareholder.userId : (mapped.length > 0 ? mapped[0].userId : ''));
      }
    }).catch(() => setShareholders([]));
  }, [selectedBoatId]);

  const selectedBoat = boats.find(b => b.id === selectedBoatId);

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

    setSubmitting(true);
    setError('');
    try {
      const imageDataUrl = imageBase64 ? `data:${imageMime};base64,${imageBase64}` : undefined;
      const res = await createFuelLog({
        boatId: selectedBoatId,
        liters,
        pricePerLiter: currentPrice,
        notes: notes || undefined,
        targetUserId,
        imageUrl: imageDataUrl,
      });
      const shareholders = res.data.chargedShareholders || 0;
      setSuccessMsg(`Abastecimento registrado! ${shareholders > 0 ? `Fatura gerada para ${shareholders} cotista(s).` : ''}`);
      setTimeout(onSuccess, 2000);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Erro ao registrar abastecimento';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const totalCost = parseFloat(manualLiters || '0') * currentPrice;

  return (
    <div className="fixed inset-0 bg-th-overlay backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-th-card rounded-2xl border border-th w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-th">
          <div>
            <h2 className="text-xl font-bold text-th flex items-center gap-2">
              <Fuel className="text-primary-500" size={22} />
              Novo Abastecimento
            </h2>
            <p className="text-th-muted text-sm mt-1">
              {step === 'select' ? 'Selecione a embarcação' : 'Confirme os dados'}
            </p>
          </div>
          <button onClick={onClose} className="text-th-muted hover:text-primary-500 transition"><X size={20} /></button>
        </div>

        {successMsg ? (
          <div className="p-8 text-center">
            <CheckCircle2 size={48} className="text-green-500 mx-auto mb-4" />
            <p className="text-th font-semibold text-lg">{successMsg}</p>
          </div>
        ) : (
          <div className="p-6">
            {error && (
              <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-2">
                <AlertCircle size={16} />
                {error}
              </div>
            )}

            {/* STEP 1: Select Boat */}
            {step === 'select' && (
              <div className="space-y-4">
                <label className="text-sm text-th-secondary">Embarcação</label>
                <div className="grid gap-3">
                  {boats.length === 0 ? (
                    <p className="text-th-muted text-center py-6">Carregando embarcações...</p>
                  ) : boats.map(boat => (
                    <button
                      key={boat.id}
                      onClick={() => setSelectedBoatId(boat.id)}
                      className={`flex items-center justify-between p-4 rounded-xl border transition text-left ${
                        selectedBoatId === boat.id
                          ? 'border-primary-500 bg-primary-500/10'
                          : 'border-th bg-th-surface hover:border-th'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Ship size={20} className={selectedBoatId === boat.id ? 'text-primary-500' : 'text-th-muted'} />
                        <div>
                          <p className="text-th font-medium">{boat.name}</p>
                          <p className="text-th-muted text-xs">{boat.model} • {boat.fuelType}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-th-secondary text-sm">{boat.fuelCapacity}L tanque</p>
                      </div>
                    </button>
                  ))}
                </div>

                {selectedBoatId && (
                  <>
                    {/* Show inspection fuel photo right on boat selection */}
                    {(returnInspection?.returnFuelPhotoUrl || returnInspection?.fuelPhotoUrl) && (
                      <div className="mt-4 border border-blue-300 dark:border-blue-500/30 bg-blue-50 dark:bg-blue-500/10 rounded-xl p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-base">⛽</span>
                          <span className="text-sm font-semibold text-blue-700 dark:text-blue-400">
                            {returnInspection.returnFuelPhotoUrl ? 'Foto do tanque — Retorno' : 'Foto do tanque — Saída'}
                          </span>
                          {returnInspection.cotistaName && (
                            <span className="text-xs text-blue-500 ml-auto">Cotista: {returnInspection.cotistaName}</span>
                          )}
                        </div>
                        <img src={resolveMediaUrl(returnInspection.returnFuelPhotoUrl || returnInspection.fuelPhotoUrl)} alt="Tanque" className="w-full max-h-40 object-contain rounded-lg" />
                      </div>
                    )}

                    <div className="flex gap-3 pt-4">
                    <button
                      onClick={() => setStep('review')}
                      className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-primary-500 to-primary-600 text-white py-3 rounded-xl font-medium hover:opacity-90 transition"
                    >
                      Continuar
                    </button>
                  </div>
                  </>
                )}
              </div>
            )}

            {/* STEP 2: Review & Confirm */}
            {step === 'review' && (
              <div className="space-y-5">
                {/* Boat Info */}
                {selectedBoat && (
                  <div className="flex items-center gap-3 bg-th-surface rounded-xl p-4 border border-th">
                    <Ship size={20} className="text-primary-500" />
                    <div>
                      <p className="text-th font-medium">{selectedBoat.name}</p>
                      <p className="text-th-muted text-xs">{selectedBoat.model} • Tanque: {selectedBoat.fuelCapacity}L</p>
                    </div>
                  </div>
                )}

                {/* Liters Input */}
                <div>
                  <label className="text-sm text-th-secondary mb-2 block">Litros a abastecer</label>
                  <div className="relative">
                    <input
                      type="number"
                      value={manualLiters}
                      onChange={e => setManualLiters(e.target.value)}
                      placeholder="0.0"
                      step="0.1"
                      min="0.1"
                      className="w-full bg-th-surface border border-th rounded-xl px-4 py-3 text-th text-lg font-semibold focus:border-primary-500 focus:outline-none transition"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-th-muted text-sm">litros</span>
                  </div>
                </div>

                {/* Price & Total */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-th-surface rounded-xl p-4 border border-th">
                    <p className="text-th-muted text-xs mb-1">Preço por litro</p>
                    <p className="text-th font-bold text-lg">{currentPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                  </div>
                  <div className="bg-primary-500/10 rounded-xl p-4 border border-primary-500/20">
                    <p className="text-primary-400 text-xs mb-1">Custo total estimado</p>
                    <p className="text-primary-500 font-bold text-lg">{totalCost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                  </div>
                </div>

                {/* Cotista (charge target) */}
                {shareholders.length > 0 && (
                  <div>
                    <label className="text-sm text-th-secondary mb-2 block">Cobrar cotista</label>
                    <select
                      value={targetUserId}
                      onChange={e => setTargetUserId(e.target.value)}
                      className="w-full bg-th-surface border border-th rounded-xl px-4 py-2.5 text-th text-sm focus:border-primary-500 focus:outline-none transition"
                    >
                      {shareholders.map(s => (
                        <option key={s.userId} value={s.userId}>
                          Cota #{s.shareNumber} — {s.userName}{s.hasReservationToday ? ' (reserva hoje)' : ''}
                        </option>
                      ))}
                    </select>
                    {returnInspection?.cotistaUserId && returnInspection.cotistaUserId === targetUserId && (
                      <p className="text-xs text-green-600 dark:text-green-400 mt-1 flex items-center gap-1">
                        <CheckCircle2 size={12} /> Último cotista que usou — selecionado automaticamente
                      </p>
                    )}
                  </div>
                )}

                {/* Return inspection fuel photo */}
                {(returnInspection?.returnFuelPhotoUrl || returnInspection?.fuelPhotoUrl) && (
                  <div className="border border-blue-300 dark:border-blue-500/30 bg-blue-50 dark:bg-blue-500/10 rounded-xl p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-base">⛽</span>
                      <span className="text-sm font-semibold text-blue-700 dark:text-blue-400">
                        {returnInspection.returnFuelPhotoUrl ? 'Foto do tanque — Inspeção de Retorno' : 'Foto do tanque — Checklist de Saída'}
                      </span>
                    </div>
                    <img src={resolveMediaUrl(returnInspection.returnFuelPhotoUrl || returnInspection.fuelPhotoUrl)} alt="Tanque" className="w-full max-h-48 object-contain rounded-lg" />
                    {returnInspection.cotistaName && (
                      <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">Cotista: {returnInspection.cotistaName}</p>
                    )}
                  </div>
                )}

                {/* Foto do abastecimento */}
                <div>
                  <label className="text-sm text-th-secondary mb-2 block">Foto do abastecimento (opcional)</label>
                    {imagePreview ? (
                      <div className="relative rounded-xl overflow-hidden border border-th">
                        <img src={imagePreview} alt="Foto" className="w-full h-40 object-cover" />
                        <button
                          onClick={() => { setImagePreview(null); setImageBase64(''); }}
                          className="absolute top-2 right-2 bg-th-overlay text-th rounded-full p-1.5 hover:bg-black/80 transition"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => fileRef.current?.click()}
                        className="w-full border-2 border-dashed border-th rounded-xl p-5 text-center hover:border-primary-500/50 hover:bg-primary-500/5 transition flex items-center justify-center gap-3"
                      >
                        <Camera size={20} className="text-th-muted" />
                        <span className="text-th-secondary text-sm">Adicionar foto (opcional)</span>
                      </button>
                    )}
                    <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={handleImageSelect} className="hidden" />
                </div>

                {/* Notes */}
                <div>
                  <label className="text-sm text-th-secondary mb-2 block">Observações (opcional)</label>
                  <input
                    type="text"
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Observações adicionais..."
                    className="w-full bg-th-surface border border-th rounded-xl px-4 py-2.5 text-th text-sm focus:border-primary-500 focus:outline-none transition"
                  />
                </div>

                {/* Info */}
                <div className="flex items-center gap-2 text-th-muted text-xs bg-th-surface rounded-lg p-3 border border-th">
                  <DollarSign size={14} className="text-green-500 shrink-0" />
                  <span>{targetUserId
                    ? `Fatura será gerada para ${shareholders.find(s => s.userId === targetUserId)?.userName || 'o cotista selecionado'} com vencimento hoje.`
                    : 'Selecione um cotista para gerar a fatura.'}</span>
                </div>

                {/* Actions */}
                <div className="flex gap-3">
                  <button
                    onClick={() => setStep('select')}
                    className="flex items-center gap-2 bg-th-surface border border-th text-th-secondary px-6 py-3 rounded-xl font-medium hover:bg-primary-500/10 transition"
                  >
                    Voltar
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={submitting || !parseFloat(manualLiters)}
                    className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-green-600 to-green-700 text-white py-3 rounded-xl font-medium hover:opacity-90 transition disabled:opacity-40"
                  >
                    {submitting ? (
                      <>
                        <Loader2 size={18} className="animate-spin" />
                        Registrando...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 size={18} />
                        Confirmar Abastecimento
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// MODAL: Configurar Preço do Combustível
// ============================================================

function PriceModal({ currentPrice, onClose, onSuccess }: { currentPrice: number; onClose: () => void; onSuccess: () => void }) {
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
    <div className="fixed inset-0 bg-th-overlay backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-th-card rounded-2xl border border-th w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-th">
          <h2 className="text-lg font-bold text-th flex items-center gap-2">
            <Settings className="text-primary-500" size={20} />
            Preço do Combustível
          </h2>
          <button onClick={onClose} className="text-th-muted hover:text-primary-500 transition"><X size={20} /></button>
        </div>
        <div className="p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>
          )}
          <div>
            <label className="text-sm text-th-secondary mb-2 block">Preço por litro (R$)</label>
            <input
              type="number"
              value={price}
              onChange={e => setPrice(e.target.value)}
              step="0.01"
              min="0.01"
              className="w-full bg-th-surface border border-th rounded-xl px-4 py-3 text-th text-2xl font-bold text-center focus:border-primary-500 focus:outline-none transition"
            />
          </div>
          <p className="text-th-muted text-xs text-center">Este valor será usado como referência para novos abastecimentos.</p>
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 bg-primary-500 text-white py-3 rounded-xl font-medium hover:bg-primary-600 transition disabled:opacity-50"
          >
            {saving ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
            Salvar Preço
          </button>
        </div>
      </div>
    </div>
  );
}
