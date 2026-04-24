'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  ClipboardList, Plus, Search, X, Save, Trash2, ChevronRight,
  Ban, Clock, Volume2, VolumeX, Eye, Columns, List,
} from 'lucide-react';
import {
  getOrders, getOrderStats, createOrder, advanceOrder, cancelOrder, deleteOrder,
  getMenuCategories,
} from '@/services/api';

// ─── Types ─────────────────────────────────────────────────
interface OrderItem {
  id: string;
  menuItemId?: string;
  name: string;
  quantity: number;
  unitPrice: number;
  notes?: string;
}

interface Order {
  id: string;
  number: number;
  status: string;
  type: string;
  tableNumber?: string;
  customerName?: string;
  notes?: string;
  total: number;
  paymentMethod?: string;
  items: OrderItem[];
  createdAt: string;
  updatedAt: string;
  waiter?: { id: string; name: string } | null;
  restaurantTable?: { id: string; number: number; name?: string } | null;
  cashRegisterId?: string | null;
  waiterId?: string | null;
}

interface MenuItem {
  id: string;
  name: string;
  price: number;
  image?: string;
  categoryId: string;
}

interface MenuCategory {
  id: string;
  name: string;
  items: MenuItem[];
}

// ─── Constants ─────────────────────────────────────────────
const COLUMNS = [
  { key: 'ANALYSIS',    label: 'Em Análise',             icon: '📋', color: 'border-yellow-400', badge: 'bg-yellow-400/15 text-yellow-500' },
  { key: 'PREPARING',   label: 'Em Preparo',             icon: '👨‍🍳', color: 'border-cyan-400',   badge: 'bg-cyan-400/15 text-cyan-500' },
  { key: 'READY',       label: 'Pronto',                 icon: '✅', color: 'border-green-400',  badge: 'bg-green-400/15 text-green-500' },
  { key: 'SERVED',      label: 'Na Mesa',                icon: '🍽️', color: 'border-orange-400', badge: 'bg-orange-400/15 text-orange-500' },
  { key: 'DELIVERING',  label: 'Aguardando Fechamento',  icon: '💰', color: 'border-amber-400',  badge: 'bg-amber-400/15 text-amber-500' },
  { key: 'DONE',        label: 'Finalizados',            icon: '🎉', color: 'border-purple-400', badge: 'bg-purple-400/15 text-purple-500' },
];

const STATUS_NEXT: Record<string, string> = {
  ANALYSIS: 'Iniciar Preparo',
  PREPARING: 'Marcar Pronto',
  READY: 'Na Mesa',
  SERVED: 'Finalizar',
  DELIVERING: 'Finalizar',
};

const TYPE_LABELS: Record<string, string> = {
  TABLE: 'Mesa',
  TAKEAWAY: 'Retirada',
  DELIVERY: 'Retirada',
};

const ORIGIN_CFG: Record<string, { label: string; emoji: string; class: string }> = {
  GARCOM: { label: 'Garçom', emoji: '👤', class: 'bg-violet-500/15 text-violet-500' },
  PDV: { label: 'PDV', emoji: '🖥️', class: 'bg-sky-500/15 text-sky-500' },
  AUTO: { label: 'Auto-atend.', emoji: '📱', class: 'bg-teal-500/15 text-teal-500' },
  APP_COTISTA: { label: 'APP COTISTA', emoji: '🛒', class: 'bg-orange-500/15 text-orange-500' },
  MANUAL: { label: 'Manual', emoji: '📝', class: 'bg-gray-400/15 text-gray-400' },
};

function getOrigin(order: Order) {
  if (order.tableNumber === 'APP COTISTA') return ORIGIN_CFG.APP_COTISTA;
  if (order.waiterId || order.waiter) return ORIGIN_CFG.GARCOM;
  if (order.cashRegisterId) return ORIGIN_CFG.PDV;
  if (order.restaurantTable) return ORIGIN_CFG.AUTO;
  return ORIGIN_CFG.MANUAL;
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `${mins}min`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h${mins % 60}min`;
}

// ─── Main Page ─────────────────────────────────────────────
export default function PedidosPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [stats, setStats] = useState<{ byStatus: Record<string, number>; todayRevenue: number }>({ byStatus: {}, todayRevenue: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');
  const [muted, setMuted] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [viewingOrder, setViewingOrder] = useState<Order | null>(null);
  const [showCancelled, setShowCancelled] = useState(false);
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const prevCountRef = useRef(0);

  const fetchOrders = useCallback(async () => {
    try {
      const [ordersRes, statsRes] = await Promise.all([getOrders(), getOrderStats()]);
      const data = Array.isArray(ordersRes.data) ? ordersRes.data : [];
      setOrders(data);
      setStats(statsRes.data);

      // Sound notification for new orders
      const activeCount = data.filter((o: Order) => o.status === 'ANALYSIS').length;
      if (!muted && activeCount > prevCountRef.current && prevCountRef.current > 0) {
        try { new Audio('/notification.mp3').play().catch(() => {}); } catch {}
      }
      prevCountRef.current = activeCount;
    } catch { /* silently fail on poll */ }
    finally { setLoading(false); }
  }, [muted]);

  useEffect(() => {
    fetchOrders();
    pollRef.current = setInterval(fetchOrders, 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchOrders]);

  const handleAdvance = async (id: string) => {
    try {
      await advanceOrder(id);
      await fetchOrders();
    } catch (e: any) { alert(e.response?.data?.message || 'Erro ao avançar pedido'); }
  };

  const handleCancel = async (id: string) => {
    if (!confirm('Cancelar este pedido?')) return;
    try {
      await cancelOrder(id);
      await fetchOrders();
    } catch (e: any) { alert(e.response?.data?.message || 'Erro ao cancelar'); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir este pedido permanentemente?')) return;
    try {
      await deleteOrder(id);
      await fetchOrders();
    } catch (e: any) { alert(e.response?.data?.message || 'Erro ao excluir'); }
  };

  const filtered = orders.filter(o => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      o.number.toString().includes(s) ||
      o.customerName?.toLowerCase().includes(s) ||
      o.tableNumber?.toLowerCase().includes(s) ||
      o.items.some(i => i.name.toLowerCase().includes(s))
    );
  });

  const cancelledOrders = filtered.filter(o => o.status === 'CANCELLED');
  const activeOrders = filtered.filter(o => o.status !== 'CANCELLED');
  const newCount = orders.filter(o => o.status === 'ANALYSIS').length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold text-th flex items-center gap-2">
            <ClipboardList size={24} className="text-primary-500" /> Gestão de Pedidos
          </h1>
          <p className="text-sm text-th-muted mt-0.5">Gerencie seus pedidos em tempo real</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setShowCreateModal(true)} className="flex items-center gap-2 bg-primary-500 hover:bg-primary-400 text-white px-4 py-2 rounded-xl text-sm font-semibold transition">
            <Plus size={16} /> Criar Pedido
          </button>
          <button onClick={() => setMuted(!muted)} className={`p-2 rounded-xl transition ${muted ? 'bg-red-500/10 text-red-500' : 'bg-th-card text-th-muted hover:text-th border border-th'}`} title={muted ? 'Ativar som' : 'Silenciar'}>
            {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
          {newCount > 0 && (
            <span className="bg-red-500 text-white text-xs font-bold px-2.5 py-1 rounded-full animate-pulse">
              Novos {newCount}
            </span>
          )}
          <div className="flex border border-th rounded-xl overflow-hidden">
            <button onClick={() => setViewMode('kanban')} className={`p-2 transition ${viewMode === 'kanban' ? 'bg-primary-500/15 text-primary-500' : 'text-th-muted hover:text-th'}`}>
              <Columns size={16} />
            </button>
            <button onClick={() => setViewMode('list')} className={`p-2 transition ${viewMode === 'list' ? 'bg-primary-500/15 text-primary-500' : 'text-th-muted hover:text-th'}`}>
              <List size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-th-muted" />
        <input
          type="text" placeholder="Buscar pedido..."
          value={search} onChange={e => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 bg-th-card border border-th rounded-xl text-sm text-th placeholder:text-th-muted focus:outline-none focus:ring-2 focus:ring-primary-500/30"
        />
      </div>

      {/* Cancelled banner */}
      {cancelledOrders.length > 0 && (
        <button onClick={() => setShowCancelled(!showCancelled)} className="flex items-center gap-2 text-sm text-red-500 bg-red-500/5 border border-red-500/20 px-4 py-2 rounded-xl w-full hover:bg-red-500/10 transition">
          <Ban size={14} /> Pedidos Cancelados
          <span className="bg-red-500/15 text-red-500 text-xs font-bold px-2 py-0.5 rounded-full">{cancelledOrders.length}</span>
          <span className="ml-auto text-xs text-th-muted">{showCancelled ? '▲ Ocultar' : '▼ Mostrar'}</span>
        </button>
      )}

      {showCancelled && cancelledOrders.length > 0 && (
        <div className="space-y-2 bg-red-500/5 p-3 rounded-xl border border-red-500/10">
          {cancelledOrders.map(o => (
            <div key={o.id} className="flex items-center justify-between bg-th-card border border-th rounded-xl px-4 py-2.5 opacity-60">
              <div>
                <span className="font-bold text-sm text-th">#{o.number}</span>
                <span className="text-xs text-th-muted ml-2">{o.customerName || TYPE_LABELS[o.type]}</span>
                <span className="text-xs text-red-500 ml-2">Cancelado</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-th-muted">{timeAgo(o.createdAt)}</span>
                <button onClick={() => handleDelete(o.id)} className="p-1 text-th-muted hover:text-red-500 transition"><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="text-center py-20 text-th-muted">Carregando pedidos...</div>
      ) : viewMode === 'kanban' ? (
        <div className="grid grid-cols-6 gap-3 pb-4" style={{ minHeight: 'calc(100vh - 260px)' }}>
          {COLUMNS.map(col => {
            const colOrders = activeOrders.filter(o => o.status === col.key);
            const colTotal = colOrders.reduce((s, o) => s + o.total, 0);
            return (
              <div key={col.key} className={`min-w-0 bg-th-card/50 rounded-2xl border-t-[3px] ${col.color} flex flex-col`}>
                {/* Column header */}
                <div className="px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{col.icon}</span>
                    <h3 className="font-bold text-sm text-th">{col.label}</h3>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${col.badge}`}>{colOrders.length}</span>
                  </div>
                </div>
                <div className="px-4 pb-2">
                  <p className="text-[10px] text-th-muted font-medium">R$ {colTotal.toFixed(2).replace('.', ',')}</p>
                </div>

                {/* Cards */}
                <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-2 scrollbar-thin">
                  {colOrders.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 text-th-muted">
                      <ClipboardList size={28} strokeWidth={1} className="mb-2 opacity-30" />
                      <span className="text-xs">Nenhum pedido</span>
                    </div>
                  ) : colOrders.map(order => {
                    const origin = getOrigin(order);
                    return (
                    <div
                      key={order.id}
                      className="bg-th-card border border-th rounded-xl p-3 hover:border-primary-500/30 transition cursor-pointer"
                      onClick={() => setViewingOrder(order)}
                    >
                      {/* Mesa / Header */}
                      <div className="flex items-center justify-between mb-2">
                        {order.tableNumber && order.tableNumber !== 'APP COTISTA' ? (
                          <span className="text-base font-black text-th bg-primary-500/10 px-2.5 py-0.5 rounded-lg">
                            Mesa {order.tableNumber}
                          </span>
                        ) : (
                          <span className="text-xs font-semibold text-th-muted">{order.customerName || TYPE_LABELS[order.type] || 'Pedido'}</span>
                        )}
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md flex items-center gap-0.5 ${origin.class}`}>
                          {origin.emoji} {origin.label}
                        </span>
                      </div>

                      {/* Customer if table */}
                      {order.tableNumber && order.tableNumber !== 'APP COTISTA' && order.customerName && (
                        <p className="text-xs text-th-muted mb-1 truncate">{order.customerName}</p>
                      )}

                      {/* Notes for APP COTISTA */}
                      {order.tableNumber === 'APP COTISTA' && order.notes && (
                        <p className="text-xs text-orange-400 mb-1 truncate">💬 {order.notes}</p>
                      )}

                      {/* Waiter name */}
                      {order.waiter && (
                        <p className="text-[10px] text-violet-400 mb-1">👤 {order.waiter.name}</p>
                      )}

                      {/* Items */}
                      <div className="space-y-0.5 mb-2">
                        {order.items.slice(0, 3).map(item => (
                          <p key={item.id} className="text-xs text-th truncate">
                            <span className="text-th-muted">{item.quantity}x</span> {item.name}
                          </p>
                        ))}
                        {order.items.length > 3 && (
                          <p className="text-[10px] text-th-muted">+{order.items.length - 3} itens</p>
                        )}
                      </div>

                      {/* Footer: time + total */}
                      <div className="flex items-center justify-between text-xs mb-2">
                        <span className="text-th-muted flex items-center gap-1"><Clock size={10} /> {timeAgo(order.createdAt)}</span>
                        <span className="font-bold text-primary-500">R$ {order.total.toFixed(2).replace('.', ',')}</span>
                      </div>

                      {/* Advance button - large */}
                      <div onClick={e => e.stopPropagation()}>
                        {STATUS_NEXT[order.status] && (
                          <button
                            onClick={() => handleAdvance(order.id)}
                            className="w-full flex items-center justify-center gap-1.5 bg-primary-500 hover:bg-primary-400 text-white text-xs font-bold py-2.5 rounded-xl transition"
                          >
                            <ChevronRight size={14} /> {STATUS_NEXT[order.status]}
                          </button>
                        )}
                      </div>
                    </div>
                  );})}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* List view */
        <div className="bg-th-card border border-th rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-th-muted text-xs uppercase tracking-wider border-b border-th">
                <th className="text-left px-5 py-3">Mesa</th>
                <th className="text-left px-3 py-3">Origem</th>
                <th className="text-left px-3 py-3">Itens</th>
                <th className="text-left px-3 py-3">Status</th>
                <th className="text-right px-3 py-3">Total</th>
                <th className="text-right px-3 py-3">Tempo</th>
                <th className="text-right px-5 py-3">Ações</th>
              </tr>
            </thead>
            <tbody>
              {activeOrders.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-th-muted">Nenhum pedido</td></tr>
              ) : activeOrders.map(order => {
                const origin = getOrigin(order);
                return (
                <tr key={order.id} className="border-b border-th/50 hover:bg-primary-500/5 transition">
                  <td className="px-5 py-3">
                    {order.tableNumber ? (
                      <span className="font-black text-th">Mesa {order.tableNumber}</span>
                    ) : (
                      <span className="text-th-muted">{order.customerName || TYPE_LABELS[order.type] || '—'}</span>
                    )}
                  </td>
                  <td className="px-3 py-3"><span className={`text-xs font-semibold px-2 py-0.5 rounded-md ${origin.class}`}>{origin.emoji} {origin.label}</span></td>
                  <td className="px-3 py-3 text-th-muted">{order.items.map(i => `${i.quantity}x ${i.name}`).join(', ')}</td>
                  <td className="px-3 py-3">
                    {(() => {
                      const col = COLUMNS.find(c => c.key === order.status);
                      return col ? <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${col.badge}`}>{col.icon} {col.label}</span> : order.status;
                    })()}
                  </td>
                  <td className="text-right px-3 py-3 font-semibold text-th">R$ {order.total.toFixed(2).replace('.', ',')}</td>
                  <td className="text-right px-3 py-3 text-th-muted text-xs">{timeAgo(order.createdAt)}</td>
                  <td className="text-right px-5 py-3">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => setViewingOrder(order)} className="p-1.5 rounded-lg text-th-muted hover:text-primary-500 hover:bg-primary-500/10 transition"><Eye size={14} /></button>
                      {STATUS_NEXT[order.status] && (
                        <button onClick={() => handleAdvance(order.id)} className="p-1.5 rounded-lg text-primary-500 hover:bg-primary-500/10 transition" title={STATUS_NEXT[order.status]}><ChevronRight size={14} /></button>
                      )}
                      {order.status !== 'DONE' && (
                        <button onClick={() => handleCancel(order.id)} className="p-1.5 rounded-lg text-th-muted hover:text-red-500 hover:bg-red-500/10 transition"><Ban size={14} /></button>
                      )}
                    </div>
                  </td>
                </tr>
              );})}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Order Modal */}
      {showCreateModal && <CreateOrderModal onClose={() => setShowCreateModal(false)} onCreated={fetchOrders} />}

      {/* View Order Modal */}
      {viewingOrder && (() => {
        const viewOrigin = getOrigin(viewingOrder);
        return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setViewingOrder(null)}>
          <div className="bg-th-card border border-th rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-3">
                {viewingOrder.tableNumber ? (
                  <span className="text-lg font-black text-th bg-primary-500/10 px-3 py-1 rounded-lg">Mesa {viewingOrder.tableNumber}</span>
                ) : (
                  <h2 className="text-lg font-bold text-th">{viewingOrder.customerName || TYPE_LABELS[viewingOrder.type] || 'Pedido'}</h2>
                )}
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-md ${viewOrigin.class}`}>{viewOrigin.emoji} {viewOrigin.label}</span>
              </div>
              <button onClick={() => setViewingOrder(null)} className="p-1 hover:bg-th rounded-lg"><X size={20} className="text-th-muted" /></button>
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-th-muted">Status</span>
                <span className="font-semibold text-th">{COLUMNS.find(c => c.key === viewingOrder.status)?.label || viewingOrder.status}</span>
              </div>
              {viewingOrder.waiter && (
                <div className="flex justify-between">
                  <span className="text-th-muted">Garçom</span>
                  <span className="text-violet-400 font-semibold">👤 {viewingOrder.waiter.name}</span>
                </div>
              )}
              {viewingOrder.customerName && (
                <div className="flex justify-between">
                  <span className="text-th-muted">Cliente</span>
                  <span className="text-th">{viewingOrder.customerName}</span>
                </div>
              )}
              {viewingOrder.tableNumber && (
                <div className="flex justify-between">
                  <span className="text-th-muted">Mesa</span>
                  <span className="font-bold text-th">{viewingOrder.tableNumber}</span>
                </div>
              )}
              {viewingOrder.notes && (
                <div>
                  <span className="text-th-muted block mb-1">Observações</span>
                  <p className="text-th bg-th rounded-lg px-3 py-2 text-xs">{viewingOrder.notes}</p>
                </div>
              )}
              <div className="border-t border-th pt-3">
                <p className="text-xs font-semibold text-th-muted mb-2">ITENS</p>
                {viewingOrder.items.map(item => (
                  <div key={item.id} className="flex justify-between py-1">
                    <span className="text-th">{item.quantity}x {item.name}</span>
                    <span className="text-th font-medium">R$ {(item.unitPrice * item.quantity).toFixed(2).replace('.', ',')}</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between border-t border-th pt-3 font-bold text-th">
                <span>Total</span>
                <span className="text-primary-500">R$ {viewingOrder.total.toFixed(2).replace('.', ',')}</span>
              </div>
              <div className="flex gap-2 pt-2">
                {STATUS_NEXT[viewingOrder.status] && (
                  <button onClick={() => { handleAdvance(viewingOrder.id); setViewingOrder(null); }} className="flex-1 flex items-center justify-center gap-2 bg-primary-500 hover:bg-primary-400 text-white py-2.5 rounded-xl text-sm font-semibold transition">
                    <ChevronRight size={14} /> {STATUS_NEXT[viewingOrder.status]}
                  </button>
                )}
                {viewingOrder.status !== 'DONE' && viewingOrder.status !== 'CANCELLED' && (
                  <button onClick={() => { handleCancel(viewingOrder.id); setViewingOrder(null); }} className="px-4 py-2.5 text-sm text-red-500 hover:bg-red-500/10 border border-red-500/20 rounded-xl font-semibold transition">
                    Cancelar
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
        );
      })()}
    </div>
  );
}

// ─── Create Order Modal ────────────────────────────────────
function CreateOrderModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [type, setType] = useState('TABLE');
  const [tableNumber, setTableNumber] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<{ menuItemId?: string; name: string; quantity: number; unitPrice: number; notes?: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [menuSearch, setMenuSearch] = useState('');
  const [showMenu, setShowMenu] = useState(false);

  useEffect(() => {
    getMenuCategories(false).then(({ data }) => {
      const cats = Array.isArray(data) ? data : data.data || [];
      setCategories(cats);
    }).catch(() => {});
  }, []);

  const allMenuItems = categories.flatMap(c => c.items);
  const filteredMenu = menuSearch
    ? allMenuItems.filter(i => i.name.toLowerCase().includes(menuSearch.toLowerCase()))
    : allMenuItems;

  const addFromMenu = (mi: MenuItem) => {
    const existing = items.findIndex(i => i.menuItemId === mi.id);
    if (existing >= 0) {
      const updated = [...items];
      updated[existing].quantity++;
      setItems(updated);
    } else {
      setItems([...items, { menuItemId: mi.id, name: mi.name, quantity: 1, unitPrice: mi.price }]);
    }
    setMenuSearch('');
    setShowMenu(false);
  };

  const removeItem = (idx: number) => setItems(items.filter((_, i) => i !== idx));
  const updateQty = (idx: number, qty: number) => {
    if (qty < 1) return;
    const updated = [...items];
    updated[idx].quantity = qty;
    setItems(updated);
  };

  const total = items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);

  const handleSave = async () => {
    if (items.length === 0) return alert('Adicione pelo menos um item');
    setSaving(true);
    try {
      await createOrder({ type, tableNumber: tableNumber || undefined, customerName: customerName || undefined, notes: notes || undefined, items });
      onCreated();
      onClose();
    } catch (e: any) { alert(e.response?.data?.message || 'Erro ao criar pedido'); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-th-card border border-th rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-lg font-bold text-th">Criar Pedido</h2>
          <button onClick={onClose} className="p-1 hover:bg-th rounded-lg"><X size={20} className="text-th-muted" /></button>
        </div>

        <div className="space-y-4">
          {/* Type */}
          <div>
            <label className="block text-xs font-semibold text-th-muted mb-1.5">Tipo</label>
            <div className="flex gap-2">
              {(['TABLE', 'TAKEAWAY'] as const).map(t => (
                <button key={t} onClick={() => setType(t)} className={`flex-1 py-2 text-xs font-semibold rounded-xl transition ${type === t ? 'bg-primary-500 text-white' : 'bg-th text-th-muted hover:text-th border border-th'}`}>
                  {TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          </div>

          {/* Customer & Table */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-th-muted mb-1.5">Cliente</label>
              <input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Nome..." className="w-full bg-th border border-th rounded-xl px-3 py-2 text-sm text-th focus:outline-none focus:ring-2 focus:ring-primary-500/30" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-th-muted mb-1.5">Mesa</label>
              <input value={tableNumber} onChange={e => setTableNumber(e.target.value)} placeholder="Nº..." className="w-full bg-th border border-th rounded-xl px-3 py-2 text-sm text-th focus:outline-none focus:ring-2 focus:ring-primary-500/30" />
            </div>
          </div>

          {/* Add items from menu */}
          <div>
            <label className="block text-xs font-semibold text-th-muted mb-1.5">Adicionar Itens</label>
            <div className="relative">
              <input
                value={menuSearch}
                onChange={e => { setMenuSearch(e.target.value); setShowMenu(true); }}
                onFocus={() => setShowMenu(true)}
                placeholder="Buscar item do cardápio..."
                className="w-full bg-th border border-th rounded-xl px-3 py-2 text-sm text-th focus:outline-none focus:ring-2 focus:ring-primary-500/30"
              />
              {showMenu && filteredMenu.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-th-card border border-th rounded-xl max-h-48 overflow-y-auto z-10 shadow-lg">
                  {filteredMenu.slice(0, 20).map(mi => (
                    <button key={mi.id} onClick={() => addFromMenu(mi)} className="flex items-center justify-between w-full px-3 py-2 text-sm text-th hover:bg-primary-500/5 transition text-left">
                      <span className="truncate">{mi.name}</span>
                      <span className="text-xs text-primary-500 font-semibold ml-2 shrink-0">R$ {mi.price.toFixed(2).replace('.', ',')}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Items list */}
          {items.length > 0 && (
            <div className="space-y-2">
              {items.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2 bg-th rounded-xl px-3 py-2 border border-th">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-th font-medium truncate">{item.name}</p>
                    <p className="text-xs text-th-muted">R$ {item.unitPrice.toFixed(2).replace('.', ',')} un.</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => updateQty(idx, item.quantity - 1)} className="w-6 h-6 flex items-center justify-center rounded-md bg-th-card text-th-muted hover:text-th text-xs font-bold border border-th">−</button>
                    <span className="w-6 text-center text-sm font-semibold text-th">{item.quantity}</span>
                    <button onClick={() => updateQty(idx, item.quantity + 1)} className="w-6 h-6 flex items-center justify-center rounded-md bg-th-card text-th-muted hover:text-th text-xs font-bold border border-th">+</button>
                  </div>
                  <span className="text-sm font-semibold text-th w-20 text-right">R$ {(item.unitPrice * item.quantity).toFixed(2).replace('.', ',')}</span>
                  <button onClick={() => removeItem(idx)} className="p-1 text-th-muted hover:text-red-500 transition"><X size={14} /></button>
                </div>
              ))}
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-th-muted mb-1.5">Observações</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Alguma observação..." className="w-full bg-th border border-th rounded-xl px-3 py-2 text-sm text-th focus:outline-none focus:ring-2 focus:ring-primary-500/30 resize-none" />
          </div>

          {/* Total & Save */}
          <div className="flex items-center justify-between pt-3 border-t border-th">
            <div>
              <p className="text-xs text-th-muted">Total do pedido</p>
              <p className="text-xl font-black text-primary-500">R$ {total.toFixed(2).replace('.', ',')}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={onClose} className="px-4 py-2.5 text-sm text-th-muted hover:text-th transition rounded-xl border border-th">Cancelar</button>
              <button onClick={handleSave} disabled={saving || items.length === 0} className="flex items-center gap-2 bg-primary-500 hover:bg-primary-400 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition">
                <Save size={14} /> {saving ? 'Salvando...' : 'Criar Pedido'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
