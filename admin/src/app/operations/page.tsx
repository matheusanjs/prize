'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import {
  Settings, ArrowUp, ArrowDown, CheckCircle2, Clock, User, RefreshCw,
  Filter, Eye, X, Waves, AlertTriangle, ClipboardCheck, Video, PenLine,
  ChevronDown, Ship, Pen, Eraser, Trash2, Loader2, AlertCircle, ChevronLeft, ChevronRight,
  DollarSign, FileText, Download, ClipboardList, Camera, Search, Calendar,
} from 'lucide-react';
import {
  getQueue, getChecklists, liftBoat, liftAllBoats, launchToWater, getBoats,
  getTodayReservations, startAdHocPreLaunch, submitPreLaunch, deleteChecklist,
  getCharges, getSharesByBoat, getChecklistsByBoat,
} from '@/services/api';

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

/* ─── Types ──────────────────────────────────────────────────────────────── */
interface ChecklistFull {
  id: string; status: string; lifeVestsLoaned?: number;
  hullSketchMarks?: string; hullSketchUrl?: string;
  fuelPhotoUrl?: string; videoUrl?: string;
  additionalObservations?: string;
  returnFuelPhotoUrl?: string; returnSketchMarks?: string;
  returnObservations?: string; returnCompletedAt?: string;
  items?: { id: string; label: string; checked: boolean; notes?: string; order: number }[];
}
interface QueueItem {
  id: string; position: number; status: string; scheduledAt: string;
  startedAt?: string; completedAt?: string;
  boat?: { id: string; name: string; model: string };
  client?: { id: string; name: string; phone?: string };
  reservation?: { id: string; startDate: string; endDate: string; status: string;
    confirmedAt?: string | null;
    expectedArrivalTime?: string | null;
    user?: { id: string; name: string };
    checklist?: ChecklistFull | null;
  };
}
interface ChecklistEntry {
  id: string; status: string; type: string; completedAt: string; createdAt: string;
  hullSketchUrl?: string; hullSketchMarks?: string; videoUrl?: string; fuelPhotoUrl?: string; additionalObservations?: string;
  lifeVestsLoaned?: number;
  returnFuelPhotoUrl?: string; returnSketchMarks?: string; returnObservations?: string; returnCompletedAt?: string;
  boat?: { id: string; name: string; model?: string };
  operator?: { id: string; name: string };
  reservation?: { id: string; startDate: string; endDate: string; status: string };
  items?: { id: string; label: string; checked: boolean; notes?: string }[];
}
interface Boat { id: string; name: string; model?: string }
interface TodayRes {
  id: string; startDate: string; endDate: string; status: string;
  boat?: { id: string; name: string; model: string };
  user?: { id: string; name: string; phone?: string };
  checklist?: { id: string; status: string } | null;
  queue?: { id: string; status: string } | null;
}

/* ─── Helpers ────────────────────────────────────────────────────────────── */
const PRE_LAUNCH_ITEMS = [
  'Âncora e cabo presentes',
  'Documentação a bordo',
  'Motor de arranque funcionando',
  'Bateria carregada',
  'Nível de combustível verificado',
];
const queueStatusCfg: Record<string, { label: string; bg: string }> = {
  WAITING:   { label: 'Aguardando',  bg: 'bg-gray-100 text-gray-700 dark:bg-gray-700/30 dark:text-gray-300' },
  PREPARING: { label: 'Preparando',  bg: 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400' },
  LAUNCHING: { label: 'Descendo',    bg: 'bg-blue-500/10 text-blue-700 dark:text-blue-400' },
  IN_WATER:  { label: 'Na Água',     bg: 'bg-green-500/10 text-green-700 dark:text-green-400' },
  RETURNING: { label: 'Retornando',  bg: 'bg-purple-500/10 text-purple-700 dark:text-purple-400' },
  COMPLETED: { label: 'Concluído',   bg: 'bg-teal-500/10 text-teal-700 dark:text-teal-400' },
};
const BRT = 'America/Sao_Paulo';
const fmt  = (s: string) => new Date(s).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: BRT });
const fmtD = (s: string) => new Date(s).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: BRT });

/* ─── Main page ──────────────────────────────────────────────────────────── */
export default function OperationsPage() {
  const [showInspections, setShowInspections] = useState(false);
  const [inspectionDetail, setInspectionDetail] = useState<ChecklistEntry | null>(null);
  const [queue, setQueue]               = useState<QueueItem[]>([]);
  const [checklists, setChecklists]     = useState<ChecklistEntry[]>([]);
  const [boats, setBoats]               = useState<Boat[]>([]);
  const [todayRes, setTodayRes]         = useState<TodayRes[]>([]);
  const [loading, setLoading]           = useState(true);
  const [selected, setSelected]         = useState<Set<string>>(new Set());
  const [liftingAll, setLiftingAll]     = useState(false);
  const [liftingId, setLiftingId]       = useState<string | null>(null);
  const [launchingId, setLaunchingId]   = useState<string | null>(null);
  const [filterBoat, setFilterBoat]     = useState('');
  const [detailCL, setDetailCL]         = useState<ChecklistEntry | null>(null);
  const [showWizard, setShowWizard]     = useState(false);
  const [continueChecklist, setContinueChecklist] = useState<ChecklistEntry | null>(null);
  const [wizardReservation, setWizardReservation] = useState<TodayRes | null>(null);
  const [postChecklistQueue, setPostChecklistQueue] = useState<QueueItem | null>(null);
  const [returnInspectionItem, setReturnInspectionItem] = useState<QueueItem | null>(null);
  const [showDoneChecklists, setShowDoneChecklists] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDate, setSelectedDate] = useState(() => new Date().toLocaleDateString('en-CA', { timeZone: BRT }));

  const handleDeleteChecklist = async (cl: ChecklistEntry) => {
    if (!confirm(`Excluir checklist de ${cl.boat?.name || 'embarcação'}?`)) return;
    try { await deleteChecklist(cl.id); await load(); } catch { alert('Erro ao excluir checklist'); }
  };

  const handleContinueChecklist = (cl: ChecklistEntry) => {
    setContinueChecklist(cl);
    setShowWizard(true);
  };

  const isToday = selectedDate === new Date().toLocaleDateString('en-CA', { timeZone: BRT });

  const load = useCallback(async () => {
    try {
      const [qRes, cRes, bRes, tRes] = await Promise.all([
        getQueue({ date: selectedDate }).catch(() => ({ data: [] })),
        getChecklists({ date: selectedDate }).catch(() => ({ data: [] })),
        getBoats().catch(() => ({ data: [] })),
        getTodayReservations(selectedDate).catch(() => ({ data: [] })),
      ]);
      const q = qRes.data; setQueue(Array.isArray(q) ? q : q?.data || []);
      const c = cRes.data; setChecklists(Array.isArray(c) ? c : c?.data || []);
      const b = bRes.data; setBoats(Array.isArray(b) ? b : b?.data || []);
      const t = tRes.data; setTodayRes(Array.isArray(t) ? t : t?.data || []);
    } finally { setLoading(false); }
  }, [selectedDate]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);

  const inWater     = queue.filter(q => q.status === 'IN_WATER');
  const waiting     = queue.filter(q => ['WAITING','PREPARING','LAUNCHING'].includes(q.status) && q.reservation?.status !== 'CANCELLED');
  const completed   = queue.filter(q => ['COMPLETED','RETURNING'].includes(q.status));
  const approvedCL  = checklists.filter(c => c.status === 'APPROVED');
  const pendingCL   = checklists.filter(c => c.status === 'PENDING');

  // Search filter helper — memoized to avoid recomputing on every render
  const matchQueue = useMemo(() => {
    if (!searchTerm) return () => true;
    const s = searchTerm.toLowerCase();
    return (q: QueueItem) => [q.boat?.name, q.boat?.model, q.client?.name, q.reservation?.user?.name].some(v => v?.toLowerCase().includes(s));
  }, [searchTerm]);
  const matchRes = useMemo(() => {
    if (!searchTerm) return () => true;
    const s = searchTerm.toLowerCase();
    return (r: TodayRes) => [r.boat?.name, r.boat?.model, r.user?.name].some(v => v?.toLowerCase().includes(s));
  }, [searchTerm]);
  const matchCL = useMemo(() => {
    if (!searchTerm) return () => true;
    const s = searchTerm.toLowerCase();
    return (c: ChecklistEntry) => [c.boat?.name, c.operator?.name].some(v => v?.toLowerCase().includes(s));
  }, [searchTerm]);

  const filteredIW  = (filterBoat ? inWater.filter(q => q.boat?.id === filterBoat) : inWater).filter(matchQueue);
  const filteredWaiting = waiting.filter(matchQueue);
  const checklistDoneCount = filteredWaiting.filter(i => i.reservation?.checklist?.status === 'APPROVED').length;
  const checklistPendingCount = filteredWaiting.filter(i => i.reservation?.checklist?.status === 'PENDING').length;
  const filteredCompleted = completed.filter(matchQueue);
  const filteredApprovedCL = approvedCL.filter(matchCL);
  const filteredPendingCL = pendingCL.filter(matchCL);

  // Today's reservations: separate by state
  // 1. Reservations that need check-in (no checklist yet, OR checklist still PENDING)
  const needsCheckin = todayRes.filter(r =>
    (!r.checklist || r.checklist.status === 'PENDING') && !r.queue && ['CONFIRMED', 'PENDING'].includes(r.status)
  ).filter(matchRes);
  // 2. Reservations with checklist done (APPROVED) but not in water yet
  const readyToLaunch = todayRes.filter(r =>
    r.checklist?.status === 'APPROVED' && !r.queue && r.status !== 'IN_USE'
  ).filter(matchRes);
  // Standalone pending checklists (not linked to today's reservations)
  const standalonePendingCL = filteredPendingCL.filter(c => !needsCheckin.some(r => r.checklist?.id === c.id));
  // Count for column header
  const doneCount = readyToLaunch.length + filteredApprovedCL.filter(c => !readyToLaunch.some(r => r.checklist?.id === c.id)).length;
  const col1Count = needsCheckin.length + standalonePendingCL.length + (showDoneChecklists ? doneCount : 0);

  // Inspections for selected date: checklists already filtered by date from API
  const todayInspections = checklists;

  async function handleLift(item: QueueItem) {
    setReturnInspectionItem(item);
  }

  function handleStartCheckin(r: TodayRes) {
    setWizardReservation(r);
    setShowWizard(true);
  }
  function handleStartCheckinFromQueue(item: QueueItem) {
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
  }
  function handleContinueChecklistFromQueue(cl: ChecklistEntry, item: QueueItem) {
    setPostChecklistQueue(item);
    setContinueChecklist(cl);
    setShowWizard(true);
  }
  async function doLiftBoat(item: QueueItem, returnData?: Record<string, unknown>) {
    setLiftingId(item.id);
    try { await liftBoat(item.id, returnData); await load(); setSelected(p => { const n = new Set(p); n.delete(item.id); return n; }); }
    catch { alert('Erro ao subir jet ski'); } finally { setLiftingId(null); }
  }
  async function handleLaunchToWater(item: QueueItem) {
    if (!confirm(`Colocar ${item.boat?.name || 'jet ski'} na água?`)) return;
    setLaunchingId(item.id);
    try { await launchToWater(item.id); await load(); }
    catch { alert('Erro ao colocar na água'); } finally { setLaunchingId(null); }
  }
  async function handleLiftSelected() {
    setLiftingAll(true);
    try { await Promise.all(queue.filter(q => selected.has(q.id) && q.status === 'IN_WATER').map(q => liftBoat(q.id))); await load(); setSelected(new Set()); }
    finally { setLiftingAll(false); }
  }
  async function handleLiftAll() {
    if (!confirm(`Subir todos os ${inWater.length} jets na água?`)) return;
    setLiftingAll(true);
    try { await liftAllBoats(); await load(); } finally { setLiftingAll(false); }
  }
  const toggleSelect = (id: string) => setSelected(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col">
      {/* ───── HEADER ───── */}
      <div className="px-6 py-3 flex items-center justify-between flex-wrap gap-3 bg-th-card border-b border-th flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500/20 to-indigo-500/20 flex items-center justify-center">
            <Settings className="w-5 h-5 text-blue-500" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-th">Operações</h1>
            <div className="flex items-center gap-3 text-xs text-th-muted mt-0.5">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-500" /><strong className="text-orange-600">{needsCheckin.length}</strong> check-in</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" /><strong className="text-green-600">{inWater.length}</strong> na água</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-500" /><strong className="text-yellow-600">{waiting.length}</strong> aguardando</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-400" /><strong className="text-gray-500">{completed.length}</strong> concluídos</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="p-2 hover:bg-th-bg rounded-lg text-th-muted transition-colors" title="Atualizar"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button>
          <button onClick={() => setShowDoneChecklists(v => !v)}
            className={`flex items-center gap-2 px-3 py-2 border hover:bg-th-bg rounded-lg text-sm font-medium transition-colors ${showDoneChecklists ? 'border-green-500 bg-green-500/10 text-green-600' : 'border-th text-th-muted hover:text-th'}`}>
            <CheckCircle2 className="w-4 h-4" />{showDoneChecklists ? 'Ocultar' : 'Mostrar'} Prontos
            {doneCount > 0 && <span className="text-xs bg-green-500/10 text-green-600 px-1.5 py-0.5 rounded-full font-bold">{doneCount}</span>}
          </button>
          <button onClick={() => setShowInspections(true)}
            className="flex items-center gap-2 px-3 py-2 border border-th hover:bg-th-bg text-th-muted hover:text-th rounded-lg text-sm font-medium transition-colors relative">
            <ClipboardList className="w-4 h-4" />Inspeções
            {todayInspections.length > 0 && <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-blue-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">{todayInspections.length}</span>}
          </button>
          <button onClick={() => setShowWizard(true)}
            className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-bold transition-colors shadow-sm">
            <ClipboardCheck className="w-4 h-4" />Realizar Checklist
          </button>
          {selected.size > 0 && (
            <button disabled={liftingAll} onClick={handleLiftSelected}
              className="flex items-center gap-2 px-3 py-2 bg-orange-400 hover:bg-orange-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
              <ArrowUp className="w-4 h-4" />Subir {selected.size}
            </button>
          )}
          <button disabled={liftingAll || inWater.length === 0} onClick={handleLiftAll}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-bold transition-colors">
            {liftingAll ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ArrowUp className="w-4 h-4" />}
            SUBIR TODOS
          </button>
        </div>
      </div>

      {/* ───── FILTER BAR ───── */}
      <div className="px-6 py-2 flex items-center gap-3 bg-th-card/80 border-b border-th flex-shrink-0 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-th-muted" />
          <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
            placeholder="Buscar jet, cliente, operador..."
            className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-th text-sm bg-th-card text-th focus:outline-none focus:border-primary-400" />
        </div>
        <div className="flex items-center gap-1.5">
          <Calendar size={15} className="text-th-muted" />
          <input type="date" value={selectedDate} onChange={e => { setSelectedDate(e.target.value); setLoading(true); }}
            className="px-2 py-1.5 rounded-lg border border-th text-sm bg-th-card text-th focus:outline-none focus:border-primary-400" />
          {!isToday && (
            <button onClick={() => { setSelectedDate(new Date().toLocaleDateString('en-CA', { timeZone: BRT })); setLoading(true); }}
              className="px-2 py-1.5 rounded-lg text-xs font-medium bg-primary-500/10 text-primary-500 hover:bg-primary-500/20 transition">
              Hoje
            </button>
          )}
        </div>
        {!isToday && (
          <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-600 flex items-center gap-1">
            <Calendar size={12} />{new Date(selectedDate + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', timeZone: BRT })}
          </span>
        )}
        {searchTerm && (
          <button onClick={() => setSearchTerm('')}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium bg-red-500/10 text-red-500 hover:bg-red-500/20 transition">
            <X size={12} /> Limpar busca
          </button>
        )}
      </div>

      {/* ───── KANBAN BOARD ───── */}
      <div className="flex-1 overflow-hidden">
        <div className="flex gap-4 p-4 h-full">

          {/* ── COL 1: CHECK-IN ── */}
          <div className="flex-1 min-w-0 bg-th-card/60 backdrop-blur rounded-2xl border border-th flex flex-col">
            <div className="p-3 border-b border-th flex-shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-orange-500" />
                  <h3 className="text-sm font-bold text-th">Check-in</h3>
                </div>
                <span className="text-xs bg-orange-500/10 text-orange-600 px-2 py-0.5 rounded-full font-bold">{col1Count}</span>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-thin">
              {/* Today's reservations needing check-in */}
              {needsCheckin.length > 0 && (
                <>
                  <p className="text-[11px] font-bold text-orange-600 uppercase tracking-wider flex items-center gap-1.5"><Clock className="w-3 h-3" />Aguardando Check-in ({needsCheckin.length})</p>
                  {needsCheckin.map(r => {
                    const hasPendingCL = r.checklist && r.checklist.status === 'PENDING';
                    const matchingCl = hasPendingCL ? checklists.find(c => c.id === r.checklist?.id) : null;
                    return (
                      <div key={r.id} className={`bg-th-card border-2 rounded-2xl p-4 transition-all ${hasPendingCL ? 'border-yellow-400/40 hover:border-yellow-500' : 'border-orange-400/40 hover:border-orange-500'}`}>
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2.5">
                            <div className="w-9 h-9 rounded-xl bg-orange-500/10 flex items-center justify-center flex-shrink-0"><Ship className="w-4.5 h-4.5 text-orange-500" /></div>
                            <div>
                              <p className="font-bold text-sm text-th">{r.boat?.name || '—'}</p>
                              <p className="text-[11px] text-th-muted">{r.boat?.model}</p>
                            </div>
                          </div>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${hasPendingCL ? 'bg-yellow-500/10 text-yellow-600' : 'bg-orange-500/10 text-orange-600'}`}>
                            {hasPendingCL ? 'Pendente' : 'Reservado'}
                          </span>
                        </div>
                        <div className="space-y-1 mb-3">
                          <div className="flex items-center gap-1.5 text-xs text-th-muted"><User className="w-3 h-3" />{r.user?.name || '—'}</div>
                          <div className="flex items-center gap-1.5 text-xs text-orange-600 font-medium"><Clock className="w-3 h-3" />{fmt(r.startDate)} → {fmt(r.endDate)}</div>
                        </div>
                        {hasPendingCL && matchingCl ? (
                          <button onClick={() => handleContinueChecklist(matchingCl)}
                            className="w-full py-2 bg-yellow-500 hover:bg-yellow-600 text-white rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5">
                            <ChevronRight className="w-3.5 h-3.5" />Continuar Check-in
                          </button>
                        ) : (
                          <button onClick={() => handleStartCheckin(r)}
                            className="w-full py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5">
                            <ClipboardCheck className="w-3.5 h-3.5" />Realizar Check-in
                          </button>
                        )}
                      </div>
                    );
                  })}
                </>
              )}

              {/* Standalone pending checklists (not linked to reservations) */}
              {standalonePendingCL.length > 0 && (
                <>
                  {needsCheckin.length > 0 && <div className="border-t border-th my-2" />}
                  {standalonePendingCL.map(cl => (
                    <CLCard key={cl.id} cl={cl} onView={setDetailCL} onContinue={handleContinueChecklist} onDelete={handleDeleteChecklist} />
                  ))}
                </>
              )}

              {/* Ready (approved checklists) — hidden by default */}
              {showDoneChecklists && (readyToLaunch.length > 0 || filteredApprovedCL.length > 0) && (
                <>
                  {(needsCheckin.length > 0 || standalonePendingCL.length > 0) && <div className="border-t border-th my-2" />}
                  <p className="text-[11px] font-bold text-green-600 uppercase tracking-wider flex items-center gap-1.5"><CheckCircle2 className="w-3 h-3" />Prontos ({doneCount})</p>
                  {readyToLaunch.map(r => {
                    const cl = checklists.find(c => c.id === r.checklist?.id);
                    if (cl) return <CLCard key={r.id} cl={cl} onView={setDetailCL} onDelete={handleDeleteChecklist} />;
                    return null;
                  })}
                  {filteredApprovedCL.filter(c => !readyToLaunch.some(r => r.checklist?.id === c.id)).map(cl => (
                    <CLCard key={cl.id} cl={cl} onView={setDetailCL} onDelete={handleDeleteChecklist} />
                  ))}
                </>
              )}

              {col1Count === 0 && !loading && (
                <div className="flex flex-col items-center justify-center py-12 text-th-muted opacity-60">
                  <ClipboardCheck className="w-10 h-10 mb-2" />
                  <p className="text-xs">Nenhuma reserva para hoje</p>
                  <p className="text-[10px] mt-1">Use o botão "Realizar Checklist" para criar avulso</p>
                </div>
              )}
            </div>
          </div>

          {/* ── COL 2: CONFIRMADOS ── */}
          <div className="flex-1 min-w-0 bg-th-card/60 backdrop-blur rounded-2xl border border-th flex flex-col">
            <div className="p-3 border-b border-th flex-shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-blue-500" />
                  <h3 className="text-sm font-bold text-th">Confirmados</h3>
                  {checklistDoneCount > 0 && (
                    <span className="text-[10px] bg-green-500/15 text-green-600 px-1.5 py-0.5 rounded-full font-bold flex items-center gap-0.5">
                      <CheckCircle2 className="w-2.5 h-2.5" />{checklistDoneCount} CL
                    </span>
                  )}
                </div>
                <span className="text-xs bg-blue-500/10 text-blue-600 px-2 py-0.5 rounded-full font-bold">{filteredWaiting.length}</span>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-thin">
              {filteredWaiting.map(item => {
                const cfg = queueStatusCfg[item.status] || queueStatusCfg.WAITING;
                const arrivalTime = item.reservation?.expectedArrivalTime;
                const checklist = item.reservation?.checklist;
                const checklistApproved = checklist?.status === 'APPROVED';
                const checklistPending = checklist?.status === 'PENDING';
                const existingPendingCL = checklistPending ? checklists.find(c => c.id === checklist?.id) || null : null;
                return (
                  <div key={item.id} className="bg-th-card border border-th rounded-xl p-3 hover:border-blue-500/40 transition-all">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="font-bold text-sm text-th">{item.boat?.name || '—'}</p>
                        <p className="text-[11px] text-th-muted">{item.boat?.model}</p>
                      </div>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${cfg.bg}`}>{cfg.label}</span>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 text-xs text-th-muted"><User className="w-3 h-3" />{item.client?.name || '—'}</div>
                      <div className="flex items-center gap-1.5 text-xs text-th-muted"><Clock className="w-3 h-3" />{item.reservation ? fmt(item.reservation.startDate) : fmt(item.scheduledAt)}</div>
                      {arrivalTime && (
                        <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium bg-emerald-500/10 rounded-lg px-2 py-1 mt-1">
                          <CheckCircle2 className="w-3 h-3 flex-shrink-0" />
                          Chegada prevista: <strong>{arrivalTime}</strong>
                        </div>
                      )}
                    </div>
                    {item.position && (
                      <div className="mt-2 flex items-center gap-1.5">
                        <div className="w-6 h-6 rounded-md bg-blue-500/10 flex items-center justify-center text-[10px] font-bold text-blue-600">#{item.position}</div>
                        <span className="text-[10px] text-th-muted">posição na fila</span>
                      </div>
                    )}
                    {/* Checklist status badge + action buttons */}
                    {checklistApproved && (
                      <div className="mt-2 flex items-center gap-1.5 px-2 py-1 bg-green-500/10 rounded-lg">
                        <CheckCircle2 className="w-3 h-3 text-green-600 flex-shrink-0" />
                        <span className="text-[10px] font-bold text-green-600 uppercase tracking-wide">Checklist Feito</span>
                      </div>
                    )}
                    {checklistApproved && item.status === 'WAITING' && (
                      <button
                        disabled={launchingId === item.id}
                        onClick={() => handleLaunchToWater(item)}
                        className="mt-2 w-full py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1.5"
                      >
                        {launchingId === item.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <ArrowDown className="w-3.5 h-3.5" />}
                        Ir para a água
                      </button>
                    )}
                    {!checklist && (
                      <button
                        onClick={() => handleStartCheckinFromQueue(item)}
                        className="mt-2 w-full py-1.5 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1.5"
                      >
                        <ClipboardCheck className="w-3.5 h-3.5" />Realizar Checklist
                      </button>
                    )}
                    {checklistPending && existingPendingCL && (
                      <button
                        onClick={() => handleContinueChecklistFromQueue(existingPendingCL, item)}
                        className="mt-2 w-full py-1.5 bg-yellow-500 hover:bg-yellow-600 text-white rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1.5"
                      >
                        <ChevronRight className="w-3.5 h-3.5" />Continuar Checklist
                      </button>
                    )}
                  </div>
                );
              })}
              {filteredWaiting.length === 0 && !loading && (
                <div className="flex flex-col items-center justify-center py-12 text-th-muted opacity-60">
                  <Clock className="w-10 h-10 mb-2" />
                  <p className="text-xs">Nenhum confirmado</p>
                </div>
              )}
            </div>
          </div>

          {/* ── COL 3: NA ÁGUA (main column, wider) ── */}
          <div className="flex-[1.3] min-w-0 bg-th-card/60 backdrop-blur rounded-2xl border border-green-500/30 flex flex-col ring-1 ring-green-500/10">
            <div className="p-3 border-b border-green-500/20 flex-shrink-0 bg-green-500/5 rounded-t-2xl">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
                  <h3 className="text-sm font-bold text-green-700 dark:text-green-400">Na Água</h3>
                </div>
                <span className="text-xs bg-green-500/10 text-green-600 px-2 py-0.5 rounded-full font-bold">{inWater.length}</span>
              </div>
              <select value={filterBoat} onChange={e => setFilterBoat(e.target.value)}
                className="w-full px-2 py-1 text-xs bg-th-card border border-th rounded-lg text-th focus:outline-none focus:border-green-400">
                <option value="">Todas embarcações</option>
                {boats.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-thin">
              {filteredIW.map(item => (
                <div key={item.id} onClick={() => toggleSelect(item.id)}
                  className={`bg-th-card border-2 rounded-xl p-3 cursor-pointer transition-all ${selected.has(item.id) ? 'border-orange-400 bg-orange-500/5 shadow-md' : 'border-green-500/20 hover:border-green-500/40'}`}>
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <input type="checkbox" checked={selected.has(item.id)} onChange={() => toggleSelect(item.id)} onClick={e => e.stopPropagation()} className="w-4 h-4 rounded accent-orange-500" />
                      <div>
                        <p className="font-bold text-sm text-th">{item.boat?.name || '—'}</p>
                        <p className="text-[11px] text-th-muted">{item.boat?.model}</p>
                      </div>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-green-500/10 text-green-600 flex items-center gap-1">
                      <Waves className="w-3 h-3" />Ativo
                    </span>
                  </div>
                  <div className="space-y-1 mb-2">
                    <div className="flex items-center gap-1.5 text-xs text-th-muted"><User className="w-3 h-3" />{item.client?.name || '—'}</div>
                    {item.reservation && <div className="flex items-center gap-1.5 text-xs text-orange-600 font-medium"><Clock className="w-3 h-3" />Retorno: {fmt(item.reservation.endDate)}</div>}
                    {item.startedAt && <div className="flex items-center gap-1.5 text-[11px] text-th-muted"><ArrowDown className="w-3 h-3" />Desceu {fmt(item.startedAt)}</div>}
                  </div>
                  <button disabled={liftingId === item.id} onClick={e => { e.stopPropagation(); handleLift(item); }}
                    className="w-full py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1.5">
                    {liftingId === item.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <ArrowUp className="w-3.5 h-3.5" />}Subir Jet
                  </button>
                </div>
              ))}
              {filteredIW.length === 0 && !loading && (
                <div className="flex flex-col items-center justify-center py-12 text-th-muted opacity-60">
                  <Waves className="w-10 h-10 mb-2" />
                  <p className="text-xs">{filterBoat ? 'Nenhum com este filtro' : 'Nenhum na água'}</p>
                </div>
              )}
            </div>
          </div>

          {/* ── COL 4: CONCLUÍDOS ── */}
          <div className="flex-1 min-w-0 bg-th-card/60 backdrop-blur rounded-2xl border border-th flex flex-col">
            <div className="p-3 border-b border-th flex-shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-gray-400" />
                  <h3 className="text-sm font-bold text-th">Concluídos</h3>
                </div>
                <span className="text-xs bg-gray-500/10 text-gray-500 px-2 py-0.5 rounded-full font-bold">{filteredCompleted.length}</span>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-thin">
              {filteredCompleted.map(item => {
                const cfg = queueStatusCfg[item.status] || queueStatusCfg.COMPLETED;
                return (
                  <div key={item.id} className="bg-th-card border border-th rounded-xl p-3 opacity-80 hover:opacity-100 transition-all">
                    <div className="flex items-start justify-between mb-1">
                      <p className="font-semibold text-sm text-th">{item.boat?.name || '—'}</p>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${cfg.bg}`}>{cfg.label}</span>
                    </div>
                    <div className="space-y-0.5 text-xs text-th-muted">
                      <div className="flex items-center gap-1.5"><User className="w-3 h-3" />{item.client?.name || '—'}</div>
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1"><ArrowDown className="w-3 h-3" />{item.startedAt ? fmt(item.startedAt) : '—'}</span>
                        <span className="flex items-center gap-1"><ArrowUp className="w-3 h-3" />{item.completedAt ? fmt(item.completedAt) : '—'}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
              {filteredCompleted.length === 0 && !loading && (
                <div className="flex flex-col items-center justify-center py-12 text-th-muted opacity-60">
                  <CheckCircle2 className="w-10 h-10 mb-2" />
                  <p className="text-xs">Nenhum concluído</p>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* ───── INSPECTIONS DRAWER ───── */}
      {showInspections && (
        <div className="fixed inset-0 z-40 flex">
          <div className="flex-1 bg-black/40" onClick={() => setShowInspections(false)} />
          <div className="w-full max-w-xl bg-th-card shadow-2xl border-l border-th flex flex-col animate-in slide-in-from-right">
            <div className="flex items-center justify-between px-5 py-4 border-b border-th flex-shrink-0">
              <div>
                <h2 className="text-base font-bold text-th flex items-center gap-2"><ClipboardList className="w-5 h-5 text-blue-500" />Inspeções do Dia</h2>
                <p className="text-xs text-th-muted mt-0.5">{new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', timeZone: BRT })}</p>
              </div>
              <button onClick={() => setShowInspections(false)} className="p-1.5 hover:bg-th-bg rounded-lg text-th-muted hover:text-th"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {todayInspections.length === 0 ? (
                <div className="text-center py-16 text-th-muted">
                  <ClipboardList className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Nenhuma inspeção realizada hoje</p>
                </div>
              ) : todayInspections.map(cl => {
                const checked = cl.items?.filter(i => i.checked).length ?? 0;
                const total = cl.items?.length ?? 0;
                const hasReturn = !!cl.returnCompletedAt;
                return (
                  <div key={cl.id} onClick={() => { setShowInspections(false); setInspectionDetail(cl); }}
                    className="bg-th-bg border border-th rounded-2xl p-4 cursor-pointer hover:border-blue-500/50 hover:shadow-md transition-all">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="font-bold text-th">{cl.boat?.name || '—'}</p>
                        <p className="text-xs text-th-muted">{cl.operator?.name} · {cl.createdAt ? fmt(cl.createdAt) : ''}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cl.status === 'APPROVED' ? 'bg-green-500/10 text-green-600' : 'bg-yellow-500/10 text-yellow-600'}`}>
                          {cl.status === 'APPROVED' ? '✓ Aprovado' : 'Pendente'}
                        </span>
                        {hasReturn && <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-blue-500/10 text-blue-600">🔄 Retorno</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mb-2 text-xs text-th-muted">
                      <span>{checked}/{total} itens</span>
                      {cl.hullSketchMarks && <span className="flex items-center gap-1"><PenLine className="w-3 h-3" />Croqui</span>}
                      {cl.fuelPhotoUrl && <span className="flex items-center gap-1"><Camera className="w-3 h-3" />Combustível</span>}
                      {cl.videoUrl && <span className="flex items-center gap-1"><Video className="w-3 h-3" />Vídeo</span>}
                    </div>
                    {(cl.lifeVestsLoaned ?? 0) > 0 && (
                      <div className="mb-2 flex items-center gap-2 px-2 py-1 bg-orange-500/10 rounded-lg">
                        <span className="text-sm">🦺</span>
                        <span className="text-xs font-bold text-orange-600">{cl.lifeVestsLoaned} colete{(cl.lifeVestsLoaned ?? 0) > 1 ? 's' : ''}</span>
                      </div>
                    )}
                    <div className="w-full bg-th-card rounded-full h-1.5 mb-3">
                      <div className={`h-1.5 rounded-full ${cl.status === 'APPROVED' ? 'bg-green-500' : 'bg-yellow-400'}`} style={{ width: `${total ? (checked/total)*100 : 0}%` }} />
                    </div>
                    <div className="flex items-center justify-center gap-1.5 text-xs font-medium text-blue-500">
                      <Eye className="w-3.5 h-3.5" />Ver Inspeção Completa
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ───── MODALS ───── */}
      {detailCL && <CLDetailModal cl={detailCL} onClose={() => setDetailCL(null)} />}
      {showWizard && <ChecklistWizardModal existingChecklist={continueChecklist} preSelectedReservation={wizardReservation} onClose={() => { setShowWizard(false); setContinueChecklist(null); setWizardReservation(null); setPostChecklistQueue(null); }} onSuccess={() => { setShowWizard(false); setContinueChecklist(null); setWizardReservation(null); load(); }} />}
      {!showWizard && postChecklistQueue && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-th-card rounded-2xl w-full max-w-sm shadow-2xl p-6">
            <div className="text-center mb-5">
              <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-3">
                <CheckCircle2 className="w-6 h-6 text-green-500" />
              </div>
              <h3 className="text-base font-bold text-th">Checklist Concluído!</h3>
              <p className="text-xs text-th-muted mt-1">O que deseja fazer com <strong>{postChecklistQueue.boat?.name || 'o jet'}</strong>?</p>
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
                  load();
                }}
                className="w-full py-3 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-xl text-sm font-bold transition-colors flex items-center justify-center gap-2"
              >
                {launchingId === postChecklistQueue.id ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Waves className="w-4 h-4" />}
                Ir para a Água
              </button>
              <button
                onClick={() => { setPostChecklistQueue(null); load(); }}
                className="w-full py-3 border border-th hover:bg-th-bg text-th rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2"
              >
                <Clock className="w-4 h-4" />Aguardando Cliente
              </button>
            </div>
          </div>
        </div>
      )}
      {returnInspectionItem && (
        <ReturnInspectionModal
          item={returnInspectionItem}
          onClose={() => setReturnInspectionItem(null)}
          onConfirm={async (data) => { setReturnInspectionItem(null); await doLiftBoat(returnInspectionItem, data); }}
        />
      )}
      {inspectionDetail && <InspectionFullModal cl={inspectionDetail} onClose={() => setInspectionDetail(null)} />}
    </div>
  );
}

/* ─── Checklist card ─────────────────────────────────────────────────────── */
function CLCard({ cl, onView, onContinue, onDelete }: { cl: ChecklistEntry; onView: (c: ChecklistEntry) => void; onContinue?: (c: ChecklistEntry) => void; onDelete?: (c: ChecklistEntry) => void }) {
  const checked = cl.items?.filter(i => i.checked).length ?? 0;
  const total   = cl.items?.length ?? 0;
  return (
    <div className={`bg-th-card border rounded-2xl p-4 ${cl.status === 'APPROVED' ? 'border-green-500/30' : 'border-yellow-500/30'}`}>
      <div className="flex items-start justify-between mb-2">
        <div><p className="font-semibold text-th">{cl.boat?.name || '—'}</p><p className="text-xs text-th-muted">{cl.operator?.name} · {cl.createdAt ? fmtD(cl.createdAt) : ''}</p></div>
        <span className={`text-xs px-2 py-1 rounded-full font-medium ${cl.status === 'APPROVED' ? 'bg-green-500/10 text-green-600' : 'bg-yellow-500/10 text-yellow-600'}`}>{cl.status === 'APPROVED' ? 'Aprovado' : 'Pendente'}</span>
      </div>
      <div className="flex items-center gap-3 mb-2 text-xs text-th-muted">
        <span>{checked}/{total} itens</span>
        {cl.hullSketchUrl && <span className="flex items-center gap-1"><PenLine className="w-3 h-3" />Croqui</span>}
        {cl.videoUrl && <span className="flex items-center gap-1"><Video className="w-3 h-3" />Vídeo</span>}
      </div>
      {(cl.lifeVestsLoaned ?? 0) > 0 && (
        <div className="mb-2 flex items-center gap-2 px-3 py-1.5 bg-orange-500/10 border border-orange-300 dark:border-orange-500/30 rounded-xl">
          <span className="text-base">🦺</span>
          <span className="text-xs font-bold text-orange-600">{cl.lifeVestsLoaned} colete{(cl.lifeVestsLoaned ?? 0) > 1 ? 's' : ''} emprestado{(cl.lifeVestsLoaned ?? 0) > 1 ? 's' : ''}</span>
        </div>
      )}
      <div className="w-full bg-th-bg rounded-full h-1.5 mb-3"><div className={`h-1.5 rounded-full ${cl.status === 'APPROVED' ? 'bg-green-500' : 'bg-yellow-400'}`} style={{ width: `${total ? (checked/total)*100 : 0}%` }} /></div>
      <div className="flex gap-2">
        <button onClick={() => onView(cl)} className="flex-1 py-1.5 border border-th hover:bg-th-bg rounded-lg text-xs font-medium text-th-muted hover:text-th transition-colors flex items-center justify-center gap-1">
          <Eye className="w-3.5 h-3.5" />Detalhes
        </button>
        {onContinue && cl.status === 'PENDING' && (
          <button onClick={() => onContinue(cl)} className="flex-1 py-1.5 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1">
            <ChevronRight className="w-3.5 h-3.5" />Continuar
          </button>
        )}
        {onDelete && (
          <button onClick={() => onDelete(cl)} className="py-1.5 px-2.5 border border-red-500/30 hover:bg-red-500/10 rounded-lg text-xs font-medium text-red-500 transition-colors flex items-center justify-center">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

/* ─── Checklist detail modal ─────────────────────────────────────────────── */
function CLDetailModal({ cl, onClose }: { cl: ChecklistEntry; onClose: () => void }) {
  const [showSketch, setShowSketch] = useState(false);
  const [showVideo,  setShowVideo]  = useState(false);
  const [showFuel,   setShowFuel]   = useState(false);
  const checked = cl.items?.filter(i => i.checked).length ?? 0;
  const total   = cl.items?.length ?? 0;
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-th-card rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-th">
          <div><h2 className="text-base font-bold text-th">Checklist — {cl.boat?.name}</h2><p className="text-xs text-th-muted">{cl.operator?.name} · {cl.createdAt ? new Date(cl.createdAt).toLocaleDateString('pt-BR', { timeZone: BRT }) : ''}</p></div>
          <button onClick={onClose} className="text-th-muted hover:text-th p-1"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-th-muted">{checked}/{total} itens verificados</span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cl.status === 'APPROVED' ? 'bg-green-500/10 text-green-600' : 'bg-yellow-500/10 text-yellow-600'}`}>{cl.status === 'APPROVED' ? 'Aprovado' : 'Pendente'}</span>
          </div>
          <div className="space-y-1.5">
            {cl.items?.map(item => (
              <div key={item.id} className={`flex items-start gap-3 p-2.5 rounded-lg ${item.checked ? 'bg-green-500/5 border border-green-500/20' : 'bg-red-500/5 border border-red-500/20'}`}>
                <div className={`mt-0.5 w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center ${item.checked ? 'bg-green-500' : 'bg-red-200 dark:bg-red-900'}`}>
                  {item.checked && <CheckCircle2 className="w-3 h-3 text-white" />}
                </div>
                <div><p className="text-sm text-th">{item.label}</p>{item.notes && <p className="text-xs text-th-muted mt-0.5">{item.notes}</p>}</div>
              </div>
            ))}
          </div>
          {(cl.hullSketchMarks || cl.hullSketchUrl) && (
            <div>
              <button onClick={() => setShowSketch(!showSketch)} className="flex items-center justify-between w-full py-2.5 px-3 bg-th-bg rounded-lg text-sm font-medium text-th hover:bg-th-bg/80">
                <span className="flex items-center gap-2"><PenLine className="w-4 h-4 text-blue-500" />Croqui do Casco</span>
                <ChevronDown className={`w-4 h-4 transition-transform ${showSketch ? 'rotate-180' : ''}`} />
              </button>
              {showSketch && (
                <div className="mt-2 space-y-2">
                  {cl.hullSketchMarks ? (
                    <JetSki3DMarkViewer marksJson={cl.hullSketchMarks} height={300} />
                  ) : (
                    <>
                      <div className="rounded-xl overflow-hidden border border-th" style={{ height: 280 }}>
                        <JetSkiViewer3D interactive />
                      </div>
                      {cl.hullSketchUrl && (
                        <div className="rounded-xl overflow-hidden border border-th">
                          <img src={resolveMediaUrl(cl.hullSketchUrl)} alt="Croqui" className="w-full object-contain bg-white" />
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}
          {cl.videoUrl && (
            <div>
              <button onClick={() => setShowVideo(!showVideo)} className="flex items-center justify-between w-full py-2.5 px-3 bg-th-bg rounded-lg text-sm font-medium text-th hover:bg-th-bg/80">
                <span className="flex items-center gap-2"><Video className="w-4 h-4 text-purple-500" />Vídeo de Inspeção</span>
                <ChevronDown className={`w-4 h-4 transition-transform ${showVideo ? 'rotate-180' : ''}`} />
              </button>
              {showVideo && <div className="mt-2 rounded-xl overflow-hidden border border-th bg-black"><video src={resolveMediaUrl(cl.videoUrl)} controls className="w-full max-h-64" /></div>}
            </div>
          )}
          {cl.fuelPhotoUrl && (
            <div>
              <button onClick={() => setShowFuel(!showFuel)} className="flex items-center justify-between w-full py-2.5 px-3 bg-th-bg rounded-lg text-sm font-medium text-th hover:bg-th-bg/80">
                <span className="flex items-center gap-2"><span className="text-base">⛽</span>Foto do Tanque</span>
                <ChevronDown className={`w-4 h-4 transition-transform ${showFuel ? 'rotate-180' : ''}`} />
              </button>
              {showFuel && <div className="mt-2 rounded-xl overflow-hidden border border-th"><img src={resolveMediaUrl(cl.fuelPhotoUrl)} alt="Tanque de Combustível" className="w-full object-contain max-h-72" /></div>}
            </div>
          )}
          {(cl.lifeVestsLoaned ?? 0) > 0 && (
            <div className="p-3 bg-orange-500/10 border-2 border-orange-400 dark:border-orange-500/50 rounded-xl flex items-center gap-3">
              <span className="text-2xl">🦺</span>
              <div>
                <p className="text-xs font-bold text-orange-600 dark:text-orange-400">Coletes emprestados pela marina</p>
                <p className="text-xl font-black text-orange-500">{cl.lifeVestsLoaned} colete{(cl.lifeVestsLoaned ?? 0) > 1 ? 's' : ''}</p>
              </div>
            </div>
          )}
          {cl.additionalObservations && (
            <div className="p-3 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-xl">
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-1">Observações Adicionais</p>
              <p className="text-sm text-amber-800 dark:text-amber-300">{cl.additionalObservations}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Checklist Wizard Modal ─────────────────────────────────────────────── */
type WizardStep = 'pick' | 'cotista' | 'items' | 'sketch' | 'fuel' | 'video' | 'confirm' | 'success';

function ChecklistWizardModal({ existingChecklist, preSelectedReservation, onClose, onSuccess }: { existingChecklist?: ChecklistEntry | null; preSelectedReservation?: TodayRes | null; onClose: () => void; onSuccess: () => void }) {
  const [step, setStep]             = useState<WizardStep>(existingChecklist ? 'items' : (preSelectedReservation ? 'cotista' : 'pick'));
  const [todayRes, setTodayRes]     = useState<TodayRes[]>([]);
  const [allBoats, setAllBoats]     = useState<Boat[]>([]);
  const [loadingPick, setLoadingPick] = useState(true);
  const [pickMode, setPickMode]     = useState<'today' | 'adhoc'>('today');
  const [selectedBoatId, setSelectedBoatId] = useState('');
  const [selectedResId, setSelectedResId]   = useState<string | undefined>();
  const [selectedBoatName, setSelectedBoatName] = useState(existingChecklist?.boat?.name || '');
  // Cotista selection
  interface ShareEntry { id: string; shareNumber: number; sharePercentage: number; user: { id: string; name: string; email: string; phone?: string } }
  const [shareholders, setShareholders] = useState<ShareEntry[]>([]);
  const [selectedCotistaId, setSelectedCotistaId] = useState<string | null>(null);
  const [pendingReservation, setPendingReservation] = useState<TodayRes | null>(null);
  const [checklistId, setChecklistId] = useState<string | null>(existingChecklist?.id || null);
  const [itemsData, setItemsData]   = useState<{ id: string; label: string; checked: boolean }[]>(
    existingChecklist?.items?.map(i => ({ id: i.id, label: i.label, checked: i.checked })) || []
  );
  const [observations, setObservations] = useState(existingChecklist?.additionalObservations || '');
  const [lifeVestsLoaned, setLifeVestsLoaned] = useState(existingChecklist?.lifeVestsLoaned || 0);
  const [videoFile, setVideoFile]   = useState<File | null>(null);
  const [fuelPhotoFile, setFuelPhotoFile] = useState<File | null>(null);
  const [sketchUrl, setSketchUrl]   = useState<string | undefined>();
  const [sketchMarks, setSketchMarks] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState('');
  const [overdueCharges, setOverdueCharges] = useState<{ description: string; amount: number; dueDate: string; userName?: string }[]>([]);
  const sketchRef = useRef<JetSki3DSketchRef>(null);

  async function fetchOverdueCharges(boatId: string, userId?: string | null) {
    try {
      const params: Record<string, string> = { status: 'OVERDUE', boatId };
      if (userId) params.userId = userId;
      const res = await getCharges(params);
      const charges = res.data?.data || res.data || [];
      if (Array.isArray(charges)) setOverdueCharges(charges.map((c: any) => ({ description: c.description, amount: c.amount, dueDate: c.dueDate, userName: c.user?.name })));
    } catch { /* ignore */ }
  }

  useEffect(() => {
    Promise.all([
      getTodayReservations().catch(() => ({ data: [] })),
      getBoats().catch(() => ({ data: [] })),
    ]).then(([tRes, bRes]) => {
      const t = tRes.data; setTodayRes(Array.isArray(t) ? t : t?.data || []);
      const b = bRes.data; setAllBoats(Array.isArray(b) ? b : b?.data || []);
    }).finally(() => setLoadingPick(false));
  }, []);

  // Auto-select reservation if pre-selected (from "Realizar Check-in" button)
  useEffect(() => {
    if (preSelectedReservation && preSelectedReservation.boat?.id) {
      setPendingReservation(preSelectedReservation);
      setSelectedBoatName(preSelectedReservation.boat?.name || '');
      setSelectedBoatId(preSelectedReservation.boat?.id || '');
      getSharesByBoat(preSelectedReservation.boat.id).then(res => {
        const shares = res.data?.data || res.data || [];
        setShareholders(Array.isArray(shares) ? shares : []);
        // Auto-select the reservation user as cotista if they are a shareholder
        const userId = preSelectedReservation.user?.id;
        if (userId && Array.isArray(shares) && shares.some((s: any) => s.userId === userId || s.user?.id === userId)) {
          setSelectedCotistaId(userId);
        }
      }).catch(() => setShareholders([]));
    }
  }, [preSelectedReservation]);

  async function handlePickReservation(r: TodayRes) {
    setError('');
    // Load shareholders for this boat, then go to cotista selection
    setPendingReservation(r);
    setSelectedBoatName(r.boat?.name || '');
    setSelectedBoatId(r.boat?.id || '');
    try {
      const res = await getSharesByBoat(r.boat!.id);
      const shares = res.data?.data || res.data || [];
      setShareholders(Array.isArray(shares) ? shares : []);
    } catch { setShareholders([]); }
    setSelectedCotistaId(null);
    setStep('cotista');
  }

  async function handlePickBoatAdhoc() {
    if (!selectedBoatId) return;
    setError('');
    setPendingReservation(null);
    try {
      const res = await getSharesByBoat(selectedBoatId);
      const shares = res.data?.data || res.data || [];
      setShareholders(Array.isArray(shares) ? shares : []);
    } catch { setShareholders([]); }
    setSelectedCotistaId(null);
    setStep('cotista');
  }

  async function handleConfirmCotista() {
    setError('');
    try {
      let boatIdToUse = selectedBoatId;
      let reservationId: string | undefined;
      if (pendingReservation) {
        boatIdToUse = pendingReservation.boat!.id;
        reservationId = pendingReservation.id;
      }
      const res = await startAdHocPreLaunch(boatIdToUse, reservationId);
      const cl = res.data;
      setChecklistId(cl.id);
      setItemsData(cl.items?.map((i: { id: string; label: string; checked: boolean }) => ({ id: i.id, label: i.label, checked: i.checked })) || PRE_LAUNCH_ITEMS.map((label, idx) => ({ id: String(idx), label, checked: false })));
      if (!selectedBoatName && pendingReservation?.boat?.name) setSelectedBoatName(pendingReservation.boat.name);
      fetchOverdueCharges(boatIdToUse, selectedCotistaId);
      setStep('items');
    } catch (e: unknown) {
      setError((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Erro ao iniciar checklist');
    }
  }

  function captureAndGoVideo() {
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
      if (videoFile) {
        videoUrl = await new Promise<string>(resolve => { const r = new FileReader(); r.onload = e => resolve(e.target?.result as string); r.readAsDataURL(videoFile); });
      }
      if (fuelPhotoFile) {
        fuelPhotoUrl = await new Promise<string>(resolve => { const r = new FileReader(); r.onload = e => resolve(e.target?.result as string); r.readAsDataURL(fuelPhotoFile); });
      }
      await submitPreLaunch(checklistId, { items: itemsData, hullSketchUrl, hullSketchMarks: sketchMarks, videoUrl, fuelPhotoUrl, additionalObservations: observations || undefined, lifeVestsLoaned });
      setStep('success');
    } catch (e: unknown) {
      setError((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Erro ao enviar checklist');
    } finally { setSubmitting(false); }
  }

  const allChecked = itemsData.every(i => i.checked);
  const wizSteps: WizardStep[] = ['cotista', 'items', 'sketch', 'fuel', 'video', 'confirm'];
  const stepIdx = wizSteps.indexOf(step);

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-th-card rounded-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto shadow-2xl flex flex-col">
        {/* Modal header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-th flex-shrink-0">
          <div className="flex items-center gap-3">
            <ClipboardCheck className="w-5 h-5 text-orange-500" />
            <div>
              <h2 className="font-bold text-th">Realizar Checklist Pré-Saída</h2>
              {selectedBoatName && <p className="text-xs text-th-muted">{selectedBoatName}</p>}
            </div>
          </div>
          <button onClick={onClose} className="text-th-muted hover:text-th p-1"><X className="w-5 h-5" /></button>
        </div>

        {/* Progress (only during wizard steps) */}
        {step !== 'pick' && step !== 'success' && (
          <div className="px-6 pt-4 flex-shrink-0">
            <div className="flex gap-1.5 mb-1">
              {wizSteps.map((s, i) => (
                <div key={s} className={`flex-1 h-1.5 rounded-full transition-all ${i <= stepIdx ? 'bg-orange-500' : 'bg-th-bg'}`} />
              ))}
            </div>
            <div className="flex justify-between text-xs text-th-muted">
              {['Cotista','Itens','Croqui','Combustível','Vídeo','Confirmar'].map((l, i) => (
                <span key={l} className={i <= stepIdx ? 'text-orange-500 font-medium' : ''}>{l}</span>
              ))}
            </div>
          </div>
        )}

        {error && <div className="mx-6 mt-3 flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-500"><AlertCircle className="w-4 h-4 flex-shrink-0" />{error}</div>}

        <div className="p-6 flex-1 overflow-y-auto space-y-4">
          {/* STEP: PICK */}
          {step === 'pick' && (
            <div className="space-y-4">
              <div className="flex gap-2">
                <button onClick={() => setPickMode('today')} className={`flex-1 py-2.5 rounded-xl text-sm font-medium border-2 transition-all ${pickMode === 'today' ? 'border-orange-400 bg-orange-500/10 text-orange-600' : 'border-th text-th-muted hover:border-th/60'}`}>
                  Agendadas Hoje
                </button>
                <button onClick={() => setPickMode('adhoc')} className={`flex-1 py-2.5 rounded-xl text-sm font-medium border-2 transition-all ${pickMode === 'adhoc' ? 'border-orange-400 bg-orange-500/10 text-orange-600' : 'border-th text-th-muted hover:border-th/60'}`}>
                  Sem Agendamento
                </button>
              </div>

              {pickMode === 'today' && (
                loadingPick ? (
                  <div className="flex items-center justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-orange-500" /></div>
                ) : todayRes.length === 0 ? (
                  <div className="text-center py-10 text-th-muted"><Clock className="w-10 h-10 mx-auto mb-2 opacity-30" /><p className="text-sm">Nenhuma reserva para hoje</p><p className="text-xs mt-1">Use "Sem Agendamento" para criar checklist avulso</p></div>
                ) : (
                  <div className="space-y-2">
                    {todayRes.map(r => (
                      <button key={r.id} onClick={() => handlePickReservation(r)}
                        className="w-full text-left bg-th-bg hover:bg-th-bg/80 border border-th hover:border-orange-400 rounded-xl p-4 flex items-center gap-4 transition-all">
                        <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center flex-shrink-0"><Ship className="w-5 h-5 text-orange-500" /></div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-th text-sm">{r.boat?.name || '—'}</p>
                          <p className="text-xs text-th-muted">{r.boat?.model} · Cliente: {r.user?.name || '—'}</p>
                          <p className="text-xs text-orange-500 mt-0.5">{fmt(r.startDate)} → {fmt(r.endDate)}</p>
                        </div>
                        {r.checklist ? (
                          <span className={`text-xs px-2 py-1 rounded-full flex-shrink-0 ${r.checklist.status === 'APPROVED' ? 'bg-green-500/10 text-green-600' : 'bg-yellow-500/10 text-yellow-600'}`}>
                            {r.checklist.status === 'APPROVED' ? '✓ Feito' : 'Pendente'}
                          </span>
                        ) : <ChevronRight className="w-4 h-4 text-th-muted flex-shrink-0" />}
                      </button>
                    ))}
                  </div>
                )
              )}

              {pickMode === 'adhoc' && (
                <div className="space-y-3">
                  <label className="block">
                    <span className="text-sm text-th-muted mb-1.5 block">Selecione a embarcação</span>
                    <select value={selectedBoatId} onChange={e => setSelectedBoatId(e.target.value)}
                      className="w-full px-3 py-2.5 bg-th-bg border border-th rounded-xl text-th focus:outline-none focus:border-orange-400 text-sm">
                      <option value="">— Escolha uma embarcação —</option>
                      {allBoats.map(b => <option key={b.id} value={b.id}>{b.name} {b.model ? `(${b.model})` : ''}</option>)}
                    </select>
                  </label>
                  <button onClick={handlePickBoatAdhoc} disabled={!selectedBoatId}
                    className="w-full py-3 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-colors">
                    <ClipboardCheck className="w-4 h-4" />Iniciar Checklist
                  </button>
                </div>
              )}
            </div>
          )}

          {/* STEP: COTISTA */}
          {step === 'cotista' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-th">Selecionar Cotista</h3>
                <p className="text-xs text-th-muted mt-1">Embarcação: <strong>{selectedBoatName}</strong></p>
              </div>
              {shareholders.length === 0 ? (
                <div className="text-center py-6 text-th-muted">
                  <User className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Nenhum cotista cadastrado para esta embarcação</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {shareholders.map(s => (
                    <button key={s.id} onClick={() => setSelectedCotistaId(selectedCotistaId === s.user.id ? null : s.user.id)}
                      className={`w-full text-left rounded-xl p-3.5 border-2 flex items-center gap-3 transition-all ${selectedCotistaId === s.user.id ? 'border-orange-400 bg-orange-500/10' : 'border-th bg-th-bg hover:border-orange-300'}`}>
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${selectedCotistaId === s.user.id ? 'bg-orange-500 text-white' : 'bg-th-card text-th-muted'}`}>
                        {s.user.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-th text-sm truncate">{s.user.name}</p>
                        <p className="text-xs text-th-muted">{s.user.email}{s.user.phone ? ` · ${s.user.phone}` : ''}</p>
                        <p className="text-xs text-orange-500 mt-0.5">Cota #{s.shareNumber} · {s.sharePercentage}%</p>
                      </div>
                      {selectedCotistaId === s.user.id && <CheckCircle2 className="w-5 h-5 text-orange-500 flex-shrink-0" />}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex gap-2 pt-1">
                <button onClick={() => setStep('pick')} className="flex items-center gap-2 px-4 py-2.5 border border-th text-th-muted rounded-xl text-sm hover:bg-th-bg transition-colors">
                  <ChevronLeft className="w-4 h-4" />Voltar
                </button>
                <button onClick={handleConfirmCotista}
                  className="flex-1 py-2.5 bg-orange-500 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-colors hover:bg-orange-600">
                  {selectedCotistaId
                    ? <><CheckCircle2 className="w-4 h-4" />Confirmar Cotista</>
                    : <>Continuar sem cotista <ChevronRight className="w-4 h-4" /></>
                  }
                </button>
              </div>
            </div>
          )}

          {/* STEP: ITEMS */}
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
                      <span className="font-bold text-red-500 whitespace-nowrap">R$ {Number(ch.amount).toFixed(2)} (venc. {new Date(ch.dueDate).toLocaleDateString('pt-BR', { timeZone: BRT })})</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm text-th-muted">Marque todos os itens verificados para continuar</p>
                <button onClick={() => setItemsData(p => p.map(x => ({ ...x, checked: true })))}
                  className="text-xs font-medium text-orange-500 hover:text-orange-600 px-2 py-1 rounded-lg hover:bg-orange-500/10 transition-colors">
                  Selecionar tudo
                </button>
              </div>
              {itemsData.map((item, i) => (
                <button key={item.id} onClick={() => setItemsData(p => p.map((x, j) => j === i ? { ...x, checked: !x.checked } : x))}
                  className={`w-full flex items-center gap-3 p-3.5 rounded-xl border-2 text-left transition-all ${item.checked ? 'border-green-400 bg-green-500/5' : 'border-th bg-th-bg hover:border-orange-300'}`}>
                  <div className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center border-2 transition-all ${item.checked ? 'bg-green-500 border-green-500' : 'border-gray-300 dark:border-gray-600'}`}>
                    {item.checked && <CheckCircle2 className="w-4 h-4 text-white" />}
                  </div>
                  <span className={`text-sm ${item.checked ? 'text-green-700 dark:text-green-400 font-medium' : 'text-th'}`}>{item.label}</span>
                </button>
              ))}
              {/* Life vest loan */}
              <div className="pt-2 p-3 bg-orange-500/5 border border-orange-200 dark:border-orange-500/20 rounded-xl">
                <p className="text-xs font-semibold text-orange-700 dark:text-orange-400 mb-2">🦺 Coletes emprestados pela marina</p>
                <div className="flex items-center gap-3">
                  <button onClick={() => setLifeVestsLoaned(v => Math.max(0, v - 1))} className="w-8 h-8 rounded-full border border-th flex items-center justify-center text-th-muted hover:bg-th-bg font-bold">−</button>
                  <span className="text-2xl font-black text-orange-500 w-12 text-center">{lifeVestsLoaned}</span>
                  <button onClick={() => setLifeVestsLoaned(v => v + 1)} className="w-8 h-8 rounded-full border border-th flex items-center justify-center text-th-muted hover:bg-th-bg font-bold">+</button>
                  <span className="text-xs text-th-muted ml-1">{lifeVestsLoaned === 0 ? 'Nenhum emprestado' : `${lifeVestsLoaned} colete${lifeVestsLoaned > 1 ? 's' : ''} emprestado${lifeVestsLoaned > 1 ? 's' : ''}`}</span>
                </div>
              </div>
              <div className="pt-2">
                <p className="text-xs text-th-muted mb-1.5">Observações adicionais (opcional)</p>
                <textarea value={observations} onChange={e => setObservations(e.target.value)} rows={3}
                  placeholder="Descreva qualquer problema ou observação..."
                  className="w-full px-3 py-2.5 text-sm bg-th-bg border border-th rounded-xl resize-none focus:outline-none focus:border-orange-400 text-th" />
              </div>
              <button onClick={() => setStep('sketch')} disabled={!allChecked}
                className="w-full py-3 bg-orange-500 disabled:bg-th-muted/30 disabled:text-th-muted text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-colors">
                Próximo: Croqui do Casco <ChevronRight className="w-4 h-4" />
              </button>
              {!allChecked && <p className="text-xs text-center text-th-muted">Marque todos os {itemsData.length} itens para continuar</p>}
            </div>
          )}

          {/* STEP: SKETCH */}
          {step === 'sketch' && (
            <div className="space-y-3">
              <JetSki3DSketch ref={sketchRef} />
              <div className="flex gap-2">
                <button onClick={() => setStep('items')} className="flex items-center gap-2 px-4 py-2.5 border border-th text-th-muted rounded-xl text-sm hover:bg-th-bg transition-colors"><ChevronLeft className="w-4 h-4" />Voltar</button>
                <button onClick={captureAndGoVideo} className="flex-1 py-2.5 bg-orange-500 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2">
                  Próximo: Vídeo <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP: VIDEO */}
          {step === 'fuel' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-th">Foto do Tanque de Combustível</h3>
                <p className="text-xs text-th-muted mt-1">Tire uma foto do medidor de combustível ou abra a câmera do dispositivo</p>
              </div>
              {!fuelPhotoFile ? (
                <label className="flex flex-col items-center justify-center gap-3 p-10 border-2 border-dashed border-th rounded-2xl cursor-pointer hover:border-orange-400 transition-colors">
                  <span className="text-5xl">⛽</span>
                  <div className="text-center">
                    <p className="text-sm font-medium text-th">Abrir câmera ou selecionar foto</p>
                    <p className="text-xs text-th-muted mt-1">JPG, PNG, HEIC · Foto do nível do tanque</p>
                  </div>
                  <input type="file" accept="image/*" capture="environment" className="hidden" onChange={e => setFuelPhotoFile(e.target.files?.[0] || null)} />
                </label>
              ) : (
                <div className="space-y-3">
                  <div className="rounded-xl overflow-hidden border border-th">
                    <img src={URL.createObjectURL(fuelPhotoFile)} alt="Tanque" className="w-full object-contain max-h-56" />
                  </div>
                  <div className="bg-th-bg border border-th rounded-xl p-3 flex items-center gap-3">
                    <span className="text-xl">⛽</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-th truncate">{fuelPhotoFile.name}</p>
                      <p className="text-xs text-th-muted">{(fuelPhotoFile.size/1024/1024).toFixed(1)} MB</p>
                    </div>
                    <button onClick={() => setFuelPhotoFile(null)} className="p-1.5 hover:bg-th-card rounded-lg text-th-muted"><X className="w-4 h-4" /></button>
                  </div>
                </div>
              )}
              <div className="flex gap-2">
                <button onClick={() => setStep('sketch')} className="flex items-center gap-2 px-4 py-2.5 border border-th text-th-muted rounded-xl text-sm hover:bg-th-bg transition-colors"><ChevronLeft className="w-4 h-4" />Voltar</button>
                <button onClick={() => setStep('video')} disabled={!fuelPhotoFile}
                  className="flex-1 py-2.5 bg-orange-500 disabled:bg-th-muted/30 disabled:text-th-muted text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-colors">
                  Próximo: Vídeo <ChevronRight className="w-4 h-4" />
                </button>
              </div>
              <button onClick={() => setStep('video')} className="w-full text-center text-xs text-th-muted hover:text-th underline underline-offset-2">
                Pular foto do tanque
              </button>
            </div>
          )}

          {/* STEP: VIDEO */}
          {step === 'video' && (
            <div className="space-y-4">
              <p className="text-xs text-th-muted">Opcional — grave ou selecione um vídeo da embarcação</p>
              {!videoFile ? (
                <label className="flex flex-col items-center justify-center gap-3 p-10 border-2 border-dashed border-th rounded-2xl cursor-pointer hover:border-orange-400 transition-colors">
                  <Video className="w-10 h-10 text-th-muted opacity-40" />
                  <div className="text-center"><p className="text-sm font-medium text-th">Selecionar ou gravar vídeo</p><p className="text-xs text-th-muted mt-1">MP4, MOV · máx. 100MB</p></div>
                  <input type="file" accept="video/*" capture="environment" className="hidden" onChange={e => setVideoFile(e.target.files?.[0] || null)} />
                </label>
              ) : (
                <div className="bg-th-bg border border-th rounded-2xl p-4 flex items-center gap-3">
                  <Video className="w-8 h-8 text-orange-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0"><p className="text-sm font-semibold text-th truncate">{videoFile.name}</p><p className="text-xs text-th-muted">{(videoFile.size/1024/1024).toFixed(1)} MB</p></div>
                  <button onClick={() => setVideoFile(null)} className="p-1.5 hover:bg-th-card rounded-lg text-th-muted"><X className="w-4 h-4" /></button>
                </div>
              )}
              <div className="flex gap-2">
                <button onClick={() => setStep('fuel')} className="flex items-center gap-2 px-4 py-2.5 border border-th text-th-muted rounded-xl text-sm hover:bg-th-bg transition-colors"><ChevronLeft className="w-4 h-4" />Voltar</button>
                <button onClick={() => setStep('confirm')} className="flex-1 py-2.5 bg-orange-500 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2">
                  {videoFile ? 'Próximo: Confirmar' : 'Pular · Confirmar'} <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP: CONFIRM */}
          {step === 'confirm' && (
            <div className="space-y-4">
              <div className="bg-th-bg border border-th rounded-2xl divide-y divide-th">
                {[
                  ['Embarcação', selectedBoatName],
                  ['Itens verificados', `${itemsData.filter(i => i.checked).length}/${itemsData.length} ✓`],
                  ['Croqui do casco', 'Incluído'],
                  ['⛽ Tanque', fuelPhotoFile ? fuelPhotoFile.name : 'Não incluído'],
                  ['Vídeo', videoFile ? videoFile.name : 'Não incluído'],
                  ...(lifeVestsLoaned > 0 ? [['🦺 Coletes emprestados', `${lifeVestsLoaned} colete${lifeVestsLoaned > 1 ? 's' : ''}`]] : []),
                ].map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between px-4 py-3">
                    <span className="text-sm text-th-muted">{k}</span>
                    <span className={`text-sm font-semibold ${k === 'Itens verificados' ? 'text-green-600' : 'text-th'}`}>{v}</span>
                  </div>
                ))}
                {observations && (
                  <div className="px-4 py-3"><p className="text-xs text-th-muted mb-1">Observações</p><p className="text-sm text-th">{observations}</p></div>
                )}
              </div>
              <div className="p-3 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-xl">
                <p className="text-xs text-amber-700 dark:text-amber-400 font-medium">⚠️ Ao enviar, a reserva (se houver) será marcada como <strong>Em Uso</strong>.</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setStep('video')} className="flex items-center gap-2 px-4 py-2.5 border border-th text-th-muted rounded-xl text-sm hover:bg-th-bg transition-colors"><ChevronLeft className="w-4 h-4" />Voltar</button>
                <button onClick={handleSubmit} disabled={submitting} className="flex-1 py-3 bg-orange-500 disabled:bg-orange-400/60 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2">
                  {submitting ? <><Loader2 className="w-4 h-4 animate-spin" />Enviando...</> : <><CheckCircle2 className="w-4 h-4" />Enviar Checklist</>}
                </button>
              </div>
            </div>
          )}

          {/* STEP: SUCCESS */}
          {step === 'success' && (
            <div className="flex flex-col items-center justify-center py-8 gap-4 text-center">
              <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-500/20 flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-green-500" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-th">Checklist Enviado!</h3>
                <p className="text-sm text-th-muted mt-1">Checklist de <strong>{selectedBoatName}</strong> concluído com sucesso.</p>
              </div>
              <button onClick={onSuccess} className="mt-2 px-6 py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-bold text-sm transition-colors">
                Feito
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   RETURN INSPECTION MODAL — shown before lifting boat
═══════════════════════════════════════════════════════════════════════════ */
const RETURN_ITEMS = [
  'Âncora e cabo devolvidos',
  'Documentação conferida',
  'Equipamentos em ordem',
];

function ReturnInspectionModal({ item, onClose, onConfirm }: {
  item: QueueItem;
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

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-th-card rounded-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-th flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center"><ArrowUp className="w-5 h-5 text-blue-500" /></div>
            <div>
              <h2 className="text-lg font-bold text-th">Inspeção de Retorno</h2>
              <p className="text-xs text-th-muted">{item.boat?.name} — {item.client?.name || 'Cliente'}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-th-muted hover:text-th"><X className="w-5 h-5" /></button>
        </div>

        {/* Progress bar */}
        <div className="px-6 pt-3">
          <div className="flex gap-1 mb-1">{steps.map((_, i) => <div key={i} className={`flex-1 h-1 rounded-full ${i <= stepIdx ? 'bg-blue-500' : 'bg-gray-200 dark:bg-gray-700'}`} />)}</div>
          <div className="flex justify-between text-[10px] text-th-muted">{labels.map((l, i) => <span key={l} className={i === stepIdx ? 'text-blue-500 font-semibold' : ''}>{l}</span>)}</div>
        </div>

        {/* Life vest warning */}
        {lifeVests > 0 && (
          <div className="mx-6 mt-3 p-3 bg-amber-50 dark:bg-amber-500/10 border-2 border-amber-400 dark:border-amber-500/50 rounded-xl flex items-center gap-3 animate-pulse">
            <span className="text-3xl">🦺</span>
            <div>
              <p className="text-sm font-bold text-amber-700 dark:text-amber-400">ATENÇÃO: {lifeVests} colete{lifeVests > 1 ? 's' : ''} emprestado{lifeVests > 1 ? 's' : ''}</p>
              <p className="text-xs text-amber-600 dark:text-amber-400/80">Verifique se todos os coletes foram devolvidos antes de subir o jet.</p>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="p-6 flex-1 min-h-0">
          {loadingCL ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>
          ) : step === 'items' ? (
            <div className="space-y-4">
              {/* Return verification items */}
              <div>
                <p className="text-sm font-semibold text-th mb-2">✅ Verificação de Retorno</p>
                {checks.map((c, i) => (
                  <label key={i} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition mb-2 ${c.checked ? 'border-green-500 bg-green-50 dark:bg-green-500/10' : 'border-th hover:bg-th-bg'}`}>
                    <input type="checkbox" checked={c.checked} onChange={() => setChecks(prev => prev.map((x, j) => j === i ? { ...x, checked: !x.checked } : x))}
                      className="w-5 h-5 rounded border-gray-300 text-green-500 focus:ring-green-500" />
                    <span className="text-sm text-th">{c.label}</span>
                  </label>
                ))}
              </div>

              <div>
                <label className="text-sm text-th-muted mb-1 block">Observações</label>
                <textarea value={observations} onChange={e => setObservations(e.target.value)}
                  className="w-full p-3 border border-th rounded-xl text-sm bg-th focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                  rows={2} placeholder="Observações sobre o retorno..." />
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={onClose} className="flex-1 py-2.5 border border-th text-th rounded-xl font-medium text-sm hover:bg-th-bg">Cancelar</button>
                <button onClick={() => setStep('sketch')} className="flex-[2] py-2.5 bg-blue-500 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2">
                  Próximo: Verificar Avarias <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : step === 'sketch' ? (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-th">Inspeção do Casco — Novas Avarias</p>
              <p className="text-xs text-th-muted">Marcas <span className="text-red-500 font-bold">vermelhas</span> = avarias da saída. Novas avarias serão marcadas em <span className="font-bold" style={{color:'#39ff14'}}>verde neon</span>.</p>
              <JetSki3DSketch ref={sketchRef} initialMarks={launchMarks ? (JSON.parse(launchMarks) as InitialMark[]) : undefined} markColor="#39ff14" />
              <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-500/30 rounded-xl">
                <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-2">🎥 Vídeo da avaria (opcional)</p>
                <input type="file" accept="video/*" capture="environment" onChange={handleDamageVideo}
                  className="block w-full text-sm text-th-muted file:mr-4 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-amber-500 file:text-white file:font-medium file:cursor-pointer file:text-xs" />
                {damageVideoPreview && (
                  <video src={damageVideoPreview} controls className="mt-2 w-full max-h-40 rounded-lg" />
                )}
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={() => setStep('items')} className="flex items-center gap-2 px-4 py-2.5 border border-th text-th-muted rounded-xl text-sm hover:bg-th-bg"><ChevronLeft className="w-4 h-4" />Voltar</button>
                <button onClick={captureSketch} className="flex-1 py-2.5 bg-blue-500 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2">
                  Próximo: Combustível <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : step === 'fuel' ? (
            <div className="space-y-4">
              <p className="text-sm font-semibold text-th">📸 Foto do Tanque de Combustível</p>
              <p className="text-xs text-th-muted">Tire uma foto do medidor de combustível para registro de retorno.</p>
              <div className="border-2 border-dashed border-th rounded-xl p-4">
                <input type="file" accept="image/*" capture="environment" onChange={handleFuelPhoto}
                  className="block w-full text-sm text-th-muted file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:bg-blue-500 file:text-white file:font-medium file:cursor-pointer" />
                {fuelPreview && (
                  <div className="mt-3">
                    <img src={fuelPreview} alt="Tanque" className="w-full max-h-48 object-contain rounded-xl" />
                  </div>
                )}
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={() => setStep('sketch')} className="flex items-center gap-2 px-4 py-2.5 border border-th text-th-muted rounded-xl text-sm hover:bg-th-bg"><ChevronLeft className="w-4 h-4" />Voltar</button>
                <button onClick={() => setStep('confirm')} className="flex-1 py-2.5 bg-blue-500 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2">
                  Próximo: Confirmar <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm font-semibold text-th">Resumo da Inspeção de Retorno</p>
              <div className="bg-th-bg rounded-xl p-4 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-th-muted">Embarcação</span><span className="text-th font-medium">{item.boat?.name}</span></div>
                <div className="flex justify-between"><span className="text-th-muted">Itens verificados</span><span className="text-th font-medium">{checks.filter(c=>c.checked).length}/{checks.length} ✓</span></div>
                <div className="flex justify-between"><span className="text-th-muted">Novas avarias</span><span className="text-th font-medium">{sketchMarks ? 'Sim — marcadas no croqui' : 'Nenhuma'}</span></div>
                <div className="flex justify-between"><span className="text-th-muted">Vídeo de avaria</span><span className="text-th font-medium">{damageVideoFile ? '✓ Registrado' : 'Não gravado'}</span></div>
                <div className="flex justify-between"><span className="text-th-muted">Foto combustível</span><span className="text-th font-medium">{fuelPhotoFile ? '✓ Registrada' : 'Não tirada'}</span></div>
                {lifeVests > 0 && <div className="flex justify-between text-amber-600 dark:text-amber-400 font-bold"><span>🦺 Coletes emprestados</span><span>{lifeVests}</span></div>}
                {observations && <div><span className="text-th-muted">Observações:</span><p className="text-th mt-1">{observations}</p></div>}
              </div>
              {fuelPreview && <img src={fuelPreview} alt="Tanque" className="w-full max-h-32 object-contain rounded-xl border border-th" />}
              <div className="flex gap-2 pt-2">
                <button onClick={() => setStep('fuel')} className="flex items-center gap-2 px-4 py-2.5 border border-th text-th-muted rounded-xl text-sm hover:bg-th-bg"><ChevronLeft className="w-4 h-4" />Voltar</button>
                <button onClick={handleSubmit} disabled={submitting}
                  className="flex-[2] py-2.5 bg-green-500 hover:bg-green-600 disabled:bg-gray-400 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-colors">
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

/* ═══════════════════════════════════════════════════════════════════════════
   INSPECTION FULL MODAL — checklist + return inspection + PDF export
═══════════════════════════════════════════════════════════════════════════ */
function InspectionFullModal({ cl, onClose }: { cl: ChecklistEntry; onClose: () => void }) {
  const printRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);
  const [showSketch, setShowSketch]   = useState(false);
  const [showReturn, setShowReturn]   = useState(!!cl.returnCompletedAt);

  const checked = cl.items?.filter(i => i.checked).length ?? 0;
  const total   = cl.items?.length ?? 0;
  const hasReturn = !!cl.returnCompletedAt;

  const fmtFull = (s?: string) => s ? new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: BRT }) : '—';

  const handleExportPDF = async () => {
    if (!printRef.current) return;
    setExporting(true);
    // Expand all sections for PDF
    setShowSketch(true);
    setShowReturn(true);
    // Wait for render
    await new Promise(r => setTimeout(r, 500));
    try {
      const html2canvas = (await import('html2canvas')).default;
      const { jsPDF } = await import('jspdf');
      const el = printRef.current;
      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
      });
      const imgData = canvas.toDataURL('image/jpeg', 0.85);
      const pdfW = 210; // A4 mm width
      const pdfH = (canvas.height * pdfW) / canvas.width;
      const pdf = new jsPDF({ orientation: pdfH > 297 ? 'p' : 'p', unit: 'mm', format: 'a4' });
      // If content is taller than one page, we need multiple pages
      const pageH = 297; // A4 page height
      if (pdfH <= pageH) {
        pdf.addImage(imgData, 'JPEG', 0, 0, pdfW, pdfH);
      } else {
        let yOff = 0;
        let page = 0;
        while (yOff < canvas.height) {
          if (page > 0) pdf.addPage();
          const sliceH = Math.min(canvas.height - yOff, (pageH / pdfW) * canvas.width);
          const sliceCanvas = document.createElement('canvas');
          sliceCanvas.width = canvas.width;
          sliceCanvas.height = sliceH;
          const ctx = sliceCanvas.getContext('2d')!;
          ctx.drawImage(canvas, 0, yOff, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
          const sliceImg = sliceCanvas.toDataURL('image/jpeg', 0.85);
          const slicePdfH = (sliceH * pdfW) / canvas.width;
          pdf.addImage(sliceImg, 'JPEG', 0, 0, pdfW, slicePdfH);
          yOff += sliceH;
          page++;
        }
      }
      const boatName = cl.boat?.name?.replace(/\s+/g, '_') || 'embarcacao';
      const dateStr = cl.createdAt ? new Date(cl.createdAt).toLocaleDateString('en-CA', { timeZone: BRT }) : 'sem_data';
      pdf.save(`inspecao_${boatName}_${dateStr}.pdf`);
    } catch (err) {
      console.error('PDF export error:', err);
      alert('Erro ao gerar PDF. Tente novamente.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-3xl max-h-[95vh] overflow-y-auto shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0 sticky top-0 bg-white dark:bg-gray-900 z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <ClipboardList className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Inspeção Completa</h2>
              <p className="text-xs text-gray-500">{cl.boat?.name} · {fmtFull(cl.createdAt)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleExportPDF} disabled={exporting}
              className="flex items-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 disabled:bg-gray-400 text-white rounded-lg text-sm font-bold transition-colors">
              {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
              {exporting ? 'Gerando...' : 'Exportar PDF'}
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-white p-1">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable content */}
        <div ref={printRef} className="bg-white text-gray-900" style={{ padding: 24 }}>
          {/* PDF Header */}
          <div style={{ marginBottom: 20, borderBottom: '2px solid #e5e7eb', paddingBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: '#111' }}>RELATÓRIO DE INSPEÇÃO</h1>
                <p style={{ fontSize: 13, color: '#6b7280', margin: '4px 0 0' }}>Prize Club Marina</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>Data: {fmtFull(cl.createdAt)}</p>
                <p style={{ fontSize: 12, color: '#6b7280', margin: '2px 0 0' }}>ID: {cl.id.slice(0, 8)}</p>
              </div>
            </div>
          </div>

          {/* Boat & operator info */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
            <div style={{ background: '#f9fafb', padding: 12, borderRadius: 10, border: '1px solid #e5e7eb' }}>
              <p style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600, margin: 0, textTransform: 'uppercase' }}>Embarcação</p>
              <p style={{ fontSize: 15, fontWeight: 700, margin: '4px 0 0', color: '#111' }}>{cl.boat?.name || '—'}</p>
              {cl.boat?.model && <p style={{ fontSize: 12, color: '#6b7280', margin: '2px 0 0' }}>{cl.boat.model}</p>}
            </div>
            <div style={{ background: '#f9fafb', padding: 12, borderRadius: 10, border: '1px solid #e5e7eb' }}>
              <p style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600, margin: 0, textTransform: 'uppercase' }}>Operador</p>
              <p style={{ fontSize: 15, fontWeight: 700, margin: '4px 0 0', color: '#111' }}>{cl.operator?.name || '—'}</p>
              <p style={{ fontSize: 12, color: cl.status === 'APPROVED' ? '#16a34a' : '#ca8a04', margin: '2px 0 0', fontWeight: 600 }}>
                {cl.status === 'APPROVED' ? '✓ Aprovado' : '⏳ Pendente'}
              </p>
            </div>
          </div>

          {/* Life vests */}
          {(cl.lifeVestsLoaned ?? 0) > 0 && (
            <div style={{ background: '#fff7ed', border: '2px solid #fb923c', borderRadius: 10, padding: 12, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 24 }}>🦺</span>
              <div>
                <p style={{ fontSize: 13, fontWeight: 700, color: '#c2410c', margin: 0 }}>COLETES EMPRESTADOS</p>
                <p style={{ fontSize: 18, fontWeight: 800, color: '#ea580c', margin: 0 }}>{cl.lifeVestsLoaned} colete{(cl.lifeVestsLoaned ?? 0) > 1 ? 's' : ''}</p>
              </div>
            </div>
          )}

          {/* CHECKLIST DE SAÍDA */}
          <div style={{ marginBottom: 20 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: '#111', margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
              📋 CHECKLIST DE SAÍDA
              <span style={{ fontSize: 12, fontWeight: 500, color: '#6b7280' }}>— {checked}/{total} itens verificados</span>
            </h2>
            <div style={{ display: 'grid', gap: 4 }}>
              {cl.items?.map(item => (
                <div key={item.id} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 10px', borderRadius: 8,
                  background: item.checked ? '#f0fdf4' : '#fef2f2',
                  border: `1px solid ${item.checked ? '#bbf7d0' : '#fecaca'}`,
                }}>
                  <div style={{
                    width: 16, height: 16, borderRadius: '50%', flexShrink: 0, marginTop: 2,
                    background: item.checked ? '#22c55e' : '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontSize: 10, fontWeight: 700,
                  }}>{item.checked ? '✓' : '✕'}</div>
                  <div>
                    <p style={{ fontSize: 13, margin: 0, color: '#111' }}>{item.label}</p>
                    {item.notes && <p style={{ fontSize: 11, margin: '2px 0 0', color: '#6b7280', fontStyle: 'italic' }}>{item.notes}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Hull sketch */}
          {(cl.hullSketchMarks || cl.hullSketchUrl) && (
            <div style={{ marginBottom: 20 }}>
              <button onClick={() => setShowSketch(!showSketch)} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
                padding: '10px 12px', background: '#f3f4f6', borderRadius: 10, border: '1px solid #e5e7eb',
                cursor: 'pointer', fontSize: 14, fontWeight: 600, color: '#111',
              }}>
                <span>🎨 Croqui do Casco — Avarias de Saída</span>
                <span style={{ fontSize: 11, color: '#9ca3af' }}>{showSketch ? '▲ Fechar' : '▼ Expandir'}</span>
              </button>
              {showSketch && (
                <div style={{ marginTop: 8 }}>
                  {cl.hullSketchMarks ? (
                    <JetSki3DMarkViewer marksJson={cl.hullSketchMarks} height={260} />
                  ) : cl.hullSketchUrl ? (
                    <img src={resolveMediaUrl(cl.hullSketchUrl)} alt="Croqui" style={{ width: '100%', borderRadius: 10, border: '1px solid #e5e7eb' }} />
                  ) : null}
                </div>
              )}
            </div>
          )}

          {/* Fuel photo */}
          {cl.fuelPhotoUrl && (
            <div style={{ marginBottom: 20 }}>
              <p style={{ fontSize: 14, fontWeight: 700, color: '#111', margin: '0 0 8px' }}>⛽ Foto do Tanque — Saída</p>
              <img src={resolveMediaUrl(cl.fuelPhotoUrl)} alt="Tanque saída" style={{ width: '100%', maxHeight: 220, objectFit: 'contain', borderRadius: 10, border: '1px solid #e5e7eb' }} />
            </div>
          )}

          {/* Video reference */}
          {cl.videoUrl && (
            <div style={{ marginBottom: 20, background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: 10, padding: 12 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#7c3aed', margin: 0 }}>🎥 Vídeo de Inspeção — Disponível</p>
              <p style={{ fontSize: 11, color: '#a78bfa', margin: '2px 0 0' }}>O vídeo pode ser visualizado no sistema (não exportável para PDF)</p>
            </div>
          )}

          {/* Observations */}
          {cl.additionalObservations && (
            <div style={{ marginBottom: 20, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: 12 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: '#92400e', margin: '0 0 4px' }}>📝 Observações — Saída</p>
              <p style={{ fontSize: 13, color: '#78350f', margin: 0 }}>{cl.additionalObservations}</p>
            </div>
          )}

          {/* ═══ INSPEÇÃO DE RETORNO ═══ */}
          {hasReturn && (
            <div style={{ borderTop: '3px solid #3b82f6', paddingTop: 16, marginTop: 8 }}>
              <button onClick={() => setShowReturn(!showReturn)} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
                padding: '10px 12px', background: '#eff6ff', borderRadius: 10, border: '1px solid #bfdbfe',
                cursor: 'pointer', fontSize: 15, fontWeight: 700, color: '#1d4ed8', marginBottom: 12,
              }}>
                <span>🔄 INSPEÇÃO DE RETORNO — {fmtFull(cl.returnCompletedAt)}</span>
                <span style={{ fontSize: 11, color: '#60a5fa' }}>{showReturn ? '▲ Fechar' : '▼ Expandir'}</span>
              </button>
              {showReturn && (
                <div style={{ display: 'grid', gap: 16 }}>
                  {/* Return sketch marks */}
                  {cl.returnSketchMarks && (
                    <div>
                      <p style={{ fontSize: 14, fontWeight: 700, color: '#111', margin: '0 0 8px' }}>🎨 Avarias Registradas no Retorno</p>
                      <JetSki3DMarkViewer marksJson={cl.returnSketchMarks} height={240} />
                    </div>
                  )}

                  {/* Return fuel photo */}
                  {cl.returnFuelPhotoUrl && (
                    <div>
                      <p style={{ fontSize: 14, fontWeight: 700, color: '#111', margin: '0 0 8px' }}>⛽ Foto do Tanque — Retorno</p>
                      <img src={resolveMediaUrl(cl.returnFuelPhotoUrl)} alt="Tanque retorno" style={{ width: '100%', maxHeight: 220, objectFit: 'contain', borderRadius: 10, border: '1px solid #e5e7eb' }} />
                    </div>
                  )}

                  {/* Return observations */}
                  {cl.returnObservations && (
                    <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: 12 }}>
                      <p style={{ fontSize: 12, fontWeight: 700, color: '#92400e', margin: '0 0 4px' }}>📝 Observações — Retorno</p>
                      <p style={{ fontSize: 13, color: '#78350f', margin: 0 }}>{cl.returnObservations}</p>
                    </div>
                  )}

                  {!cl.returnSketchMarks && !cl.returnFuelPhotoUrl && !cl.returnObservations && (
                    <p style={{ fontSize: 13, color: '#6b7280', textAlign: 'center', padding: 16 }}>Nenhuma avaria ou observação registrada no retorno.</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Footer */}
          <div style={{ marginTop: 24, borderTop: '1px solid #e5e7eb', paddingTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <p style={{ fontSize: 10, color: '#9ca3af', margin: 0 }}>Prize Club Marina — Relatório gerado em {new Date().toLocaleString('pt-BR', { timeZone: BRT })}</p>
            <p style={{ fontSize: 10, color: '#9ca3af', margin: 0 }}>ID: {cl.id}</p>
          </div>
        </div>

        {/* Modal video player (outside print area) */}
        {cl.videoUrl && (
          <div className="px-6 pb-4">
            <p className="text-xs text-th-muted mb-2">🎥 Vídeo de Inspeção</p>
            <video src={resolveMediaUrl(cl.videoUrl)} controls className="w-full max-h-56 rounded-xl border border-th bg-black" />
          </div>
        )}
      </div>
    </div>
  );
}
