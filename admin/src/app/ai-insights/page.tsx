'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Sparkles, RefreshCw, TrendingUp, AlertTriangle, AlertCircle,
  Lightbulb, Target, DollarSign, Anchor, Fuel, Wrench, Users, BarChart3,
  CheckCircle2, Clock, ArrowUp, ArrowDown, Minus, ChevronDown, ChevronUp,
  Zap, ShieldAlert, Info, Star,
} from 'lucide-react';
import { getAiInsights, generateAiInsights } from '@/services/api';

// ─── Types ─────────────────────────────────────────────────────────────────

interface KpiRevenue {
  today: number; yesterday: number; dayGrowthPct: number;
  week: number; prevWeek: number; weekGrowthPct: number;
  month: number; prevMonth: number; monthGrowthPct: number;
  monthForecast: number; monthDailyAvg: number; paymentsCountMonth: number;
}
interface KpiReservations {
  today: number; yesterday: number; dayGrowthPct: number;
  week: number; weekGrowthPct: number;
  month: number; prevMonth: number; monthGrowthPct: number;
  cancelledMonth: number; cancelRatePct: number;
}
interface KpiDelinquency {
  pendingAmount: number; pendingCount: number;
  overdueAmount: number; overdueCount: number;
  activeCount: number; totalActiveAmount: number;
}
interface KpiUsers {
  total: number; active: number;
  newClientsMonth: number; clientGrowthPct: number;
}
interface KpiOperations {
  boatsTotal: number; boatsInUse: number; boatsAvailable: number; boatsMaintenance: number; occupancyRatePct: number;
}
interface KpiFuel {
  monthLiters: number; monthCost: number; monthRefuels: number;
  prevMonthLiters: number; litersGrowthPct: number;
}
interface KpiMaintenance { activePending: number; criticalPending: number; completedMonth: number; }
interface KpiTopBoat { boatId: string; name: string; model: string; reservations: number; }
interface Kpis {
  period: { dayOfMonth: number; daysInMonth: number };
  revenue: KpiRevenue; reservations: KpiReservations; delinquency: KpiDelinquency;
  users: KpiUsers; operations: KpiOperations; fuel: KpiFuel;
  maintenance: KpiMaintenance; topBoatsMonth: KpiTopBoat[];
}
interface Alert { level: 'high' | 'medium' | 'low'; title: string; description: string; action: string; }
interface Suggestion { title: string; description: string; impact: 'high' | 'medium' | 'low'; }
interface InsightData {
  kpis: Kpis;
  executiveSummary: string; highlights: string[];
  alerts: Alert[]; suggestions: Suggestion[];
  trends: { revenue: string; reservations: string; delinquency: string; operations: string; };
  predictions: { monthEndRevenueEstimate: number; reasoning: string; };
  focusOfWeek: string;
}
interface Insight { id: string; createdAt: string; provider: string; durationMs: number; data: InsightData; }

// ─── Helpers ────────────────────────────────────────────────────────────────

const fmt = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const fmtDec = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;

function DeltaBadge({ value }: { value: number }) {
  const pos = value >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${pos ? 'text-green-500' : 'text-red-500'}`}>
      {value > 0.5 ? <ArrowUp size={10} /> : value < -0.5 ? <ArrowDown size={10} /> : <Minus size={10} />}
      {pct(value)}
    </span>
  );
}

function KpiCard({ icon: Icon, label, value, sub, delta, color = 'text-primary-500' }: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: any; label: string; value: string; sub?: string;
  delta?: number; color?: string;
}) {
  return (
    <div className="bg-th-card border border-th rounded-2xl p-4 flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <Icon size={17} className={color} />
        {delta !== undefined && <DeltaBadge value={delta} />}
      </div>
      <p className="text-xl font-bold text-th mt-1 leading-tight">{value}</p>
      <p className="text-xs text-th-muted">{label}</p>
      {sub && <p className="text-[11px] text-th-muted/70">{sub}</p>}
    </div>
  );
}

const ALERT_CFG = {
  high: { icon: ShieldAlert, bg: 'bg-red-500/10 border-red-500/30', text: 'text-red-400', badge: 'bg-red-500/20 text-red-400', label: 'CRÍTICO' },
  medium: { icon: AlertCircle, bg: 'bg-orange-500/10 border-orange-500/30', text: 'text-orange-400', badge: 'bg-orange-500/20 text-orange-400', label: 'ATENÇÃO' },
  low: { icon: Info, bg: 'bg-blue-500/10 border-blue-500/30', text: 'text-blue-400', badge: 'bg-blue-500/20 text-blue-400', label: 'INFO' },
};
const IMPACT_CFG = {
  high: { color: 'text-primary-500', badge: 'bg-primary-500/20 text-primary-400', label: 'ALTO IMPACTO' },
  medium: { color: 'text-yellow-400', badge: 'bg-yellow-500/20 text-yellow-400', label: 'MÉDIO' },
  low: { color: 'text-blue-400', badge: 'bg-blue-500/20 text-blue-400', label: 'BAIXO' },
};

// ─── Page ────────────────────────────────────────────────────────────────────

export default function AiInsightsPage() {
  const [insight, setInsight] = useState<Insight | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [openAlerts, setOpenAlerts] = useState<Set<number>>(new Set());
  const [openSugs, setOpenSugs] = useState<Set<number>>(new Set());

  const toggle = (set: Set<number>, i: number) => { const s = new Set(set); s.has(i) ? s.delete(i) : s.add(i); return s; };

  const load = useCallback(async () => {
    try {
      const { data } = await getAiInsights();
      if (data?.data) setInsight(data as Insight);
    } catch { /* nenhum salvo ainda */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const generate = async () => {
    setGenerating(true);
    try {
      const { data } = await generateAiInsights();
      if (data?.data) setInsight(data as Insight);
    } catch (e: any) {
      alert('Erro ao gerar: ' + (e?.response?.data?.message || e?.message || 'desconhecido'));
    } finally { setGenerating(false); }
  };

  const d = insight?.data;
  const k = d?.kpis;

  return (
    <div className="space-y-6">

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold text-th flex items-center gap-2">
            <Sparkles className="text-primary-500" size={22} /> IA Insights
          </h1>
          <p className="text-th-muted text-sm mt-0.5">Análise inteligente da operação da marina · powered by ChatGPT</p>
        </div>
        <div className="flex flex-col sm:flex-row items-end sm:items-center gap-2">
          {insight && (
            <span className="text-[11px] text-th-muted text-right">
              {new Date(insight.createdAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
              {' · '}<span className="capitalize">{insight.provider}</span>
              {' · '}{(insight.durationMs / 1000).toFixed(1)}s
            </span>
          )}
          <button
            onClick={generate} disabled={generating}
            className="flex items-center gap-2 bg-gradient-to-r from-primary-500 to-orange-400 text-white px-5 py-2.5 rounded-xl font-semibold hover:shadow-lg hover:shadow-primary-500/20 transition-all disabled:opacity-50 text-sm"
          >
            {generating ? <RefreshCw size={14} className="animate-spin" /> : <Zap size={14} />}
            {generating ? 'Analisando...' : 'Gerar Insights'}
          </button>
        </div>
      </div>

      {/* ── States ─────────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="animate-spin text-th-muted" size={28} />
        </div>
      ) : !insight ? (
        <div className="bg-th-card border border-th rounded-2xl p-16 text-center">
          <Sparkles size={48} className="text-primary-500/40 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-th">Nenhum insight gerado ainda</h3>
          <p className="text-th-muted text-sm mt-2 max-w-sm mx-auto">
            Clique em &quot;Gerar Insights&quot; para que a IA analise os dados reais da marina.
          </p>
        </div>
      ) : (
        <>

          {/* ── Focus of Week ─────────────────────────────────────────── */}
          {d?.focusOfWeek && (
            <div className="flex items-center gap-3 bg-gradient-to-r from-primary-500/10 to-orange-400/10 border border-primary-500/25 rounded-2xl px-5 py-3.5">
              <Star size={16} className="text-primary-500 flex-shrink-0" />
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-primary-400">Foco da Semana</p>
                <p className="text-sm font-semibold text-th mt-0.5">{d.focusOfWeek}</p>
              </div>
            </div>
          )}

          {/* ── Receita ──────────────────────────────────────────────── */}
          {k && (
            <>
              <section>
                <SectionTitle icon={DollarSign} label="Receita" />
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <KpiCard icon={DollarSign} label="Hoje" value={fmtDec(k.revenue.today)} sub={`Ontem: ${fmtDec(k.revenue.yesterday)}`} delta={k.revenue.dayGrowthPct} color="text-green-500" />
                  <KpiCard icon={BarChart3} label="Semana" value={fmt(k.revenue.week)} sub={`Sem. ant: ${fmt(k.revenue.prevWeek)}`} delta={k.revenue.weekGrowthPct} color="text-blue-500" />
                  <KpiCard icon={TrendingUp} label="Mês atual" value={fmt(k.revenue.month)} sub={`Mês ant: ${fmt(k.revenue.prevMonth)}`} delta={k.revenue.monthGrowthPct} color="text-primary-500" />
                  <KpiCard icon={Target} label="Projeção mês" value={fmt(k.revenue.monthForecast)} sub={`Dia ${k.period.dayOfMonth}/${k.period.daysInMonth} · ${fmtDec(k.revenue.monthDailyAvg)}/dia`} color="text-orange-400" />
                </div>
              </section>

              {/* ── Reservas & Ops ──────────────────────────────────────── */}
              <section>
                <SectionTitle icon={Anchor} label="Reservas & Operacional" />
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <KpiCard icon={Anchor} label="Reservas hoje" value={String(k.reservations.today)} sub={`Semana: ${k.reservations.week}`} delta={k.reservations.dayGrowthPct} color="text-cyan-500" />
                  <KpiCard icon={BarChart3} label="Reservas mês" value={String(k.reservations.month)} sub={`Canc.: ${k.reservations.cancelRatePct.toFixed(0)}%`} delta={k.reservations.monthGrowthPct} color="text-cyan-400" />
                  <KpiCard icon={Target} label="Ocupação" value={`${k.operations.occupancyRatePct.toFixed(0)}%`} sub={`${k.operations.boatsInUse}/${k.operations.boatsTotal} em uso`} color="text-purple-500" />
                  <KpiCard icon={Wrench} label="Manutenções" value={String(k.maintenance.activePending)} sub={`${k.maintenance.criticalPending} críticas · ${k.maintenance.completedMonth} concluídas mês`} color={k.maintenance.criticalPending > 0 ? 'text-red-500' : 'text-th-muted'} />
                </div>
              </section>

              {/* ── Financeiro & Pessoas ─────────────────────────────────── */}
              <section>
                <SectionTitle icon={AlertTriangle} label="Financeiro & Pessoas" />
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <KpiCard icon={ShieldAlert} label="Inadimplência ativa" value={fmtDec(k.delinquency.totalActiveAmount)} sub={`${k.delinquency.activeCount} clientes`} color="text-red-500" />
                  <KpiCard icon={AlertCircle} label="Cobranças vencidas" value={fmtDec(k.delinquency.overdueAmount)} sub={`${k.delinquency.overdueCount} cobranças`} color="text-orange-500" />
                  <KpiCard icon={Users} label="Novos clientes/mês" value={String(k.users.newClientsMonth)} sub={`Total ativo: ${k.users.active}`} delta={k.users.clientGrowthPct} color="text-indigo-400" />
                  <KpiCard icon={Fuel} label="Combustível mês" value={`${(k.fuel.monthLiters || 0).toLocaleString('pt-BR')}L`} sub={`${fmt(k.fuel.monthCost)} · ${k.fuel.monthRefuels} abastec.`} delta={k.fuel.litersGrowthPct} color="text-yellow-400" />
                </div>
              </section>

              {/* ── Top Boats ──────────────────────────────────────────── */}
              {k.topBoatsMonth.length > 0 && (
                <section>
                  <SectionTitle icon={Star} label="Top Embarcações do Mês" />
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    {k.topBoatsMonth.map((b, i) => (
                      <div key={b.boatId} className="bg-th-card border border-th rounded-xl p-3 flex items-center gap-3">
                        <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black flex-shrink-0 ${i === 0 ? 'bg-primary-500/20 text-primary-400' : 'bg-th text-th-muted'}`}>{i + 1}</span>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-th truncate">{b.name}</p>
                          <p className="text-[11px] text-th-muted">{b.reservations} reservas</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}

          {/* ── Highlights ─────────────────────────────────────────── */}
          {d?.highlights && d.highlights.length > 0 && (
            <section>
              <SectionTitle icon={CheckCircle2} label="Destaques Positivos" />
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {d.highlights.map((h, i) => (
                  <div key={i} className="flex items-start gap-2.5 bg-green-500/5 border border-green-500/20 rounded-xl px-4 py-3">
                    <CheckCircle2 size={13} className="text-green-500 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-th">{h}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── Alertas ────────────────────────────────────────────── */}
          {d?.alerts && d.alerts.length > 0 && (
            <section>
              <SectionTitle icon={ShieldAlert} label={`Alertas (${d.alerts.length})`} />
              <div className="space-y-2">
                {d.alerts.map((a, i) => {
                  const c = ALERT_CFG[a.level]; const Icon = c.icon; const open = openAlerts.has(i);
                  return (
                    <div key={i} className={`border rounded-xl overflow-hidden ${c.bg}`}>
                      <button onClick={() => setOpenAlerts(toggle(openAlerts, i))} className="w-full flex items-center gap-3 px-4 py-3 text-left">
                        <Icon size={15} className={c.text} />
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded ${c.badge} flex-shrink-0`}>{c.label}</span>
                        <p className="text-sm font-semibold text-th flex-1">{a.title}</p>
                        {open ? <ChevronUp size={13} className="text-th-muted" /> : <ChevronDown size={13} className="text-th-muted" />}
                      </button>
                      {open && (
                        <div className="px-4 pb-4 space-y-2 border-t border-current/10">
                          <p className="text-sm text-th-muted pt-3">{a.description}</p>
                          <div className="flex items-start gap-2 bg-white/5 rounded-lg px-3 py-2">
                            <Zap size={11} className={`${c.text} flex-shrink-0 mt-0.5`} />
                            <p className="text-xs font-semibold text-th">{a.action}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* ── Tendências ─────────────────────────────────────────── */}
          {d?.trends && (
            <section>
              <SectionTitle icon={TrendingUp} label="Tendências" />
              <div className="grid sm:grid-cols-2 gap-3">
                {(Object.entries(d.trends) as [string, string][]).map(([key, text]) => {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const icons: Record<string, any> = { revenue: DollarSign, reservations: Anchor, delinquency: AlertTriangle, operations: Wrench };
                  const labels: Record<string, string> = { revenue: 'Receita', reservations: 'Reservas', delinquency: 'Inadimplência', operations: 'Operacional' };
                  const Icon = icons[key] || BarChart3;
                  return (
                    <div key={key} className="bg-th-card border border-th rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Icon size={13} className="text-primary-500" />
                        <p className="text-[10px] font-bold text-th-muted uppercase tracking-wider">{labels[key] || key}</p>
                      </div>
                      <p className="text-sm text-th leading-relaxed">{text}</p>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* ── Sugestões ──────────────────────────────────────────── */}
          {d?.suggestions && d.suggestions.length > 0 && (
            <section>
              <SectionTitle icon={Lightbulb} label={`Sugestões Estratégicas (${d.suggestions.length})`} />
              <div className="space-y-2">
                {d.suggestions.map((s, i) => {
                  const c = IMPACT_CFG[s.impact]; const open = openSugs.has(i);
                  return (
                    <div key={i} className="bg-th-card border border-th rounded-xl overflow-hidden">
                      <button onClick={() => setOpenSugs(toggle(openSugs, i))} className="w-full flex items-center gap-3 px-4 py-3 text-left">
                        <Lightbulb size={14} className={c.color} />
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded ${c.badge} flex-shrink-0`}>{c.label}</span>
                        <p className="text-sm font-semibold text-th flex-1">{s.title}</p>
                        {open ? <ChevronUp size={13} className="text-th-muted" /> : <ChevronDown size={13} className="text-th-muted" />}
                      </button>
                      {open && (
                        <div className="px-4 pb-4 border-t border-th">
                          <p className="text-sm text-th-muted pt-3 leading-relaxed">{s.description}</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* ── Previsão ───────────────────────────────────────────── */}
          {d?.predictions && (
            <section>
              <SectionTitle icon={Clock} label="Previsão de Fechamento" />
              <div className="bg-gradient-to-r from-primary-500/10 to-orange-400/10 border border-primary-500/20 rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <div className="flex-shrink-0">
                  <p className="text-[10px] font-black uppercase tracking-widest text-primary-400 mb-1">Receita estimada até fim do mês</p>
                  <p className="text-3xl font-black text-th">{fmtDec(d.predictions.monthEndRevenueEstimate)}</p>
                </div>
                <div className="text-sm text-th-muted leading-relaxed border-t sm:border-t-0 sm:border-l border-primary-500/20 pt-3 sm:pt-0 sm:pl-5">
                  {d.predictions.reasoning}
                </div>
              </div>
            </section>
          )}

          {/* ── Resumo Executivo ───────────────────────────────────── */}
          {d?.executiveSummary && (
            <section>
              <SectionTitle icon={BarChart3} label="Resumo Executivo da IA" />
              <div className="bg-th-card border border-th rounded-2xl p-5 space-y-2">
                {d.executiveSummary.split('\n').filter(Boolean).map((p, i) => (
                  <p key={i} className="text-sm text-th-muted leading-relaxed">{p}</p>
                ))}
              </div>
            </section>
          )}

        </>
      )}
    </div>
  );
}

function SectionTitle({ icon: Icon, label }: { icon: any; label: string }) {
  return (
    <h2 className="text-[11px] font-bold uppercase tracking-wider text-th-muted mb-3 flex items-center gap-2">
      <Icon size={12} />{label}
    </h2>
  );
}
