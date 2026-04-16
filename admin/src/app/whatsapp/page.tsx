'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  MessageCircle, Wifi, WifiOff, QrCode, Send, RefreshCw,
  Phone, ArrowLeft, Bell, AlertTriangle, Search,
  Clock, CheckCheck, Check, X, Loader2, Zap, Calendar,
  Settings, Users, MessageSquare, Edit2, Save, ToggleLeft, ToggleRight,
} from 'lucide-react';
import {
  getWhatsappStatus, connectWhatsapp, disconnectWhatsapp,
  getWhatsappMessages, getWhatsappConversation, getWhatsappConversations,
  sendWhatsappMessage, getWhatsappStats, getWhatsappTemplates,
  updateWhatsappTemplate,
  triggerReservationConfirmations, triggerPaymentReminders, triggerOverdueAlerts,
} from '@/services/api';

/* ────── Types ────── */
interface WaStatus { status: string; phone?: string; qrCode?: string }
interface WaMessage {
  id: string; direction: string; phone: string; body: string;
  status: string; category?: string; userId?: string;
  createdAt: string; sentAt?: string; deliveredAt?: string; readAt?: string;
  user?: { id: string; name: string };
}
interface WaConversation {
  phone: string; userName: string | null; userId: string | null;
  lastMessage: string; lastMessageAt: string; lastDirection: string;
  unreadCount: number; totalMessages: number;
}
interface WaStats {
  totalSent: number; totalReceived: number;
  todaySent: number; todayReceived: number;
  totalFailed: number; connected: boolean;
}
interface WaTemplate {
  id: string; slug: string; name: string; body: string;
  category: string; isActive: boolean;
}

type MainView = 'chat' | 'connection' | 'templates' | 'triggers';

const msgStatusIcon = (s: string) => {
  switch (s) {
    case 'SENT': return <Check size={12} className="text-gray-400 shrink-0" />;
    case 'DELIVERED': return <CheckCheck size={12} className="text-gray-400 shrink-0" />;
    case 'READ': return <CheckCheck size={12} className="text-blue-500 shrink-0" />;
    case 'FAILED': return <X size={12} className="text-red-500 shrink-0" />;
    case 'QUEUED': return <Clock size={12} className="text-yellow-500 shrink-0" />;
    default: return null;
  }
};

const categoryLabels: Record<string, string> = {
  RESERVATION_CONFIRM: 'Confirmação',
  CHARGE_CREATED: 'Cobrança',
  PAYMENT_REMINDER: 'Lembrete',
  DUE_TODAY: 'Vencimento',
  OVERDUE: 'Atraso',
  CUSTOM: 'Custom',
  RESPONSE: 'Resposta',
  SYSTEM: 'Sistema',
  AI: 'Inteligência Artificial',
  MENU: 'Menu',
  INVOICE: 'Fatura',
  AI_RESPONSE: 'IA',
  CANCEL_CONFIRM: 'Cancelamento',
};

function formatPhone(phone: string) {
  if (!phone) return '';
  const d = phone.replace(/\D/g, '');
  if (d.length === 13 && d.startsWith('55')) {
    return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  }
  if (d.length === 12 && d.startsWith('55')) {
    return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`;
  }
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return phone;
}

function timeAgo(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'agora';
  if (diffMin < 60) return `${diffMin}min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h`;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function msgTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function msgDate(dateStr: string) {
  const d = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Hoje';
  if (d.toDateString() === yesterday.toDateString()) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function WhatsAppPage() {
  /* ── State ── */
  const [mainView, setMainView] = useState<MainView>('chat');
  const [status, setStatus] = useState<WaStatus | null>(null);
  const [stats, setStats] = useState<WaStats | null>(null);
  const [conversations, setConversations] = useState<WaConversation[]>([]);
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<WaMessage[]>([]);
  const [templates, setTemplates] = useState<WaTemplate[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [sendMsg, setSendMsg] = useState('');
  const [sending, setSending] = useState(false);
  const [triggerLoading, setTriggerLoading] = useState('');
  const [newMsgPhone, setNewMsgPhone] = useState('');
  const [showNewMsg, setShowNewMsg] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<string | null>(null);
  const [editTemplateBody, setEditTemplateBody] = useState('');
  const [editTemplateName, setEditTemplateName] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  /* ── Load status ── */
  const loadStatus = useCallback(async () => {
    try { setStatus((await getWhatsappStatus()).data); }
    catch { setStatus({ status: 'ERROR' }); }
  }, []);

  const loadStats = useCallback(async () => {
    try { setStats((await getWhatsappStats()).data); }
    catch { /* */ }
  }, []);

  const loadConversations = useCallback(async () => {
    try { setConversations((await getWhatsappConversations()).data || []); }
    catch { /* */ }
  }, []);

  useEffect(() => { loadStatus(); loadStats(); loadConversations(); }, [loadStatus, loadStats, loadConversations]);

  /* ── QR polling ── */
  useEffect(() => {
    if (status?.status === 'QR_READY' || status?.status === 'CONNECTING') {
      pollRef.current = setInterval(loadStatus, 3000);
    } else {
      if (pollRef.current) clearInterval(pollRef.current);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [status?.status, loadStatus]);

  /* ── Load chat when phone selected ── */
  const loadChat = useCallback(async (phone: string) => {
    try {
      const res = await getWhatsappConversation(phone);
      setChatMessages(Array.isArray(res.data) ? res.data : []);
    } catch { setChatMessages([]); }
  }, []);

  useEffect(() => {
    if (selectedPhone) loadChat(selectedPhone);
  }, [selectedPhone, loadChat]);

  /* ── Auto-scroll to bottom ── */
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  /* ── Load templates ── */
  useEffect(() => {
    if (mainView === 'templates') {
      getWhatsappTemplates().then(r => setTemplates(r.data || [])).catch(() => {});
    }
  }, [mainView]);

  /* ── Handlers ── */
  const handleConnect = async () => {
    setConnecting(true);
    try { setStatus((await connectWhatsapp()).data); }
    catch { /* */ }
    setConnecting(false);
  };

  const handleDisconnect = async () => {
    if (!confirm('Desconectar o WhatsApp?')) return;
    try { await disconnectWhatsapp(); setStatus({ status: 'DISCONNECTED' }); }
    catch { /* */ }
  };

  const selectConversation = (phone: string) => {
    setSelectedPhone(phone);
    setMainView('chat');
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const phone = selectedPhone || newMsgPhone;
    if (!phone || !sendMsg.trim()) return;
    setSending(true);
    try {
      await sendWhatsappMessage({ phone, message: sendMsg });
      setSendMsg('');
      if (selectedPhone) await loadChat(selectedPhone);
      loadConversations();
      if (showNewMsg) { setShowNewMsg(false); setSelectedPhone(phone); }
    } catch { alert('Erro ao enviar mensagem'); }
    setSending(false);
  };

  const handleTrigger = async (name: string, fn: () => Promise<unknown>) => {
    if (!confirm(`Executar ${name}?`)) return;
    setTriggerLoading(name);
    try { await fn(); alert(`${name} executado!`); }
    catch { alert('Erro'); }
    setTriggerLoading('');
  };

  /* ── Derived ── */
  const filteredConvos = conversations.filter(c => {
    const q = searchTerm.toLowerCase();
    return !q || c.phone.includes(q) || (c.userName || '').toLowerCase().includes(q);
  });

  const selectedConvo = conversations.find(c => c.phone === selectedPhone);
  const isConnected = status?.status === 'CONNECTED';

  /* ── Group messages by date ── */
  const groupedMessages: { date: string; messages: WaMessage[] }[] = [];
  chatMessages.forEach(m => {
    const d = msgDate(m.createdAt);
    const last = groupedMessages[groupedMessages.length - 1];
    if (last && last.date === d) { last.messages.push(m); }
    else { groupedMessages.push({ date: d, messages: [m] }); }
  });

  return (
    <div className="flex h-[calc(100vh-2rem)] m-4 bg-th-surface border border-th-border rounded-2xl overflow-hidden shadow-lg">
      {/* LEFT SIDEBAR */}
      <div className="w-[380px] flex flex-col border-r border-th-border shrink-0">
        {/* Header */}
        <div className="px-4 py-3 bg-th-surface border-b border-th-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-full bg-green-500/10 flex items-center justify-center">
              <MessageCircle size={18} className="text-green-600" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-th-primary">WhatsApp</h1>
              <span className={`text-[11px] flex items-center gap-1 ${isConnected ? 'text-green-500' : 'text-red-400'}`}>
                {isConnected ? <Wifi size={10} /> : <WifiOff size={10} />}
                {isConnected ? 'Conectado' : 'Desconectado'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setShowNewMsg(true)} title="Nova mensagem"
              className="p-2 rounded-lg hover:bg-th-border/50 text-th-secondary transition-colors">
              <MessageSquare size={18} />
            </button>
            <button onClick={() => loadConversations()} title="Atualizar"
              className="p-2 rounded-lg hover:bg-th-border/50 text-th-secondary transition-colors">
              <RefreshCw size={18} />
            </button>
          </div>
        </div>

        {/* Nav buttons */}
        <div className="flex border-b border-th-border">
          {([
            ['chat', 'Conversas', MessageCircle],
            ['connection', 'Conexão', QrCode],
            ['triggers', 'Automações', Zap],
            ['templates', 'Templates', Settings],
          ] as [MainView, string, React.ComponentType<{ size?: number }>][]).map(([key, label, Icon]) => (
            <button key={key} onClick={() => setMainView(key)}
              className={`flex-1 py-2.5 text-[11px] font-medium flex flex-col items-center gap-1 transition-colors
                ${mainView === key ? 'text-green-600 border-b-2 border-green-500' : 'text-th-secondary hover:text-th-primary'}`}>
              <Icon size={16} /> {label}
            </button>
          ))}
        </div>

        {/* Search */}
        {mainView === 'chat' && (
          <div className="px-3 py-2 border-b border-th-border">
            <div className="flex items-center gap-2 bg-th-bg rounded-lg px-3 py-2">
              <Search size={14} className="text-th-secondary shrink-0" />
              <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                placeholder="Pesquisar conversas..."
                className="bg-transparent text-sm text-th-primary outline-none flex-1 placeholder:text-th-secondary/60" />
            </div>
          </div>
        )}

        {/* Conversation list */}
        {mainView === 'chat' && (
          <div className="flex-1 overflow-y-auto">
            {filteredConvos.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-th-secondary gap-2">
                <MessageCircle size={40} className="opacity-30" />
                <p className="text-sm">Nenhuma conversa</p>
              </div>
            ) : filteredConvos.map(c => (
              <button key={c.phone} onClick={() => selectConversation(c.phone)}
                className={`w-full px-4 py-3 flex gap-3 items-center hover:bg-th-border/30 transition-colors text-left
                  ${selectedPhone === c.phone ? 'bg-th-border/50' : ''}`}>
                {/* Avatar */}
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
                  {c.userName ? c.userName.charAt(0).toUpperCase() : <Users size={18} />}
                </div>
                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-th-primary truncate">
                      {c.userName || formatPhone(c.phone)}
                    </span>
                    <span className="text-[10px] text-th-secondary shrink-0 ml-2">
                      {c.lastMessageAt ? timeAgo(c.lastMessageAt) : ''}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-0.5">
                    <p className="text-xs text-th-secondary truncate pr-2">
                      {c.lastDirection === 'OUTBOUND' && <span className="text-th-secondary/70">Você: </span>}
                      {c.lastMessage}
                    </p>
                    {c.unreadCount > 0 && (
                      <span className="bg-green-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 shrink-0">
                        {c.unreadCount}
                      </span>
                    )}
                  </div>
                  {c.userName && (
                    <p className="text-[10px] text-th-secondary/60 mt-0.5 truncate">{formatPhone(c.phone)}</p>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Stats footer */}
        {mainView === 'chat' && stats && (
          <div className="px-4 py-2 border-t border-th-border flex justify-between text-[10px] text-th-secondary bg-th-bg/50">
            <span>↑ {stats.todaySent} hoje</span>
            <span>↓ {stats.todayReceived} hoje</span>
            <span>{stats.totalFailed > 0 ? `⚠ ${stats.totalFailed} falhas` : `✓ ${stats.totalSent} total`}</span>
          </div>
        )}

        {/* Connection panel */}
        {mainView === 'connection' && (
          <div className="flex-1 flex flex-col items-center justify-center p-6 gap-4">
            {isConnected ? (
              <>
                <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center">
                  <Wifi className="text-green-500" size={28} />
                </div>
                <p className="text-sm font-bold text-th-primary">Conectado</p>
                <p className="text-xs text-th-secondary">{status?.phone || ''}</p>
                <button onClick={handleDisconnect}
                  className="px-5 py-2 bg-red-500 text-white rounded-lg text-sm hover:bg-red-600 transition-colors">
                  Desconectar
                </button>
              </>
            ) : status?.status === 'QR_READY' && status.qrCode ? (
              <>
                <p className="text-sm font-bold text-th-primary">Escaneie o QR Code</p>
                <p className="text-[11px] text-th-secondary text-center">WhatsApp → Dispositivos conectados → Conectar</p>
                <div className="w-56 h-56 bg-white rounded-xl p-3 flex items-center justify-center shadow-sm">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={status.qrCode} alt="QR Code" className="w-full h-full object-contain" />
                </div>
                <p className="text-[10px] text-th-secondary animate-pulse">Atualizando...</p>
              </>
            ) : (
              <>
                <div className="w-16 h-16 bg-gray-500/10 rounded-full flex items-center justify-center">
                  <WifiOff className="text-gray-400" size={28} />
                </div>
                <p className="text-sm font-bold text-th-primary">Desconectado</p>
                <p className="text-[11px] text-th-secondary text-center">Conecte para enviar mensagens</p>
                <button onClick={handleConnect} disabled={connecting}
                  className="px-5 py-2 bg-green-500 text-white rounded-lg text-sm hover:bg-green-600 disabled:opacity-50 flex items-center gap-2 transition-colors">
                  {connecting ? <Loader2 size={14} className="animate-spin" /> : <QrCode size={14} />}
                  {connecting ? 'Gerando...' : 'Conectar'}
                </button>
              </>
            )}
          </div>
        )}

        {/* Templates panel */}
        {mainView === 'templates' && (
          <div className="flex-1 overflow-y-auto">
            {templates.length === 0 ? (
              <p className="p-6 text-center text-sm text-th-secondary">Nenhum template</p>
            ) : templates.map(t => (
              <div key={t.id} className="px-4 py-3 border-b border-th-border">
                <div className="flex items-center justify-between mb-1">
                  {editingTemplate === t.id ? (
                    <input value={editTemplateName} onChange={e => setEditTemplateName(e.target.value)}
                      className="text-xs font-bold text-th-primary bg-th-bg border border-th-border rounded px-2 py-1 flex-1 mr-2" />
                  ) : (
                    <span className="text-xs font-bold text-th-primary">{t.name}</span>
                  )}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={async () => {
                        const updated = !t.isActive;
                        try {
                          await updateWhatsappTemplate(t.id, { isActive: updated });
                          setTemplates(prev => prev.map(x => x.id === t.id ? { ...x, isActive: updated } : x));
                        } catch { /* */ }
                      }}
                      title={t.isActive ? 'Desativar' : 'Ativar'}
                      className="p-1 rounded hover:bg-th-border/50 transition-colors">
                      {t.isActive
                        ? <ToggleRight size={16} className="text-green-500" />
                        : <ToggleLeft size={16} className="text-gray-400" />}
                    </button>
                    {editingTemplate === t.id ? (
                      <button onClick={async () => {
                        setSavingTemplate(true);
                        try {
                          await updateWhatsappTemplate(t.id, { name: editTemplateName, body: editTemplateBody });
                          setTemplates(prev => prev.map(x => x.id === t.id ? { ...x, name: editTemplateName, body: editTemplateBody } : x));
                          setEditingTemplate(null);
                        } catch { alert('Erro ao salvar template'); }
                        setSavingTemplate(false);
                      }} disabled={savingTemplate}
                        className="p-1 rounded hover:bg-green-500/10 text-green-500 transition-colors">
                        {savingTemplate ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                      </button>
                    ) : (
                      <button onClick={() => {
                        setEditingTemplate(t.id);
                        setEditTemplateBody(t.body);
                        setEditTemplateName(t.name);
                      }}
                        className="p-1 rounded hover:bg-th-border/50 text-th-secondary transition-colors">
                        <Edit2 size={14} />
                      </button>
                    )}
                    {editingTemplate === t.id && (
                      <button onClick={() => setEditingTemplate(null)}
                        className="p-1 rounded hover:bg-th-border/50 text-th-secondary transition-colors">
                        <X size={14} />
                      </button>
                    )}
                  </div>
                </div>
                <span className="text-[10px] text-th-secondary">{t.slug} • {categoryLabels[t.category] || t.category}</span>
                {editingTemplate === t.id ? (
                  <textarea value={editTemplateBody} onChange={e => setEditTemplateBody(e.target.value)}
                    rows={Math.max(6, editTemplateBody.split('\n').length + 2)}
                    className="w-full text-[11px] text-th-primary bg-th-bg border border-green-500/50 rounded-lg p-2 mt-1.5 whitespace-pre-wrap leading-relaxed outline-none resize-y font-mono" />
                ) : (
                  <pre className="text-[11px] text-th-secondary bg-th-bg rounded-lg p-2 mt-1.5 whitespace-pre-wrap leading-relaxed">{t.body}</pre>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Triggers panel */}
        {mainView === 'triggers' && (
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {[
              { name: 'Confirmações de Reserva', desc: 'Envia confirmação para reservas de hoje', icon: <Calendar size={18} />, fn: triggerReservationConfirmations, color: 'text-blue-500 bg-blue-500/10' },
              { name: 'Lembretes de Pagamento', desc: 'Lembrete para faturas nos próximos 3 dias', icon: <Bell size={18} />, fn: triggerPaymentReminders, color: 'text-yellow-500 bg-yellow-500/10' },
              { name: 'Alertas de Atraso', desc: 'Notifica clientes com faturas vencidas', icon: <AlertTriangle size={18} />, fn: triggerOverdueAlerts, color: 'text-red-500 bg-red-500/10' },
            ].map(t => (
              <div key={t.name} className="bg-th-bg rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${t.color}`}>{t.icon}</div>
                  <div>
                    <p className="text-xs font-bold text-th-primary">{t.name}</p>
                    <p className="text-[10px] text-th-secondary">{t.desc}</p>
                  </div>
                </div>
                <button onClick={() => handleTrigger(t.name, t.fn)} disabled={triggerLoading === t.name}
                  className="w-full py-2 bg-green-500 text-white rounded-lg text-xs font-medium hover:bg-green-600 disabled:opacity-50 flex items-center justify-center gap-1.5 transition-colors">
                  {triggerLoading === t.name ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
                  Executar
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* RIGHT PANEL — CHAT */}
      <div className="flex-1 flex flex-col bg-th-bg min-w-0">
        {/* New message dialog */}
        {showNewMsg ? (
          <>
            <div className="px-5 py-3 bg-th-surface border-b border-th-border flex items-center gap-3">
              <button onClick={() => setShowNewMsg(false)} className="p-1 hover:bg-th-border/50 rounded-lg">
                <ArrowLeft size={18} className="text-th-secondary" />
              </button>
              <h2 className="text-sm font-bold text-th-primary">Nova mensagem</h2>
            </div>
            <div className="px-5 py-3 border-b border-th-border bg-th-surface">
              <input value={newMsgPhone} onChange={e => setNewMsgPhone(e.target.value)}
                placeholder="Telefone (ex: 11999887766)"
                className="w-full bg-th-bg border border-th-border rounded-lg px-3 py-2 text-sm text-th-primary placeholder:text-th-secondary/50" />
            </div>
            <div className="flex-1" />
            <form onSubmit={handleSend} className="px-4 py-3 bg-th-surface border-t border-th-border flex gap-2">
              <input value={sendMsg} onChange={e => setSendMsg(e.target.value)}
                placeholder="Escreva uma mensagem..."
                className="flex-1 bg-th-bg rounded-full px-4 py-2.5 text-sm text-th-primary outline-none placeholder:text-th-secondary/50" />
              <button type="submit" disabled={sending || !newMsgPhone || !sendMsg.trim()}
                className="w-10 h-10 bg-green-500 text-white rounded-full flex items-center justify-center hover:bg-green-600 disabled:opacity-40 transition-colors shrink-0">
                {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              </button>
            </form>
          </>
        ) : selectedPhone ? (
          <>
            {/* Chat header */}
            <div className="px-5 py-3 bg-th-surface border-b border-th-border flex items-center gap-3">
              <button onClick={() => setSelectedPhone(null)} className="p-1 hover:bg-th-border/50 rounded-lg lg:hidden">
                <ArrowLeft size={18} className="text-th-secondary" />
              </button>
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
                {selectedConvo?.userName ? selectedConvo.userName.charAt(0).toUpperCase() : <Users size={16} />}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-th-primary truncate">
                  {selectedConvo?.userName || formatPhone(selectedPhone)}
                </p>
                <p className="text-[11px] text-th-secondary">
                  {selectedConvo?.userName ? formatPhone(selectedPhone) : ''}
                  {selectedConvo ? ` · ${selectedConvo.totalMessages} mensagens` : ''}
                </p>
              </div>
              <div className="ml-auto">
                <button onClick={() => loadChat(selectedPhone)} title="Atualizar"
                  className="p-2 rounded-lg hover:bg-th-border/50 text-th-secondary">
                  <RefreshCw size={16} />
                </button>
              </div>
            </div>

            {/* Chat body */}
            <div className="flex-1 overflow-y-auto px-16 py-4 space-y-1"
              style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'6\' height=\'6\' viewBox=\'0 0 6 6\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Crect width=\'1\' height=\'1\' fill=\'%23e0e0e0\' fill-opacity=\'0.15\'/%3E%3C/svg%3E")' }}>
              {groupedMessages.map((group) => (
                <div key={group.date}>
                  {/* Date separator */}
                  <div className="flex items-center justify-center my-3">
                    <span className="bg-th-surface/90 backdrop-blur-sm text-[11px] text-th-secondary px-3 py-1 rounded-lg shadow-sm font-medium">
                      {group.date}
                    </span>
                  </div>
                  {/* Messages */}
                  {group.messages.map((m) => (
                    <div key={m.id} className={`flex mb-1 ${m.direction === 'OUTBOUND' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`relative max-w-[65%] rounded-lg px-3 py-1.5 shadow-sm
                        ${m.direction === 'OUTBOUND'
                          ? 'bg-green-100 dark:bg-green-900/40 rounded-tr-none'
                          : 'bg-white dark:bg-th-surface rounded-tl-none'}`}>
                        {/* Category badge */}
                        {m.category && m.category !== 'RESPONSE' && m.category !== 'CUSTOM' && (
                          <span className="text-[9px] font-semibold text-green-600 dark:text-green-400 uppercase tracking-wider block mb-0.5">
                            {categoryLabels[m.category] || m.category}
                          </span>
                        )}
                        {/* Body */}
                        <p className="text-[13px] text-th-primary whitespace-pre-wrap leading-relaxed break-words">{m.body}</p>
                        {/* Footer */}
                        <div className={`flex items-center gap-1 mt-0.5 ${m.direction === 'OUTBOUND' ? 'justify-end' : ''}`}>
                          <span className="text-[10px] text-th-secondary/70">{msgTime(m.createdAt)}</span>
                          {m.direction === 'OUTBOUND' && msgStatusIcon(m.status)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>

            {/* Chat input */}
            <form onSubmit={handleSend} className="px-4 py-3 bg-th-surface border-t border-th-border flex items-center gap-2">
              <input value={sendMsg} onChange={e => setSendMsg(e.target.value)}
                placeholder="Escreva uma mensagem..."
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(e); } }}
                className="flex-1 bg-th-bg rounded-full px-4 py-2.5 text-sm text-th-primary outline-none placeholder:text-th-secondary/50 border border-th-border focus:border-green-500/50 transition-colors" />
              <button type="submit" disabled={sending || !sendMsg.trim()}
                className="w-10 h-10 bg-green-500 text-white rounded-full flex items-center justify-center hover:bg-green-600 disabled:opacity-40 transition-colors shrink-0">
                {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              </button>
            </form>
          </>
        ) : (
          /* Empty state */
          <div className="flex-1 flex flex-col items-center justify-center gap-4 text-th-secondary">
            <div className="w-24 h-24 rounded-full bg-th-surface border-2 border-th-border flex items-center justify-center">
              <MessageCircle size={40} className="opacity-30" />
            </div>
            <h2 className="text-xl font-light text-th-primary/80">Marina Prize Club</h2>
            <p className="text-sm max-w-sm text-center">
              Selecione uma conversa ou inicie uma nova mensagem para começar.
            </p>
            {stats && (
              <div className="flex gap-6 mt-4 text-xs">
                <div className="text-center">
                  <p className="text-2xl font-bold text-th-primary">{stats.totalSent}</p>
                  <p>Enviadas</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-th-primary">{stats.totalReceived}</p>
                  <p>Recebidas</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-green-500">{stats.todaySent}</p>
                  <p>Hoje</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
