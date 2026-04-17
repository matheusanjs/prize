'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import {
  ClipboardCheck, CheckCircle, ChevronRight, ChevronLeft,
  Pen, Eraser, Trash2, Video, X, Loader2, AlertCircle, Ship,
  RefreshCw, Plus, Eye, PenLine, AlertTriangle, CheckCircle2,
  Waves, User, Clock, ArrowUp, Camera, DollarSign, Filter,
} from 'lucide-react';
import {
  getMyReservationsForChecklist, submitPreLaunch,
  getChecklists, getTodayReservationsForOperator, startAdHocPreLaunch, getBoats,
  deleteChecklist, liftBoat, launchToWater, getChecklistsByBoat, getSharesByBoat, getCharges,
  getChecklistById, getLastMarksForBoat,
} from '@/services/api';
import api from '@/services/api';
import { useAuth } from '@/contexts/auth';
import { useCachedState, hasCached } from '@/hooks/useCachedState';

const JetSkiViewer3D = dynamic(() => import('@/components/JetSkiViewer3D'), { ssr: false });
import type { JetSki3DSketchRef, InitialMark } from '@/components/JetSki3DSketch';
const JetSki3DSketch = dynamic(() => import('@/components/JetSki3DSketch'), { ssr: false }) as any;
const JetSki3DMarkViewer = dynamic(() => import('@/components/JetSki3DMarkViewer'), { ssr: false }) as any;

const API_ORIGIN = (process.env.NEXT_PUBLIC_API_URL || 'https://api.marinaprizeclub.com/api/v1').replace(/\/api\/v1$/, '');
function resolveMediaUrl(url: string | undefined | null): string {
  if (!url) return '';
  if (url.startsWith('/uploads/')) return `${API_ORIGIN}${url}`;
  return url;
}

/* ─── Shared constants ───────────────────────────────────────────────────── */
const PRE_LAUNCH_ITEMS = [
  'Âncora e cabo presentes',
  'Documentação a bordo',
  'Motor de arranque funcionando',
  'Bateria carregada',
  'Nível de combustível verificado',
];
const RETURN_ITEMS = [
  'Âncora e cabo devolvidos',
  'Documentação conferida',
  'Equipamentos em ordem',
];

/* ─── Types ──────────────────────────────────────────────────────────────── */
interface Reservation {
  id: string; startDate: string; endDate: string; status: string;
  boat?: { id: string; name: string; model: string };
  checklist?: { id: string; status: string } | null;
}
interface ChecklistEntry {
  id: string; status: string; createdAt: string;
  hullSketchUrl?: string; hullSketchMarks?: string; videoUrl?: string; fuelPhotoUrl?: string; additionalObservations?: string;
  lifeVestsLoaned?: number;
  returnFuelPhotoUrl?: string; returnSketchMarks?: string; returnObservations?: string; returnCompletedAt?: string;
  hasVideo?: boolean; hasFuelPhoto?: boolean; hasSketchUrl?: boolean; hasReturnFuelPhoto?: boolean;
  boat?: { id: string; name: string; model?: string };
  operator?: { id: string; name: string };
  items?: { id: string; label: string; checked: boolean; notes?: string }[];
}
interface QueueEntry {
  id: string; status: string; scheduledAt: string; startedAt?: string; completedAt?: string;
  boat?: { id: string; name: string; model: string };
  client?: { id: string; name: string };
  reservation?: { id: string; startDate: string; endDate: string; status: string;
    user?: { id: string; name: string };
    checklist?: {
      id: string; status: string; lifeVestsLoaned?: number;
      hullSketchMarks?: string; hullSketchUrl?: string;
      fuelPhotoUrl?: string; videoUrl?: string;
      additionalObservations?: string;
      returnFuelPhotoUrl?: string; returnSketchMarks?: string;
      returnObservations?: string; returnCompletedAt?: string;
      items?: { id: string; label: string; checked: boolean; notes?: string; order: number }[];
    } | null;
  };
}
interface Boat { id: string; name: string; model?: string }
interface TodayRes {
  id: string; startDate: string; endDate: string; status: string;
  boat?: { id: string; name: string; model: string };
  user?: { id: string; name: string; phone?: string };
  checklist?: { id: string; status: string } | null;
  queue?: { id: string; status: string } | null;
}
interface ShareEntry { id: string; shareNumber: number; sharePercentage: number; user: { id: string; name: string; email: string; phone?: string } }
type WizStep = 'pick' | 'cotista' | 'items' | 'sketch' | 'fuel' | 'video' | 'confirm' | 'success';

const BRT = 'America/Sao_Paulo';
const fmt = (s: string) => new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: BRT });
const fmtD = (s: string) => new Date(s).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: BRT });

/* ═══════════════════════════════════════════════════════════════════════════
   Main page — switches between OPERATOR view and CLIENT view
═══════════════════════════════════════════════════════════════════════════ */
export default function OperationsPage() {
  const { user } = useAuth();
  if (!user) return null;
  if (user.role === 'OPERATOR') return <OperatorView />;
  return <ClientView />;
}

/* ═══════════════════════════════════════════════════════════════════════════
   OPERATOR VIEW
═══════════════════════════════════════════════════════════════════════════ */
function OperatorView() {
  const [tab, setTab]               = useState<'checkin' | 'confirmados' | 'onwater' | 'completed'>('checkin');
  const [checklists, setChecklists] = useCachedState<ChecklistEntry[]>('pc:operations:checklists', []);
  const [queue, setQueue]           = useCachedState<QueueEntry[]>('pc:operations:queue', []);
  const [todayRes, setTodayRes]     = useCachedState<TodayRes[]>('pc:operations:todayRes', []);
  const [loading, setLoading]       = useState(() => !hasCached('pc:operations:checklists'));
  const [showWizard, setShowWizard] = useState(false);
  const [continueChecklist, setContinueChecklist] = useState<ChecklistEntry | null>(null);
  const [wizardReservation, setWizardReservation] = useState<TodayRes | null>(null);
  const [postChecklistQueue, setPostChecklistQueue] = useState<QueueEntry | null>(null);
  const [detailCL, setDetailCL]     = useState<ChecklistEntry | null>(null);
  const [detailQ, setDetailQ]       = useState<QueueEntry | null>(null);
  const [returnInspectionItem, setReturnInspectionItem] = useState<QueueEntry | null>(null);
  const [liftingId, setLiftingId]   = useState<string | null>(null);
  const [launchingId, setLaunchingId] = useState<string | null>(null);

  const initialLoadDone = useRef(false);

  // Lightweight array equality — avoids JSON.stringify on large arrays
  const shallowEqualArrays = useCallback((a: any[], b: any[]) => {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i]?.id !== b[i]?.id) return false;
    }
    return true;
  }, []);

  const load = useCallback(async (silent = false) => {
    if (!silent && !hasCached('pc:operations:checklists')) setLoading(true);
    try {
      const [cRes, qRes, tRes] = await Promise.all([
        getChecklists().catch(() => ({ data: [] })),
        api.get('/operations/queue').catch(() => ({ data: [] })),
        api.get('/operations/pre-launch/today-reservations').catch(() => ({ data: [] })),
      ]);
      const d = cRes.data;
      const newChecklists = Array.isArray(d) ? d : d?.data || [];
      const q = qRes.data;
      const newQueue = Array.isArray(q) ? q : q?.data || [];
      const t = tRes.data;
      const newTodayRes = Array.isArray(t) ? t : t?.data || [];
      // Only update state if data actually changed (avoids unnecessary re-renders)
      setChecklists(prev => shallowEqualArrays(prev, newChecklists) ? prev : newChecklists);
      setQueue(prev => shallowEqualArrays(prev, newQueue) ? prev : newQueue);
      setTodayRes(prev => shallowEqualArrays(prev, newTodayRes) ? prev : newTodayRes);
    } finally { if (!silent) setLoading(false); }
  }, [shallowEqualArrays]);

  useEffect(() => { load().then(() => { initialLoadDone.current = true; }); }, [load]);
  useEffect(() => { const t = setInterval(() => load(true), 15000); return () => clearInterval(t); }, [load]);

  const pendingCL   = checklists.filter(c => c.status === 'PENDING');
  const approvedCL  = checklists.filter(c => c.status === 'APPROVED');
  const inWaterQ    = queue.filter(q => q.status === 'IN_WATER');
  const completedQ  = queue.filter(q => ['COMPLETED', 'RETURNING'].includes(q.status));
  const filteredWaiting = queue.filter(q => ['WAITING', 'PREPARING', 'LAUNCHING'].includes(q.status) && q.reservation?.status !== 'CANCELLED');
  const checklistDoneCount = filteredWaiting.filter(i => i.reservation?.checklist?.status === 'APPROVED').length;

  // Today's reservations needing check-in (includes those with PENDING checklist)
  const needsCheckin = todayRes.filter(r =>
    (!r.checklist || r.checklist.status === 'PENDING') && !r.queue && ['CONFIRMED', 'PENDING'].includes(r.status)
  );
  // Standalone pending checklists not linked to today's reservations
  const standalonePendingCL = pendingCL.filter(c => !needsCheckin.some(r => r.checklist?.id === c.id));
  const checkinCount = needsCheckin.length + standalonePendingCL.length + approvedCL.length;

  const handleDeleteChecklist = async (cl: ChecklistEntry) => {
    if (!confirm(`Excluir checklist de ${cl.boat?.name || 'embarcação'}?`)) return;
    // Optimistic: remove from local state immediately
    setChecklists(prev => prev.filter(c => c.id !== cl.id));
    try { await deleteChecklist(cl.id); load(true); } catch { alert('Erro ao excluir checklist'); load(true); }
  };
  const handleContinueChecklist = (cl: ChecklistEntry) => {
    setContinueChecklist(cl); setShowWizard(true);
  };
  const handleLift = (item: QueueEntry) => setReturnInspectionItem(item);
  const handleStartCheckin = (r: TodayRes) => { setWizardReservation(r); setShowWizard(true); };
  const handleStartCheckinFromQueue = (item: QueueEntry) => {
    const fakeRes: TodayRes = {
      id: item.reservation?.id || '',
      startDate: item.reservation?.startDate || item.scheduledAt,
      endDate: item.reservation?.endDate || item.scheduledAt,
      status: 'CONFIRMED',
      boat: item.boat,
      user: item.reservation?.user,
      checklist: null,
      queue: { id: item.id, status: item.status },
    };
    setPostChecklistQueue(item);
    setWizardReservation(fakeRes);
    setShowWizard(true);
  };
  const handleContinueChecklistFromQueue = (cl: ChecklistEntry, item: QueueEntry) => {
    setPostChecklistQueue(item);
    setContinueChecklist(cl);
    setShowWizard(true);
  };
  const doLiftBoat = async (item: QueueEntry, returnData?: Record<string, unknown>) => {
    setLiftingId(item.id);
    // Optimistic: move from IN_WATER to COMPLETED
    setQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: 'COMPLETED', completedAt: new Date().toISOString() } : q));
    try { await liftBoat(item.id, returnData); load(true); }
    catch { alert('Erro ao subir jet ski'); load(true); } finally { setLiftingId(null); }
  };
  const handleLaunchToWater = async (item: QueueEntry) => {
    if (!confirm(`Colocar ${item.boat?.name || 'jet ski'} na água?`)) return;
    setLaunchingId(item.id);
    // Optimistic: move from WAITING to IN_WATER
    setQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: 'IN_WATER', startedAt: new Date().toISOString() } : q));
    try { await launchToWater(item.id); load(true); }
    catch { alert('Erro ao colocar na água'); load(true); } finally { setLaunchingId(null); }
  };

  const tabs = [
    { id: 'checkin' as const, label: `Check-in (${checkinCount})` },
    { id: 'confirmados' as const, label: `Confirmados (${filteredWaiting.length})`, badge: checklistDoneCount },
    { id: 'onwater' as const,    label: `Na Água (${inWaterQ.length})` },
    { id: 'completed' as const,  label: `Concluídos (${completedQ.length})` },
  ];

  return (
    <div className="p-4 pb-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between pt-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-primary-500/15 to-primary-400/5 border border-primary-500/10 flex items-center justify-center">
            <ClipboardCheck className="w-5 h-5 text-primary-500" />
          </div>
          <p className="text-xs text-[var(--text-secondary)]">
            <span className="font-medium text-primary-400">{needsCheckin.length}</span> check-in ·{' '}
            <span className="font-medium text-emerald-400">{inWaterQ.length}</span> na água
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => load(true)} className="p-2 hover:bg-[var(--subtle)] rounded-xl text-[var(--text-muted)]"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button>
          <button onClick={() => setShowWizard(true)}
            className="flex items-center gap-1.5 px-3.5 py-2.5 bg-gradient-to-r from-primary-500 to-primary-400 text-white rounded-xl text-xs font-bold shadow-[0_4px_14px_rgba(0,117,119,0.3)]">
            <Plus className="w-4 h-4" />Checklist
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 bg-[var(--subtle)] p-1.5 rounded-2xl overflow-x-auto">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`relative flex-1 whitespace-nowrap px-3 py-2 rounded-xl text-xs font-semibold transition-all ${tab === t.id ? 'bg-[var(--card)] text-[var(--text)] shadow-sm' : 'text-[var(--text-secondary)]'}`}>
            {t.label}
            {'badge' in t && (t.badge ?? 0) > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">{t.badge}</span>
            )}
          </button>
        ))}
      </div>

      {loading && <div className="flex items-center justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-primary-500" /></div>}

      {/* CHECK-IN TAB */}
      {!loading && tab === 'checkin' && (
        checkinCount === 0 ? (
          <div className="text-center py-16">
            <ClipboardCheck className="w-12 h-12 mx-auto mb-3 text-[var(--text-muted)]" />
            <p className="text-sm text-[var(--text-muted)] font-medium">Nenhuma reserva para hoje</p>
            <p className="text-xs text-[var(--text-muted)] mt-1">Toque em "Checklist" para criar avulso</p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Reservations needing check-in (including those with PENDING checklist) */}
            {needsCheckin.length > 0 && (
              <div>
                <p className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-primary-500" />Aguardando Check-in ({needsCheckin.length})
                </p>
                {needsCheckin.map(r => {
                  const hasPendingCL = r.checklist?.status === 'PENDING';
                  const matchingCl = hasPendingCL ? checklists.find(c => c.id === r.checklist?.id) : null;
                  return (
                    <div key={r.id} className={`bg-[var(--card)] border-2 rounded-2xl p-4 mb-2 ${hasPendingCL ? 'border-yellow-400/40' : 'border-primary-400/40'}`}>
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-xl bg-primary-500/10 flex items-center justify-center flex-shrink-0"><Ship className="w-4.5 h-4.5 text-primary-500" /></div>
                          <div>
                            <p className="font-bold text-sm text-[var(--text)]">{r.boat?.name || '—'}</p>
                            <p className="text-[11px] text-[var(--text-secondary)]">{r.boat?.model}</p>
                          </div>
                        </div>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${hasPendingCL ? 'bg-yellow-500/10 text-yellow-500' : 'bg-primary-500/10 text-primary-500'}`}>
                          {hasPendingCL ? 'Pendente' : 'Reservado'}
                        </span>
                      </div>
                      <div className="space-y-1 mb-3">
                        <p className="text-xs text-[var(--text-secondary)] flex items-center gap-1.5"><User className="w-3 h-3" />{r.user?.name || '—'}</p>
                        <p className="text-xs text-primary-500 font-medium flex items-center gap-1.5"><Clock className="w-3 h-3" />{fmt(r.startDate)} → {fmt(r.endDate)}</p>
                      </div>
                      {hasPendingCL && matchingCl ? (
                        <button onClick={() => handleContinueChecklist(matchingCl)}
                          className="w-full py-2 bg-yellow-500 hover:bg-yellow-600 text-white rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5">
                          <ChevronRight className="w-3.5 h-3.5" />Continuar Check-in
                        </button>
                      ) : (
                        <button onClick={() => handleStartCheckin(r)}
                          className="w-full py-2 bg-gradient-to-r from-primary-500 to-primary-400 hover:from-primary-600 hover:to-primary-500 text-white rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5">
                          <ClipboardCheck className="w-3.5 h-3.5" />Realizar Check-in
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {standalonePendingCL.length > 0 && (
              <div>
                <p className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-yellow-500" />Avulsos em Andamento ({standalonePendingCL.length})
                </p>
                {standalonePendingCL.map(cl => <CLCardMobile key={cl.id} cl={cl} onView={setDetailCL} onContinue={handleContinueChecklist} onDelete={handleDeleteChecklist} />)}
              </div>
            )}
            {approvedCL.length > 0 && (
              <div>
                <p className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />Prontos ({approvedCL.length})
                </p>
                {approvedCL.map(cl => <CLCardMobile key={cl.id} cl={cl} onView={setDetailCL} onDelete={handleDeleteChecklist} />)}
              </div>
            )}
          </div>
        )
      )}

      {/* CONFIRMADOS TAB */}
      {!loading && tab === 'confirmados' && (
        filteredWaiting.length === 0 ? (
          <div className="text-center py-16">
            <Clock className="w-12 h-12 mx-auto mb-3 text-[var(--text-muted)]" />
            <p className="text-sm text-[var(--text-muted)] font-medium">Nenhum confirmado aguardando</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredWaiting.map(item => {
              const checklistApproved = item.reservation?.checklist?.status === 'APPROVED';
              const checklistPending = item.reservation?.checklist?.status === 'PENDING';
              const existingPendingCL = checklistPending ? checklists.find(c => c.id === item.reservation?.checklist?.id) || null : null;
              const statusCfg: Record<string, { label: string; color: string }> = {
                WAITING:   { label: 'Aguardando',  color: 'bg-gray-100 text-gray-600' },
                PREPARING: { label: 'Preparando',  color: 'bg-yellow-100 text-yellow-600' },
                LAUNCHING: { label: 'Descendo',    color: 'bg-blue-100 text-blue-600' },
              };
              const cfg = statusCfg[item.status] || statusCfg.WAITING;
              return (
                <div key={item.id} className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-bold text-[var(--text)]">{item.boat?.name || '—'}</p>
                      <p className="text-xs text-[var(--text-secondary)]">{item.boat?.model}</p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.color}`}>{cfg.label}</span>
                  </div>
                  <div className="space-y-1 mb-3">
                    {item.client?.name && <p className="text-xs text-[var(--text-secondary)] flex items-center gap-1.5"><User className="w-3 h-3" />{item.client.name}</p>}
                    {item.reservation?.startDate && <p className="text-xs text-[var(--text-secondary)] flex items-center gap-1.5"><Clock className="w-3 h-3" />{fmt(item.reservation.startDate)}</p>}
                  </div>
                  {checklistApproved && (
                    <div className="mb-2 flex items-center gap-1.5 px-2 py-1 bg-green-500/10 rounded-xl">
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                      <span className="text-[11px] font-bold text-green-500 uppercase tracking-wide">Checklist Feito</span>
                    </div>
                  )}
                  {checklistApproved && item.status === 'WAITING' && (
                    <button
                      disabled={launchingId === item.id}
                      onClick={() => handleLaunchToWater(item)}
                      className="w-full py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-xl text-sm font-bold transition-colors flex items-center justify-center gap-2"
                    >
                      {launchingId === item.id ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Waves className="w-4 h-4" />}
                      Ir para a água
                    </button>
                  )}
                  {!item.reservation?.checklist && (
                    <button
                      onClick={() => handleStartCheckinFromQueue(item)}
                      className="w-full py-2.5 bg-gradient-to-r from-primary-500 to-primary-400 hover:from-primary-600 hover:to-primary-500 text-white rounded-xl text-sm font-bold transition-colors flex items-center justify-center gap-2"
                    >
                      <ClipboardCheck className="w-4 h-4" />Realizar Checklist
                    </button>
                  )}
                  {checklistPending && existingPendingCL && (
                    <button
                      onClick={() => handleContinueChecklistFromQueue(existingPendingCL, item)}
                      className="w-full py-2.5 bg-yellow-500 hover:bg-yellow-600 text-white rounded-xl text-sm font-bold transition-colors flex items-center justify-center gap-2"
                    >
                      <ChevronRight className="w-4 h-4" />Continuar Checklist
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )
      )}

      {/* NA ÁGUA TAB */}
      {!loading && tab === 'onwater' && (
        inWaterQ.length === 0 ? (
          <div className="text-center py-16">
            <Waves className="w-12 h-12 mx-auto mb-3 text-[var(--text-muted)]" />
            <p className="text-sm text-[var(--text-muted)] font-medium">Nenhum jet ski na água</p>
          </div>
        ) : (
          <div className="space-y-3">
            {inWaterQ.map(item => (
              <div key={item.id} className="bg-[var(--card)] border-2 border-emerald-500/20 rounded-2xl p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-bold text-[var(--text)]">{item.boat?.name || '—'}</p>
                    <p className="text-xs text-[var(--text-secondary)]">{item.boat?.model}</p>
                  </div>
                  <span className="text-xs px-2 py-1 rounded-full font-medium bg-green-100 text-emerald-400 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse inline-block" />Na Água
                  </span>
                </div>
                <div className="space-y-1 mb-3">
                  {item.client?.name && <p className="text-sm text-[var(--text)] flex items-center gap-2"><User className="w-3.5 h-3.5 text-[var(--text-muted)]" />{item.client.name}</p>}
                  {item.startedAt && <p className="text-xs text-[var(--text-secondary)] flex items-center gap-2"><Clock className="w-3.5 h-3.5" />Desceu às {fmt(item.startedAt)}</p>}
                  {item.reservation?.endDate && <p className="text-xs text-primary-400 font-medium flex items-center gap-2"><Clock className="w-3.5 h-3.5" />Retorno: {fmt(item.reservation.endDate)}</p>}
                </div>
                <button disabled={liftingId === item.id} onClick={() => handleLift(item)}
                  className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-sm font-bold transition-colors flex items-center justify-center gap-2">
                  {liftingId === item.id ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ArrowUp className="w-4 h-4" />}Subir Jet
                </button>
              </div>
            ))}
          </div>
        )
      )}

      {/* CONCLUÍDOS TAB */}
      {!loading && tab === 'completed' && (
        completedQ.length === 0 ? (
          <div className="text-center py-16">
            <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-[var(--text-muted)]" />
            <p className="text-sm text-[var(--text-muted)] font-medium">Nenhum uso concluído</p>
          </div>
        ) : (
          <div className="space-y-2">
            {completedQ.map(item => (
              <button key={item.id} onClick={() => setDetailQ(item)}
                className="w-full text-left bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 flex items-center gap-3 hover:border-primary-500/20 transition-colors">
                <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center flex-shrink-0">
                  <CheckCircle2 className="w-5 h-5 text-teal-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-[var(--text)] text-sm">{item.boat?.name || '—'}</p>
                  <p className="text-xs text-[var(--text-secondary)]">{item.client?.name}</p>
                  {item.startedAt && <p className="text-xs text-[var(--text-muted)]">{fmt(item.startedAt)} → {item.completedAt ? fmt(item.completedAt) : '—'}</p>}
                </div>
                <ChevronRight className="w-4 h-4 text-[var(--text-muted)] flex-shrink-0" />
              </button>
            ))}
          </div>
        )
      )}

      {showWizard && (
        <OperatorChecklistWizard
          existingChecklist={continueChecklist}
          preSelectedReservation={wizardReservation}
          onClose={() => { setShowWizard(false); setContinueChecklist(null); setWizardReservation(null); setPostChecklistQueue(null); }}
          onSuccess={() => { setShowWizard(false); setContinueChecklist(null); setWizardReservation(null); load(true); }}
        />
      )}
      {!showWizard && postChecklistQueue && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-[var(--card)] rounded-t-3xl sm:rounded-2xl w-full sm:max-w-sm shadow-2xl p-6">
            <div className="text-center mb-5">
              <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-3">
                <CheckCircle2 className="w-6 h-6 text-green-500" />
              </div>
              <h3 className="text-base font-bold text-[var(--text)]">Checklist Concluído!</h3>
              <p className="text-xs text-[var(--text-secondary)] mt-1">O que deseja fazer com <strong>{postChecklistQueue.boat?.name || 'o jet'}</strong>?</p>
            </div>
            <div className="space-y-3">
              <button
                disabled={launchingId === postChecklistQueue.id}
                onClick={async () => {
                  setLaunchingId(postChecklistQueue.id);
                  try { await launchToWater(postChecklistQueue.id); }
                  catch { alert('Erro ao colocar na água'); }
                  finally { setLaunchingId(null); }
                  setPostChecklistQueue(null);
                  load(true);
                }}
                className="w-full py-3 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-xl text-sm font-bold transition-colors flex items-center justify-center gap-2"
              >
                {launchingId === postChecklistQueue.id ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Waves className="w-4 h-4" />}
                Ir para a Água
              </button>
              <button
                onClick={() => { setPostChecklistQueue(null); load(true); }}
                className="w-full py-3 border border-[var(--border)] hover:bg-[var(--subtle)] text-[var(--text)] rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2"
              >
                <Clock className="w-4 h-4" />Aguardando Cliente
              </button>
            </div>
          </div>
        </div>
      )}
      {detailCL && <CLDetailSheet cl={detailCL} onClose={() => setDetailCL(null)} />}
      {detailQ && <QueueDetailSheet item={detailQ} onClose={() => setDetailQ(null)} />}
      {returnInspectionItem && (
        <ReturnInspectionModal
          item={returnInspectionItem}
          onClose={() => setReturnInspectionItem(null)}
          onConfirm={async (data) => { setReturnInspectionItem(null); await doLiftBoat(returnInspectionItem, data); }}
        />
      )}
    </div>
  );
}

/* ─── Queue detail bottom sheet ─────────────────────────────────────────── */
function QueueDetailSheet({ item, onClose }: { item: QueueEntry; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
      <div className="bg-[var(--card)] rounded-t-3xl w-full max-h-[70vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-[var(--border)]">
          <div>
            <h2 className="font-bold text-[var(--text)]">Uso Concluído — {item.boat?.name}</h2>
            <p className="text-xs text-[var(--text-secondary)]">{item.boat?.model}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-[var(--subtle)] rounded-xl"><X className="w-5 h-5 text-[var(--text-secondary)]" /></button>
        </div>
        <div className="p-5 space-y-3 pb-10">
          <span className="inline-block px-3 py-1 bg-teal-50 border border-teal-100 rounded-full text-xs font-semibold text-teal-600">Concluído</span>
          {item.client?.name && (
            <div className="flex items-center gap-3 p-3 bg-[var(--subtle)] rounded-xl">
              <User className="w-4 h-4 text-[var(--text-muted)]" />
              <div><p className="text-xs text-[var(--text-secondary)]">Cliente</p><p className="text-sm font-semibold text-[var(--text)]">{item.client.name}</p></div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            {item.startedAt && (
              <div className="p-3 bg-blue-500/10 rounded-xl">
                <p className="text-xs text-blue-500 font-medium">Desceu</p>
                <p className="text-sm font-bold text-blue-700">{fmt(item.startedAt)}</p>
              </div>
            )}
            {item.completedAt && (
              <div className="p-3 bg-teal-50 rounded-xl">
                <p className="text-xs text-teal-500 font-medium">Subiu</p>
                <p className="text-sm font-bold text-teal-700">{fmt(item.completedAt)}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Mobile checklist card ─────────────────────────────────────────────── */
function CLCardMobile({ cl, onView, onContinue, onDelete }: { cl: ChecklistEntry; onView: (c: ChecklistEntry) => void; onContinue?: (c: ChecklistEntry) => void; onDelete?: (c: ChecklistEntry) => void }) {
  const checked = cl.items?.filter(i => i.checked).length ?? 0;
  const total   = cl.items?.length ?? 0;
  return (
    <div className={`bg-[var(--card)] border rounded-2xl p-4 mb-2 ${cl.status === 'APPROVED' ? 'border-green-100' : 'border-yellow-100'}`}>
      <div className="flex items-start justify-between mb-2">
        <div>
          <p className="font-bold text-[var(--text)] text-sm">{cl.boat?.name || '—'}</p>
          <p className="text-xs text-[var(--text-secondary)]">{cl.operator?.name} · {cl.createdAt ? fmtD(cl.createdAt) : ''}</p>
        </div>
        <span className={`text-xs px-2 py-1 rounded-full font-medium ${cl.status === 'APPROVED' ? 'bg-green-100 text-emerald-400' : 'bg-yellow-100 text-yellow-400'}`}>
          {cl.status === 'APPROVED' ? 'Aprovado' : 'Pendente'}
        </span>
      </div>
      <div className="flex items-center gap-3 mb-2.5 text-xs text-[var(--text-secondary)]">
        <span>{checked}/{total} itens</span>
        {(cl.hullSketchMarks || cl.hullSketchUrl || cl.hasSketchUrl) && <span className="flex items-center gap-1 text-blue-500"><PenLine className="w-3 h-3" />Croqui</span>}
        {(cl.fuelPhotoUrl || cl.hasFuelPhoto) && <span className="flex items-center gap-1 text-primary-500"><Camera className="w-3 h-3" />Tanque</span>}
        {(cl.videoUrl || cl.hasVideo) && <span className="flex items-center gap-1 text-purple-500"><Video className="w-3 h-3" />Vídeo</span>}
      </div>
      {(cl.lifeVestsLoaned ?? 0) > 0 && (
        <div className="mb-2 flex items-center gap-2 px-3 py-1.5 bg-primary-500/10 border border-primary-500/20 rounded-xl">
          <span className="text-base">🦺</span>
          <span className="text-xs font-bold text-primary-400">{cl.lifeVestsLoaned} colete{(cl.lifeVestsLoaned ?? 0) > 1 ? 's' : ''} emprestado{(cl.lifeVestsLoaned ?? 0) > 1 ? 's' : ''}</span>
        </div>
      )}
      <div className="w-full bg-[var(--subtle)] rounded-full h-1.5 mb-3">
        <div className={`h-1.5 rounded-full ${cl.status === 'APPROVED' ? 'bg-emerald-500' : 'bg-yellow-400'}`} style={{ width: `${total ? (checked/total)*100 : 0}%` }} />
      </div>
      <div className="flex gap-2">
        <button onClick={() => onView(cl)} className="flex-1 py-1.5 border border-[var(--border)] hover:bg-[var(--subtle)] rounded-xl text-xs font-medium text-[var(--text-secondary)] flex items-center justify-center gap-1">
          <Eye className="w-3.5 h-3.5" />Detalhes
        </button>
        {onContinue && cl.status === 'PENDING' && (
          <button onClick={() => onContinue(cl)} className="flex-1 py-1.5 bg-gradient-to-r from-primary-500 to-primary-400 hover:from-primary-600 hover:to-primary-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1">
            <ChevronRight className="w-3.5 h-3.5" />Continuar
          </button>
        )}
        {onDelete && (
          <button onClick={() => onDelete(cl)} className="py-1.5 px-2.5 border border-red-500/30 hover:bg-red-500/10 rounded-xl text-xs font-medium text-red-500 flex items-center justify-center">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

/* ─── Checklist detail bottom sheet ─────────────────────────────────────── */
function CLDetailSheet({ cl: initialCL, onClose }: { cl: ChecklistEntry; onClose: () => void }) {
  const [cl, setCl] = useState(initialCL);
  const [openSection, setOpenSection] = useState<string | null>(null);
  const [zoomImg, setZoomImg] = useState<string | null>(null);
  const [mediaLoading, setMediaLoading] = useState(false);
  const toggle = (key: string) => {
    // Lazy-fetch media when first expanding a media section
    if (!cl.videoUrl && !cl.fuelPhotoUrl && (cl.hasVideo || cl.hasFuelPhoto || cl.hasSketchUrl || cl.hasReturnFuelPhoto) && !mediaLoading) {
      setMediaLoading(true);
      getChecklistById(cl.id).then((res: any) => {
        const full = res.data;
        if (full) setCl(prev => ({ ...prev, videoUrl: full.videoUrl, fuelPhotoUrl: full.fuelPhotoUrl, hullSketchUrl: full.hullSketchUrl, returnFuelPhotoUrl: full.returnFuelPhotoUrl }));
      }).catch(() => {}).finally(() => setMediaLoading(false));
    }
    setOpenSection(prev => prev === key ? null : key);
  };
  const hasReturn = !!cl.returnCompletedAt;
  const uncheckedItems = cl.items?.filter(i => !i.checked) || [];
  const checked = cl.items?.filter(i => i.checked).length ?? 0;
  const total   = cl.items?.length ?? 0;
  const fmtDT = (s: string) => new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: BRT });

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
      {/* Photo zoom overlay */}
      {zoomImg && (
        <div className="fixed inset-0 bg-black/90 z-[100] flex items-center justify-center p-4" onClick={() => setZoomImg(null)}>
          <button onClick={() => setZoomImg(null)} className="absolute top-4 right-4 text-white/70 hover:text-white z-10"><X className="w-7 h-7" /></button>
          <img loading="lazy" decoding="async" src={resolveMediaUrl(zoomImg)} alt="Zoom" className="max-w-full max-h-full object-contain rounded-xl" onClick={e => e.stopPropagation()} />
        </div>
      )}
      <div className="bg-[var(--card)] rounded-t-3xl w-full max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-[var(--border)]">
          <div>
            <h2 className="font-bold text-[var(--text)]">Checklist — {cl.boat?.name}</h2>
            <p className="text-xs text-[var(--text-secondary)]">{cl.operator?.name} · {cl.createdAt ? fmtDT(cl.createdAt) : ''}{hasReturn ? ` → ${fmtDT(cl.returnCompletedAt!)}` : ''}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-[var(--subtle)] rounded-xl"><X className="w-5 h-5 text-[var(--text-secondary)]" /></button>
        </div>
        <div className="p-5 space-y-3 pb-10">
          {/* Status + stats */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${hasReturn ? 'bg-blue-500/10' : cl.status === 'APPROVED' ? 'bg-emerald-500/10' : 'bg-yellow-500/10'}`}>
                {hasReturn ? <RefreshCw className="w-4 h-4 text-blue-500" /> : <CheckCircle className="w-4 h-4 text-emerald-500" />}
              </div>
              <div>
                <p className="text-sm font-bold text-[var(--text)]">{hasReturn ? 'Completo' : cl.status === 'APPROVED' ? 'Aprovado' : 'Pendente'}</p>
                <p className="text-xs text-[var(--text-muted)]">{checked}/{total} itens · {(cl.lifeVestsLoaned ?? 0) > 0 ? `${cl.lifeVestsLoaned} colete(s)` : ''}</p>
              </div>
            </div>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cl.status === 'APPROVED' ? 'bg-green-100 text-emerald-400' : 'bg-yellow-100 text-yellow-400'}`}>
              {cl.status === 'APPROVED' ? 'Aprovado' : 'Pendente'}
            </span>
          </div>

          {/* Alertas */}
          {uncheckedItems.length > 0 && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3">
              <p className="text-xs font-bold text-red-500 flex items-center gap-1.5 mb-1"><AlertTriangle className="w-3.5 h-3.5" /> Pendências</p>
              {uncheckedItems.map(item => (
                <p key={item.id} className="text-xs text-red-600 py-0.5 flex items-center gap-1.5"><X className="w-3 h-3 flex-shrink-0" />{item.label}</p>
              ))}
            </div>
          )}

          {/* Comparação Saída vs Retorno */}
          {hasReturn && (
            <div className="bg-[var(--subtle)] rounded-2xl overflow-hidden">
              <div className="grid grid-cols-2">
                <div className="px-3 py-1.5 text-center border-r border-[var(--border)] bg-emerald-500/5">
                  <p className="text-[10px] font-bold text-emerald-600 uppercase">⬇ Saída</p>
                </div>
                <div className="px-3 py-1.5 text-center bg-blue-500/5">
                  <p className="text-[10px] font-bold text-blue-600 uppercase">⬆ Retorno</p>
                </div>
              </div>

              {(cl.fuelPhotoUrl || cl.returnFuelPhotoUrl || cl.hasFuelPhoto || cl.hasReturnFuelPhoto) && (
                <div className="border-t border-[var(--border)]">
                  <button onClick={() => toggle('d-fuel')} className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium text-[var(--text)]">
                    <span>⛽ Combustível</span>
                    <ChevronRight className={`w-4 h-4 text-[var(--text-muted)] transition-transform ${openSection === 'd-fuel' ? 'rotate-90' : ''}`} />
                  </button>
                  {openSection === 'd-fuel' && (
                    <div className="grid grid-cols-2 gap-px bg-[var(--border)]">
                      <div className="bg-[var(--card)] p-2">
                        {cl.fuelPhotoUrl ? <img loading="lazy" decoding="async" src={resolveMediaUrl(cl.fuelPhotoUrl)} alt="Saída" className="w-full rounded-lg object-contain max-h-36 cursor-pointer active:scale-95 transition-transform" onClick={() => setZoomImg(cl.fuelPhotoUrl!)} /> : <p className="text-xs text-[var(--text-muted)] text-center py-6">—</p>}
                      </div>
                      <div className="bg-[var(--card)] p-2">
                        {cl.returnFuelPhotoUrl ? <img loading="lazy" decoding="async" src={resolveMediaUrl(cl.returnFuelPhotoUrl)} alt="Retorno" className="w-full rounded-lg object-contain max-h-36 cursor-pointer active:scale-95 transition-transform" onClick={() => setZoomImg(cl.returnFuelPhotoUrl!)} /> : <p className="text-xs text-[var(--text-muted)] text-center py-6">—</p>}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {(cl.hullSketchMarks || cl.returnSketchMarks) && (
                <div className="border-t border-[var(--border)]">
                  <button onClick={() => toggle('d-sketch')} className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium text-[var(--text)]">
                    <span className="flex items-center gap-2"><PenLine className="w-4 h-4 text-blue-500" /> Avarias</span>
                    <ChevronRight className={`w-4 h-4 text-[var(--text-muted)] transition-transform ${openSection === 'd-sketch' ? 'rotate-90' : ''}`} />
                  </button>
                  {openSection === 'd-sketch' && (
                    <div className="grid grid-cols-2 gap-px bg-[var(--border)]">
                      <div className="bg-[var(--card)] p-2">
                        {cl.hullSketchMarks ? <JetSki3DMarkViewer marksJson={cl.hullSketchMarks} height={160} /> : <p className="text-xs text-[var(--text-muted)] text-center py-6">—</p>}
                      </div>
                      <div className="bg-[var(--card)] p-2">
                        {cl.returnSketchMarks ? <JetSki3DMarkViewer marksJson={cl.hullSketchMarks} markColor="#ef4444" secondaryMarksJson={cl.returnSketchMarks} secondaryMarkColor="#ff6600" height={160} /> : <p className="text-xs text-[var(--text-muted)] text-center py-6">—</p>}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {(cl.additionalObservations || cl.returnObservations) && (
                <div className="border-t border-[var(--border)]">
                  <button onClick={() => toggle('d-obs')} className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium text-[var(--text)]">
                    <span className="flex items-center gap-2"><AlertCircle className="w-4 h-4 text-amber-500" /> Observações</span>
                    <ChevronRight className={`w-4 h-4 text-[var(--text-muted)] transition-transform ${openSection === 'd-obs' ? 'rotate-90' : ''}`} />
                  </button>
                  {openSection === 'd-obs' && (
                    <div className="grid grid-cols-2 gap-px bg-[var(--border)]">
                      <div className="bg-[var(--card)] p-2.5"><p className="text-xs text-[var(--text)]">{cl.additionalObservations || '—'}</p></div>
                      <div className="bg-[var(--card)] p-2.5"><p className="text-xs text-[var(--text)]">{cl.returnObservations || '—'}</p></div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Seções expansíveis (sem retorno) */}
          {!hasReturn && (
            <div className="bg-[var(--subtle)] rounded-2xl overflow-hidden divide-y divide-[var(--border)]">
              {(cl.hullSketchMarks || cl.hullSketchUrl || cl.hasSketchUrl) && (
                <div>
                  <button onClick={() => toggle('d-sketch')} className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium text-[var(--text)]">
                    <span className="flex items-center gap-2"><PenLine className="w-4 h-4 text-blue-500" /> Croqui do Casco</span>
                    <ChevronRight className={`w-4 h-4 text-[var(--text-muted)] transition-transform ${openSection === 'd-sketch' ? 'rotate-90' : ''}`} />
                  </button>
                  {openSection === 'd-sketch' && (
                    <div className="p-3 pt-0 bg-[var(--card)]">
                      {cl.hullSketchMarks ? <JetSki3DMarkViewer marksJson={cl.hullSketchMarks} height={220} /> : cl.hullSketchUrl ? <img loading="lazy" decoding="async" src={resolveMediaUrl(cl.hullSketchUrl)} alt="Croqui" className="w-full" /> : null}
                    </div>
                  )}
                </div>
              )}
              {(cl.fuelPhotoUrl || cl.hasFuelPhoto) && (
                <div>
                  <button onClick={() => toggle('d-fuel')} className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium text-[var(--text)]">
                    <span>⛽ Foto do Tanque</span>
                    <ChevronRight className={`w-4 h-4 text-[var(--text-muted)] transition-transform ${openSection === 'd-fuel' ? 'rotate-90' : ''}`} />
                  </button>
                  {openSection === 'd-fuel' && <div className="p-3 pt-0 bg-[var(--card)]">
                    {cl.fuelPhotoUrl ? <img loading="lazy" decoding="async" src={resolveMediaUrl(cl.fuelPhotoUrl)} alt="Tanque" className="w-full object-contain max-h-48 rounded-xl cursor-pointer active:scale-95 transition-transform" onClick={() => setZoomImg(cl.fuelPhotoUrl!)} />
                      : mediaLoading ? <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-[var(--text-muted)]" /></div>
                      : <p className="text-xs text-[var(--text-muted)] text-center py-4">Carregando...</p>}
                  </div>}
                </div>
              )}
              {cl.additionalObservations && (
                <div>
                  <button onClick={() => toggle('d-obs')} className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium text-[var(--text)]">
                    <span className="flex items-center gap-2"><AlertCircle className="w-4 h-4 text-amber-500" /> Observações</span>
                    <ChevronRight className={`w-4 h-4 text-[var(--text-muted)] transition-transform ${openSection === 'd-obs' ? 'rotate-90' : ''}`} />
                  </button>
                  {openSection === 'd-obs' && <div className="p-3 pt-0 bg-[var(--card)]"><p className="text-sm text-[var(--text)]">{cl.additionalObservations}</p></div>}
                </div>
              )}
            </div>
          )}

          {(cl.videoUrl || cl.hasVideo) && (
            <div className="bg-[var(--subtle)] rounded-2xl overflow-hidden">
              <button onClick={() => toggle('d-video')} className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium text-[var(--text)]">
                <span className="flex items-center gap-2"><Video className="w-4 h-4 text-primary-500" /> Vídeo</span>
                <ChevronRight className={`w-4 h-4 text-[var(--text-muted)] transition-transform ${openSection === 'd-video' ? 'rotate-90' : ''}`} />
              </button>
              {openSection === 'd-video' && <div className="p-3 pt-0 bg-[var(--card)]">
                {cl.videoUrl ? <video src={resolveMediaUrl(cl.videoUrl)} controls className="w-full rounded-xl" style={{ maxHeight: 200 }} />
                  : mediaLoading ? <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-[var(--text-muted)]" /></div>
                  : <p className="text-xs text-[var(--text-muted)] text-center py-4">Carregando...</p>}
              </div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Operator checklist wizard (bottom sheet) ───────────────────────────── */
function OperatorChecklistWizard({ existingChecklist, preSelectedReservation, onClose, onSuccess }: { existingChecklist?: ChecklistEntry | null; preSelectedReservation?: TodayRes | null; onClose: () => void; onSuccess: () => void }) {
  const [step, setStep]                 = useState<WizStep>(existingChecklist ? 'items' : (preSelectedReservation ? 'cotista' : 'pick'));
  const [todayRes, setTodayRes]         = useState<TodayRes[]>([]);
  const [allBoats, setAllBoats]         = useState<Boat[]>([]);
  const [loadingPick, setLoadingPick]   = useState(true);
  const [pickMode, setPickMode]         = useState<'today' | 'adhoc'>('today');
  const [selectedBoatId, setSelectedBoatId] = useState(existingChecklist?.boat?.id || '');
  const [checklistId, setChecklistId]   = useState<string | null>(existingChecklist?.id || null);
  const [boatName, setBoatName]         = useState(existingChecklist?.boat?.name || '');
  const [itemsData, setItemsData]       = useState<{ id: string; label: string; checked: boolean }[]>(
    existingChecklist?.items?.map(i => ({ id: i.id, label: i.label, checked: i.checked })) || []
  );
  const [observations, setObservations] = useState(existingChecklist?.additionalObservations || '');
  const [lifeVestsLoaned, setLifeVestsLoaned] = useState(existingChecklist?.lifeVestsLoaned || 0);
  const [videoFile, setVideoFile]       = useState<File | null>(null);
  const [fuelPhotoFile, setFuelPhotoFile] = useState<File | null>(null);
  const [sketchUrl, setSketchUrl]       = useState<string | undefined>();
  const [sketchMarks, setSketchMarks]   = useState<string | undefined>();
  const [submitting, setSubmitting]     = useState(false);
  const [error, setError]               = useState('');
  // Cotista selection
  const [shareholders, setShareholders] = useState<ShareEntry[]>([]);
  const [selectedCotistaId, setSelectedCotistaId] = useState<string | null>(null);
  const [pendingReservation, setPendingReservation] = useState<TodayRes | null>(null);
  // Overdue charges
  const [overdueCharges, setOverdueCharges] = useState<{ description: string; amount: number; dueDate: string; userName?: string }[]>([]);
  const sketchRef = useRef<JetSki3DSketchRef>(null);
  const [lastBoatMarks, setLastBoatMarks] = useState<InitialMark[]>([]);

  // Fetch last damage marks when boat is known (existing checklist or pre-selected)
  useEffect(() => {
    const boatId = existingChecklist?.boat?.id || preSelectedReservation?.boat?.id;
    if (boatId) {
      getLastMarksForBoat(boatId).then((r: any) => {
        const marks = Array.isArray(r.data) ? r.data : [];
        setLastBoatMarks(marks);
      }).catch(() => setLastBoatMarks([]));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    Promise.all([
      getTodayReservationsForOperator().catch(() => ({ data: [] })),
      getBoats().catch(() => ({ data: [] })),
    ]).then(([tRes, bRes]) => {
      const t = tRes.data; setTodayRes(Array.isArray(t) ? t : t?.data || []);
      const b = bRes.data; setAllBoats(Array.isArray(b) ? b : b?.data || []);
    }).finally(() => setLoadingPick(false));
  }, []);

  // Auto-load shareholders when pre-selected reservation is provided
  useEffect(() => {
    if (preSelectedReservation?.boat?.id) {
      setPendingReservation(preSelectedReservation);
      setBoatName(preSelectedReservation.boat?.name || '');
      setSelectedBoatId(preSelectedReservation.boat?.id || '');
      getSharesByBoat(preSelectedReservation.boat.id).then((res: any) => {
        const shares = res.data?.data || res.data || [];
        setShareholders(Array.isArray(shares) ? shares : []);
        const userId = preSelectedReservation.user?.id;
        if (userId && Array.isArray(shares) && shares.some((s: ShareEntry) => s.user?.id === userId)) {
          setSelectedCotistaId(userId);
        }
      }).catch(() => setShareholders([]));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preSelectedReservation]);

  async function fetchOverdueCharges(boatId: string, userId?: string | null) {
    try {
      const params: Record<string, string> = { status: 'OVERDUE', boatId };
      if (userId) params.userId = userId;
      const res = await getCharges(params);
      const charges = res.data?.data || res.data || [];
      if (Array.isArray(charges)) setOverdueCharges(charges.map((c: { description: string; amount: number; dueDate: string; user?: { name: string } }) => ({ description: c.description, amount: c.amount, dueDate: c.dueDate, userName: c.user?.name })));
    } catch { /* ignore */ }
  }

  async function handlePickReservation(r: TodayRes) {
    setError('');
    setPendingReservation(r);
    setBoatName(r.boat?.name || '');
    setSelectedBoatId(r.boat?.id || '');
    try {
      const res = await getSharesByBoat(r.boat!.id);
      const shares = res.data?.data || res.data || [];
      setShareholders(Array.isArray(shares) ? shares : []);
      const userId = r.user?.id;
      if (userId && Array.isArray(shares) && shares.some((s: ShareEntry) => s.user?.id === userId)) {
        setSelectedCotistaId(userId);
      } else { setSelectedCotistaId(null); }
    } catch { setShareholders([]); }
    setStep('cotista');
  }

  async function handlePickBoatAdhoc() {
    if (!selectedBoatId) return;
    setError('');
    setPendingReservation(null);
    const name = allBoats.find(b => b.id === selectedBoatId)?.name || '';
    setBoatName(name);
    try {
      const res = await getSharesByBoat(selectedBoatId);
      const shares = res.data?.data || res.data || [];
      setShareholders(Array.isArray(shares) ? shares : []);
      setSelectedCotistaId(null);
    } catch { setShareholders([]); }
    setStep('cotista');
  }

  async function handleConfirmCotista() {
    setError('');
    try {
      const boatIdToUse = pendingReservation?.boat?.id || selectedBoatId;
      const reservationId = pendingReservation?.id;
      const res = await startAdHocPreLaunch(boatIdToUse, reservationId);
      const cl = res.data;
      setChecklistId(cl.id);
      setItemsData(cl.items?.map((i: { id: string; label: string; checked: boolean }) => ({ id: i.id, label: i.label, checked: i.checked })) || PRE_LAUNCH_ITEMS.map((label, idx) => ({ id: String(idx), label, checked: false })));
      if (!boatName && pendingReservation?.boat?.name) setBoatName(pendingReservation.boat.name);
      fetchOverdueCharges(boatIdToUse, selectedCotistaId);
      // Fetch last damage marks for this boat
      getLastMarksForBoat(boatIdToUse).then((r: any) => {
        const marks = Array.isArray(r.data) ? r.data : [];
        setLastBoatMarks(marks);
      }).catch(() => setLastBoatMarks([]));
      setStep('items');
    } catch (e: unknown) {
      setError((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Erro ao iniciar checklist');
    }
  }

  function captureAndGoFuel() {
    setSketchUrl(sketchRef.current?.getSketchUrl());
    const marks = sketchRef.current?.getMarks();
    setSketchMarks(marks && marks.length > 0 ? JSON.stringify(marks) : undefined);
    setStep('fuel');
  }

  async function handleSubmit() {
    if (!checklistId) return;
    setSubmitting(true); setError('');
    try {
      const hullSketchUrl = sketchUrl;
      let videoUrl: string | undefined;
      let fuelPhotoUrl: string | undefined;
      if (videoFile) videoUrl = await new Promise<string>(resolve => { const r = new FileReader(); r.onload = e => resolve(e.target?.result as string); r.readAsDataURL(videoFile); });
      if (fuelPhotoFile) fuelPhotoUrl = await new Promise<string>(resolve => { const r = new FileReader(); r.onload = e => resolve(e.target?.result as string); r.readAsDataURL(fuelPhotoFile); });
      await submitPreLaunch(checklistId, { items: itemsData, hullSketchUrl, hullSketchMarks: sketchMarks, videoUrl, fuelPhotoUrl, additionalObservations: observations || undefined, lifeVestsLoaned });
      setStep('success');
    } catch (e: unknown) {
      setError((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Erro ao enviar');
    } finally { setSubmitting(false); }
  }

  const allChecked = itemsData.every(i => i.checked);
  const wizSteps: WizStep[] = ['cotista', 'items', 'sketch', 'fuel', 'video', 'confirm'];
  const stepIdx = wizSteps.indexOf(step);

  return (
    <div className="fixed inset-0 z-50 bg-[var(--card)] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border)] flex-shrink-0">
          <div className="flex items-center gap-3">
            <ClipboardCheck className="w-5 h-5 text-primary-500" />
            <div>
              <p className="font-bold text-[var(--text)] text-sm">Realizar Checklist Pré-Saída</p>
              {boatName && <p className="text-xs text-[var(--text-secondary)]">{boatName}</p>}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-[var(--subtle)] rounded-xl"><X className="w-5 h-5 text-[var(--text-secondary)]" /></button>
        </div>

        {/* Progress bar */}
        {step !== 'pick' && step !== 'success' && (
          <div className="px-5 py-3 flex-shrink-0">
            <div className="flex gap-1.5 mb-1">
              {wizSteps.map((s, i) => (
                <div key={s} className={`flex-1 h-1.5 rounded-full ${i <= stepIdx ? 'bg-primary-500' : 'bg-[var(--subtle)]'}`} />
              ))}
            </div>
            <div className="flex justify-between text-[10px] text-[var(--text-muted)]">
              {['Cotista','Itens','Croqui','Comb.','Vídeo','Conf.'].map((l, i) => (
                <span key={l} className={i <= stepIdx ? 'text-primary-500 font-medium' : ''}>{l}</span>
              ))}
            </div>
          </div>
        )}

        {error && <div className="mx-5 mb-2 flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400 flex-shrink-0"><AlertCircle className="w-4 h-4 flex-shrink-0" />{error}</div>}

        {step === 'sketch' ? (
          <div className="flex-1 min-h-0 flex flex-col">
            <JetSki3DSketch ref={sketchRef} fillHeight initialMarks={lastBoatMarks.length > 0 ? lastBoatMarks : undefined} />
            <div className="flex-shrink-0 flex gap-2 px-4 py-3 bg-[var(--card)] border-t border-[var(--border)]">
              <button onClick={() => setStep('items')} className="flex items-center gap-2 px-4 py-2.5 border border-[var(--border)] text-[var(--text-secondary)] rounded-xl text-sm hover:bg-[var(--subtle)]"><ChevronLeft className="w-4 h-4" />Voltar</button>
              <button onClick={captureAndGoFuel} className="flex-1 py-2.5 bg-gradient-to-r from-primary-500 to-primary-400 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2">
                Próximo: Combustível <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : (
        <div className="flex-1 overflow-y-auto px-5 pb-8 space-y-4">
          {/* PICK */}
          {step === 'pick' && (
            <div className="space-y-4">
              <div className="flex gap-2">
                {(['today', 'adhoc'] as const).map(m => (
                  <button key={m} onClick={() => setPickMode(m)}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-medium border-2 transition-all ${pickMode === m ? 'border-primary-400 bg-primary-500/10 text-primary-400' : 'border-[var(--border)] text-[var(--text-secondary)]'}`}>
                    {m === 'today' ? 'Agendadas Hoje' : 'Sem Agendamento'}
                  </button>
                ))}
              </div>

              {pickMode === 'today' && (
                loadingPick ? (
                  <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary-500" /></div>
                ) : todayRes.length === 0 ? (
                  <div className="text-center py-10">
                    <Ship className="w-10 h-10 mx-auto mb-2 text-[var(--text-muted)]" />
                    <p className="text-sm text-[var(--text-muted)]">Nenhuma reserva para hoje</p>
                    <p className="text-xs text-[var(--text-muted)] mt-1">Use "Sem Agendamento" para checklist avulso</p>
                  </div>
                ) : todayRes.map(r => (
                  <button key={r.id} onClick={() => handlePickReservation(r)}
                    className="w-full text-left bg-[var(--subtle)] hover:bg-primary-500/10 border border-[var(--border)] hover:border-primary-300 rounded-2xl p-4 flex items-center gap-3 transition-all">
                    <div className="w-10 h-10 rounded-xl bg-primary-500/10 flex items-center justify-center flex-shrink-0"><Ship className="w-5 h-5 text-primary-400" /></div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-[var(--text)] text-sm">{r.boat?.name || '—'}</p>
                      <p className="text-xs text-[var(--text-secondary)]">{r.boat?.model} · {r.user?.name || '—'}</p>
                      <p className="text-xs text-primary-500 mt-0.5">{fmt(r.startDate)} → {fmt(r.endDate)}</p>
                    </div>
                    {r.checklist ? (
                      <span className={`text-xs px-2 py-1 rounded-full flex-shrink-0 ${r.checklist.status === 'APPROVED' ? 'bg-green-100 text-emerald-400' : 'bg-yellow-100 text-yellow-400'}`}>
                        {r.checklist.status === 'APPROVED' ? '✓ Feito' : 'Pendente'}
                      </span>
                    ) : <ChevronRight className="w-4 h-4 text-[var(--text-muted)] flex-shrink-0" />}
                  </button>
                ))
              )}

              {pickMode === 'adhoc' && (
                <div className="space-y-3">
                  <select value={selectedBoatId} onChange={e => setSelectedBoatId(e.target.value)}
                    className="w-full px-3 py-3 bg-[var(--subtle)] border border-[var(--border)] rounded-xl text-[var(--text)] focus:outline-none focus:border-primary-400 text-sm">
                    <option value="">— Selecione a embarcação —</option>
                    {allBoats.map(b => <option key={b.id} value={b.id}>{b.name}{b.model ? ` (${b.model})` : ''}</option>)}
                  </select>
                  <button onClick={handlePickBoatAdhoc} disabled={!selectedBoatId}
                    className="w-full py-3.5 bg-gradient-to-r from-primary-500 to-primary-400 disabled:opacity-50 disabled:text-[var(--text-muted)] text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2">
                    <ClipboardCheck className="w-4 h-4" />Iniciar Checklist
                  </button>
                </div>
              )}
            </div>
          )}

          {/* COTISTA */}
          {step === 'cotista' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-[var(--text)]">Selecionar Cotista</h3>
                <p className="text-xs text-[var(--text-secondary)] mt-1">Embarcação: <strong>{boatName}</strong></p>
              </div>
              {shareholders.length === 0 ? (
                <div className="text-center py-8 text-[var(--text-muted)]">
                  <User className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Nenhum cotista cadastrado para esta embarcação</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {shareholders.map(s => (
                    <button key={s.id} onClick={() => setSelectedCotistaId(selectedCotistaId === s.user.id ? null : s.user.id)}
                      className={`w-full text-left rounded-2xl p-4 border-2 flex items-center gap-3 transition-all ${selectedCotistaId === s.user.id ? 'border-primary-400 bg-primary-500/10' : 'border-[var(--border)] bg-[var(--subtle)] hover:border-primary-300'}`}>
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${selectedCotistaId === s.user.id ? 'bg-gradient-to-r from-primary-500 to-primary-400 text-white' : 'bg-[var(--card)] text-[var(--text-muted)]'}`}>
                        {s.user.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-[var(--text)] text-sm truncate">{s.user.name}</p>
                        <p className="text-xs text-[var(--text-muted)] truncate">{s.user.email}{s.user.phone ? ` · ${s.user.phone}` : ''}</p>
                        <p className="text-xs text-primary-500 mt-0.5">Cota #{s.shareNumber} · {s.sharePercentage}%</p>
                      </div>
                      {selectedCotistaId === s.user.id && <CheckCircle2 className="w-5 h-5 text-primary-500 flex-shrink-0" />}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex gap-2 pt-1">
                <button onClick={() => setStep('pick')} className="flex items-center gap-2 px-4 py-2.5 border border-[var(--border)] text-[var(--text-secondary)] rounded-xl text-sm hover:bg-[var(--subtle)]">
                  <ChevronLeft className="w-4 h-4" />Voltar
                </button>
                <button onClick={handleConfirmCotista}
                  className="flex-1 py-2.5 bg-gradient-to-r from-primary-500 to-primary-400 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:from-primary-600 hover:to-primary-500 transition-colors">
                  {selectedCotistaId
                    ? <><CheckCircle2 className="w-4 h-4" />Confirmar Cotista</>
                    : <>Continuar sem cotista <ChevronRight className="w-4 h-4" /></>
                  }
                </button>
              </div>
            </div>
          )}

          {/* ITEMS */}
          {step === 'items' && (
            <div className="space-y-2">
              {overdueCharges.length > 0 && (
                <div className="p-4 bg-red-500/10 border-2 border-red-500 rounded-xl space-y-2">
                  <div className="flex items-center gap-2 text-red-500 font-bold text-sm">
                    <DollarSign className="w-5 h-5" />⚠️ Cliente com faturas vencidas!
                  </div>
                  {overdueCharges.map((ch, i) => (
                    <div key={i} className="flex justify-between text-sm gap-2">
                      <span className="text-red-400 truncate">{ch.description}{ch.userName ? ` — ${ch.userName}` : ''}</span>
                      <span className="font-bold text-red-500 whitespace-nowrap">R$ {Number(ch.amount).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-[var(--text-secondary)]">Marque todos os itens verificados</p>
                <button onClick={() => setItemsData(p => p.map(x => ({ ...x, checked: true })))}
                  className="text-xs font-bold text-primary-500 px-2 py-1 rounded-lg hover:bg-primary-500/10">
                  Selecionar tudo
                </button>
              </div>
              {itemsData.map((item, i) => (
                <button key={item.id} onClick={() => setItemsData(p => p.map((x, j) => j === i ? { ...x, checked: !x.checked } : x))}
                  className={`w-full flex items-center gap-3 p-3.5 rounded-xl border-2 text-left transition-all ${item.checked ? 'border-green-400 bg-emerald-500/10' : 'border-[var(--border)] bg-[var(--subtle)] hover:border-[var(--border)]'}`}>
                  <div className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center border-2 transition-all ${item.checked ? 'bg-emerald-500 border-green-500' : 'border-[var(--border)]'}`}>
                    {item.checked && <CheckCircle className="w-4 h-4 text-white" />}
                  </div>
                  <span className={`text-sm ${item.checked ? 'text-emerald-400 font-medium' : 'text-[var(--text)]'}`}>{item.label}</span>
                </button>
              ))}
              {/* Life vest loan */}
              <div className="pt-1 p-3 bg-primary-500/10 border border-primary-500/20 rounded-xl">
                <p className="text-xs font-bold text-primary-400 mb-2">🦺 Coletes emprestados pela marina</p>
                <div className="flex items-center gap-3">
                  <button onClick={() => setLifeVestsLoaned(v => Math.max(0, v - 1))} className="w-9 h-9 rounded-full border border-[var(--border)] bg-[var(--card)] flex items-center justify-center text-[var(--text-secondary)] font-bold text-lg">−</button>
                  <span className="text-3xl font-black text-primary-500 w-12 text-center">{lifeVestsLoaned}</span>
                  <button onClick={() => setLifeVestsLoaned(v => v + 1)} className="w-9 h-9 rounded-full border border-[var(--border)] bg-[var(--card)] flex items-center justify-center text-[var(--text-secondary)] font-bold text-lg">+</button>
                  <span className="text-xs text-[var(--text-secondary)] ml-1">{lifeVestsLoaned === 0 ? 'Nenhum' : `${lifeVestsLoaned} emprestado${lifeVestsLoaned > 1 ? 's' : ''}`}</span>
                </div>
              </div>
              <div className="pt-1">
                <p className="text-xs text-[var(--text-secondary)] mb-1.5">Observações (opcional)</p>
                <textarea value={observations} onChange={e => setObservations(e.target.value)} rows={2}
                  placeholder="Descreva qualquer problema..."
                  className="w-full px-3 py-2.5 text-sm bg-[var(--subtle)] border border-[var(--border)] rounded-xl resize-none focus:outline-none focus:border-primary-400" />
              </div>
              <button onClick={() => setStep('sketch')} disabled={!allChecked}
                className="w-full py-3.5 bg-gradient-to-r from-primary-500 to-primary-400 disabled:opacity-50 disabled:text-[var(--text-muted)] text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2">
                Próximo: Croqui <ChevronRight className="w-4 h-4" />
              </button>
              {!allChecked && <p className="text-xs text-center text-[var(--text-muted)]">Marque todos os {itemsData.length} itens</p>}
            </div>
          )}

          {/* FUEL */}
          {step === 'fuel' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-[var(--text)]">Foto do Tanque de Combustível</h3>
                <p className="text-xs text-[var(--text-secondary)] mt-1">Tire uma foto do medidor de combustível</p>
              </div>
              {!fuelPhotoFile ? (
                <label className="flex flex-col items-center justify-center gap-3 p-8 border-2 border-dashed border-[var(--border)] rounded-2xl cursor-pointer bg-[var(--subtle)]">
                  <span className="text-5xl">⛽</span>
                  <div className="text-center">
                    <p className="text-sm font-medium text-[var(--text-secondary)]">Abrir câmera ou selecionar foto</p>
                    <p className="text-xs text-[var(--text-muted)] mt-1">JPG, PNG, HEIC · Foto do nível do tanque</p>
                  </div>
                  <input type="file" accept="image/*" capture="environment" className="hidden" onChange={e => setFuelPhotoFile(e.target.files?.[0] || null)} />
                </label>
              ) : (
                <div className="space-y-3">
                  <div className="rounded-xl overflow-hidden border border-[var(--border)]">
                    <img loading="lazy" decoding="async" src={URL.createObjectURL(fuelPhotoFile)} alt="Tanque" className="w-full object-contain max-h-48" />
                  </div>
                  <div className="bg-[var(--subtle)] border border-[var(--border)] rounded-xl p-3 flex items-center gap-3">
                    <span className="text-xl">⛽</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[var(--text)] truncate">{fuelPhotoFile.name}</p>
                      <p className="text-xs text-[var(--text-secondary)]">{(fuelPhotoFile.size/1024/1024).toFixed(1)} MB</p>
                    </div>
                    <button onClick={() => setFuelPhotoFile(null)} className="p-1.5 hover:bg-[var(--subtle-hover)] rounded-lg"><X className="w-4 h-4 text-[var(--text-secondary)]" /></button>
                  </div>
                </div>
              )}
              <div className="flex gap-2">
                <button onClick={() => setStep('sketch')} className="flex items-center gap-2 px-4 py-2.5 border border-[var(--border)] text-[var(--text-secondary)] rounded-xl text-sm hover:bg-[var(--subtle)]"><ChevronLeft className="w-4 h-4" />Voltar</button>
                <button onClick={() => setStep('video')} disabled={!fuelPhotoFile}
                  className="flex-1 py-2.5 bg-gradient-to-r from-primary-500 to-primary-400 disabled:opacity-50 disabled:text-[var(--text-muted)] text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2">
                  Próximo: Vídeo <ChevronRight className="w-4 h-4" />
                </button>
              </div>
              <button onClick={() => setStep('video')} className="w-full text-center text-xs text-[var(--text-muted)] hover:text-[var(--text)] underline underline-offset-2">
                Pular foto do tanque
              </button>
            </div>
          )}

          {/* VIDEO */}
          {step === 'video' && (
            <div className="space-y-4">
              <p className="text-xs text-[var(--text-secondary)]">Opcional — grave um vídeo da inspeção</p>
              {!videoFile ? (
                <label className="flex flex-col items-center justify-center gap-3 p-8 border-2 border-dashed border-[var(--border)] rounded-2xl cursor-pointer bg-[var(--subtle)]">
                  <Video className="w-10 h-10 text-[var(--text-muted)]" />
                  <div className="text-center"><p className="text-sm font-medium text-[var(--text-secondary)]">Gravar ou selecionar</p><p className="text-xs text-[var(--text-muted)] mt-1">MP4, MOV · máx. 100MB</p></div>
                  <input type="file" accept="video/*" capture="environment" className="hidden" onChange={e => setVideoFile(e.target.files?.[0] || null)} />
                </label>
              ) : (
                <div className="bg-[var(--subtle)] border border-[var(--border)] rounded-2xl p-4 flex items-center gap-3">
                  <Video className="w-8 h-8 text-primary-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0"><p className="text-sm font-semibold text-[var(--text)] truncate">{videoFile.name}</p><p className="text-xs text-[var(--text-secondary)]">{(videoFile.size/1024/1024).toFixed(1)} MB</p></div>
                  <button onClick={() => setVideoFile(null)} className="p-1.5 hover:bg-[var(--subtle-hover)] rounded-lg"><X className="w-4 h-4 text-[var(--text-secondary)]" /></button>
                </div>
              )}
              <div className="flex gap-2">
                <button onClick={() => setStep('fuel')} className="flex items-center gap-2 px-4 py-2.5 border border-[var(--border)] text-[var(--text-secondary)] rounded-xl text-sm hover:bg-[var(--subtle)]"><ChevronLeft className="w-4 h-4" />Voltar</button>
                <button onClick={() => setStep('confirm')} className="flex-1 py-2.5 bg-gradient-to-r from-primary-500 to-primary-400 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2">
                  {videoFile ? 'Próximo' : 'Pular'} <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* CONFIRM */}
          {step === 'confirm' && (
            <div className="space-y-4">
              <div className="bg-[var(--subtle)] border border-[var(--border)] rounded-2xl divide-y divide-gray-100">
                {[['Embarcação', boatName], ['Itens', `${itemsData.filter(i=>i.checked).length}/${itemsData.length} ✓`], ['Croqui', 'Incluído'], ['⛽ Tanque', fuelPhotoFile ? fuelPhotoFile.name : 'Não incluído'], ['Vídeo', videoFile ? videoFile.name : 'Não incluído'], ...(lifeVestsLoaned > 0 ? [['🦺 Coletes emprestados', `${lifeVestsLoaned}`]] : [])].map(([k,v])=>(
                  <div key={k} className="flex justify-between px-4 py-3">
                    <span className="text-sm text-[var(--text-secondary)]">{k}</span>
                    <span className={`text-sm font-semibold ${k==='Itens' ? 'text-emerald-400' : k?.toString().includes('Colete') ? 'text-primary-400' : 'text-[var(--text)]'}`}>{v}</span>
                  </div>
                ))}
                {observations && <div className="px-4 py-3"><p className="text-xs text-[var(--text-secondary)] mb-1">Observações</p><p className="text-sm text-[var(--text)]">{observations}</p></div>}
              </div>
              <div className="p-3 bg-primary-500/10 border border-primary-100 rounded-xl">
                <p className="text-xs text-primary-700">⚠️ Ao enviar, a reserva (se houver) será marcada como <strong>Em Uso</strong>.</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setStep('video')} className="flex items-center gap-2 px-4 py-2.5 border border-[var(--border)] text-[var(--text-secondary)] rounded-xl text-sm hover:bg-[var(--subtle)]"><ChevronLeft className="w-4 h-4" />Voltar</button>
                <button onClick={handleSubmit} disabled={submitting} className="flex-1 py-3 bg-gradient-to-r from-primary-500 to-primary-400 disabled:opacity-60 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2">
                  {submitting ? <><Loader2 className="w-4 h-4 animate-spin" />Enviando...</> : <><CheckCircle className="w-4 h-4" />Enviar Checklist</>}
                </button>
              </div>
            </div>
          )}

          {/* SUCCESS */}
          {step === 'success' && (
            <div className="flex flex-col items-center justify-center py-8 gap-4 text-center">
              <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle className="w-10 h-10 text-green-500" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-[var(--text)]">Checklist Enviado!</h3>
                <p className="text-sm text-[var(--text-secondary)] mt-1">Checklist de <strong>{boatName}</strong> concluído.</p>
              </div>
              <button onClick={onSuccess} className="px-8 py-3 bg-gradient-to-r from-primary-500 to-primary-400 text-white rounded-xl font-bold text-sm">Feito</button>
            </div>
          )}
        </div>
        )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   CLIENT VIEW — read-only: view checklists, 3D model, video
═══════════════════════════════════════════════════════════════════════════ */
interface ClientChecklist {
  id: string; status: string; createdAt: string;
  hullSketchUrl?: string; hullSketchMarks?: string; videoUrl?: string; fuelPhotoUrl?: string; additionalObservations?: string;
  lifeVestsLoaned?: number;
  returnFuelPhotoUrl?: string; returnSketchMarks?: string; returnObservations?: string; returnCompletedAt?: string;
  items?: { id: string; label: string; checked: boolean; notes?: string }[];
  operator?: { id: string; name: string };
}

/* ═══════════════════════════════════════════════════════════════════════════
   CHECKLIST COMPARISON VIEW — Before vs After (Saída vs Retorno)
═══════════════════════════════════════════════════════════════════════════ */
function ChecklistComparisonView({ selected, onBack }: { selected: ClientChecklist; onBack: () => void }) {
  const [openSection, setOpenSection] = useState<string | null>(null);
  const [zoomImg, setZoomImg] = useState<string | null>(null);
  const toggle = (key: string) => setOpenSection(prev => prev === key ? null : key);
  const hasReturn = !!selected.returnCompletedAt;
  const uncheckedItems = selected.items?.filter(i => !i.checked) || [];
  const checkedCount = selected.items?.filter(i => i.checked).length || 0;
  const totalCount = selected.items?.length || 0;
  const fmtDT = (s: string) => new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: BRT });

  return (
    <div className="flex flex-col min-h-screen bg-[var(--bg)]">
      {/* Photo zoom overlay */}
      {zoomImg && (
        <div className="fixed inset-0 bg-black/90 z-[100] flex items-center justify-center p-4" onClick={() => setZoomImg(null)}>
          <button onClick={() => setZoomImg(null)} className="absolute top-4 right-4 text-white/70 hover:text-white z-10"><X className="w-7 h-7" /></button>
          <img loading="lazy" decoding="async" src={resolveMediaUrl(zoomImg)} alt="Zoom" className="max-w-full max-h-full object-contain rounded-xl" onClick={e => e.stopPropagation()} />
        </div>
      )}

      {/* Header */}
      <div className="sticky top-[60px] z-20 bg-[var(--card)] border-b border-[var(--border)] px-4 py-3 flex items-center gap-3">
        <button onClick={onBack} className="p-1.5 hover:bg-[var(--subtle)] rounded-lg">
          <ChevronLeft className="w-5 h-5 text-[var(--text-secondary)]" />
        </button>
        <div className="flex-1">
          <p className="font-bold text-[var(--text)] text-sm">{selected.operator ? `${selected.operator.name}` : 'Inspeção'}</p>
          <p className="text-[11px] text-[var(--text-muted)]">{fmtDT(selected.createdAt)}{hasReturn ? ` — Retorno ${fmtDT(selected.returnCompletedAt!)}` : ''}</p>
        </div>
        <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${hasReturn ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>
          {hasReturn ? 'Concluído' : 'Aprovado'}
        </span>
      </div>

      <div className="p-4 pb-4 space-y-3">
        {/* Status summary — redesigned */}
        <div className={`rounded-2xl overflow-hidden border ${hasReturn ? 'border-blue-200 dark:border-blue-500/30' : 'border-emerald-200 dark:border-emerald-500/30'}`}>
          <div className={`px-4 py-3 flex items-center gap-3 ${hasReturn ? 'bg-gradient-to-r from-blue-500/10 to-blue-500/5' : 'bg-gradient-to-r from-emerald-500/10 to-emerald-500/5'}`}>
            <div className={`w-9 h-9 rounded-full flex items-center justify-center ${hasReturn ? 'bg-blue-500 text-white' : 'bg-emerald-500 text-white'}`}>
              {hasReturn ? <RefreshCw className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
            </div>
            <div className="flex-1">
              <p className="font-bold text-sm text-[var(--text)]">{hasReturn ? 'Inspeção Completa' : 'Saída Aprovada'}</p>
              <p className="text-[11px] text-[var(--text-muted)]">{hasReturn ? 'Saída e retorno registrados' : 'Aguardando retorno'}</p>
            </div>
          </div>
          <div className="bg-[var(--card)] px-4 py-3 flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              </div>
              <div>
                <p className="text-sm font-bold text-[var(--text)]">{checkedCount}/{totalCount}</p>
                <p className="text-[10px] text-[var(--text-muted)]">Itens OK</p>
              </div>
            </div>
            {(selected.lifeVestsLoaned ?? 0) > 0 && (
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-primary-500/10 flex items-center justify-center">
                  <span className="text-sm">🦺</span>
                </div>
                <div>
                  <p className="text-sm font-bold text-[var(--text)]">{selected.lifeVestsLoaned}</p>
                  <p className="text-[10px] text-[var(--text-muted)]">Coletes</p>
                </div>
              </div>
            )}
            {hasReturn && (
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <CheckCircle className="w-4 h-4 text-blue-500" />
                </div>
                <div>
                  <p className="text-sm font-bold text-[var(--text)]">✓</p>
                  <p className="text-[10px] text-[var(--text-muted)]">Retorno</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Alertas — itens não verificados */}
        {uncheckedItems.length > 0 && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-3">
            <p className="text-xs font-bold text-red-500 flex items-center gap-1.5 mb-2"><AlertTriangle className="w-3.5 h-3.5" /> Itens com pendência</p>
            {uncheckedItems.map(item => (
              <div key={item.id} className="flex items-center gap-2 py-1">
                <X className="w-3 h-3 text-red-400 flex-shrink-0" />
                <p className="text-xs text-red-600">{item.label}{item.notes ? ` — ${item.notes}` : ''}</p>
              </div>
            ))}
          </div>
        )}

        {/* ── COMPARAÇÃO: SAÍDA vs RETORNO ── */}
        {hasReturn && (
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl overflow-hidden">
            <div className="grid grid-cols-2 border-b border-[var(--border)]">
              <div className="px-3 py-2 text-center border-r border-[var(--border)] bg-emerald-500/5">
                <p className="text-[10px] font-bold text-emerald-600 uppercase">⬇ Saída</p>
              </div>
              <div className="px-3 py-2 text-center bg-blue-500/5">
                <p className="text-[10px] font-bold text-blue-600 uppercase">⬆ Retorno</p>
              </div>
            </div>

            {/* Fuel comparison */}
            {(selected.fuelPhotoUrl || selected.returnFuelPhotoUrl) && (
              <div>
                <button onClick={() => toggle('fuel-cmp')} className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-[var(--text)] hover:bg-[var(--subtle)] transition">
                  <span className="flex items-center gap-2">⛽ Combustível</span>
                  <ChevronRight className={`w-4 h-4 text-[var(--text-muted)] transition-transform ${openSection === 'fuel-cmp' ? 'rotate-90' : ''}`} />
                </button>
                {openSection === 'fuel-cmp' && (
                  <div className="grid grid-cols-2 gap-px bg-[var(--border)]">
                    <div className="bg-[var(--card)] p-2">
                      {selected.fuelPhotoUrl
                        ? <img loading="lazy" decoding="async" src={resolveMediaUrl(selected.fuelPhotoUrl)} alt="Tanque saída" className="w-full rounded-xl object-contain max-h-40 cursor-pointer active:scale-95 transition-transform" onClick={() => setZoomImg(selected.fuelPhotoUrl!)} />
                        : <p className="text-xs text-[var(--text-muted)] text-center py-8">Sem foto</p>}
                    </div>
                    <div className="bg-[var(--card)] p-2">
                      {selected.returnFuelPhotoUrl
                        ? <img loading="lazy" decoding="async" src={resolveMediaUrl(selected.returnFuelPhotoUrl)} alt="Tanque retorno" className="w-full rounded-xl object-contain max-h-40 cursor-pointer active:scale-95 transition-transform" onClick={() => setZoomImg(selected.returnFuelPhotoUrl!)} />
                        : <p className="text-xs text-[var(--text-muted)] text-center py-8">Sem foto</p>}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Sketch comparison */}
            {(selected.hullSketchMarks || selected.returnSketchMarks) && (
              <div className="border-t border-[var(--border)]">
                <button onClick={() => toggle('sketch-cmp')} className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-[var(--text)] hover:bg-[var(--subtle)] transition">
                  <span className="flex items-center gap-2"><PenLine className="w-4 h-4 text-blue-500" /> Croqui / Avarias</span>
                  <ChevronRight className={`w-4 h-4 text-[var(--text-muted)] transition-transform ${openSection === 'sketch-cmp' ? 'rotate-90' : ''}`} />
                </button>
                {openSection === 'sketch-cmp' && (
                  <div className="grid grid-cols-2 gap-px bg-[var(--border)]">
                    <div className="bg-[var(--card)] p-2">
                      {selected.hullSketchMarks
                        ? <JetSki3DMarkViewer marksJson={selected.hullSketchMarks} height={180} />
                        : <p className="text-xs text-[var(--text-muted)] text-center py-8">Sem marcações</p>}
                    </div>
                    <div className="bg-[var(--card)] p-2">
                      {selected.returnSketchMarks
                        ? <JetSki3DMarkViewer marksJson={selected.hullSketchMarks} markColor="#ef4444" secondaryMarksJson={selected.returnSketchMarks} secondaryMarkColor="#ff6600" height={180} />
                        : <p className="text-xs text-[var(--text-muted)] text-center py-8">Sem marcações</p>}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Observations comparison */}
            {(selected.additionalObservations || selected.returnObservations) && (
              <div className="border-t border-[var(--border)]">
                <button onClick={() => toggle('obs-cmp')} className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-[var(--text)] hover:bg-[var(--subtle)] transition">
                  <span className="flex items-center gap-2"><AlertCircle className="w-4 h-4 text-amber-500" /> Observações</span>
                  <ChevronRight className={`w-4 h-4 text-[var(--text-muted)] transition-transform ${openSection === 'obs-cmp' ? 'rotate-90' : ''}`} />
                </button>
                {openSection === 'obs-cmp' && (
                  <div className="grid grid-cols-2 gap-px bg-[var(--border)]">
                    <div className="bg-[var(--card)] p-3">
                      <p className="text-xs text-[var(--text)]">{selected.additionalObservations || '—'}</p>
                    </div>
                    <div className="bg-[var(--card)] p-3">
                      <p className="text-xs text-[var(--text)]">{selected.returnObservations || '—'}</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── SEÇÕES EXPANSÍVEIS (saída apenas, quando sem retorno) ── */}
        {!hasReturn && (
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl overflow-hidden divide-y divide-[var(--border)]">
            {(selected.hullSketchMarks || selected.hullSketchUrl) && (
              <div>
                <button onClick={() => toggle('sketch')} className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-[var(--text)] hover:bg-[var(--subtle)] transition">
                  <span className="flex items-center gap-2"><PenLine className="w-4 h-4 text-blue-500" /> Croqui do Casco</span>
                  <ChevronRight className={`w-4 h-4 text-[var(--text-muted)] transition-transform ${openSection === 'sketch' ? 'rotate-90' : ''}`} />
                </button>
                {openSection === 'sketch' && (
                  <div className="p-3 pt-0">
                    {selected.hullSketchMarks
                      ? <JetSki3DMarkViewer marksJson={selected.hullSketchMarks} height={260} />
                      : <img loading="lazy" decoding="async" src={resolveMediaUrl(selected.hullSketchUrl)} alt="Croqui" className="w-full object-contain max-h-60 rounded-xl cursor-pointer active:scale-95 transition-transform" onClick={() => setZoomImg(selected.hullSketchUrl!)} />}
                  </div>
                )}
              </div>
            )}
            {selected.fuelPhotoUrl && (
              <div>
                <button onClick={() => toggle('fuel')} className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-[var(--text)] hover:bg-[var(--subtle)] transition">
                  <span className="flex items-center gap-2">⛽ Foto do Tanque</span>
                  <ChevronRight className={`w-4 h-4 text-[var(--text-muted)] transition-transform ${openSection === 'fuel' ? 'rotate-90' : ''}`} />
                </button>
                {openSection === 'fuel' && (
                  <div className="p-3 pt-0">
                    <img loading="lazy" decoding="async" src={resolveMediaUrl(selected.fuelPhotoUrl)} alt="Tanque" className="w-full object-contain max-h-60 rounded-xl cursor-pointer active:scale-95 transition-transform" onClick={() => setZoomImg(selected.fuelPhotoUrl!)} />
                  </div>
                )}
              </div>
            )}
            {selected.additionalObservations && (
              <div>
                <button onClick={() => toggle('obs')} className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-[var(--text)] hover:bg-[var(--subtle)] transition">
                  <span className="flex items-center gap-2"><AlertCircle className="w-4 h-4 text-amber-500" /> Observações</span>
                  <ChevronRight className={`w-4 h-4 text-[var(--text-muted)] transition-transform ${openSection === 'obs' ? 'rotate-90' : ''}`} />
                </button>
                {openSection === 'obs' && (
                  <div className="p-3 pt-0">
                    <p className="text-sm text-[var(--text)]">{selected.additionalObservations}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Vídeo */}
        {selected.videoUrl && (
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl overflow-hidden">
            <button onClick={() => toggle('video')} className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-[var(--text)] hover:bg-[var(--subtle)] transition">
              <span className="flex items-center gap-2"><Video className="w-4 h-4 text-primary-500" /> Vídeo de Inspeção</span>
              <ChevronRight className={`w-4 h-4 text-[var(--text-muted)] transition-transform ${openSection === 'video' ? 'rotate-90' : ''}`} />
            </button>
            {openSection === 'video' && (
              <div className="p-3 pt-0">
                <video src={resolveMediaUrl(selected.videoUrl)} controls className="w-full rounded-xl" style={{ maxHeight: 240 }} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   RETURN INSPECTION MODAL — shown before lifting boat
═══════════════════════════════════════════════════════════════════════════ */

function ReturnInspectionModal({ item, onClose, onConfirm }: {
  item: QueueEntry;
  onClose: () => void;
  onConfirm: (data: Record<string, unknown>) => void;
}) {
  type RStep = 'items' | 'sketch' | 'fuel' | 'confirm';
  const [step, setStep] = useState<RStep>('items');
  const [checks, setChecks] = useState(RETURN_ITEMS.map(l => ({ label: l, checked: false })));
  const [fuelPhotoFile, setFuelPhotoFile] = useState<File | null>(null);
  const [fuelPreview, setFuelPreview] = useState<string | null>(null);
  const [damageVideoFile, setDamageVideoFile] = useState<File | null>(null);
  const [damageVideoPreview, setDamageVideoPreview] = useState<string | null>(null);
  const [observations, setObservations] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const sketchRef = useRef<JetSki3DSketchRef>(null);
  const [sketchMarks, setSketchMarks] = useState<string | undefined>();

  // Use checklist data directly from the queue item (no extra fetch needed)
  const launchCL = item.reservation?.checklist || null;
  const loadingCL = false;

  const lifeVests = launchCL?.lifeVestsLoaned || 0;
  const launchMarks = launchCL?.hullSketchMarks;

  const handleFuelPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFuelPhotoFile(file);
    const reader = new FileReader();
    reader.onload = ev => setFuelPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const captureSketch = () => {
    const marks = sketchRef.current?.getMarks();
    setSketchMarks(marks && marks.length > 0 ? JSON.stringify(marks) : undefined);
    setStep('fuel');
  };

  const handleDamageVideo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setDamageVideoFile(file);
    setDamageVideoPreview(URL.createObjectURL(file));
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    let returnFuelPhotoUrl: string | undefined;
    if (fuelPhotoFile) {
      returnFuelPhotoUrl = await new Promise<string>(resolve => {
        const r = new FileReader(); r.onload = e => resolve(e.target?.result as string); r.readAsDataURL(fuelPhotoFile);
      });
    }
    let returnDamageVideoUrl: string | undefined;
    if (damageVideoFile) {
      returnDamageVideoUrl = await new Promise<string>(resolve => {
        const r = new FileReader(); r.onload = e => resolve(e.target?.result as string); r.readAsDataURL(damageVideoFile);
      });
    }
    onConfirm({
      returnFuelPhotoUrl,
      returnSketchMarks: sketchMarks,
      returnObservations: observations || undefined,
      returnDamageVideoUrl,
    });
  };

  const steps: RStep[] = ['items', 'sketch', 'fuel', 'confirm'];
  const stepIdx = steps.indexOf(step);
  const labels = ['Inspeção', 'Avarias', 'Combustível', 'Confirmar'];
  const fmt = (s: string) => new Date(s).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: BRT });

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="bg-[var(--card)] rounded-t-3xl sm:rounded-2xl w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-[var(--border)] flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center"><ArrowUp className="w-5 h-5 text-blue-500" /></div>
            <div>
              <h2 className="text-lg font-bold text-[var(--text)]">Inspeção de Retorno</h2>
              <p className="text-xs text-[var(--text-muted)]">{item.boat?.name} — {item.client?.name || 'Cliente'}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text)]"><X className="w-5 h-5" /></button>
        </div>

        <div className="px-5 sm:px-6 pt-3">
          <div className="flex gap-1 mb-1">{steps.map((_, i) => <div key={i} className={`flex-1 h-1 rounded-full ${i <= stepIdx ? 'bg-blue-500' : 'bg-gray-200 dark:bg-gray-700'}`} />)}</div>
          <div className="flex justify-between text-[10px] text-[var(--text-muted)]">{labels.map((l, i) => <span key={l} className={i === stepIdx ? 'text-blue-500 font-semibold' : ''}>{l}</span>)}</div>
        </div>

        {lifeVests > 0 && (
          <div className="mx-5 sm:mx-6 mt-3 p-3 bg-amber-50 dark:bg-amber-500/10 border-2 border-amber-400 dark:border-amber-500/50 rounded-xl flex items-center gap-3 animate-pulse">
            <span className="text-3xl">🦺</span>
            <div>
              <p className="text-sm font-bold text-amber-700 dark:text-amber-400">ATENÇÃO: {lifeVests} colete{lifeVests > 1 ? 's' : ''} emprestado{lifeVests > 1 ? 's' : ''}</p>
              <p className="text-xs text-amber-600 dark:text-amber-400/80">Verifique se todos os coletes foram devolvidos antes de subir o jet.</p>
            </div>
          </div>
        )}

        <div className="p-5 sm:p-6 flex-1 min-h-0">
          {loadingCL ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>
          ) : step === 'items' ? (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-semibold text-[var(--text)] mb-2">✅ Verificação de Retorno</p>
                {checks.map((c, i) => (
                  <label key={i} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition mb-2 ${c.checked ? 'border-green-500 bg-green-50 dark:bg-green-500/10' : 'border-[var(--border)] hover:bg-[var(--bg)]'}`}>
                    <input type="checkbox" checked={c.checked} onChange={() => setChecks(prev => prev.map((x, j) => j === i ? { ...x, checked: !x.checked } : x))}
                      className="w-5 h-5 rounded border-gray-300 text-green-500 focus:ring-green-500" />
                    <span className="text-sm text-[var(--text)]">{c.label}</span>
                  </label>
                ))}
              </div>
              <div>
                <label className="text-sm text-[var(--text-muted)] mb-1 block">Observações</label>
                <textarea value={observations} onChange={e => setObservations(e.target.value)}
                  className="w-full p-3 border border-[var(--border)] rounded-xl text-sm bg-[var(--card)] text-[var(--text)] focus:ring-2 focus:ring-blue-500 resize-none" rows={2} placeholder="Observações..." />
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={onClose} className="flex-1 py-2.5 border border-[var(--border)] text-[var(--text)] rounded-xl font-medium text-sm hover:bg-[var(--bg)]">Cancelar</button>
                <button onClick={() => setStep('sketch')} className="flex-[2] py-2.5 bg-blue-500 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2">
                  Próximo: Avarias <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : step === 'sketch' ? (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-[var(--text)]">Inspeção do Casco — Novas Avarias</p>
              <p className="text-xs text-[var(--text-muted)]">Marcas <span className="text-red-500 font-bold">vermelhas</span> = avarias da saída. Novas avarias serão marcadas em <span className="font-bold" style={{color:'#39ff14'}}>verde neon</span>.</p>
              <JetSki3DSketch ref={sketchRef} initialMarks={launchMarks ? (JSON.parse(launchMarks) as InitialMark[]) : undefined} markColor="#39ff14" />
              <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-500/30 rounded-xl">
                <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-2">🎬 Vídeo da avaria (opcional)</p>
                <input type="file" accept="video/*" capture="environment" onChange={handleDamageVideo}
                  className="block w-full text-sm text-[var(--text-muted)] file:mr-4 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-amber-500 file:text-white file:font-medium file:cursor-pointer file:text-xs" />
                {damageVideoPreview && (
                  <video src={damageVideoPreview} controls className="mt-2 w-full max-h-40 rounded-lg" />
                )}
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={() => setStep('items')} className="flex items-center gap-2 px-4 py-2.5 border border-[var(--border)] text-[var(--text-muted)] rounded-xl text-sm hover:bg-[var(--bg)]"><ChevronLeft className="w-4 h-4" />Voltar</button>
                <button onClick={captureSketch} className="flex-1 py-2.5 bg-blue-500 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2">
                  Próximo: Combustível <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : step === 'fuel' ? (
            <div className="space-y-4">
              <p className="text-sm font-semibold text-[var(--text)]">📸 Foto do Tanque de Combustível</p>
              <div className="border-2 border-dashed border-[var(--border)] rounded-xl p-4">
                <input type="file" accept="image/*" capture="environment" onChange={handleFuelPhoto}
                  className="block w-full text-sm text-[var(--text-muted)] file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:bg-blue-500 file:text-white file:font-medium file:cursor-pointer" />
                {fuelPreview && <img loading="lazy" decoding="async" src={fuelPreview} alt="Tanque" className="mt-3 w-full max-h-48 object-contain rounded-xl" />}
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={() => setStep('sketch')} className="flex items-center gap-2 px-4 py-2.5 border border-[var(--border)] text-[var(--text-muted)] rounded-xl text-sm hover:bg-[var(--bg)]"><ChevronLeft className="w-4 h-4" />Voltar</button>
                <button onClick={() => setStep('confirm')} className="flex-1 py-2.5 bg-blue-500 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2">
                  Próximo: Confirmar <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm font-semibold text-[var(--text)]">Resumo da Inspeção</p>
              <div className="bg-[var(--bg)] rounded-xl p-4 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-[var(--text-muted)]">Embarcação</span><span className="text-[var(--text)] font-medium">{item.boat?.name}</span></div>
                <div className="flex justify-between"><span className="text-[var(--text-muted)]">Itens verificados</span><span className="text-[var(--text)] font-medium">{checks.filter(c => c.checked).length}/{checks.length} ✓</span></div>
                <div className="flex justify-between"><span className="text-[var(--text-muted)]">Novas avarias</span><span className="text-[var(--text)] font-medium">{sketchMarks ? 'Sim' : 'Nenhuma'}</span></div>
                <div className="flex justify-between"><span className="text-[var(--text-muted)]">Vídeo de avaria</span><span className="text-[var(--text)] font-medium">{damageVideoFile ? '✓ Registrado' : 'Não gravado'}</span></div>
                <div className="flex justify-between"><span className="text-[var(--text-muted)]">Foto combustível</span><span className="text-[var(--text)] font-medium">{fuelPhotoFile ? '✓ Registrada' : 'Não tirada'}</span></div>
                {lifeVests > 0 && <div className="flex justify-between text-amber-600 font-bold"><span>🦺 Coletes emprestados</span><span>{lifeVests}</span></div>}
                {observations && <div><span className="text-[var(--text-muted)]">Observações:</span><p className="text-[var(--text)] mt-1">{observations}</p></div>}
              </div>
              {fuelPreview && <img loading="lazy" decoding="async" src={fuelPreview} alt="Tanque" className="w-full max-h-32 object-contain rounded-xl border border-[var(--border)]" />}
              <div className="flex gap-2 pt-2">
                <button onClick={() => setStep('fuel')} className="flex items-center gap-2 px-4 py-2.5 border border-[var(--border)] text-[var(--text-muted)] rounded-xl text-sm hover:bg-[var(--bg)]"><ChevronLeft className="w-4 h-4" />Voltar</button>
                <button onClick={handleSubmit} disabled={submitting}
                  className="flex-[2] py-2.5 bg-green-500 hover:bg-green-600 disabled:bg-gray-400 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2">
                  {submitting ? <><Loader2 className="w-4 h-4 animate-spin" />Subindo...</> : <><ArrowUp className="w-4 h-4" />Confirmar e Subir Jet</>}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface FuelLog {
  id: string; liters: number; totalCost: number; createdAt: string;
}

interface ClientReservation {
  id: string; startDate: string; endDate: string; status: string;
  boat?: { id: string; name: string; model: string };
  checklist?: ClientChecklist | null;
  fuelLogs?: FuelLog[];
  totalFuel?: number;
  fuelCost?: number;
}

const statusConf: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  CONFIRMED: { label: 'Confirmada', bg: 'bg-emerald-500/10', text: 'text-emerald-500', dot: 'bg-emerald-400' },
  PENDING: { label: 'Pendente', bg: 'bg-amber-500/10', text: 'text-amber-500', dot: 'bg-amber-400' },
  IN_USE: { label: 'Em Uso', bg: 'bg-blue-500/10', text: 'text-blue-500', dot: 'bg-blue-400' },
  COMPLETED: { label: 'Concluído', bg: 'bg-sky-500/10', text: 'text-sky-500', dot: 'bg-sky-400' },
  CANCELLED: { label: 'Cancelado', bg: 'bg-red-500/10', text: 'text-red-500', dot: 'bg-red-400' },
};

function ClientView() {
  const [reservations, setReservations] = useCachedState<ClientReservation[]>('pc:operations:clientReservations', []);
  const [loading, setLoading] = useState(() => !hasCached('pc:operations:clientReservations'));
  const [selected, setSelected] = useState<ClientChecklist | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [tab, setTab] = useState<'active' | 'history'>('active');

  useEffect(() => {
    (async () => {
      if (!hasCached('pc:operations:clientReservations')) setLoading(true);
      try {
        const res = await getMyReservationsForChecklist();
        const checklistData: ClientReservation[] = Array.isArray(res.data) ? res.data : res.data?.data || [];

        // Also load usages (fuel + completed reservations)
        let usageData: ClientReservation[] = [];
        try {
          const usageRes = await api.get('/operations/usages/my');
          usageData = Array.isArray(usageRes.data) ? usageRes.data : usageRes.data?.data || [];
        } catch { /* empty */ }

        // Merge: usages have fuel info, checklists have detailed inspections
        const mergedMap = new Map<string, ClientReservation>();
        checklistData.forEach(r => mergedMap.set(r.id, r));
        usageData.forEach(r => {
          const existing = mergedMap.get(r.id);
          if (existing) {
            // Keep checklist from checklistData (more complete with operator)
            mergedMap.set(r.id, { ...r, checklist: existing.checklist || r.checklist });
          } else {
            mergedMap.set(r.id, r);
          }
        });

        const merged = Array.from(mergedMap.values()).sort(
          (a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
        );
        setReservations(merged);
      } catch { setReservations([]); } finally { setLoading(false); }
    })();
  }, []);

  const fmtFull = (s: string) => new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: BRT });
  const fmtShort = (s: string) => new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: BRT });

  const activeStatuses = ['CONFIRMED', 'PENDING', 'IN_USE'];
  const active = reservations.filter(r => activeStatuses.includes(r.status));
  const history = reservations.filter(r => !activeStatuses.includes(r.status));

  /* ── Detail view ─────────────────────────────────────────────────────── */
  if (selected) return (
    <ChecklistComparisonView selected={selected} onBack={() => { setSelected(null); }} />
  );

  /* ── Reservation list ─────────────────────────────────────────────────── */
  const items = tab === 'active' ? active : history;

  return (
    <div className="p-4 pb-4 space-y-4">
      {/* Tabs */}
      <div className="flex gap-2 bg-[var(--subtle)] rounded-xl p-1">
        <button
          onClick={() => setTab('active')}
          className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${tab === 'active' ? 'bg-primary-500 text-white shadow-sm' : 'text-[var(--text-secondary)]'}`}
        >
          Em andamento {active.length > 0 && `(${active.length})`}
        </button>
        <button
          onClick={() => setTab('history')}
          className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${tab === 'history' ? 'bg-primary-500 text-white shadow-sm' : 'text-[var(--text-secondary)]'}`}
        >
          Histórico {history.length > 0 && `(${history.length})`}
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-primary-500" /></div>
      ) : items.length === 0 ? (
        <div className="text-center py-16">
          <Ship className="w-12 h-12 mx-auto mb-3 text-[var(--text-muted)]" />
          <p className="text-sm text-[var(--text-muted)] font-medium">
            {tab === 'active' ? 'Nenhuma reserva ativa' : 'Nenhum uso registrado'}
          </p>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            {tab === 'active' ? 'Suas reservas confirmadas aparecerão aqui' : 'Seus passeios aparecerão aqui'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map(r => {
            const sc = statusConf[r.status] || { label: r.status, bg: 'bg-[var(--subtle)]', text: 'text-[var(--text-secondary)]', dot: 'bg-gray-400' };
            const totalFuel = r.totalFuel || (r.fuelLogs || []).reduce((s, f) => s + (f.liters || 0), 0);
            const fuelCost = r.fuelCost || (r.fuelLogs || []).reduce((s, f) => s + (f.totalCost || 0), 0);
            const hasChecklist = r.checklist && (r.checklist.status === 'APPROVED' || r.checklist.status === 'COMPLETED');
            const isExpanded = expandedId === r.id;

            return (
              <div key={r.id} className="bg-[var(--card)] border border-[var(--border)] rounded-2xl overflow-hidden">
                {/* Main row — tap to expand */}
                <button onClick={() => setExpandedId(isExpanded ? null : r.id)} className="w-full text-left p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${hasChecklist ? 'bg-emerald-500/10' : 'bg-blue-500/10'}`}>
                        {hasChecklist
                          ? <CheckCircle className="w-5 h-5 text-emerald-500" />
                          : <Ship className="w-5 h-5 text-blue-500" />}
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-[var(--text)] text-sm truncate">{r.boat?.name || 'Embarcação'}</p>
                        <p className="text-xs text-[var(--text-secondary)]">{r.boat?.model}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${sc.bg} ${sc.text}`}>{sc.label}</span>
                      <ChevronRight className={`w-4 h-4 text-[var(--text-muted)] transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                    </div>
                  </div>

                  {/* Info row */}
                  <div className="mt-3 flex items-center gap-4 text-[11px] text-[var(--text-secondary)]">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-primary-400" />
                      {fmtShort(r.startDate)}
                    </span>
                    {totalFuel > 0 && (
                      <span className="flex items-center gap-1">
                        <DollarSign className="w-3.5 h-3.5 text-amber-400" />
                        {totalFuel.toFixed(1)}L · R$ {fuelCost.toFixed(0)}
                      </span>
                    )}
                    {hasChecklist && (
                      <span className="flex items-center gap-1 text-emerald-500">
                        <ClipboardCheck className="w-3.5 h-3.5" />
                        Aprovado
                      </span>
                    )}
                  </div>
                </button>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="border-t border-[var(--border)] p-4 space-y-3 bg-[var(--subtle)]/30">
                    {/* Times */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-[var(--card)] rounded-xl p-3 border border-[var(--border)]">
                        <p className="text-[10px] text-[var(--text-muted)] uppercase font-semibold">Saída</p>
                        <p className="text-xs font-bold text-[var(--text)] mt-0.5">{fmtFull(r.startDate)}</p>
                      </div>
                      <div className="bg-[var(--card)] rounded-xl p-3 border border-[var(--border)]">
                        <p className="text-[10px] text-[var(--text-muted)] uppercase font-semibold">Retorno</p>
                        <p className="text-xs font-bold text-[var(--text)] mt-0.5">{fmtFull(r.endDate)}</p>
                      </div>
                    </div>

                    {/* Fuel info */}
                    {totalFuel > 0 && (
                      <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
                        <p className="text-xs font-semibold text-amber-500 mb-1">Combustível</p>
                        <p className="text-sm font-bold text-amber-500">
                          {totalFuel.toFixed(1)}L
                          <span className="text-xs font-normal ml-2">R$ {fuelCost.toFixed(2)}</span>
                        </p>
                        {(r.fuelLogs || []).length > 1 && (
                          <p className="text-[11px] text-amber-400 mt-0.5">{r.fuelLogs!.length} abastecimentos</p>
                        )}
                      </div>
                    )}

                    {/* Checklist info */}
                    {r.checklist && (
                      <div className={`rounded-xl p-3 border ${
                        hasChecklist ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-amber-500/10 border-amber-500/20'
                      }`}>
                        <div className="flex items-center justify-between">
                          <div>
                            <p className={`text-xs font-semibold ${hasChecklist ? 'text-emerald-500' : 'text-amber-500'}`}>
                              Checklist Pré-Saída
                            </p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className={`text-[11px] font-medium ${hasChecklist ? 'text-emerald-400' : 'text-amber-400'}`}>
                                {hasChecklist ? '✓ Aprovado' : '⏳ Pendente'}
                              </span>
                              {r.checklist.operator && (
                                <span className="text-[11px] text-[var(--text-muted)] flex items-center gap-0.5">
                                  <User className="w-3 h-3" /> {r.checklist.operator.name}
                                </span>
                              )}
                            </div>
                          </div>
                          {hasChecklist && (
                            <button
                              onClick={(e) => { e.stopPropagation(); setSelected(r.checklist!); }}
                              className="text-[11px] bg-primary-500/10 text-primary-500 px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1"
                            >
                              <Eye className="w-3.5 h-3.5" /> Detalhes
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Return info */}
                    {r.checklist?.returnCompletedAt && (
                      <div className="bg-sky-500/10 border border-sky-500/20 rounded-xl p-3">
                        <p className="text-xs font-semibold text-sky-500 mb-1">Inspeção de Retorno</p>
                        <p className="text-[11px] text-[var(--text-secondary)]">
                          Retorno em {fmtFull(r.checklist.returnCompletedAt)}
                        </p>
                        {r.checklist.returnObservations && (
                          <p className="text-[11px] text-[var(--text-muted)] mt-1 italic">{r.checklist.returnObservations}</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
