'use client';

import { useState, useEffect, useCallback } from 'react';
import { Activity, Ship, Clock, Fuel, ClipboardCheck, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { getMyUsages } from '@/services/api';
import dynamic from 'next/dynamic';
import { useCachedState, hasCached } from '@/hooks/useCachedState';

const JetSki3DMarkViewer = dynamic(() => import('@/components/JetSki3DMarkViewer'), { ssr: false }) as any;

interface UsageItem {
  id: string;
  status: string;
  startDate: string;
  endDate: string;
  boat?: { id: string; name: string; model: string };
  checklist?: { id: string; status: string; hullSketchUrl?: string; hullSketchMarks?: string; videoUrl?: string; completedAt?: string; returnDamageVideoUrl?: string; returnSketchMarks?: string } | null;
  fuelLogs?: { id: string; liters: number; totalCost: number; createdAt: string }[];
}

const statusConfig: Record<string, { label: string; bg: string; text: string }> = {
  IN_USE: { label: 'Em Uso', bg: 'bg-blue-100', text: 'text-blue-400' },
  COMPLETED: { label: 'Concluído', bg: 'bg-green-100', text: 'text-emerald-400' },
  CANCELLED: { label: 'Cancelado', bg: 'bg-red-100', text: 'text-red-400' },
};

const fmt = (s: string) => new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

export default function UsosPage() {
  const [usages, setUsages] = useCachedState<UsageItem[]>('pc:usos:list', []);
  const [loading, setLoading] = useState(() => !hasCached('pc:usos:list'));
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent && !hasCached('pc:usos:list')) setLoading(true);
    try {
      const res = await getMyUsages();
      const data = res.data;
      setUsages(Array.isArray(data) ? data : data?.data || []);
    } catch { setUsages([]); }
    finally { if (!silent) setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const totalFuel = (item: UsageItem) => (item.fuelLogs || []).reduce((s, f) => s + (f.liters || 0), 0);
  const totalCost = (item: UsageItem) => (item.fuelLogs || []).reduce((s, f) => s + (f.totalCost || 0), 0);

  const inUse = usages.filter((u) => u.status === 'IN_USE');
  const past = usages.filter((u) => u.status !== 'IN_USE');

  return (
    <div className="p-4 pb-4 space-y-4">
      <div className="flex items-center gap-3 pt-2">
        <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
          <Activity className="w-5 h-5 text-purple-500" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-[var(--text)]">Meus Usos</h1>
          <p className="text-xs text-[var(--text-secondary)]">Histórico de saídas e consumo</p>
        </div>
      </div>

      <div className="space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-orange-500" /></div>
        ) : usages.length === 0 ? (
        <div className="text-center py-16">
          <Activity className="w-12 h-12 mx-auto mb-3 text-[var(--text-muted)]" />
          <p className="text-sm text-[var(--text-muted)] font-medium">Nenhum uso registrado</p>
          <p className="text-xs text-[var(--text-muted)] mt-1">Seus passeios aparecerão aqui</p>
        </div>
      ) : (
        <div className="space-y-3">
          {inUse.length > 0 && (
            <div>
              <p className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-2">Em andamento</p>
              {inUse.map((item) => <UsageCard key={item.id} item={item} expanded={expandedId === item.id} onToggle={() => setExpandedId(p => p === item.id ? null : item.id)} totalFuel={totalFuel(item)} totalCost={totalCost(item)} />)}
            </div>
          )}
          {past.length > 0 && (
            <div>
              <p className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-2">Histórico ({past.length})</p>
              {past.map((item) => <UsageCard key={item.id} item={item} expanded={expandedId === item.id} onToggle={() => setExpandedId(p => p === item.id ? null : item.id)} totalFuel={totalFuel(item)} totalCost={totalCost(item)} />)}
            </div>
          )}
        </div>
      )}
      </div>
    </div>
  );
}

function UsageCard({ item, expanded, onToggle, totalFuel, totalCost }: {
  item: UsageItem; expanded: boolean; onToggle: () => void; totalFuel: number; totalCost: number;
}) {
  const cfg = statusConfig[item.status] || { label: item.status, bg: 'bg-[var(--subtle)]', text: 'text-[var(--text-secondary)]' };
  const fmt = (s: string) => new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl overflow-hidden mb-2">
      <button onClick={onToggle} className="w-full text-left p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center flex-shrink-0">
              <Ship className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <p className="font-bold text-[var(--text)] text-sm">{item.boat?.name || 'Embarcação'}</p>
              <p className="text-xs text-[var(--text-secondary)]">{item.boat?.model}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.bg} ${cfg.text}`}>{cfg.label}</span>
            {expanded ? <ChevronUp className="w-4 h-4 text-[var(--text-muted)]" /> : <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" />}
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <div className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
            <Clock className="w-3.5 h-3.5 text-orange-400 flex-shrink-0" />
            <span className="truncate">{fmt(item.startDate)}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)] justify-center">
            <Fuel className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
            <span>{totalFuel > 0 ? `${totalFuel.toFixed(1)}L` : '—'}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)] justify-end">
            <ClipboardCheck className={`w-3.5 h-3.5 flex-shrink-0 ${item.checklist ? 'text-green-400' : 'text-[var(--text-muted)]'}`} />
            <span>{item.checklist ? 'Feito' : 'Sem check'}</span>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-[var(--border)] p-4 space-y-3 bg-[var(--subtle)]/50">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-[var(--card)] rounded-xl p-3 border border-[var(--border)]">
              <p className="text-xs text-[var(--text-muted)] mb-1">Saída</p>
              <p className="text-xs font-semibold text-[var(--text)]">{fmt(item.startDate)}</p>
            </div>
            <div className="bg-[var(--card)] rounded-xl p-3 border border-[var(--border)]">
              <p className="text-xs text-[var(--text-muted)] mb-1">Retorno Previsto</p>
              <p className="text-xs font-semibold text-[var(--text)]">{fmt(item.endDate)}</p>
            </div>
          </div>
          {totalFuel > 0 && (
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
              <p className="text-xs font-semibold text-amber-700 mb-1">Combustível</p>
              <p className="text-sm font-bold text-amber-800">{totalFuel.toFixed(1)} L<span className="text-xs font-normal text-amber-600 ml-2">R$ {totalCost.toFixed(2)}</span></p>
              {item.fuelLogs && item.fuelLogs.length > 1 && (
                <p className="text-xs text-amber-600 mt-0.5">{item.fuelLogs.length} abastecimentos</p>
              )}
            </div>
          )}
          {item.checklist && (
            <div className={`rounded-xl p-3 border ${item.checklist.status === 'APPROVED' ? 'bg-emerald-500/10 border-green-100' : 'bg-yellow-500/10 border-yellow-100'}`}>
              <p className={`text-xs font-semibold mb-1 ${item.checklist.status === 'APPROVED' ? 'text-emerald-400' : 'text-yellow-700'}`}>Checklist Pré-Saída</p>
              <div className="flex items-center gap-3">
                <span className={`text-xs font-medium ${item.checklist.status === 'APPROVED' ? 'text-emerald-400' : 'text-yellow-400'}`}>{item.checklist.status === 'APPROVED' ? '✓ Aprovado' : '⏳ Pendente'}</span>
                {item.checklist.hullSketchUrl && <span className="text-xs text-blue-500">+ Croqui</span>}
                {item.checklist.videoUrl && <span className="text-xs text-purple-500">+ Vídeo</span>}
              </div>
            </div>
          )}
          {item.checklist?.returnSketchMarks && (
            <div className="rounded-xl p-3 border border-orange-200 bg-orange-500/10">
              <p className="text-xs font-semibold text-orange-500 mb-2">🔍 Croqui do Retorno</p>
              <JetSki3DMarkViewer
                marksJson={item.checklist.hullSketchMarks}
                markColor="#ef4444"
                secondaryMarksJson={item.checklist.returnSketchMarks}
                secondaryMarkColor="#ff6600"
                height={200}
              />
              <div className="flex items-center gap-4 mt-2 text-xs text-[var(--text-muted)]">
                <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-full bg-[#ef4444]" /> Existentes</span>
                <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-full bg-[#ff6600]" /> Novas</span>
              </div>
            </div>
          )}
          {item.checklist?.returnDamageVideoUrl && (
            <div className="rounded-xl p-3 border border-red-200 bg-red-500/10">
              <p className="text-xs font-semibold text-red-400 mb-2">🎥 Vídeo de Avaria no Retorno</p>
              <video
                src={item.checklist.returnDamageVideoUrl}
                controls
                playsInline
                className="w-full rounded-lg max-h-48"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
