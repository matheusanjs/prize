'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import {
  Ship, AlertTriangle, ArrowLeftRight, Check, X as XIcon,
  Calendar, Anchor, CheckCircle2, AlertCircle,
  MapPin, Users, Star, Wind, Droplets, Sun,
  Cloud, CloudRain, CloudLightning, CloudSnow, CloudDrizzle, CloudFog,
  Thermometer,
} from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth';
import {
  getShares, getMyCharges, getPendingSwaps, respondToSwap,
  getMyReservations, confirmArrival, cancelReservation, getWeatherCurrent,
} from '@/services/api';
import { format, parseISO, isToday, differenceInCalendarDays } from 'date-fns';
import api from '@/services/api';
import { useCachedState, hasCached } from '@/hooks/useCachedState';
import ReservationsManager from '@/components/ReservationsManager';

/* ═══ Types ═══ */
interface Boat {
  id: string; name: string; model: string; length: number; year: number;
  registrationNumber: string; totalShares: number; monthlyFee: number;
  imageUrl?: string; notes?: string; fuelType?: string; capacity?: number;
}
interface Share { id: string; shareNumber: number; boat: Boat; }
interface Charge { id: string; status: string; boatId?: string; dueDate: string; }
interface SwapRequest {
  id: string; status: string; message?: string; createdAt: string;
  reservation: { id: string; startDate: string; endDate: string; boat: { id: string; name: string }; user: { id: string; name: string } };
  offeredReservation: { id: string; startDate: string; endDate: string; user: { id: string; name: string } };
  requester: { id: string; name: string };
}
interface Weather { temp: number; code: number; wind: number; humidity?: number; }

/* ═══ Marina coordinates (Angra dos Reis default) ═══ */
const MARINA_LAT = -22.97;
const MARINA_LNG = -44.32;

/* ═══ Weather helpers ═══ */
function weatherIcon(code: number) {
  if (code === 0) return <Sun size={14} className="text-amber-400" />;
  if (code <= 3) return <Cloud size={14} className="text-slate-400" />;
  if (code <= 48) return <CloudFog size={14} className="text-slate-400" />;
  if (code <= 55) return <CloudDrizzle size={14} className="text-blue-400" />;
  if (code <= 65) return <CloudRain size={14} className="text-blue-400" />;
  if (code <= 75) return <CloudSnow size={14} className="text-blue-200" />;
  if (code <= 82) return <CloudRain size={14} className="text-blue-500" />;
  return <CloudLightning size={14} className="text-amber-400" />;
}
function weatherLabel(code: number) {
  if (code === 0) return 'Céu limpo';
  if (code <= 3) return 'Parcial';
  if (code <= 48) return 'Nublado';
  if (code <= 55) return 'Garoa';
  if (code <= 65) return 'Chuva';
  if (code <= 75) return 'Neve';
  if (code <= 82) return 'Pancadas';
  return 'Trovoada';
}

export default function BoatsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [shares, setShares] = useCachedState<Share[]>('pc:boats:shares', []);
  const [chargesByBoat, setChargesByBoat] = useCachedState<Record<string, { overdue: number; pending: number }>>('pc:boats:chargesByBoat', {});
  const [pendingSwaps, setPendingSwaps] = useCachedState<SwapRequest[]>('pc:boats:pendingSwaps', []);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(() => !hasCached('pc:boats:shares') && !hasCached('pc:boats:highlightedTrips'));

  const [todayReservations, setTodayReservations] = useCachedState<any[]>('pc:boats:todayReservations', []);
  const [showConfirmArrival, setShowConfirmArrival] = useState(false);
  const [confirmReservation, setConfirmReservation] = useState<any | null>(null);
  const [arrivalTime, setArrivalTime] = useState('10:00');
  const [confirmSaving, setConfirmSaving] = useState(false);
  const [confirmError, setConfirmError] = useState('');
  const [highlightedTrips, setHighlightedTrips] = useCachedState<any[]>('pc:boats:highlightedTrips', []);
  const [tripsLoaded, setTripsLoaded] = useState(() => hasCached('pc:boats:highlightedTrips'));
  const [activeTripIdx, setActiveTripIdx] = useState(0);
  const [activeCotaIdx, setActiveCotaIdx] = useState(0);
  const [weather, setWeather] = useCachedState<Weather | null>('pc:boats:weather', null);
  const tripScrollRef = useRef<HTMLDivElement>(null);
  const cotaScrollRef = useRef<HTMLDivElement>(null);

  const HOURS = ['08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00'];
  const userId = user?.id;

  /* ═══ Weather fetch ═══ */
  useEffect(() => {
    const fetchWeather = async () => {
      // 1) Try backend (authenticated, cached, hgbrasil) — primary source
      try {
        const { data } = await getWeatherCurrent();
        const w = data?.data || data;
        if (w && typeof w.airTemperature === 'number') {
          // Map cloudCover/precipitation → simple WMO-ish weather code
          const cc = Number(w.cloudCover ?? 0);
          const precip = Number(w.precipitation ?? 0);
          let code = 0;
          if (precip > 5) code = 65;       // heavy rain
          else if (precip > 0) code = 51;  // drizzle
          else if (cc > 75) code = 3;      // overcast
          else if (cc > 25) code = 2;      // partly cloudy
          else code = 0;                   // clear
          setWeather({
            temp: Math.round(Number(w.airTemperature)),
            code,
            wind: Math.round(Number(w.windSpeed ?? 0) * 3.6), // m/s → km/h
            humidity: w.humidity != null ? Math.round(Number(w.humidity)) : undefined,
          });
          return;
        }
      } catch { /* fall through to public fallback */ }

      // 2) Public fallback (Open-Meteo) — works for unauthenticated state
      try {
        const r = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${MARINA_LAT}&longitude=${MARINA_LNG}&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m&timezone=America/Sao_Paulo`
        );
        const d = await r.json();
        if (d?.current) {
          setWeather({
            temp: Math.round(d.current.temperature_2m),
            code: d.current.weather_code,
            wind: Math.round(d.current.wind_speed_10m),
            humidity: d.current.relative_humidity_2m,
          });
        }
      } catch { /* silent */ }
    };
    fetchWeather();
    const interval = setInterval(fetchWeather, 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  /* ═══ Data fetching ═══ */
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      const [sharesRes, chargesRes, swapsRes, myResRes, tripsRes] = await Promise.allSettled([
        getShares({ userId }), getMyCharges(), getPendingSwaps(),
        getMyReservations(), api.get('/social/trips'),
      ]);

      const sharesData = sharesRes.status === 'fulfilled' ? sharesRes.value.data : undefined;
      const shareItems = Array.isArray(sharesData) ? sharesData : sharesData?.data || [];
      setShares(shareItems);

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

      if (swapsRes.status === 'fulfilled') {
        setPendingSwaps(Array.isArray(swapsRes.value.data) ? swapsRes.value.data : swapsRes.value.data?.data || []);
      }

      if (myResRes.status === 'fulfilled') {
        const resData = myResRes.value.data;
        const resList = Array.isArray(resData) ? resData : resData.data || [];
        setTodayReservations(resList.filter((r: any) => {
          if (!['CONFIRMED', 'PENDING'].includes(r.status)) return false;
          const diff = differenceInCalendarDays(parseISO(r.startDate), new Date());
          return diff === 0 || diff === 1;
        }));
      }

      if (tripsRes.status === 'fulfilled') {
        const trips = tripsRes.value.data.trips || [];
        setHighlightedTrips(trips.filter((t: any) => t.isHighlighted).slice(0, 5));
      }
      setTripsLoaded(true);
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [userId]);

  /* ═══ Handlers ═══ */
  const handleBoatClick = (boatId: string) => router.push(`/reservations?boatId=${encodeURIComponent(boatId)}`);

  const openConfirmArrival = (r: any) => {
    setConfirmReservation(r);
    setArrivalTime(format(parseISO(r.startDate), 'HH:mm'));
    setConfirmError('');
    setShowConfirmArrival(true);
  };

  const handleConfirmArrival = async () => {
    if (!confirmReservation) return;
    setConfirmError(''); setConfirmSaving(true);
    try {
      await confirmArrival(confirmReservation.id, arrivalTime);
      setShowConfirmArrival(false);
      setTodayReservations(prev => prev.map(r =>
        r.id === confirmReservation.id ? { ...r, confirmedAt: new Date().toISOString(), expectedArrivalTime: arrivalTime } : r
      ));
    } catch (err: any) { setConfirmError(err?.response?.data?.message || 'Erro ao confirmar presença'); }
    setConfirmSaving(false);
  };

  const handleDeclineReservation = async (r: any) => {
    if (!confirm('Tem certeza que deseja cancelar esta reserva?')) return;
    try {
      await cancelReservation(r.id, 'Cancelado pelo cotista');
      setTodayReservations(prev => prev.filter(res => res.id !== r.id));
    } catch (err: any) { alert(err?.response?.data?.message || 'Erro ao cancelar reserva'); }
  };

  const handleSwapRespond = async (swapId: string, accept: boolean) => {
    setRespondingId(swapId);
    try { await respondToSwap(swapId, accept); setPendingSwaps(prev => prev.filter(s => s.id !== swapId)); }
    catch { alert('Erro ao responder solicitação'); }
    setRespondingId(null);
  };

  const handleTripScroll = () => {
    if (!tripScrollRef.current) return;
    setActiveTripIdx(Math.round(tripScrollRef.current.scrollLeft / tripScrollRef.current.clientWidth));
  };

  const handleCotaScroll = () => {
    if (!cotaScrollRef.current) return;
    setActiveCotaIdx(Math.round(cotaScrollRef.current.scrollLeft / cotaScrollRef.current.clientWidth));
  };

  const API_ORIGIN = (process.env.NEXT_PUBLIC_API_URL || 'https://api.marinaprizeclub.com/api/v1').replace(/\/api\/v1$/, '');
  const resolveMediaUrl = (url: string | undefined | null) => {
    if (!url) return '';
    if (url.startsWith('/')) return `${API_ORIGIN}${url}`;
    return url;
  };

  const firstName = user?.name?.split(' ')[0] || '';
  const now = new Date();
  const greeting = now.getHours() < 12 ? 'Bom dia' : now.getHours() < 18 ? 'Boa tarde' : 'Boa noite';

  /* ═══ Loading ═══ */
  if (loading) {
    return (
      <div className="py-1 space-y-3 pb-2">
        <style dangerouslySetInnerHTML={{ __html: `
          @keyframes sh{0%{background-position:-400px 0}100%{background-position:400px 0}}
          .sh{background:linear-gradient(90deg,var(--subtle) 25%,var(--card-hover) 50%,var(--subtle) 75%);background-size:800px 100%;animation:sh 1.5s ease-in-out infinite;border-radius:16px}
        `}} />
        <div className="px-4 flex items-center justify-between">
          <div className="space-y-1.5"><div className="h-4 w-24 sh" /><div className="h-3 w-36 sh" /></div>
          <div className="h-9 w-24 sh" style={{ borderRadius: '12px' }} />
        </div>
        <div className="px-3"><div className="h-[100px] sh" /></div>
        <div className="px-3"><div className="h-[220px] sh" /></div>
      </div>
    );
  }

  const hasTrips = highlightedTrips.length > 0;
  const hasSwaps = pendingSwaps.length > 0;

  /* ═══ Render ═══ */
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        @keyframes sh{0%{background-position:-400px 0}100%{background-position:400px 0}}
        @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-2px)}}
        .ani{animation:fadeUp .35s ease-out both}
        .ani-1{animation-delay:.03s}.ani-2{animation-delay:.06s}.ani-3{animation-delay:.1s}.ani-4{animation-delay:.14s}
        .sh{background:linear-gradient(90deg,var(--subtle) 25%,var(--card-hover) 50%,var(--subtle) 75%);background-size:800px 100%;animation:sh 1.5s ease-in-out infinite}
        .gc{background:var(--card);border:1px solid var(--border);border-radius:18px;overflow:hidden;transition:transform .15s}
        .gc:active{transform:scale(.98)}
        .pill{display:inline-flex;align-items:center;gap:3px;font-size:9px;font-weight:700;letter-spacing:.04em;padding:3px 8px;border-radius:100px}
        .tag-own{background:rgba(59,130,246,.12);color:#60A5FA;border:1px solid rgba(59,130,246,.15)}
        .tag-cota{background:rgba(255,200,87,.1);color:#FFC857;border:1px solid rgba(255,200,87,.15)}
        .light .tag-cota{background:rgba(180,130,30,.08);color:#997020;border:1px solid rgba(180,130,30,.12)}
        .sc{display:flex;align-items:center;gap:6px;padding:6px 8px;border-radius:10px;flex:1;min-width:0}
      `}} />

      <div className="-mx-4 -mt-2 pb-4">

        {/* ══════ GREETING + WEATHER ROW ══════ */}
        <div className="px-4 pt-0.5 pb-2 flex items-center justify-between ani">
          <div>
            <h1 className="text-[18px] font-extrabold text-[var(--text)] tracking-tight leading-tight">
              {greeting}{firstName ? `, ${firstName}` : ''}
            </h1>
            <p className="text-[11px] text-[var(--text-muted)] mt-px">
              {now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
          </div>
          {weather ? (
            <div
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl cursor-pointer active:scale-95 transition-transform"
              style={{ background: 'var(--subtle)', border: '1px solid var(--border)' }}
              title={`${weatherLabel(weather.code)} · Vento ${weather.wind} km/h${weather.humidity ? ` · Umidade ${weather.humidity}%` : ''}`}
            >
              {weatherIcon(weather.code)}
              <span className="text-[14px] font-bold text-[var(--text)] leading-none">{weather.temp}°</span>
              <div className="flex items-center gap-0.5 text-[9px] text-[var(--text-muted)]">
                <Wind size={8} />
                <span>{weather.wind}</span>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl" style={{ background: 'var(--subtle)', border: '1px solid var(--border)' }}>
              <Cloud size={14} className="text-[var(--text-muted)]" style={{ opacity: .3 }} />
              <span className="text-[11px] text-[var(--text-muted)]" style={{ opacity: .5 }}>--°</span>
            </div>
          )}
        </div>

        {/* ══════ TRIPS CAROUSEL (compact) ══════ */}
        {hasTrips ? (
          <div className="ani ani-1 mb-2">
            <div
              ref={tripScrollRef}
              className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide gap-2.5 px-3"
              onScroll={handleTripScroll}
            >
              {highlightedTrips.map((trip: any, i: number) => {
                const photo = trip.photos?.[0]?.url;
                return (
                  <div
                    key={trip.id}
                    onClick={() => router.push(`/social?tripId=${trip.id}`)}
                    className="relative flex-shrink-0 overflow-hidden cursor-pointer active:scale-[0.98] transition-transform duration-200 snap-center"
                    style={{
                      width: highlightedTrips.length === 1 ? '100%' : 'calc(100% - 20px)',
                      minWidth: highlightedTrips.length === 1 ? '100%' : 'calc(100% - 20px)',
                      height: '110px', borderRadius: '16px',
                    }}
                  >
                    {photo ? (
                      <Image src={resolveMediaUrl(photo)} alt="" fill className="object-cover" sizes="90vw" priority={i === 0} loading={i === 0 ? 'eager' : 'lazy'} />
                    ) : (
                      <div className="absolute inset-0 bg-gradient-to-br from-[#0A2540] via-[#0F3460] to-[#1A5276]" />
                    )}
                    <div className="absolute inset-0" style={{ background: 'linear-gradient(0deg, rgba(0,0,0,.8) 0%, rgba(0,0,0,.15) 55%, rgba(0,0,0,.05) 100%)' }} />

                    <div className="absolute top-2 right-2">
                      <span className="pill" style={{ background: 'rgba(0,0,0,.45)', backdropFilter: 'blur(10px)', color: '#fff' }}>
                        <Calendar size={8} />
                        {trip.date ? new Date(trip.date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).toUpperCase() : ''}
                      </span>
                    </div>

                    <div className="absolute bottom-0 left-0 right-0 px-3 pb-2.5">
                      <h3 className="text-[15px] font-extrabold text-white leading-tight tracking-tight" style={{ textShadow: '0 1px 8px rgba(0,0,0,.4)' }}>
                        {trip.title}
                      </h3>
                      <div className="flex items-center gap-2 mt-0.5">
                        {trip.destination && (
                          <span className="flex items-center gap-0.5 text-[10px] text-white/60">
                            <MapPin size={8} className="text-[#FFC857]" /> {trip.destination}
                          </span>
                        )}
                        {trip._count && (
                          <>
                            <span className="flex items-center gap-0.5 text-[10px] text-white/40"><Users size={8} /> {trip._count.participants}</span>
                            <span className="flex items-center gap-0.5 text-[10px] text-white/40"><Star size={8} /> {trip._count.likes}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {highlightedTrips.length > 1 && (
              <div className="flex justify-center gap-1 mt-1.5">
                {highlightedTrips.map((_: any, i: number) => (
                  <div key={i} className={`h-[4px] rounded-full transition-all duration-300 ${i === activeTripIdx ? 'bg-[#00C2A8] w-4' : 'bg-[var(--border)] w-[4px]'}`} />
                ))}
              </div>
            )}
          </div>
        ) : !tripsLoaded ? (
          <div className="px-3 mb-2 ani"><div className="h-[110px] sh" style={{ borderRadius: '16px' }} /></div>
        ) : null}

        {/* ══════ SWAP REQUESTS (compact inline) ══════ */}
        {hasSwaps && (
          <div className="px-3 mb-2 space-y-2 ani ani-2">
            {pendingSwaps.map(swap => {
              const isR = respondingId === swap.id;
              return (
                <div key={swap.id} className="gc p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(245,158,11,.1)' }}>
                      <ArrowLeftRight size={10} className="text-amber-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] text-[var(--text)] truncate">
                        <span className="font-bold">{swap.requester.name.split(' ')[0]}</span>
                        <span className="text-[var(--text-muted)]"> quer trocar · {swap.reservation.boat.name}</span>
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-[10px] text-[var(--text-muted)] mb-2 px-1">
                    <span>{new Date(swap.reservation.startDate).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</span>
                    <ArrowLeftRight size={8} className="text-amber-500 mx-1" />
                    <span className="text-[#00C2A8]">{new Date(swap.offeredReservation.startDate).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</span>
                  </div>
                  <div className="flex gap-1.5">
                    <button onClick={() => handleSwapRespond(swap.id, true)} disabled={isR}
                      className="flex-1 h-[32px] rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 active:scale-[0.97] transition-all disabled:opacity-50 text-white"
                      style={{ background: 'linear-gradient(135deg, #10B981, #34D399)' }}>
                      <Check size={12} strokeWidth={2.5} /> Aceitar
                    </button>
                    <button onClick={() => handleSwapRespond(swap.id, false)} disabled={isR}
                      className="flex-1 h-[32px] rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 active:scale-[0.97] transition-all disabled:opacity-50 text-red-400"
                      style={{ background: 'rgba(239,68,68,.06)', border: '1px solid rgba(239,68,68,.1)' }}>
                      <XIcon size={12} strokeWidth={2.5} /> Recusar
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ══════ MY BOATS / COTAS ══════ */}
        <div className="ani ani-2">
          <div className="px-4 mb-2">
            <SectionLabel icon={<Anchor size={10} />} color="#00C2A8" label="Minhas Embarcações" />
          </div>

          {shares.length === 0 ? (
            <EmptyState />
          ) : (
            <div>
              <div
                ref={cotaScrollRef}
                className={shares.length > 1 ? 'flex overflow-x-auto snap-x snap-mandatory scrollbar-hide gap-2.5 px-3' : 'px-3'}
                onScroll={shares.length > 1 ? handleCotaScroll : undefined}
              >
                {shares.map((share, idx) => {
                  const boat = share.boat;
                  const isOwn = boat.notes?.startsWith('[PRÓPRIA]');
                  const bc = chargesByBoat[boat.id] || { overdue: 0, pending: 0 };

                  return (
                    <div
                      key={share.id}
                      className={`gc ani ani-${Math.min(idx + 2, 4)} ${shares.length > 1 ? 'flex-shrink-0 snap-center' : ''}`}
                      style={shares.length > 1 ? { width: 'calc(100% - 12px)', minWidth: 'calc(100% - 12px)' } : undefined}
                      onClick={() => handleBoatClick(boat.id)}
                      role="button" tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleBoatClick(boat.id); } }}
                    >
                      {/* Image */}
                      <div className="relative w-full" style={{ height: '160px' }}>
                        {boat.imageUrl ? (
                          <>
                            <Image
                              src={resolveMediaUrl(boat.imageUrl)} alt={boat.model} fill
                              className="object-cover" sizes="(max-width:768px) 92vw, 50vw"
                              priority={idx === 0} loading={idx === 0 ? 'eager' : 'lazy'}
                              unoptimized={boat.imageUrl.startsWith('data:')}
                            />
                            <div className="absolute inset-0" style={{ background: 'linear-gradient(0deg, rgba(0,0,0,.85) 0%, rgba(0,0,0,.1) 55%, rgba(0,0,0,.03) 100%)' }} />
                          </>
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'linear-gradient(135deg, var(--card), var(--card-hover))' }}>
                            <Ship size={36} style={{ color: 'var(--text-muted)', opacity: .1, animation: 'float 4s ease-in-out infinite' }} />
                          </div>
                        )}

                        <div className="absolute top-2 right-2">
                          <span className={`pill ${isOwn ? 'tag-own' : 'tag-cota'}`}>
                            {isOwn ? '✦ Própria' : `Cota #${boat.name}`}
                          </span>
                        </div>

                        <div className="absolute bottom-0 left-0 right-0 px-3 pb-2.5">
                          <h3 className="text-[17px] font-extrabold text-white leading-tight tracking-tight">
                            {boat.model}
                          </h3>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[10px] text-white/50 font-medium">{boat.year}</span>
                            {boat.length > 0 && (
                              <>
                                <span className="w-[2px] h-[2px] rounded-full bg-white/25" />
                                <span className="text-[10px] text-white/50 font-medium">{boat.length}ft</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Stats row */}
                      {bc.overdue > 0 && (
                        <div className="p-2 flex gap-1.5">
                          <div className="sc" style={{ background: 'rgba(239,68,68,.05)', border: '1px solid rgba(239,68,68,.08)' }}>
                            <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(239,68,68,.1)' }}>
                              <AlertTriangle size={11} className="text-red-400" />
                            </div>
                            <div>
                              <p className="text-[13px] font-extrabold text-red-400 leading-none">{bc.overdue}</p>
                              <p className="text-[7px] font-bold text-red-400/50 uppercase tracking-[0.06em]">Vencida{bc.overdue > 1 ? 's' : ''}</p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {shares.length > 1 && (
                <div className="flex justify-center gap-1 mt-2 mb-1">
                  {shares.map((_: any, i: number) => (
                    <div key={i} className={`h-[4px] rounded-full transition-all duration-300 ${i === activeCotaIdx ? 'bg-[#00C2A8] w-4' : 'bg-[var(--border)] w-[4px]'}`} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ══════ RESERVATIONS MANAGER ══════ */}
        <ReservationsManager />

        {/* ══════ CONFIRM ARRIVAL MODAL ══════ */}
        {showConfirmArrival && confirmReservation && (
          <div className="fixed inset-0 z-[10001] flex items-end" style={{ background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)' }} onClick={() => setShowConfirmArrival(false)}>
            <div
              className="w-full max-h-[85vh] overflow-auto"
              style={{ background: 'var(--card)', borderTop: '1px solid var(--border)', borderRadius: '20px 20px 0 0', paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}
              onClick={e => e.stopPropagation()}
            >
              <div className="p-4">
                <div className="w-8 h-1 rounded-full mx-auto mb-4" style={{ background: 'var(--border)' }} />

                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-[15px] font-extrabold text-[var(--text)]">Confirmar Presença</h2>
                    <p className="text-[11px] text-[var(--text-muted)] mt-px">
                      {confirmReservation.boat?.name} · {format(parseISO(confirmReservation.startDate), "dd/MM 'às' HH:mm")} — {format(parseISO(confirmReservation.endDate), 'HH:mm')}
                    </p>
                  </div>
                  <button onClick={() => setShowConfirmArrival(false)} className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: 'var(--subtle)' }}>
                    <XIcon size={12} className="text-[var(--text-muted)]" />
                  </button>
                </div>

                {confirmError && (
                  <div className="mb-3 p-2.5 rounded-xl text-[11px] text-red-400 flex items-start gap-2" style={{ background: 'rgba(239,68,68,.05)', border: '1px solid rgba(239,68,68,.08)' }}>
                    <AlertCircle size={12} className="mt-0.5 flex-shrink-0" /> <span>{confirmError}</span>
                  </div>
                )}

                <div className="rounded-xl p-3 mb-4" style={{ background: 'rgba(16,185,129,.04)', border: '1px solid rgba(16,185,129,.08)' }}>
                  <p className="text-[12px] text-emerald-400 font-semibold mb-0.5">
                    {confirmReservation && isToday(parseISO(confirmReservation.startDate)) ? 'Confirmando sua presença hoje' : 'Confirmando sua presença'}
                  </p>
                  <p className="text-[10px] text-[var(--text-muted)] leading-relaxed">A vaga é sua. Suplentes inscritos serão dispensados automaticamente.</p>
                </div>

                <div className="mb-4">
                  <label className="block text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-[0.1em] mb-1.5">Horário de chegada</label>
                  <select value={arrivalTime} onChange={e => setArrivalTime(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl text-[13px] transition outline-none"
                    style={{ background: 'var(--subtle)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                    {HOURS.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>

                <button onClick={handleConfirmArrival} disabled={confirmSaving}
                  className="w-full h-[42px] rounded-xl font-bold text-[13px] disabled:opacity-50 active:scale-[0.98] transition-all flex items-center justify-center gap-2 text-white"
                  style={{ background: 'linear-gradient(135deg, #10B981, #34D399)' }}>
                  {confirmSaving ? <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <CheckCircle2 size={14} />}
                  {confirmSaving ? 'Confirmando...' : 'Confirmar Presença'}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </>
  );
}

/* ═══ Sub-components ═══ */

function SectionLabel({ icon, color, label }: { icon: React.ReactNode; color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-5 h-5 rounded-md flex items-center justify-center" style={{ background: `${color}12`, color }}>
        {icon}
      </div>
      <h2 className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[var(--text)]">{label}</h2>
      <div className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, var(--border), transparent)' }} />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-10 px-5 flex-1 flex flex-col items-center justify-center">
      <div className="w-14 h-14 rounded-2xl mx-auto mb-3 flex items-center justify-center" style={{ animation: 'float 4s ease-in-out infinite', background: 'linear-gradient(135deg, rgba(0,194,168,.06), rgba(0,117,119,.02))', border: '1px solid rgba(0,194,168,.08)' }}>
        <Anchor size={24} style={{ color: '#00C2A8', opacity: .2 }} />
      </div>
      <p className="text-[12px] font-semibold text-[var(--text-secondary)]">Nenhuma embarcação encontrada</p>
      <p className="text-[10px] text-[var(--text-muted)] mt-0.5">Entre em contato com a administração</p>
    </div>
  );
}