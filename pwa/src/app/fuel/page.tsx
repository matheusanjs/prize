'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Fuel, Plus, Ship, DollarSign, Camera, Loader2, X,
  Upload, Sparkles, ChevronLeft, AlertCircle, CheckCircle2,
  Crop, ZoomIn, RefreshCw, Settings,
} from 'lucide-react';
import {
  getMyFuelLogs, getBoats, createFuelLog, getFuelPrice, setFuelPrice,
  analyzeGauge, getSharesByBoat, getBoatReservations, getLastReturnInspection,
} from '@/services/api';
import ReactCrop, { type Crop as CropType } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
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

interface GaugeAnalysis {
  success: boolean;
  message?: string;
  tankCapacity?: number;
  gaugePercentage?: number;
  currentLiters?: number;
  litersNeeded?: number;
  confidence?: number;
  observation?: string;
}

const fmtCurrency = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = (s?: string) =>
  s ? new Date(s).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'America/Sao_Paulo' }) : '—';

export default function FuelPage() {
  const [logs, setLogs]           = useCachedState<FuelLog[]>('pc:fuel:logs', []);
  const [loading, setLoading]     = useState(() => !hasCached('pc:fuel:logs'));
  const [showModal, setShowModal] = useState(false);
  const [viewLog, setViewLog]     = useState<FuelLog | null>(null);
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

  const totalLiters = logs.reduce((s, l) => s + (l.liters || 0), 0);
  const totalCost   = logs.reduce((s, l) => s + (l.totalCost || l.liters * l.pricePerLiter || 0), 0);

  return (
    <div className="p-4 pb-28 space-y-4">
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
          </button>          <button onClick={() => setShowPriceModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 border border-[var(--border)] rounded-xl text-xs font-medium text-[var(--text-secondary)] hover:border-orange-300 transition-colors">
            <Settings className="w-3.5 h-3.5" />{fmtCurrency(currentPrice)}/L
          </button>          <button onClick={() => setShowModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-orange-500 text-white rounded-xl text-xs font-bold ">
            <Plus className="w-4 h-4" />Abastecer
          </button>
        </div>
      </div>

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
        <div className="flex items-center gap-2 px-3 py-2.5 bg-orange-500/10 border border-orange-100 rounded-xl">
          <Fuel className="w-3.5 h-3.5 text-orange-500" />
          <p className="text-xs text-orange-700">Preço atual: <strong>{fmtCurrency(currentPrice)}/L</strong></p>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-orange-500" /></div>
      ) : logs.length === 0 ? (
        <div className="text-center py-16">
          <Fuel className="w-12 h-12 mx-auto mb-3 text-[var(--text-muted)]" />
          <p className="text-sm text-[var(--text-muted)] font-medium">Nenhum abastecimento registrado</p>
          <p className="text-xs text-[var(--text-muted)] mt-1">Toque em "Abastecer" para registrar</p>
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

function LogDetailSheet({ log, onClose }: { log: FuelLog; onClose: () => void }) {
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
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
              <p className="text-xs font-semibold text-amber-700 mb-1">Observações</p>
              <p className="text-sm text-amber-800">{log.notes}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

type ModalStep = 'select' | 'photo' | 'review';

function NewFuelingModal({ currentPrice, onClose, onSuccess }: {
  currentPrice: number; onClose: () => void; onSuccess: () => void;
}) {
  const [boats, setBoats]               = useState<Boat[]>([]);
  const [selectedBoatId, setSelectedBoatId] = useState('');
  const [step, setStep]                 = useState<ModalStep>('select');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageBase64, setImageBase64]   = useState('');
  const [imageMime, setImageMime]       = useState('image/jpeg');
  const [analyzing, setAnalyzing]       = useState(false);
  const [analysis, setAnalysis]         = useState<GaugeAnalysis | null>(null);
  const [manualLiters, setManualLiters] = useState('');
  const [manualMode, setManualMode]     = useState(false);
  const [notes, setNotes]               = useState('');
  const [submitting, setSubmitting]     = useState(false);
  const [error, setError]               = useState('');
  const [successMsg, setSuccessMsg]     = useState('');
  const [crop, setCrop]                 = useState<CropType>();
  const [isCropping, setIsCropping]     = useState(false);
  const [croppedPreview, setCroppedPreview] = useState<string | null>(null);
  const [shareholders, setShareholders] = useState<{
    userId: string; userName: string; shareNumber: number; hasReservationToday?: boolean;
  }[]>([]);
  const [targetUserId, setTargetUserId] = useState('');
  const [returnInspection, setReturnInspection] = useState<{ fuelPhotoUrl?: string; returnFuelPhotoUrl?: string; cotistaUserId?: string; cotistaName?: string } | null>(null);
  const imgRef  = useRef<HTMLImageElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getBoats().then((res: any) => {
      const d = res.data;
      setBoats((Array.isArray(d) ? d : d?.data || []).filter((b: Boat) => b.fuelCapacity > 0));
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
      const todayIds = new Set(reservations.map((r: { userId: string }) => r.userId));
      const mapped = sharesList
        .filter((s: { isActive?: boolean }) => s.isActive !== false)
        .map((s: { userId: string; user?: { name: string }; userName?: string; shareNumber: number }) => ({
          userId: s.userId,
          userName: s.user?.name || s.userName || 'Cotista',
          shareNumber: s.shareNumber,
          hasReservationToday: todayIds.has(s.userId),
        }))
        .sort((a: { hasReservationToday?: boolean }, b: { hasReservationToday?: boolean }) =>
          (b.hasReservationToday ? 1 : 0) - (a.hasReservationToday ? 1 : 0));
      setShareholders(mapped);

      const ri = returnRes.data;
      setReturnInspection(ri || null);
      if (ri?.cotistaUserId && mapped.some((s: { userId: string }) => s.userId === ri.cotistaUserId)) {
        setTargetUserId(ri.cotistaUserId);
      } else {
        const sh = mapped.find((s: { hasReservationToday?: boolean }) => s.hasReservationToday);
        setTargetUserId(sh ? sh.userId : (mapped[0]?.userId || ''));
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
      setCrop(undefined); setCroppedPreview(null); setIsCropping(true); setError('');
    };
    reader.readAsDataURL(file);
  };

  const getCroppedBase64 = (): Promise<string> =>
    new Promise(resolve => {
      if (!crop || !imgRef.current || !crop.width || !crop.height) { resolve(imageBase64); return; }
      const img = imgRef.current;
      const canvas = document.createElement('canvas');
      const sx = img.naturalWidth / img.width, sy = img.naturalHeight / img.height;
      const px = { x: crop.x * sx, y: crop.y * sy, w: crop.width * sx, h: crop.height * sy };
      canvas.width = px.w; canvas.height = px.h;
      canvas.getContext('2d')!.drawImage(img, px.x, px.y, px.w, px.h, 0, 0, px.w, px.h);
      resolve(canvas.toDataURL(imageMime).split(',')[1]);
    });

  const generateCroppedPreview = () => {
    if (!crop || !imgRef.current || !crop.width || !crop.height) return;
    const img = imgRef.current;
    const canvas = document.createElement('canvas');
    const sx = img.naturalWidth / img.width, sy = img.naturalHeight / img.height;
    const px = { x: crop.x * sx, y: crop.y * sy, w: crop.width * sx, h: crop.height * sy };
    canvas.width = px.w; canvas.height = px.h;
    canvas.getContext('2d')!.drawImage(img, px.x, px.y, px.w, px.h, 0, 0, px.w, px.h);
    setCroppedPreview(canvas.toDataURL(imageMime));
  };

  const handleAnalyze = async () => {
    if (!selectedBoatId || !imageBase64) return;
    setAnalyzing(true); setError('');
    try {
      const hasCrop = !!(crop && crop.width && crop.height);
      const finalBase64 = hasCrop ? await getCroppedBase64() : imageBase64;
      const res = await analyzeGauge(selectedBoatId, finalBase64, imageMime, hasCrop);
      setAnalysis(res.data);
      if (res.data.success) {
        setManualLiters(res.data.litersNeeded?.toString() || '0');
        setStep('review');
      } else {
        setError(res.data.message || 'Não foi possível analisar a imagem.');
      }
    } catch { setError('Erro ao analisar imagem'); }
    finally { setAnalyzing(false); }
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
        notes: notes || (analysis?.observation ? `IA: ${analysis.observation}` : undefined),
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

  const goBack = () => {
    if (step === 'review') { setStep(manualMode ? 'select' : 'photo'); setManualMode(false); }
    else if (step === 'photo') setStep('select');
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
      <div className="bg-[var(--card)] rounded-t-3xl w-full max-h-[92vh] flex flex-col">
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 bg-[var(--subtle-hover)] rounded-full" />
        </div>
        <div className="flex items-center justify-between px-5 pb-3 flex-shrink-0 border-b border-[var(--border)]">
          <div className="flex items-center gap-2">
            {step !== 'select' && (
              <button onClick={goBack} className="p-1.5 hover:bg-[var(--subtle)] rounded-xl mr-0.5">
                <ChevronLeft className="w-5 h-5 text-[var(--text-secondary)]" />
              </button>
            )}
            <Fuel className="w-5 h-5 text-orange-500" />
            <p className="font-bold text-[var(--text)] text-sm">
              {step === 'select' ? 'Novo Abastecimento' : step === 'photo' ? 'Foto do Painel' : 'Confirmar Dados'}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-[var(--subtle)] rounded-xl"><X className="w-5 h-5 text-[var(--text-secondary)]" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 pb-10 space-y-4">
          {successMsg ? (
            <div className="flex flex-col items-center justify-center py-12 gap-4 text-center">
              <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle2 className="w-10 h-10 text-green-500" />
              </div>
              <p className="font-bold text-[var(--text)]">{successMsg}</p>
            </div>
          ) : (
            <>
              {error && (
                <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
                </div>
              )}

              {/* SELECT BOAT */}
              {step === 'select' && (
                <div className="space-y-3">
                  {boats.length === 0 ? (
                    <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-orange-500" /></div>
                  ) : boats.map(boat => (
                    <button key={boat.id} onClick={() => setSelectedBoatId(boat.id)}
                      className={`w-full flex items-center gap-3 p-4 rounded-2xl border-2 text-left transition-all ${
                        selectedBoatId === boat.id ? 'border-orange-400 bg-orange-500/10' : 'border-[var(--border)] bg-[var(--subtle)] hover:border-[var(--border)]'
                      }`}>
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${selectedBoatId === boat.id ? 'bg-orange-500/20' : 'bg-[var(--subtle)]'}`}>
                        <Ship className={`w-5 h-5 ${selectedBoatId === boat.id ? 'text-orange-500' : 'text-[var(--text-muted)]'}`} />
                      </div>
                      <div className="flex-1">
                        <p className="font-bold text-[var(--text)] text-sm">{boat.name}</p>
                        <p className="text-xs text-[var(--text-secondary)]">{boat.model} · {boat.fuelType} · {boat.fuelCapacity}L</p>
                      </div>
                    </button>
                  ))}
                  {selectedBoatId && (
                    <div className="flex gap-2 pt-2">
                      <button onClick={() => setStep('photo')}
                        className="flex-1 flex items-center justify-center gap-2 py-3.5 bg-orange-500 text-white rounded-xl font-bold text-sm">
                        <Camera className="w-4 h-4" />Analisar por Foto (IA)
                      </button>
                      <button onClick={() => { setManualMode(true); setStep('review'); }}
                        className="flex items-center justify-center gap-2 px-5 py-3.5 border-2 border-[var(--border)] text-[var(--text-secondary)] rounded-xl font-medium text-sm">
                        Manual
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* PHOTO + AI */}
              {step === 'photo' && (
                <div className="space-y-4">
                  <div className="flex items-start gap-2.5 p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl text-sm text-blue-700">
                    <Sparkles className="w-4 h-4 mt-0.5 flex-shrink-0 text-blue-500" />
                    <span>{!imagePreview ? 'Tire foto do painel de combustível para análise automática'
                      : isCropping ? 'Selecione a área do medidor arrastando para melhor precisão'
                      : 'Imagem pronta. Clique em Analisar para continuar'}</span>
                  </div>

                  {!imagePreview ? (
                    <div onClick={() => fileRef.current?.click()}
                      className="border-2 border-dashed border-[var(--border)] rounded-2xl p-10 text-center cursor-pointer hover:border-orange-300 transition flex flex-col items-center gap-3">
                      <Upload className="w-10 h-10 text-[var(--text-muted)]" />
                      <p className="text-sm text-[var(--text-secondary)] font-medium">Toque para capturar ou selecionar</p>
                    </div>
                  ) : (
                    <div className="relative rounded-2xl overflow-hidden border border-[var(--border)] bg-[var(--subtle)]">
                      {isCropping ? (
                        <ReactCrop crop={crop} onChange={c => setCrop(c)} className="max-h-72">
                          <img loading="lazy" decoding="async" ref={imgRef} src={imagePreview} alt="Painel" className="w-full max-h-72 object-contain block" />
                        </ReactCrop>
                      ) : croppedPreview ? (
                        <div className="relative">
                          <img loading="lazy" decoding="async" src={croppedPreview} alt="Recortado" className="w-full max-h-72 object-contain" />
                          <div className="absolute top-2 left-2 bg-emerald-500/90 text-white text-xs px-2 py-1 rounded-lg flex items-center gap-1.5">
                            <CheckCircle2 className="w-3 h-3" />Medidor recortado
                          </div>
                          <img loading="lazy" decoding="async" ref={imgRef} src={imagePreview} alt="" className="hidden" />
                        </div>
                      ) : (
                        <img loading="lazy" decoding="async" ref={imgRef} src={imagePreview} alt="Painel" className="w-full max-h-72 object-contain" />
                      )}
                      <button onClick={() => { setImagePreview(null); setImageBase64(''); setCrop(undefined); setCroppedPreview(null); setIsCropping(false); }}
                        className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1.5"><X className="w-3.5 h-3.5" /></button>
                    </div>
                  )}

                  <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={handleImageSelect} className="hidden" />

                  {imagePreview && (
                    isCropping ? (
                      <button onClick={() => { generateCroppedPreview(); setIsCropping(false); }}
                        disabled={!crop || !crop.width || !crop.height}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium bg-orange-500 text-white disabled:opacity-40">
                        <Crop className="w-4 h-4" />Confirmar Recorte
                      </button>
                    ) : (
                      <button onClick={() => { setCrop(undefined); setCroppedPreview(null); setIsCropping(true); }}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border border-[var(--border)] text-[var(--text-secondary)]">
                        {croppedPreview ? <ZoomIn className="w-4 h-4" /> : <Crop className="w-4 h-4" />}
                        {croppedPreview ? 'Nova área' : 'Recortar medidor'}
                      </button>
                    )
                  )}

                  <button onClick={handleAnalyze} disabled={!imageBase64 || analyzing || isCropping}
                    className="w-full py-3.5 bg-orange-500 disabled:bg-[var(--subtle-hover)] disabled:text-[var(--text-muted)] text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2">
                    {analyzing
                      ? <><Loader2 className="w-4 h-4 animate-spin" />Analisando com IA...</>
                      : <><Sparkles className="w-4 h-4" />Analisar Medidor</>}
                  </button>
                </div>
              )}

              {/* REVIEW */}
              {step === 'review' && (
                <div className="space-y-4">
                  {analysis?.success && !manualMode && (
                    <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-2xl">
                      <div className="flex items-center gap-2 mb-3">
                        <Sparkles className="w-4 h-4 text-blue-500" />
                        <span className="text-blue-400 font-semibold text-sm">Análise da IA</span>
                        {analysis.confidence && (
                          <span className="ml-auto text-xs bg-blue-100 text-blue-400 px-2 py-0.5 rounded-full">{analysis.confidence}% conf.</span>
                        )}
                      </div>
                      <div className="grid grid-cols-3 gap-3 text-center">
                        <div>
                          <p className="text-xs text-[var(--text-secondary)] mb-1">Nível</p>
                          <p className="font-bold text-[var(--text)]">{analysis.gaugePercentage}%</p>
                          <div className="w-full h-1.5 rounded-full bg-[var(--subtle-hover)] mt-1 overflow-hidden">
                            <div className="h-full bg-blue-500 rounded-full" style={{ width: `${analysis.gaugePercentage}%` }} />
                          </div>
                        </div>
                        <div>
                          <p className="text-xs text-[var(--text-secondary)] mb-1">Atual</p>
                          <p className="font-bold text-[var(--text)]">{analysis.currentLiters}L</p>
                          <p className="text-xs text-[var(--text-muted)]">de {analysis.tankCapacity}L</p>
                        </div>
                        <div>
                          <p className="text-xs text-[var(--text-secondary)] mb-1">Necessário</p>
                          <p className="font-bold text-orange-500">{analysis.litersNeeded}L</p>
                        </div>
                      </div>
                      {analysis.observation && <p className="text-xs text-[var(--text-secondary)] mt-2 italic">"{analysis.observation}"</p>}
                    </div>
                  )}

                  {selectedBoat && (
                    <div className="flex items-center gap-3 bg-[var(--subtle)] rounded-xl p-3 border border-[var(--border)]">
                      <Ship className="w-5 h-5 text-orange-500 flex-shrink-0" />
                      <div>
                        <p className="font-semibold text-[var(--text)] text-sm">{selectedBoat.name}</p>
                        <p className="text-xs text-[var(--text-secondary)]">{selectedBoat.model} · {selectedBoat.fuelCapacity}L</p>
                      </div>
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
                        {shareholders.map(s => (
                          <option key={s.userId} value={s.userId}>
                            Cota #{s.shareNumber} — {s.userName}{s.hasReservationToday ? ' (reserva hoje)' : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {manualMode && (
                    <div>
                      <p className="text-sm text-[var(--text-secondary)] mb-2 font-medium">Foto (opcional)</p>
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
                  )}

                  <div>
                    <p className="text-sm text-[var(--text-secondary)] mb-2 font-medium">Observações (opcional)</p>
                    <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
                      placeholder="Observações adicionais..."
                      className="w-full bg-[var(--subtle)] border border-[var(--border)] focus:border-orange-400 rounded-xl px-4 py-2.5 text-sm text-[var(--text)] focus:outline-none transition" />
                  </div>

                  {targetUserId && shareholders.length > 0 && (
                    <div className="flex items-center gap-2 p-3 bg-emerald-500/10 border border-green-100 rounded-xl text-xs text-emerald-400">
                      <DollarSign className="w-3.5 h-3.5 flex-shrink-0" />
                      Fatura será gerada para <strong>{shareholders.find(s => s.userId === targetUserId)?.userName}</strong>
                    </div>
                  )}

                  <button onClick={handleSubmit} disabled={submitting || !parseFloat(manualLiters)}
                    className="w-full py-4 bg-orange-500 disabled:bg-[var(--subtle-hover)] disabled:text-[var(--text-muted)] text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2">
                    {submitting
                      ? <><Loader2 className="w-4 h-4 animate-spin" />Registrando...</>
                      : <><CheckCircle2 className="w-4 h-4" />Confirmar Abastecimento</>}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

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
}
