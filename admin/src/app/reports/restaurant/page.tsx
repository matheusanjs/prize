'use client';

import { useState, useEffect, useCallback } from 'react';
import { UtensilsCrossed } from 'lucide-react';
import { getReportRestaurant } from '@/services/api';
import { ReportShell, KPI, BarChart, DataTable, HBar, PieList, Section, useReportDates, fmt, fmtInt } from '@/components/reports/ReportComponents';

const STATUS_PT: Record<string, string> = { PENDING: 'Pendente', PREPARING: 'Preparando', READY: 'Pronto', DELIVERED: 'Entregue', CANCELLED: 'Cancelado' };

export default function RestaurantReportPage() {
  const { from, to, setFrom, setTo } = useReportDates();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(false);
    try { const r = await getReportRestaurant(from, to); setData(r.data); }
    catch { setError(true); }
    finally { setLoading(false); }
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  return (
    <ReportShell title="Relatório Restaurante/Bar" icon={<div className="p-2.5 rounded-xl bg-pink-500/10"><UtensilsCrossed size={24} className="text-pink-500" /></div>} loading={loading} error={error} from={from} to={to} setFrom={setFrom} setTo={setTo} onRefresh={load}>
      {data && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <KPI label="Faturamento" value={`R$ ${fmt(data.summary.totalRevenue)}`} color="text-green-500" />
            <KPI label="Total Pedidos" value={fmtInt(data.summary.totalOrders)} color="text-pink-500" />
            <KPI label="Ticket Médio" value={`R$ ${fmt(data.summary.avgTicket)}`} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Section title="Faturamento Diário">
              <BarChart data={data.dailyRevenue} labelKey="day" valueKey="total" prefix="R$ " />
            </Section>
            <Section title="Faturamento Mensal">
              <BarChart data={data.monthlyRevenue} labelKey="month" valueKey="total" prefix="R$ " />
            </Section>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Section title="Pedidos por Status">
              <PieList items={data.byStatus.map((s: any) => ({ ...s, label: STATUS_PT[s.status] || s.status }))} labelKey="label" valueKey="count" />
            </Section>
            <Section title="Forma de Pagamento">
              <HBar items={data.byPaymentMethod} labelKey="method" valueKey="total" colorClass="bg-pink-500" />
            </Section>
            <Section title="Horários de Pico">
              <div className="space-y-1.5">
                {data.hourlyDistribution.map((h: any) => {
                  const max = Math.max(...data.hourlyDistribution.map((x: any) => x.count), 1);
                  const pct = Math.round((h.count / max) * 100);
                  return (
                    <div key={h.hour} className="flex items-center gap-2">
                      <span className="text-xs text-th-muted w-8 text-right">{String(h.hour).padStart(2, '0')}h</span>
                      <div className="flex-1 h-3 bg-th-surface rounded-full overflow-hidden">
                        <div className="h-full bg-pink-500 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs font-bold text-th w-6">{h.count}</span>
                    </div>
                  );
                })}
              </div>
            </Section>
          </div>

          <Section title="Top 15 Itens Mais Vendidos">
            <DataTable columns={[
              { key: 'name', label: 'Item' },
              { key: 'quantity', label: 'Qtd', align: 'right' },
              { key: 'revenue', label: 'Faturamento', align: 'right', fmt: (v: number) => `R$ ${fmt(v)}` },
            ]} rows={data.topItems} />
          </Section>
        </div>
      )}
    </ReportShell>
  );
}
