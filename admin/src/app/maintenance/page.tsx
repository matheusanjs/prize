'use client';

import { useState, useEffect } from 'react';
import { Wrench, Plus, Ship, Calendar, CheckCircle, Clock, AlertTriangle, X, Save, DollarSign, Users, Building2, Search, Tag, PlusCircle, ShieldCheck } from 'lucide-react';
import { getMaintenances, createMaintenance, updateMaintenance, resolveMaintenance, getBoats, getSharesByBoat, createCharge } from '@/services/api';

interface Maintenance {
  id: string;
  boatName?: string;
  boat?: { id: string; name: string; totalShares?: number };
  title?: string;
  description: string;
  type?: string;
  priority?: string;
  status: string;
  scheduledAt?: string;
  completedAt?: string;
  createdAt?: string;
  estimatedCost?: number;
  actualCost?: number;
  costType?: string;
  category?: string;
}

interface BoatOption { id: string; name: string; model: string; totalShares: number; notes?: string; }
interface ShareHolder { userId: string; userName: string; }

function isBoatPropria(boat?: BoatOption): boolean {
  return !!boat?.notes?.startsWith('[PRÓPRIA]');
}

const CATEGORIES_KEY = 'prizeclube_maintenance_categories';
const defaultCategories = ['Motor', 'Casco', 'Elétrica', 'Pintura', 'Limpeza', 'Revisão Geral', 'Equipamentos', 'Outros'];

function loadCategories(): string[] {
  if (typeof window === 'undefined') return defaultCategories;
  const saved = localStorage.getItem(CATEGORIES_KEY);
  return saved ? JSON.parse(saved) : defaultCategories;
}
function saveCategories(cats: string[]) {
  localStorage.setItem(CATEGORIES_KEY, JSON.stringify(cats));
}

const statusConfig: Record<string, { label: string; color: string; icon: typeof CheckCircle }> = {
  PENDING: { label: 'Pendente', color: 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400', icon: Clock },
  IN_PROGRESS: { label: 'Em Andamento', color: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 dark:text-blue-400', icon: Wrench },
  COMPLETED: { label: 'Concluída', color: 'bg-green-500/15 text-green-600 dark:text-green-400', icon: CheckCircle },
  CANCELLED: { label: 'Cancelada', color: 'bg-th-surface text-th-muted', icon: AlertTriangle },
};

const priorityConfig: Record<string, { label: string; color: string }> = {
  LOW: { label: 'Baixa', color: 'text-green-600 dark:text-green-400 bg-green-500/10' },
  MEDIUM: { label: 'Média', color: 'text-yellow-600 dark:text-yellow-400 bg-yellow-500/10' },
  HIGH: { label: 'Alta', color: 'text-orange-600 dark:text-orange-400 bg-orange-500/10' },
  CRITICAL: { label: 'Crítica', color: 'text-red-600 dark:text-red-400 bg-red-500/10' },
};

export default function MaintenancePage() {
  const [maintenances, setMaintenances] = useState<Maintenance[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [boatFilter, setBoatFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [boats, setBoats] = useState<BoatOption[]>([]);
  const [allBoats, setAllBoats] = useState<BoatOption[]>([]);
  const [categories, setCategories] = useState<string[]>(defaultCategories);
  const [newCategory, setNewCategory] = useState('');
  const [showCatInput, setShowCatInput] = useState(false);
  const [form, setForm] = useState({
    boatId: '',
    title: '',
    description: '',
    priority: 'MEDIUM',
    estimatedCost: 0,
    scheduledAt: '',
    costType: 'INTERNAL',
    category: '',
    blockBoat: true,
  });
  const [costPreview, setCostPreview] = useState<{ perShareholder: number; totalShares: number; shareholders: ShareHolder[] } | null>(null);
  const [loadingShares, setLoadingShares] = useState(false);

  useEffect(() => { setCategories(loadCategories()); loadAllBoats(); }, []);
  useEffect(() => { loadMaintenances(); }, [statusFilter]);

  async function loadAllBoats() {
    try {
      const { data } = await getBoats();
      const list = Array.isArray(data) ? data : data.data || data.items || [];
      setAllBoats(list.map((b: any) => ({ id: b.id, name: b.name, model: b.model, totalShares: b.totalShares || 4, notes: b.notes || '' })));
    } catch { setAllBoats([]); }
  }

  async function loadMaintenances() {
    try {
      setLoading(true);
      const params: Record<string, string> = {};
      if (statusFilter !== 'all') params.status = statusFilter;
      const { data } = await getMaintenances(params);
      setMaintenances(Array.isArray(data) ? data : data.data || data.items || []);
    } catch {
      setMaintenances([]);
    } finally {
      setLoading(false);
    }
  }

  async function openCreate() {
    setForm({ boatId: '', title: '', description: '', priority: 'MEDIUM', estimatedCost: 0, scheduledAt: '', costType: 'INTERNAL', category: '', blockBoat: true });
    setCostPreview(null);
    setShowCatInput(false);
    setNewCategory('');
    setBoats(allBoats);
    setShowModal(true);
  }

  function addCategory() {
    const cat = newCategory.trim();
    if (!cat || categories.includes(cat)) return;
    const updated = [...categories, cat];
    setCategories(updated);
    saveCategories(updated);
    setForm((f) => ({ ...f, category: cat }));
    setNewCategory('');
    setShowCatInput(false);
  }

  function removeCategory(cat: string) {
    const updated = categories.filter((c) => c !== cat);
    setCategories(updated);
    saveCategories(updated);
    if (form.category === cat) setForm((f) => ({ ...f, category: '' }));
    if (categoryFilter === cat) setCategoryFilter('all');
  }

  async function onBoatOrCostChange(boatId: string, costType: string, cost: number) {
    if (costType === 'SHAREHOLDERS' && boatId) {
      setLoadingShares(true);
      try {
        const { data } = await getSharesByBoat(boatId);
        const shares = Array.isArray(data) ? data : data.data || [];
        const boat = boats.find((b) => b.id === boatId);
        const propria = isBoatPropria(boat);
        const totalShares = propria ? 1 : (boat?.totalShares || 4);
        const perShareholder = cost > 0 ? Math.round((cost / totalShares) * 100) / 100 : 0;
        const shareholders = shares.filter((s: any) => s.isActive).map((s: any) => ({ userId: s.userId || s.user?.id, userName: s.user?.name || (propria ? 'Proprietário' : 'Cotista') }));
        setCostPreview({ perShareholder, totalShares, shareholders });
      } catch {
        setCostPreview(null);
      } finally {
        setLoadingShares(false);
      }
    } else {
      setCostPreview(null);
    }
  }

  async function handleSave() {
    if (!form.boatId || !form.title || !form.description) {
      alert('Preencha embarcação, título e descrição.');
      return;
    }
    setSaving(true);
    try {
      // 1. Create maintenance
      const payload: Record<string, unknown> = {
        boatId: form.boatId,
        title: form.category ? `[${form.category}] ${form.title}` : form.title,
        description: form.description,
        priority: form.priority,
        estimatedCost: Number(form.estimatedCost) || undefined,
        scheduledAt: form.scheduledAt || undefined,
        blockBoat: form.blockBoat,
      };
      await createMaintenance(payload);

      // 2. If SHAREHOLDERS, create charges for each active cotista
      if (form.costType === 'SHAREHOLDERS' && costPreview && costPreview.shareholders.length > 0 && form.estimatedCost > 0) {
        const boat = boats.find((b) => b.id === form.boatId);
        const boatName = boat?.name || 'Embarcação';
        const propria = isBoatPropria(boat);
        const perShareholder = costPreview.perShareholder;
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 30);
        const dueDateStr = dueDate.toISOString().split('T')[0];

        const chargePromises = costPreview.shareholders.map((sh) =>
          createCharge({
            userId: sh.userId,
            description: propria
              ? `Manutenção: ${form.title} — ${boatName} (100% proprietário)`
              : `Manutenção: ${form.title} — ${boatName} (rateio ${costPreview.totalShares} cotas)`,
            amount: perShareholder,
            dueDate: dueDateStr,
            category: 'MAINTENANCE',
            boatId: form.boatId,
            reference: `manut-${Date.now()}`,
          })
        );
        await Promise.all(chargePromises);
        if (propria) {
          alert(`Manutenção criada! Fatura de R$ ${perShareholder.toFixed(2)} gerada para o proprietário.`);
        } else {
          alert(`Manutenção criada! ${costPreview.shareholders.length} fatura(s) de R$ ${perShareholder.toFixed(2)} gerada(s) para os cotistas.`);
        }
      }

      setShowModal(false);
      loadMaintenances();
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Erro ao criar manutenção');
    } finally {
      setSaving(false);
    }
  }

  const formatCurrency = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const filtered = maintenances.filter((m) => {
    const boatName = (m.boat?.name || m.boatName || '').toLowerCase();
    const matchBoat = !boatFilter || boatName.includes(boatFilter.toLowerCase());
    const title = m.title || m.description || '';
    const matchCat = categoryFilter === 'all' || title.includes(`[${categoryFilter}]`);
    return matchBoat && matchCat;
  });

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-th flex items-center gap-2">
            <Wrench className="text-primary-500" />
            Manutenção
          </h1>
          <p className="text-th-muted text-sm mt-1">{maintenances.length} registros de manutenção</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 bg-primary-500 text-white px-4 py-2.5 rounded-lg font-medium hover:bg-primary-600 transition text-sm">
          <Plus size={16} />
          Nova Manutenção
        </button>
      </div>

      {/* Filters Row */}
      <div className="flex items-center gap-4 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-th-muted" />
          <input
            type="text"
            placeholder="Buscar embarcação..."
            value={boatFilter}
            onChange={(e) => setBoatFilter(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-th rounded-lg text-sm focus:ring-2 focus:ring-primary-500/30 outline-none"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-3 py-2 border border-th rounded-lg text-sm focus:ring-2 focus:ring-primary-500/30 outline-none"
        >
          <option value="all">Todas Categorias</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div className="flex gap-2 mb-6">
        {['all', 'PENDING', 'IN_PROGRESS', 'COMPLETED'].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
              statusFilter === s ? 'bg-primary-500 text-white' : 'bg-th-surface text-th-secondary hover:bg-primary-500/10'
            }`}
          >
            {s === 'all' ? 'Todas' : statusConfig[s]?.label || s}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {loading ? (
          <p className="text-center py-8 text-th-muted">Carregando...</p>
        ) : filtered.length === 0 ? (
          <div className="bg-th-card rounded-2xl shadow-black/10 border border-th p-8 text-center">
            <Wrench size={48} className="text-th-muted mx-auto mb-4" />
            <p className="text-th-muted">Nenhuma manutenção encontrada</p>
          </div>
        ) : (
          filtered.map((m) => {
            const sc = statusConfig[m.status] || statusConfig.PENDING;
            const Icon = sc.icon;
            const pr = priorityConfig[m.priority || 'MEDIUM'] || priorityConfig.MEDIUM;
            const cost = m.actualCost ?? m.estimatedCost;
            const titleText = m.title || m.description || '';
            const catMatch = titleText.match(/^\[([^\]]+)\]\s*/);
            const catLabel = catMatch ? catMatch[1] : null;
            const cleanTitle = catMatch ? titleText.replace(catMatch[0], '') : titleText;
            return (
              <div key={m.id} className="bg-th-card rounded-2xl shadow-black/10 border border-th p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-th-surface rounded-2xl flex items-center justify-center">
                      <Ship className="text-th-secondary" size={22} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-th">{m.boat?.name || m.boatName || '-'}</h3>
                      <div className="flex items-center gap-2 mt-0.5">
                        {catLabel && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-purple-500/15 text-purple-600 dark:text-purple-400">
                            <Tag size={10} />{catLabel}
                          </span>
                        )}
                        <p className="text-sm font-medium text-th-secondary">{cleanTitle}</p>
                      </div>
                      {m.title && <p className="text-xs text-th-muted mt-0.5">{m.description}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-5">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${pr.color}`}>{pr.label}</span>
                    {cost != null && cost > 0 && (
                      <div className="text-center">
                        <p className="text-sm font-bold text-th">{formatCurrency(cost)}</p>
                        <p className="text-xs text-th-muted">Custo</p>
                      </div>
                    )}
                    <div className="text-center">
                      <p className="text-sm text-th-secondary">
                        {m.scheduledAt ? new Date(m.scheduledAt).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : m.createdAt ? new Date(m.createdAt).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '-'}
                      </p>
                      <p className="text-xs text-th-muted">Data</p>
                    </div>
                    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${sc.color}`}>
                      <Icon size={14} />
                      {sc.label}
                    </div>
                    {m.status !== 'COMPLETED' && m.status !== 'CANCELLED' && (
                      <button
                        onClick={async () => {
                          if (!confirm(`Resolver manutenção "${m.title || m.description}"? A embarcação voltará a ficar disponível.`)) return;
                          try {
                            await resolveMaintenance(m.id);
                            loadMaintenances();
                            loadAllBoats();
                          } catch (err: any) {
                            alert(err?.response?.data?.message || 'Erro ao resolver manutenção');
                          }
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/25 transition"
                        title="Resolver manutenção — liberar embarcação"
                      >
                        <ShieldCheck size={14} /> Resolver
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-th-overlay flex items-center justify-center z-50" onClick={() => setShowModal(false)}>
          <div className="bg-th-card rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-5">
              <h2 className="text-lg font-bold text-th">Nova Manutenção</h2>
              <button onClick={() => setShowModal(false)} className="text-th-muted hover:text-th-secondary"><X size={20} /></button>
            </div>
            <div className="space-y-4">
              {/* Boat */}
              <div>
                <label className="block text-sm font-medium text-th-secondary mb-1">Embarcação *</label>
                <select
                  value={form.boatId}
                  onChange={(e) => {
                    const newId = e.target.value;
                    setForm((f) => ({ ...f, boatId: newId }));
                    onBoatOrCostChange(newId, form.costType, form.estimatedCost);
                  }}
                  className="w-full border border-th rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                >
                  <option value="">Selecione...</option>
                  {boats.map((b) => <option key={b.id} value={b.id}>{b.name} — {b.model}</option>)}
                </select>
              </div>

              {/* Title & Description */}
              <div>
                <label className="block text-sm font-medium text-th-secondary mb-1">Categoria</label>
                <div className="flex items-center gap-2">
                  <select
                    value={form.category}
                    onChange={(e) => setForm({...form, category: e.target.value})}
                    className="flex-1 border border-th rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                  >
                    <option value="">Sem categoria</option>
                    {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <button type="button" onClick={() => setShowCatInput(!showCatInput)} className="p-2 rounded-lg border border-th hover:bg-th-hover text-th-muted" title="Nova categoria">
                    <PlusCircle size={18} />
                  </button>
                </div>
                {showCatInput && (
                  <div className="flex items-center gap-2 mt-2">
                    <input
                      value={newCategory}
                      onChange={(e) => setNewCategory(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && addCategory()}
                      placeholder="Nome da categoria..."
                      className="flex-1 border border-th rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                      autoFocus
                    />
                    <button type="button" onClick={addCategory} className="px-3 py-2 bg-primary-500 text-white rounded-lg text-sm font-medium hover:bg-primary-600">Criar</button>
                  </div>
                )}
                {categories.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {categories.map((c) => (
                      <span key={c} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs cursor-pointer transition ${form.category === c ? 'bg-primary-100 text-primary-500 font-medium' : 'bg-th-surface text-th-secondary hover:bg-primary-500/10'}`}>
                        <button type="button" onClick={() => setForm({...form, category: c})}>{c}</button>
                        <button type="button" onClick={() => removeCategory(c)} className="text-th-muted hover:text-red-500 ml-0.5"><X size={10} /></button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-th-secondary mb-1">Título *</label>
                <input value={form.title} onChange={(e) => setForm({...form, title: e.target.value})} placeholder="Ex: Troca de óleo" className="w-full border border-th rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-th-secondary mb-1">Descrição *</label>
                <textarea value={form.description} onChange={(e) => setForm({...form, description: e.target.value})} placeholder="Detalhes da manutenção..." rows={3} className="w-full border border-th rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 outline-none resize-none" />
              </div>

              {/* Priority & Scheduled Date */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-th-secondary mb-1">Prioridade</label>
                  <select
                    value={form.priority}
                    onChange={(e) => {
                      const p = e.target.value;
                      setForm({...form, priority: p, blockBoat: p === 'CRITICAL' ? true : form.blockBoat});
                    }}
                    className="w-full border border-th rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                  >
                    <option value="LOW">Baixa</option>
                    <option value="MEDIUM">Média</option>
                    <option value="HIGH">Alta</option>
                    <option value="CRITICAL">Crítica</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-th-secondary mb-1">Data agendada</label>
                  <input type="date" value={form.scheduledAt} onChange={(e) => setForm({...form, scheduledAt: e.target.value})} className="w-full border border-th rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 outline-none" />
                </div>
              </div>

              {/* Block Boat toggle */}
              <div className="flex items-center justify-between p-3 rounded-xl border border-th bg-th-surface/50">
                <div>
                  <p className="text-sm font-medium text-th">Bloquear embarcação</p>
                  <p className="text-xs text-th-muted mt-0.5">Impede que usuários criem reservas enquanto a manutenção existe</p>
                </div>
                <button
                  type="button"
                  onClick={() => setForm({...form, blockBoat: !form.blockBoat})}
                  className={`relative w-11 h-6 rounded-full transition-colors ${form.blockBoat ? 'bg-primary-500' : 'bg-th-muted/40'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${form.blockBoat ? 'translate-x-5' : ''}`} />
                </button>
              </div>

              {/* Cost */}
              <div>
                <label className="block text-sm font-medium text-th-secondary mb-1">Custo estimado (R$)</label>
                <input
                  type="number"
                  value={form.estimatedCost || ''}
                  onChange={(e) => {
                    const cost = Number(e.target.value);
                    setForm((f) => ({...f, estimatedCost: cost }));
                    onBoatOrCostChange(form.boatId, form.costType, cost);
                  }}
                  placeholder="0.00"
                  className="w-full border border-th rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                />
              </div>

              {/* Cost Type — SHAREHOLDERS vs INTERNAL */}
              <div>
                <label className="block text-sm font-medium text-th-secondary mb-2">Quem paga?</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setForm((f) => ({ ...f, costType: 'INTERNAL' }));
                      setCostPreview(null);
                    }}
                    className={`flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition ${
                      form.costType === 'INTERNAL' ? 'border-primary-500 bg-primary-500/10' : 'border-th hover:border-th'
                    }`}
                  >
                    <Building2 size={24} className={form.costType === 'INTERNAL' ? 'text-primary-500' : 'text-th-muted'} />
                    <span className={`text-sm font-medium ${form.costType === 'INTERNAL' ? 'text-primary-500' : 'text-th-secondary'}`}>Interno da Marina</span>
                    <span className="text-xs text-th-muted">Custo absorvido</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setForm((f) => ({ ...f, costType: 'SHAREHOLDERS' }));
                      onBoatOrCostChange(form.boatId, 'SHAREHOLDERS', form.estimatedCost);
                    }}
                    className={`flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition ${
                      form.costType === 'SHAREHOLDERS' ? 'border-primary-500 bg-primary-500/10' : 'border-th hover:border-th'
                    }`}
                  >
                    <Users size={24} className={form.costType === 'SHAREHOLDERS' ? 'text-primary-500' : 'text-th-muted'} />
                    <span className={`text-sm font-medium ${form.costType === 'SHAREHOLDERS' ? 'text-primary-500' : 'text-th-secondary'}`}>
                      {form.boatId && isBoatPropria(boats.find((b) => b.id === form.boatId)) ? 'Cobrar Proprietário' : 'Dividir Cotistas'}
                    </span>
                    <span className="text-xs text-th-muted">
                      {form.boatId && isBoatPropria(boats.find((b) => b.id === form.boatId)) ? '100% proprietário' : 'Rateio por cotas'}
                    </span>
                  </button>
                </div>
              </div>

              {/* Cost preview for SHAREHOLDERS */}
              {form.costType === 'SHAREHOLDERS' && form.estimatedCost > 0 && (
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-4">
                  <h4 className="text-sm font-semibold text-blue-800 mb-2 flex items-center gap-1.5">
                    <DollarSign size={15} />
                    {form.boatId && isBoatPropria(boats.find((b) => b.id === form.boatId)) ? 'Cobrança ao proprietário' : 'Prévia do rateio'}
                  </h4>
                  {loadingShares ? (
                    <p className="text-sm text-blue-600 dark:text-blue-400">Carregando cotistas...</p>
                  ) : costPreview ? (
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-blue-600 dark:text-blue-400">Custo total</span>
                        <span className="font-bold text-blue-800">{formatCurrency(form.estimatedCost)}</span>
                      </div>
                      {!isBoatPropria(boats.find((b) => b.id === form.boatId)) && (
                        <div className="flex justify-between text-sm">
                          <span className="text-blue-600 dark:text-blue-400">Dividido por (cotas máx.)</span>
                          <span className="font-bold text-blue-800">{costPreview.totalShares} cotas</span>
                        </div>
                      )}
                      <div className="flex justify-between text-sm border-t border-blue-500/20 pt-2">
                        <span className="text-blue-600 dark:text-blue-400">
                          {isBoatPropria(boats.find((b) => b.id === form.boatId)) ? 'Valor integral' : 'Valor por cota'}
                        </span>
                        <span className="font-bold text-blue-900 text-base">{formatCurrency(costPreview.perShareholder)}</span>
                      </div>
                      {costPreview.shareholders.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-blue-500/20">
                          <p className="text-xs text-blue-600 dark:text-blue-400 mb-1">Faturas serão geradas para:</p>
                          {costPreview.shareholders.map((sh, i) => (
                            <div key={i} className="flex justify-between text-xs bg-th-card/60 rounded px-2 py-1 mt-1">
                              <span className="text-th-secondary">{sh.userName}</span>
                              <span className="font-medium text-blue-700 dark:text-blue-400">{formatCurrency(costPreview.perShareholder)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {costPreview.shareholders.length === 0 && (
                        <p className="text-xs text-yellow-600 dark:text-yellow-400 bg-yellow-500/10 rounded p-2 mt-1">Nenhum cotista ativo vinculado a esta embarcação. As faturas serão geradas quando houver cotistas.</p>
                      )}
                    </div>
                  ) : !form.boatId ? (
                    <p className="text-sm text-blue-500">Selecione uma embarcação para ver o rateio.</p>
                  ) : null}
                </div>
              )}

              <button onClick={handleSave} disabled={saving} className="w-full flex items-center justify-center gap-2 bg-primary-500 text-white py-2.5 rounded-lg font-medium hover:bg-primary-600 disabled:opacity-50 transition">
                <Save size={16} /> {saving ? 'Salvando...' : form.costType === 'SHAREHOLDERS' && costPreview && costPreview.shareholders.length > 0 ? 'Criar e gerar faturas' : 'Criar manutenção'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
