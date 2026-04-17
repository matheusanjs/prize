'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { Plus, X, ChevronLeft, ChevronRight, Clock, Ship, User, AlertCircle, Calendar, ArrowLeftRight, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/contexts/auth';
import { getMyReservations, createReservation, cancelReservation, getShares, getAllBoatReservations, createSwapRequest, confirmArrival, invalidateCache } from '@/services/api';
import { format, startOfMonth, endOfMonth, addMonths, subMonths, eachDayOfInterval, isSameDay, isToday, parseISO, isBefore, startOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useReservationsRealtime } from '@/hooks/useReservationsRealtime';
import { handleApiError } from '@/lib/errors';

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

const API_ORIGIN = (process.env.NEXT_PUBLIC_API_URL || 'https://api.marinaprizeclub.com/api/v1').replace(/\/api\/v1$/, '');
function resolveMediaUrl(url: string | undefined | null): string {
  if (!url) return '';
  if (url.startsWith('/')) return `${API_ORIGIN}${url}`;
  return url;
}

const HOURS = ['10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'];

export default function ReservationsPage() {
  const { user } = useAuth();
  // Hydrate boats + selected boat from localStorage synchronously so the
  // UI has something to render BEFORE /shares resolves. This eliminates the
  // "empty page" flash when re-entering the route.
  const [boats, setBoats] = useState<BoatOption[]>(() => {
    if (typeof window === 'undefined') return [];
    try { return JSON.parse(localStorage.getItem('pc:reservations:boats') || '[]'); } catch { return []; }
  });
  const [selectedBoatId, setSelectedBoatId] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    try { return localStorage.getItem('pc:reservations:selectedBoatId') || ''; } catch { return ''; }
  });
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

  const [showSwap, setShowSwap] = useState(false);
  const [swapReservation, setSwapReservation] = useState<Reservation | null>(null);
  const [myFutureReservations, setMyFutureReservations] = useState<Reservation[]>([]);
  const [swapForm, setSwapForm] = useState({ offeredReservationId: '', message: '' });
  const [swapSaving, setSwapSaving] = useState(false);
  const [swapError, setSwapError] = useState('');
  const [reservationLimit, setReservationLimit] = useState<{ max: number; active: number } | null>(null);
  const [showConfirmArrival, setShowConfirmArrival] = useState(false);

  const [confirmReservation, setConfirmReservation] = useState<Reservation | null>(null);
  const [arrivalTime, setArrivalTime] = useState('10:00');
  const [confirmSaving, setConfirmSaving] = useState(false);
  const [confirmError, setConfirmError] = useState('');

  // Track the latest in-flight snapshot request — ignore stale responses
  const snapshotRequestRef = useRef<string | null>(null);

  // ─── Load boats + weather + limit (parallel) ────────────────────────
  const [shareCache, setShareCache] = useState<any[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const userId = user?.id;

  useEffect(() => {
    if (!userId) return;
    // Only show the full-page spinner if we have NOTHING cached — otherwise
    // the cached view is already visible and we just revalidate silently.
    const hasCachedBoats = boats.length > 0;
    if (!hasCachedBoats) setLoading(true);
    (async () => {
      const preselectedBoatId = typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search).get('boatId') || ''
        : '';
      try {
        // Run all independent calls in parallel
        const [sharesRes] = await Promise.allSettled([
          getShares({ userId }),
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
          // Preference order: ?boatId= → cached selection (if still valid) → first AVAILABLE → first.
          const cachedBoatId = selectedBoatId;
          const initialBoatId =
            (preselectedBoatId && boatList.some((b: BoatOption) => b.id === preselectedBoatId) && preselectedBoatId)
            || (cachedBoatId && boatList.some((b: BoatOption) => b.id === cachedBoatId) && cachedBoatId)
            || (boatList.find((b: BoatOption) => b.status === 'AVAILABLE') || boatList[0]).id;
          if (initialBoatId !== selectedBoatId) setSelectedBoatId(initialBoatId);
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

  // ─── Snapshot: load ALL reservations for the boat ONCE per boat change ─
  // After this, month navigation + day selection are instant (derived from state).
  // Refetch happens only on user actions (create/cancel/swap) or realtime events.
  //
  // Stale-while-revalidate: we persist the last successful snapshot per boat
  // in localStorage so subsequent entries to this page render INSTANTLY from
  // cache, and then reconcile with fresh server data in the background.
  const cacheKey = (boatId: string) => `pc:reservations:snapshot:${boatId}`;

  const readCachedSnapshot = useCallback((boatId: string): Reservation[] | null => {
    if (typeof window === 'undefined') return null;
    try {
      const raw = localStorage.getItem(cacheKey(boatId));
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed?.items)) return parsed.items as Reservation[];
      return null;
    } catch { return null; }
  }, []);

  const writeCachedSnapshot = useCallback((boatId: string, items: Reservation[]) => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(cacheKey(boatId), JSON.stringify({ items, savedAt: Date.now() }));
    } catch { /* quota or disabled storage — ignore */ }
  }, []);

  const loadSnapshot = useCallback(async () => {
    if (!selectedBoatId) return;
    const reqKey = `snap-${selectedBoatId}-${Date.now()}`;
    snapshotRequestRef.current = reqKey;
    try {
      const { data } = await getAllBoatReservations(selectedBoatId, { pastDays: 60, futureMonths: 12 });
      if (snapshotRequestRef.current !== reqKey) return;
      const list: Reservation[] = Array.isArray(data) ? data : data.data || [];
      setCalendarReservations(list);
      writeCachedSnapshot(selectedBoatId, list);
    } catch {
      // Keep previous (possibly cached) data on error
    }
  }, [selectedBoatId, writeCachedSnapshot]);

  useEffect(() => {
    if (!selectedBoatId) return;
    // 1) Hydrate from cache synchronously — no empty state, no delay.
    const cached = readCachedSnapshot(selectedBoatId);
    if (cached && cached.length > 0) {
      setCalendarReservations(cached);
      setIsRefreshing(true);
      // 2) Revalidate in background; any diff silently updates the UI.
      loadSnapshot().finally(() => setIsRefreshing(false));
    } else {
      // No cache — show empty + fetch.
      setCalendarReservations([]);
      setIsRefreshing(true);
      loadSnapshot().finally(() => setIsRefreshing(false));
    }
  }, [selectedBoatId, loadSnapshot, readCachedSnapshot]);

  // Persist optimistic/realtime mutations to cache so next entry stays fresh
  useEffect(() => {
    if (!selectedBoatId) return;
    if (calendarReservations.length === 0) return;
    writeCachedSnapshot(selectedBoatId, calendarReservations);
  }, [selectedBoatId, calendarReservations, writeCachedSnapshot]);

  // Persist boats list + selected boat so the next entry hydrates instantly
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (boats.length === 0) return;
    try { localStorage.setItem('pc:reservations:boats', JSON.stringify(boats)); } catch { /* ignore */ }
  }, [boats]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!selectedBoatId) return;
    try { localStorage.setItem('pc:reservations:selectedBoatId', selectedBoatId); } catch { /* ignore */ }
  }, [selectedBoatId]);

  // ─── Realtime WebSocket sync — instant peer updates (<100ms) ───────
  const authToken = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  useReservationsRealtime({
    boatId: selectedBoatId || null,
    token: authToken,
    onCreated: useCallback((e: any) => {
      const r: Reservation | undefined = e.reservation;
      if (!r) return;
      setCalendarReservations(prev => {
        // Dedup: skip if already present (e.g. the creator's own optimistic update)
        if (prev.some(x => x.id === r.id)) return prev;
        // Replace any optimistic placeholder matching same time window + user
        const cleaned = prev.filter(x => !(x.id.startsWith('optimistic-') && x.startDate === r.startDate && x.endDate === r.endDate));
        return [...cleaned, r];
      });
      // If the event falls on the selected day, update day list too
      if (selectedDate) {
        const key = format(selectedDate, 'yyyy-MM-dd');
        const sKey = format(parseISO(r.startDate), 'yyyy-MM-dd');
        if (sKey === key) {
          setSelectedDayReservations(prev => {
            if (prev.some(x => x.id === r.id)) return prev;
            const cleaned = prev.filter(x => !(x.id.startsWith('optimistic-') && x.startDate === r.startDate && x.endDate === r.endDate));
            return [...cleaned, r];
          });
        }
      }
    }, [selectedDate]),
    onCancelled: useCallback((e: any) => {
      const r: Reservation | undefined = e.reservation;
      if (!r) return;
      setCalendarReservations(prev => prev.filter(x => x.id !== r.id));
      setSelectedDayReservations(prev => prev.filter(x => x.id !== r.id));
    }, []),
    onUpdated: useCallback((e: any) => {
      const r: Reservation | undefined = e.reservation;
      if (!r) return;
      setCalendarReservations(prev => prev.map(x => x.id === r.id ? { ...x, ...r } : x));
      setSelectedDayReservations(prev => prev.map(x => x.id === r.id ? { ...x, ...r } : x));
    }, []),
    onSwapAccepted: useCallback(() => {
      // Swap changes two rows — safest path: reload snapshot
      loadSnapshot();
    }, [loadSnapshot]),
  });

  // ─── Derive selected day reservations from the snapshot (zero-latency) ───
  // When the user taps a date, we just filter the already-loaded data.
  useEffect(() => {
    if (!selectedBoatId || !selectedDate) {
      setSelectedDayReservations([]);
      return;
    }
    const key = format(selectedDate, 'yyyy-MM-dd');
    const dayList = calendarReservations.filter((r) => {
      if (r.status === 'CANCELLED') return false;
      const s = parseISO(r.startDate);
      const e = parseISO(r.endDate);
      let curY = s.getFullYear(), curM = s.getMonth(), curD = s.getDate();
      const eY = e.getFullYear(), eM = e.getMonth(), eD = e.getDate();
      while (curY < eY || (curY === eY && curM < eM) || (curY === eY && curM === eM && curD <= eD)) {
        const k = `${curY}-${String(curM + 1).padStart(2, '0')}-${String(curD).padStart(2, '0')}`;
        if (k === key) return true;
        curD++; if (curD > new Date(curY, curM + 1, 0).getDate()) { curD = 1; curM++; }
        if (curM > 11) { curM = 0; curY++; }
      }
      return false;
    });
    setSelectedDayReservations(dayList);
  }, [selectedBoatId, selectedDate, calendarReservations]);

  // ─── Create modal: boat-day reservations are also derived from snapshot ───
  useEffect(() => {
    if (showCreate && form.boatId && selectedDate) {
      const key = format(selectedDate, 'yyyy-MM-dd');
      const list = calendarReservations.filter((r) => {
        if (r.status === 'CANCELLED') return false;
        const s = parseISO(r.startDate);
        const sKey = format(s, 'yyyy-MM-dd');
        return sKey === key;
      });
      setBoatDayReservations(list);
    } else {
      setBoatDayReservations([]);
    }
  }, [showCreate, form.boatId, selectedDate, calendarReservations]);

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
  const selectedBoat = boats.find(b => b.id === selectedBoatId);

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

    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    const startIso = new Date(`${dateStr}T${form.startTime}:00-03:00`).toISOString();
    const endIso = new Date(`${dateStr}T${form.endTime}:00-03:00`).toISOString();

    // OPTIMISTIC UPDATE — show the reservation immediately (<16ms)
    const tempId = `optimistic-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const boatName = boats.find(b => b.id === form.boatId)?.name;
    const optimistic: Reservation = {
      id: tempId,
      startDate: startIso,
      endDate: endIso,
      status: 'CONFIRMED',
      boat: { id: form.boatId, name: boatName || '' },
      user: user ? { id: user.id, name: user.name || 'Você', avatar: (user as any).avatar } : undefined,
    };
    const prevCalendar = calendarReservations;
    const prevDay = selectedDayReservations;
    const prevLimit = reservationLimit;
    setCalendarReservations([...calendarReservations, optimistic]);
    setSelectedDayReservations([...selectedDayReservations, optimistic]);
    if (reservationLimit) setReservationLimit({ ...reservationLimit, active: reservationLimit.active + 1 });
    setShowCreate(false);
    setSaving(true);

    try {
      const { data } = await createReservation({ boatId: form.boatId, startDate: startIso, endDate: endIso });
      const created: Reservation | undefined = data?.data || data;
      if (created?.id) {
        // Replace optimistic entry with the real one
        setCalendarReservations(prev => prev.map(r => r.id === tempId ? created : r));
        setSelectedDayReservations(prev => prev.map(r => r.id === tempId ? created : r));
      }
      invalidateCache('/reservations');
      invalidateCache('calendar');
      invalidateCache('boat/');
      // Background refresh (non-blocking) to reconcile with server truth
      loadSnapshot();
    } catch (err: any) {
      // ROLLBACK on failure
      setCalendarReservations(prevCalendar);
      setSelectedDayReservations(prevDay);
      setReservationLimit(prevLimit);
      const msg = err?.response?.data?.message || 'Erro ao criar reserva';
      setError(Array.isArray(msg) ? msg.join(', ') : msg);
      setShowCreate(true); // reopen modal so user sees error
    }
    setSaving(false);
  };

  const handleCancel = async (id: string) => {
    if (!confirm('Cancelar esta reserva?')) return;

    // OPTIMISTIC UPDATE — remove immediately
    const prevCalendar = calendarReservations;
    const prevDay = selectedDayReservations;
    const prevLimit = reservationLimit;
    setCalendarReservations(prev => prev.filter(r => r.id !== id));
    setSelectedDayReservations(prev => prev.filter(r => r.id !== id));
    if (reservationLimit && reservationLimit.active > 0) {
      setReservationLimit({ ...reservationLimit, active: reservationLimit.active - 1 });
    }

    try {
      await cancelReservation(id);
      invalidateCache('/reservations');
      invalidateCache('calendar');
      invalidateCache('boat/');
      // Background refresh to reconcile
      loadSnapshot();
    } catch {
      // ROLLBACK on failure
      setCalendarReservations(prevCalendar);
      setSelectedDayReservations(prevDay);
      setReservationLimit(prevLimit);
      handleApiError(null, 'Não foi possível cancelar a reserva. Tente novamente.');
    }
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
      await loadSnapshot();
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

              return (
                <button
                  key={day.toISOString()}
                  onClick={() => setSelectedDate(day)}
                  className={`relative aspect-square flex flex-col items-center justify-center rounded-xl text-[13px] font-semibold transition-all duration-150 border-[1.5px] ${
                    isSelected
                      ? `${cellBg} ${cellBorder} ${hasMine ? 'text-[#F98307] font-bold' : isPast ? 'text-[var(--text-muted)]/50 opacity-60' : 'text-[var(--text)]'} scale-[1.08] ring-2 ring-primary-500 ring-offset-2 ring-offset-[var(--card)] z-10 shadow-[0_4px_12px_rgba(0,117,119,0.2)]`
                      : today
                        ? `${cellBg} ${cellBorder} ${hasMine ? 'text-[#F98307]' : 'text-primary-500'} font-extrabold ring-[1.5px] ring-primary-500/40 ring-offset-1 ring-offset-[var(--card)]`
                        : isPast
                          ? 'text-[var(--text-muted)]/50 border-transparent opacity-40'
                          : `${cellBg} ${cellBorder} ${hasMine ? 'text-[#F98307] font-bold' : 'text-[var(--text)]'} hover:scale-[1.06] hover:bg-[var(--subtle-hover)] active:scale-[0.96]`
                  }`}
                >
                  <span>{day.getDate()}</span>
                  {!isPast && (
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
          </div>
          {selectedDayRes.length === 0 ? (
            <div className="bg-[var(--card)] rounded-2xl p-8 border border-[var(--border)] text-center">
              <p className="text-sm font-medium text-[var(--text-secondary)]">Nenhuma reserva neste dia</p>
              <p className="text-[11px] text-[var(--text-muted)] mt-1">Todos os horários disponíveis</p>
              {!isBefore(selectedDate, startOfDay(new Date())) && boats.find(b => b.id === selectedBoatId)?.status === 'AVAILABLE' && (
                <button
                  onClick={() => openCreate(selectedDate)}
                  className="mt-5 w-full text-[14px] text-white font-semibold flex items-center justify-center gap-2 bg-gradient-to-r from-primary-500 to-primary-400 py-3 rounded-2xl shadow-[0_4px_16px_rgba(0,117,119,0.3)] active:scale-[0.97] transition-all"
                >
                  <Plus size={18} strokeWidth={2.5} /> Reservar este dia
                </button>
              )}
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
                            <img loading="lazy" decoding="async" src={resolveMediaUrl(r.user.avatar)} alt={r.user.name || ''} className="w-full h-full object-cover" />
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
                      <div className="mt-3 space-y-2">
                        <p className="text-[11px] text-emerald-500 text-center font-medium">
                          Reserva confirmada para você
                        </p>
                        {!r.confirmedAt && isToday(selectedDate!) && (
                          <button
                            onClick={() => openConfirmArrival(r)}
                            className="w-full text-[13px] text-white font-semibold bg-emerald-500 py-2.5 rounded-xl active:scale-[0.97] transition-all flex items-center justify-center gap-2 shadow-[0_3px_12px_rgba(16,185,129,0.25)]"
                          >
                            <CheckCircle2 size={15} /> Confirmar presença
                          </button>
                        )}
                        <button
                          onClick={() => handleCancel(r.id)}
                          className="w-full text-[13px] text-red-500 font-semibold bg-red-500/10 py-2.5 rounded-xl active:scale-[0.97] transition-all border border-red-500/15 hover:bg-red-500/15 flex items-center justify-center gap-2"
                        >
                          <X size={15} strokeWidth={2.5} /> Cancelar reserva
                        </button>
                      </div>
                    )}
                    {!isMine && r.status === 'CONFIRMED' && !isBefore(parseISO(r.startDate), new Date()) && (
                      <div className="mt-3">
                        <p className="text-[11px] text-[var(--text-muted)] mb-2 text-center">
                          Solicite uma troca de data com o cotista
                        </p>
                        <button
                          onClick={() => openSwap(r)}
                          className="w-full text-[13px] text-primary-500 font-semibold bg-primary-500/10 py-2.5 rounded-xl active:scale-[0.97] transition-all flex items-center justify-center gap-2 border border-primary-500/15 hover:bg-primary-500/15"
                        >
                          <ArrowLeftRight size={15} /> Trocar Data
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
