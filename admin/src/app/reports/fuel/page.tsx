'use client';

import { useState, useEffect, useCallback } from 'react';
import { Fuel } from 'lucide-react';
import { getReportFuel } from '@/services/api';
import { ReportShell, KPI, BarChart, DataTable, HBar, Section, useReportDates, fmt, fmtInt } from '@/components/reports/ReportComponents';

export default function FuelReportPage() {
  const { from, to, setFrom, setTo } = useReportDates();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(false);
    try { const r = await getReportFuel(from, to); setData(r.data); }
    catch { setError(true); }
    finally { setLoading(false); }
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  return (
    <ReportShell title="Relatório de Combustível" icon={<div className="p-2.5 rounded-xl bg-amber-500/10"><Fuel size={24} className="text-amber-500" /></div>} loading={loading} error={error} from={from} to={to} setFrom={setFrom} setTo={setTo} onRefresh={load}>
      {data && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KPI label="Total Litros" value={`${fmt(data.summary.totalLiters)} L`} color="text-amber-500" />
            <KPI label="Custo Total" value={`R$ ${fmt(data.summary.totalCost)}`} color="text-red-500" />
            <KPI label="Abastecimentos" value={fmtInt(data.summary.refuelCount)} />
            <KPI label="Preço Médio/L" value={`R$ ${fmt(data.summary.avgPrice)}`} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Section title="Consumo Diário (Litros)">
              <BarChart data={data.dailyConsumption} labelKey="day" valueKey="liters" />
            </Section>
            <Section title="Custo Mensal">
              <BarChart data={data.byMonth} labelKey="month" valueKey="cost" prefix="R$ " />
            </Section>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Section title="Consumo por Embarcação">
              <HBar items={data.byBoat} labelKey="name" valueKey="cost" colorClass="bg-amber-500" />
            </Section>
            <Section title="Por Operador">
              <HBar items={data.byOperator} labelKey="name" valueKey="count" colorClass="bg-orange-500" />
            </Section>
          </div>

          <Section title="Detalhes por Embarcação">
            <DataTable columns={[
              { key: 'name', label: 'Embarcação' },
              { key: 'count', label: 'Abast.', align: 'right' },
              { key: 'liters', label: 'Litros', align: 'right', fmt: (v: number) => fmt(v) },
              { key: 'cost', label: 'Custo', align: 'right', fmt: (v: number) => `R$ ${fmt(v)}` },
            ]} rows={data.byBoat} />
          </Section>

          {data.priceHistory && data.priceHistory.length > 0 && (
            <Section title="Histórico de Preços">
              <DataTable columns={[
                { key: 'fuelType', label: 'Tipo' },
                { key: 'pricePerLiter', label: 'Preço/L', align: 'right', fmt: (v: number) => `R$ ${fmt(v)}` },
                { key: 'effectiveFrom', label: 'Vigência', fmt: (v: string) => new Date(v).toLocaleDateString('pt-BR') },
              ]} rows={data.priceHistory} />
            </Section>
          )}
        </div>
      )}
    </ReportShell>
  );
}
