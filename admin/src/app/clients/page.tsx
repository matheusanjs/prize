'use client';

import { useState, useEffect, useRef } from 'react';
import { Search, UserPlus, MoreHorizontal, Mail, Phone, Eye, Edit, Ban, Trash2, X, Save } from 'lucide-react';
import { getUsers, createUser, updateUser, deleteUser, resolveStaticUrl } from '@/services/api';

interface Client {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: string;
  isActive?: boolean;
  shares?: number;
  status?: string;
  lastLogin?: string;
  createdAt?: string;
  avatar?: string;
}

export default function ClientsPage() {
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [viewingClient, setViewingClient] = useState<Client | null>(null);
  const [editForm, setEditForm] = useState({ name: '', email: '', phone: '', role: '' });
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', email: '', password: '', phone: '', role: 'CLIENT' });
  const [creating, setCreating] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadClients();
  }, [roleFilter, search]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(null);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function loadClients() {
    try {
      setLoading(true);
      const params: Record<string, string> = {};
      if (roleFilter !== 'ALL') params.role = roleFilter;
      if (search) params.search = search;
      const { data } = await getUsers(params);
      setClients(Array.isArray(data) ? data : data.data || data.items || []);
    } catch {
      setClients([]);
    } finally {
      setLoading(false);
    }
  }

  function openEdit(client: Client) {
    setEditForm({ name: client.name, email: client.email, phone: client.phone || '', role: client.role });
    setEditingClient(client);
    setMenuOpen(null);
  }

  async function saveEdit() {
    if (!editingClient) return;
    try {
      await updateUser(editingClient.id, editForm);
      setEditingClient(null);
      loadClients();
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Erro ao salvar');
    }
  }

  async function toggleBlock(client: Client) {
    const newStatus = client.isActive === false ? true : false;
    if (!confirm(newStatus ? `Desbloquear ${client.name}?` : `Bloquear ${client.name}?`)) return;
    try {
      await updateUser(client.id, { isActive: newStatus });
      setMenuOpen(null);
      loadClients();
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Erro');
    }
  }

  async function handleDelete(client: Client) {
    if (!confirm(`Remover ${client.name}? Esta ação não pode ser desfeita.`)) return;
    try {
      await deleteUser(client.id);
      setMenuOpen(null);
      loadClients();
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Erro ao remover');
    }
  }

  async function handleCreate() {
    if (!createForm.name || !createForm.email || !createForm.password) return alert('Preencha nome, email e senha');
    setCreating(true);
    try {
      await createUser(createForm);
      setShowCreate(false);
      setCreateForm({ name: '', email: '', password: '', phone: '', role: 'CLIENT' });
      loadClients();
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Erro ao criar usuário');
    }
    setCreating(false);
  }

  const ROLE_LABELS: Record<string, string> = { CLIENT: 'Cliente', OPERATOR: 'Operador', ADMIN: 'Admin', WAITER: 'Garçom' };
  const ROLE_COLORS: Record<string, string> = {
    CLIENT: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
    OPERATOR: 'bg-purple-500/15 text-purple-600 dark:text-purple-400',
    ADMIN: 'bg-orange-500/15 text-orange-600 dark:text-orange-400',
    WAITER: 'bg-violet-500/15 text-violet-600 dark:text-violet-400',
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-th">Clientes</h1>
          <p className="text-th-muted text-sm">{clients.length} usuários cadastrados</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 bg-primary-500 text-white px-4 py-2 rounded-lg font-medium hover:bg-primary-600">
          <UserPlus size={18} />
          Novo Usuário
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-4 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-th-muted" />
          <input
            type="text"
            placeholder="Buscar por nome ou email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-th rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="border border-th rounded-lg px-3 py-2 text-sm outline-none"
        >
          <option value="ALL">Todos os perfis</option>
          <option value="CLIENT">Clientes</option>
          <option value="OPERATOR">Operadores</option>
          <option value="WAITER">Garçons</option>
          <option value="ADMIN">Admins</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-th-card rounded-2xl shadow-black/10 border border-th overflow-hidden">
        <table className="w-full">
          <thead className="bg-th-surface border-b border-th">
            <tr>
              <th className="text-left px-6 py-3 text-xs font-semibold text-th-muted uppercase">Nome</th>
              <th className="text-left px-6 py-3 text-xs font-semibold text-th-muted uppercase">Contato</th>
              <th className="text-left px-6 py-3 text-xs font-semibold text-th-muted uppercase">Perfil</th>
              <th className="text-left px-6 py-3 text-xs font-semibold text-th-muted uppercase">Cotas</th>
              <th className="text-left px-6 py-3 text-xs font-semibold text-th-muted uppercase">Status</th>
              <th className="text-left px-6 py-3 text-xs font-semibold text-th-muted uppercase">Último Acesso</th>
              <th className="px-6 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? <tr><td colSpan={7} className="text-center py-8 text-th-muted">Carregando...</td></tr> : clients.map((client) => (
              <tr key={client.id} className="hover:bg-th-hover transition-colors">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full overflow-hidden bg-primary-100 text-primary-500 flex items-center justify-center font-semibold text-sm shrink-0">
                      {client.avatar ? (
                        <img src={resolveStaticUrl(client.avatar) || ''} alt={client.name} className="w-full h-full object-cover" />
                      ) : (
                        client.name.charAt(0)
                      )}
                    </div>
                    <span className="font-medium text-th text-sm">{client.name}</span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="text-sm">
                    <div className="flex items-center gap-1 text-th-secondary"><Mail size={13} /> {client.email}</div>
                    <div className="flex items-center gap-1 text-th-muted mt-1"><Phone size={13} /> {client.phone}</div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded-full text-xs font-semibold ${ROLE_COLORS[client.role] || 'bg-gray-500/15 text-gray-500'}`}>
                    {ROLE_LABELS[client.role] || client.role}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-th-secondary">{client.shares ?? 0}</td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                    client.isActive === false ? 'bg-red-500/15 text-red-600 dark:text-red-400' : 'bg-green-500/15 text-green-600 dark:text-green-400'
                  }`}>
                    {client.isActive === false ? 'Bloqueado' : 'Ativo'}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-th-muted">
                  {client.lastLogin ? new Date(client.lastLogin).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : client.createdAt ? new Date(client.createdAt).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '-'}
                </td>
                <td className="px-6 py-4 relative">
                  <button onClick={() => setMenuOpen(menuOpen === client.id ? null : client.id)} className="text-th-muted hover:text-th-secondary">
                    <MoreHorizontal size={18} />
                  </button>
                  {menuOpen === client.id && (
                    <div ref={menuRef} className="absolute right-6 top-12 z-50 w-48 bg-th-card rounded-lg shadow-lg border border-th py-1">
                      <button onClick={() => { setViewingClient(client); setMenuOpen(null); }} className="w-full flex items-center gap-2 px-4 py-2 text-sm text-th-secondary hover:bg-th-hover">
                        <Eye size={15} /> Ver detalhes
                      </button>
                      <button onClick={() => openEdit(client)} className="w-full flex items-center gap-2 px-4 py-2 text-sm text-th-secondary hover:bg-th-hover">
                        <Edit size={15} /> Editar
                      </button>
                      <button onClick={() => toggleBlock(client)} className="w-full flex items-center gap-2 px-4 py-2 text-sm text-yellow-600 hover:bg-yellow-500/10">
                        <Ban size={15} /> {client.isActive === false ? 'Desbloquear' : 'Bloquear'}
                      </button>
                      <hr className="my-1 border-th" />
                      <button onClick={() => handleDelete(client)} className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-500/10">
                        <Trash2 size={15} /> Remover
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* View Modal */}
      {viewingClient && (
        <div className="fixed inset-0 bg-th-overlay flex items-center justify-center z-50" onClick={() => setViewingClient(null)}>
          <div className="bg-th-card rounded-2xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-th">Detalhes do Usuário</h2>
              <button onClick={() => setViewingClient(null)} className="text-th-muted hover:text-th-secondary"><X size={20} /></button>
            </div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full overflow-hidden bg-primary-100 text-primary-500 flex items-center justify-center font-bold text-lg shrink-0">
                {viewingClient.avatar ? (
                  <img src={resolveStaticUrl(viewingClient.avatar) || ''} alt={viewingClient.name} className="w-full h-full object-cover" />
                ) : (
                  viewingClient.name.charAt(0)
                )}
              </div>
              <div>
                <p className="font-semibold text-th">{viewingClient.name}</p>
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${ROLE_COLORS[viewingClient.role] || 'bg-gray-500/15 text-gray-500'}`}>
                  {ROLE_LABELS[viewingClient.role] || viewingClient.role}
                </span>
              </div>
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-2 text-th-secondary"><Mail size={15} /> {viewingClient.email}</div>
              <div className="flex items-center gap-2 text-th-secondary"><Phone size={15} /> {viewingClient.phone || 'Não informado'}</div>
              <div className="flex justify-between"><span className="text-th-muted">Cotas</span><span className="font-medium">{viewingClient.shares || 0}</span></div>
              <div className="flex justify-between"><span className="text-th-muted">Status</span><span className={`font-medium ${viewingClient.isActive === false ? 'text-red-600' : 'text-green-600'}`}>{viewingClient.isActive === false ? 'Bloqueado' : 'Ativo'}</span></div>
              <div className="flex justify-between"><span className="text-th-muted">Cadastro</span><span>{viewingClient.createdAt ? new Date(viewingClient.createdAt).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '-'}</span></div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingClient && (
        <div className="fixed inset-0 bg-th-overlay flex items-center justify-center z-50" onClick={() => setEditingClient(null)}>
          <div className="bg-th-card rounded-2xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-th">Editar Usuário</h2>
              <button onClick={() => setEditingClient(null)} className="text-th-muted hover:text-th-secondary"><X size={20} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-th-secondary mb-1">Nome</label>
                <input value={editForm.name} onChange={(e) => setEditForm({...editForm, name: e.target.value})} className="w-full border border-th rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-th-secondary mb-1">E-mail</label>
                <input value={editForm.email} onChange={(e) => setEditForm({...editForm, email: e.target.value})} className="w-full border border-th rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-th-secondary mb-1">Telefone</label>
                <input value={editForm.phone} onChange={(e) => setEditForm({...editForm, phone: e.target.value})} className="w-full border border-th rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-th-secondary mb-1">Perfil</label>
                <select value={editForm.role} onChange={(e) => setEditForm({...editForm, role: e.target.value})} className="w-full border border-th rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 outline-none">
                  <option value="CLIENT">Cliente</option>
                  <option value="OPERATOR">Operador</option>
                  <option value="WAITER">Garçom</option>
                  <option value="ADMIN">Admin</option>
                </select>
              </div>
              <button onClick={saveEdit} className="w-full flex items-center justify-center gap-2 bg-primary-500 text-white py-2.5 rounded-lg font-medium hover:bg-primary-600">
                <Save size={16} /> Salvar alterações
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-th-overlay flex items-center justify-center z-50" onClick={() => setShowCreate(false)}>
          <div className="bg-th-card rounded-2xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-th">Novo Usuário</h2>
              <button onClick={() => setShowCreate(false)} className="text-th-muted hover:text-th-secondary"><X size={20} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-th-secondary mb-1">Nome *</label>
                <input value={createForm.name} onChange={(e) => setCreateForm({...createForm, name: e.target.value})} className="w-full border border-th rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 outline-none" placeholder="Nome completo" />
              </div>
              <div>
                <label className="block text-sm font-medium text-th-secondary mb-1">E-mail *</label>
                <input type="email" value={createForm.email} onChange={(e) => setCreateForm({...createForm, email: e.target.value})} className="w-full border border-th rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 outline-none" placeholder="email@exemplo.com" />
              </div>
              <div>
                <label className="block text-sm font-medium text-th-secondary mb-1">Senha *</label>
                <input type="password" value={createForm.password} onChange={(e) => setCreateForm({...createForm, password: e.target.value})} className="w-full border border-th rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 outline-none" placeholder="Mínimo 6 caracteres" />
              </div>
              <div>
                <label className="block text-sm font-medium text-th-secondary mb-1">Telefone</label>
                <input value={createForm.phone} onChange={(e) => setCreateForm({...createForm, phone: e.target.value})} className="w-full border border-th rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 outline-none" placeholder="11999999999" />
              </div>
              <div>
                <label className="block text-sm font-medium text-th-secondary mb-1">Perfil</label>
                <select value={createForm.role} onChange={(e) => setCreateForm({...createForm, role: e.target.value})} className="w-full border border-th rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 outline-none">
                  <option value="CLIENT">Cliente</option>
                  <option value="OPERATOR">Operador</option>
                  <option value="WAITER">Garçom</option>
                  <option value="ADMIN">Admin</option>
                </select>
              </div>
              <button onClick={handleCreate} disabled={creating} className="w-full flex items-center justify-center gap-2 bg-primary-500 text-white py-2.5 rounded-lg font-medium hover:bg-primary-600 disabled:opacity-50">
                {creating ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><UserPlus size={16} /> Criar Usuário</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
