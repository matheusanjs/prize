'use client';

import { useState, useEffect } from 'react';
import { AlertTriangle, Ship, Clock, User, Eye, X, ChevronDown, Filter, Calendar, Video } from 'lucide-react';
import { getDamagesReport, getBoats } from '@/services/api';
import dynamic from 'next/dynamic';

const JetSki3DMarkViewer = dynamic(() => import('@/components/JetSki3DMarkViewer'), { ssr: false }) as any;

const BRT = 'America/Sao_Paulo';

interface DamageEntry {
  id: string;
  boat: { id: string; name: string; model?: string };
  client: { id: string; name: string; email?: string; phone?: string };
  operator: { id: string; name: string };
  reservation?: { id: string; startDate: string; endDate: string };
  launchDate: string;
  returnDate: string;
  durationMinutes: number | null;
  items: { id: string; label: string; checked: boolean; notes?: string }[];
  launchObservations?: string;
  returnObservations?: string;
  launchMarksCount: number;
  returnMarksCount: number;
  newDamagesCount: number;
  hullSketchMarks?: string;
  returnSketchMarks?: string;
  fuelPhotoUrl?: string;
  returnFuelPhotoUrl?: string;
  videoUrl?: string;
  returnDamageVideoUrl?: string;
  lifeVestsLoaned?: number;
}

interface Boat { id: string; name: string }

export default function DamagesPage() {
  const [entries, setEntries] = useState<DamageEntry[]>([]);
  const [boats, setBoats] = useState<Boat[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBoat, setSelectedBoat] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [detail, setDetail] = useState<DamageEntry | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (selectedBoat) params.boatId = selectedBoat;
      if (dateFrom) params.from = dateFrom;
      if (dateTo) params.to = dateTo;
      const [dmgRes, boatsRes] = await Promise.all([
        getDamagesReport(params),
        getBoats().catch(() => ({ data: [] })),
      ]);
      setEntries(Array.isArray(dmgRes.data) ? dmgRes.data : []);
      setBoats(Array.isArray(boatsRes.data) ? boatsRes.data : []);
    } catch { setEntries([]); }
    setLoading(false);
  };

  useEffect(() => { load(); }, [selectedBoat, dateFrom, dateTo]);

  const fmtDate = (s?: string) => s ? new Date(s).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: BRT }) : '—';
  const fmtTime = (s?: string) => s ? new Date(s).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: BRT }) : '—';
  const fmtDuration = (min: number | null) => {
    if (min === null) return '—';
    const h = Math.floor(min / 60);
    const m = min % 60;
    return h > 0 ? `${h}h${m > 0 ? ` ${m}min` : ''}` : `${m}min`;
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center">
          <AlertTriangle className="w-5 h-5 text-red-500" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-th">Relatório de Avarias</h1>
          <p className="text-xs text-th-muted">Histórico de danos registrados nas inspeções de retorno</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="flex items-center gap-2">
          <Ship className="w-4 h-4 text-th-muted" />
          <select value={selectedBoat} onChange={e => setSelectedBoat(e.target.value)}
            className="text-sm border border-th rounded-lg px-3 py-2 bg-th text-th focus:ring-2 focus:ring-blue-500">
            <option value="">Todas as embarcações</option>
            {boats.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-th-muted" />
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="text-sm border border-th rounded-lg px-3 py-2 bg-th text-th focus:ring-2 focus:ring-blue-500" />
          <span className="text-th-muted text-xs">até</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="text-sm border border-th rounded-lg px-3 py-2 bg-th text-th focus:ring-2 focus:ring-blue-500" />
        </div>
        {(selectedBoat || dateFrom || dateTo) && (
          <button onClick={() => { setSelectedBoat(''); setDateFrom(''); setDateTo(''); }}
            className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1">
            <X className="w-3 h-3" /> Limpar filtros
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="bg-th-card rounded-xl p-4 border border-th">
          <p className="text-2xl font-bold text-red-500">{entries.length}</p>
          <p className="text-xs text-th-muted">Registros com avarias</p>
        </div>
        <div className="bg-th-card rounded-xl p-4 border border-th">
          <p className="text-2xl font-bold text-th">{entries.reduce((s, e) => s + e.newDamagesCount, 0)}</p>
          <p className="text-xs text-th-muted">Total de marcas novas</p>
        </div>
        <div className="bg-th-card rounded-xl p-4 border border-th">
          <p className="text-2xl font-bold text-th">{new Set(entries.map(e => e.boat.id)).size}</p>
          <p className="text-xs text-th-muted">Embarcações afetadas</p>
        </div>
        <div className="bg-th-card rounded-xl p-4 border border-th">
          <p className="text-2xl font-bold text-amber-500">{entries.filter(e => e.returnDamageVideoUrl || e.videoUrl).length}</p>
          <p className="text-xs text-th-muted">Com vídeo</p>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : entries.length === 0 ? (
        <div className="text-center py-20 text-th-muted">
          <AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Nenhuma avaria registrada{selectedBoat || dateFrom || dateTo ? ' com esses filtros' : ''}</p>
        </div>
      ) : (
        <div className="bg-th-card rounded-xl border border-th overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-th bg-th-bg">
                  <th className="text-left px-4 py-3 font-semibold text-th-muted">Data</th>
                  <th className="text-left px-4 py-3 font-semibold text-th-muted">Embarcação</th>
                  <th className="text-left px-4 py-3 font-semibold text-th-muted">Cliente</th>
                  <th className="text-center px-4 py-3 font-semibold text-th-muted">Duração</th>
                  <th className="text-center px-4 py-3 font-semibold text-th-muted">Avarias Saída</th>
                  <th className="text-center px-4 py-3 font-semibold text-th-muted">Novas Avarias</th>
                  <th className="text-center px-4 py-3 font-semibold text-th-muted">Vídeo</th>
                  <th className="text-center px-4 py-3 font-semibold text-th-muted">Ações</th>
                </tr>
              </thead>
              <tbody>
                {entries.map(entry => (
                  <tr key={entry.id} className="border-b border-th last:border-0 hover:bg-th-bg/50 transition-colors cursor-pointer" onClick={() => setDetail(entry)}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-th">{fmtDate(entry.returnDate)}</p>
                      <p className="text-xs text-th-muted">{fmtTime(entry.returnDate)}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-th">{entry.boat.name}</p>
                      {entry.boat.model && <p className="text-xs text-th-muted">{entry.boat.model}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-th">{entry.client?.name || '—'}</p>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-th">{fmtDuration(entry.durationMinutes)}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-xs font-medium text-th">{entry.launchMarksCount}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${entry.newDamagesCount > 0 ? 'bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400' : 'bg-green-100 dark:bg-green-500/20 text-green-600 dark:text-green-400'}`}>
                        {entry.newDamagesCount > 0 ? `+${entry.newDamagesCount}` : '0'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {(entry.returnDamageVideoUrl || entry.videoUrl) ? (
                        <Video className="w-4 h-4 text-amber-500 mx-auto" />
                      ) : (
                        <span className="text-th-muted text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button className="text-blue-500 hover:text-blue-700 text-xs font-medium flex items-center gap-1 mx-auto">
                        <Eye className="w-3.5 h-3.5" /> Ver
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {detail && <DamageDetailModal entry={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

/* ── Detail Modal ─────────────────────────────────────────────────────────── */

function DamageDetailModal({ entry, onClose }: { entry: DamageEntry; onClose: () => void }) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['hull', 'checklist', 'videos']));
  const toggle = (s: string) => setExpandedSections(prev => { const n = new Set(prev); n.has(s) ? n.delete(s) : n.add(s); return n; });

  const fmtDateTime = (s?: string) => s ? new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: BRT }) : '—';
  const fmtDuration = (min: number | null) => {
    if (min === null) return '—';
    const h = Math.floor(min / 60);
    const m = min % 60;
    return h > 0 ? `${h}h${m > 0 ? ` ${m}min` : ''}` : `${m}min`;
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-th-card rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-th sticky top-0 bg-th-card z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-red-500" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-th">Relatório de Avaria</h2>
              <p className="text-xs text-th-muted">{entry.boat.name} — {fmtDateTime(entry.returnDate)}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-th-muted hover:text-th"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6 space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-th-bg rounded-xl p-3 text-center">
              <Ship className="w-4 h-4 mx-auto text-blue-500 mb-1" />
              <p className="text-sm font-bold text-th">{entry.boat.name}</p>
              {entry.boat.model && <p className="text-xs text-th-muted">{entry.boat.model}</p>}
            </div>
            <div className="bg-th-bg rounded-xl p-3 text-center">
              <User className="w-4 h-4 mx-auto text-green-500 mb-1" />
              <p className="text-sm font-bold text-th">{entry.client?.name || '—'}</p>
              <p className="text-xs text-th-muted">Cliente</p>
            </div>
            <div className="bg-th-bg rounded-xl p-3 text-center">
              <Clock className="w-4 h-4 mx-auto text-amber-500 mb-1" />
              <p className="text-sm font-bold text-th">{fmtDuration(entry.durationMinutes)}</p>
              <p className="text-xs text-th-muted">Tempo de uso</p>
            </div>
            <div className="bg-th-bg rounded-xl p-3 text-center">
              <AlertTriangle className="w-4 h-4 mx-auto text-red-500 mb-1" />
              <p className="text-sm font-bold text-red-500">+{entry.newDamagesCount}</p>
              <p className="text-xs text-th-muted">Novas avarias</p>
            </div>
          </div>

          {/* Timeline */}
          <div className="bg-th-bg rounded-xl p-4">
            <div className="flex items-center justify-between text-sm">
              <div>
                <p className="text-th-muted text-xs">Saída</p>
                <p className="font-medium text-th">{fmtDateTime(entry.launchDate)}</p>
              </div>
              <div className="flex-1 mx-4 h-px bg-th relative">
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-green-500" />
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-red-500" />
              </div>
              <div className="text-right">
                <p className="text-th-muted text-xs">Retorno</p>
                <p className="font-medium text-th">{fmtDateTime(entry.returnDate)}</p>
              </div>
            </div>
          </div>

          {/* Hull condition — collapsible */}
          <div className="border border-th rounded-xl overflow-hidden">
            <button onClick={() => toggle('hull')} className="flex items-center justify-between w-full px-4 py-3 bg-th-bg text-sm font-semibold text-th hover:bg-th-bg/80">
              <span>🔍 Condição do Casco</span>
              <ChevronDown className={`w-4 h-4 transition-transform ${expandedSections.has('hull') ? 'rotate-180' : ''}`} />
            </button>
            {expandedSections.has('hull') && (
              <div className="p-4 space-y-4">
                {entry.hullSketchMarks && (
                  <div>
                    <p className="text-xs font-semibold text-th-muted mb-2">Avarias na Saída ({entry.launchMarksCount} marcas)</p>
                    <JetSki3DMarkViewer marksJson={entry.hullSketchMarks} height={200} />
                  </div>
                )}
                {entry.returnSketchMarks && (
                  <div>
                    <p className="text-xs font-semibold text-red-500 mb-2">Novas Avarias no Retorno ({entry.newDamagesCount} marcas)</p>
                    <JetSki3DMarkViewer
                      marksJson={entry.hullSketchMarks}
                      markColor="#ef4444"
                      secondaryMarksJson={entry.returnSketchMarks}
                      secondaryMarkColor="#39ff14"
                      height={200}
                    />
                    <div className="flex items-center gap-4 mt-2 text-xs text-th-muted">
                      <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-full bg-[#ef4444]" /> Avarias existentes</span>
                      <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-full bg-[#39ff14]" /> Novas avarias</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Videos */}
          {(entry.videoUrl || entry.returnDamageVideoUrl) && (
            <div className="border border-th rounded-xl overflow-hidden">
              <button onClick={() => toggle('videos')} className="flex items-center justify-between w-full px-4 py-3 bg-th-bg text-sm font-semibold text-th hover:bg-th-bg/80">
                <span className="flex items-center gap-2"><Video className="w-4 h-4 text-amber-500" /> Vídeos</span>
                <ChevronDown className={`w-4 h-4 transition-transform ${expandedSections.has('videos') ? 'rotate-180' : ''}`} />
              </button>
              {expandedSections.has('videos') && (
                <div className="p-4 space-y-4">
                  {entry.videoUrl && (
                    <div>
                      <p className="text-xs font-semibold text-th-muted mb-2">📋 Vídeo do Checklist (Saída)</p>
                      <video src={entry.videoUrl} controls className="w-full max-h-64 rounded-xl bg-black" />
                    </div>
                  )}
                  {entry.returnDamageVideoUrl && (
                    <div>
                      <p className="text-xs font-semibold text-red-500 mb-2">⚠️ Vídeo da Inspeção de Retorno</p>
                      <video src={entry.returnDamageVideoUrl} controls className="w-full max-h-64 rounded-xl bg-black" />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Checklist — collapsible */}
          <div className="border border-th rounded-xl overflow-hidden">
            <button onClick={() => toggle('checklist')} className="flex items-center justify-between w-full px-4 py-3 bg-th-bg text-sm font-semibold text-th hover:bg-th-bg/80">
              <span>📋 Checklist Completo</span>
              <ChevronDown className={`w-4 h-4 transition-transform ${expandedSections.has('checklist') ? 'rotate-180' : ''}`} />
            </button>
            {expandedSections.has('checklist') && (
              <div className="p-4 space-y-2">
                {entry.items.length > 0 ? entry.items.map(it => (
                  <div key={it.id} className={`flex items-center gap-2 p-2 rounded-lg text-xs ${it.checked ? 'text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-500/10' : 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10'}`}>
                    <div className={`w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center ${it.checked ? 'bg-green-500' : 'bg-red-400'}`}>
                      {it.checked && <span className="text-white text-[8px]">✓</span>}
                    </div>
                    <span>{it.label}</span>
                    {it.notes && <span className="text-th-muted ml-auto italic">({it.notes})</span>}
                  </div>
                )) : <p className="text-xs text-th-muted">Nenhum item de checklist registrado</p>}
              </div>
            )}
          </div>

          {/* Fuel photos — collapsible */}
          {(entry.fuelPhotoUrl || entry.returnFuelPhotoUrl) && (
            <div className="border border-th rounded-xl overflow-hidden">
              <button onClick={() => toggle('fuel')} className="flex items-center justify-between w-full px-4 py-3 bg-th-bg text-sm font-semibold text-th hover:bg-th-bg/80">
                <span>⛽ Combustível</span>
                <ChevronDown className={`w-4 h-4 transition-transform ${expandedSections.has('fuel') ? 'rotate-180' : ''}`} />
              </button>
              {expandedSections.has('fuel') && (
                <div className="p-4 grid grid-cols-2 gap-4">
                  {entry.fuelPhotoUrl && (
                    <div>
                      <p className="text-xs text-th-muted mb-1">Saída</p>
                      <img src={entry.fuelPhotoUrl} alt="Combustível saída" className="w-full rounded-lg object-contain max-h-40" />
                    </div>
                  )}
                  {entry.returnFuelPhotoUrl && (
                    <div>
                      <p className="text-xs text-th-muted mb-1">Retorno</p>
                      <img src={entry.returnFuelPhotoUrl} alt="Combustível retorno" className="w-full rounded-lg object-contain max-h-40" />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Observations */}
          {(entry.launchObservations || entry.returnObservations) && (
            <div className="border border-th rounded-xl overflow-hidden">
              <button onClick={() => toggle('obs')} className="flex items-center justify-between w-full px-4 py-3 bg-th-bg text-sm font-semibold text-th hover:bg-th-bg/80">
                <span>📝 Observações</span>
                <ChevronDown className={`w-4 h-4 transition-transform ${expandedSections.has('obs') ? 'rotate-180' : ''}`} />
              </button>
              {expandedSections.has('obs') && (
                <div className="p-4 space-y-3 text-sm">
                  {entry.launchObservations && (
                    <div>
                      <p className="text-xs font-semibold text-th-muted mb-1">Saída</p>
                      <p className="text-th">{entry.launchObservations}</p>
                    </div>
                  )}
                  {entry.returnObservations && (
                    <div>
                      <p className="text-xs font-semibold text-th-muted mb-1">Retorno</p>
                      <p className="text-th">{entry.returnObservations}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Life vests */}
          {entry.lifeVestsLoaned && entry.lifeVestsLoaned > 0 && (
            <div className="p-3 bg-amber-50 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-500/30 rounded-xl flex items-center gap-2 text-sm">
              <span className="text-xl">🦺</span>
              <span className="text-amber-700 dark:text-amber-400">{entry.lifeVestsLoaned} colete{entry.lifeVestsLoaned > 1 ? 's' : ''} emprestado{entry.lifeVestsLoaned > 1 ? 's' : ''}</span>
            </div>
          )}

          {/* Operator */}
          <div className="text-xs text-th-muted text-right">
            Operador: {entry.operator?.name || '—'}
          </div>
        </div>
      </div>
    </div>
  );
}
