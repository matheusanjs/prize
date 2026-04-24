'use client';

import { useState, useEffect } from 'react';
import {
  UtensilsCrossed, Plus, Edit, Trash2, X, Save, ChevronDown, ChevronUp,
  Eye, EyeOff, Search, FolderPlus, DollarSign, ImageIcon, Upload, ExternalLink,
  CheckSquare, Square, Minus, Tag, ShoppingBag, TrendingUp, TrendingDown, Loader2,
} from 'lucide-react';
import {
  getMenuCategories, createMenuCategory, updateMenuCategory, deleteMenuCategory,
  createMenuItem, updateMenuItem, deleteMenuItem, uploadMenuImage,
} from '@/services/api';

interface MenuItem {
  id: string;
  categoryId: string;
  name: string;
  description?: string;
  price: number;
  costPrice?: number;
  image?: string;
  isAvailable: boolean;
  isConvenience: boolean;
  order: number;
}

interface MenuCategory {
  id: string;
  name: string;
  slug: string;
  order: number;
  isActive: boolean;
  items: MenuItem[];
}

function slugify(str: string) {
  return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

const emptyItem = { name: '', description: '', price: 0, costPrice: 0, image: '', isAvailable: true, isConvenience: false };
const emptyCat = { name: '', slug: '' };

export default function CardapioPage() {
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedCat, setExpandedCat] = useState<string | null>(null);

  // Category modal
  const [showCatModal, setShowCatModal] = useState(false);
  const [editingCat, setEditingCat] = useState<MenuCategory | null>(null);
  const [catForm, setCatForm] = useState(emptyCat);
  const [savingCat, setSavingCat] = useState(false);

  // Item modal
  const [showItemModal, setShowItemModal] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [itemCatId, setItemCatId] = useState('');
  const [itemForm, setItemForm] = useState(emptyItem);
  const [savingItem, setSavingItem] = useState(false);

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'category' | 'item'; id: string; name: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [imageMode, setImageMode] = useState<'url' | 'upload'>('url');

  // Bulk selection
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkPriceModal, setBulkPriceModal] = useState(false);
  const [bulkPriceMode, setBulkPriceMode] = useState<'fixed' | 'pct_up' | 'pct_down' | 'val_up' | 'val_down'>('pct_up');
  const [bulkPriceValue, setBulkPriceValue] = useState<number>(0);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      setLoading(true);
      const { data } = await getMenuCategories(true);
      setCategories(Array.isArray(data) ? data : data.data || []);
    } catch { setCategories([]); } finally { setLoading(false); }
  }

  // ─── Category CRUD ──────────────────────────────────────

  function openCreateCat() {
    setEditingCat(null);
    setCatForm(emptyCat);
    setShowCatModal(true);
  }

  function openEditCat(cat: MenuCategory) {
    setEditingCat(cat);
    setCatForm({ name: cat.name, slug: cat.slug });
    setShowCatModal(true);
  }

  async function saveCat() {
    setSavingCat(true);
    try {
      const slug = catForm.slug || slugify(catForm.name);
      if (editingCat) {
        await updateMenuCategory(editingCat.id, { name: catForm.name, slug });
      } else {
        await createMenuCategory({ name: catForm.name, slug });
      }
      setShowCatModal(false);
      await load();
    } catch (e: any) { alert(e.response?.data?.message || 'Erro ao salvar categoria'); }
    finally { setSavingCat(false); }
  }

  async function toggleCatActive(cat: MenuCategory) {
    await updateMenuCategory(cat.id, { isActive: !cat.isActive });
    await load();
  }

  // ─── Item CRUD ──────────────────────────────────────────

  function openCreateItem(categoryId: string) {
    setEditingItem(null);
    setItemCatId(categoryId);
    setItemForm(emptyItem);
    setShowItemModal(true);
  }

  function openEditItem(item: MenuItem) {
    setEditingItem(item);
    setItemCatId(item.categoryId);
    setItemForm({
      name: item.name,
      description: item.description || '',
      price: item.price,
      costPrice: item.costPrice || 0,
      image: item.image || '',
      isAvailable: item.isAvailable,
      isConvenience: item.isConvenience ?? false,
    });
    setShowItemModal(true);
  }

  async function saveItem() {
    setSavingItem(true);
    try {
      const payload = {
        categoryId: itemCatId,
        name: itemForm.name,
        description: itemForm.description || undefined,
        price: Number(itemForm.price),
        costPrice: itemForm.costPrice ? Number(itemForm.costPrice) : undefined,
        image: itemForm.image || undefined,
        isAvailable: itemForm.isAvailable,
        isConvenience: itemForm.isConvenience,
      };
      if (editingItem) {
        await updateMenuItem(editingItem.id, payload);
      } else {
        await createMenuItem(payload);
      }
      setShowItemModal(false);
      await load();
    } catch (e: any) { alert(e.response?.data?.message || 'Erro ao salvar item'); }
    finally { setSavingItem(false); }
  }

  async function toggleItemAvailable(item: MenuItem) {
    await updateMenuItem(item.id, { isAvailable: !item.isAvailable });
    await load();
  }

  // ─── Delete ─────────────────────────────────────────────

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      if (deleteTarget.type === 'category') await deleteMenuCategory(deleteTarget.id);
      else await deleteMenuItem(deleteTarget.id);
      setDeleteTarget(null);
      await load();
    } catch (e: any) { alert(e.response?.data?.message || 'Erro ao excluir'); }
  }

  // ─── Bulk selection ──────────────────────────────────────

  function isCatAllSelected(cat: MenuCategory) {
    return cat.items.length > 0 && cat.items.every(i => selectedItems.has(i.id));
  }
  function isCatSomeSelected(cat: MenuCategory) {
    return cat.items.some(i => selectedItems.has(i.id)) && !isCatAllSelected(cat);
  }
  function toggleCatSelection(cat: MenuCategory) {
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (isCatAllSelected(cat)) { cat.items.forEach(i => next.delete(i.id)); }
      else { cat.items.forEach(i => next.add(i.id)); }
      return next;
    });
  }
  function toggleItemSelection(id: string) {
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function clearSelection() { setSelectedItems(new Set()); }

  async function executeBulkAction(action: 'pause' | 'activate' | 'convenience_on' | 'convenience_off' | 'delete') {
    if (selectedItems.size === 0) return;
    setBulkLoading(true);
    try {
      const ids = [...selectedItems];
      if (action === 'delete') {
        await Promise.all(ids.map(id => deleteMenuItem(id)));
      } else {
        const update =
          action === 'pause'           ? { isAvailable: false } :
          action === 'activate'        ? { isAvailable: true } :
          action === 'convenience_on'  ? { isConvenience: true } :
                                         { isConvenience: false };
        await Promise.all(ids.map(id => updateMenuItem(id, update)));
      }
      clearSelection();
      setBulkDeleteConfirm(false);
      await load();
    } catch (e: any) { alert(e.response?.data?.message || 'Erro na ação em massa'); }
    finally { setBulkLoading(false); }
  }

  async function executeBulkPrice() {
    if (selectedItems.size === 0 || !bulkPriceValue) return;
    setBulkLoading(true);
    try {
      const itemMap = Object.fromEntries(categories.flatMap(c => c.items).map(i => [i.id, i]));
      await Promise.all([...selectedItems].map(id => {
        const item = itemMap[id];
        if (!item) return Promise.resolve();
        let newPrice: number;
        if (bulkPriceMode === 'fixed')    newPrice = bulkPriceValue;
        else if (bulkPriceMode === 'pct_up')  newPrice = item.price * (1 + bulkPriceValue / 100);
        else if (bulkPriceMode === 'pct_down') newPrice = item.price * (1 - bulkPriceValue / 100);
        else if (bulkPriceMode === 'val_up')   newPrice = item.price + bulkPriceValue;
        else                                   newPrice = item.price - bulkPriceValue;
        return updateMenuItem(id, { price: Math.max(0.01, Math.round(newPrice * 100) / 100) });
      }));
      clearSelection();
      setBulkPriceModal(false);
      setBulkPriceValue(0);
      await load();
    } catch (e: any) { alert(e.response?.data?.message || 'Erro ao alterar preços'); }
    finally { setBulkLoading(false); }
  }

  // ─── Filter ─────────────────────────────────────────────

  const filtered = categories.filter(c => {
    if (!search) return true;
    const s = search.toLowerCase();
    return c.name.toLowerCase().includes(s) || c.items.some(i => i.name.toLowerCase().includes(s));
  });

  const totalItems = categories.reduce((acc, c) => acc + c.items.length, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-th flex items-center gap-2">
            <UtensilsCrossed size={24} className="text-primary-500" /> Cardápio
          </h1>
          <p className="text-sm text-th-muted mt-1">{categories.length} categorias · {totalItems} itens</p>
        </div>
        <div className="flex gap-2">
          <a
            href="https://marinaprizeclub.com/cardapio"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 bg-th-card border border-th hover:border-primary-500/50 hover:text-primary-500 text-th px-4 py-2 rounded-xl text-sm font-semibold transition"
            title="Abrir cardápio público em nova aba"
          >
            <ExternalLink size={16} /> Ver cardápio público
          </a>
          <button onClick={openCreateCat} className="flex items-center gap-2 bg-primary-500 hover:bg-primary-400 text-white px-4 py-2 rounded-xl text-sm font-semibold transition">
            <FolderPlus size={16} /> Nova Categoria
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-th-muted" />
        <input
          type="text" placeholder="Buscar categorias ou itens..."
          value={search} onChange={e => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 bg-th-card border border-th rounded-xl text-sm text-th placeholder:text-th-muted focus:outline-none focus:ring-2 focus:ring-primary-500/30"
        />
      </div>

      {/* Categories list */}
      {loading ? (
        <div className="text-center py-20 text-th-muted">Carregando...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-th-muted">Nenhuma categoria encontrada</div>
      ) : (
        <div className="space-y-3">
          {filtered.map(cat => {
            const isExpanded = expandedCat === cat.id;
            const filteredItems = search
              ? cat.items.filter(i => i.name.toLowerCase().includes(search.toLowerCase()) || cat.name.toLowerCase().includes(search.toLowerCase()))
              : cat.items;

            return (
              <div key={cat.id} className="bg-th-card border border-th rounded-2xl overflow-hidden">
                {/* Category header */}
                <div
                  className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-primary-500/5 transition"
                  onClick={() => setExpandedCat(isExpanded ? null : cat.id)}
                >
                  <div className="flex items-center gap-3">
                    <button
                      onClick={e => { e.stopPropagation(); toggleCatSelection(cat); }}
                      className="p-0.5 text-th-muted hover:text-primary-500 transition shrink-0"
                      title="Selecionar todos desta categoria"
                    >
                      {isCatAllSelected(cat)
                        ? <CheckSquare size={18} className="text-primary-500" />
                        : isCatSomeSelected(cat)
                        ? <Minus size={18} className="text-primary-500" />
                        : <Square size={18} />}
                    </button>
                    {isExpanded ? <ChevronUp size={18} className="text-th-muted" /> : <ChevronDown size={18} className="text-th-muted" />}
                    <div>
                      <h3 className="font-bold text-th">{cat.name}</h3>
                      <p className="text-xs text-th-muted">{cat.items.length} itens · {cat.isActive ? 'Ativo' : 'Inativo'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                    <button onClick={() => toggleCatActive(cat)} className={`p-2 rounded-lg transition ${cat.isActive ? 'text-green-500 hover:bg-green-500/10' : 'text-th-muted hover:bg-th-card'}`} title={cat.isActive ? 'Desativar' : 'Ativar'}>
                      {cat.isActive ? <Eye size={16} /> : <EyeOff size={16} />}
                    </button>
                    <button onClick={() => openEditCat(cat)} className="p-2 rounded-lg text-th-muted hover:text-primary-500 hover:bg-primary-500/10 transition">
                      <Edit size={16} />
                    </button>
                    <button onClick={() => setDeleteTarget({ type: 'category', id: cat.id, name: cat.name })} className="p-2 rounded-lg text-th-muted hover:text-red-500 hover:bg-red-500/10 transition">
                      <Trash2 size={16} />
                    </button>
                    <button onClick={() => openCreateItem(cat.id)} className="p-2 rounded-lg text-th-muted hover:text-primary-500 hover:bg-primary-500/10 transition" title="Novo item">
                      <Plus size={16} />
                    </button>
                  </div>
                </div>

                {/* Items table */}
                {isExpanded && (
                  <div className="border-t border-th">
                    {filteredItems.length === 0 ? (
                      <div className="px-5 py-8 text-center text-th-muted text-sm">Nenhum item nesta categoria</div>
                    ) : (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-th-muted text-xs uppercase tracking-wider border-b border-th">
                            <th className="px-4 py-3 w-8"></th>
                            <th className="text-left px-5 py-3 w-12">Foto</th>
                            <th className="text-left px-3 py-3">Item</th>
                            <th className="text-right px-3 py-3">Preço</th>
                            <th className="text-right px-3 py-3">Custo</th>
                            <th className="text-right px-3 py-3">Margem</th>
                            <th className="text-center px-3 py-3">Status</th>
                            <th className="text-right px-5 py-3">Ações</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredItems.map(item => {
                            const margin = item.costPrice ? (((item.price - item.costPrice) / item.price) * 100).toFixed(0) : '—';
                            return (
                              <tr key={item.id} className={`border-b border-th/50 hover:bg-primary-500/5 transition ${selectedItems.has(item.id) ? 'bg-primary-500/5' : ''}`}>
                                <td className="px-4 py-2 w-8">
                                  <button onClick={() => toggleItemSelection(item.id)} className="text-th-muted hover:text-primary-500 transition">
                                    {selectedItems.has(item.id)
                                      ? <CheckSquare size={16} className="text-primary-500" />
                                      : <Square size={16} />}
                                  </button>
                                </td>
                                <td className="px-5 py-2 w-12">
                                  {item.image ? (
                                    <img src={item.image} alt={item.name} className="w-10 h-10 rounded-lg object-cover" />
                                  ) : (
                                    <div className="w-10 h-10 rounded-lg bg-th flex items-center justify-center">
                                      <ImageIcon size={16} className="text-th-muted" />
                                    </div>
                                  )}
                                </td>
                                <td className="px-3 py-3">
                                  <div className="font-medium text-th">{item.name}</div>
                                  {item.description && <div className="text-xs text-th-muted mt-0.5 line-clamp-1">{item.description}</div>}
                                </td>
                                <td className="text-right px-3 py-3 text-th font-semibold">R$ {item.price.toFixed(2).replace('.', ',')}</td>
                                <td className="text-right px-3 py-3 text-th-muted">{item.costPrice ? `R$ ${item.costPrice.toFixed(2).replace('.', ',')}` : '—'}</td>
                                <td className="text-right px-3 py-3">
                                  {margin !== '—' ? (
                                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${Number(margin) >= 50 ? 'bg-green-500/15 text-green-500' : Number(margin) >= 30 ? 'bg-yellow-500/15 text-yellow-500' : 'bg-red-500/15 text-red-500'}`}>{margin}%</span>
                                  ) : <span className="text-th-muted">—</span>}
                                </td>
                                <td className="text-center px-3 py-3">
                                  <button onClick={() => toggleItemAvailable(item)} className={`text-xs font-semibold px-2.5 py-1 rounded-full transition ${item.isAvailable ? 'bg-green-500/15 text-green-500' : 'bg-red-500/15 text-red-500'}`}>
                                    {item.isAvailable ? 'Ativo' : 'Inativo'}
                                  </button>
                                </td>
                                <td className="text-right px-5 py-3">
                                  <div className="flex justify-end gap-1">
                                    <button onClick={() => openEditItem(item)} className="p-1.5 rounded-lg text-th-muted hover:text-primary-500 hover:bg-primary-500/10 transition"><Edit size={14} /></button>
                                    <button onClick={() => setDeleteTarget({ type: 'item', id: item.id, name: item.name })} className="p-1.5 rounded-lg text-th-muted hover:text-red-500 hover:bg-red-500/10 transition"><Trash2 size={14} /></button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Bulk action bar */}
      {selectedItems.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-2rem)] max-w-3xl">
          <div className="bg-[#1a1d23] border border-white/10 rounded-2xl shadow-2xl px-4 py-3 flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-sm font-bold text-white">{selectedItems.size} selecionado{selectedItems.size > 1 ? 's' : ''}</span>
              <button onClick={clearSelection} className="p-1 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition">
                <X size={14} />
              </button>
            </div>
            <div className="h-5 w-px bg-white/10 shrink-0 hidden sm:block" />
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                onClick={() => executeBulkAction('activate')}
                disabled={bulkLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-green-500/15 hover:bg-green-500/25 text-green-400 text-xs font-semibold transition disabled:opacity-50"
              >
                <Eye size={13} /> Ativar
              </button>
              <button
                onClick={() => executeBulkAction('pause')}
                disabled={bulkLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-yellow-500/15 hover:bg-yellow-500/25 text-yellow-400 text-xs font-semibold transition disabled:opacity-50"
              >
                <EyeOff size={13} /> Pausar
              </button>
              <button
                onClick={() => executeBulkAction('convenience_on')}
                disabled={bulkLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-orange-500/15 hover:bg-orange-500/25 text-orange-400 text-xs font-semibold transition disabled:opacity-50"
              >
                <ShoppingBag size={13} /> App Cotista
              </button>
              <button
                onClick={() => executeBulkAction('convenience_off')}
                disabled={bulkLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-white/60 text-xs font-semibold transition disabled:opacity-50"
              >
                <ShoppingBag size={13} /> Remover App
              </button>
              <button
                onClick={() => { setBulkPriceValue(0); setBulkPriceMode('pct_up'); setBulkPriceModal(true); }}
                disabled={bulkLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary-500/20 hover:bg-primary-500/30 text-primary-400 text-xs font-semibold transition disabled:opacity-50"
              >
                <Tag size={13} /> Preço
              </button>
              {!bulkDeleteConfirm ? (
                <button
                  onClick={() => setBulkDeleteConfirm(true)}
                  disabled={bulkLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-500/15 hover:bg-red-500/25 text-red-400 text-xs font-semibold transition disabled:opacity-50"
                >
                  <Trash2 size={13} /> Excluir
                </button>
              ) : (
                <div className="flex items-center gap-1">
                  <span className="text-xs text-red-400 font-semibold">Excluir {selectedItems.size} itens?</span>
                  <button
                    onClick={() => executeBulkAction('delete')}
                    disabled={bulkLoading}
                    className="px-3 py-1.5 rounded-xl bg-red-500 hover:bg-red-400 text-white text-xs font-bold transition disabled:opacity-50"
                  >
                    Sim
                  </button>
                  <button
                    onClick={() => setBulkDeleteConfirm(false)}
                    className="px-3 py-1.5 rounded-xl bg-white/10 text-white/60 text-xs font-semibold transition"
                  >
                    Não
                  </button>
                </div>
              )}
              {bulkLoading && <Loader2 size={16} className="animate-spin text-white/50" />}
            </div>
          </div>
        </div>
      )}

      {/* Category Modal */}
      {showCatModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-th-card border border-th rounded-2xl p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-5">
              <h2 className="text-lg font-bold text-th">{editingCat ? 'Editar Categoria' : 'Nova Categoria'}</h2>
              <button onClick={() => setShowCatModal(false)} className="p-1 hover:bg-th-card rounded-lg"><X size={20} className="text-th-muted" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-th-muted mb-1.5">Nome</label>
                <input value={catForm.name} onChange={e => setCatForm({ ...catForm, name: e.target.value, slug: slugify(e.target.value) })} className="w-full bg-th border border-th rounded-xl px-4 py-2.5 text-sm text-th focus:outline-none focus:ring-2 focus:ring-primary-500/30" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-th-muted mb-1.5">Slug</label>
                <input value={catForm.slug} onChange={e => setCatForm({ ...catForm, slug: e.target.value })} className="w-full bg-th border border-th rounded-xl px-4 py-2.5 text-sm text-th focus:outline-none focus:ring-2 focus:ring-primary-500/30" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setShowCatModal(false)} className="px-4 py-2 text-sm text-th-muted hover:text-th transition">Cancelar</button>
              <button onClick={saveCat} disabled={savingCat || !catForm.name} className="flex items-center gap-2 bg-primary-500 hover:bg-primary-400 disabled:opacity-50 text-white px-5 py-2 rounded-xl text-sm font-semibold transition">
                <Save size={14} /> {savingCat ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Item Modal */}
      {showItemModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-th-card border border-th rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-5">
              <h2 className="text-lg font-bold text-th">{editingItem ? 'Editar Item' : 'Novo Item'}</h2>
              <button onClick={() => setShowItemModal(false)} className="p-1 hover:bg-th-card rounded-lg"><X size={20} className="text-th-muted" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-th-muted mb-1.5">Nome</label>
                <input value={itemForm.name} onChange={e => setItemForm({ ...itemForm, name: e.target.value })} className="w-full bg-th border border-th rounded-xl px-4 py-2.5 text-sm text-th focus:outline-none focus:ring-2 focus:ring-primary-500/30" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-th-muted mb-1.5">Descrição</label>
                <textarea value={itemForm.description} onChange={e => setItemForm({ ...itemForm, description: e.target.value })} rows={2} className="w-full bg-th border border-th rounded-xl px-4 py-2.5 text-sm text-th focus:outline-none focus:ring-2 focus:ring-primary-500/30 resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-th-muted mb-1.5">Preço (R$)</label>
                  <input type="number" step="0.01" value={itemForm.price} onChange={e => setItemForm({ ...itemForm, price: parseFloat(e.target.value) || 0 })} className="w-full bg-th border border-th rounded-xl px-4 py-2.5 text-sm text-th focus:outline-none focus:ring-2 focus:ring-primary-500/30" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-th-muted mb-1.5 flex items-center gap-1"><DollarSign size={12} /> Custo (R$)</label>
                  <input type="number" step="0.01" value={itemForm.costPrice} onChange={e => setItemForm({ ...itemForm, costPrice: parseFloat(e.target.value) || 0 })} className="w-full bg-th border border-th rounded-xl px-4 py-2.5 text-sm text-th focus:outline-none focus:ring-2 focus:ring-primary-500/30" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-th-muted mb-1.5">Imagem</label>
                <div className="flex gap-1 mb-2">
                  <button type="button" onClick={() => setImageMode('upload')} className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition ${imageMode === 'upload' ? 'bg-primary-500 text-white' : 'bg-th text-th-muted hover:text-th'}`}>
                    <Upload size={12} /> Upload
                  </button>
                  <button type="button" onClick={() => setImageMode('url')} className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition ${imageMode === 'url' ? 'bg-primary-500 text-white' : 'bg-th text-th-muted hover:text-th'}`}>
                    <ImageIcon size={12} /> URL
                  </button>
                </div>
                {imageMode === 'url' ? (
                  <input value={itemForm.image} onChange={e => setItemForm({ ...itemForm, image: e.target.value })} placeholder="https://..." className="w-full bg-th border border-th rounded-xl px-4 py-2.5 text-sm text-th focus:outline-none focus:ring-2 focus:ring-primary-500/30" />
                ) : (
                  <label className={`flex flex-col items-center justify-center w-full h-28 border-2 border-dashed rounded-xl cursor-pointer transition ${uploading ? 'border-primary-500 bg-primary-500/5' : 'border-th hover:border-primary-500/50 hover:bg-primary-500/5'}`}>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/gif,image/webp"
                      className="hidden"
                      disabled={uploading}
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setUploading(true);
                        try {
                          const { data } = await uploadMenuImage(file);
                          setItemForm(f => ({ ...f, image: data.url }));
                        } catch {
                          alert('Erro ao fazer upload da imagem');
                        } finally {
                          setUploading(false);
                          e.target.value = '';
                        }
                      }}
                    />
                    {uploading ? (
                      <span className="text-xs text-primary-500 font-semibold">Enviando...</span>
                    ) : (
                      <>
                        <Upload size={20} className="text-th-muted mb-1" />
                        <span className="text-xs text-th-muted">Clique para selecionar</span>
                        <span className="text-[10px] text-th-muted mt-0.5">JPG, PNG, GIF, WebP (máx 5MB)</span>
                      </>
                    )}
                  </label>
                )}
                {itemForm.image && (
                  <div className="mt-2 flex items-center gap-2">
                    <img src={itemForm.image} alt="Preview" className="w-24 h-24 rounded-xl object-cover border border-th" />
                    <button type="button" onClick={() => setItemForm({ ...itemForm, image: '' })} className="p-1.5 rounded-lg text-th-muted hover:text-red-500 hover:bg-red-500/10 transition" title="Remover imagem">
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-3">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" checked={itemForm.isAvailable} onChange={e => setItemForm({ ...itemForm, isAvailable: e.target.checked })} className="sr-only peer" />
                  <div className="w-9 h-5 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary-500"></div>
                </label>
                <span className="text-sm text-th">Disponível no cardápio</span>
              </div>
              <div className="flex items-center gap-3">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" checked={itemForm.isConvenience} onChange={e => setItemForm({ ...itemForm, isConvenience: e.target.checked })} className="sr-only peer" />
                  <div className="w-9 h-5 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-orange-500"></div>
                </label>
                <span className="text-sm text-th">Exibir na Conveniência (APP COTISTA)</span>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setShowItemModal(false)} className="px-4 py-2 text-sm text-th-muted hover:text-th transition">Cancelar</button>
              <button onClick={saveItem} disabled={savingItem || !itemForm.name || !itemForm.price} className="flex items-center gap-2 bg-primary-500 hover:bg-primary-400 disabled:opacity-50 text-white px-5 py-2 rounded-xl text-sm font-semibold transition">
                <Save size={14} /> {savingItem ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-th-card border border-th rounded-2xl p-6 w-full max-w-sm text-center">
            <Trash2 size={40} className="text-red-500 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-th mb-2">Excluir {deleteTarget.type === 'category' ? 'Categoria' : 'Item'}?</h3>
            <p className="text-sm text-th-muted mb-6">
              <strong>{deleteTarget.name}</strong> será removido permanentemente.
              {deleteTarget.type === 'category' && ' Todos os itens desta categoria também serão excluídos.'}
            </p>
            <div className="flex justify-center gap-3">
              <button onClick={() => setDeleteTarget(null)} className="px-5 py-2 text-sm text-th-muted hover:text-th transition rounded-xl border border-th">Cancelar</button>
              <button onClick={confirmDelete} className="px-5 py-2 text-sm bg-red-500 hover:bg-red-400 text-white font-semibold rounded-xl transition">Excluir</button>
            </div>
          </div>
        </div>
      )}
      {/* Bulk price modal */}
      {bulkPriceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-th-card border border-th rounded-2xl p-6 w-full max-w-sm">
            <div className="flex justify-between items-center mb-5">
              <h2 className="text-lg font-bold text-th flex items-center gap-2">
                <Tag size={18} className="text-primary-500" /> Alterar Preço em Massa
              </h2>
              <button onClick={() => setBulkPriceModal(false)} className="p-1 hover:bg-th rounded-lg"><X size={20} className="text-th-muted" /></button>
            </div>
            <p className="text-sm text-th-muted mb-4">{selectedItems.size} item{selectedItems.size > 1 ? 's' : ''} selecionado{selectedItems.size > 1 ? 's' : ''}</p>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {([
                { key: 'pct_up',  label: '% Aumento',   icon: TrendingUp,   color: 'text-green-500' },
                { key: 'pct_down',label: '% Desconto',   icon: TrendingDown, color: 'text-red-500' },
                { key: 'val_up',  label: '+ R$ Fixo',    icon: TrendingUp,   color: 'text-blue-400' },
                { key: 'val_down',label: '- R$ Fixo',    icon: TrendingDown, color: 'text-orange-400' },
                { key: 'fixed',   label: 'Preço fixo',   icon: Tag,          color: 'text-primary-500' },
              ] as const).map(({ key, label, icon: Icon, color }) => (
                <button
                  key={key}
                  onClick={() => setBulkPriceMode(key)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-semibold transition ${bulkPriceMode === key ? 'border-primary-500 bg-primary-500/10 text-th' : 'border-th bg-th text-th-muted hover:border-primary-500/50'}`}
                >
                  <Icon size={14} className={bulkPriceMode === key ? color : ''} />
                  {label}
                </button>
              ))}
            </div>
            <div className="mb-5">
              <label className="block text-xs font-semibold text-th-muted mb-1.5">
                {bulkPriceMode === 'fixed' ? 'Novo preço (R$)' : bulkPriceMode.startsWith('pct') ? 'Porcentagem (%)' : 'Valor (R$)'}
              </label>
              <input
                type="number"
                min="0"
                step={bulkPriceMode.startsWith('pct') ? '1' : '0.01'}
                value={bulkPriceValue || ''}
                onChange={e => setBulkPriceValue(parseFloat(e.target.value) || 0)}
                placeholder={bulkPriceMode.startsWith('pct') ? 'Ex: 10' : 'Ex: 5.00'}
                className="w-full bg-th border border-th rounded-xl px-4 py-2.5 text-sm text-th focus:outline-none focus:ring-2 focus:ring-primary-500/30"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setBulkPriceModal(false)} className="px-4 py-2 text-sm text-th-muted hover:text-th transition">Cancelar</button>
              <button
                onClick={executeBulkPrice}
                disabled={bulkLoading || !bulkPriceValue}
                className="flex items-center gap-2 bg-primary-500 hover:bg-primary-400 disabled:opacity-50 text-white px-5 py-2 rounded-xl text-sm font-semibold transition"
              >
                {bulkLoading ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Aplicar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
