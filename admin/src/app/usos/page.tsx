'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Activity, Filter, RefreshCw, Ship, User, Clock, Fuel, ClipboardCheck, ChevronLeft, ChevronRight, X, Download, CheckCircle, XCircle, AlertCircle, FileText, Eye, Shield } from 'lucide-react';
import { getUsages, getBoats, getUsagePdf } from '@/services/api';

interface ChecklistItem {
  id: string;
  label: string;
  checked: boolean;
  notes?: string;
  photoUrl?: string;
  order: number;
}

interface ChecklistData {
  id: string;
  status: string;
  type: string;
  completedAt?: string;
  notes?: string;
  additionalObservations?: string;
  lifeVestsLoaned?: number;
  hullSketchUrl?: string;
  hullSketchMarks?: string;
  videoUrl?: string;
  fuelPhotoUrl?: string;
  returnCompletedAt?: string;
  returnFuelPhotoUrl?: string;
  returnObservations?: string;
  returnSketchMarks?: string;
  returnDamageVideoUrl?: string;
  items?: ChecklistItem[];
  operator?: { name: string };
}

interface UsageItem {
  id: string;
  status: string;
  startDate: string;
  endDate: string;
  notes?: string;
  user?: { id: string; name: string; email?: string; phone?: string };
  boat?: { id: string; name: string; model: string };
  checklist?: ChecklistData;
  fuelLogs?: { id: string; liters: number; totalCost: number; pricePerLiter?: number; loggedAt?: string }[];
  queue?: { status: string; startedAt?: string; completedAt?: string };
}

interface Boat { id: string; name: string }

const statusCfg: Record<string, { label: string; cls: string }> = {
  IN_USE: { label: 'Em Uso', cls: 'bg-blue-500/10 text-blue-600' },
  COMPLETED: { label: 'Concluído', cls: 'bg-green-500/10 text-green-600' },
  CANCELLED: { label: 'Cancelado', cls: 'bg-red-500/10 text-red-600' },
};

const fmt = (s: string) => {
  try { return new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }); }
  catch { return '—'; }
};
const fmtFull = (s?: string | null) => {
  if (!s) return '—';
  try { return new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }); }
  catch { return '—'; }
};

export default function UsosPage() {
  const [usages, setUsages] = useState<UsageItem[]>([]);
  const [boats, setBoats] = useState<Boat[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterBoat, setFilterBoat] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [selectedUsage, setSelectedUsage] = useState<UsageItem | null>(null);
  const [activeTab, setActiveTab] = useState<'checklist' | 'return' | 'fuel'>('checklist');
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const limit = 20;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = {};
      if (filterBoat) params.boatId = filterBoat;
      if (filterStatus) params.status = filterStatus;
      if (filterDate) {
        params.from = filterDate;
        params.to = filterDate;
      }
      const [uRes, bRes] = await Promise.all([
        getUsages(params).catch(() => ({ data: [] })),
        getBoats().catch(() => ({ data: [] })),
      ]);
      const u = uRes.data;
      const list = Array.isArray(u) ? u : u?.data || [];
      setUsages(list);
      setTotal(list.length);
      const b = bRes.data; setBoats(Array.isArray(b) ? b : b?.data || []);
    } finally { setLoading(false); }
  }, [filterBoat, filterStatus, filterDate]);

  useEffect(() => { load(); }, [load]);

  const paginatedUsages = useMemo(() => {
    const start = (page - 1) * limit;
    return usages.slice(start, start + limit);
  }, [usages, page]);

  const totalPages = Math.ceil(total / limit);

  const totalFuel = (item: UsageItem) => (item.fuelLogs || []).reduce((s, f) => s + (f.liters || 0), 0);
  const totalCost = (item: UsageItem) => (item.fuelLogs || []).reduce((s, f) => s + (f.totalCost || 0), 0);

  const summaryStats = useMemo(() => ({
    inUse: usages.filter(u => u.status === 'IN_USE').length,
    totalLiters: usages.reduce((s, u) => s + totalFuel(u), 0).toFixed(1) + 'L',
    withChecklist: usages.filter(u => u.checklist).length,
  }), [usages]);

  async function handleDownloadPdf(usageId: string, boatName: string) {
    setDownloadingPdf(true);
    try {
      const res = await getUsagePdf(usageId);
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `uso-${boatName}-${new Date().toISOString().slice(0, 10)}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      alert('Erro ao gerar PDF');
    } finally {
      setDownloadingPdf(false);
    }
  }

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
            <tr>{['Embarcação','Cliente','Saída','Retorno Prev.','Combustível','Checklist','Status',''].map((h) => (
              <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-th-muted uppercase">{h}</th>
            ))}</tr>
          </thead>
          <tbody className="divide-y divide-th">
            {loading ? (
              <tr><td colSpan={8} className="px-4 py-12 text-center text-th-muted"><RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" /><p className="text-sm">Carregando...</p></td></tr>
            ) : paginatedUsages.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-16 text-center text-th-muted"><Activity className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="text-sm">Nenhum uso encontrado</p></td></tr>
            ) : paginatedUsages.map((item) => {
              const cfg = statusCfg[item.status] || { label: item.status, cls: 'bg-gray-100 text-gray-600' };
              const fuel = totalFuel(item);
              const cost = totalCost(item);
              return (
                <tr key={item.id} className="hover:bg-th-bg/50 transition-colors cursor-pointer" onClick={() => { setSelectedUsage(item); setActiveTab('checklist'); }}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center"><Ship className="w-3.5 h-3.5 text-blue-500" /></div>
                      <div><p className="text-sm font-medium text-th">{item.boat?.name || '—'}</p><p className="text-xs text-th-muted">{item.boat?.model}</p></div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2"><User className="w-3.5 h-3.5 text-th-muted" /><span className="text-sm text-th">{item.user?.name || '—'}</span></div>
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
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${item.checklist.status === 'APPROVED' ? 'bg-green-500/10 text-green-600' : item.checklist.status === 'REJECTED' ? 'bg-red-500/10 text-red-600' : 'bg-yellow-500/10 text-yellow-600'}`}>
                        {item.checklist.status === 'APPROVED' ? '✓ Aprovado' : item.checklist.status === 'REJECTED' ? '✗ Rejeitado' : '⏳ Pendente'}
                      </span>
                    ) : <span className="text-xs text-th-muted">Sem checklist</span>}
                  </td>
                  <td className="px-4 py-3"><span className={`text-xs px-2 py-1 rounded-full font-medium ${cfg.cls}`}>{cfg.label}</span></td>
                  <td className="px-4 py-3">
                    <button onClick={(e) => { e.stopPropagation(); setSelectedUsage(item); setActiveTab('checklist'); }} className="p-1.5 hover:bg-primary-500/10 rounded-lg transition" title="Ver detalhes">
                      <Eye className="w-4 h-4 text-th-muted" />
                    </button>
                  </td>
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

      {/* Detail Modal */}
      {selectedUsage && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSelectedUsage(null)}>
          <div className="bg-th-card rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-th">
              <div>
                <h2 className="text-lg font-bold text-th">Detalhes do Uso</h2>
                <p className="text-sm text-th-muted">{selectedUsage.boat?.name} — {selectedUsage.user?.name || 'Sem cliente'}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleDownloadPdf(selectedUsage.id, selectedUsage.boat?.name || 'uso')}
                  disabled={downloadingPdf}
                  className="flex items-center gap-1.5 px-3 py-2 bg-primary-500 text-white rounded-lg text-sm font-medium hover:bg-primary-600 disabled:opacity-50 transition"
                >
                  <Download size={14} />
                  {downloadingPdf ? 'Gerando...' : 'PDF'}
                </button>
                <button onClick={() => setSelectedUsage(null)} className="p-2 hover:bg-th-bg rounded-lg transition">
                  <X size={18} className="text-th-muted" />
                </button>
              </div>
            </div>

            {/* Info Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-5 bg-th-bg/50 border-b border-th">
              <div>
                <p className="text-[10px] uppercase text-th-muted font-semibold">Embarcação</p>
                <p className="text-sm font-medium text-th">{selectedUsage.boat?.name}</p>
                <p className="text-xs text-th-muted">{selectedUsage.boat?.model}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-th-muted font-semibold">Cliente</p>
                <p className="text-sm font-medium text-th">{selectedUsage.user?.name || '—'}</p>
                <p className="text-xs text-th-muted">{selectedUsage.user?.phone || selectedUsage.user?.email || ''}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-th-muted font-semibold">Saída</p>
                <p className="text-sm text-th">{fmtFull(selectedUsage.startDate)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-th-muted font-semibold">Retorno</p>
                <p className="text-sm text-th">{fmtFull(selectedUsage.endDate)}</p>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-th">
              {[
                { key: 'checklist' as const, label: 'Checklist', icon: ClipboardCheck },
                { key: 'return' as const, label: 'Inspeção Retorno', icon: Shield },
                { key: 'fuel' as const, label: 'Combustível', icon: Fuel },
              ].map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition ${activeTab === key ? 'border-primary-500 text-primary-500' : 'border-transparent text-th-muted hover:text-th-secondary'}`}
                >
                  <Icon size={15} />
                  {label}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div className="p-5 overflow-y-auto flex-1">
              {/* Checklist Tab */}
              {activeTab === 'checklist' && (
                <div className="space-y-4">
                  {selectedUsage.checklist ? (
                    <>
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${selectedUsage.checklist.status === 'APPROVED' ? 'bg-green-500/10 text-green-600' : selectedUsage.checklist.status === 'REJECTED' ? 'bg-red-500/10 text-red-600' : 'bg-yellow-500/10 text-yellow-600'}`}>
                          {selectedUsage.checklist.status === 'APPROVED' ? '✓ Aprovado' : selectedUsage.checklist.status === 'REJECTED' ? '✗ Rejeitado' : '⏳ Pendente'}
                        </span>
                        {selectedUsage.checklist.completedAt && (
                          <span className="text-xs text-th-muted">Concluído: {fmtFull(selectedUsage.checklist.completedAt)}</span>
                        )}
                        {selectedUsage.checklist.lifeVestsLoaned != null && selectedUsage.checklist.lifeVestsLoaned > 0 && (
                          <span className="text-xs bg-blue-500/10 text-blue-600 px-2 py-0.5 rounded-full">{selectedUsage.checklist.lifeVestsLoaned} coletes</span>
                        )}
                      </div>

                      {/* Checklist Items */}
                      {(selectedUsage.checklist.items?.length ?? 0) > 0 && (
                        <div className="space-y-1.5">
                          <p className="text-xs font-semibold text-th-secondary uppercase">Itens Verificados</p>
                          {selectedUsage.checklist.items!.map((item) => (
                            <div key={item.id} className="flex items-start gap-2 py-1.5 px-3 rounded-lg bg-th-bg/50">
                              {item.checked ? (
                                <CheckCircle size={16} className="text-green-500 mt-0.5 flex-shrink-0" />
                              ) : (
                                <XCircle size={16} className="text-red-400 mt-0.5 flex-shrink-0" />
                              )}
                              <div className="flex-1">
                                <p className="text-sm text-th">{item.label}</p>
                                {item.notes && <p className="text-xs text-th-muted">{item.notes}</p>}
                              </div>
                              {item.photoUrl && (
                                <a href={item.photoUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary-500 hover:underline">Ver foto</a>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Notes */}
                      {selectedUsage.checklist.notes && (
                        <div>
                          <p className="text-xs font-semibold text-th-secondary uppercase mb-1">Notas</p>
                          <p className="text-sm text-th bg-th-bg/50 rounded-lg p-3">{selectedUsage.checklist.notes}</p>
                        </div>
                      )}
                      {selectedUsage.checklist.additionalObservations && (
                        <div>
                          <p className="text-xs font-semibold text-th-secondary uppercase mb-1">Observações Adicionais</p>
                          <p className="text-sm text-th bg-th-bg/50 rounded-lg p-3">{selectedUsage.checklist.additionalObservations}</p>
                        </div>
                      )}

                      {/* Media */}
                      <div className="flex flex-wrap gap-2">
                        {selectedUsage.checklist.hullSketchUrl && (
                          <a href={selectedUsage.checklist.hullSketchUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs bg-th-bg px-3 py-2 rounded-lg text-primary-500 hover:bg-primary-500/10 transition">
                            <FileText size={13} /> Croqui do Casco
                          </a>
                        )}
                        {selectedUsage.checklist.videoUrl && (
                          <a href={selectedUsage.checklist.videoUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs bg-th-bg px-3 py-2 rounded-lg text-primary-500 hover:bg-primary-500/10 transition">
                            <Eye size={13} /> Vídeo de Saída
                          </a>
                        )}
                        {selectedUsage.checklist.fuelPhotoUrl && (
                          <a href={selectedUsage.checklist.fuelPhotoUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs bg-th-bg px-3 py-2 rounded-lg text-primary-500 hover:bg-primary-500/10 transition">
                            <Fuel size={13} /> Foto Combustível
                          </a>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-8">
                      <ClipboardCheck className="w-10 h-10 text-th-muted/30 mx-auto mb-2" />
                      <p className="text-sm text-th-muted">Nenhum checklist registrado para este uso</p>
                    </div>
                  )}
                </div>
              )}

              {/* Return Inspection Tab */}
              {activeTab === 'return' && (
                <div className="space-y-4">
                  {selectedUsage.checklist?.returnCompletedAt ? (
                    <>
                      <div className="flex items-center gap-2">
                        <CheckCircle size={16} className="text-green-500" />
                        <span className="text-sm text-th font-medium">Inspeção concluída</span>
                        <span className="text-xs text-th-muted">{fmtFull(selectedUsage.checklist.returnCompletedAt)}</span>
                      </div>

                      {selectedUsage.checklist.returnObservations && (
                        <div>
                          <p className="text-xs font-semibold text-th-secondary uppercase mb-1">Observações do Retorno</p>
                          <p className="text-sm text-th bg-th-bg/50 rounded-lg p-3">{selectedUsage.checklist.returnObservations}</p>
                        </div>
                      )}

                      {selectedUsage.checklist.returnSketchMarks && (
                        <div>
                          <p className="text-xs font-semibold text-th-secondary uppercase mb-1">Marcas no Casco (Retorno)</p>
                          <p className="text-sm text-th bg-th-bg/50 rounded-lg p-3">{selectedUsage.checklist.returnSketchMarks}</p>
                        </div>
                      )}

                      <div className="flex flex-wrap gap-2">
                        {selectedUsage.checklist.returnFuelPhotoUrl && (
                          <a href={selectedUsage.checklist.returnFuelPhotoUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs bg-th-bg px-3 py-2 rounded-lg text-primary-500 hover:bg-primary-500/10 transition">
                            <Fuel size={13} /> Foto Combustível Retorno
                          </a>
                        )}
                        {selectedUsage.checklist.returnDamageVideoUrl && (
                          <a href={selectedUsage.checklist.returnDamageVideoUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs bg-th-bg px-3 py-2 rounded-lg text-primary-500 hover:bg-primary-500/10 transition">
                            <AlertCircle size={13} /> Vídeo de Avarias
                          </a>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-8">
                      <Shield className="w-10 h-10 text-th-muted/30 mx-auto mb-2" />
                      <p className="text-sm text-th-muted">Inspeção de retorno não realizada</p>
                    </div>
                  )}
                </div>
              )}

              {/* Fuel Tab */}
              {activeTab === 'fuel' && (
                <div className="space-y-4">
                  {(selectedUsage.fuelLogs?.length ?? 0) > 0 ? (
                    <>
                      <div className="flex items-center gap-4 text-sm">
                        <div className="bg-orange-500/10 text-orange-600 px-3 py-1.5 rounded-lg font-medium">
                          Total: {totalFuel(selectedUsage).toFixed(1)}L
                        </div>
                        <div className="bg-green-500/10 text-green-600 px-3 py-1.5 rounded-lg font-medium">
                          R$ {totalCost(selectedUsage).toFixed(2)}
                        </div>
                      </div>

                      <div className="space-y-2">
                        {selectedUsage.fuelLogs!.map((fl, i) => (
                          <div key={fl.id || i} className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-th-bg/50">
                            <div className="flex items-center gap-3">
                              <div className="w-7 h-7 rounded-full bg-orange-500/10 flex items-center justify-center">
                                <Fuel size={14} className="text-orange-500" />
                              </div>
                              <div>
                                <p className="text-sm font-medium text-th">{fl.liters?.toFixed(1)}L</p>
                                {fl.loggedAt && <p className="text-xs text-th-muted">{fmtFull(fl.loggedAt)}</p>}
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-medium text-th">R$ {fl.totalCost?.toFixed(2)}</p>
                              {fl.pricePerLiter && <p className="text-xs text-th-muted">R$ {fl.pricePerLiter.toFixed(2)}/L</p>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-8">
                      <Fuel className="w-10 h-10 text-th-muted/30 mx-auto mb-2" />
                      <p className="text-sm text-th-muted">Nenhum abastecimento registrado</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
