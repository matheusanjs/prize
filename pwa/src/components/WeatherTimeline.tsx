'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Sun, CloudRain, Wind } from 'lucide-react';
import { format, parseISO } from 'date-fns';

interface WeatherHistoryItem {
  collectedAt: string;
  airTemperature?: number;
  windSpeed?: number;
  precipitation?: number;
}

export interface TimelineHour {
  time: string;
  temp?: number;
  wind?: number; // m/s
  rain?: number; // mm
}

interface Props {
  hours: TimelineHour[];
  title?: string;
  compact?: boolean;
  showLabels?: boolean;
}

const START_HOUR = 9;
const END_HOUR = 18;

/* ── helpers ─────────────────────────────────────────── */

function catmullRomToBezier(points: { x: number; y: number }[], tension = 0.3) {
  if (points.length < 2) return '';
  let d = `M ${points[0].x},${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(i - 1, 0)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(i + 2, points.length - 1)];
    const cp1x = p1.x + (p2.x - p0.x) * tension;
    const cp1y = p1.y + (p2.y - p0.y) * tension;
    const cp2x = p2.x - (p3.x - p1.x) * tension;
    const cp2y = p2.y - (p3.y - p1.y) * tension;
    d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
  }
  return d;
}

function getWeatherEmoji(temp?: number, wind?: number, rain?: number): string {
  if (rain && rain > 0.5) return '\ud83c\udf27\ufe0f';
  if (rain && rain > 0.1) return '\ud83c\udf26\ufe0f';
  if (wind && wind * 3.6 > 30) return '\ud83d\udca8';
  if (temp && temp > 28) return '\u2600\ufe0f';
  if (temp && temp < 20) return '\ud83c\udf24\ufe0f';
  return '\u2600\ufe0f';
}

function tempColor(v: number): string {
  if (v > 28) return '#f97316';
  if (v > 22) return '#10b981';
  return '#3b82f6';
}

function generateSummary(hours: TimelineHour[]): string {
  const temps = hours.map(h => h.temp).filter((v): v is number => v != null);
  const maxWind = Math.max(...hours.map(h => h.wind || 0)) * 3.6;
  const totalRain = hours.reduce((s, h) => s + (h.rain || 0), 0);
  const avgTemp = temps.length ? temps.reduce((a, b) => a + b, 0) / temps.length : 0;

  const windAdj = maxWind > 30 ? 'Vento forte' : maxWind > 15 ? 'Vento constante' : 'Vento leve';
  const tempAdj = avgTemp > 28 ? 'quente' : avgTemp > 22 ? 'temperatura agrad\u00e1vel' : 'temperatura fresca';
  const rainAdj = totalRain > 5 ? 'com chuva significativa' : totalRain > 1 ? 'com chuvas leves' : 'sem chuva';

  return `${windAdj}, ${tempAdj}, ${rainAdj}`;
}

/* ── compact mode (for boats page) ───────────────────── */

function CompactTimeline({ hours, title }: { hours: TimelineHour[]; title?: string }) {
  const slots: TimelineHour[] = [];
  for (let h = START_HOUR; h <= END_HOUR; h++) {
    const key = `${String(h).padStart(2, '0')}:00`;
    const found = hours.find(x => x.time === key);
    slots.push(found || { time: key });
  }

  const temps = slots.map(s => s.temp).filter((v): v is number => v != null);
  const tempMin = temps.length ? Math.min(...temps) : 0;
  const tempMax = temps.length ? Math.max(...temps) : 1;
  const tempRange = tempMax - tempMin || 1;

  return (
    <div className="bg-[var(--card)] rounded-2xl border border-[var(--border)] overflow-hidden">
      {title && (
        <div className="px-3 py-2 border-b border-[var(--border)]">
          <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">{title}</p>
        </div>
      )}
      <div className="px-2 py-2 overflow-x-auto">
        <div className="flex gap-1 min-w-fit">
          {slots.map(slot => {
            const tempPct = slot.temp != null ? ((slot.temp - tempMin) / tempRange) * 100 : 0;
            const hasData = slot.temp != null || slot.wind != null || slot.rain != null;
            return (
              <div key={slot.time} className="flex flex-col items-center gap-0.5 min-w-[28px]">
                <span className="text-[9px] text-[var(--text-muted)]">{slot.time.replace(':00', 'h')}</span>
                <span className="text-[11px]">{getWeatherEmoji(slot.temp, slot.wind, slot.rain)}</span>
                {slot.temp != null && (
                  <div className="relative w-5 h-5 flex items-center justify-center">
                    <svg className="absolute inset-0 w-full h-full" viewBox="0 0 20 20">
                      <circle cx="10" cy="10" r="8" fill="none" stroke="var(--border)" strokeWidth="1.5" />
                      <circle
                        cx="10" cy="10" r="8" fill="none"
                        stroke={tempColor(slot.temp)}
                        strokeWidth="1.5"
                        strokeDasharray={`${(tempPct / 100) * 50.3} 50.3`}
                        transform="rotate(-90 10 10)"
                      />
                    </svg>
                    <span className="text-[8px] font-bold text-[var(--text)] relative z-10">{slot.temp}°</span>
                  </div>
                )}
                {!hasData && <div className="w-5 h-5 rounded-full bg-[var(--subtle)]" />}
                <span className="text-[7px] text-[var(--text-muted)]">{slot.wind != null ? `${Math.round(slot.wind * 3.6)}km` : '—'}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ── premium unified chart ───────────────────────────── */

const CHART_WIDTH = 800;
const CHART_HEIGHT = 220;
const PAD_TOP = 28;
const PAD_RIGHT = 20;
const PAD_BOTTOM = 42;
const PAD_LEFT = 48;
const PLOT_W = CHART_WIDTH - PAD_LEFT - PAD_RIGHT;
const PLOT_H = CHART_HEIGHT - PAD_TOP - PAD_BOTTOM;
const NUM_SLOTS = END_HOUR - START_HOUR + 1; // 10

function UnifiedChart({ hours, title }: { hours: TimelineHour[]; title?: string }) {
  // Build full 09-18 array
  const slots: TimelineHour[] = [];
  for (let h = START_HOUR; h <= END_HOUR; h++) {
    const key = `${String(h).padStart(2, '0')}:00`;
    const found = hours.find(x => x.time === key);
    slots.push(found || { time: key });
  }

  const temps = slots.map(s => s.temp).filter((v): v is number => v != null);
  const winds = slots.map(s => s.wind).filter((v): v is number => v != null);
  const rains = slots.map(s => s.rain || 0);
  const tempMin = temps.length ? Math.min(...temps) : 0;
  const tempMax = temps.length ? Math.max(...temps) : 1;
  const windMax = winds.length ? Math.max(...winds) * 3.6 : 1;
  const rainMax = Math.max(...rains, 0.5);
  const tempRange = tempMax - tempMin || 1;
  const peakTemp = temps.length ? Math.max(...temps) : 0;

  const summary = generateSummary(slots);

  const xStep = PLOT_W / (NUM_SLOTS - 1);
  const slotX = (i: number) => PAD_LEFT + i * xStep;
  const windY = (v: number) =>
    PAD_TOP + PLOT_H - ((v * 3.6) / windMax) * PLOT_H;
  const tempY = (v: number | null) =>
    v == null ? null : PAD_TOP + PLOT_H - ((v - tempMin) / tempRange) * PLOT_H * 0.7;
  const rainH = (v: number) => (v / rainMax) * PLOT_H * 0.25;

  // Build SVG path data — wind is PRIMARY (area fill)
  const windPoints: { x: number; y: number }[] = [];
  slots.forEach((s, i) => {
    if (s.wind != null) windPoints.push({ x: slotX(i), y: windY(s.wind) });
  });
  const windLine = windPoints.length > 1 ? catmullRomToBezier(windPoints) : '';
  const windArea = windLine
    ? `${windLine} L ${windPoints[windPoints.length - 1].x},${PAD_TOP + PLOT_H} L ${windPoints[0].x},${PAD_TOP + PLOT_H} Z`
    : '';

  // Temperature as secondary line
  const tempPoints: { x: number; y: number }[] = [];
  slots.forEach((s, i) => {
    const y = tempY(s.temp ?? null);
    if (y != null) tempPoints.push({ x: slotX(i), y });
  });
  const tempLine = tempPoints.length > 1 ? catmullRomToBezier(tempPoints, 0.4) : '';

  // Y-axis ticks for wind (km/h)
  const windTicks: number[] = [];
  const windTickStep = Math.max(5, Math.round(windMax / 4 / 5) * 5); // round to nearest 5
  for (let t = windTickStep; t < windMax; t += windTickStep) {
    windTicks.push(t);
  }

  // Hover state
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const scaleX = CHART_WIDTH / rect.width;
    const mx = (e.clientX - rect.left) * scaleX;
    const idx = Math.round((mx - PAD_LEFT) / xStep);
    if (idx >= 0 && idx < NUM_SLOTS) setHoverIdx(idx);
    else setHoverIdx(null);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const scaleX = CHART_WIDTH / rect.width;
    const touch = e.touches[0];
    const mx = (touch.clientX - rect.left) * scaleX;
    const idx = Math.round((mx - PAD_LEFT) / xStep);
    if (idx >= 0 && idx < NUM_SLOTS) setHoverIdx(idx);
    else setHoverIdx(null);
  }, []);

  const handleLeave = useCallback(() => setHoverIdx(null), []);

  // Dynamic background based on avg temp
  const avgTemp = temps.length ? temps.reduce((a, b) => a + b, 0) / temps.length : 22;
  const warmPct = Math.max(0, Math.min(1, (avgTemp - 18) / 16));
  const bgR1 = Math.round(15 + warmPct * 50);
  const bgG1 = Math.round(23 + warmPct * 30);
  const bgB1 = Math.round(42 + warmPct * 10);
  const bgR2 = Math.round(10 + warmPct * 20);
  const bgG2 = Math.round(15 + warmPct * 10);
  const bgB2 = Math.round(25 + warmPct * 5);
  const bgGrad = `linear-gradient(180deg, rgb(${bgR1} ${bgG1} ${bgB1} / 0.04), rgb(${bgR2} ${bgG2} ${bgB2} / 0.02))`;

  const totalRain = rains.reduce((a, b) => a + b, 0);

  return (
    <div className={`rounded-[20px] border border-[var(--border)] overflow-hidden shadow-lg transition-all duration-700 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'}`} style={{ background: `linear-gradient(135deg, var(--card) 0%, ${bgGrad} 100%)`, backdropFilter: 'blur(20px)' }}>
      {/* Header row */}
      {title && (
        <div className="px-4 pt-3 pb-0.5">
          <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-[0.15em]">{title}</p>
        </div>
      )}

      {/* Summary + mini stats */}
      <div className="px-4 pb-2 pt-1.5 flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[var(--subtle)] border border-[var(--border)]">
          <span className="text-[10px] leading-none">{getWeatherEmoji(tempMax, windMax / 3.6, totalRain)}</span>
          <span className="text-[10px] font-medium text-[var(--text-secondary)]">{summary}</span>
        </div>
        <div className="flex items-center gap-2.5 ml-auto">
          <div className="flex items-center gap-1">
            <Wind size={10} className="text-cyan-400/70" />
            <span className="text-[9px] text-[var(--text-muted)]">até {Math.round(windMax)}km/h</span>
          </div>
          <div className="flex items-center gap-1">
            <Sun size={10} className="text-orange-400/70" />
            <span className="text-[9px] text-[var(--text-muted)]">{tempMin}°—{tempMax}°</span>
          </div>
          {totalRain > 0 && (
            <div className="flex items-center gap-1">
              <CloudRain size={10} className="text-blue-400/70" />
              <span className="text-[9px] text-[var(--text-muted)]">{totalRain.toFixed(1)}mm</span>
            </div>
          )}
        </div>
      </div>

      {/* Chart */}
      <div className="px-1 pb-1">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          className="w-full h-auto"
          onMouseMove={handleMouseMove}
          onTouchMove={handleTouchMove}
          onMouseLeave={handleLeave}
          onTouchEnd={handleLeave}
        >
          <defs>
            {/* Wind area gradient — primary metric */}
            <linearGradient id="windAreaGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.25" />
              <stop offset="35%" stopColor="#06b6d4" stopOpacity="0.2" />
              <stop offset="65%" stopColor="#0891b2" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#0e7490" stopOpacity="0.25" />
            </linearGradient>

            {/* Wind line gradient */}
            <linearGradient id="windLineGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.9" />
              <stop offset="50%" stopColor="#06b6d4" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#0891b2" stopOpacity="0.9" />
            </linearGradient>

            {/* Temperature line gradient */}
            <linearGradient id="tempLineGrad" x1="0" y1="0" x2="1" y2="0">
              {slots.map((s, i) => {
                const pct = (i / (NUM_SLOTS - 1)) * 100;
                const c = s.temp != null ? tempColor(s.temp) : '#94a3b8';
                return <stop key={`tl-${i}`} offset={`${pct}%`} stopColor={c} />;
              })}
            </linearGradient>

            {/* Rain gradient */}
            <linearGradient id="rainGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.15" />
            </linearGradient>

            {/* Glow filter for peak temp */}
            <filter id="peakGlow" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            {/* Subtle glow for all temp points */}
            <filter id="softGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Grid lines — subtle horizontal */}
          {windTicks.map((t, i) => {
            const y = windY(t / 3.6);
            return (
              <line
                key={`g-${i}`}
                x1={PAD_LEFT} y1={y} x2={CHART_WIDTH - PAD_RIGHT} y2={y}
                stroke="var(--border)" strokeWidth="0.5" strokeDasharray="3,5" opacity="0.25"
              />
            );
          })}

          {/* Wind area fill — PRIMARY metric */}
          {windArea && (
            <path d={windArea} fill="url(#windAreaGrad)" opacity={hoverIdx != null ? 0.35 : 0.5} className="transition-opacity duration-200" />
          )}

          {/* Wind line */}
          {windLine && (
            <path
              d={windLine}
              fill="none"
              stroke="url(#windLineGrad)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Temperature line — secondary */}
          {tempLine && (
            <path
              d={tempLine}
              fill="none"
              stroke="url(#tempLineGrad)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="5,4"
              opacity={hoverIdx != null ? 0.4 : 0.7}
              className="transition-opacity duration-200"
            />
          )}

          {/* Wind points */}
          {slots.map((s, i) => {
            if (s.wind == null) return null;
            const y = windY(s.wind);
            const isPeak = (s.wind * 3.6) === windMax;
            const isHover = hoverIdx === i;
            return (
              <g key={`wp-${i}`}>
                {isHover && (
                  <circle cx={slotX(i)} cy={y} r="8" fill="none" stroke="#22d3ee" strokeWidth="1" opacity="0.3" />
                )}
                <circle
                  cx={slotX(i)}
                  cy={y}
                  r={isHover ? 6 : isPeak ? 5 : 3}
                  fill="#06b6d4"
                  stroke={isHover ? 'rgba(255,255,255,0.9)' : 'var(--card)'}
                  strokeWidth={isHover ? 2 : 1.5}
                  filter={isPeak ? 'url(#peakGlow)' : 'url(#softGlow)'}
                  opacity={hoverIdx != null && !isHover ? 0.3 : 1}
                  className="transition-all duration-150"
                />
              </g>
            );
          })}

          {/* Temperature points */}
          {slots.map((s, i) => {
            const y = tempY(s.temp ?? null);
            if (y == null) return null;
            const isPeak = s.temp === peakTemp;
            const isHover = hoverIdx === i;
            return (
              <g key={`tp-${i}`}>
                {isHover && (
                  <circle cx={slotX(i)} cy={y} r="6" fill="none" stroke={tempColor(s.temp!)} strokeWidth="1" opacity="0.3" />
                )}
                <circle
                  cx={slotX(i)}
                  cy={y}
                  r={isHover ? 5 : isPeak ? 4 : 2.5}
                  fill={tempColor(s.temp!)}
                  stroke={isHover ? 'rgba(255,255,255,0.9)' : 'var(--card)'}
                  strokeWidth={isHover ? 1.5 : 1}
                  opacity={hoverIdx != null && !isHover ? 0.3 : 1}
                  className="transition-all duration-150"
                />
              </g>
            );
          })}

          {/* Rain bars — at bottom of plot area */}
          {slots.map((s, i) => {
            const rv = s.rain || 0;
            if (rv < 0.1) return null;
            const barH = rainH(rv);
            return (
              <rect
                key={`r-${i}`}
                x={slotX(i) - 3}
                y={PAD_TOP + PLOT_H - barH}
                width={6}
                height={barH}
                rx="3"
                fill="url(#rainGrad)"
                className="transition-opacity duration-200"
                opacity={hoverIdx === i ? 0.9 : hoverIdx != null ? 0.55 : 0.75}
              />
            );
          })}

          {/* X-axis time labels */}
          {slots.map((s, i) => (
            <text
              key={`xl-${i}`}
              x={slotX(i)}
              y={CHART_HEIGHT - 22}
              textAnchor="middle"
              fill="var(--text-muted)"
              fontSize="14"
              fontWeight={hoverIdx === i ? '600' : '500'}
              className="transition-opacity duration-200"
              opacity={hoverIdx != null && hoverIdx !== i ? 0.35 : 0.6}
            >
              {s.time.replace(':00', 'h')}
            </text>
          ))}

          {/* Wind Y labels */}
          {windTicks.map((t, i) => {
            const y = windY(t / 3.6); // windY expects m/s, tick is km/h
            return (
              <text
                key={`yl-${i}`}
                x={PAD_LEFT - 6}
                y={y + 3}
                textAnchor="end"
                fill="var(--text-muted)"
                fontSize="14"
                fontWeight="600"
                opacity="0.5"
              >
                {Math.round(t)}
              </text>
            );
          })}

          {/* Hover line + tooltip */}
          {hoverIdx != null && slots[hoverIdx] && (() => {
            const hx = slotX(hoverIdx);
            const hy = tempY(slots[hoverIdx].temp ?? null);
            const s = slots[hoverIdx];
            const tipW = 160;
            const tipH = 105;
            let tipX = hx - tipW / 2;
            let tipY = hy != null ? hy - tipH - 14 : PAD_TOP - tipH - 4;
            if (tipX < 4) tipX = 4;
            if (tipX + tipW > CHART_WIDTH - PAD_RIGHT) tipX = CHART_WIDTH - PAD_RIGHT - tipW - 4;
            if (tipY < 4) tipY = PAD_TOP + 10;

            return (
              <g className="pointer-events-none">
                {/* Vertical tracking line */}
                <line
                  x1={hx} y1={PAD_TOP} x2={hx} y2={PAD_TOP + PLOT_H}
                  stroke="var(--text-muted)" strokeWidth="1" strokeDasharray="3,4" opacity="0.25"
                />

                {/* Glass tooltip */}
                <g transform={`translate(${tipX}, ${tipY})`}>
                  {/* Frosted glass background */}
                  <rect width={tipW} height={tipH} rx="14" fill="var(--timeline-tip-bg)" />
                  <rect x="0.5" y="0.5" width={tipW - 1} height={tipH - 1} rx="13.5" fill="none" stroke="var(--timeline-tip-border)" strokeWidth="1.2" />

                  {/* Hour header */}
                  <text x={tipW / 2} y={22} textAnchor="middle" fill="var(--timeline-tip-label)" fontSize="13" fontWeight="700">
                    {s.time.replace(':00', 'h')} — {getWeatherEmoji(s.temp, s.wind, s.rain)}
                  </text>

                  {/* Divider */}
                  <line x1="14" y1="30" x2={tipW - 14} y2="30" stroke="var(--timeline-tip-divider)" strokeWidth="0.8" />

                  {/* Wind row */}
                  {s.wind != null && (
                    <g transform="translate(16, 48)">
                      <circle r="4" fill="#22d3ee" filter="url(#softGlow)" />
                      <text x="14" y="4" fill="var(--timeline-tip-label)" fontSize="11">Vento</text>
                      <text x={tipW - 28} y="4" textAnchor="end" fill="var(--timeline-tip-value)" fontSize="13" fontWeight="700">{Math.round(s.wind * 3.6)} km/h</text>
                    </g>
                  )}

                  {/* Temperature row */}
                  {s.temp != null && (
                    <g transform="translate(16, 66)">
                      <circle r="3" fill={tempColor(s.temp)} opacity="0.6" />
                      <text x="14" y="4" fill="var(--timeline-tip-label)" fontSize="11">Temp</text>
                      <text x={tipW - 28} y="4" textAnchor="end" fill="var(--timeline-tip-value)" fontSize="12" fontWeight="600">{s.temp}°C</text>
                    </g>
                  )}

                  {/* Rain row */}
                  {s.rain != null && s.rain > 0.1 && (
                    <g transform="translate(16, 84)">
                      <rect x="-4" y="-4" width="5" height="8" rx="2.5" fill="#60a5fa" opacity="0.5" />
                      <text x="14" y="4" fill="var(--timeline-tip-label)" fontSize="11">Chuva</text>
                      <text x={tipW - 28} y="4" textAnchor="end" fill="var(--timeline-tip-value)" fontSize="12" fontWeight="600">{s.rain.toFixed(1)} mm</text>
                    </g>
                  )}
                </g>
              </g>
            );
          })()}
        </svg>
      </div>

      {/* Legend */}
      <div className="px-4 pb-2 pt-0.5 flex items-center gap-3 text-[8px] text-[var(--text-muted)]">
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-[1.5px] rounded-full bg-cyan-400" />
          Vento
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-[3px] rounded-full" style={{ background: 'linear-gradient(90deg, #3b82f6, #10b981, #f97316)' }} />
          Temperatura
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-[5px] h-[8px] rounded-sm bg-blue-400/40" />
          Chuva
        </div>
      </div>
    </div>
  );
}

/* ── main component ──────────────────────────────────── */

export default function WeatherTimeline({ hours, title, compact = false, showLabels = true }: Props) {
  if (compact) {
    return <CompactTimeline hours={hours} title={title} />;
  }

  return <UnifiedChart hours={hours} title={title} />;
}

/* ── data builders ───────────────────────────────────── */

export function buildTimelineFromHistory(history: WeatherHistoryItem[]): TimelineHour[] {
  return history.map(item => ({
    time: format(parseISO(item.collectedAt), 'HH:00'),
    temp: item.airTemperature ?? undefined,
    wind: item.windSpeed ?? undefined,
    rain: item.precipitation ?? undefined,
  }));
}

interface ForecastDay {
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

export function buildTimelineFromForecast(day: ForecastDay): TimelineHour[] {
  const hours: TimelineHour[] = [];
  for (let h = START_HOUR; h <= END_HOUR; h++) {
    const peakHour = 14;
    const distFromPeak = Math.abs(h - peakHour);
    const tempFactor = Math.max(0, 1 - distFromPeak / 5);
    const temp = Math.round(day.airTempMin + (day.airTempMax - day.airTempMin) * tempFactor);

    const windFactor = 0.3 + (h / END_HOUR) * 0.7;
    const wind = Math.round(day.windSpeedMin + (day.windSpeedMax - day.windSpeedMin) * windFactor);

    const rainProb = (day.rainProbability || 0) / 100;
    const rainFactor = h >= 13 ? 0.6 : 0.4;
    const rain = rainProb > 0 ? Math.round((day.rain || 0) * rainFactor / (rainProb > 0.5 ? 4 : 6) * 10) / 10 : 0;

    hours.push({ time: `${String(h).padStart(2, '0')}:00`, temp, wind, rain });
  }
  return hours;
}
