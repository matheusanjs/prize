'use client';

import { useEffect, useState } from 'react';
import { Wind, Droplets, Sun, ChevronDown, ChevronUp, MapPin, CloudRain, Calendar, CheckCircle2, X, Sparkles, Ship } from 'lucide-react';
import { getWeatherCurrent, getWeatherForecast } from '@/services/api';
import { format, parseISO } from 'date-fns';

interface WeatherData {
  id: string;
  collectedAt: string;
  windSpeed: number | null;
  windDirection: number | null;
  airTemperature: number | null;
  cloudCover: number | null;
  humidity: number | null;
  precipitation: number | null;
  navigationLevel: 'BOM' | 'ATENCAO' | 'RUIM' | 'PERIGOSO';
  navigationScore: number;
  operatorSummary: string | null;
  clientSummary: string | null;
}

interface ForecastDay {
  date: string;
  dayOfWeek: string;
  navigationLevel: 'BOM' | 'ATENCAO' | 'RUIM' | 'PERIGOSO';
  navigationScore: number;
  windSpeedMin: number;
  windSpeedMax: number;
  airTempMin: number;
  airTempMax: number;
  clientSummary: string;
  humidity?: number;
  cloudiness?: number;
  rain?: number;
  rainProbability?: number;
  description?: string;
  condition?: string;
}

// Alias for timeline component
interface ForecastDayForTimeline {
  date: string;
  windSpeedMin: number;
  windSpeedMax: number;
  airTempMin: number;
  airTempMax: number;
  rainProbability?: number;
  rain?: number;
  humidity?: number;
  navigationLevel: string;
  clientSummary: string;
  condition?: string;
}

type NavLevel = 'BOM' | 'ATENCAO' | 'RUIM' | 'PERIGOSO';

const levelConfig: Record<NavLevel, { label: string; badge: string; badgeText: string; accent: string; dot: string }> = {
  BOM:      { label: 'Bom',      badge: 'bg-emerald-100 dark:bg-emerald-900/40', badgeText: 'text-emerald-700 dark:text-emerald-300', accent: 'text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-500' },
  ATENCAO:  { label: 'Atenção',  badge: 'bg-amber-100 dark:bg-amber-900/40',     badgeText: 'text-amber-700 dark:text-amber-300',     accent: 'text-amber-600 dark:text-amber-400',   dot: 'bg-amber-500' },
  RUIM:     { label: 'Ruim',     badge: 'bg-orange-100 dark:bg-orange-900/40',   badgeText: 'text-orange-700 dark:text-orange-300',   accent: 'text-orange-600 dark:text-orange-400', dot: 'bg-orange-500' },
  PERIGOSO: { label: 'Perigoso', badge: 'bg-red-100 dark:bg-red-900/40',         badgeText: 'text-red-700 dark:text-red-300',         accent: 'text-red-600 dark:text-red-400',       dot: 'bg-red-500' },
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
}

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00-03:00');
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' });
}

interface TodayReservation {
  id: string;
  startDate: string;
  endDate: string;
  confirmedAt?: string;
  expectedArrivalTime?: string;
  boat?: { name: string };
}

interface Props {
  variant?: 'client' | 'operator';
  todayReservations?: TodayReservation[];
  onConfirmArrival?: (reservation: TodayReservation) => void;
  onDeclineReservation?: (reservation: TodayReservation) => void;
  aiSummary?: string | null;
}

export default function WeatherWidget({ variant = 'client', todayReservations = [], onConfirmArrival, onDeclineReservation, aiSummary }: Props) {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [forecast, setForecast] = useState<ForecastDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForecast, setShowForecast] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [currentRes, forecastRes] = await Promise.all([
          getWeatherCurrent(),
          getWeatherForecast(),
        ]);
        if (currentRes.data.ok && currentRes.data.data) setWeather(currentRes.data.data);
        if (forecastRes.data.ok && forecastRes.data.data) setForecast(forecastRes.data.data);
      } catch { /* silent */ }
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div className="bg-[var(--card)] rounded-2xl border border-[var(--border)] p-4 mb-4 animate-pulse">
        <div className="h-5 bg-[var(--subtle)] rounded w-1/3 mb-3" />
        <div className="h-4 bg-[var(--subtle)] rounded w-2/3" />
      </div>
    );
  }

  if (!weather) return null;

  const cfg = levelConfig[weather.navigationLevel];
  const windKmh = weather.windSpeed != null ? (weather.windSpeed * 3.6).toFixed(0) : '-';

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const futureForecast = forecast.filter((d) => d.date >= today);

  return (
    <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] overflow-hidden mb-4 shadow-sm">
      {/* Compact Header + Stats */}
      <div className="px-4 py-2.5">
        {/* Header row */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <MapPin size={10} className="text-[var(--text-muted)]" />
            <span className="text-[10px] text-[var(--text-muted)] font-medium">Cabo Frio</span>
            <span className="text-[9px] text-[var(--text-muted)] opacity-70">· {formatTime(weather.collectedAt)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            {aiSummary && (
              <button
                onClick={() => setShowAiModal(true)}
                className="flex items-center gap-1 bg-blue-500/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 text-[9px] font-bold px-2 py-0.5 rounded-full hover:bg-blue-500/20 dark:hover:bg-blue-500/30 transition-colors active:scale-95"
              >
                <Sparkles size={9} />
                IA
              </button>
            )}
            <span className={`${cfg.badge} ${cfg.badgeText} text-[10px] font-bold px-2 py-0.5 rounded-full`}>
              {cfg.label}
            </span>
          </div>
        </div>

        {/* Compact inline stats */}
        <div className="flex items-center">
          <div className="flex items-center gap-1.5 pr-3 border-r border-[var(--border)]">
            <Sun size={12} className={cfg.accent} />
            <span className="text-[11px] font-semibold text-[var(--text)]">{weather.airTemperature?.toFixed(0) ?? '-'}°C</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 border-r border-[var(--border)]">
            <Wind size={12} className={cfg.accent} />
            <span className="text-[11px] font-semibold text-[var(--text)]">{windKmh} km/h</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 border-r border-[var(--border)]">
            <Droplets size={12} className={cfg.accent} />
            <span className="text-[11px] font-semibold text-[var(--text)]">{weather.humidity ?? '-'}%</span>
          </div>
          <div className="flex items-center gap-1.5 pl-3">
            <CloudRain size={12} className={cfg.accent} />
            <span className="text-[11px] font-semibold text-[var(--text)]">{weather.precipitation ?? 0}mm</span>
          </div>
        </div>
      </div>

      {/* Today's Reservations (inside weather card) */}
      {todayReservations.length > 0 && (
        <div className="px-4 pb-3 space-y-2">
          {todayReservations.map((r) => (
            <div key={r.id} className="bg-emerald-500/10 rounded-xl p-3 border border-emerald-500/20">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-7 h-7 rounded-lg bg-emerald-500 flex items-center justify-center shrink-0">
                    <Calendar size={13} className="text-white" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Reserva hoje</p>
                    <p className="text-xs font-semibold text-[var(--text)] truncate">
                      {r.boat?.name} · <span className="font-normal text-[var(--text-muted)]">{format(parseISO(r.startDate), 'HH:mm')} — {format(parseISO(r.endDate), 'HH:mm')}</span>
                    </p>
                  </div>
                </div>
              </div>
              {r.confirmedAt ? (
                <div className="mt-2 flex items-center gap-1.5">
                  <CheckCircle2 size={12} className="text-emerald-500 shrink-0" />
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                    Presença confirmada · Chegada: <strong>{r.expectedArrivalTime}</strong>
                  </span>
                </div>
              ) : (onConfirmArrival || onDeclineReservation) ? (
                <div className="flex gap-2 mt-2">
                  {onConfirmArrival && (
                    <button
                      onClick={() => onConfirmArrival(r)}
                      className="flex-1 bg-emerald-500 text-white py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform"
                    >
                      <CheckCircle2 size={13} /> Confirmar
                    </button>
                  )}
                  {onDeclineReservation && (
                    <button
                      onClick={() => onDeclineReservation(r)}
                      className="flex-1 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform text-red-400 border border-red-500/20 bg-red-500/10"
                    >
                      <X size={13} /> Cancelar
                    </button>
                  )}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {/* Forecast */}
      {futureForecast.length > 0 && (
        <div className="border-t border-[var(--border)]">
          <button
            onClick={() => setShowForecast(!showForecast)}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 text-[11px] font-medium text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
          >
            Próximos {futureForecast.length} dias
            {showForecast ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>

          {showForecast && (
            <div className="px-4 pb-3 space-y-1.5">
              {futureForecast.map((day) => {
                const dcfg = levelConfig[day.navigationLevel];
                return (
                  <div key={day.date} className="flex items-center justify-between py-2 px-3 bg-[var(--subtle)] rounded-xl">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`w-2 h-2 rounded-full shrink-0 ${dcfg.dot}`} />
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-[var(--text)]">
                          {day.dayOfWeek} <span className="text-[var(--text-muted)] font-normal ml-1">{formatDateShort(day.date)}</span>
                        </p>
                        <p className="text-[10px] text-[var(--text-muted)] truncate">{day.clientSummary}, 💨 {day.windSpeedMin}–{day.windSpeedMax} km/h</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <span className={`${dcfg.badge} ${dcfg.badgeText} text-[9px] font-bold px-2 py-0.5 rounded-full`}>
                        {dcfg.label}
                      </span>
                      <p className="text-[9px] text-[var(--text-muted)] mt-0.5">{day.airTempMin}–{day.airTempMax}°</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* AI Summary Modal */}
      {showAiModal && aiSummary && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center sm:p-4" onClick={() => setShowAiModal(false)}>
          <div
            className="bg-[var(--card)] rounded-t-3xl sm:rounded-2xl w-full sm:max-w-md max-h-[80vh] overflow-y-auto shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="sticky top-0 bg-[var(--card)] px-5 pt-5 pb-3 border-b border-[var(--border)] flex items-center justify-between z-10">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-500/10 flex items-center justify-center">
                  <Ship size={16} className="text-blue-500" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[var(--text)]">Condições de Navegação</h3>
                  <p className="text-[10px] text-[var(--text-muted)]">Resumo gerado por IA</p>
                </div>
              </div>
              <button
                onClick={() => setShowAiModal(false)}
                className="w-8 h-8 rounded-full bg-[var(--subtle)] flex items-center justify-center hover:bg-[var(--border)] transition-colors"
              >
                <X size={16} className="text-[var(--text-muted)]" />
              </button>
            </div>
            {/* Modal body */}
            <div className="px-5 py-4">
              <div className="flex items-center gap-2 mb-3">
                <span className={`${cfg.badge} ${cfg.badgeText} text-[11px] font-bold px-2.5 py-1 rounded-full`}>
                  {cfg.label}
                </span>
                <span className="text-[10px] text-[var(--text-muted)]">
                  Atualizado às {formatTime(weather.collectedAt)}
                </span>
              </div>
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed whitespace-pre-line">{aiSummary}</p>
            </div>
            {/* Safe area spacer */}
            <div className="h-6 sm:h-2" />
          </div>
        </div>
      )}
    </div>
  );
}
