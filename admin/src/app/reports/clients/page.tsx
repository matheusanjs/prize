'use client';

import { useState, useEffect, useCallback } from 'react';
import { Users } from 'lucide-react';
import { getReportClients } from '@/services/api';
import { ReportShell, KPI, BarChart, DataTable, HBar, Section, useReportDates, fmt, fmtInt } from '@/components/reports/ReportComponents';

export default function ClientsReportPage() {
  const { from, to, setFrom, setTo } = useReportDates();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(false);
    try { const r = await getReportClients(from, to); setData(r.data); }
    catch { setError(true); }
    finally { setLoading(false); }
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  return (
    <ReportShell title="Relatório de Clientes" icon={<div className="p-2.5 rounded-xl bg-teal-500/10"><Users size={24} className="text-teal-500" /></div>} loading={loading} error={error} from={from} to={to} setFrom={setFrom} setTo={setTo} onRefresh={load}>
      {data && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KPI label="Clientes Ativos" value={fmtInt(data.summary.totalActiveClients)} color="text-teal-500" />
            <KPI label="Pagamento em Dia" value={`${data.summary.onTimePaymentRate}%`} color={data.summary.onTimePaymentRate > 70 ? 'text-green-500' : 'text-red-500'} />
            <KPI label="Pgtos em Dia" value={fmtInt(data.summary.on_time)} color="text-green-500" />
            <KPI label="Inadimplentes" value={fmtInt(data.summary.defaulting)} color="text-red-500" />
          </div>

          {/* Payment behavior */}
          <Section title="Comportamento de Pagamento">
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-green-500/10 rounded-xl p-4 text-center">
                <p className="text-2xl font-black text-green-500">{fmtInt(data.paymentBehavior.on_time)}</p>
                <p className="text-xs text-th-muted mt-1">Em dia</p>
              </div>
              <div className="bg-amber-500/10 rounded-xl p-4 text-center">
                <p className="text-2xl font-black text-amber-500">{fmtInt(data.paymentBehavior.late)}</p>
                <p className="text-xs text-th-muted mt-1">Atrasados</p>
              </div>
              <div className="bg-red-500/10 rounded-xl p-4 text-center">
                <p className="text-2xl font-black text-red-500">{fmtInt(data.paymentBehavior.defaulting)}</p>
                <p className="text-xs text-th-muted mt-1">Inadimplentes</p>
              </div>
            </div>
          </Section>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Section title="Novos Clientes por Mês">
              <BarChart data={data.newClients} labelKey="month" valueKey="count" />
            </Section>
            <Section title="Clientes Ativos por Mês">
              <BarChart data={data.engagementByMonth} labelKey="month" valueKey="active_clients" />
            </Section>
          </div>

          <Section title="Top 10 Gastadores">
            <HBar items={data.topSpenders} labelKey="name" valueKey="total" colorClass="bg-teal-500" />
          </Section>

          <Section title="Atividade dos Clientes">
            <DataTable columns={[
              { key: 'name', label: 'Nome' },
              { key: 'email', label: 'Email' },
              { key: 'reservations', label: 'Reservas', align: 'right' },
              { key: 'payments_total', label: 'Pagamentos', align: 'right', fmt: (v: number) => `R$ ${fmt(v)}` },
              { key: 'last_reservation', label: 'Última Reserva', fmt: (v: string) => v ? new Date(v).toLocaleDateString('pt-BR') : '—' },
            ]} rows={data.clientActivity} />
          </Section>
        </div>
      )}
    </ReportShell>
  );
}
