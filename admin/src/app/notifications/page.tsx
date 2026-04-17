'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Bell, Send, Smartphone, Monitor, Globe, Users, Search, X, Loader2,
  CheckCircle, AlertCircle, BarChart3, RefreshCw, ChevronLeft, ChevronRight,
  Megaphone, TestTube, Clock, Eye, MousePointerClick, TrendingUp, Zap,
} from 'lucide-react';
import { getPushStats, getPushHistory, getPushUsers, sendPushNotification, sendPushTest } from '@/services/api';
import { useAuth } from '@/contexts/auth';

/* ─── Types ─── */
interface Stats {
  devices: { total: number; ios: number; android: number; web: number };
  reachableUsers: number;
  notifications: { total: number; unread: number; lastWeek: number };
  engagement: { totalEvents: number; delivered: number; opened: number; openRate: number };
  dailyStats: { day: string; count: number }[];
}

interface HistoryItem {
  id: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  sentAt: string;
  user?: { id: string; name: string; email: string };
}

interface PushUser {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar?: string;
  pushEnabled: boolean;
  deviceCount: number;
}

const NOTIF_TYPES = [
  { value: 'GENERAL', label: 'Geral' },
  { value: 'RESERVATION', label: 'Reserva' },
  { value: 'PAYMENT', label: 'Pagamento' },
  { value: 'CHARGE_CREATED', label: 'Cobrança Criada' },
  { value: 'FUEL', label: 'Combustível' },
  { value: 'MAINTENANCE', label: 'Manutenção' },
  { value: 'AI_INSIGHT', label: 'IA Insight' },
  { value: 'QUEUE', label: 'Fila' },
];

const TARGET_OPTIONS = [
  { value: 'all', label: 'Todos os Usuários', icon: Users, desc: 'Enviar para todos os usuários ativos' },
  { value: 'clients', label: 'Apenas Clientes', icon: Users, desc: 'Enviar apenas para clientes' },
  { value: 'operators', label: 'Apenas Operadores', icon: Users, desc: 'Enviar para a equipe operacional' },
  { value: 'specific', label: 'Usuários Específicos', icon: Search, desc: 'Selecionar usuários manualmente' },
];

const TYPE_COLORS: Record<string, string> = {
  GENERAL: 'bg-blue-500/15 text-blue-500',
  RESERVATION: 'bg-purple-500/15 text-purple-500',
  RESERVATION_CREATED: 'bg-purple-500/15 text-purple-500',
  RESERVATION_CANCELLED: 'bg-red-500/15 text-red-500',
  RESERVATION_REMINDER: 'bg-purple-500/15 text-purple-500',
  PAYMENT: 'bg-green-500/15 text-green-500',
  CHARGE_CREATED: 'bg-yellow-500/15 text-yellow-600',
  CHARGE_DUE_TOMORROW: 'bg-yellow-500/15 text-yellow-600',
  CHARGE_DUE_TODAY: 'bg-orange-500/15 text-orange-500',
  CHARGE_OVERDUE: 'bg-red-500/15 text-red-500',
  FUEL: 'bg-cyan-500/15 text-cyan-500',
  MAINTENANCE: 'bg-gray-500/15 text-gray-500',
  AI_INSIGHT: 'bg-violet-500/15 text-violet-500',
  QUEUE: 'bg-indigo-500/15 text-indigo-500',
};

/* ─── Main Page ─── */
export default function NotificationsPage() {
  const { user: adminUser } = useAuth();
  const [activeTab, setActiveTab] = useState<'send' | 'history' | 'devices'>('send');
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  // Send form state
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [type, setType] = useState('GENERAL');
  const [target, setTarget] = useState('all');
  const [url, setUrl] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<PushUser[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [userResults, setUserResults] = useState<PushUser[]>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ success: boolean; message: string } | null>(null);

  // History state
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPages, setHistoryPages] = useState(1);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyType, setHistoryType] = useState('');
  const [loadingHistory, setLoadingHistory] = useState(false);

  const loadStats = useCallback(async () => {
    try {
      const { data } = await getPushStats();
      setStats(data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const { data } = await getPushHistory(historyPage, historyType || undefined);
      setHistory(data.data);
      setHistoryPages(data.pages);
      setHistoryTotal(data.total);
    } catch {
      // silent
    } finally {
      setLoadingHistory(false);
    }
  }, [historyPage, historyType]);

  useEffect(() => {
    if (activeTab === 'history') loadHistory();
  }, [activeTab, loadHistory]);

  // User search with debounce
  useEffect(() => {
    if (target !== 'specific' || !userSearch.trim()) {
      setUserResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearchingUsers(true);
      try {
        const { data } = await getPushUsers(userSearch);
        setUserResults(data);
      } catch { /* silent */ }
      setSearchingUsers(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [userSearch, target]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;
    setSending(true);
    setSendResult(null);
    try {
      const payload: any = { title, body, target, type };
      if (url.trim()) payload.url = url;
      if (target === 'specific') payload.userIds = selectedUsers.map((u) => u.id);
      const { data } = await sendPushNotification(payload);
      setSendResult({ success: true, message: data.message || `Enviado para ${data.sent} usuários` });
      setTitle('');
      setBody('');
      setUrl('');
      setSelectedUsers([]);
      loadStats();
    } catch (err: any) {
      setSendResult({ success: false, message: err?.response?.data?.message || 'Erro ao enviar notificação' });
    } finally {
      setSending(false);
    }
  };

  const handleTestPush = async () => {
    if (!adminUser?.id) return;
    setSending(true);
    setSendResult(null);
    try {
      await sendPushTest({ userId: adminUser.id, title: title || undefined, body: body || undefined });
      setSendResult({ success: true, message: 'Notificação de teste enviada para você!' });
    } catch {
      setSendResult({ success: false, message: 'Erro ao enviar teste' });
    } finally {
      setSending(false);
    }
  };

  const toggleUser = (user: PushUser) => {
    setSelectedUsers((prev) =>
      prev.some((u) => u.id === user.id) ? prev.filter((u) => u.id !== user.id) : [...prev, user],
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="animate-spin text-primary-500" size={32} />
      </div>
    );
  }

  const maxDaily = stats?.dailyStats ? Math.max(...stats.dailyStats.map((d) => d.count), 1) : 1;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-primary-500/15 rounded-2xl flex items-center justify-center">
            <Bell className="text-primary-500" size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-th">Notificações Push</h1>
            <p className="text-sm text-th-muted">Gerencie e envie notificações para seus clientes</p>
          </div>
        </div>
        <button
          onClick={() => { setLoading(true); loadStats(); }}
          className="flex items-center gap-2 px-4 py-2.5 bg-th-card border border-th rounded-xl text-sm font-medium text-th-secondary hover:text-th hover:bg-th-hover transition"
        >
          <RefreshCw size={16} />
          Atualizar
        </button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon={Smartphone}
            label="Dispositivos"
            value={stats.devices.total}
            detail={`${stats.devices.ios} iOS · ${stats.devices.web} Web`}
            color="text-blue-500"
            bg="bg-blue-500/15"
          />
          <StatCard
            icon={Users}
            label="Usuários Alcançáveis"
            value={stats.reachableUsers}
            detail="com push ativo"
            color="text-green-500"
            bg="bg-green-500/15"
          />
          <StatCard
            icon={Megaphone}
            label="Últimos 7 dias"
            value={stats.notifications.lastWeek}
            detail={`${stats.notifications.total} total`}
            color="text-purple-500"
            bg="bg-purple-500/15"
          />
          <StatCard
            icon={MousePointerClick}
            label="Taxa de Abertura"
            value={`${stats.engagement.openRate}%`}
            detail={`${stats.engagement.opened} aberturas de ${stats.engagement.delivered} entregas`}
            color="text-primary-500"
            bg="bg-primary-500/15"
          />
        </div>
      )}

      {/* Mini chart */}
      {stats?.dailyStats && stats.dailyStats.length > 0 && (
        <div className="bg-th-card rounded-2xl border border-th p-5">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={16} className="text-th-muted" />
            <span className="text-sm font-semibold text-th">Notificações por Dia (últimos 7 dias)</span>
          </div>
          <div className="flex items-end gap-2 h-24">
            {stats.dailyStats.map((d, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-[10px] text-th-muted font-medium">{d.count}</span>
                <div
                  className="w-full bg-primary-500/80 rounded-t-md transition-all min-h-[4px]"
                  style={{ height: `${(d.count / maxDaily) * 80}px` }}
                />
                <span className="text-[9px] text-th-muted">
                  {new Date(d.day).toLocaleDateString('pt-BR', { weekday: 'short' })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-th-card rounded-2xl p-1.5 border border-th">
        {([
          { id: 'send', label: 'Enviar Notificação', icon: Send },
          { id: 'history', label: 'Histórico', icon: Clock },
          { id: 'devices', label: 'Dispositivos', icon: Smartphone },
        ] as const).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition ${
              activeTab === tab.id
                ? 'bg-primary-500 text-white shadow-lg shadow-primary-500/25'
                : 'text-th-secondary hover:text-th hover:bg-th-hover'
            }`}
          >
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'send' && (
        <SendTab
          title={title}
          setTitle={setTitle}
          body={body}
          setBody={setBody}
          type={type}
          setType={setType}
          target={target}
          setTarget={setTarget}
          url={url}
          setUrl={setUrl}
          selectedUsers={selectedUsers}
          userSearch={userSearch}
          setUserSearch={setUserSearch}
          userResults={userResults}
          searchingUsers={searchingUsers}
          toggleUser={toggleUser}
          sending={sending}
          sendResult={sendResult}
          onSend={handleSend}
          onTest={handleTestPush}
          setSendResult={setSendResult}
        />
      )}

      {activeTab === 'history' && (
        <HistoryTab
          history={history}
          loading={loadingHistory}
          page={historyPage}
          pages={historyPages}
          total={historyTotal}
          typeFilter={historyType}
          setTypeFilter={setHistoryType}
          setPage={setHistoryPage}
        />
      )}

      {activeTab === 'devices' && stats && <DevicesTab stats={stats} />}
    </div>
  );
}

/* ─── Stat Card ─── */
function StatCard({ icon: Icon, label, value, detail, color, bg }: {
  icon: any; label: string; value: string | number; detail: string; color: string; bg: string;
}) {
  return (
    <div className="bg-th-card rounded-2xl border border-th p-5 flex items-start gap-4">
      <div className={`w-11 h-11 ${bg} rounded-xl flex items-center justify-center flex-shrink-0`}>
        <Icon size={20} className={color} />
      </div>
      <div>
        <p className="text-2xl font-black text-th">{value}</p>
        <p className="text-sm font-semibold text-th-secondary">{label}</p>
        <p className="text-xs text-th-muted mt-0.5">{detail}</p>
      </div>
    </div>
  );
}

/* ─── Send Tab ─── */
function SendTab({
  title, setTitle, body, setBody, type, setType, target, setTarget,
  url, setUrl, selectedUsers, userSearch, setUserSearch, userResults,
  searchingUsers, toggleUser, sending, sendResult, onSend, onTest, setSendResult,
}: any) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Form */}
      <form onSubmit={onSend} className="lg:col-span-2 space-y-5">
        <div className="bg-th-card rounded-2xl border border-th p-6 space-y-5">
          <h3 className="text-lg font-bold text-th flex items-center gap-2">
            <Megaphone size={18} className="text-primary-500" />
            Compor Notificação
          </h3>

          {/* Title */}
          <div>
            <label className="block text-sm font-semibold text-th-secondary mb-1.5">Título *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Promoção especial de fim de semana!"
              className="w-full bg-th-input border border-th rounded-xl px-4 py-3 text-sm text-th placeholder:text-th-muted focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition"
              required
            />
          </div>

          {/* Body */}
          <div>
            <label className="block text-sm font-semibold text-th-secondary mb-1.5">Mensagem *</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Escreva a mensagem da notificação..."
              rows={4}
              className="w-full bg-th-input border border-th rounded-xl px-4 py-3 text-sm text-th placeholder:text-th-muted focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition resize-none"
              required
            />
          </div>

          {/* Type + URL row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-th-secondary mb-1.5">Tipo</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full bg-th-input border border-th rounded-xl px-4 py-3 text-sm text-th focus:ring-2 focus:ring-primary-500 outline-none transition"
              >
                {NOTIF_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-th-secondary mb-1.5">Link (opcional)</label>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://app.marinaprizeclub.com/..."
                className="w-full bg-th-input border border-th rounded-xl px-4 py-3 text-sm text-th placeholder:text-th-muted focus:ring-2 focus:ring-primary-500 outline-none transition"
              />
            </div>
          </div>
        </div>

        {/* Target audience */}
        <div className="bg-th-card rounded-2xl border border-th p-6 space-y-4">
          <h3 className="text-lg font-bold text-th flex items-center gap-2">
            <Users size={18} className="text-primary-500" />
            Público Alvo
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {TARGET_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setTarget(opt.value)}
                className={`p-4 rounded-xl border-2 text-left transition-all ${
                  target === opt.value
                    ? 'border-primary-500 bg-primary-500/10 shadow-sm shadow-primary-500/10'
                    : 'border-th hover:border-primary-500/30 hover:bg-th-hover'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <opt.icon size={16} className={target === opt.value ? 'text-primary-500' : 'text-th-muted'} />
                  <span className={`text-sm font-semibold ${target === opt.value ? 'text-primary-500' : 'text-th'}`}>
                    {opt.label}
                  </span>
                </div>
                <p className="text-xs text-th-muted">{opt.desc}</p>
              </button>
            ))}
          </div>

          {/* Specific user search */}
          {target === 'specific' && (
            <div className="space-y-3 mt-2">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-3.5 text-th-muted" />
                <input
                  type="text"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Buscar por nome ou email..."
                  className="w-full bg-th-input border border-th rounded-xl pl-10 pr-4 py-3 text-sm text-th placeholder:text-th-muted focus:ring-2 focus:ring-primary-500 outline-none transition"
                />
                {searchingUsers && <Loader2 size={16} className="absolute right-3 top-3.5 animate-spin text-th-muted" />}
              </div>

              {/* Selected badges */}
              {selectedUsers.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {selectedUsers.map((u: PushUser) => (
                    <span key={u.id} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary-500/15 text-primary-500 rounded-full text-xs font-semibold">
                      {u.name}
                      <button type="button" onClick={() => toggleUser(u)} className="hover:text-primary-700">
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {/* Search results */}
              {userResults.length > 0 && (
                <div className="bg-th-surface rounded-xl border border-th max-h-48 overflow-y-auto divide-y divide-th">
                  {userResults.map((u: PushUser) => {
                    const isSelected = selectedUsers.some((s: PushUser) => s.id === u.id);
                    return (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => toggleUser(u)}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-th-hover transition ${isSelected ? 'bg-primary-500/5' : ''}`}
                      >
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-500 to-orange-400 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                          {u.name?.charAt(0) || '?'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-th truncate">{u.name}</p>
                          <p className="text-xs text-th-muted truncate">{u.email}</p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {u.pushEnabled ? (
                            <span className="text-[10px] bg-green-500/15 text-green-500 px-2 py-0.5 rounded-full font-semibold">
                              {u.deviceCount} {u.deviceCount === 1 ? 'dispositivo' : 'dispositivos'}
                            </span>
                          ) : (
                            <span className="text-[10px] bg-gray-500/15 text-gray-400 px-2 py-0.5 rounded-full font-semibold">
                              sem push
                            </span>
                          )}
                          {isSelected && <CheckCircle size={16} className="text-primary-500" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Result banner */}
        {sendResult && (
          <div className={`flex items-center gap-3 px-5 py-4 rounded-xl border ${
            sendResult.success
              ? 'bg-green-500/10 border-green-500/30 text-green-500'
              : 'bg-red-500/10 border-red-500/30 text-red-500'
          }`}>
            {sendResult.success ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
            <span className="text-sm font-medium">{sendResult.message}</span>
            <button onClick={() => setSendResult(null)} className="ml-auto hover:opacity-70">
              <X size={14} />
            </button>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={sending || !title.trim() || !body.trim() || (target === 'specific' && selectedUsers.length === 0)}
            className="flex items-center gap-2 px-6 py-3 bg-primary-500 text-white rounded-xl font-semibold hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-lg shadow-primary-500/25"
          >
            {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
            Enviar Notificação
          </button>
          <button
            type="button"
            onClick={onTest}
            disabled={sending}
            className="flex items-center gap-2 px-5 py-3 bg-th-card border border-th text-th-secondary rounded-xl font-medium hover:bg-th-hover hover:text-th disabled:opacity-50 transition"
          >
            <TestTube size={16} />
            Enviar Teste (para mim)
          </button>
        </div>
      </form>

      {/* Preview */}
      <div className="space-y-5">
        <div className="bg-th-card rounded-2xl border border-th p-6">
          <h3 className="text-sm font-bold text-th-secondary mb-4 flex items-center gap-2">
            <Eye size={16} />
            Preview
          </h3>
          <div className="bg-th-surface rounded-2xl p-4 border border-th-subtle">
            {/* Simulated mobile notification */}
            <div className="bg-th-card rounded-xl p-3 shadow-lg border border-th-subtle">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-primary-500 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Zap size={14} className="text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-th">Prize Club Marina</p>
                    <p className="text-[10px] text-th-muted">agora</p>
                  </div>
                  <p className="text-sm font-semibold text-th mt-0.5 line-clamp-1">
                    {title || 'Título da notificação'}
                  </p>
                  <p className="text-xs text-th-secondary mt-0.5 line-clamp-2">
                    {body || 'Mensagem da notificação aparecerá aqui...'}
                  </p>
                </div>
              </div>
            </div>
          </div>
          <div className="mt-3 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-th-muted">Tipo</span>
              <span className={`px-2 py-0.5 rounded-full font-semibold ${TYPE_COLORS[type] || 'bg-gray-500/15 text-gray-500'}`}>
                {NOTIF_TYPES.find((t) => t.value === type)?.label || type}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-th-muted">Destino</span>
              <span className="text-th font-medium">
                {TARGET_OPTIONS.find((t) => t.value === target)?.label}
              </span>
            </div>
            {target === 'specific' && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-th-muted">Selecionados</span>
                <span className="text-primary-500 font-semibold">{selectedUsers.length} usuários</span>
              </div>
            )}
            {url && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-th-muted">Link</span>
                <span className="text-primary-500 font-medium truncate max-w-[120px]">{url}</span>
              </div>
            )}
          </div>
        </div>

        {/* Quick templates */}
        <div className="bg-th-card rounded-2xl border border-th p-6">
          <h3 className="text-sm font-bold text-th-secondary mb-3">Templates Rápidos</h3>
          <div className="space-y-2">
            {[
              { t: '🎉 Promoção Especial', b: 'Aproveite condições especiais neste fim de semana na Marina Prize Club!', tp: 'GENERAL' },
              { t: '⚓ Sua reserva está próxima', b: 'Lembrete: Sua reserva está agendada para amanhã. Não esqueça!', tp: 'RESERVATION' },
              { t: '💳 Nova cobrança disponível', b: 'Uma nova cobrança foi gerada. Confira no app.', tp: 'CHARGE_CREATED' },
              { t: '🔧 Manutenção concluída', b: 'A manutenção da sua embarcação foi finalizada com sucesso.', tp: 'MAINTENANCE' },
              { t: '⛽ Abastecimento registrado', b: 'Um novo abastecimento foi registrado para sua embarcação.', tp: 'FUEL' },
            ].map((tpl, i) => (
              <button
                key={i}
                type="button"
                onClick={() => { setTitle(tpl.t); setBody(tpl.b); setType(tpl.tp); }}
                className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-th-hover transition border border-transparent hover:border-th-subtle"
              >
                <p className="text-sm font-medium text-th">{tpl.t}</p>
                <p className="text-xs text-th-muted truncate">{tpl.b}</p>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── History Tab ─── */
function HistoryTab({ history, loading, page, pages, total, typeFilter, setTypeFilter, setPage }: {
  history: HistoryItem[]; loading: boolean; page: number; pages: number; total: number;
  typeFilter: string; setTypeFilter: (v: string) => void; setPage: (p: number) => void;
}) {
  return (
    <div className="bg-th-card rounded-2xl border border-th overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-th flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-th">Histórico de Notificações</h3>
          <p className="text-xs text-th-muted">{total} notificações enviadas</p>
        </div>
        <select
          value={typeFilter}
          onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
          className="bg-th-input border border-th rounded-lg px-3 py-2 text-sm text-th focus:ring-2 focus:ring-primary-500 outline-none"
        >
          <option value="">Todos os tipos</option>
          {NOTIF_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="animate-spin text-primary-500" size={28} />
        </div>
      ) : history.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-th-muted">
          <Bell size={40} strokeWidth={1} className="mb-3 opacity-40" />
          <p className="text-sm">Nenhuma notificação encontrada</p>
        </div>
      ) : (
        <>
          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-th-surface text-left">
                  <th className="px-6 py-3 text-xs font-bold text-th-muted uppercase tracking-wider">Tipo</th>
                  <th className="px-6 py-3 text-xs font-bold text-th-muted uppercase tracking-wider">Notificação</th>
                  <th className="px-6 py-3 text-xs font-bold text-th-muted uppercase tracking-wider">Destinatário</th>
                  <th className="px-6 py-3 text-xs font-bold text-th-muted uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-xs font-bold text-th-muted uppercase tracking-wider">Data</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-th">
                {history.map((item) => (
                  <tr key={item.id} className="hover:bg-th-hover transition">
                    <td className="px-6 py-3">
                      <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${TYPE_COLORS[item.type] || 'bg-gray-500/15 text-gray-500'}`}>
                        {item.type.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-3">
                      <p className="text-sm font-semibold text-th">{item.title}</p>
                      <p className="text-xs text-th-muted truncate max-w-[300px]">{item.body}</p>
                    </td>
                    <td className="px-6 py-3">
                      <p className="text-sm text-th">{item.user?.name || '—'}</p>
                      <p className="text-xs text-th-muted">{item.user?.email || ''}</p>
                    </td>
                    <td className="px-6 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold ${
                        item.read ? 'bg-green-500/15 text-green-500' : 'bg-yellow-500/15 text-yellow-500'
                      }`}>
                        {item.read ? <><Eye size={10} /> Lida</> : <><Clock size={10} /> Não lida</>}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-xs text-th-muted whitespace-nowrap">
                      {new Date(item.sentAt).toLocaleString('pt-BR', {
                        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pages > 1 && (
            <div className="px-6 py-4 border-t border-th flex items-center justify-between">
              <p className="text-xs text-th-muted">
                Página {page} de {pages}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page <= 1}
                  className="p-2 rounded-lg border border-th hover:bg-th-hover disabled:opacity-30 transition"
                >
                  <ChevronLeft size={14} />
                </button>
                <button
                  onClick={() => setPage(Math.min(pages, page + 1))}
                  disabled={page >= pages}
                  className="p-2 rounded-lg border border-th hover:bg-th-hover disabled:opacity-30 transition"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ─── Devices Tab ─── */
function DevicesTab({ stats }: { stats: Stats }) {
  return (
    <div className="space-y-5">
      {/* Platform breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <DevicePlatformCard
          icon={Smartphone}
          label="iOS (APNs)"
          count={stats.devices.ios}
          total={stats.devices.total}
          color="text-blue-500"
          bg="bg-blue-500"
        />
        <DevicePlatformCard
          icon={Smartphone}
          label="Android"
          count={stats.devices.android}
          total={stats.devices.total}
          color="text-green-500"
          bg="bg-green-500"
        />
        <DevicePlatformCard
          icon={Globe}
          label="Web Push"
          count={stats.devices.web}
          total={stats.devices.total}
          color="text-purple-500"
          bg="bg-purple-500"
        />
      </div>

      {/* Engagement breakdown */}
      <div className="bg-th-card rounded-2xl border border-th p-6">
        <h3 className="text-lg font-bold text-th mb-4 flex items-center gap-2">
          <BarChart3 size={18} className="text-primary-500" />
          Engajamento de Push
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <EngagementStat label="Total Eventos" value={stats.engagement.totalEvents} icon={Zap} color="text-blue-500" />
          <EngagementStat label="Entregues" value={stats.engagement.delivered} icon={CheckCircle} color="text-green-500" />
          <EngagementStat label="Abertas" value={stats.engagement.opened} icon={Eye} color="text-purple-500" />
          <EngagementStat label="Taxa Abertura" value={`${stats.engagement.openRate}%`} icon={TrendingUp} color="text-primary-500" />
        </div>

        {/* Visual bar */}
        {stats.engagement.delivered > 0 && (
          <div className="mt-5">
            <div className="flex items-center justify-between text-xs text-th-muted mb-2">
              <span>Entregas → Aberturas</span>
              <span>{stats.engagement.openRate}% conversão</span>
            </div>
            <div className="h-4 bg-th-surface rounded-full overflow-hidden flex">
              <div
                className="bg-green-500 h-full rounded-l-full transition-all"
                style={{ width: '100%' }}
              />
            </div>
            <div className="h-4 bg-th-surface rounded-full overflow-hidden flex mt-1.5">
              <div
                className="bg-primary-500 h-full rounded-l-full transition-all"
                style={{ width: `${stats.engagement.openRate}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-th-muted mt-1">
              <span>{stats.engagement.delivered} entregues</span>
              <span>{stats.engagement.opened} abertas</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DevicePlatformCard({ icon: Icon, label, count, total, color, bg }: {
  icon: any; label: string; count: number; total: number; color: string; bg: string;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="bg-th-card rounded-2xl border border-th p-5">
      <div className="flex items-center gap-3 mb-3">
        <Icon size={18} className={color} />
        <span className="text-sm font-semibold text-th">{label}</span>
      </div>
      <p className="text-3xl font-black text-th mb-2">{count}</p>
      <div className="h-2 bg-th-surface rounded-full overflow-hidden">
        <div className={`${bg} h-full rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-th-muted mt-1.5">{pct}% do total</p>
    </div>
  );
}

function EngagementStat({ label, value, icon: Icon, color }: {
  label: string; value: string | number; icon: any; color: string;
}) {
  return (
    <div className="text-center p-3 bg-th-surface rounded-xl">
      <Icon size={18} className={`${color} mx-auto mb-1.5`} />
      <p className="text-xl font-black text-th">{value}</p>
      <p className="text-[10px] text-th-muted font-medium">{label}</p>
    </div>
  );
}
