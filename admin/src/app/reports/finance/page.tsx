'use client';

import { useState, useEffect, useCallback } from 'react';
import { Wallet, TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react';
import { getReportFinance } from '@/services/api';
import { ReportShell, KPI, BarChart, DataTable, HBar, PieList, Section, useReportDates, fmt, fmtInt } from '@/components/reports/ReportComponents';

export default function FinanceReportPage() {
  const { from, to, setFrom, setTo } = useReportDates();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(false);
    try { const r = await getReportFinance(from, to); setData(r.data); }
    catch { setError(true); }
    finally { setLoading(false); }
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  return (
    <ReportShell title="Relatório Financeiro" icon={<div className="p-2.5 rounded-xl bg-green-500/10"><Wallet size={24} className="text-green-500" /></div>} loading={loading} error={error} from={from} to={to} setFrom={setFrom} setTo={setTo} onRefresh={load}>
      {data && (
        <div className="space-y-6">
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KPI label="Total Recebido" value={`R$ ${fmt(data.summary.totalReceived)}`} color="text-green-500" />
            <KPI label="Total Cobrado" value={`R$ ${fmt(data.summary.totalCharged)}`} color="text-blue-500" />
            <KPI label="Taxa de Recebimento" value={`${data.summary.collectionRate}%`} color={data.summary.collectionRate > 70 ? 'text-green-500' : 'text-red-500'} />
            <KPI label="Métodos de Pagamento" value={fmtInt(data.paymentsByMethod.length)} />
          </div>

          {/* Charts row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Section title="Receita Diária">
              <BarChart data={data.dailyRevenue} labelKey="day" valueKey="total" prefix="R$ " />
            </Section>
            <Section title="Receita por Mês">
              <BarChart data={data.revenueByMonth} labelKey="month" valueKey="total" prefix="R$ " />
            </Section>
          </div>

          {/* Comparison */}
          <Section title="Cobrado vs Recebido por Mês">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-th">
                  <th className="py-2 px-3 text-left text-[10px] font-bold text-th-muted uppercase">Mês</th>
                  <th className="py-2 px-3 text-right text-[10px] font-bold text-th-muted uppercase">Cobrado</th>
                  <th className="py-2 px-3 text-right text-[10px] font-bold text-th-muted uppercase">Recebido</th>
                  <th className="py-2 px-3 text-right text-[10px] font-bold text-th-muted uppercase">Taxa</th>
                </tr></thead>
                <tbody>
                  {data.monthlyComparison.map((m: any) => {
                    const rate = m.charged > 0 ? Math.round((m.paid / m.charged) * 100) : 0;
                    return (
                      <tr key={m.month} className="border-b border-th/50 hover:bg-th-hover">
                        <td className="py-2.5 px-3 text-th-secondary">{m.month}</td>
                        <td className="py-2.5 px-3 text-right font-bold text-th">R$ {fmt(m.charged)}</td>
                        <td className="py-2.5 px-3 text-right font-bold text-green-500">R$ {fmt(m.paid)}</td>
                        <td className={`py-2.5 px-3 text-right font-bold ${rate > 70 ? 'text-green-500' : 'text-red-500'}`}>{rate}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Section>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Section title="Cobranças por Status">
              <PieList items={data.chargesByStatus} labelKey="status" valueKey="count" />
            </Section>
            <Section title="Cobranças por Categoria">
              <HBar items={data.chargesByCategory} labelKey="category" valueKey="total" />
            </Section>
            <Section title="Pagamentos por Método">
              <HBar items={data.paymentsByMethod} labelKey="method" valueKey="total" colorClass="bg-green-500" />
            </Section>
          </div>

          {/* Top debtors */}
          <Section title="Top 10 Devedores">
            <DataTable columns={[
              { key: 'name', label: 'Nome' },
              { key: 'email', label: 'Email' },
              { key: 'count', label: 'Cobranças', align: 'right' },
              { key: 'total', label: 'Valor', align: 'right', fmt: (v: number) => `R$ ${fmt(v)}` },
            ]} rows={data.topDebtors} />
          </Section>
        </div>
      )}
    </ReportShell>
  );
}
