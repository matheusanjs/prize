'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { Plus, X, ChevronLeft, ChevronRight, Clock, Ship, User, AlertCircle, Calendar, ArrowLeftRight, CheckCircle2, ChevronDown, ChevronUp, Sun, Wind } from 'lucide-react';
import { useAuth } from '@/contexts/auth';
import { getMyReservations, createReservation, cancelReservation, getShares, getBoatReservations, getBoatCalendar, getWeatherForecast, getWeatherHistory, createSwapRequest, confirmArrival, invalidateCache } from '@/services/api';
import { format, startOfMonth, endOfMonth, addMonths, subMonths, eachDayOfInterval, isSameDay, isToday, parseISO, isBefore, startOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import WeatherTimeline, { buildTimelineFromHistory, buildTimelineFromForecast } from '@/components/WeatherTimeline';
import { useReservationPolling } from '@/hooks/useReservationPolling';
import { saveCalendarCache, loadCalendarCache } from '@/utils/calendarCache';

interface ForecastDay {
  date: string;
  dayOfWeek: string;
  navigationLevel: string;
  navigationScore: number;
  windSpeedMin: number;
  windSpeedMax: number;
  airTempMin: number;
  airTempMax: number;
  clientSummary: string;
  humidity?: number;
  rainProbability?: number;
  description?: string;
  condition?: string;
}

interface Reservation {
  id: string;
  startDate: string;
  endDate: string;
  status: string;
  confirmedAt?: string | null;
  expectedArrivalTime?: string | null;
  boat?: { id: string; name: string };
  user?: { id: string; name: string; avatar?: string };
}

interface BoatOption { id: string; name: string; status?: string; }

interface WeatherHistoryItem {
  collectedAt: string;
  navigationLevel: string;
  clientSummary?: string;
  airTemperature?: number;
  windSpeed?: number;
  humidity?: number;
  precipitation?: number;
}

const API_ORIGIN = (process.env.NEXT_PUBLIC_API_URL || 'https://api.marinaprizeclub.com/api/v1').replace(/\/api\/v1$/, '');
function resolveMediaUrl(url: string | undefined | null): string {
  if (!url) return '';
  if (url.startsWith('/')) return `${API_ORIGIN}${url}`;
  return url;
}

const HOURS = ['10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'];

function getBoatLocationLabel(boatName: string) {
  if (/cabo frio|praia do forte/i.test(boatName)) return "Praia do Forte - Cabo Frio";
  if (/guarapari/i.test(boatName)) return "Guarapari";
  return "Praia do Forte - Cabo Frio";
}

export default function ReservationsPage() {
  const { user } = useAuth();
  const [boats, setBoats] = useState<BoatOption[]>([]);
  const [selectedBoatId, setSelectedBoatId] = useState<string>('');
  const [calendarReservations, setCalendarReservations] = useState<Reservation[]>([]);
  const [selectedDayReservations, setSelectedDayReservations] = useState<Reservation[]>([]);
  const [boatDayReservations, setBoatDayReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ boatId: '', startTime: '10:00', endTime: '17:00' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [forecastMap, setForecastMap] = useState<Record<string, ForecastDay>>({});
  const [weatherHistoryByDate, setWeatherHistoryByDate] = useState<Record<string, WeatherHistoryItem[]>>({});
  const [showSwap, setShowSwap] = useState(false);
  const [swapReservation, setSwapReservation] = useState<Reservation | null>(null);
  const [myFutureReservations, setMyFutureReservations] = useState<Reservation[]>([]);
  const [swapForm, setSwapForm] = useState({ offeredReservationId: '', message: '' });
  const [swapSaving, setSwapSaving] = useState(false);
  const [swapError, setSwapError] = useState('');
  const [reservationLimit, setReservationLimit] = useState<{ max: number; active: number } | null>(null);
  const [showConfirmArrival, setShowConfirmArrival] = useState(false);
  const [showWeatherChart, setShowWeatherChart] = useState(false);
  const [confirmReservation, setConfirmReservation] = useState<Reservation | null>(null);
  const [arrivalTime, setArrivalTime] = useState('10:00');
  const [confirmSaving, setConfirmSaving] = useState(false);
  const [confirmError, setConfirmError] = useState('');

  // Track the latest in-flight request key — ignore stale responses
  const dayResRequestRef = useRef<string | null>(null);
  const calendarRequestRef = useRef<string | null>(null);

  // ─── Load boats + weather + limit (parallel) ────────────────────────
  const [shareCache, setShareCache] = useState<any[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const userId = user?.id;

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    (async () => {
      const preselectedBoatId = typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search).get('boatId') || ''
        : '';
      try {
        // Run all independent calls in parallel
        const [sharesRes, forecastRes, weatherHistRes] = await Promise.allSettled([
          getShares({ userId }),
          getWeatherForecast(),
          (async () => {
            try {
              const monthStart = startOfMonth(new Date());
              const diffHours = Math.ceil((Date.now() - monthStart.getTime()) / 3600_000) + 24;
              const hours = Math.min(Math.max(diffHours, 24), 24 * 120);
              return await getWeatherHistory(hours);
            } catch { return { data: [] }; }
          })(),
        ]);

        // Process shares
        const shareList = sharesRes.status === 'fulfilled'
          ? (Array.isArray(sharesRes.value.data) ? sharesRes.value.data : sharesRes.value.data.data || [])
          : [];
        const boatList = shareList.map((s: { boat: { id: string; name: string; status?: string } }) => ({
          id: s.boat.id, name: s.boat.name, status: s.boat.status,
        }));
        setBoats(boatList);
        setShareCache(shareList);
        if (boatList.length > 0) {
          const initialBoatId = preselectedBoatId && boatList.some((b: BoatOption) => b.id === preselectedBoatId)
            ? preselectedBoatId
            : (boatList.find((b: BoatOption) => b.status === 'AVAILABLE') || boatList[0]).id;
          setSelectedBoatId(initialBoatId);
        }

        // Process forecast
        if (forecastRes.status === 'fulfilled') {
          const days: ForecastDay[] = Array.isArray(forecastRes.value.data) ? forecastRes.value.data : forecastRes.value.data.data || [];
          const map: Record<string, ForecastDay> = {};
          days.forEach(d => { map[d.date] = d; });
          setForecastMap(map);
        }

        // Process weather history
        if (weatherHistRes.status === 'fulfilled') {
          const list: WeatherHistoryItem[] = Array.isArray(weatherHistRes.value.data) ? weatherHistRes.value.data : weatherHistRes.value.data.data || [];
          const grouped: Record<string, WeatherHistoryItem[]> = {};
          list.forEach((item) => {
            const dateKey = format(new Date(item.collectedAt), 'yyyy-MM-dd');
            if (!grouped[dateKey]) grouped[dateKey] = [];
            grouped[dateKey].push(item);
          });
          setWeatherHistoryByDate(grouped);
        }
      } catch { /* empty */ } finally { setLoading(false); }
    })();
  }, [userId]);

  // ─── Reservation limit (after boat selected) ────────────────────────
  useEffect(() => {
    if (!selectedBoatId) return;
    (async () => {
      try {
        const share = shareCache.find((s: any) => s.boat?.id === selectedBoatId || s.boatId === selectedBoatId);
        const max = share?.maxReservations ?? 3;
        const myRes = await getMyReservations();
        const myList: Reservation[] = Array.isArray(myRes.data) ? myRes.data : myRes.data.data || [];
        const active = myList.filter(r =>
          (r.boat?.id === selectedBoatId) && ['CONFIRMED', 'PENDING'].includes(r.status) && new Date(r.endDate) >= new Date()
        ).length;
        setReservationLimit({ max, active });
      } catch { setReservationLimit(null); }
    })();
  }, [selectedBoatId, shareCache]);

  // ─── Calendar: instant clear on boat/month change, then fetch ────────────
  useEffect(() => {
    if (!selectedBoatId) return;
    // Immediately clear stale data so old boat's reservations don't linger
    setCalendarReservations([]);
    setSelectedDayReservations([]);
    setIsRefreshing(true);

    const month = currentMonth.getMonth() + 1;
    const year = currentMonth.getFullYear();
    const reqKey = `cal-${selectedBoatId}-${year}-${month}`;
    calendarRequestRef.current = reqKey;

    // Try cache first for instant display
    const cached = loadCalendarCache(selectedBoatId);
    if (cached && Array.isArray(cached)) {
      setCalendarReservations(cached as Reservation[]);
    }

    // Fetch fresh data
    getBoatCalendar(selectedBoatId, month, year)
      .then(({ data }) => {
        if (calendarRequestRef.current !== reqKey) return;
        const list = Array.isArray(data) ? data : data.data || [];
        setCalendarReservations(list);
        saveCalendarCache(list, selectedBoatId);
      })
      .catch(() => {
        // If fetch failed and we have no cache, keep the empty state
      })
      .finally(() => {
        if (calendarRequestRef.current === reqKey) setIsRefreshing(false);
      });
  }, [selectedBoatId, currentMonth]);

  // ─── Poll every 10 seconds for near-real-time sync ─────────────────
  useReservationPolling({
    enabled: !!selectedBoatId,
    intervalMs: 10_000,
    onPoll: useCallback(async () => {
      if (!selectedBoatId) return;
      const month = currentMonth.getMonth() + 1;
      const year = currentMonth.getFullYear();
      const reqKey = `cal-${selectedBoatId}-${year}-${month}`;
      calendarRequestRef.current = reqKey;
      try {
        const { data } = await getBoatCalendar(selectedBoatId, month, year);
        if (calendarRequestRef.current !== reqKey) return;
        const list = Array.isArray(data) ? data : data.data || [];
        setCalendarReservations(list);
        saveCalendarCache(list, selectedBoatId);
      } catch { /* keep cached data on error */ }
      // Also refresh selected day details if a date is selected
      if (selectedDate && selectedBoatId) {
        const dateStr = format(selectedDate, 'yyyy-MM-dd');
        try {
          const { data: dayData } = await getBoatReservations(selectedBoatId, dateStr);
          const dayList = Array.isArray(dayData) ? dayData : dayData.data || [];
          setSelectedDayReservations(dayList.filter((r: Reservation) => r.status !== 'CANCELLED'));
        } catch { /* keep existing */ }
      }
    }, [selectedBoatId, currentMonth, selectedDate]),
  });

  // Shared reload helper for mutations
  const loadCalendar = useCallback(async () => {
    if (!selectedBoatId) return;
    const month = currentMonth.getMonth() + 1;
    const year = currentMonth.getFullYear();
    const reqKey = `cal-${selectedBoatId}-${year}-${month}`;
    calendarRequestRef.current = reqKey;
    try {
      const { data } = await getBoatCalendar(selectedBoatId, month, year);
      if (calendarRequestRef.current !== reqKey) return;
      const list = Array.isArray(data) ? data : data.data || [];
      setCalendarReservations(list);
      saveCalendarCache(list, selectedBoatId);
    } catch { /* empty */ }
  }, [selectedBoatId, currentMonth]);

  // ─── Selected day reservations (NO debounce — fetch immediately) ────
  const loadSelectedDayReservations = useCallback(async (boatId: string, date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const key = `day-${boatId}-${dateStr}`;
    dayResRequestRef.current = key;
    try {
      const { data } = await getBoatReservations(boatId, dateStr);
      if (dayResRequestRef.current !== key) return;
      const list = Array.isArray(data) ? data : data.data || [];
      setSelectedDayReservations(list.filter((r: Reservation) => r.status !== 'CANCELLED'));
    } catch { setSelectedDayReservations([]); }
  }, []);

  useEffect(() => {
    if (!selectedBoatId || !selectedDate) {
      setSelectedDayReservations([]);
      return;
    }
    setShowWeatherChart(false);
    loadSelectedDayReservations(selectedBoatId, selectedDate);
  }, [selectedBoatId, selectedDate, loadSelectedDayReservations]);

  // ─── Create modal boat-day reservations ─────────────────────────────
  const loadBoatDayReservations = useCallback(async (boatId: string, date: Date) => {
    try {
      const dateStr = format(date, 'yyyy-MM-dd');
      const { data } = await getBoatReservations(boatId, dateStr);
      const list = Array.isArray(data) ? data : data.data || [];
      setBoatDayReservations(list);
    } catch { setBoatDayReservations([]); }
  }, []);

  useEffect(() => {
    if (showCreate && form.boatId && selectedDate) {
      loadBoatDayReservations(form.boatId, selectedDate);
    } else { setBoatDayReservations([]); }
  }, [showCreate, form.boatId, selectedDate, loadBoatDayReservations]);

  const days = eachDayOfInterval({ start: startOfMonth(currentMonth), end: endOfMonth(currentMonth) });
  const startDay = startOfMonth(currentMonth).getDay();

  // Memoized date-keyed reservation map
  const resByDate = useMemo(() => {
    const map = new Map<string, Reservation[]>();
    for (const r of calendarReservations) {
      if (r.status === 'CANCELLED') continue;
      const s = parseISO(r.startDate);
      const e = parseISO(r.endDate);
      let curY = s.getFullYear(), curM = s.getMonth(), curD = s.getDate();
      const eY = e.getFullYear(), eM = e.getMonth(), eD = e.getDate();
      while (curY < eY || (curY === eY && curM < eM) || (curY === eY && curM === eM && curD <= eD)) {
        const key = `${curY}-${String(curM + 1).padStart(2, '0')}-${String(curD).padStart(2, '0')}`;
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(r);
        curD++; if (curD > new Date(curY, curM + 1, 0).getDate()) { curD = 1; curM++; }
        if (curM > 11) { curM = 0; curY++; }
      }
    }
    return map;
  }, [calendarReservations]);

  const OPERATING_HOURS = 7;

  const getResForDay = useCallback((date: Date) => {
    const key = format(date, 'yyyy-MM-dd');
    return resByDate.get(key) || [];
  }, [resByDate]);

  const getDayAvailability = useCallback((date: Date): 'free' | 'partial' | 'full' => {
    const dayRes = getResForDay(date);
    if (dayRes.length === 0) return 'free';
    const bookedHours = new Set<number>();
    dayRes.forEach(r => {
      const sh = parseISO(r.startDate).getHours();
      const eh = parseISO(r.endDate).getHours();
      for (let h = Math.max(sh, 10); h < Math.min(eh, 17); h++) bookedHours.add(h);
    });
    return bookedHours.size >= OPERATING_HOURS ? 'full' : 'partial';
  }, [getResForDay]);

  const selectedDayRes = selectedDate ? selectedDayReservations : [];
  const selectedDayWeatherHistory = selectedDate
    ? weatherHistoryByDate[format(selectedDate, 'yyyy-MM-dd')] || []
    : [];
  const selectedBoat = boats.find(b => b.id === selectedBoatId);
  const selectedBoatLocation = getBoatLocationLabel(selectedBoat?.name || "");

  // Blocked hours for create modal
  const getBlockedHours = () => {
    const blocked = new Set<string>();
    boatDayReservations.forEach(r => {
      if (r.status === 'CANCELLED') return;
      const startH = parseInt(format(parseISO(r.startDate), 'HH'));
      const endH = parseInt(format(parseISO(r.endDate), 'HH'));
      for (let h = startH; h < endH; h++) blocked.add(`${String(h).padStart(2, '0')}:00`);
    });
    return blocked;
  };

  const blockedHours = getBlockedHours();
  const availableStartHours = HOURS.filter(h => h !== '17:00' && !blockedHours.has(h));

  const getAvailableEndHours = (startTime: string) => {
    const startH = parseInt(startTime);
    const endHours: string[] = [];
    for (let h = startH + 1; h <= 17; h++) {
      const hourStr = `${String(h).padStart(2, '0')}:00`;
      if (blockedHours.has(`${String(h - 1).padStart(2, '0')}:00`) && h - 1 !== startH) break;
      if (h < 17 && blockedHours.has(hourStr)) { endHours.push(hourStr); break; }
      endHours.push(hourStr);
    }
    return endHours;
  };

  const openCreate = (date?: Date) => {
    const d = date || selectedDate || new Date();
    setSelectedDate(d);
    setForm({ boatId: selectedBoatId || (boats.length === 1 ? boats[0].id : ''), startTime: '10:00', endTime: '17:00' });
    setError('');
    setShowCreate(true);
  };

  const handleCreate = async () => {
    if (!form.boatId || !selectedDate) return;
    setError('');
    const startH = parseInt(form.startTime);
    const endH = parseInt(form.endTime);
    if (endH <= startH) { setError('O horário de fim deve ser posterior ao início.'); return; }
    if (startH < 10 || endH > 17) { setError('Horário deve ser entre 10:00 e 17:00.'); return; }
    setSaving(true);
    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      await createReservation({
        boatId: form.boatId,
        startDate: new Date(`${dateStr}T${form.startTime}:00-03:00`).toISOString(),
        endDate: new Date(`${dateStr}T${form.endTime}:00-03:00`).toISOString(),
      });
      invalidateCache('/reservations');
      invalidateCache('calendar');
      invalidateCache('boat/');
      setShowCreate(false);
      await Promise.all([loadCalendar(), loadSelectedDayReservations(form.boatId, selectedDate)]);
      if (reservationLimit) setReservationLimit({ ...reservationLimit, active: reservationLimit.active + 1 });
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Erro ao criar reserva';
      setError(Array.isArray(msg) ? msg.join(', ') : msg);
    }
    setSaving(false);
  };

  const handleCancel = async (id: string) => {
    if (!confirm('Cancelar esta reserva?')) return;
    try {
      invalidateCache('/reservations');
      invalidateCache('calendar');
      invalidateCache('boat/');
      await cancelReservation(id);
      await Promise.all([loadCalendar(), loadSelectedDayReservations(selectedBoatId!, selectedDate!)]);
      if (reservationLimit && reservationLimit.active > 0) {
        setReservationLimit({ ...reservationLimit, active: reservationLimit.active - 1 });
      }
    } catch { /* empty */ }
  };

  const openConfirmArrival = (r: Reservation) => {
    setConfirmReservation(r);
    setArrivalTime(format(parseISO(r.startDate), 'HH:mm'));
    setConfirmError('');
    setShowConfirmArrival(true);
  };

  const handleConfirmArrival = async () => {
    if (!confirmReservation) return;
    setConfirmError('');
    setConfirmSaving(true);
    try {
      await confirmArrival(confirmReservation.id, arrivalTime);
      setShowConfirmArrival(false);
      await loadCalendar();
    } catch (err: any) {
      setConfirmError(err?.response?.data?.message || 'Erro ao confirmar presença');
    }
    setConfirmSaving(false);
  };

  const openSwap = async (r: Reservation) => {
    setSwapReservation(r);
    setSwapForm({ offeredReservationId: '', message: '' });
    setSwapError('');
    try {
      const { data } = await getMyReservations();
      const list: Reservation[] = Array.isArray(data) ? data : data.data || [];
      const boatId = r.boat?.id || selectedBoatId;
      const now = new Date();
      const filtered = list.filter(res =>
        res.boat?.id === boatId && res.status === 'CONFIRMED' && new Date(res.startDate) > now && res.id !== r.id
      );
      setMyFutureReservations(filtered);
    } catch { setMyFutureReservations([]); }
    setShowSwap(true);
  };

  const handleSwap = async () => {
    if (!swapReservation || !swapForm.offeredReservationId) return;
    setSwapError('');
    setSwapSaving(true);
    try {
      await createSwapRequest({
        targetReservationId: swapReservation.id,
        offeredReservationId: swapForm.offeredReservationId,
        message: swapForm.message || undefined,
      });
      setShowSwap(false);
      alert('Solicitação de troca enviada!');
    } catch (err: any) {
      setSwapError(err?.response?.data?.message || 'Erro ao solicitar troca');
    }
    setSwapSaving(false);
  };

  const statusColor: Record<string, string> = {
    CONFIRMED: 'bg-emerald-500', PENDING: 'bg-amber-400', CANCELLED: 'bg-red-400', COMPLETED: 'bg-sky-500', IN_USE: 'bg-primary-500',
  };
  const statusLabel: Record<string, string> = {
    CONFIRMED: 'Confirmada', PENDING: 'Pendente', CANCELLED: 'Cancelada', COMPLETED: 'Concluída', IN_USE: 'Em uso',
  };
  const statusDot: Record<string, string> = {
    CONFIRMED: 'bg-emerald-400', PENDING: 'bg-amber-400', IN_USE: 'bg-primary-400', COMPLETED: 'bg-sky-400',
  };

  const navLevelColor: Record<string, string> = {
    BOM: 'bg-emerald-400', ATENCAO: 'bg-amber-400', RUIM: 'bg-orange-500', PERIGOSO: 'bg-red-500',
  };
  const navLevelTextColor: Record<string, string> = {
    BOM: 'text-emerald-400', ATENCAO: 'text-amber-400', RUIM: 'text-orange-500', PERIGOSO: 'text-red-500',
  };
  const navLevelLabel: Record<string, string> = {
    BOM: 'Bom para navegação', ATENCAO: 'Atenção ao navegar', RUIM: 'Condições ruins', PERIGOSO: 'Perigoso',
  };

  return (
    <div className="py-4 space-y-4">
      {/* Boat selector */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full" />
        </div>
      ) : (
      <>
      {boats.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
          {boats.map(b => {
            const isAvailable = b.status === 'AVAILABLE';
            const isSelected = selectedBoatId === b.id;
            return (
              <button
                key={b.id}
                onClick={() => setSelectedBoatId(b.id)}
                className={`flex-shrink-0 px-5 py-2.5 rounded-2xl text-[13px] font-semibold tracking-wide transition-all duration-200 ${
                  isSelected
                    ? isAvailable
                      ? 'bg-gradient-to-r from-primary-500 to-primary-400 text-white shadow-[0_4px_14px_rgba(0,117,119,0.35)]'
                      : 'bg-gradient-to-r from-amber-500 to-amber-400 text-white shadow-[0_4px_14px_rgba(245,158,11,0.35)]'
                    : 'bg-[var(--card)] text-[var(--text-secondary)] border border-[var(--border)] hover:border-primary-500/30'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <Ship size={14} className={isSelected ? 'opacity-80' : 'opacity-40'} />
                  {b.name}{!isAvailable ? ` · ${b.status === 'MAINTENANCE' ? 'Manutenção' : 'Indisponível'}` : ''}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Weather for selected day */}
      {selectedDate && (() => {
        const dateKey = format(selectedDate, 'yyyy-MM-dd');
        const selectedForecast = forecastMap[dateKey];
        const timelineHours = selectedDayWeatherHistory.length > 0
          ? buildTimelineFromHistory(selectedDayWeatherHistory)
          : selectedForecast ? buildTimelineFromForecast(selectedForecast) : null;
        const timelineTitle = selectedDayWeatherHistory.length > 0 ? 'Dados registrados' : 'Previsão';
        const hasTimeline = timelineHours && timelineHours.some(h => h.temp != null || h.wind != null || h.rain != null);
        if (!hasTimeline) return null;
        const temps = timelineHours.map(h => h.temp).filter((v): v is number => v != null);
        const tempMin = temps.length ? Math.min(...temps) : '-';
        const tempMax = temps.length ? Math.max(...temps) : '-';
        const maxWind = Math.round(Math.max(...timelineHours.map(h => h.wind || 0)) * 3.6);
        const totalRain = timelineHours.reduce((s, h) => s + (h.rain || 0), 0);
        return (
          <div className="mb-2">
            <button
              onClick={() => setShowWeatherChart(!showWeatherChart)}
              className="relative w-full overflow-hidden bg-[var(--card)] rounded-2xl border border-[var(--border)] px-4 py-3.5 flex items-center gap-3.5 text-left transition-all duration-200 hover:border-primary-500/20 hover:shadow-[0_8px_24px_var(--weather-card-shadow)] active:scale-[0.995]"
            >
              {/* Icon */}
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-primary-500/15 to-primary-400/5 border border-primary-500/10 flex items-center justify-center flex-shrink-0">
                <Wind size={18} className="text-primary-500" />
              </div>
              {/* Content */}
              <div className="flex-1 min-w-0">
                <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--text-muted)] font-semibold mb-1.5">Clima do dia · {selectedBoatLocation}</p>
                {/* Stats row */}
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <Sun size={13} className="text-amber-400 flex-shrink-0" />
                    <span className="text-[13px] font-bold text-[var(--text)] tabular-nums">{tempMin ?? '-'}°–{tempMax ?? '-'}°</span>
                  </div>
                  <div className="w-px h-4 bg-[var(--border)]" />
                  <div className="flex items-center gap-1.5">
                    <Wind size={13} className="text-cyan-400 flex-shrink-0" />
                    <span className="text-[13px] font-bold text-[var(--text)] tabular-nums">{maxWind} km/h</span>
                  </div>
                  {totalRain > 0.5 && (
                    <>
                      <div className="w-px h-4 bg-[var(--border)]" />
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px]">🌧</span>
                        <span className="text-[12px] font-semibold text-[var(--text-muted)] tabular-nums">{totalRain.toFixed(1)}mm</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
              {/* Chevron */}
              <div className="text-[var(--text-muted)] flex-shrink-0">
                {showWeatherChart ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </div>
            </button>
            {showWeatherChart && (
              <div className="mt-2">
                <WeatherTimeline hours={timelineHours} title={timelineTitle} />
              </div>
            )}
          </div>
        );
      })()}

      {/* Calendar */}
      <div className="bg-[var(--card)] rounded-3xl border border-[var(--border)] overflow-hidden shadow-[0_2px_20px_var(--calendar-shadow)]">
        {/* Calendar header */}
        <div className="bg-gradient-to-r from-primary-600 via-primary-500 to-primary-400 px-4 py-3.5">
          <div className="flex items-center justify-between">
            <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="w-8 h-8 rounded-xl bg-white/15 hover:bg-white/25 flex items-center justify-center transition backdrop-blur-sm active:scale-95">
              <ChevronLeft size={16} className="text-white" />
            </button>
            <h2 className="font-bold text-white text-[15px] capitalize tracking-wide">
              {format(currentMonth, 'MMMM yyyy', { locale: ptBR })}
            </h2>
            <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="w-8 h-8 rounded-xl bg-white/15 hover:bg-white/25 flex items-center justify-center transition backdrop-blur-sm active:scale-95">
              <ChevronRight size={16} className="text-white" />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 mt-3">
            {['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'].map((d, i) => (
              <div key={i} className="text-center text-[9px] font-bold text-white/60 tracking-widest">{d}</div>
            ))}
          </div>
        </div>

        {/* Calendar grid */}
        <div className="px-3 py-3">
          <div className="grid grid-cols-7 gap-1.5">
            {Array.from({ length: startDay }).map((_, i) => <div key={`e-${i}`} className="aspect-square" />)}
            {days.map(day => {
              const dayRes = getResForDay(day);
              const isSelected = selectedDate && isSameDay(day, selectedDate);
              const today = isToday(day);
              const isPast = isBefore(day, startOfDay(new Date())) && !today;
              const dayForecast = forecastMap[format(day, 'yyyy-MM-dd')];
              const availability = getDayAvailability(day);
              const hasMine = dayRes.some(r => r.user?.id === user?.id);

              const cellBg = isPast ? 'bg-transparent'
                : hasMine ? 'bg-[#F98307]/20'
                : availability === 'free' ? 'bg-emerald-500/25'
                : availability === 'partial' ? 'bg-amber-400/25'
                : 'bg-red-500/25';

              const cellBorder = isPast ? 'border-transparent'
                : hasMine ? 'border-[#F98307]/50'
                : availability === 'free' ? 'border-emerald-500/50'
                : availability === 'partial' ? 'border-amber-500/50'
                : 'border-red-500/50';

              const weatherEmoji = dayForecast ? (
                dayForecast.navigationLevel === 'BOM' ? '☀️' : dayForecast.navigationLevel === 'ATENCAO' ? '⛅' : dayForecast.navigationLevel === 'RUIM' ? '🌊' : '⛔'
              ) : null;

              return (
                <button
                  key={day.toISOString()}
                  onClick={() => setSelectedDate(day)}
                  className={`relative aspect-square flex flex-col items-center justify-center rounded-xl text-[13px] font-semibold transition-all duration-150 border-[1.5px] ${
                    isSelected
                      ? 'bg-gradient-to-br from-primary-500 to-primary-600 text-white shadow-[0_6px_16px_rgba(0,117,119,0.35)] scale-[1.08] border-primary-400/40 z-10'
                      : today
                        ? `${cellBg} ${cellBorder} ${hasMine ? 'text-[#F98307]' : 'text-primary-500'} font-extrabold ring-[1.5px] ring-primary-500/40 ring-offset-1 ring-offset-[var(--card)]`
                        : isPast
                          ? 'text-[var(--text-muted)]/50 border-transparent opacity-40'
                          : `${cellBg} ${cellBorder} ${hasMine ? 'text-[#F98307] font-bold' : 'text-[var(--text)]'} hover:scale-[1.06] hover:bg-[var(--subtle-hover)] active:scale-[0.96]`
                  }`}
                >
                  {weatherEmoji && !isSelected && <span className="text-[7px] leading-none -mt-0.5 mb-[-2px]">{weatherEmoji}</span>}
                  <span>{day.getDate()}</span>
                  {isSelected && weatherEmoji && <span className="text-[7px] leading-none mt-[-2px]">{weatherEmoji}</span>}
                  {!isPast && !isSelected && (
                    <div className={`absolute bottom-[3px] left-1/2 -translate-x-1/2 w-[7px] h-[7px] rounded-full ${
                      hasMine ? 'bg-[#F98307] shadow-[0_0_3px_rgba(249,131,7,0.5)]'
                      : availability === 'free' ? 'bg-emerald-500 shadow-[0_0_3px_rgba(16,185,129,0.5)]' : availability === 'partial' ? 'bg-amber-500 shadow-[0_0_3px_rgba(245,158,11,0.5)]' : 'bg-red-500 shadow-[0_0_3px_rgba(239,68,68,0.5)]'
                    }`} />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Legend */}
        <div className="px-4 pb-3.5 pt-0.5">
          <div className="flex items-center justify-center gap-5 text-[10px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
            <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-[#F98307] shadow-[0_0_4px_rgba(249,131,7,0.4)]" />Minha</div>
            <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_4px_rgba(16,185,129,0.4)]" />Livre</div>
            <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-[0_0_4px_rgba(245,158,11,0.4)]" />Parcial</div>
            <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-[0_0_4px_rgba(239,68,68,0.4)]" />Ocupado</div>
          </div>
        </div>
      </div>

      {/* Selected day reservations */}
      {selectedDate && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-primary-500/15 to-primary-400/5 border border-primary-500/10 flex items-center justify-center">
                <Calendar size={18} className="text-primary-500" />
              </div>
              <div>
                <h3 className="text-[15px] font-bold text-[var(--text)]">
                  {format(selectedDate, "dd 'de' MMMM", { locale: ptBR })}
                </h3>
                <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                  {selectedDayRes.length === 0 ? 'Disponível o dia todo' : `${selectedDayRes.length} reserva${selectedDayRes.length > 1 ? 's' : ''}`}
                </p>
              </div>
            </div>
            {!isBefore(selectedDate, startOfDay(new Date())) && (
              boats.find(b => b.id === selectedBoatId)?.status === 'AVAILABLE' ? (() => {
                const hasOtherOnly = selectedDayRes.length > 0 && selectedDayRes.every(r => r.user?.id !== user?.id && r.status === 'CONFIRMED');
                const otherRes = hasOtherOnly ? selectedDayRes.find(r => r.user?.id !== user?.id && r.status === 'CONFIRMED' && !isBefore(parseISO(r.startDate), new Date())) : null;
                return hasOtherOnly && otherRes ? (
                  <button
                    onClick={() => openSwap(otherRes)}
                    className="text-[13px] text-white font-semibold flex items-center gap-1.5 bg-gradient-to-r from-primary-500 to-primary-400 px-4 py-2 rounded-xl shadow-[0_4px_12px_rgba(0,117,119,0.25)] active:scale-[0.97] transition-all"
                  >
                    <ArrowLeftRight size={15} strokeWidth={2.5} /> Trocar Data
                  </button>
                ) : (
                  <button
                    onClick={() => openCreate(selectedDate)}
                    className="text-[13px] text-white font-semibold flex items-center gap-1.5 bg-gradient-to-r from-primary-500 to-primary-400 px-4 py-2 rounded-xl shadow-[0_4px_12px_rgba(0,117,119,0.25)] active:scale-[0.97] transition-all"
                  >
                    <Plus size={15} strokeWidth={2.5} /> Reservar
                  </button>
                );
              })() : (
                <span className="text-xs text-amber-500/70 font-medium">Embarcação indisponível</span>
              )
            )}
          </div>
          {selectedDayRes.length === 0 ? (
            <div className="bg-[var(--card)] rounded-2xl p-8 border border-[var(--border)] text-center">
              <div className="w-14 h-14 bg-emerald-500/10 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <Ship size={26} className="text-emerald-400" />
              </div>
              <p className="text-sm font-medium text-[var(--text-secondary)]">Nenhuma reserva neste dia</p>
              <p className="text-[11px] text-[var(--text-muted)] mt-1">Todos os horários disponíveis</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {selectedDayRes.map(r => {
                const isMine = r.user?.id === user?.id;
                return (
                  <div key={r.id} className={`rounded-2xl p-4 border transition-all ${
                    isMine ? 'bg-[var(--card)] border-primary-500/20 shadow-[0_0_0_1px_rgba(0,117,119,0.06)]' : 'bg-[var(--card)] border-[var(--border)]'
                  }`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-2xl overflow-hidden flex items-center justify-center ${
                          isMine ? 'bg-gradient-to-br from-primary-500/15 to-primary-400/5' : 'bg-[var(--subtle)]'
                        }`}>
                          {r.user?.avatar ? (
                            <img src={resolveMediaUrl(r.user.avatar)} alt={r.user.name || ''} className="w-full h-full object-cover" />
                          ) : (
                            <User size={16} className={isMine ? 'text-primary-500' : 'text-[var(--text-muted)]'} />
                          )}
                        </div>
                        <div>
                          <p className="text-[14px] font-semibold text-[var(--text)]">
                            {isMine ? 'Você' : r.user?.name || 'Cotista'}
                          </p>
                          <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)] mt-0.5">
                            <Clock size={11} className="opacity-60" />
                            <span className="tabular-nums">{format(parseISO(r.startDate), 'HH:mm')} — {format(parseISO(r.endDate), 'HH:mm')}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${statusDot[r.status] || 'bg-[var(--text-muted)]'}`} />
                        <span className="text-[10px] font-medium text-[var(--text-muted)]">{statusLabel[r.status] || r.status}</span>
                      </div>
                    </div>
                    {isMine && r.confirmedAt && r.expectedArrivalTime && (
                      <div className="mt-3 flex items-center gap-2 bg-emerald-500/8 rounded-xl px-3 py-2 border border-emerald-500/12">
                        <CheckCircle2 size={13} className="text-emerald-500 flex-shrink-0" />
                        <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">Presença confirmada · Chegada: <strong>{r.expectedArrivalTime}</strong></span>
                      </div>
                    )}
                    {isMine && (r.status === 'CONFIRMED' || r.status === 'PENDING') && (
                      <div className="mt-3 flex gap-2 flex-wrap">
                        {!r.confirmedAt && isToday(selectedDate!) && (
                          <button
                            onClick={() => openConfirmArrival(r)}
                            className="text-[12px] text-white font-semibold bg-emerald-500 px-3.5 py-1.5 rounded-xl active:scale-[0.97] transition-all flex items-center gap-1.5 shadow-[0_2px_8px_rgba(16,185,129,0.25)]"
                          >
                            <CheckCircle2 size={13} /> Confirmar presença
                          </button>
                        )}
                        <button
                          onClick={() => handleCancel(r.id)}
                          className="text-[12px] text-red-500 font-medium bg-red-500/8 px-3.5 py-1.5 rounded-xl active:scale-[0.97] transition-all border border-red-500/12 hover:bg-red-500/12"
                        >
                          Cancelar
                        </button>
                      </div>
                    )}
                    {!isMine && r.status === 'CONFIRMED' && !isBefore(parseISO(r.startDate), new Date()) && (
                      <div className="mt-3">
                        <button
                          onClick={() => openSwap(r)}
                          className="text-[12px] text-primary-500 font-medium bg-primary-500/8 px-3.5 py-1.5 rounded-xl active:scale-[0.97] transition-all flex items-center gap-1.5 border border-primary-500/12 hover:bg-primary-500/12"
                        >
                          <ArrowLeftRight size={13} /> Trocar Data
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Create modal */}
      {showCreate && selectedDate && (
        <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-end" onClick={() => setShowCreate(false)}>
          <div className="bg-[var(--card)] w-full rounded-t-3xl p-6 max-h-[85vh] overflow-auto border-t border-[var(--border)]" onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 bg-[var(--text-muted)]/20 rounded-full mx-auto mb-5" />
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-bold text-[var(--text)]">Nova Reserva</h2>
                <p className="text-sm text-[var(--text-muted)] mt-0.5">
                  {format(selectedDate, "EEEE, dd 'de' MMMM", { locale: ptBR })}
                </p>
              </div>
              <button onClick={() => setShowCreate(false)} className="w-9 h-9 rounded-xl bg-[var(--subtle)] flex items-center justify-center hover:bg-[var(--subtle-hover)] transition">
                <X size={16} className="text-[var(--text-secondary)]" />
              </button>
            </div>
            {error && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-2xl text-sm text-red-400 flex items-start gap-2">
                <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}
            <div className="space-y-5">
              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">Embarcação</label>
                <select
                  value={form.boatId}
                  onChange={(e) => setForm({ ...form, boatId: e.target.value, startTime: '10:00', endTime: '17:00' })}
                  className="w-full px-4 py-3 rounded-xl border border-[var(--border)] text-sm text-[var(--text)] bg-[var(--subtle)] focus:bg-[var(--card)] focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500/40 transition outline-none"
                >
                  <option value="">Selecionar...</option>
                  {boats.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              {form.boatId && boatDayReservations.filter(r => r.status !== 'CANCELLED').length > 0 && (
                <div className="bg-amber-500/[0.06] border border-amber-400/15 rounded-2xl p-4">
                  <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 mb-2.5">Horários ocupados</p>
                  <div className="space-y-2">
                    {boatDayReservations.filter(r => r.status !== 'CANCELLED').map(r => (
                      <div key={r.id} className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300/80">
                        <Clock size={12} className="opacity-60" />
                        <span className="font-semibold tabular-nums">{format(parseISO(r.startDate), 'HH:mm')} — {format(parseISO(r.endDate), 'HH:mm')}</span>
                        <span className="text-amber-500/60 dark:text-amber-400/40">{r.user?.id === user?.id ? 'Você' : r.user?.name || 'Cotista'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">Início</label>
                  <select
                    value={form.startTime}
                    onChange={(e) => {
                      const st = e.target.value;
                      const endHours = getAvailableEndHours(st);
                      setForm({ ...form, startTime: st, endTime: endHours[endHours.length - 1] || '17:00' });
                    }}
                    className="w-full px-4 py-3 rounded-xl border border-[var(--border)] text-sm text-[var(--text)] bg-[var(--subtle)] focus:bg-[var(--card)] focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500/40 transition outline-none"
                  >
                    {availableStartHours.length === 0 ? (<option value="">Sem horário</option>) : availableStartHours.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">Fim</label>
                  <select
                    value={form.endTime}
                    onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-[var(--border)] text-sm text-[var(--text)] bg-[var(--subtle)] focus:bg-[var(--card)] focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500/40 transition outline-none"
                  >
                    {getAvailableEndHours(form.startTime).map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              </div>
              {availableStartHours.length === 0 && form.boatId && (
                <p className="text-sm text-red-500 text-center">Todos os horários estão ocupados neste dia.</p>
              )}
              <button
                onClick={handleCreate}
                disabled={saving || !form.boatId || availableStartHours.length === 0}
                className="w-full bg-gradient-to-r from-primary-500 to-primary-400 text-white py-3.5 rounded-xl font-semibold disabled:opacity-50 active:scale-[0.98] transition-all shadow-[0_4px_14px_rgba(0,117,119,0.3)]"
              >
                {saving ? 'Salvando...' : 'Confirmar Reserva'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm arrival modal */}
      {showConfirmArrival && confirmReservation && (
        <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-end" onClick={() => setShowConfirmArrival(false)}>
          <div className="bg-[var(--card)] w-full rounded-t-3xl p-6 max-h-[85vh] overflow-auto border-t border-[var(--border)]" onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 bg-[var(--text-muted)]/20 rounded-full mx-auto mb-5" />
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-bold text-[var(--text)]">Confirmar Presença</h2>
                <p className="text-sm text-[var(--text-muted)] mt-0.5">
                  {confirmReservation.boat?.name} · {format(parseISO(confirmReservation.startDate), "dd/MM 'às' HH:mm")} — {format(parseISO(confirmReservation.endDate), 'HH:mm')}
                </p>
              </div>
              <button onClick={() => setShowConfirmArrival(false)} className="w-9 h-9 rounded-xl bg-[var(--subtle)] flex items-center justify-center hover:bg-[var(--subtle-hover)] transition">
                <X size={16} className="text-[var(--text-secondary)]" />
              </button>
            </div>
            {confirmError && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-2xl text-sm text-red-400 flex items-start gap-2">
                <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
                <span>{confirmError}</span>
              </div>
            )}
            <div className="space-y-5">
              <div className="bg-emerald-500/[0.06] border border-emerald-500/12 rounded-2xl p-4">
                <p className="text-sm text-emerald-600 dark:text-emerald-400 font-medium mb-1">Confirmando sua presença hoje</p>
                <p className="text-xs text-[var(--text-muted)]">Informe o horário aproximado que você irá chegar à marina. A equipe será avisada para preparar o jet ski.</p>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">Horário previsto de chegada</label>
                <select
                  value={arrivalTime}
                  onChange={e => setArrivalTime(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-[var(--border)] text-sm text-[var(--text)] bg-[var(--subtle)] focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/40 transition outline-none"
                >
                  {HOURS.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
              <button
                onClick={handleConfirmArrival}
                disabled={confirmSaving}
                className="w-full bg-emerald-500 text-white py-3.5 rounded-xl font-semibold disabled:opacity-50 active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-[0_4px_14px_rgba(16,185,129,0.25)]"
              >
                {confirmSaving ? (
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <CheckCircle2 size={18} />
                )}
                {confirmSaving ? 'Confirmando...' : 'Confirmar Presença'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Swap modal */}
      {showSwap && swapReservation && (
        <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-end" onClick={() => setShowSwap(false)}>
          <div className="bg-[var(--card)] w-full rounded-t-3xl p-6 max-h-[85vh] overflow-auto border-t border-[var(--border)]" onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 bg-[var(--text-muted)]/20 rounded-full mx-auto mb-5" />
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-bold text-[var(--text)]">Trocar Data</h2>
                <p className="text-sm text-[var(--text-muted)] mt-0.5">
                  Reserva de {swapReservation.user?.name}: {format(parseISO(swapReservation.startDate), "dd/MM 'às' HH:mm")} — {format(parseISO(swapReservation.endDate), 'HH:mm')}
                </p>
              </div>
              <button onClick={() => setShowSwap(false)} className="w-9 h-9 rounded-xl bg-[var(--subtle)] flex items-center justify-center hover:bg-[var(--subtle-hover)] transition">
                <X size={16} className="text-[var(--text-secondary)]" />
              </button>
            </div>
            {swapError && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-2xl text-sm text-red-400 flex items-start gap-2">
                <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
                <span>{swapError}</span>
              </div>
            )}
            <div className="space-y-4">
              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">Oferecer sua reserva</label>
                {myFutureReservations.length === 0 ? (
                  <div className="bg-amber-500/[0.06] border border-amber-400/15 rounded-2xl p-4 text-sm text-amber-600 dark:text-amber-400">
                    Você não possui reservas futuras confirmadas para trocar.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {myFutureReservations.map(r => (
                      <button
                        key={r.id}
                        onClick={() => setSwapForm({ ...swapForm, offeredReservationId: r.id })}
                        className={`w-full text-left p-3.5 rounded-xl border transition-all ${
                          swapForm.offeredReservationId === r.id
                            ? 'border-primary-500/40 bg-primary-500/[0.06] shadow-[0_0_0_1px_rgba(0,117,119,0.1)]'
                            : 'border-[var(--border)] bg-[var(--subtle)] hover:border-primary-500/20'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                            swapForm.offeredReservationId === r.id ? 'bg-primary-500/20' : 'bg-[var(--subtle-hover)]'
                          }`}>
                            <Calendar size={14} className={swapForm.offeredReservationId === r.id ? 'text-primary-500' : 'text-[var(--text-muted)]'} />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-[var(--text)]">
                              {format(parseISO(r.startDate), "dd 'de' MMMM", { locale: ptBR })}
                            </p>
                            <div className="flex items-center gap-1 text-[11px] text-[var(--text-muted)]">
                              <Clock size={10} />
                              <span>{format(parseISO(r.startDate), 'HH:mm')} — {format(parseISO(r.endDate), 'HH:mm')}</span>
                            </div>
                          </div>
                          {swapForm.offeredReservationId === r.id && (
                            <div className="ml-auto w-5 h-5 rounded-full bg-primary-500 flex items-center justify-center">
                              <span className="text-white text-xs">✓</span>
                            </div>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">Mensagem (opcional)</label>
                <textarea
                  value={swapForm.message}
                  onChange={e => setSwapForm({ ...swapForm, message: e.target.value })}
                  placeholder="Ex: Gostaria de trocar a data..."
                  rows={2}
                  className="w-full px-4 py-3 rounded-xl border border-[var(--border)] text-sm text-[var(--text)] bg-[var(--subtle)] focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500/40 transition resize-none outline-none"
                />
              </div>
              <button
                onClick={handleSwap}
                disabled={swapSaving || !swapForm.offeredReservationId}
                className="w-full bg-gradient-to-r from-primary-500 to-primary-400 text-white py-3.5 rounded-xl font-semibold disabled:opacity-50 active:scale-[0.98] transition-all shadow-[0_4px_14px_rgba(0,117,119,0.3)]"
              >
                {swapSaving ? 'Enviando...' : 'Enviar Solicitação de Troca'}
              </button>
            </div>
          </div>
        </div>
      )}
      </>
      )}
    </div>
  );
}
