'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Calendar, ChevronLeft, ChevronRight, Plus, X, Ship, User, Clock, AlertTriangle, Search, ChevronDown, Wind, Droplets, CloudRain } from 'lucide-react';
import { getReservations, getBoats, getUsers, createReservation, cancelReservation, getWeatherForecast, getWeatherCurrent } from '@/services/api';
import { useReservationPolling } from '@/hooks/useReservationPolling';
import { saveCalendarCache, loadCalendarCache } from '@/utils/calendarCache';

interface Reservation {
  id: string;
  user?: { id: string; name: string; email?: string };
  boat?: { id: string; name: string; model?: string };
  startDate: string;
  endDate: string;
  status: string;
  notes?: string;
}
interface Boat { id: string; name: string; model: string }
interface UserItem { id: string; name: string; email: string }
interface ForecastDay {
  date: string;
  navigationLevel: 'BOM' | 'ATENCAO' | 'RUIM' | 'PERIGOSO';
  windSpeedMax: number;
  airTempMin: number;
  airTempMax: number;
  clientSummary: string;
  humidity?: number;
  rainProbability?: number;
  description?: string;
}
interface CurrentWeather {
  windSpeed: number | null;
  airTemperature: number | null;
  humidity: number | null;
  precipitation: number | null;
  navigationLevel: 'BOM' | 'ATENCAO' | 'RUIM' | 'PERIGOSO';
  navigationScore: number;
}

const statusConfig: Record<string, { label: string; color: string; dot: string }> = {
  CONFIRMED: { label: 'Confirmada', color: 'bg-green-500/15 text-green-600 dark:text-green-400', dot: 'bg-green-500' },
  PENDING: { label: 'Pendente', color: 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400', dot: 'bg-yellow-500' },
  IN_USE: { label: 'Em Uso', color: 'bg-blue-500/15 text-blue-600 dark:text-blue-400', dot: 'bg-blue-500' },
  COMPLETED: { label: 'Concluída', color: 'bg-th-surface text-th-secondary', dot: 'bg-gray-400' },
  CANCELLED: { label: 'Cancelada', color: 'bg-red-500/15 text-red-600 dark:text-red-400', dot: 'bg-red-400' },
};

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

function dateKey(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function sameDay(a: string, b: string) { return a.slice(0, 10) === b.slice(0, 10); }

export default function ReservationsPage() {
  const today = new Date();
  const [month, setMonth] = useState(today.getMonth());
  const [year, setYear] = useState(today.getFullYear());
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [boats, setBoats] = useState<Boat[]>([]);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [boatSearch, setBoatSearch] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [showBoatDrop, setShowBoatDrop] = useState(false);
  const [showUserDrop, setShowUserDrop] = useState(false);
  const [form, setForm] = useState({ boatId: '', userId: '', startDate: '', startTime: '08:00', endDate: '', endTime: '18:00', notes: '' });
  const [forecastMap, setForecastMap] = useState<Record<string, ForecastDay>>({});
  const [currentWeather, setCurrentWeather] = useState<CurrentWeather | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function loadData() {
    try {
      const [resRes, boatsRes, usersRes] = await Promise.all([
        getReservations().catch(() => ({ data: [] })),
        getBoats().catch(() => ({ data: [] })),
        getUsers({ limit: 200 }).catch(() => ({ data: [] })),
      ]);
      const r = resRes.data;
      const resList = Array.isArray(r) ? r : r?.data || [];
      setReservations(resList);
      saveCalendarCache(resList);
      const b = boatsRes.data;
      setBoats(Array.isArray(b) ? b : b?.data || []);
      const u = usersRes.data;
      setUsers(Array.isArray(u) ? u : u?.data || []);
    } catch { /* keep defaults */ }
    finally { setLoading(false); }
  }

  useEffect(() => {
    // Show cached data immediately for instant display
    const cached = loadCalendarCache();
    if (cached && Array.isArray(cached)) {
      setReservations(cached as Reservation[]);
      setLoading(false);
    }
    loadData();
  }, []);

  // Poll every 10 seconds to keep calendar fresh across clients
  useReservationPolling({
    enabled: true,
    intervalMs: 10_000,
    onPoll: useCallback(async () => {
      try {
        const resRes = await getReservations();
        const r = resRes.data;
        const resList = Array.isArray(r) ? r : r?.data || [];
        setReservations(resList);
        saveCalendarCache(resList);
      } catch {
        // Network error — keep showing cached data
      }
    }, []),
  });

  useEffect(() => {
    (async () => {
      try {
        const [forecastRes, currentRes] = await Promise.all([
          getWeatherForecast().catch(() => ({ data: { ok: false, data: [] } })),
          getWeatherCurrent().catch(() => ({ data: { ok: false, data: null } })),
        ]);
        if (forecastRes.data?.ok && forecastRes.data?.data) {
          const map: Record<string, ForecastDay> = {};
          (forecastRes.data.data as ForecastDay[]).forEach((d) => { map[d.date] = d; });
          setForecastMap(map);
        }
        if (currentRes.data?.ok && currentRes.data?.data) {
          setCurrentWeather(currentRes.data.data);
        }
      } catch { /* silent */ }
    })();
  }, []);

  // Calendar grid
  const calendarDays = useMemo(() => {
    const first = new Date(year, month, 1);
    const startDay = first.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const prevMonthDays = new Date(year, month, 0).getDate();
    const days: { date: Date; current: boolean }[] = [];
    for (let i = startDay - 1; i >= 0; i--) {
      days.push({ date: new Date(year, month - 1, prevMonthDays - i), current: false });
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push({ date: new Date(year, month, i), current: true });
    }
    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
      days.push({ date: new Date(year, month + 1, i), current: false });
    }
    return days;
  }, [month, year]);

  // Reservations map per date
  const reservationsByDate = useMemo(() => {
    const map: Record<string, Reservation[]> = {};
    reservations.forEach((r) => {
      if (r.status === 'CANCELLED') return;
      const start = new Date(r.startDate);
      const end = new Date(r.endDate);
      const d = new Date(start);
      d.setHours(0, 0, 0, 0);
      const endD = new Date(end);
      endD.setHours(0, 0, 0, 0);
      while (d <= endD) {
        const key = dateKey(d);
        if (!map[key]) map[key] = [];
        if (!map[key].find((x) => x.id === r.id)) map[key].push(r);
        d.setDate(d.getDate() + 1);
      }
    });
    return map;
  }, [reservations]);

  function prevMonth() { if (month === 0) { setMonth(11); setYear(year - 1); } else setMonth(month - 1); }
  function nextMonth() { if (month === 11) { setMonth(0); setYear(year + 1); } else setMonth(month + 1); }
  function goToday() { setMonth(today.getMonth()); setYear(today.getFullYear()); }

  function toggleDay(dateKey: string) {
    setSelectedDates((prev) => {
      const next = new Set(prev);
      if (next.has(dateKey)) next.delete(dateKey);
      else next.add(dateKey);
      return next;
    });
  }
  function openSingleDay(date: Date) {
    const key = dateKey(date);
    setSelectedDates((prev) => {
      const next = new Set(prev);
      if (next.size === 1 && next.has(key)) return new Set();
      return new Set([key]);
    });
  }

  function openCreate(date?: string) {
    const d = date || dateKey(today);
    const next = new Date(d + 'T12:00:00');
    next.setDate(next.getDate() + 1);
    setForm({ boatId: '', userId: '', startDate: d, startTime: '08:00', endDate: dateKey(next), endTime: '18:00', notes: '' });
    setBoatSearch('');
    setUserSearch('');
    setShowBoatDrop(false);
    setShowUserDrop(false);
    setShowCreate(true);
  }

  async function handleCreate() {
    if (!form.boatId || !form.userId || !form.startDate || !form.endDate) {
      alert('Preencha embarcação, usuário e datas.');
      return;
    }
    setSaving(true);
    try {
      await createReservation({
        boatId: form.boatId,
        userId: form.userId,
        startDate: new Date(`${form.startDate}T${form.startTime}:00-03:00`).toISOString(),
        endDate: new Date(`${form.endDate}T${form.endTime}:00-03:00`).toISOString(),
        notes: form.notes || undefined,
      });
      setShowCreate(false);
      setLoading(true);
      await loadData();
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Erro ao criar reserva');
    } finally {
      setSaving(false);
    }
  }

  async function handleCancel(id: string) {
    if (!window.confirm('Cancelar esta reserva?')) return;
    try {
      await cancelReservation(id, 'Cancelado pelo administrador');
      setLoading(true);
      await loadData();
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Erro ao cancelar');
    }
  }

  const todayKey = dateKey(today);
  const selectedDatesArray = Array.from(selectedDates);
  const allSelectedReservations = selectedDatesArray.flatMap(
    (d) => (reservationsByDate[d] || []).map((r) => ({ ...r, _dateKey: d }))
  );
  const activeCount = reservations.filter((r) => r.status === 'CONFIRMED' || r.status === 'IN_USE').length;

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-th flex items-center gap-2">
            <Calendar className="text-primary-500" />
            Reservas
          </h1>
          <p className="text-th-muted text-sm mt-1">{reservations.length} reservas • {activeCount} ativas</p>
        </div>
        <button onClick={() => openCreate()} className="flex items-center gap-2 bg-primary-500 text-white px-4 py-2.5 rounded-lg font-medium hover:bg-primary-600 transition text-sm">
          <Plus size={16} /> Nova Reserva
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar */}
        <div className="lg:col-span-2 bg-th-card rounded-2xl shadow-black/10 border border-th overflow-hidden">
          {/* Calendar Header */}
          <div className="flex items-center justify-between p-5 border-b border-th bg-gradient-to-r from-primary-500 to-primary-600">
            <button onClick={prevMonth} className="p-2 hover:bg-th-hover/20 rounded-lg transition text-th"><ChevronLeft size={20} /></button>
            <div className="text-center">
              <h2 className="text-lg font-bold text-th">{MONTHS[month]} {year}</h2>
              <button onClick={goToday} className="text-xs text-th-secondary hover:text-primary-500 mt-0.5">Ir para hoje</button>
            </div>
            <button onClick={nextMonth} className="p-2 hover:bg-th-hover/20 rounded-lg transition text-th"><ChevronRight size={20} /></button>
          </div>

          {/* Weekday headers */}
          <div className="grid grid-cols-7 border-b border-th">
            {WEEKDAYS.map((d) => (
              <div key={d} className="py-3 text-center text-xs font-semibold text-th-muted uppercase tracking-wider">{d}</div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7">
            {calendarDays.map(({ date, current }, i) => {
              const key = dateKey(date);
              const isToday = key === todayKey;
              const isSelected = selectedDates.has(key);
              const dayRes = reservationsByDate[key] || [];
              const hasRes = dayRes.length > 0;
              const forecast = forecastMap[key];
              const weatherEmoji = forecast
                ? forecast.navigationLevel === 'BOM' ? '☀️'
                  : forecast.navigationLevel === 'ATENCAO' ? '⛅'
                  : forecast.navigationLevel === 'RUIM' ? '🌊' : '⛔'
                : null;
              return (
                <button
                  key={i}
                  onClick={() => toggleDay(key)}
                  onDoubleClick={() => openSingleDay(date)}
                  className={`relative min-h-[90px] p-2 border-b border-r border-th text-left transition hover:bg-primary-500/5 group
                    ${!current ? 'bg-th-surface' : ''}
                    ${isSelected ? 'bg-primary-500/10 ring-2 ring-primary-400 ring-inset' : ''}
                  `}
                >
                  <div className="flex items-start justify-between">
                    <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-sm font-medium
                      ${isToday ? 'bg-primary-500 text-white' : current ? 'text-th' : 'text-th-muted'}
                      ${isSelected && !isToday ? 'bg-primary-100 text-primary-500' : ''}
                    `}>
                      {date.getDate()}
                    </span>
                    {weatherEmoji && current && (
                      <span className="text-[11px] leading-none mt-0.5">{weatherEmoji}</span>
                    )}
                  </div>
                  {hasRes && (
                    <div className="mt-1.5">
                      <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full
                        ${isSelected ? 'bg-primary-500/20 text-primary-500' : 'bg-primary-500/10 text-primary-500'}`}>
                        {dayRes.length} {dayRes.length === 1 ? 'res.' : 'res.'}
                      </span>
                      <div className="flex gap-0.5 mt-1 flex-wrap">
                        {Array.from(new Set(dayRes.map(r => r.status))).slice(0, 3).map((s) => {
                          const sc = statusConfig[s] || statusConfig.CONFIRMED;
                          return <div key={s} className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />;
                        })}
                      </div>
                    </div>
                  )}
                  {/* New reservation quick-add */}
                  {current && (
                    <div className="absolute bottom-1 right-1 opacity-0 group-hover:opacity-100 transition">
                      <button
                        onClick={(e) => { e.stopPropagation(); openCreate(key); }}
                        className="w-5 h-5 bg-primary-500 text-white rounded-full flex items-center justify-center hover:bg-primary-600 shadow"
                      >
                        <Plus size={12} />
                      </button>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Side Panel */}
        <div className="flex flex-col gap-4">

          {/* Weather compact card */}
          {currentWeather && (() => {
            const navCfg: Record<string, { label: string; bg: string; text: string; dot: string }> = {
              BOM:      { label: 'Bom para navegar',  bg: 'bg-emerald-500/10', text: 'text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-500' },
              ATENCAO:  { label: 'Atenção ao navegar', bg: 'bg-amber-500/10',   text: 'text-amber-600 dark:text-amber-400',   dot: 'bg-amber-500' },
              RUIM:     { label: 'Condições ruins',   bg: 'bg-orange-500/10', text: 'text-orange-600 dark:text-orange-400', dot: 'bg-orange-500' },
              PERIGOSO: { label: 'Perigoso',          bg: 'bg-red-500/10',    text: 'text-red-600 dark:text-red-400',       dot: 'bg-red-500' },
            };
            const cfg = navCfg[currentWeather.navigationLevel] || navCfg.ATENCAO;
            const windKmh = currentWeather.windSpeed != null ? (currentWeather.windSpeed * 3.6).toFixed(0) : '-';
            return (
              <div className={`rounded-2xl border border-th ${cfg.bg} p-4`}>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-bold text-th-muted uppercase tracking-wider">Condições Marítimas</p>
                  <span className={`flex items-center gap-1.5 text-xs font-bold ${cfg.text}`}>
                    <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                    {cfg.label}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex items-center gap-2">
                    <Wind size={13} className="text-th-muted" />
                    <div>
                      <p className="text-[9px] text-th-muted leading-none">Vento</p>
                      <p className="text-xs font-semibold text-th">{windKmh} km/h</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Droplets size={13} className="text-th-muted" />
                    <div>
                      <p className="text-[9px] text-th-muted leading-none">Umidade</p>
                      <p className="text-xs font-semibold text-th">{currentWeather.humidity?.toFixed(0) ?? '-'}%</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px]">🌡️</span>
                    <div>
                      <p className="text-[9px] text-th-muted leading-none">Temp</p>
                      <p className="text-xs font-semibold text-th">{currentWeather.airTemperature?.toFixed(0) ?? '-'}°C</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <CloudRain size={13} className="text-th-muted" />
                    <div>
                      <p className="text-[9px] text-th-muted leading-none">Chuva</p>
                      <p className="text-xs font-semibold text-th">{currentWeather.precipitation?.toFixed(1) ?? '0'}mm</p>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Day Detail */}
          <div className="bg-th-card rounded-2xl shadow-black/10 border border-th overflow-hidden flex-1">
            {selectedDatesArray.length > 0 ? (
              <>
                {selectedDatesArray.length === 1 ? (
                  <div className="p-5 border-b border-th bg-th-surface">
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold text-th capitalize">
                        {new Date(selectedDatesArray[0] + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' })}
                      </h3>
                      <button onClick={() => setSelectedDates(new Set())} className="p-1 hover:bg-red-500/10 rounded-lg"><X size={16} className="text-th-muted" /></button>
                    </div>
                    <p className="text-xs text-th-muted mt-0.5">{allSelectedReservations.length} reserva(s) neste dia</p>
                    {(() => {
                      const fc = forecastMap[selectedDatesArray[0]];
                      if (!fc) return null;
                      const lvlText: Record<string, string> = { BOM: 'text-emerald-500', ATENCAO: 'text-amber-500', RUIM: 'text-orange-500', PERIGOSO: 'text-red-500' };
                      return (
                        <p className={`text-[11px] font-medium mt-1 ${lvlText[fc.navigationLevel] || ''}`}>
                          {fc.navigationLevel === 'BOM' ? '☀️' : fc.navigationLevel === 'ATENCAO' ? '⛅' : fc.navigationLevel === 'RUIM' ? '🌊' : '⛔'}
                          {' '}{fc.description || fc.clientSummary} · {fc.airTempMin}–{fc.airTempMax}°C
                        </p>
                      );
                    })()}
                  </div>
                ) : (
                  <div className="p-5 border-b border-th bg-th-surface">
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold text-th">{selectedDatesArray.length} dias selecionados</h3>
                      <button onClick={() => setSelectedDates(new Set())} className="p-1 hover:bg-red-500/10 rounded-lg"><X size={16} className="text-th-muted" /></button>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {[...selectedDatesArray].sort().map((d) => (
                        <span key={d} className="inline-flex items-center gap-1 text-[11px] bg-primary-500/10 text-primary-500 px-2 py-0.5 rounded-full font-medium">
                          {new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                          <button onClick={() => { setSelectedDates((prev) => { const n = new Set(prev); n.delete(d); return n; }); }} className="hover:text-red-500"><X size={10} /></button>
                        </span>
                      ))}
                    </div>
                    <p className="text-xs text-th-muted mt-2">{allSelectedReservations.length} reserva(s) no total</p>
                  </div>
                )}
                <div className="p-4">
                  {allSelectedReservations.length > 0 ? (
                    <div className="space-y-2">
                      {allSelectedReservations.map((r, idx) => {
                        const sc = statusConfig[r.status] || statusConfig.CONFIRMED;
                        const start = new Date(r.startDate);
                        const end = new Date(r.endDate);
                        const isExpanded = expandedId === r.id;
                        return (
                          <div key={`${r.id}-${idx}`} className="border border-th rounded-2xl overflow-hidden">
                            {/* Collapsed header — always visible */}
                            <button
                              onClick={() => setExpandedId(isExpanded ? null : r.id)}
                              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-primary-500/5 transition text-left"
                            >
                              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${sc.dot}`} />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-th truncate">{r.boat?.name || 'Embarcação'}</p>
                                <p className="text-[11px] text-th-muted truncate">
                                  {start.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })} — {end.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })}
                                </p>
                              </div>
                              <span className={`flex-shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ${sc.color}`}>{sc.label}</span>
                              <ChevronDown size={14} className={`flex-shrink-0 text-th-muted transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                            </button>
                            {/* Expanded details */}
                            {isExpanded && (
                              <div className="px-4 pb-4 pt-1 border-t border-th space-y-2 bg-th-surface">
                                <div className="flex items-center gap-2">
                                  <User size={13} className="text-th-muted flex-shrink-0" />
                                  <span className="text-sm text-th-secondary">{r.user?.name || '-'}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Clock size={13} className="text-th-muted flex-shrink-0" />
                                  <span className="text-xs text-th-muted">
                                    {start.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' })} {start.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })} → {end.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' })} {end.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })}
                                  </span>
                                </div>
                                {r.notes && <p className="text-xs text-th-muted italic">{r.notes}</p>}
                                {(r.status === 'CONFIRMED' || r.status === 'PENDING') && (
                                  <button
                                    onClick={() => handleCancel(r.id)}
                                    className="mt-1 text-xs text-red-400 hover:text-red-600 font-medium transition"
                                  >Cancelar reserva</button>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <Calendar size={32} className="mx-auto text-th-muted mb-2" />
                      <p className="text-sm text-th-muted mb-3">Nenhuma reserva nos dias selecionados</p>
                    </div>
                  )}
                  {selectedDatesArray.length === 1 && (
                    <button
                      onClick={() => openCreate(selectedDatesArray[0])}
                      className="w-full mt-4 flex items-center justify-center gap-2 bg-primary-500/10 text-primary-500 py-2.5 rounded-lg text-sm font-medium hover:bg-primary-500/20 transition"
                    >
                      <Plus size={14} /> Nova reserva neste dia
                    </button>
                  )}
                </div>
              </>
            ) : (
              <div className="p-8 text-center">
                <Calendar size={48} className="mx-auto text-th-muted mb-3" />
                <p className="text-th-muted text-sm">Selecione um ou mais dias no calendário para ver as reservas</p>
              </div>
            )}

            {/* Legend */}
            <div className="p-4 border-t border-th bg-th-surface">
              <p className="text-[10px] uppercase tracking-wider text-th-muted font-semibold mb-2">Legenda</p>
              <div className="grid grid-cols-2 gap-1.5">
                {Object.entries(statusConfig).map(([, v]) => (
                  <div key={v.label} className="flex items-center gap-1.5">
                    <div className={`w-2 h-2 rounded-full ${v.dot}`} />
                    <span className="text-[11px] text-th-muted">{v.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Create Reservation Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-th-overlay flex items-center justify-center z-50 p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-th-card rounded-2xl shadow-xl w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-th">
              <h2 className="text-lg font-bold text-th">Nova Reserva</h2>
              <button onClick={() => setShowCreate(false)} className="p-1 hover:bg-primary-500/5 rounded-lg"><X size={20} className="text-th-muted" /></button>
            </div>
            <div className="p-6 space-y-4">
              {/* Boat searchable */}
              <div>
                <label className="block text-sm font-medium text-th-secondary mb-1">Embarcação *</label>
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-th-muted" />
                  <input
                    type="text"
                    placeholder="Buscar embarcação..."
                    value={boatSearch}
                    onChange={(e) => { setBoatSearch(e.target.value); setShowBoatDrop(true); if (!e.target.value) setForm((f) => ({ ...f, boatId: '' })); }}
                    onFocus={() => setShowBoatDrop(true)}
                    className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-th text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                  {showBoatDrop && (
                    <div className="absolute z-10 w-full mt-1 bg-th-card border border-th rounded-lg shadow-lg max-h-40 overflow-y-auto">
                      {boats.filter((b) => !boatSearch || b.name.toLowerCase().includes(boatSearch.toLowerCase()) || b.model.toLowerCase().includes(boatSearch.toLowerCase())).map((b) => (
                        <button key={b.id} type="button" onClick={() => { setForm((f) => ({ ...f, boatId: b.id })); setBoatSearch(`${b.name} — ${b.model}`); setShowBoatDrop(false); }}
                          className={`w-full text-left px-3 py-2.5 text-sm hover:bg-primary-500/10 flex items-center gap-2 ${form.boatId === b.id ? 'bg-primary-500/10 text-primary-500' : 'text-th-secondary'}`}>
                          <Ship size={14} className="text-th-muted" />
                          <span className="font-medium">{b.name}</span>
                          <span className="text-xs text-th-muted">— {b.model}</span>
                        </button>
                      ))}
                      {boats.filter((b) => !boatSearch || b.name.toLowerCase().includes(boatSearch.toLowerCase())).length === 0 && (
                        <p className="px-3 py-3 text-sm text-th-muted text-center">Nenhuma embarcação encontrada</p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* User searchable */}
              <div>
                <label className="block text-sm font-medium text-th-secondary mb-1">Cliente *</label>
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-th-muted" />
                  <input
                    type="text"
                    placeholder="Buscar cliente..."
                    value={userSearch}
                    onChange={(e) => { setUserSearch(e.target.value); setShowUserDrop(true); if (!e.target.value) setForm((f) => ({ ...f, userId: '' })); }}
                    onFocus={() => setShowUserDrop(true)}
                    className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-th text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                  {showUserDrop && (
                    <div className="absolute z-10 w-full mt-1 bg-th-card border border-th rounded-lg shadow-lg max-h-40 overflow-y-auto">
                      {users.filter((u) => !userSearch || u.name.toLowerCase().includes(userSearch.toLowerCase()) || u.email.toLowerCase().includes(userSearch.toLowerCase())).map((u) => (
                        <button key={u.id} type="button" onClick={() => { setForm((f) => ({ ...f, userId: u.id })); setUserSearch(`${u.name} — ${u.email}`); setShowUserDrop(false); }}
                          className={`w-full text-left px-3 py-2.5 text-sm hover:bg-primary-500/10 flex items-center gap-2 ${form.userId === u.id ? 'bg-primary-500/10 text-primary-500' : 'text-th-secondary'}`}>
                          <User size={12} className="text-th-muted" />
                          <div><p className="font-medium">{u.name}</p><p className="text-xs text-th-muted">{u.email}</p></div>
                        </button>
                      ))}
                      {users.filter((u) => !userSearch || u.name.toLowerCase().includes(userSearch.toLowerCase())).length === 0 && (
                        <p className="px-3 py-3 text-sm text-th-muted text-center">Nenhum cliente encontrado</p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-th-secondary mb-1">Data Início *</label>
                  <input type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-lg border border-th text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-th-secondary mb-1">Hora Entrada *</label>
                  <input type="time" value={form.startTime} onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-lg border border-th text-sm" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-th-secondary mb-1">Data Fim *</label>
                  <input type="date" value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-lg border border-th text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-th-secondary mb-1">Hora Saída *</label>
                  <input type="time" value={form.endTime} onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-lg border border-th text-sm" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-th-secondary mb-1">Observações</label>
                <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Observações opcionais..."
                  rows={2} className="w-full px-3 py-2.5 rounded-lg border border-th text-sm resize-none" />
              </div>
            </div>
            <div className="flex justify-end gap-3 p-6 border-t border-th">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2.5 rounded-lg border border-th text-sm font-medium text-th-secondary hover:bg-th-hover">Cancelar</button>
              <button onClick={handleCreate} disabled={saving || !form.boatId || !form.userId}
                className="px-4 py-2.5 rounded-lg bg-primary-500 text-white text-sm font-medium hover:bg-primary-600 transition disabled:opacity-50">
                {saving ? 'Criando...' : 'Criar Reserva'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
