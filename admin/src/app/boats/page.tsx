'use client';

import { useState, useEffect, useRef } from 'react';
import { Ship, Search, Plus, Edit, Trash2, AlertTriangle, CheckCircle, Wrench, Anchor, X, Save, DollarSign, CheckSquare, User, Camera, Volume2, VolumeX, FileText, Shield, Download, Upload } from 'lucide-react';
import { getBoats, createBoat, updateBoat, deleteBoat, uploadBoatDocument, uploadBoatInsurance, getBoatPdf } from '@/services/api';

interface Boat {
  id: string;
  name: string;
  model: string;
  year: number;
  registration?: string;
  capacity?: number;
  fuelType?: string;
  fuelCapacity?: number;
  totalShares: number;
  soldShares?: number;
  monthlyFee?: number;
  shareValue?: number;
  imageUrl?: string;
  locationBerth?: string;
  hasSound?: boolean;
  documentUrl?: string;
  insuranceUrl?: string;
  status: string;
  nextMaintenance?: string;
  _count?: { shares?: number; reservations?: number };
}

const emptyForm = { name: '', model: '', year: new Date().getFullYear(), registration: '', capacity: 6, fuelType: 'GASOLINE', fuelCapacity: 70, totalShares: 4, monthlyFee: '2500', shareValue: '0', locationBerth: '', hasSound: false, status: 'AVAILABLE', ownershipType: 'COTA' as 'COTA' | 'PROPRIA', imageUrl: '' };

function extractOwnership(notes?: string): { type: 'COTA' | 'PROPRIA'; cleanNotes: string } {
  if (notes?.startsWith('[PRÓPRIA]')) return { type: 'PROPRIA', cleanNotes: notes.replace(/^\[PRÓPRIA\]\s*/, '') };
  if (notes?.startsWith('[COTA]')) return { type: 'COTA', cleanNotes: notes.replace(/^\[COTA\]\s*/, '') };
  return { type: 'COTA', cleanNotes: notes || '' };
}

const statusConfig: Record<string, { label: string; color: string; icon: any }> = {
  AVAILABLE: { label: 'Disponível', color: 'bg-green-500/15 text-green-600 dark:text-green-400', icon: CheckCircle },
  IN_USE: { label: 'Em Uso', color: 'bg-blue-500/15 text-blue-600 dark:text-blue-400', icon: Anchor },
  MAINTENANCE: { label: 'Manutenção', color: 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400', icon: Wrench },
  BLOCKED: { label: 'Bloqueado', color: 'bg-red-500/15 text-red-600 dark:text-red-400', icon: AlertTriangle },
};

export default function BoatsPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [boats, setBoats] = useState<Boat[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingBoat, setEditingBoat] = useState<Boat | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkFee, setBulkFee] = useState<number>(0);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [expandedBoat, setExpandedBoat] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);

  useEffect(() => { loadBoats(); }, []);

  async function loadBoats() {
    try {
      setLoading(true);
      const { data } = await getBoats();
      setBoats(Array.isArray(data) ? data : data.data || data.items || []);
    } catch {
      setBoats([]);
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setEditingBoat(null);
    setForm(emptyForm);
    setShowModal(true);
  }

  function openEdit(boat: Boat) {
    setEditingBoat(boat);
    const { type } = extractOwnership((boat as any).notes);
    setForm({
      name: boat.name,
      model: boat.model,
      year: boat.year,
      registration: boat.registration || '',
      capacity: boat.capacity || 6,
      fuelType: boat.fuelType || 'GASOLINE',
      fuelCapacity: boat.fuelCapacity || 70,
      totalShares: type === 'PROPRIA' ? 1 : (boat.totalShares || 4),
      monthlyFee: String(boat.monthlyFee || 2500),
      shareValue: String((boat as any).shareValue || 0),
      locationBerth: boat.locationBerth || '',
      hasSound: (boat as any).hasSound || false,
      status: boat.status,
      ownershipType: type,
      imageUrl: boat.imageUrl || '',
    });
    setShowModal(true);
  }

  async function handleSave() {
    if (!form.name || !form.model || !form.registration) {
      alert('Preencha nome, modelo e registro.');
      return;
    }
    setSaving(true);
    try {
      const { ownershipType, imageUrl, ...rest } = form;
      const notesPrefix = ownershipType === 'PROPRIA' ? '[PRÓPRIA] ' : '[COTA] ';
      const existingNotes = editingBoat ? extractOwnership((editingBoat as any).notes).cleanNotes : '';
      const payload = { ...rest, year: Number(rest.year), capacity: Number(rest.capacity), fuelCapacity: Number(rest.fuelCapacity), totalShares: ownershipType === 'PROPRIA' ? 1 : Number(rest.totalShares), monthlyFee: parseFloat(rest.monthlyFee) || 0, shareValue: parseFloat(rest.shareValue) || 0, notes: notesPrefix + existingNotes, imageUrl: imageUrl || undefined };
      if (editingBoat) {
        await updateBoat(editingBoat.id, payload);
      } else {
        await createBoat(payload);
      }
      setShowModal(false);
      loadBoats();
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(boat: Boat) {
    if (!confirm(`Excluir embarcação "${boat.name}"? Esta ação não pode ser desfeita.`)) return;
    try {
      await deleteBoat(boat.id);
      setSelected((prev) => { const n = new Set(prev); n.delete(boat.id); return n; });
      loadBoats();
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Erro ao excluir');
    }
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  function toggleSelectAll() {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((b) => b.id)));
    }
  }

  async function handleBulkFee() {
    if (!bulkFee || bulkFee <= 0) { alert('Informe um valor válido.'); return; }
    setBulkSaving(true);
    try {
      await Promise.all(Array.from(selected).map((id) => updateBoat(id, { monthlyFee: Number(bulkFee) })));
      setShowBulkModal(false);
      setSelected(new Set());
      loadBoats();
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Erro ao atualizar');
    } finally {
      setBulkSaving(false);
    }
  }

  async function handleUpload(boatId: string, type: 'document' | 'insurance', file: File) {
    setUploading(`${boatId}-${type}`);
    try {
      if (type === 'document') {
        await uploadBoatDocument(boatId, file);
      } else {
        await uploadBoatInsurance(boatId, file);
      }
      loadBoats();
    } catch (err: any) {
      alert(err?.response?.data?.message || `Erro ao enviar ${type === 'document' ? 'documento' : 'seguro'}`);
    } finally {
      setUploading(null);
    }
  }

  async function handleDownloadPdf(boatId: string, type: 'document' | 'insurance' | 'combined', boatName: string) {
    try {
      const res = await getBoatPdf(boatId, type);
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${boatName}-${type === 'combined' ? 'documento-seguro' : type === 'document' ? 'documento' : 'seguro'}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Erro ao gerar PDF');
    }
  }

  const filtered = boats.filter((b) => {
    const matchSearch = b.name?.toLowerCase().includes(search.toLowerCase()) || b.model?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || b.status === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-th flex items-center gap-2">
            <Ship className="text-primary-500" />
            Embarcações
          </h1>
          <p className="text-th-muted text-sm mt-1">{boats.length} embarcações cadastradas</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 bg-primary-500 text-white px-4 py-2.5 rounded-lg font-medium hover:bg-primary-600 transition">
          <Plus size={18} />
          Nova Embarcação
        </button>
      </div>

      {/* Bulk Action Bar */}
      {selected.size > 0 && (
        <div className="bg-primary-500/10 border border-primary-500/30 rounded-2xl p-3 mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CheckSquare size={18} className="text-primary-500" />
            <span className="text-sm font-medium text-primary-500">{selected.size} embarcação(ões) selecionada(s)</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => { setBulkFee(0); setShowBulkModal(true); }} className="flex items-center gap-1.5 bg-primary-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary-600 transition">
              <DollarSign size={15} />
              Alterar Mensalidade
            </button>
            <button onClick={() => setSelected(new Set())} className="px-3 py-2 text-sm text-th-muted hover:text-th-secondary">
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="bg-th-card rounded-2xl shadow-black/10 border border-th p-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="relative flex-1">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-th-muted" />
            <input
              type="text"
              placeholder="Buscar por nome ou modelo..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-th focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500/50 text-sm"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2.5 rounded-lg border border-th text-sm focus:ring-2 focus:ring-primary-500/30"
          >
            <option value="all">Todos Status</option>
            <option value="AVAILABLE">Disponível</option>
            <option value="IN_USE">Em Uso</option>
            <option value="MAINTENANCE">Manutenção</option>
            <option value="BLOCKED">Bloqueado</option>
          </select>
        </div>

        {/* Select All */}
        <div className="flex items-center gap-3 mb-3">
          <label className="flex items-center gap-2 cursor-pointer text-sm text-th-muted hover:text-th-secondary">
            <input type="checkbox" checked={filtered.length > 0 && selected.size === filtered.length} onChange={toggleSelectAll} className="w-4 h-4 rounded border-th text-primary-500 focus:ring-primary-500" />
            Selecionar todas
          </label>
        </div>

        <div className="grid gap-4">
          {filtered.map((boat) => {
            const sc = statusConfig[boat.status] || { label: boat.status, color: 'bg-th-surface text-th-secondary', icon: Ship };
            const Icon = sc.icon;
            const { type: ownerType } = extractOwnership((boat as any).notes);
            const isPropria = ownerType === 'PROPRIA';
            const sold = boat._count?.shares ?? boat.soldShares ?? 0;
            const occupancy = boat.totalShares ? Math.round((sold / boat.totalShares) * 100) : 0;
            const isSelected = selected.has(boat.id);
            return (
              <div key={boat.id} className={`border rounded-2xl p-5 hover:shadow-md transition-shadow ${isSelected ? 'border-primary-400 bg-primary-500/10' : 'border-th'}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(boat.id)} className="w-4 h-4 rounded border-th text-primary-500 focus:ring-primary-500 cursor-pointer" />
                    <div className="w-14 h-14 bg-th-surface rounded-2xl flex items-center justify-center overflow-hidden">
                      {boat.imageUrl ? (
                        <img src={boat.imageUrl} alt={boat.name} className="w-full h-full object-cover" />
                      ) : (
                        <Ship className="text-th-secondary" size={28} />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-th">{boat.name}</h3>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${isPropria ? 'bg-orange-500/15 text-orange-600 dark:text-orange-400' : 'bg-blue-500/15 text-blue-600 dark:text-blue-400'}`}>
                          {isPropria ? 'Própria' : 'Cota'}
                        </span>
                      </div>
                      <p className="text-sm text-th-muted">{boat.model} • {boat.year}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-center">
                      <p className="text-sm font-bold text-green-600 dark:text-green-400">R$ {(boat.monthlyFee || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                      <p className="text-xs text-th-muted">{isPropria ? 'Mensalidade' : 'Mensal/Cotista'}</p>
                    </div>
                    {!isPropria && (boat as any).shareValue > 0 && (
                      <div className="text-center">
                        <p className="text-sm font-bold text-blue-600 dark:text-blue-400">R$ {((boat as any).shareValue || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                        <p className="text-xs text-th-muted">Valor da Cota</p>
                      </div>
                    )}
                    {isPropria ? (
                      <div className="text-center">
                        <div className="flex items-center gap-1 justify-center">
                          <User size={14} className="text-orange-500" />
                          <p className="text-sm font-bold text-orange-600 dark:text-orange-400">Proprietário</p>
                        </div>
                        <p className="text-xs text-th-muted">Uso exclusivo</p>
                      </div>
                    ) : (
                      <>
                        <div className="text-center">
                          <p className="text-lg font-bold text-th">{sold}/{boat.totalShares}</p>
                          <p className="text-xs text-th-muted">Cotas vendidas</p>
                        </div>
                        <div className="w-24">
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-th-muted">Ocupação</span>
                            <span className="font-medium">{occupancy}%</span>
                          </div>
                          <div className="w-full bg-th-surface rounded-full h-2">
                            <div
                              className={`h-2 rounded-full ${occupancy === 100 ? 'bg-green-500' : occupancy >= 70 ? 'bg-primary-500' : 'bg-yellow-500'}`}
                              style={{ width: `${occupancy}%` }}
                            />
                          </div>
                        </div>
                      </>
                    )}
                    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${sc.color}`}>
                      <Icon size={14} />
                      {sc.label}
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => setExpandedBoat(expandedBoat === boat.id ? null : boat.id)} className={`p-2 rounded-lg transition ${expandedBoat === boat.id ? 'bg-primary-500/15 text-primary-500' : 'hover:bg-primary-500/5 text-th-muted'}`} title="Documentos">
                        <FileText size={16} />
                      </button>
                      <button onClick={() => openEdit(boat)} className="p-2 hover:bg-primary-500/5 rounded-lg transition" title="Editar">
                        <Edit size={16} className="text-th-muted" />
                      </button>
                      <button onClick={() => handleDelete(boat)} className="p-2 hover:bg-red-500/10 rounded-lg transition" title="Excluir">
                        <Trash2 size={16} className="text-red-400" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Expanded Document/Insurance Section */}
                {expandedBoat === boat.id && (
                  <div className="mt-4 pt-4 border-t border-th">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Document Upload */}
                      <div className="bg-th-surface rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <FileText size={18} className="text-blue-500" />
                          <h4 className="font-semibold text-th text-sm">Documento</h4>
                          {boat.documentUrl && <span className="ml-auto px-2 py-0.5 bg-green-500/15 text-green-600 dark:text-green-400 text-[10px] font-bold rounded-full">ENVIADO</span>}
                        </div>
                        {boat.documentUrl ? (
                          <div className="space-y-2">
                            <a href={boat.documentUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary-500 hover:underline truncate block">Ver arquivo original</a>
                            <div className="flex gap-2">
                              <label className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-th-card border border-th rounded-lg text-xs text-th-secondary cursor-pointer hover:bg-primary-500/10 transition">
                                <Upload size={13} />
                                {uploading === `${boat.id}-document` ? 'Enviando...' : 'Substituir'}
                                <input type="file" accept="image/*,.pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(boat.id, 'document', f); e.target.value = ''; }} />
                              </label>
                              <button onClick={() => handleDownloadPdf(boat.id, 'document', boat.name)} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-500 text-white rounded-lg text-xs font-medium hover:bg-blue-600 transition">
                                <Download size={13} /> PDF
                              </button>
                            </div>
                          </div>
                        ) : (
                          <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-th rounded-lg p-4 cursor-pointer hover:border-primary-500/50 hover:bg-primary-500/5 transition">
                            <Upload size={20} className="text-th-muted" />
                            <span className="text-xs text-th-muted">{uploading === `${boat.id}-document` ? 'Enviando...' : 'Clique para enviar documento'}</span>
                            <span className="text-[10px] text-th-muted">PDF ou imagem, até 10MB</span>
                            <input type="file" accept="image/*,.pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(boat.id, 'document', f); e.target.value = ''; }} />
                          </label>
                        )}
                      </div>

                      {/* Insurance Upload */}
                      <div className="bg-th-surface rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <Shield size={18} className="text-orange-500" />
                          <h4 className="font-semibold text-th text-sm">Seguro</h4>
                          {boat.insuranceUrl && <span className="ml-auto px-2 py-0.5 bg-green-500/15 text-green-600 dark:text-green-400 text-[10px] font-bold rounded-full">ENVIADO</span>}
                        </div>
                        {boat.insuranceUrl ? (
                          <div className="space-y-2">
                            <a href={boat.insuranceUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary-500 hover:underline truncate block">Ver arquivo original</a>
                            <div className="flex gap-2">
                              <label className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-th-card border border-th rounded-lg text-xs text-th-secondary cursor-pointer hover:bg-primary-500/10 transition">
                                <Upload size={13} />
                                {uploading === `${boat.id}-insurance` ? 'Enviando...' : 'Substituir'}
                                <input type="file" accept="image/*,.pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(boat.id, 'insurance', f); e.target.value = ''; }} />
                              </label>
                              <button onClick={() => handleDownloadPdf(boat.id, 'insurance', boat.name)} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-orange-500 text-white rounded-lg text-xs font-medium hover:bg-orange-600 transition">
                                <Download size={13} /> PDF
                              </button>
                            </div>
                          </div>
                        ) : (
                          <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-th rounded-lg p-4 cursor-pointer hover:border-primary-500/50 hover:bg-primary-500/5 transition">
                            <Upload size={20} className="text-th-muted" />
                            <span className="text-xs text-th-muted">{uploading === `${boat.id}-insurance` ? 'Enviando...' : 'Clique para enviar seguro'}</span>
                            <span className="text-[10px] text-th-muted">PDF ou imagem, até 10MB</span>
                            <input type="file" accept="image/*,.pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(boat.id, 'insurance', f); e.target.value = ''; }} />
                          </label>
                        )}
                      </div>
                    </div>

                    {/* Combined PDF Button */}
                    {boat.documentUrl && boat.insuranceUrl && (
                      <div className="mt-3">
                        <button onClick={() => handleDownloadPdf(boat.id, 'combined', boat.name)} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary-500 text-white rounded-lg text-sm font-medium hover:bg-primary-600 transition">
                          <Download size={15} /> Gerar PDF Combinado (Documento + Seguro)
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {!loading && filtered.length === 0 && (
            <p className="text-center text-th-muted py-8">Nenhuma embarcação encontrada.</p>
          )}
        </div>
      </div>

      {/* Create / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-th-overlay flex items-center justify-center z-50" onClick={() => setShowModal(false)}>
          <div className="bg-th-card rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-5">
              <h2 className="text-lg font-bold text-th">{editingBoat ? 'Editar Embarcação' : 'Nova Embarcação'}</h2>
              <button onClick={() => setShowModal(false)} className="text-th-muted hover:text-th-secondary"><X size={20} /></button>
            </div>
            <div className="space-y-4">
              {/* Photo Upload */}
              <div>
                <label className="block text-sm font-medium text-th-secondary mb-2">Foto da Embarcação</label>
                <div className="flex items-center gap-4">
                  <div className="w-24 h-24 bg-th-surface rounded-xl flex items-center justify-center overflow-hidden border-2 border-dashed border-th">
                    {form.imageUrl ? (
                      <img src={form.imageUrl} alt="Preview" className="w-full h-full object-cover" />
                    ) : (
                      <Camera size={28} className="text-th-muted" />
                    )}
                  </div>
                  <div className="flex-1">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      id="boat-photo-input"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        if (file.size > 5 * 1024 * 1024) { alert('Imagem muito grande. Máximo 5MB.'); return; }
                        const reader = new FileReader();
                        reader.onload = () => setForm({ ...form, imageUrl: reader.result as string });
                        reader.readAsDataURL(file);
                      }}
                    />
                    <label htmlFor="boat-photo-input" className="inline-flex items-center gap-1.5 px-3 py-2 bg-th-surface border border-th rounded-lg text-sm text-th-secondary cursor-pointer hover:bg-primary-500/10 transition">
                      <Camera size={15} />
                      {form.imageUrl ? 'Trocar foto' : 'Adicionar foto'}
                    </label>
                    {form.imageUrl && (
                      <button onClick={() => setForm({ ...form, imageUrl: '' })} className="ml-2 text-xs text-red-400 hover:text-red-600">Remover</button>
                    )}
                    <p className="text-xs text-th-muted mt-1">JPG ou PNG, até 5MB</p>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-th-secondary mb-1">Nome *</label>
                  <input value={form.name} onChange={(e) => setForm({...form, name: e.target.value})} placeholder="Ex: Wave Runner Pro" className="w-full border border-th rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-th-secondary mb-1">Modelo *</label>
                  <input value={form.model} onChange={(e) => setForm({...form, model: e.target.value})} placeholder="Ex: Yamaha VX Cruiser" className="w-full border border-th rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 outline-none" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-th-secondary mb-1">Ano</label>
                  <input type="number" value={form.year} onChange={(e) => setForm({...form, year: Number(e.target.value)})} className="w-full border border-th rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-th-secondary mb-1">Registro *</label>
                  <input value={form.registration} onChange={(e) => setForm({...form, registration: e.target.value})} placeholder="Ex: BR-SP-12345" className="w-full border border-th rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 outline-none" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-th-secondary mb-1">Capacidade</label>
                  <input type="number" value={form.capacity} onChange={(e) => setForm({...form, capacity: Number(e.target.value)})} className="w-full border border-th rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-th-secondary mb-1">Combustível</label>
                  <select value={form.fuelType} onChange={(e) => setForm({...form, fuelType: e.target.value})} className="w-full border border-th rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 outline-none">
                    <option value="GASOLINE">Gasolina</option>
                    <option value="DIESEL">Diesel</option>
                    <option value="ETHANOL">Etanol</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-th-secondary mb-1">Cap. Tanque (L)</label>
                  <input type="number" value={form.fuelCapacity} onChange={(e) => setForm({...form, fuelCapacity: Number(e.target.value)})} className="w-full border border-th rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 outline-none" />
                </div>
              </div>
              {/* Ownership Type */}
              <div>
                <label className="block text-sm font-medium text-th-secondary mb-2">Tipo de Embarcação *</label>
                <div className="grid grid-cols-2 gap-3">
                  <button type="button" onClick={() => setForm({...form, ownershipType: 'COTA', totalShares: form.ownershipType === 'PROPRIA' ? 4 : form.totalShares})} className={`p-3 rounded-lg border-2 text-left transition ${form.ownershipType === 'COTA' ? 'border-blue-500 bg-blue-500/10' : 'border-th hover:border-th'}`}>
                    <p className="text-sm font-bold text-th">🔗 Cota</p>
                    <p className="text-xs text-th-muted mt-0.5">Compartilhada entre cotistas com rateio de custos</p>
                  </button>
                  <button type="button" onClick={() => setForm({...form, ownershipType: 'PROPRIA', totalShares: 1})} className={`p-3 rounded-lg border-2 text-left transition ${form.ownershipType === 'PROPRIA' ? 'border-orange-500 bg-orange-500/10' : 'border-th hover:border-th'}`}>
                    <p className="text-sm font-bold text-th">👤 Própria</p>
                    <p className="text-xs text-th-muted mt-0.5">Proprietário único, sem rateio de custos</p>
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {form.ownershipType === 'COTA' && (
                  <div>
                    <label className="block text-sm font-medium text-th-secondary mb-1">Total Cotas</label>
                    <input type="number" value={form.totalShares} onChange={(e) => setForm({...form, totalShares: Number(e.target.value)})} className="w-full border border-th rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 outline-none" />
                  </div>
                )}
                <div className={form.ownershipType === 'PROPRIA' ? 'col-span-2' : ''}>
                  <label className="block text-sm font-medium text-th-secondary mb-1">
                    {form.ownershipType === 'PROPRIA' ? 'Mensalidade (R$)' : 'Mensalidade por Cotista (R$)'}
                  </label>
                  <input type="text" inputMode="decimal" value={form.monthlyFee} onChange={(e) => { const v = e.target.value.replace(/[^0-9.]/g, ''); setForm({...form, monthlyFee: v}); }} className="w-full border border-th rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 outline-none" />
                </div>
              </div>
              {form.ownershipType === 'COTA' && (
                <div>
                  <label className="block text-sm font-medium text-th-secondary mb-1">Valor da Cota (R$)</label>
                  <input type="text" inputMode="decimal" value={form.shareValue} onChange={(e) => { const v = e.target.value.replace(/[^0-9.]/g, ''); setForm({...form, shareValue: v}); }} placeholder="Ex: 35000" className="w-full border border-th rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 outline-none" />
                  <p className="text-xs text-th-muted mt-1">Valor de aquisição de cada cota</p>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-th-secondary mb-1">Local / Berço</label>
                <input value={form.locationBerth} onChange={(e) => setForm({...form, locationBerth: e.target.value})} placeholder="Ex: Berço 12 — Pier A" className="w-full border border-th rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-th-secondary mb-1">Sistema de Som</label>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setForm({...form, hasSound: true})} className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium border transition-colors ${form.hasSound ? 'bg-primary-500 text-white border-primary-500' : 'border-th text-th-secondary hover:bg-th-surface'}`}><Volume2 size={16} /> COM SOM</button>
                  <button type="button" onClick={() => setForm({...form, hasSound: false})} className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium border transition-colors ${!form.hasSound ? 'bg-primary-500 text-white border-primary-500' : 'border-th text-th-secondary hover:bg-th-surface'}`}><VolumeX size={16} /> SEM SOM</button>
                </div>
              </div>
              {editingBoat && (
                <div>
                  <label className="block text-sm font-medium text-th-secondary mb-1">Status</label>
                  <select value={form.status} onChange={(e) => setForm({...form, status: e.target.value})} className="w-full border border-th rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 outline-none">
                    <option value="AVAILABLE">Disponível</option>
                    <option value="IN_USE">Em Uso</option>
                    <option value="MAINTENANCE">Manutenção</option>
                    <option value="BLOCKED">Bloqueado</option>
                  </select>
                </div>
              )}
              <button onClick={handleSave} disabled={saving} className="w-full flex items-center justify-center gap-2 bg-primary-500 text-white py-2.5 rounded-lg font-medium hover:bg-primary-600 disabled:opacity-50">
                <Save size={16} /> {saving ? 'Salvando...' : editingBoat ? 'Salvar alterações' : 'Criar embarcação'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Bulk Monthly Fee Modal */}
      {showBulkModal && (
        <div className="fixed inset-0 bg-th-overlay flex items-center justify-center z-50" onClick={() => setShowBulkModal(false)}>
          <div className="bg-th-card rounded-2xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-5">
              <h2 className="text-lg font-bold text-th">Alterar Mensalidade em Lote</h2>
              <button onClick={() => setShowBulkModal(false)} className="text-th-muted hover:text-th-secondary"><X size={20} /></button>
            </div>
            <p className="text-sm text-th-muted mb-4">
              Alterar mensalidade de <strong>{selected.size}</strong> embarcação(ões):
            </p>
            <div className="space-y-2 mb-4 max-h-32 overflow-y-auto">
              {boats.filter((b) => selected.has(b.id)).map((b) => (
                <div key={b.id} className="flex items-center justify-between text-sm bg-th-surface rounded-lg px-3 py-2">
                  <span className="font-medium text-th-secondary">{b.name}</span>
                  <span className="text-th-muted">Atual: R$ {(b.monthlyFee || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                </div>
              ))}
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-th-secondary mb-1">Novo valor da mensalidade (R$)</label>
              <input type="number" value={bulkFee || ''} onChange={(e) => setBulkFee(Number(e.target.value))} placeholder="Ex: 3000" className="w-full border border-th rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 outline-none" autoFocus />
            </div>
            <button onClick={handleBulkFee} disabled={bulkSaving} className="w-full flex items-center justify-center gap-2 bg-primary-500 text-white py-2.5 rounded-lg font-medium hover:bg-primary-600 disabled:opacity-50">
              <DollarSign size={16} /> {bulkSaving ? 'Atualizando...' : 'Aplicar para todas selecionadas'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
