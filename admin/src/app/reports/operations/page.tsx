'use client';

import { useState, useEffect, useCallback } from 'react';
import { Activity, AlertTriangle } from 'lucide-react';
import { getReportOperations } from '@/services/api';
import { ReportShell, KPI, BarChart, HBar, PieList, Section, useReportDates, fmtInt } from '@/components/reports/ReportComponents';

const STATUS_PT: Record<string, string> = { PENDING: 'Pendente', IN_PROGRESS: 'Em Andamento', COMPLETED: 'Concluído', CANCELLED: 'Cancelado' };

export default function OperationsReportPage() {
  const { from, to, setFrom, setTo } = useReportDates();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(false);
    try { const r = await getReportOperations(from, to); setData(r.data); }
    catch { setError(true); }
    finally { setLoading(false); }
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  return (
    <ReportShell title="Relatório Operacional" icon={<div className="p-2.5 rounded-xl bg-violet-500/10"><Activity size={24} className="text-violet-500" /></div>} loading={loading} error={error} from={from} to={to} setFrom={setFrom} setTo={setTo} onRefresh={load}>
      {data && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <KPI label="Total Operações" value={fmtInt(data.summary.totalOperations)} color="text-violet-500" />
            <KPI label="Total Checklists" value={fmtInt(data.summary.totalChecklists)} color="text-blue-500" />
            <KPI label="Taxa de Avarias" value={`${data.summary.damageRate}%`} color={data.summary.damageRate < 10 ? 'text-green-500' : 'text-red-500'} sub={`${data.damages.withDamage} de ${data.damages.total} checklists`} />
          </div>

          <Section title="Operações por Dia">
            <BarChart data={data.dailyOps} labelKey="day" valueKey="count" />
          </Section>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Section title="Por Embarcação">
              <HBar items={data.byBoat} labelKey="name" valueKey="count" colorClass="bg-violet-500" />
            </Section>
            <Section title="Por Operador">
              <HBar items={data.byOperator} labelKey="name" valueKey="count" colorClass="bg-purple-500" />
            </Section>
            <Section title="Checklists por Status">
              <PieList items={data.checklistStats.map((s: any) => ({ ...s, label: STATUS_PT[s.status] || s.status }))} labelKey="label" valueKey="count" />
            </Section>
          </div>

          {data.damages.withDamage > 0 && (
            <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle size={16} className="text-red-500" />
                <h3 className="font-bold text-red-500">Avarias Detectadas</h3>
              </div>
              <p className="text-sm text-th-secondary">{data.damages.withDamage} checklists com marcações de avaria no casco ({data.damages.rate}% do total)</p>
            </div>
          )}
        </div>
      )}
    </ReportShell>
  );
}
