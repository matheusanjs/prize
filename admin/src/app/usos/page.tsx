'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Activity, Filter, RefreshCw, Ship, User, Clock, Fuel, ClipboardCheck, ChevronLeft, ChevronRight } from 'lucide-react';
import { getUsages, getBoats } from '@/services/api';

interface UsageItem {
  id: string;
  status: string;
  startDate: string;
  endDate: string;
  client?: { id: string; name: string; phone?: string };
  boat?: { id: string; name: string; model: string };
  checklist?: { id: string; status: string; hullSketchUrl?: string; videoUrl?: string; completedAt?: string };
  fuelLogs?: { id: string; liters: number; totalCost: number; createdAt: string }[];
}

interface Boat { id: string; name: string }

const statusCfg: Record<string, { label: string; cls: string }> = {
  IN_USE: { label: 'Em Uso', cls: 'bg-blue-500/10 text-blue-600' },
  COMPLETED: { label: 'Concluído', cls: 'bg-green-500/10 text-green-600' },
  CANCELLED: { label: 'Cancelado', cls: 'bg-red-500/10 text-red-600' },
};

const fmt = (s: string) => new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
const fmtDate = (s: string) => new Date(s).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });

export default function UsosPage() {
  const [usages, setUsages] = useState<UsageItem[]>([]);
  const [boats, setBoats] = useState<Boat[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterBoat, setFilterBoat] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = { page, limit };
      if (filterBoat) params.boatId = filterBoat;
      if (filterStatus) params.status = filterStatus;
      if (filterDate) params.date = filterDate;
      const [uRes, bRes] = await Promise.all([
        getUsages(params).catch(() => ({ data: { data: [], total: 0 } })),
        getBoats().catch(() => ({ data: [] })),
      ]);
      const u = uRes.data;
      if (Array.isArray(u)) { setUsages(u); setTotal(u.length); }
      else { setUsages(u?.data || []); setTotal(u?.total || 0); }
      const b = bRes.data; setBoats(Array.isArray(b) ? b : b?.data || []);
    } finally { setLoading(false); }
  }, [page, filterBoat, filterStatus, filterDate]);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.ceil(total / limit);

  const totalFuel = (item: UsageItem) => (item.fuelLogs || []).reduce((s, f) => s + (f.liters || 0), 0);
  const totalCost = (item: UsageItem) => (item.fuelLogs || []).reduce((s, f) => s + (f.totalCost || 0), 0);

  // Memoize summary stats to avoid recomputing on every render
  const summaryStats = useMemo(() => ({
    inUse: usages.filter(u => u.status === 'IN_USE').length,
    totalLiters: usages.reduce((s, u) => s + totalFuel(u), 0).toFixed(1) + 'L',
    withChecklist: usages.filter(u => u.checklist).length,
  }), [usages]);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
          <Activity className="w-5 h-5 text-purple-500" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-th">Usos</h1>
          <p className="text-sm text-th-muted">Histórico completo de saídas com combustível e checklists</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 bg-th-card border border-th rounded-xl p-4">
        <div className="flex items-center gap-2 text-sm text-th-muted"><Filter className="w-4 h-4" /><span className="font-medium">Filtros:</span></div>
        <select value={filterBoat} onChange={(e) => { setFilterBoat(e.target.value); setPage(1); }}
          className="px-3 py-1.5 text-sm bg-th-bg border border-th rounded-lg text-th focus:outline-none">
          <option value="">Todas as embarcações</option>
          {boats.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <select value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
          className="px-3 py-1.5 text-sm bg-th-bg border border-th rounded-lg text-th focus:outline-none">
          <option value="">Todos os status</option>
          <option value="IN_USE">Em Uso</option>
          <option value="COMPLETED">Concluído</option>
          <option value="CANCELLED">Cancelado</option>
        </select>
        <input type="date" value={filterDate} onChange={(e) => { setFilterDate(e.target.value); setPage(1); }}
          className="px-3 py-1.5 text-sm bg-th-bg border border-th rounded-lg text-th focus:outline-none" />
        <button onClick={load} className="p-2 hover:bg-th-bg rounded-lg text-th-muted transition-colors ml-auto"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Total de Usos', value: total, icon: Activity, color: 'purple' },
          { label: 'Em Uso Agora', value: summaryStats.inUse, icon: Clock, color: 'blue' },
          { label: 'Litros Abastecidos', value: summaryStats.totalLiters, icon: Fuel, color: 'orange' },
          { label: 'Com Checklist', value: summaryStats.withChecklist, icon: ClipboardCheck, color: 'green' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-th-card border border-th rounded-xl p-4">
            <div className={`w-8 h-8 rounded-lg bg-${color}-500/10 flex items-center justify-center mb-2`}>
              <Icon className={`w-4 h-4 text-${color}-500`} />
            </div>
            <p className="text-2xl font-bold text-th">{value}</p>
            <p className="text-xs text-th-muted">{label}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-th-card border border-th rounded-xl overflow-hidden">
        <table className="w-full">
          <thead className="bg-th-bg border-b border-th">
            <tr>{['Embarcação','Cliente','Saída','Retorno Prev.','Combustível','Checklist','Status'].map((h) => (
              <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-th-muted uppercase">{h}</th>
            ))}</tr>
          </thead>
          <tbody className="divide-y divide-th">
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-th-muted"><RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" /><p className="text-sm">Carregando...</p></td></tr>
            ) : usages.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-16 text-center text-th-muted"><Activity className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="text-sm">Nenhum uso encontrado</p></td></tr>
            ) : usages.map((item) => {
              const cfg = statusCfg[item.status] || { label: item.status, cls: 'bg-gray-100 text-gray-600' };
              const fuel = totalFuel(item);
              const cost = totalCost(item);
              return (
                <tr key={item.id} className="hover:bg-th-bg/50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center"><Ship className="w-3.5 h-3.5 text-blue-500" /></div>
                      <div><p className="text-sm font-medium text-th">{item.boat?.name || '—'}</p><p className="text-xs text-th-muted">{item.boat?.model}</p></div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2"><User className="w-3.5 h-3.5 text-th-muted" /><span className="text-sm text-th">{item.client?.name || '—'}</span></div>
                  </td>
                  <td className="px-4 py-3 text-sm text-th-muted">{fmt(item.startDate)}</td>
                  <td className="px-4 py-3 text-sm text-th-muted">{fmt(item.endDate)}</td>
                  <td className="px-4 py-3">
                    {fuel > 0 ? (
                      <div><p className="text-sm font-medium text-th">{fuel.toFixed(1)}L</p><p className="text-xs text-th-muted">R$ {cost.toFixed(2)}</p></div>
                    ) : <span className="text-sm text-th-muted">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    {item.checklist ? (
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${item.checklist.status === 'APPROVED' ? 'bg-green-500/10 text-green-600' : 'bg-yellow-500/10 text-yellow-600'}`}>
                        {item.checklist.status === 'APPROVED' ? '✓ Aprovado' : '⏳ Pendente'}
                      </span>
                    ) : <span className="text-xs text-th-muted">Sem checklist</span>}
                  </td>
                  <td className="px-4 py-3"><span className={`text-xs px-2 py-1 rounded-full font-medium ${cfg.cls}`}>{cfg.label}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-th">
            <span className="text-xs text-th-muted">Página {page} de {totalPages} · {total} registros</span>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="p-1.5 rounded-lg border border-th hover:bg-th-bg disabled:opacity-30 text-th-muted"><ChevronLeft className="w-4 h-4" /></button>
              <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="p-1.5 rounded-lg border border-th hover:bg-th-bg disabled:opacity-30 text-th-muted"><ChevronRight className="w-4 h-4" /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
