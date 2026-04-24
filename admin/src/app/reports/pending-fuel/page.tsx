'use client';

import { useState, useEffect, useCallback } from 'react';
import { Fuel, AlertTriangle } from 'lucide-react';
import { getReportPendingFuel } from '@/services/api';
import { ReportShell, KPI, DataTable, Section, useReportDates } from '@/components/reports/ReportComponents';

export default function PendingFuelReportPage() {
  const { from, to, setFrom, setTo } = useReportDates();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(false);
    try { const r = await getReportPendingFuel(from, to); setData(r.data); }
    catch { setError(true); }
    finally { setLoading(false); }
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  return (
    <ReportShell title="Abastecimentos Pendentes" icon={<div className="p-2.5 rounded-xl bg-amber-500/10"><Fuel size={24} className="text-amber-500" /></div>} loading={loading} error={error} from={from} to={to} setFrom={setFrom} setTo={setTo} onRefresh={load}>
      {data && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <KPI label="Pendentes" value={String(data.summary.totalPending)} color="text-amber-500" />
            <KPI label="Embarcações" value={String(data.summary.uniqueBoats)} color="text-blue-500" />
            <KPI label="Clientes" value={String(data.summary.uniqueClients)} color="text-emerald-500" />
          </div>

          <Section title="Checklists sem Cobrança de Combustível">
            {data.pending.length === 0 ? (
              <div className="text-center py-8 text-th-muted">
                <AlertTriangle size={32} className="mx-auto mb-2 text-green-500" />
                <p>Nenhum abastecimento pendente encontrado</p>
              </div>
            ) : (
              <DataTable
                columns={[
                  { key: 'boat', label: 'Embarcação', fmt: (v: any) => v?.name || '-' },
                  { key: 'client', label: 'Cliente', fmt: (v: any) => v?.name || '-' },
                  { key: 'operator', label: 'Operador', fmt: (v: any) => v?.name || '-' },
                  { key: 'completedAt', label: 'Checklist', fmt: (v: string) => v ? new Date(v).toLocaleDateString('pt-BR') : '—' },
                  { key: 'returnCompletedAt', label: 'Retorno', fmt: (v: string) => v ? new Date(v).toLocaleDateString('pt-BR') : '—' },
                  { key: 'hasFuelPhoto', label: 'Foto', fmt: (v: boolean) => v ? '✅' : '—' },
                  { key: 'lifeVestsLoaned', label: 'Coletes', fmt: (v: number) => v ? String(v) : '—' },
                ]}
                rows={data.pending}
              />
            )}
          </Section>
        </div>
      )}
    </ReportShell>
  );
}