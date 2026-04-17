'use client';

import { useState, useEffect, useCallback } from 'react';
import { Wrench } from 'lucide-react';
import { getReportMaintenance } from '@/services/api';
import { ReportShell, KPI, BarChart, DataTable, HBar, PieList, Section, useReportDates, fmt, fmtInt } from '@/components/reports/ReportComponents';

const STATUS_PT: Record<string, string> = { PENDING: 'Pendente', IN_PROGRESS: 'Em Andamento', COMPLETED: 'Concluída', CANCELLED: 'Cancelada' };
const PRIORITY_PT: Record<string, string> = { LOW: 'Baixa', MEDIUM: 'Média', HIGH: 'Alta', CRITICAL: 'Crítica' };

export default function MaintenanceReportPage() {
  const { from, to, setFrom, setTo } = useReportDates();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(false);
    try { const r = await getReportMaintenance(from, to); setData(r.data); }
    catch { setError(true); }
    finally { setLoading(false); }
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  return (
    <ReportShell title="Relatório de Manutenção" icon={<div className="p-2.5 rounded-xl bg-red-500/10"><Wrench size={24} className="text-red-500" /></div>} loading={loading} error={error} from={from} to={to} setFrom={setFrom} setTo={setTo} onRefresh={load}>
      {data && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <KPI label="Total Manutenções" value={fmtInt(data.summary.totalCount)} color="text-red-500" />
            <KPI label="Custo Total" value={`R$ ${fmt(data.summary.totalCost)}`} color="text-amber-500" />
            <KPI label="Tempo Médio Resolução" value={`${data.summary.avgResolutionDays} dias`} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Section title="Custo Mensal">
              <BarChart data={data.monthlyCost} labelKey="month" valueKey="cost" prefix="R$ " />
            </Section>
            <Section title="Custo por Embarcação">
              <HBar items={data.byBoat} labelKey="name" valueKey="cost" colorClass="bg-red-500" />
            </Section>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Section title="Por Status">
              <PieList items={data.byStatus.map((s: any) => ({ ...s, label: STATUS_PT[s.status] || s.status }))} labelKey="label" valueKey="count" />
            </Section>
            <Section title="Por Prioridade">
              <PieList items={data.byPriority.map((p: any) => ({ ...p, label: PRIORITY_PT[p.priority] || p.priority }))} labelKey="label" valueKey="count" />
            </Section>
          </div>

          <Section title="Últimas Manutenções">
            <DataTable columns={[
              { key: 'title', label: 'Título' },
              { key: 'boat', label: 'Embarcação', fmt: (v: any) => v?.name || '—' },
              { key: 'status', label: 'Status', fmt: (v: string) => STATUS_PT[v] || v },
              { key: 'priority', label: 'Prioridade', fmt: (v: string) => PRIORITY_PT[v] || v },
              { key: 'actualCost', label: 'Custo', align: 'right', fmt: (v: number) => v ? `R$ ${fmt(v)}` : '—' },
              { key: 'createdAt', label: 'Data', fmt: (v: string) => v ? new Date(v).toLocaleDateString('pt-BR') : '—' },
            ]} rows={data.recentItems} />
          </Section>
        </div>
      )}
    </ReportShell>
  );
}
