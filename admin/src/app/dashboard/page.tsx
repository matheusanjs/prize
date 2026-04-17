'use client';

import { useEffect, useState } from 'react';
import {
  Users, Ship, Wallet, AlertTriangle,
  TrendingUp, TrendingDown, Sparkles, Fuel, Wrench,
  Calendar, DollarSign, Anchor, Bell, ShoppingBag,
  ChevronRight, BarChart3, Clock, AlertCircle,
  ArrowUpRight, ArrowDownRight,
} from 'lucide-react';
import { getDashboardStats, getAiInsights } from '@/services/api';
import AdminWeatherCard from '@/components/AdminWeatherCard';

/* eslint-disable @typescript-eslint/no-explicit-any */

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtInt(v: number) {
  return v.toLocaleString('pt-BR');
}

export default function DashboardPage() {
  const [d, setD] = useState<any>(null);
  const [aiInsights, setAiInsights] = useState<string | null>(null);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    getDashboardStats()
      .then((r) => setD(r.data))
      .catch(() => setError(true));
  }, []);

  const handleInsights = async () => {
    setLoadingInsights(true);
    try {
      const { data } = await getAiInsights();
      setAiInsights(typeof data === 'string' ? data : data.insights || data.content || JSON.stringify(data));
    } catch {
      setAiInsights('Não foi possível gerar insights no momento.');
    } finally {
      setLoadingInsights(false);
    }
  };

  if (error) return <div className="text-center py-20 text-th-muted">Erro ao carregar dashboard.</div>;
  if (!d) return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-48 bg-th-card rounded-xl" />
      <div className="grid grid-cols-4 gap-5">{[...Array(4)].map((_, i) => <div key={i} className="h-32 bg-th-card rounded-2xl" />)}</div>
      <div className="grid grid-cols-3 gap-5">{[...Array(3)].map((_, i) => <div key={i} className="h-64 bg-th-card rounded-2xl" />)}</div>
    </div>
  );

  const f = d.finance;
  const u = d.users;
  const b = d.boats;
  const r = d.reservations;
  const fuel = d.fuel;
  const maint = d.maintenance;
  const orders = d.orders;
  const eng = d.engagement;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-black text-th">Dashboard</h1>
          <p className="text-th-muted text-sm mt-1">
            {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' })}
          </p>
        </div>
        <button
          onClick={handleInsights}
          disabled={loadingInsights}
          className="flex items-center gap-2 bg-gradient-to-r from-primary-500 to-orange-400 text-white px-5 py-2.5 rounded-2xl font-bold hover:shadow-lg hover:shadow-primary-500/25 transition-all text-sm"
        >
          <Sparkles size={18} />
          {loadingInsights ? 'Gerando...' : 'IA Insights'}
        </button>
      </div>

      {/* KPI Row 1 — Finance */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
        <KPI
          icon={<Wallet size={20} />}
          iconBg="bg-primary-500/10 text-primary-500"
          title="Receita Mensal"
          value={`R$ ${fmt(f.monthlyRevenue)}`}
          badge={f.revenueGrowth}
          sub={`Mês anterior: R$ ${fmt(f.lastMonthRevenue)}`}
        />
        <KPI
          icon={<DollarSign size={20} />}
          iconBg="bg-green-500/10 text-green-500"
          title="Recebido Hoje"
          value={`R$ ${fmt(f.todayPaymentsAmount)}`}
          sub={`${f.todayPayments} pagamento${f.todayPayments !== 1 ? 's' : ''}`}
        />
        <KPI
          icon={<AlertTriangle size={20} />}
          iconBg="bg-red-500/10 text-red-400"
          title="Inadimplência"
          value={`${f.activeDelinquents} cliente${f.activeDelinquents !== 1 ? 's' : ''}`}
          sub={`R$ ${fmt(f.delinquencyDebt)} em dívida`}
          alert={f.activeDelinquents > 0}
        />
        <KPI
          icon={<Clock size={20} />}
          iconBg="bg-amber-500/10 text-amber-500"
          title="Cobranças Pendentes"
          value={fmtInt(f.pendingCharges + f.overdueCharges)}
          sub={`R$ ${fmt(f.pendingAmount + f.overdueAmount)} total`}
          alert={f.overdueCharges > 0}
        />
      </div>

      {/* KPI Row 2 — Operations */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
        <KPI
          icon={<Calendar size={20} />}
          iconBg="bg-blue-500/10 text-blue-500"
          title="Reservas Hoje"
          value={fmtInt(r.today)}
          badge={r.growth}
          sub={`${r.confirmedToday} confirmada${r.confirmedToday !== 1 ? 's' : ''}`}
        />
        <KPI
          icon={<Ship size={20} />}
          iconBg="bg-cyan-500/10 text-cyan-500"
          title="Embarcações"
          value={`${b.inUse}/${b.total} em uso`}
          sub={`${b.occupancyRate}% ocupação · ${b.inMaintenance} em manutenção`}
        />
        <KPI
          icon={<Users size={20} />}
          iconBg="bg-violet-500/10 text-violet-500"
          title="Clientes"
          value={fmtInt(u.clients)}
          sub={`+${u.newThisMonth} este mês · ${u.operators} operador${u.operators !== 1 ? 'es' : ''}`}
        />
        <KPI
          icon={<Bell size={20} />}
          iconBg="bg-pink-500/10 text-pink-500"
          title="Engajamento Push"
          value={`${eng.reachableDevices} dispositivos`}
          sub={`${eng.notificationsLastWeek} enviadas (7 dias)`}
        />
      </div>

      {/* Revenue Chart + Charges */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 bg-th-card rounded-2xl border border-th p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-th flex items-center gap-2"><BarChart3 size={18} className="text-primary-500" /> Receita — Últimos 30 dias</h3>
            <span className="text-xs text-th-muted">Total: R$ {fmt(f.totalRevenue)}</span>
          </div>
          <MiniBarChart data={f.revenueByDay} valueKey="total" prefix="R$ " />
        </div>

        <div className="bg-th-card rounded-2xl border border-th p-6">
          <h3 className="font-bold text-th mb-4 flex items-center gap-2"><AlertCircle size={18} className="text-amber-500" /> Cobranças por Status</h3>
          <div className="space-y-3">
            {d.chargesByStatus.map((c: any) => (
              <div key={c.status} className="flex items-center justify-between">
                <span className="text-sm text-th-secondary">{statusLabel(c.status)}</span>
                <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${statusColor(c.status)}`}>{c.count}</span>
              </div>
            ))}
            {d.chargesByStatus.length === 0 && <p className="text-sm text-th-muted text-center py-4">Nenhuma cobrança</p>}
          </div>
        </div>
      </div>

      {/* Reservations + Fuel + Maintenance */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Reservations chart */}
        <div className="bg-th-card rounded-2xl border border-th p-6">
          <h3 className="font-bold text-th mb-1 flex items-center gap-2"><Calendar size={18} className="text-blue-500" /> Reservas</h3>
          <p className="text-xs text-th-muted mb-4">{r.monthTotal} este mês · {r.cancelledThisMonth} cancelada{r.cancelledThisMonth !== 1 ? 's' : ''}</p>
          <MiniBarChart data={r.reservationsByDay} valueKey="count" />
          {r.topBoats.length > 0 && (
            <div className="mt-4 pt-4 border-t border-th">
              <p className="text-xs font-bold text-th-muted uppercase mb-2">Top Embarcações</p>
              {r.topBoats.map((tb: any, i: number) => (
                <div key={i} className="flex items-center justify-between py-1">
                  <span className="text-sm text-th-secondary truncate">{tb.name}</span>
                  <span className="text-xs font-bold text-th">{tb.count} reservas</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Fuel */}
        <div className="bg-th-card rounded-2xl border border-th p-6">
          <h3 className="font-bold text-th mb-1 flex items-center gap-2"><Fuel size={18} className="text-amber-500" /> Combustível</h3>
          <p className="text-xs text-th-muted mb-4">{fuel.refuelCount} abastecimento{fuel.refuelCount !== 1 ? 's' : ''} este mês</p>
          <div className="space-y-4">
            <div className="bg-amber-500/5 rounded-xl p-4">
              <p className="text-xs font-bold text-amber-500 uppercase">Litros Consumidos</p>
              <p className="text-2xl font-black text-th">{fmt(fuel.monthLiters)} L</p>
              <p className="text-xs text-th-muted mt-1">Mês anterior: {fmt(fuel.lastMonthLiters)} L</p>
            </div>
            <div className="bg-amber-500/5 rounded-xl p-4">
              <p className="text-xs font-bold text-amber-500 uppercase">Custo Total</p>
              <p className="text-2xl font-black text-th">R$ {fmt(fuel.monthCost)}</p>
              <p className="text-xs text-th-muted mt-1">Mês anterior: R$ {fmt(fuel.lastMonthCost)}</p>
            </div>
          </div>
        </div>

        {/* Maintenance + Orders */}
        <div className="space-y-5">
          <div className="bg-th-card rounded-2xl border border-th p-6">
            <h3 className="font-bold text-th mb-3 flex items-center gap-2"><Wrench size={18} className="text-red-400" /> Manutenção</h3>
            <div className="grid grid-cols-3 gap-3">
              <MiniStat label="Ativas" value={maint.active} color="text-amber-500" />
              <MiniStat label="Críticas" value={maint.critical} color="text-red-500" alert={maint.critical > 0} />
              <MiniStat label="Concluídas" value={maint.completedThisMonth} color="text-green-500" />
            </div>
          </div>
          <div className="bg-th-card rounded-2xl border border-th p-6">
            <h3 className="font-bold text-th mb-3 flex items-center gap-2"><ShoppingBag size={18} className="text-green-500" /> Pedidos (Bar/Rest.)</h3>
            <div className="grid grid-cols-2 gap-3">
              <MiniStat label="Hoje" value={orders.today} color="text-blue-500" />
              <MiniStat label="Mês" value={orders.monthTotal} color="text-th" />
            </div>
            <div className="mt-3 pt-3 border-t border-th grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] font-bold text-th-muted uppercase">Receita Hoje</p>
                <p className="text-sm font-black text-th">R$ {fmt(orders.todayRevenue)}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-th-muted uppercase">Receita Mês</p>
                <p className="text-sm font-black text-th">R$ {fmt(orders.monthRevenue)}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Weather */}
      <AdminWeatherCard />

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-th-card rounded-2xl border border-th p-6">
          <h3 className="font-bold text-th mb-4 flex items-center gap-2"><Anchor size={18} className="text-blue-500" /> Últimas Reservas</h3>
          <div className="space-y-3">
            {d.recentActivity.reservations.map((rv: any) => (
              <div key={rv.id} className="flex items-center gap-3 py-2 border-b border-th last:border-0">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${rv.status === 'CONFIRMED' ? 'bg-green-500' : rv.status === 'CANCELLED' ? 'bg-red-500' : 'bg-amber-500'}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-th truncate">{rv.user?.name || 'Sem nome'}</p>
                  <p className="text-xs text-th-muted">{rv.boat?.name} · {new Date(rv.startDate).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' })}</p>
                </div>
                <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-md ${rv.status === 'CONFIRMED' ? 'bg-green-500/10 text-green-500' : rv.status === 'CANCELLED' ? 'bg-red-500/10 text-red-400' : 'bg-amber-500/10 text-amber-500'}`}>
                  {rv.status === 'CONFIRMED' ? 'Confirmada' : rv.status === 'CANCELLED' ? 'Cancelada' : rv.status === 'PENDING' ? 'Pendente' : rv.status}
                </span>
              </div>
            ))}
            {d.recentActivity.reservations.length === 0 && <p className="text-sm text-th-muted text-center py-4">Nenhuma reserva recente</p>}
          </div>
        </div>

        <div className="bg-th-card rounded-2xl border border-th p-6">
          <h3 className="font-bold text-th mb-4 flex items-center gap-2"><DollarSign size={18} className="text-green-500" /> Últimos Pagamentos</h3>
          <div className="space-y-3">
            {d.recentActivity.payments.map((p: any) => (
              <div key={p.id} className="flex items-center gap-3 py-2 border-b border-th last:border-0">
                <div className="w-8 h-8 rounded-full bg-green-500/10 flex items-center justify-center flex-shrink-0">
                  <DollarSign size={14} className="text-green-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-th truncate">{p.charge?.user?.name || 'Desconhecido'}</p>
                  <p className="text-xs text-th-muted">{p.charge?.description || p.method} · {p.paidAt ? new Date(p.paidAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }) : ''}</p>
                </div>
                <span className="text-sm font-bold text-green-500">R$ {fmt(p.amount)}</span>
              </div>
            ))}
            {d.recentActivity.payments.length === 0 && <p className="text-sm text-th-muted text-center py-4">Nenhum pagamento recente</p>}
          </div>
        </div>
      </div>

      {/* AI Insights */}
      {aiInsights && (
        <div className="bg-th-card rounded-2xl border border-th p-6">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles size={20} className="text-primary-400" />
            <h3 className="font-bold text-th">Insights da IA</h3>
          </div>
          <div className="whitespace-pre-wrap text-th-secondary text-sm leading-relaxed">{aiInsights}</div>
        </div>
      )}
    </div>
  );
}

/* ── Sub-components ─────────────────────────────────── */

function KPI({ icon, iconBg, title, value, badge, sub, alert }: {
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  value: string;
  badge?: number;
  sub?: string;
  alert?: boolean;
}) {
  return (
    <div className={`bg-th-card rounded-2xl border p-5 transition-colors ${alert ? 'border-red-500/30' : 'border-th hover:border-th'}`}>
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${iconBg}`}>{icon}</div>
        <span className="text-xs text-th-muted font-semibold uppercase tracking-wide">{title}</span>
        {badge !== undefined && badge !== 0 && (
          <span className={`ml-auto flex items-center gap-0.5 text-xs font-bold ${badge > 0 ? 'text-green-500' : 'text-red-400'}`}>
            {badge > 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
            {Math.abs(badge)}%
          </span>
        )}
      </div>
      <p className="text-xl font-black text-th">{value}</p>
      {sub && <p className="text-xs text-th-muted mt-1">{sub}</p>}
    </div>
  );
}

function MiniStat({ label, value, color, alert }: { label: string; value: number; color: string; alert?: boolean }) {
  return (
    <div className={`text-center p-2 rounded-xl ${alert ? 'bg-red-500/5 ring-1 ring-red-500/20' : ''}`}>
      <p className={`text-xl font-black ${color}`}>{value}</p>
      <p className="text-[10px] text-th-muted font-semibold uppercase">{label}</p>
    </div>
  );
}

function MiniBarChart({ data, valueKey, prefix }: { data: { day: string; [k: string]: any }[]; valueKey: string; prefix?: string }) {
  if (!data || data.length === 0) return <p className="text-sm text-th-muted text-center py-8">Sem dados</p>;
  const max = Math.max(...data.map((d) => d[valueKey] || 0), 1);
  return (
    <div className="flex items-end gap-[2px] h-40">
      {data.map((item, i) => {
        const val = item[valueKey] || 0;
        const pct = Math.max((val / max) * 100, 2);
        const dayLabel = new Date(item.day + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' });
        return (
          <div key={i} className="flex-1 flex flex-col items-center justify-end h-full group relative">
            <div className="absolute bottom-full mb-1 hidden group-hover:block z-10 bg-th-card border border-th rounded-lg px-2 py-1 text-[10px] text-th font-bold shadow-lg whitespace-nowrap">
              {prefix || ''}{typeof val === 'number' ? fmt(val) : val} · {dayLabel}
            </div>
            <div
              className="w-full bg-primary-500/80 rounded-t-sm hover:bg-primary-500 transition-colors min-h-[2px]"
              style={{ height: `${pct}%` }}
            />
          </div>
        );
      })}
    </div>
  );
}

function statusLabel(s: string) {
  const map: Record<string, string> = { PENDING: 'Pendentes', PAID: 'Pagas', OVERDUE: 'Atrasadas', CANCELLED: 'Canceladas', PARTIALLY_PAID: 'Parcialmente Pagas' };
  return map[s] || s;
}

function statusColor(s: string) {
  const map: Record<string, string> = {
    PENDING: 'bg-amber-500/10 text-amber-500',
    PAID: 'bg-green-500/10 text-green-500',
    OVERDUE: 'bg-red-500/10 text-red-400',
    CANCELLED: 'bg-gray-500/10 text-gray-400',
    PARTIALLY_PAID: 'bg-blue-500/10 text-blue-500',
  };
  return map[s] || 'bg-gray-500/10 text-gray-400';
}
