'use client';

import { useState, useEffect } from 'react';
import { Wrench, Plus, X, CheckCircle, Clock, AlertTriangle, Ship } from 'lucide-react';
import { getMaintenances, createMaintenance, updateMaintenance, getBoats } from '@/services/api';
import { format, parseISO } from 'date-fns';

interface Maintenance {
  id: string;
  boat?: { id: string; name: string };
  title?: string;
  description: string;
  priority?: string;
  status: string;
  scheduledAt?: string;
  completedAt?: string;
  createdAt?: string;
  estimatedCost?: number;
  actualCost?: number;
  category?: string;
}

interface BoatOption { id: string; name: string; }

const statusConfig: Record<string, { label: string; color: string; icon: typeof CheckCircle }> = {
  PENDING: { label: 'Pendente', color: 'bg-yellow-100 text-yellow-700', icon: Clock },
  IN_PROGRESS: { label: 'Em Andamento', color: 'bg-blue-100 text-blue-700', icon: Wrench },
  COMPLETED: { label: 'Concluída', color: 'bg-green-100 text-emerald-400', icon: CheckCircle },
  CANCELLED: { label: 'Cancelada', color: 'bg-[var(--subtle)] text-[var(--text-secondary)]', icon: AlertTriangle },
};

const priorityConfig: Record<string, { label: string; color: string }> = {
  LOW: { label: 'Baixa', color: 'text-emerald-400 bg-emerald-500/10' },
  MEDIUM: { label: 'Média', color: 'text-yellow-400 bg-yellow-500/10' },
  HIGH: { label: 'Alta', color: 'text-orange-400 bg-orange-500/10' },
  CRITICAL: { label: 'Crítica', color: 'text-red-400 bg-red-500/10' },
};

export default function MaintenancePage() {
  const [items, setItems] = useState<Maintenance[]>([]);
  const [boats, setBoats] = useState<BoatOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    boatId: '', title: '', description: '', priority: 'MEDIUM', estimatedCost: '',
  });

  const load = async () => {
    try {
      const [mRes, bRes] = await Promise.all([getMaintenances(), getBoats()]);
      setItems(Array.isArray(mRes.data) ? mRes.data : mRes.data.data || []);
      const b = Array.isArray(bRes.data) ? bRes.data : bRes.data.data || [];
      setBoats(b.map((x: BoatOption) => ({ id: x.id, name: x.name })));
    } catch { /* empty */ }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = filter === 'all' ? items : items.filter(m => m.status === filter);
  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const handleCreate = async () => {
    if (!form.boatId || !form.description) return;
    setSaving(true);
    try {
      await createMaintenance({
        boatId: form.boatId,
        title: form.title || form.description,
        description: form.description,
        priority: form.priority,
        estimatedCost: form.estimatedCost ? Number(form.estimatedCost) : undefined,
      });
      setShowCreate(false);
      setForm({ boatId: '', title: '', description: '', priority: 'MEDIUM', estimatedCost: '' });
      await load();
    } catch { /* empty */ }
    setSaving(false);
  };

  const toggleStatus = async (m: Maintenance) => {
    const next = m.status === 'PENDING' ? 'IN_PROGRESS' : m.status === 'IN_PROGRESS' ? 'COMPLETED' : null;
    if (!next) return;
    try {
      await updateMaintenance(m.id, { status: next });
      await load();
    } catch { /* empty */ }
  };

  return (
    <div className="py-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-[var(--text)]">Manutenção</h1>
        <button onClick={() => setShowCreate(true)} className="bg-primary-500 text-white p-2 rounded-xl">
          <Plus size={20} />
        </button>
      </div>

      {/* Filter */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
        {[{ key: 'all', label: 'Todas' }, ...Object.entries(statusConfig).map(([k, v]) => ({ key: k, label: v.label }))].map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap ${
              filter === f.key ? 'bg-primary-500 text-white' : 'bg-[var(--subtle)] text-[var(--text-secondary)]'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-[var(--text-muted)]">
          <Wrench size={48} className="mx-auto mb-3 opacity-50" />
          <p>Nenhuma manutenção</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(m => {
            const st = statusConfig[m.status] || statusConfig.PENDING;
            const pr = priorityConfig[m.priority || 'MEDIUM'] || priorityConfig.MEDIUM;
            const Icon = st.icon;
            return (
              <div key={m.id} className="bg-[var(--card)] rounded-2xl p-3 border border-[var(--border)]">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-2">
                    <button onClick={() => toggleStatus(m)} className="mt-0.5">
                      <Icon size={18} className={st.color.includes('green') ? 'text-green-500' : st.color.includes('blue') ? 'text-blue-500' : 'text-yellow-500'} />
                    </button>
                    <div>
                      <p className="font-medium text-sm">{m.title || m.description}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-[var(--text-secondary)] flex items-center gap-0.5">
                          <Ship size={10} /> {m.boat?.name || '—'}
                        </span>
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${pr.color}`}>
                          {pr.label}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${st.color}`}>
                      {st.label}
                    </span>
                    {m.estimatedCost && (
                      <p className="text-[10px] text-[var(--text-muted)] mt-1">{fmt(m.estimatedCost)}</p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-[100] bg-black/50 flex items-end">
          <div className="bg-[var(--card)] w-full rounded-t-3xl p-6 max-h-[80vh] overflow-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Nova Manutenção</h2>
              <button onClick={() => setShowCreate(false)}><X size={20} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[var(--text)] mb-1">Embarcação</label>
                <select
                  value={form.boatId}
                  onChange={e => setForm({ ...form, boatId: e.target.value })}
                  className="w-full px-3 py-3 rounded-xl border border-[var(--border)] text-sm"
                >
                  <option value="">Selecionar...</option>
                  {boats.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--text)] mb-1">Título</label>
                <input
                  value={form.title}
                  onChange={e => setForm({ ...form, title: e.target.value })}
                  placeholder="Ex: Troca de óleo"
                  className="w-full px-3 py-3 rounded-xl border border-[var(--border)] text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--text)] mb-1">Descrição</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-3 rounded-xl border border-[var(--border)] text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-[var(--text)] mb-1">Prioridade</label>
                  <select
                    value={form.priority}
                    onChange={e => setForm({ ...form, priority: e.target.value })}
                    className="w-full px-3 py-3 rounded-xl border border-[var(--border)] text-sm"
                  >
                    {Object.entries(priorityConfig).map(([k, v]) => (
                      <option key={k} value={k}>{v.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--text)] mb-1">Custo Est.</label>
                  <input
                    type="number"
                    value={form.estimatedCost}
                    onChange={e => setForm({ ...form, estimatedCost: e.target.value })}
                    placeholder="R$ 0"
                    className="w-full px-3 py-3 rounded-xl border border-[var(--border)] text-sm"
                  />
                </div>
              </div>
              <button
                onClick={handleCreate}
                disabled={saving || !form.boatId || !form.description}
                className="w-full bg-primary-500 text-white py-3 rounded-xl font-semibold disabled:opacity-50"
              >
                {saving ? 'Salvando...' : 'Criar Manutenção'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
