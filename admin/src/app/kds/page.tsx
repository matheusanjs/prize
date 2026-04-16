'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Ship, Clock, User, Waves, ArrowUp, ArrowDown, CheckCircle2,
  AlertTriangle, Maximize, Minimize, Volume2, VolumeX, Anchor,
  ClipboardCheck, RefreshCw, Settings,
} from 'lucide-react';
import Image from 'next/image';
import { getQueue, getChecklists, getBoats, getTodayReservations } from '@/services/api';

/* ─── Types ──────────────────────────────────────────────────────────────── */
interface ChecklistFull {
  id: string; status: string;
  items?: { id: string; label: string; checked: boolean }[];
}
interface QueueItem {
  id: string; position: number; status: string; scheduledAt: string;
  startedAt?: string; completedAt?: string;
  boat?: { id: string; name: string; model: string };
  client?: { id: string; name: string };
  reservation?: {
    id: string; startDate: string; endDate: string; status: string;
    confirmedAt?: string | null;
    expectedArrivalTime?: string | null;
    user?: { id: string; name: string };
    checklist?: ChecklistFull | null;
  };
}
interface TodayRes {
  id: string; startDate: string; endDate: string; status: string;
  boat?: { id: string; name: string; model: string };
  user?: { id: string; name: string };
  checklist?: { id: string; status: string } | null;
  queue?: { id: string; status: string } | null;
}

/* ─── Helpers ────────────────────────────────────────────────────────────── */
const BRT = 'America/Sao_Paulo';
const fmt = (s: string) => new Date(s).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: BRT });

function elapsed(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '0min';
  if (mins < 60) return `${mins}min`;
  return `${Math.floor(mins / 60)}h${mins % 60}min`;
}

function timeUntil(dateStr: string) {
  const diff = new Date(dateStr).getTime() - Date.now();
  if (diff <= 0) return 'Agora';
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}min`;
  return `${Math.floor(mins / 60)}h${mins % 60}min`;
}

function urgency(dateStr: string): 'ok' | 'warn' | 'critical' {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins >= 180) return 'critical';
  if (mins >= 120) return 'warn';
  return 'ok';
}

const urgencyBorder: Record<string, string> = {
  ok: 'border-emerald-500/30',
  warn: 'border-amber-500/50',
  critical: 'border-red-500/60 animate-pulse',
};

const urgencyTime: Record<string, string> = {
  ok: 'text-emerald-400',
  warn: 'text-amber-400',
  critical: 'text-red-400 animate-pulse',
};

const statusCfg: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  WAITING:   { label: 'Aguardando',  color: 'text-zinc-300',  bg: 'bg-zinc-700/40', dot: 'bg-zinc-400' },
  PREPARING: { label: 'Preparando',  color: 'text-yellow-300', bg: 'bg-yellow-500/15', dot: 'bg-yellow-400' },
  LAUNCHING: { label: 'Descendo',    color: 'text-blue-300',   bg: 'bg-blue-500/15', dot: 'bg-blue-400' },
  IN_WATER:  { label: 'Na Água',     color: 'text-emerald-300',bg: 'bg-emerald-500/15', dot: 'bg-emerald-400' },
  RETURNING: { label: 'Retornando',  color: 'text-purple-300', bg: 'bg-purple-500/15', dot: 'bg-purple-400' },
  COMPLETED: { label: 'Concluído',   color: 'text-teal-300',   bg: 'bg-teal-500/15', dot: 'bg-teal-400' },
};

/* ─── KDS Page ───────────────────────────────────────────────────────────── */
export default function MarinaKDS() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [todayRes, setTodayRes] = useState<TodayRes[]>([]);
  const [loading, setLoading] = useState(true);
  const [, setTick] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [muted, setMuted] = useState(false);
  const prevInWaterCount = useRef(0);

  const today = new Date().toLocaleDateString('en-CA', { timeZone: BRT });

  const load = useCallback(async () => {
    try {
      const [qRes, tRes] = await Promise.all([
        getQueue({ date: today }).catch(() => ({ data: [] })),
        getTodayReservations(today).catch(() => ({ data: [] })),
      ]);
      const q = qRes.data; setQueue(Array.isArray(q) ? q : q?.data || []);
      const t = tRes.data; setTodayRes(Array.isArray(t) ? t : t?.data || []);
    } finally { setLoading(false); }
  }, [today]);

  useEffect(() => { load(); }, [load]);
  // Auto-refresh every 15 seconds
  useEffect(() => { const t = setInterval(load, 15000); return () => clearInterval(t); }, [load]);
  // Tick every 30s for timers
  useEffect(() => { const t = setInterval(() => setTick(n => n + 1), 30000); return () => clearInterval(t); }, []);

  // Derived data
  const inWater = queue.filter(q => q.status === 'IN_WATER');
  const waiting = queue.filter(q => ['WAITING', 'PREPARING', 'LAUNCHING'].includes(q.status) && q.reservation?.status !== 'CANCELLED');
  const completed = queue.filter(q => ['COMPLETED', 'RETURNING'].includes(q.status));
  const needsCheckin = todayRes.filter(r =>
    (!r.checklist || r.checklist.status === 'PENDING') && !r.queue && ['CONFIRMED', 'PENDING'].includes(r.status)
  );

  // Sound alert on new IN_WATER
  useEffect(() => {
    if (!muted && inWater.length > prevInWaterCount.current && prevInWaterCount.current > 0) {
      try { new Audio('/sounds/ding.mp3').play().catch(() => {}); } catch {}
    }
    prevInWaterCount.current = inWater.length;
  }, [inWater.length, muted]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const now = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: BRT });
  const dateStr = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', timeZone: BRT });

  return (
    <div className="h-screen flex flex-col bg-[#0a0e14] text-white overflow-hidden select-none">

      {/* ───── HEADER BAR ───── */}
      <div className="flex items-center justify-between px-6 py-3 bg-[#0d1219] border-b border-white/5 flex-shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <Image src="/logo.png" alt="Prize Club" width={100} height={34} className="h-8 w-auto brightness-0 invert" />
            <div className="h-6 w-px bg-white/10" />
            <p className="text-[10px] text-white/40 uppercase tracking-widest font-medium">{dateStr}</p>
          </div>
          <div className="h-8 w-px bg-white/10" />
          <div className="flex items-center gap-4 text-sm font-bold">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-orange-500" />
              <span className="text-orange-400">{needsCheckin.length}</span>
              <span className="text-white/30 text-xs font-medium">check-in</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
              <span className="text-blue-400">{waiting.length}</span>
              <span className="text-white/30 text-xs font-medium">fila</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-emerald-400">{inWater.length}</span>
              <span className="text-white/30 text-xs font-medium">na água</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-zinc-500" />
              <span className="text-zinc-400">{completed.length}</span>
              <span className="text-white/30 text-xs font-medium">concluídos</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-2xl font-black text-white/80 tabular-nums tracking-tight">{now}</span>
          <button onClick={() => setMuted(m => !m)} className="p-2 rounded-lg hover:bg-white/5 transition text-white/40 hover:text-white/70">
            {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </button>
          <button onClick={toggleFullscreen} className="p-2 rounded-lg hover:bg-white/5 transition text-white/40 hover:text-white/70">
            {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
          </button>
          {loading && <RefreshCw className="w-4 h-4 text-white/20 animate-spin" />}
        </div>
      </div>

      {/* ───── KANBAN BOARD ───── */}
      <div className="flex-1 flex gap-3 p-3 overflow-hidden">

        {/* ── COL 1: CHECK-IN ── */}
        <div className="flex-1 min-w-0 rounded-2xl border border-orange-500/20 bg-[#0d1219]/80 flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-orange-500/10 bg-orange-500/5 flex-shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="w-3.5 h-3.5 rounded-full bg-orange-500" />
                <h2 className="text-sm font-black uppercase tracking-wider text-orange-400">Check-in</h2>
              </div>
              <span className="text-xl font-black text-orange-400">{needsCheckin.length}</span>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2.5 scrollbar-thin">
            {needsCheckin.map(r => (
              <div key={r.id} className="rounded-xl border border-orange-500/20 bg-[#111820] p-3.5 transition-all hover:border-orange-500/40">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center flex-shrink-0">
                      <Ship className="w-5 h-5 text-orange-400" />
                    </div>
                    <div>
                      <p className="font-black text-base text-white leading-tight">{r.boat?.name || '—'}</p>
                      <p className="text-xs text-white/30 font-medium">{r.boat?.model}</p>
                    </div>
                  </div>
                  <span className="text-[10px] px-2.5 py-1 rounded-full font-bold bg-orange-500/15 text-orange-400 uppercase tracking-wider">
                    {r.checklist?.status === 'PENDING' ? 'Pendente' : 'Reservado'}
                  </span>
                </div>
                <div className="space-y-1.5 mt-3">
                  <div className="flex items-center gap-2 text-sm text-white/60">
                    <User className="w-3.5 h-3.5 text-white/30" />
                    <span className="font-medium">{r.user?.name || '—'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm font-bold text-orange-400">
                    <Clock className="w-3.5 h-3.5" />
                    <span>{fmt(r.startDate)} → {fmt(r.endDate)}</span>
                  </div>
                </div>
              </div>
            ))}
            {needsCheckin.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-white/15">
                <ClipboardCheck className="w-12 h-12 mb-3" />
                <p className="text-sm font-medium">Nenhum check-in pendente</p>
              </div>
            )}
          </div>
        </div>

        {/* ── COL 2: FILA / CONFIRMADOS ── */}
        <div className="flex-1 min-w-0 rounded-2xl border border-blue-500/20 bg-[#0d1219]/80 flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-blue-500/10 bg-blue-500/5 flex-shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="w-3.5 h-3.5 rounded-full bg-blue-500" />
                <h2 className="text-sm font-black uppercase tracking-wider text-blue-400">Fila</h2>
              </div>
              <span className="text-xl font-black text-blue-400">{waiting.length}</span>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2.5 scrollbar-thin">
            {waiting.map(item => {
              const cfg = statusCfg[item.status] || statusCfg.WAITING;
              const arrivalTime = item.reservation?.expectedArrivalTime;
              const checklistOk = item.reservation?.checklist?.status === 'APPROVED';
              return (
                <div key={item.id} className="rounded-xl border border-blue-500/15 bg-[#111820] p-3.5 transition-all">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2.5">
                      {item.position && (
                        <div className="w-8 h-8 rounded-lg bg-blue-500/15 flex items-center justify-center text-sm font-black text-blue-400">
                          #{item.position}
                        </div>
                      )}
                      <div>
                        <p className="font-black text-base text-white leading-tight">{item.boat?.name || '—'}</p>
                        <p className="text-xs text-white/30 font-medium">{item.boat?.model}</p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className={`text-[10px] px-2.5 py-1 rounded-full font-bold ${cfg.bg} ${cfg.color} uppercase tracking-wider flex items-center gap-1`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />{cfg.label}
                      </span>
                      {checklistOk && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-emerald-500/15 text-emerald-400 flex items-center gap-1">
                          <CheckCircle2 className="w-2.5 h-2.5" />CL OK
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="space-y-1.5 mt-2">
                    <div className="flex items-center gap-2 text-sm text-white/60">
                      <User className="w-3.5 h-3.5 text-white/30" />
                      <span className="font-medium">{item.client?.name || item.reservation?.user?.name || '—'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-white/50">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{item.reservation ? fmt(item.reservation.startDate) : fmt(item.scheduledAt)}</span>
                    </div>
                    {arrivalTime && (
                      <div className="flex items-center gap-2 text-sm font-bold text-emerald-400 bg-emerald-500/10 rounded-lg px-2.5 py-1.5 mt-1">
                        <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                        Chegada: {arrivalTime}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {waiting.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-white/15">
                <Clock className="w-12 h-12 mb-3" />
                <p className="text-sm font-medium">Nenhum na fila</p>
              </div>
            )}
          </div>
        </div>

        {/* ── COL 3: NA ÁGUA (main, wider) ── */}
        <div className="flex-[1.5] min-w-0 rounded-2xl border border-emerald-500/30 bg-[#0d1219]/80 flex flex-col overflow-hidden ring-1 ring-emerald-500/10">
          <div className="px-4 py-3 border-b border-emerald-500/15 bg-emerald-500/5 flex-shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="w-3.5 h-3.5 rounded-full bg-emerald-500 animate-pulse" />
                <h2 className="text-sm font-black uppercase tracking-wider text-emerald-400">Na Água</h2>
              </div>
              <span className="text-2xl font-black text-emerald-400">{inWater.length}</span>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-3 scrollbar-thin">
            <div className="grid grid-cols-2 gap-2.5">
              {inWater.map(item => {
                const urg = item.reservation?.endDate ? urgency(item.reservation.endDate) : 'ok';
                const timeLeft = item.reservation?.endDate ? timeUntil(item.reservation.endDate) : '';
                const isOvertime = item.reservation?.endDate && new Date(item.reservation.endDate).getTime() < Date.now();
                return (
                  <div key={item.id} className={`rounded-xl border-2 ${urgencyBorder[urg]} bg-[#111820] p-4 transition-all`}>
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2.5">
                        <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                          <Waves className="w-5 h-5 text-emerald-400" />
                        </div>
                        <div>
                          <p className="font-black text-lg text-white leading-tight">{item.boat?.name || '—'}</p>
                          <p className="text-xs text-white/30 font-medium">{item.boat?.model}</p>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-1.5 mt-2">
                      <div className="flex items-center gap-2 text-sm text-white/60">
                        <User className="w-3.5 h-3.5 text-white/30" />
                        <span className="font-medium">{item.client?.name || '—'}</span>
                      </div>
                      {item.startedAt && (
                        <div className="flex items-center gap-2 text-xs text-white/40">
                          <ArrowDown className="w-3 h-3" />
                          Desceu {fmt(item.startedAt)} · {elapsed(item.startedAt)} na água
                        </div>
                      )}
                      {item.reservation?.endDate && (
                        <div className={`flex items-center gap-2 text-sm font-bold mt-1 ${isOvertime ? 'text-red-400' : urgencyTime[urg]}`}>
                          <Clock className="w-3.5 h-3.5" />
                          {isOvertime ? (
                            <span>⚠️ Atrasado · Retorno era {fmt(item.reservation.endDate)}</span>
                          ) : (
                            <span>Retorno {fmt(item.reservation.endDate)} · {timeLeft}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {inWater.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-white/15">
                <Waves className="w-14 h-14 mb-3" />
                <p className="text-base font-medium">Nenhum na água</p>
              </div>
            )}
          </div>
        </div>

        {/* ── COL 4: CONCLUÍDOS ── */}
        <div className="flex-[0.8] min-w-0 rounded-2xl border border-zinc-700/40 bg-[#0d1219]/60 flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-700/30 bg-zinc-800/20 flex-shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="w-3.5 h-3.5 rounded-full bg-zinc-500" />
                <h2 className="text-sm font-black uppercase tracking-wider text-zinc-400">Concluídos</h2>
              </div>
              <span className="text-xl font-black text-zinc-500">{completed.length}</span>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-thin">
            {completed.map(item => {
              const cfg = statusCfg[item.status] || statusCfg.COMPLETED;
              return (
                <div key={item.id} className="rounded-xl border border-zinc-700/30 bg-[#111820]/60 p-3 opacity-70">
                  <div className="flex items-start justify-between mb-1">
                    <p className="font-bold text-sm text-white/70">{item.boat?.name || '—'}</p>
                    <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold ${cfg.bg} ${cfg.color} uppercase tracking-wider`}>{cfg.label}</span>
                  </div>
                  <div className="space-y-0.5 text-xs text-white/30">
                    <div className="flex items-center gap-1.5"><User className="w-3 h-3" />{item.client?.name || '—'}</div>
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1"><ArrowDown className="w-3 h-3" />{item.startedAt ? fmt(item.startedAt) : '—'}</span>
                      <span className="flex items-center gap-1"><ArrowUp className="w-3 h-3" />{item.completedAt ? fmt(item.completedAt) : '—'}</span>
                    </div>
                  </div>
                </div>
              );
            })}
            {completed.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-white/10">
                <CheckCircle2 className="w-10 h-10 mb-2" />
                <p className="text-xs font-medium">Nenhum concluído</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
