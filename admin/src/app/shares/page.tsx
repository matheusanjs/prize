'use client';

import { useState, useEffect } from 'react';
import { Coins, Plus, Search, Trash2, Ship, User, X, ChevronDown, ChevronUp, Minus } from 'lucide-react';
import { getShares, getBoats, getUsers, createShare, deleteShare, getSharesByBoat, updateShare } from '@/services/api';

interface ShareItem {
  id: string;
  boatId: string;
  userId: string;
  shareNumber: number;
  sharePercentage: number;
  monthlyValue: number;
  startDate: string;
  endDate?: string;
  isActive: boolean;
  maxReservations: number;
  contractUrl?: string;
  boat?: { id: string; name: string; model: string; totalShares: number; monthlyFee: number };
  user?: { id: string; name: string; email: string; phone?: string };
}

interface Boat { id: string; name: string; model: string; totalShares: number; monthlyFee: number; imageUrl?: string; _count?: { shares: number } }
interface UserItem { id: string; name: string; email: string; phone?: string }

export default function SharesPage() {
  const [shares, setShares] = useState<ShareItem[]>([]);
  const [boats, setBoats] = useState<Boat[]>([]);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterBoat, setFilterBoat] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ boatId: '', userId: '', shareNumber: 1, startDate: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }) });
  const [saving, setSaving] = useState(false);
  const [boatSearch, setBoatSearch] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [expandedBoats, setExpandedBoats] = useState<Set<string>>(new Set());
  const [showBoatDropdown, setShowBoatDropdown] = useState(false);
  const [showUserDropdown, setShowUserDropdown] = useState(false);

  async function loadData() {
    try {
      const [sharesRes, boatsRes, usersRes] = await Promise.all([
        getShares().catch(() => ({ data: [] })),
        getBoats().catch(() => ({ data: [] })),
        getUsers({ limit: 200 }).catch(() => ({ data: [] })),
      ]);
      const s = sharesRes.data;
      setShares(Array.isArray(s) ? s : s?.data || []);
      const b = boatsRes.data;
      setBoats(Array.isArray(b) ? b : b?.data || []);
      const u = usersRes.data;
      setUsers(Array.isArray(u) ? u : u?.data || []);
    } catch {
      // keep defaults
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, []);

  const filtered = shares.filter((s) => {
    const q = search.toLowerCase();
    const matchesSearch = !q ||
      s.boat?.name?.toLowerCase().includes(q) ||
      s.user?.name?.toLowerCase().includes(q) ||
      s.user?.email?.toLowerCase().includes(q);
    const matchesBoat = !filterBoat || s.boatId === filterBoat;
    return matchesSearch && matchesBoat;
  });

  // Group shares by boat for the overview
  const boatMap: Record<string, { boat: Boat; shares: ShareItem[] }> = {};
  shares.forEach((s) => {
    if (s.boat) {
      if (!boatMap[s.boatId]) boatMap[s.boatId] = { boat: s.boat as unknown as Boat, shares: [] };
      boatMap[s.boatId].shares.push(s);
    }
  });

  function openCreate() {
    setForm({ boatId: '', userId: '', shareNumber: 1, startDate: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }) });
    setBoatSearch('');
    setUserSearch('');
    setShowBoatDropdown(false);
    setShowUserDropdown(false);
    setShowCreate(true);
  }

  // Auto-calculate next share number when boat changes — fetch from API to be accurate
  async function onBoatChange(boatId: string) {
    // Check local state first
    const localUsed = shares.filter((s) => s.boatId === boatId).map((s) => s.shareNumber);
    // Also fetch from API to catch shares not in local state
    let apiUsed: number[] = [];
    try {
      const { data } = await getSharesByBoat(boatId);
      const list = Array.isArray(data) ? data : data?.data || [];
      apiUsed = list.filter((s: any) => s.isActive !== false).map((s: any) => s.shareNumber);
    } catch { /* use local only */ }
    const usedNumbers = [...new Set([...localUsed, ...apiUsed])];
    let next = 1;
    while (usedNumbers.includes(next)) next++;
    setForm((f) => ({ ...f, boatId, shareNumber: next }));
  }

  async function handleCreate() {
    if (!form.boatId || !form.userId) { alert('Selecione embarcação e usuário'); return; }
    setSaving(true);
    try {
      await createShare({
        boatId: form.boatId,
        userId: form.userId,
        shareNumber: form.shareNumber,
        startDate: new Date(form.startDate).toISOString(),
      });
      setShowCreate(false);
      setLoading(true);
      await loadData();
    } catch (err: any) {
      const msg = err?.response?.data?.message || '';
      // If share number conflict, auto-find next available and retry
      if (msg.toLowerCase().includes('ocupada') || msg.toLowerCase().includes('unique') || msg.toLowerCase().includes('already')) {
        try {
          const { data } = await getSharesByBoat(form.boatId);
          const list = Array.isArray(data) ? data : data?.data || [];
          const usedNumbers = list.filter((s: any) => s.isActive !== false).map((s: any) => s.shareNumber);
          let next = 1;
          while (usedNumbers.includes(next)) next++;
          await createShare({
            boatId: form.boatId,
            userId: form.userId,
            shareNumber: next,
            startDate: new Date(form.startDate).toISOString(),
          });
          setShowCreate(false);
          setLoading(true);
          await loadData();
        } catch (retryErr: any) {
          alert(retryErr?.response?.data?.message || 'Erro ao criar cota');
        }
      } else {
        alert(msg || 'Erro ao criar cota');
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(share: ShareItem) {
    if (!window.confirm(`Desativar cota #${share.shareNumber} de ${share.user?.name} na embarcação ${share.boat?.name}?`)) return;
    try {
      await deleteShare(share.id);
      setLoading(true);
      await loadData();
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Erro ao desativar cota');
    }
  }

  const selectedBoat = boats.find((b) => b.id === form.boatId);
  const selectedBoatShares = shares.filter((s) => s.boatId === form.boatId);
  const availableSlots = selectedBoat ? selectedBoat.totalShares - selectedBoatShares.length : 0;

  const formatCurrency = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500" />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-th flex items-center gap-2">
            <Coins className="text-primary-500" />
            Cotas
          </h1>
          <p className="text-th-muted text-sm mt-1">Gerenciamento de cotas por embarcação</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 bg-primary-500 text-white px-4 py-2.5 rounded-lg font-medium hover:bg-primary-600 transition text-sm">
          <Plus size={16} />
          Nova Cota
        </button>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-th-card rounded-2xl p-4 border border-th shadow-black/10">
          <p className="text-xs text-th-muted">Total de Cotas</p>
          <p className="text-2xl font-bold text-th mt-1">{shares.length}</p>
        </div>
        <div className="bg-th-card rounded-2xl p-4 border border-th shadow-black/10">
          <p className="text-xs text-th-muted">Embarcações com Cotas</p>
          <p className="text-2xl font-bold text-th mt-1">{Object.keys(boatMap).length}</p>
        </div>
        <div className="bg-th-card rounded-2xl p-4 border border-th shadow-black/10">
          <p className="text-xs text-th-muted">Cotistas Únicos</p>
          <p className="text-2xl font-bold text-th mt-1">{new Set(shares.map((s) => s.userId)).size}</p>
        </div>
        <div className="bg-th-card rounded-2xl p-4 border border-th shadow-black/10">
          <p className="text-xs text-th-muted">Receita Mensal (Cotas)</p>
          <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-1">{formatCurrency(shares.reduce((s, c) => s + (c.monthlyValue || 0), 0))}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-th-muted" />
          <input
            type="text"
            placeholder="Buscar por embarcação, cliente ou email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-th text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>
        <select
          value={filterBoat}
          onChange={(e) => setFilterBoat(e.target.value)}
          className="px-3 py-2.5 rounded-lg border border-th text-sm min-w-[180px]"
        >
          <option value="">Todas embarcações</option>
          {boats.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
      </div>

      {/* Boat-grouped shares */}
      {filterBoat ? (
        <ShareTable shares={filtered} onDelete={handleDelete} formatCurrency={formatCurrency} />
      ) : (
        Object.entries(boatMap).length > 0 ? (
          Object.entries(boatMap)
            .filter(([, v]) => {
              if (!search) return true;
              const q = search.toLowerCase();
              return v.boat.name.toLowerCase().includes(q) || v.shares.some((s) => s.user?.name?.toLowerCase().includes(q) || s.user?.email?.toLowerCase().includes(q));
            })
            .map(([boatId, { boat, shares: boatShares }]) => {
              const totalShares = (boat as any).totalShares || 0;
              const occupancy = totalShares > 0 ? Math.round((boatShares.length / totalShares) * 100) : 0;
              const isExpanded = expandedBoats.has(boatId);
              return (
                <div key={boatId} className="bg-th-card rounded-2xl shadow-black/10 border border-th mb-4 overflow-hidden">
                  <div
                    className="p-4 bg-th-surface flex items-center justify-between cursor-pointer hover:bg-th-hover transition"
                    onClick={() => setExpandedBoats((prev) => { const next = new Set(prev); if (next.has(boatId)) next.delete(boatId); else next.add(boatId); return next; })}
                  >
                    <div className="flex items-center gap-3">
                      {(boat as any).imageUrl ? (
                        <img src={(() => { const u = (boat as any).imageUrl; return u.startsWith('data:') || u.startsWith('http') ? u : `${process.env.NEXT_PUBLIC_API_URL?.replace(/\/api\/v\d+$/, '') || 'https://api.marinaprizeclub.com'}${u}`; })()} alt={boat.name} className="w-10 h-10 rounded-lg object-cover" />
                      ) : (
                        <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center">
                          <Ship size={20} className="text-primary-500" />
                        </div>
                      )}
                      <div>
                        <h3 className="font-semibold text-th">{boat.name}</h3>
                        <p className="text-xs text-th-muted">{(boat as any).model} — {formatCurrency((boat as any).monthlyFee || 0)}/mês</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-sm font-bold text-th">{boatShares.length}/{totalShares}</p>
                        <p className="text-xs text-th-muted">cotas ocupadas</p>
                      </div>
                      <div className="w-20 bg-th-surface rounded-full h-2">
                        <div
                          className={`h-2 rounded-full ${occupancy >= 100 ? 'bg-green-500' : occupancy >= 50 ? 'bg-yellow-500' : 'bg-red-400'}`}
                          style={{ width: `${Math.min(occupancy, 100)}%` }}
                        />
                      </div>
                      {isExpanded ? <ChevronUp size={18} className="text-th-muted" /> : <ChevronDown size={18} className="text-th-muted" />}
                    </div>
                  </div>
                  {isExpanded && <table className="w-full border-t border-th">
                    <thead>
                      <tr className="border-b border-th">
                        <th className="text-left py-2.5 px-4 text-xs font-semibold text-th-muted uppercase">Cota #</th>
                        <th className="text-left py-2.5 px-4 text-xs font-semibold text-th-muted uppercase">Cotista</th>
                        <th className="text-left py-2.5 px-4 text-xs font-semibold text-th-muted uppercase">Email</th>
                        <th className="text-right py-2.5 px-4 text-xs font-semibold text-th-muted uppercase">% Participação</th>
                        <th className="text-right py-2.5 px-4 text-xs font-semibold text-th-muted uppercase">Valor Mensal</th>
                        <th className="text-center py-2.5 px-4 text-xs font-semibold text-th-muted uppercase">Limite Reservas</th>
                        <th className="text-center py-2.5 px-4 text-xs font-semibold text-th-muted uppercase">Início</th>
                        <th className="text-center py-2.5 px-4 text-xs font-semibold text-th-muted uppercase">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {boatShares.sort((a, b) => a.shareNumber - b.shareNumber).map((s) => (
                        <tr key={s.id} className="border-b border-th hover:bg-th-hover">
                          <td className="py-3 px-4">
                            <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-primary-100 text-primary-500 font-bold text-sm">
                              {s.shareNumber}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-full bg-th-surface flex items-center justify-center">
                                <User size={14} className="text-th-muted" />
                              </div>
                              <span className="text-sm font-medium text-th">{s.user?.name || '-'}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-sm text-th-muted">{s.user?.email || '-'}</td>
                          <td className="py-3 px-4 text-sm font-medium text-th text-right">{(s.boat ? (100 / (s.boat.totalShares || 1)) : (s.sharePercentage || 0)).toFixed(1)}%</td>
                          <td className="py-3 px-4 text-sm font-medium text-green-600 dark:text-green-400 text-right">{formatCurrency(s.monthlyValue || 0)}</td>
                          <td className="py-3 px-4 text-center">
                            <div className="inline-flex items-center gap-1 bg-th-surface rounded-lg px-1">
                              <button
                                onClick={async () => {
                                  const val = Math.max(1, (s.maxReservations || 3) - 1);
                                  try { await updateShare(s.id, { maxReservations: val }); setShares(prev => prev.map(x => x.id === s.id ? { ...x, maxReservations: val } : x)); } catch { /* empty */ }
                                }}
                                className="w-6 h-6 flex items-center justify-center text-th-muted hover:text-th rounded transition"
                              >
                                <Minus size={12} />
                              </button>
                              <span className="text-sm font-bold text-th w-6 text-center">{s.maxReservations ?? 3}</span>
                              <button
                                onClick={async () => {
                                  const val = (s.maxReservations || 3) + 1;
                                  try { await updateShare(s.id, { maxReservations: val }); setShares(prev => prev.map(x => x.id === s.id ? { ...x, maxReservations: val } : x)); } catch { /* empty */ }
                                }}
                                className="w-6 h-6 flex items-center justify-center text-th-muted hover:text-th rounded transition"
                              >
                                <Plus size={12} />
                              </button>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-sm text-th-muted text-center">{s.startDate ? new Date(s.startDate).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '-'}</td>
                          <td className="py-3 px-4 text-center">
                            <button
                              onClick={() => handleDelete(s)}
                              className="p-1.5 text-red-400 hover:text-red-600 dark:text-red-400 hover:bg-red-500/10 rounded-lg transition"
                              title="Desativar cota"
                            >
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>}
                </div>
              );
            })
        ) : (
          <div className="bg-th-card rounded-2xl shadow-black/10 border border-th p-12 text-center">
            <Coins size={48} className="mx-auto text-th-muted mb-4" />
            <h3 className="text-lg font-semibold text-th-secondary mb-1">Nenhuma cota cadastrada</h3>
            <p className="text-sm text-th-muted mb-4">Vincule usuários às embarcações criando novas cotas</p>
            <button onClick={openCreate} className="bg-primary-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary-600 transition">
              <Plus size={16} className="inline mr-1" /> Criar primeira cota
            </button>
          </div>
        )
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-th-overlay flex items-center justify-center z-50 p-4">
          <div className="bg-th-card rounded-2xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between p-6 border-b border-th">
              <h2 className="text-lg font-bold text-th">Nova Cota</h2>
              <button onClick={() => setShowCreate(false)} className="p-1 hover:bg-primary-500/5 rounded-lg">
                <X size={20} className="text-th-muted" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {/* Boat searchable select */}
              <div>
                <label className="block text-sm font-medium text-th-secondary mb-1">Embarcação *</label>
                <div className="relative">
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-th-muted" />
                    <input
                      type="text"
                      placeholder="Digitar nome da embarcação..."
                      value={boatSearch}
                      onChange={(e) => { setBoatSearch(e.target.value); setShowBoatDropdown(true); if (!e.target.value) { setForm((f) => ({ ...f, boatId: '' })); } }}
                      onFocus={() => setShowBoatDropdown(true)}
                      className="w-full pl-9 pr-8 py-2.5 rounded-lg border border-th text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                    <button type="button" onClick={() => setShowBoatDropdown(!showBoatDropdown)} className="absolute right-2 top-1/2 -translate-y-1/2 text-th-muted">
                      {showBoatDropdown ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                  </div>
                  {showBoatDropdown && (
                    <div className="absolute z-10 w-full mt-1 bg-th-card border border-th rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {boats
                        .filter((b) => !boatSearch || b.name.toLowerCase().includes(boatSearch.toLowerCase()) || b.model.toLowerCase().includes(boatSearch.toLowerCase()))
                        .map((b) => {
                          const used = shares.filter((s) => s.boatId === b.id).length;
                          const isSelected = form.boatId === b.id;
                          return (
                            <button
                              key={b.id}
                              type="button"
                              onClick={() => { onBoatChange(b.id); setBoatSearch(`${b.name} — ${b.model}`); setShowBoatDropdown(false); }}
                              className={`w-full text-left px-3 py-2.5 text-sm hover:bg-primary-500/10 flex items-center justify-between ${isSelected ? 'bg-primary-500/10 text-primary-500' : 'text-th-secondary'}`}
                            >
                              <div className="flex items-center gap-2">
                                <Ship size={14} className="text-th-muted" />
                                <span className="font-medium">{b.name}</span>
                                <span className="text-xs text-th-muted">— {b.model}</span>
                              </div>
                              <span className="text-xs text-th-muted">{used}/{b.totalShares} cotas</span>
                            </button>
                          );
                        })}
                      {boats.filter((b) => !boatSearch || b.name.toLowerCase().includes(boatSearch.toLowerCase()) || b.model.toLowerCase().includes(boatSearch.toLowerCase())).length === 0 && (
                        <p className="px-3 py-3 text-sm text-th-muted text-center">Nenhuma embarcação encontrada</p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Info box when boat selected */}
              {selectedBoat && (
                <div className={`p-3 rounded-lg text-sm ${availableSlots > 0 ? 'bg-blue-500/10 text-blue-700' : 'bg-red-500/10 text-red-700 dark:text-red-400'}`}>
                  <p className="font-medium">{selectedBoat.name}</p>
                  <p className="text-xs mt-0.5">
                    {selectedBoatShares.length}/{selectedBoat.totalShares} cotas ocupadas •{' '}
                    {availableSlots > 0 ? `${availableSlots} disponíveis` : 'Sem vagas disponíveis'} •{' '}
                    Valor por cota: {formatCurrency(selectedBoat.monthlyFee)}
                  </p>
                </div>
              )}

              {/* User searchable select */}
              <div>
                <label className="block text-sm font-medium text-th-secondary mb-1">Cotista (Usuário) *</label>
                <div className="relative">
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-th-muted" />
                    <input
                      type="text"
                      placeholder="Digitar nome ou email do cotista..."
                      value={userSearch}
                      onChange={(e) => { setUserSearch(e.target.value); setShowUserDropdown(true); if (!e.target.value) { setForm((f) => ({ ...f, userId: '' })); } }}
                      onFocus={() => setShowUserDropdown(true)}
                      className="w-full pl-9 pr-8 py-2.5 rounded-lg border border-th text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                    <button type="button" onClick={() => setShowUserDropdown(!showUserDropdown)} className="absolute right-2 top-1/2 -translate-y-1/2 text-th-muted">
                      {showUserDropdown ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                  </div>
                  {showUserDropdown && (
                    <div className="absolute z-10 w-full mt-1 bg-th-card border border-th rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {users
                        .filter((u) => !userSearch || u.name.toLowerCase().includes(userSearch.toLowerCase()) || u.email.toLowerCase().includes(userSearch.toLowerCase()))
                        .map((u) => {
                          const isSelected = form.userId === u.id;
                          return (
                            <button
                              key={u.id}
                              type="button"
                              onClick={() => { setForm((f) => ({ ...f, userId: u.id })); setUserSearch(`${u.name} — ${u.email}`); setShowUserDropdown(false); }}
                              className={`w-full text-left px-3 py-2.5 text-sm hover:bg-primary-500/10 flex items-center gap-2 ${isSelected ? 'bg-primary-500/10 text-primary-500' : 'text-th-secondary'}`}
                            >
                              <div className="w-7 h-7 rounded-full bg-th-surface flex items-center justify-center flex-shrink-0">
                                <User size={12} className="text-th-muted" />
                              </div>
                              <div>
                                <p className="font-medium">{u.name}</p>
                                <p className="text-xs text-th-muted">{u.email}</p>
                              </div>
                            </button>
                          );
                        })}
                      {users.filter((u) => !userSearch || u.name.toLowerCase().includes(userSearch.toLowerCase()) || u.email.toLowerCase().includes(userSearch.toLowerCase())).length === 0 && (
                        <p className="px-3 py-3 text-sm text-th-muted text-center">Nenhum usuário encontrado</p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Share number */}
                <div>
                  <label className="block text-sm font-medium text-th-secondary mb-1">Número da Cota</label>
                  <input
                    type="number"
                    min={1}
                    value={form.shareNumber}
                    onChange={(e) => setForm((f) => ({ ...f, shareNumber: parseInt(e.target.value) || 1 }))}
                    className="w-full px-3 py-2.5 rounded-lg border border-th text-sm"
                  />
                </div>
                {/* Start date */}
                <div>
                  <label className="block text-sm font-medium text-th-secondary mb-1">Data de Início</label>
                  <input
                    type="date"
                    value={form.startDate}
                    onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-lg border border-th text-sm"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 p-6 border-t border-th">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2.5 rounded-lg border border-th text-sm font-medium text-th-secondary hover:bg-th-hover">
                Cancelar
              </button>
              <button
                onClick={handleCreate}
                disabled={saving || !form.boatId || !form.userId || availableSlots <= 0}
                className="px-4 py-2.5 rounded-lg bg-primary-500 text-white text-sm font-medium hover:bg-primary-600 transition disabled:opacity-50"
              >
                {saving ? 'Criando...' : 'Criar Cota'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ShareTable({ shares, onDelete, formatCurrency }: { shares: ShareItem[]; onDelete: (s: ShareItem) => void; formatCurrency: (v: number) => string }) {
  return (
    <div className="bg-th-card rounded-2xl shadow-black/10 border border-th overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-th bg-th-surface">
            <th className="text-left py-3 px-4 text-xs font-semibold text-th-muted uppercase">Embarcação</th>
            <th className="text-center py-3 px-4 text-xs font-semibold text-th-muted uppercase">Cota #</th>
            <th className="text-left py-3 px-4 text-xs font-semibold text-th-muted uppercase">Cotista</th>
            <th className="text-right py-3 px-4 text-xs font-semibold text-th-muted uppercase">%</th>
            <th className="text-right py-3 px-4 text-xs font-semibold text-th-muted uppercase">Valor Mensal</th>
            <th className="text-center py-3 px-4 text-xs font-semibold text-th-muted uppercase">Início</th>
            <th className="text-center py-3 px-4 text-xs font-semibold text-th-muted uppercase">Ações</th>
          </tr>
        </thead>
        <tbody>
          {shares.map((s) => (
            <tr key={s.id} className="border-b border-th hover:bg-th-hover">
              <td className="py-3 px-4 text-sm font-medium text-th">{s.boat?.name || '-'}</td>
              <td className="py-3 px-4 text-center">
                <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-primary-100 text-primary-500 font-bold text-sm">{s.shareNumber}</span>
              </td>
              <td className="py-3 px-4 text-sm text-th-secondary">{s.user?.name || '-'}</td>
              <td className="py-3 px-4 text-sm font-medium text-th text-right">{s.sharePercentage?.toFixed(1)}%</td>
              <td className="py-3 px-4 text-sm font-medium text-green-600 dark:text-green-400 text-right">{formatCurrency(s.monthlyValue || 0)}</td>
              <td className="py-3 px-4 text-sm text-th-muted text-center">{s.startDate ? new Date(s.startDate).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '-'}</td>
              <td className="py-3 px-4 text-center">
                <button onClick={() => onDelete(s)} className="p-1.5 text-red-400 hover:text-red-600 dark:text-red-400 hover:bg-red-500/10 rounded-lg transition" title="Desativar cota">
                  <Trash2 size={16} />
                </button>
              </td>
            </tr>
          ))}
          {shares.length === 0 && (
            <tr><td colSpan={7} className="py-8 text-center text-th-muted">Nenhuma cota encontrada</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
