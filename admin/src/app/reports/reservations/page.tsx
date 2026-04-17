'use client';

import { useState, useEffect, useCallback } from 'react';
import { Calendar } from 'lucide-react';
import { getReportReservations } from '@/services/api';
import { ReportShell, KPI, BarChart, DataTable, HBar, PieList, Section, useReportDates, fmt, fmtInt } from '@/components/reports/ReportComponents';

const DOW_PT: Record<number, string> = { 0: 'Domingo', 1: 'Segunda', 2: 'Terça', 3: 'Quarta', 4: 'Quinta', 5: 'Sexta', 6: 'Sábado' };

export default function ReservationsReportPage() {
  const { from, to, setFrom, setTo } = useReportDates();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(false);
    try { const r = await getReportReservations(from, to); setData(r.data); }
    catch { setError(true); }
    finally { setLoading(false); }
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  return (
    <ReportShell title="Relatório de Reservas" icon={<div className="p-2.5 rounded-xl bg-blue-500/10"><Calendar size={24} className="text-blue-500" /></div>} loading={loading} error={error} from={from} to={to} setFrom={setFrom} setTo={setTo} onRefresh={load}>
      {data && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KPI label="Total de Reservas" value={fmtInt(data.summary.total)} color="text-blue-500" />
            <KPI label="Canceladas" value={fmtInt(data.summary.cancelled)} color="text-red-500" />
            <KPI label="Taxa Cancelamento" value={`${data.summary.cancellationRate}%`} color={data.summary.cancellationRate < 20 ? 'text-green-500' : 'text-red-500'} />
            <KPI label="Duração Média" value={`${data.summary.avgDurationHours}h`} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Section title="Volume Diário">
              <BarChart data={data.dailyVolume} labelKey="day" valueKey="count" />
            </Section>
            <Section title="Volume Mensal">
              <BarChart data={data.monthlyVolume} labelKey="month" valueKey="count" />
            </Section>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Section title="Por Status">
              <PieList items={data.byStatus} labelKey="status" valueKey="count" />
            </Section>
            <Section title="Por Dia da Semana">
              <HBar items={data.byDayOfWeek.map((d: any) => ({ ...d, label: DOW_PT[d.dow] || d.label?.trim() }))} labelKey="label" valueKey="count" colorClass="bg-blue-500" />
            </Section>
            <Section title="Top 10 Clientes">
              <HBar items={data.topClients} labelKey="name" valueKey="count" colorClass="bg-cyan-500" />
            </Section>
          </div>

          <Section title="Reservas por Embarcação">
            <DataTable columns={[
              { key: 'name', label: 'Embarcação' },
              { key: 'count', label: 'Total', align: 'right' },
              { key: 'confirmed', label: 'Confirmadas', align: 'right' },
              { key: 'cancelled', label: 'Canceladas', align: 'right' },
            ]} rows={data.byBoat} />
          </Section>
        </div>
      )}
    </ReportShell>
  );
}
