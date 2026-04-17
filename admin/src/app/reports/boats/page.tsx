'use client';

import { useState, useEffect, useCallback } from 'react';
import { Ship, Anchor } from 'lucide-react';
import { getReportBoats } from '@/services/api';
import { ReportShell, KPI, Section, useReportDates, fmt, fmtInt } from '@/components/reports/ReportComponents';

export default function BoatsReportPage() {
  const { from, to, setFrom, setTo } = useReportDates();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(false);
    try { const r = await getReportBoats(from, to); setData(r.data); }
    catch { setError(true); }
    finally { setLoading(false); }
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  const totalRevenue = data?.boats?.reduce((s: number, b: any) => s + b.revenue, 0) || 0;
  const totalFuelCost = data?.boats?.reduce((s: number, b: any) => s + b.fuelCost, 0) || 0;
  const totalMaintCost = data?.boats?.reduce((s: number, b: any) => s + b.maintenanceCost, 0) || 0;

  return (
    <ReportShell title="Relatório de Embarcações" icon={<div className="p-2.5 rounded-xl bg-primary-500/10"><Ship size={24} className="text-primary-500" /></div>} loading={loading} error={error} from={from} to={to} setFrom={setFrom} setTo={setTo} onRefresh={load}>
      {data && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KPI label="Embarcações" value={fmtInt(data.boats.length)} color="text-primary-500" />
            <KPI label="Receita Total" value={`R$ ${fmt(totalRevenue)}`} color="text-green-500" />
            <KPI label="Custo Combustível" value={`R$ ${fmt(totalFuelCost)}`} color="text-amber-500" />
            <KPI label="Custo Manutenção" value={`R$ ${fmt(totalMaintCost)}`} color="text-red-500" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {data.boats.map((boat: any) => (
              <div key={boat.id} className="bg-th-card rounded-2xl border border-th p-5 hover:border-primary-500/20 transition">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary-500/10 flex items-center justify-center">
                      <Anchor size={18} className="text-primary-500" />
                    </div>
                    <div>
                      <h3 className="font-bold text-th">{boat.name}</h3>
                      <p className="text-xs text-th-muted">{boat.model || 'Sem modelo'} · {boat.status}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-th-muted">Ocupação</div>
                    <div className={`text-sm font-black ${boat.occupancyRate > 50 ? 'text-green-500' : boat.occupancyRate > 20 ? 'text-amber-500' : 'text-red-500'}`}>
                      {boat.occupancyRate}%
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-th-surface rounded-xl p-3">
                    <p className="text-[10px] font-bold text-th-muted uppercase">Receita</p>
                    <p className="text-sm font-black text-green-500">R$ {fmt(boat.revenue)}</p>
                  </div>
                  <div className="bg-th-surface rounded-xl p-3">
                    <p className="text-[10px] font-bold text-th-muted uppercase">Reservas</p>
                    <p className="text-sm font-black text-blue-500">{boat.reservations} <span className="text-xs font-normal text-th-muted">({boat.confirmedReservations} conf.)</span></p>
                  </div>
                  <div className="bg-th-surface rounded-xl p-3">
                    <p className="text-[10px] font-bold text-th-muted uppercase">Combustível</p>
                    <p className="text-sm font-black text-amber-500">R$ {fmt(boat.fuelCost)}</p>
                    <p className="text-[10px] text-th-muted">{fmt(boat.fuelLiters)} litros</p>
                  </div>
                  <div className="bg-th-surface rounded-xl p-3">
                    <p className="text-[10px] font-bold text-th-muted uppercase">Manutenção</p>
                    <p className="text-sm font-black text-red-500">R$ {fmt(boat.maintenanceCost)}</p>
                    <p className="text-[10px] text-th-muted">{boat.maintenanceCount} itens</p>
                  </div>
                </div>

                <div className="flex items-center justify-between mt-3 pt-3 border-t border-th/50">
                  <span className="text-xs text-th-muted">Cotas ativas: <span className="font-bold text-th">{boat.activeShares}</span> / {boat.totalShares || '—'}</span>
                  <span className="text-xs text-th-muted">Horímetro: <span className="font-bold text-th">{boat.hourMeter ? fmt(Number(boat.hourMeter)) + 'h' : '—'}</span></span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </ReportShell>
  );
}
