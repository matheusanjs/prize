'use client';

import { useEffect, useState, useRef } from 'react';
import { Ship, AlertTriangle, FileText, ArrowLeftRight, Check, X as XIcon, Calendar, Clock, Anchor, DollarSign, CheckCircle2, AlertCircle, MapPin, ChevronRight, Navigation, Sparkles, Users, Star } from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth';
import { getShares, getMyCharges, getPendingSwaps, respondToSwap, getMyReservations, confirmArrival, cancelReservation } from '@/services/api';
import { format, parseISO, isToday } from 'date-fns';
import api from '@/services/api';
import { useCachedState, hasCached } from '@/hooks/useCachedState';

interface Boat {
  id: string;
  name: string;
  model: string;
  length: number;
  year: number;
  registrationNumber: string;
  totalShares: number;
  monthlyFee: number;
  imageUrl?: string;
  notes?: string;
}

interface Share {
  id: string;
  shareNumber: number;
  boat: Boat;
}

interface Charge {
  id: string;
  status: string;
  boatId?: string;
  dueDate: string;
}

interface SwapRequest {
  id: string;
  status: string;
  message?: string;
  createdAt: string;
  reservation: {
    id: string;
    startDate: string;
    endDate: string;
    boat: { id: string; name: string };
    user: { id: string; name: string };
  };
  offeredReservation: {
    id: string;
    startDate: string;
    endDate: string;
    user: { id: string; name: string };
  };
  requester: { id: string; name: string };
}

export default function BoatsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [shares, setShares] = useCachedState<Share[]>('pc:boats:shares', []);
  const [chargesByBoat, setChargesByBoat] = useCachedState<Record<string, { overdue: number; pending: number }>>('pc:boats:chargesByBoat', {});
  const [pendingSwaps, setPendingSwaps] = useCachedState<SwapRequest[]>('pc:boats:pendingSwaps', []);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(() => !hasCached('pc:boats:shares'));

  // Confirm arrival state
  const [todayReservations, setTodayReservations] = useCachedState<any[]>('pc:boats:todayReservations', []);
  const [showConfirmArrival, setShowConfirmArrival] = useState(false);
  const [confirmReservation, setConfirmReservation] = useState<any | null>(null);
  const [arrivalTime, setArrivalTime] = useState('10:00');
  const [confirmSaving, setConfirmSaving] = useState(false);
  const [confirmError, setConfirmError] = useState('');
  const [highlightedTrips, setHighlightedTrips] = useCachedState<any[]>('pc:boats:highlightedTrips', []);
  const [activeTripIdx, setActiveTripIdx] = useState(0);
  const [activeCotaIdx, setActiveCotaIdx] = useState(0);
  const tripScrollRef = useRef<HTMLDivElement>(null);
  const cotaScrollRef = useRef<HTMLDivElement>(null);

  const HOURS = ['08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00'];
  const userId = user?.id;

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      // Run all independent API calls in parallel
      const [sharesRes, chargesRes, swapsRes, myResRes] = await Promise.allSettled([
        getShares({ userId }),
        getMyCharges(),
        getPendingSwaps(),
        getMyReservations(),
      ]);

      // Process shares
      const sharesData = sharesRes.status === 'fulfilled' ? sharesRes.value.data : undefined;
      const shareItems = Array.isArray(sharesData) ? sharesData : sharesData?.data || [];
      setShares(shareItems);

      // Process charges
      if (chargesRes.status === 'fulfilled') {
        const list: Charge[] = Array.isArray(chargesRes.value.data) ? chargesRes.value.data : chargesRes.value.data?.data || [];
        const grouped: Record<string, { overdue: number; pending: number }> = {};
        list.forEach((c: Charge) => {
          const bid = c.boatId || '_none';
          if (!grouped[bid]) grouped[bid] = { overdue: 0, pending: 0 };
          if (c.status === 'OVERDUE') grouped[bid].overdue++;
          if (c.status === 'PENDING') grouped[bid].pending++;
        });
        setChargesByBoat(grouped);
      }

      // Process swaps
      if (swapsRes.status === 'fulfilled') {
        setPendingSwaps(Array.isArray(swapsRes.value.data) ? swapsRes.value.data : swapsRes.value.data?.data || []);
      }

      // Process today's reservations
      if (myResRes.status === 'fulfilled') {
        const resData = myResRes.value.data;
        const resList = Array.isArray(resData) ? resData : resData.data || [];
        const todayRes = resList.filter((r: any) =>
          ['CONFIRMED', 'PENDING'].includes(r.status) &&
          isToday(parseISO(r.startDate))
        );
        setTodayReservations(todayRes);
      }

      // Fetch highlighted trips
      try {
        const { data } = await api.get('/social/trips');
        const trips = data.trips || [];
        setHighlightedTrips(trips.filter((t: any) => t.isHighlighted).slice(0, 5));
      } catch { /* silent */ }

      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const handleBoatClick = (boatId: string) => {
    router.push(`/reservations?boatId=${encodeURIComponent(boatId)}`);
  };

  const openConfirmArrival = (r: any) => {
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
      setTodayReservations(prev => prev.map(r =>
        r.id === confirmReservation.id ? { ...r, confirmedAt: new Date().toISOString(), expectedArrivalTime: arrivalTime } : r
      ));
    } catch (err: any) {
      setConfirmError(err?.response?.data?.message || 'Erro ao confirmar presença');
    }
    setConfirmSaving(false);
  };

  const handleDeclineReservation = async (r: any) => {
    if (!confirm('Tem certeza que deseja cancelar esta reserva?')) return;
    try {
      await cancelReservation(r.id, 'Cancelado pelo cotista');
      setTodayReservations(prev => prev.filter(res => res.id !== r.id));
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Erro ao cancelar reserva');
    }
  };

  const handleSwapRespond = async (swapId: string, accept: boolean) => {
    setRespondingId(swapId);
    try {
      await respondToSwap(swapId, accept);
      setPendingSwaps(prev => prev.filter(s => s.id !== swapId));
    } catch { alert('Erro ao responder solicitação'); }
    setRespondingId(null);
  };

  const handleTripScroll = () => {
    if (!tripScrollRef.current) return;
    const el = tripScrollRef.current;
    const idx = Math.round(el.scrollLeft / el.clientWidth);
    setActiveTripIdx(idx);
  };

  const handleCotaScroll = () => {
    if (!cotaScrollRef.current) return;
    const el = cotaScrollRef.current;
    const idx = Math.round(el.scrollLeft / el.clientWidth);
    setActiveCotaIdx(idx);
  };

  if (loading) {
    return (
      <div className="py-4 space-y-6 pb-4">
        {/* Shimmer loading */}
        <style dangerouslySetInnerHTML={{ __html: `
          @keyframes lxShimmer { 0% { background-position: -400px 0 } 100% { background-position: 400px 0 } }
          .lx-shimmer { background: linear-gradient(90deg, var(--subtle) 25%, var(--card) 50%, var(--subtle) 75%); background-size: 800px 100%; animation: lxShimmer 1.8s ease-in-out infinite; }
        `}} />
        <div className="h-[260px] rounded-3xl lx-shimmer" />
        <div className="h-6 w-36 rounded-xl lx-shimmer" />
        <div className="h-[220px] rounded-3xl lx-shimmer" />
        <div className="h-[220px] rounded-3xl lx-shimmer" />
      </div>
    );
  }

  const API_ORIGIN = (process.env.NEXT_PUBLIC_API_URL || 'https://api.marinaprizeclub.com/api/v1').replace(/\/api\/v1$/, '');
  function resolveMediaUrl(url: string | undefined | null): string {
    if (!url) return '';
    if (url.startsWith('/')) return `${API_ORIGIN}${url}`;
    return url;
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes lxFadeUp { from { opacity: 0; transform: translateY(18px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes lxShimmer { 0% { background-position: -400px 0 } 100% { background-position: 400px 0 } }
        @keyframes lxGlow { 0%, 100% { opacity: 0.5 } 50% { opacity: 1 } }
        @keyframes lxFloat { 0%, 100% { transform: translateY(0) } 50% { transform: translateY(-4px) } }
        .lx-fade { animation: lxFadeUp 0.6s ease-out both }
        .lx-fade-1 { animation-delay: 0.05s }
        .lx-fade-2 { animation-delay: 0.12s }
        .lx-fade-3 { animation-delay: 0.2s }
        .lx-fade-4 { animation-delay: 0.28s }
        .lx-gold { background: linear-gradient(135deg, #FFC857, #FFD98E, #FFC857); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
        .lx-gold-bg { background: linear-gradient(135deg, rgba(255,200,87,0.12), rgba(255,200,87,0.04)); border: 1px solid rgba(255,200,87,0.15); }
        .lx-glass { background: var(--card); backdrop-filter: blur(16px) saturate(1.4); -webkit-backdrop-filter: blur(16px) saturate(1.4); border: 1px solid var(--border); }
        .lx-card { background: var(--card); border: 1px solid var(--border); box-shadow: 0 8px 32px rgba(0,0,0,0.08), 0 1px 0 rgba(255,255,255,0.03) inset; }
        .lx-float { animation: lxFloat 4s ease-in-out infinite; }
      `}} />

      <div className="-mx-4 -mt-2 pb-4">

        {/* ── HERO TRIPS CAROUSEL ── */}
        {highlightedTrips.length > 0 && (
          <div className="lx-fade relative">
            <div
              ref={tripScrollRef}
              className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide"
              onScroll={handleTripScroll}
            >
              {highlightedTrips.map((trip: any, i: number) => {
                const photo = trip.photos?.[0]?.url;
                return (
                  <div
                    key={trip.id}
                    onClick={() => router.push(`/social?tripId=${trip.id}`)}
                    className="relative w-full h-[300px] overflow-hidden cursor-pointer active:scale-[0.985] transition-transform duration-300 snap-center flex-shrink-0"
                    style={{ minWidth: '100%' }}
                  >
                    {photo ? (
                      <Image
                        src={resolveMediaUrl(photo)}
                        alt=""
                        fill
                        className="object-cover scale-105"
                        sizes="100vw"
                        priority={i === 0}
                        loading={i === 0 ? 'eager' : 'lazy'}
                      />
                    ) : (
                      <div className="absolute inset-0 bg-gradient-to-br from-[#0A2540] via-[#0F3460] to-[#1A3A5C]" />
                    )}
                    <div className="absolute inset-0" style={{ background: 'linear-gradient(0deg, rgba(10,20,35,0.95) 0%, rgba(10,20,35,0.5) 35%, rgba(0,0,0,0.15) 60%, rgba(0,0,0,0.25) 100%)' }} />



                    <div className="absolute top-4 right-5">
                      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold text-white" style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(16px)' }}>
                        <Calendar size={10} /> {trip.date ? new Date(trip.date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).toUpperCase() : ''}
                      </div>
                    </div>

                    <div className="absolute bottom-0 left-0 right-0 px-5 pb-5">
                      <h1 className="text-[28px] font-black text-white leading-[1.1] tracking-tight" style={{ textShadow: '0 2px 20px rgba(0,0,0,0.5)' }}>
                        {trip.title}
                      </h1>
                      {trip.destination && (
                        <div className="flex items-center gap-1.5 mt-2">
                          <MapPin size={11} className="text-[#FFC857]" />
                          <span className="text-[12px] text-white/70 font-medium">{trip.destination}</span>
                        </div>
                      )}
                      {trip._count && (
                        <div className="flex items-center gap-3 mt-3">
                          <div className="flex items-center gap-1.5 text-[11px] text-white/50">
                            <Users size={11} /> {trip._count.participants} participante{trip._count.participants !== 1 ? 's' : ''}
                          </div>
                          <div className="flex items-center gap-1.5 text-[11px] text-white/50">
                            <Star size={11} /> {trip._count.likes} like{trip._count.likes !== 1 ? 's' : ''}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {highlightedTrips.length > 1 && (
              <div className="flex justify-center gap-1.5 mt-3">
                {highlightedTrips.map((_: any, i: number) => (
                  <div key={i} className={`h-1.5 rounded-full transition-all duration-300 ${i === activeTripIdx ? 'bg-[#FFC857] w-5' : 'bg-white/20 w-1.5'}`} />
                ))}
              </div>
            )}
          </div>
        )}


        {/* ── MINHAS COTAS ── */}
        <div className="px-5 mt-8">
          <div className="flex items-center gap-3 mb-5 lx-fade lx-fade-2">
            <div className="w-[3px] h-5 rounded-full bg-gradient-to-b from-[#FFC857] to-[#FFB020]" />
            <h2 className="text-[13px] font-black uppercase tracking-[0.15em] text-[var(--text)]">Minhas Cotas</h2>
            <div className="flex-1 h-px bg-gradient-to-r from-[var(--border)] to-transparent" />
          </div>

          {/* Pending swap requests */}
          {pendingSwaps.length > 0 && (
            <div className="space-y-3 mb-5 lx-fade lx-fade-2">
              {pendingSwaps.map(swap => {
                const isResponding = respondingId === swap.id;
                return (
                  <div key={swap.id} className="lx-card rounded-3xl p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
                        <ArrowLeftRight size={13} className="text-white" />
                      </div>
                      <span className="text-[10px] font-black text-amber-500 uppercase tracking-[0.15em]">Solicitação de Troca</span>
                    </div>
                    <p className="text-sm text-[var(--text)]">
                      <span className="font-bold">{swap.requester.name}</span>
                      <span className="text-[var(--text-muted)]"> quer trocar no </span>
                      <span className="font-semibold">{swap.reservation.boat.name}</span>
                    </p>
                    <div className="mt-3 rounded-2xl overflow-hidden" style={{ background: 'var(--subtle)', border: '1px solid var(--border)' }}>
                      <div className="p-3 flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-primary-500/10 flex items-center justify-center flex-shrink-0">
                          <Calendar size={15} className="text-primary-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-[0.15em]">Sua reserva</p>
                          <p className="text-sm font-bold text-[var(--text)]">
                            {new Date(swap.reservation.startDate).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                            <span className="font-normal text-[var(--text-muted)]"> · </span>
                            {new Date(swap.reservation.startDate).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} — {new Date(swap.reservation.endDate).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center px-4">
                        <div className="flex-1 h-px bg-[var(--border)]" />
                        <div className="mx-3 w-7 h-7 rounded-full bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center shadow-lg shadow-primary-500/25">
                          <ArrowLeftRight size={12} className="text-white rotate-90" />
                        </div>
                        <div className="flex-1 h-px bg-[var(--border)]" />
                      </div>
                      <div className="p-3 flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                          <Calendar size={15} className="text-amber-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-[0.15em]">Reserva de {swap.requester.name}</p>
                          <p className="text-sm font-bold text-primary-500">
                            {new Date(swap.offeredReservation.startDate).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                            <span className="font-normal text-[var(--text-muted)]"> · </span>
                            {new Date(swap.offeredReservation.startDate).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} — {new Date(swap.offeredReservation.endDate).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                    </div>
                    {swap.message && (
                      <p className="text-xs text-[var(--text-muted)] italic mt-3 px-1">&ldquo;{swap.message}&rdquo;</p>
                    )}
                    <div className="flex gap-2.5 mt-4">
                      <button onClick={() => handleSwapRespond(swap.id, true)} disabled={isResponding}
                        className="flex-1 bg-gradient-to-r from-emerald-500 to-emerald-400 text-white py-3 rounded-2xl text-sm font-bold flex items-center justify-center gap-1.5 active:scale-[0.97] transition-all disabled:opacity-50 shadow-lg shadow-emerald-500/20">
                        <Check size={15} strokeWidth={2.5} /> Aceitar
                      </button>
                      <button onClick={() => handleSwapRespond(swap.id, false)} disabled={isResponding}
                        className="flex-1 text-red-400 py-3 rounded-2xl text-sm font-bold flex items-center justify-center gap-1.5 active:scale-[0.97] transition-all disabled:opacity-50" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)' }}>
                        <XIcon size={15} strokeWidth={2.5} /> Recusar
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Boats / Cotas */}
          {shares.length === 0 ? (
            <div className="text-center py-20 lx-fade lx-fade-2">
              <div className="w-20 h-20 rounded-[28px] mx-auto mb-5 flex items-center justify-center lx-float" style={{ background: 'linear-gradient(135deg, rgba(0,194,168,0.08), rgba(0,117,119,0.04))', border: '1px solid rgba(0,194,168,0.1)' }}>
                <Anchor size={36} className="text-primary-500/30" />
              </div>
              <p className="text-sm font-semibold text-[var(--text-secondary)]">Nenhuma embarcação encontrada</p>
              <p className="text-xs text-[var(--text-muted)] mt-1">Entre em contato com a administração</p>
            </div>
          ) : (
            <>
              <div
                ref={cotaScrollRef}
                className={shares.length > 1 ? 'flex overflow-x-auto snap-x snap-mandatory scrollbar-hide -mx-5' : ''}
                onScroll={shares.length > 1 ? handleCotaScroll : undefined}
              >
                {shares.map((share, idx) => {
                  const boat = share.boat;
                  const isOwn = boat.notes?.startsWith('[PRÓPRIA]');
                  const boatCharges = chargesByBoat[boat.id] || { overdue: 0, pending: 0 };
                  const card = (
                    <div
                      className={`lx-card rounded-3xl overflow-hidden cursor-pointer active:scale-[0.985] transition-all duration-300 lx-fade lx-fade-${Math.min(idx + 2, 4)}`}
                      onClick={() => handleBoatClick(boat.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleBoatClick(boat.id); } }}
                    >
                      {/* Photo */}
                      {boat.imageUrl ? (
                        <div className="relative w-full h-48">
                          <Image src={resolveMediaUrl(boat.imageUrl)} alt={boat.name} fill className="object-cover" sizes="(max-width: 768px) 100vw, 50vw" priority={idx === 0} loading={idx === 0 ? 'eager' : 'lazy'} unoptimized={boat.imageUrl.startsWith('data:')} />
                          <div className="absolute inset-0" style={{ background: 'linear-gradient(0deg, rgba(10,20,35,0.9) 0%, rgba(10,20,35,0.2) 40%, transparent 70%)' }} />
                          <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(10,20,35,0.3) 0%, transparent 30%)' }} />
                          <div className="absolute top-3.5 right-3.5">
                            <span className={`text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-full ${
                              isOwn ? 'bg-blue-500/90 text-white shadow-lg shadow-blue-500/25' : 'bg-black/40 backdrop-blur-md text-white'
                            }`}>
                              {isOwn ? '✦ Própria' : `Cota#${boat.name}`}
                            </span>
                          </div>
                          <div className="absolute bottom-0 left-0 right-0 p-5">
                            <p className="text-[12px] text-white/50 font-medium">{boat.model} · {boat.year} · {boat.length}ft</p>
                          </div>
                        </div>
                      ) : (
                        <div className="relative w-full h-36 flex items-center justify-center" style={{ background: 'linear-gradient(135deg, rgba(0,194,168,0.06), rgba(0,117,119,0.02))' }}>
                          <Ship size={44} className="text-primary-500/15 lx-float" />
                          <div className="absolute top-3.5 right-3.5">
                            <span className={`text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-full ${
                              isOwn ? 'bg-blue-500/90 text-white' : 'lx-gold-bg lx-gold'
                            }`}>
                              {isOwn ? '✦ Própria' : `Cota#${boat.name}`}
                            </span>
                          </div>
                          <div className="absolute bottom-0 left-0 right-0 p-5">
                            <p className="text-[12px] text-[var(--text-muted)] font-medium">{boat.model} · {boat.year}</p>
                          </div>
                        </div>
                      )}

                      {/* KPI Stats */}
                      <div className="px-4 py-4">
                        <div className="flex gap-2.5">
                          {boatCharges.overdue > 0 && (
                            <div className="flex-1 rounded-2xl p-3 flex items-center gap-2.5" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.1)' }}>
                              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, rgba(239,68,68,0.15), rgba(239,68,68,0.05))' }}>
                                <AlertTriangle size={15} className="text-red-400" />
                              </div>
                              <div>
                                <p className="text-[18px] font-black text-red-400 leading-none">{boatCharges.overdue}</p>
                                <p className="text-[8px] font-bold text-red-400/60 uppercase tracking-[0.15em] mt-1">Vencida{boatCharges.overdue > 1 ? 's' : ''}</p>
                              </div>
                            </div>
                          )}
                          <div className="flex-1 rounded-2xl p-3 flex items-center gap-2.5" style={{ background: 'var(--subtle)', border: '1px solid var(--border)' }}>
                            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, rgba(0,194,168,0.1), rgba(0,194,168,0.03))' }}>
                              <FileText size={15} className="text-primary-500/70" />
                            </div>
                            <div>
                              <p className="text-[18px] font-black text-[var(--text)] leading-none">{boatCharges.pending}</p>
                              <p className="text-[8px] font-bold text-[var(--text-muted)] uppercase tracking-[0.15em] mt-1">Fatura{boatCharges.pending !== 1 ? 's' : ''}</p>
                            </div>
                          </div>
                          <div className="flex-1 rounded-2xl p-3 flex items-center gap-2.5" style={{ background: 'var(--subtle)', border: '1px solid var(--border)' }}>
                            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, rgba(255,200,87,0.12), rgba(255,200,87,0.04))' }}>
                              <DollarSign size={15} style={{ color: '#FFC857', opacity: 0.7 }} />
                            </div>
                            <div>
                              <p className="text-[15px] font-black text-[var(--text)] leading-none">R$ {Number(boat.monthlyFee || 0).toLocaleString('pt-BR')}</p>
                              <p className="text-[8px] font-bold text-[var(--text-muted)] uppercase tracking-[0.15em] mt-1">Mensal</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                  return shares.length > 1 ? (
                    <div key={share.id} className="flex-shrink-0 snap-center px-5" style={{ minWidth: '100%' }}>
                      {card}
                    </div>
                  ) : (
                    <div key={share.id}>{card}</div>
                  );
                })}
              </div>
              {shares.length > 1 && (
                <div className="flex justify-center gap-1.5 mt-4">
                  {shares.map((_: any, i: number) => (
                    <div key={i} className={`h-1.5 rounded-full transition-all duration-300 ${i === activeCotaIdx ? 'bg-[#FFC857] w-5' : 'bg-[var(--border)] w-1.5'}`} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Confirm arrival modal */}
        {showConfirmArrival && confirmReservation && (
          <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-md flex items-end" onClick={() => setShowConfirmArrival(false)}>
            <div className="w-full rounded-t-[28px] p-6 max-h-[85vh] overflow-auto lx-card" onClick={e => e.stopPropagation()}>
              <div className="w-10 h-1 bg-white/10 rounded-full mx-auto mb-5" />
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 className="text-lg font-black text-[var(--text)]">Confirmar Presença</h2>
                  <p className="text-sm text-[var(--text-muted)]">
                    {confirmReservation.boat?.name} · {format(parseISO(confirmReservation.startDate), "dd/MM 'às' HH:mm")} — {format(parseISO(confirmReservation.endDate), 'HH:mm')}
                  </p>
                </div>
                <button onClick={() => setShowConfirmArrival(false)} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'var(--subtle)' }}>
                  <XIcon size={16} className="text-[var(--text-secondary)]" />
                </button>
              </div>
              {confirmError && (
                <div className="mb-4 p-3 rounded-2xl text-sm text-red-400 flex items-start gap-2" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.12)' }}>
                  <AlertCircle size={16} className="mt-0.5 flex-shrink-0" /> <span>{confirmError}</span>
                </div>
              )}
              <div className="space-y-5">
                <div className="rounded-2xl p-4" style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.12)' }}>
                  <p className="text-sm text-emerald-400 font-semibold mb-1">Confirmando sua presença hoje</p>
                  <p className="text-xs text-[var(--text-muted)]">Informe o horário aproximado de chegada à marina. A equipe preparará o jet ski.</p>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-[0.15em] mb-2">Horário previsto de chegada</label>
                  <select value={arrivalTime} onChange={e => setArrivalTime(e.target.value)}
                    className="w-full px-4 py-3 rounded-2xl text-sm focus:ring-2 focus:ring-emerald-500/20 transition" style={{ background: 'var(--subtle)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                    {HOURS.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
                <button onClick={handleConfirmArrival} disabled={confirmSaving}
                  className="w-full bg-gradient-to-r from-emerald-500 to-emerald-400 text-white py-3.5 rounded-2xl font-bold disabled:opacity-50 active:scale-[0.98] transition-transform flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20">
                  {confirmSaving ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <CheckCircle2 size={18} />}
                  {confirmSaving ? 'Confirmando...' : 'Confirmar Presença'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Floating Weather Widget removed */}
      </div>
    </>
  );
}