'use client';

import { useState, useEffect } from 'react';
import {
  Mail, Send, Server, CheckCircle, XCircle, Loader2,
  Shield, Globe, AlertTriangle, RefreshCw, Zap,
  Clock, FileText, CreditCard, Bell, KeyRound,
  ChevronRight, ArrowRight, Activity,
} from 'lucide-react';
import api from '@/services/api';

interface MailSettings {
  host: string; port: string; user: string; from: string; secure: boolean; configured: boolean;
}
interface DnsRecord {
  name: string; status: 'ok' | 'warning' | 'error'; value: string; detail: string;
}

const statusColors = { ok: 'text-green-500', warning: 'text-amber-500', error: 'text-red-500' };
const statusBg = { ok: 'bg-green-500/10', warning: 'bg-amber-500/10', error: 'bg-red-500/10' };
const statusIcon = { ok: CheckCircle, warning: AlertTriangle, error: XCircle };

const features = [
  { icon: KeyRound, title: 'Redefinição de Senha', desc: 'Link seguro enviado via "Esqueci minha senha"', color: 'from-blue-500 to-cyan-500' },
  { icon: CreditCard, title: 'Nova Fatura / Cobrança', desc: 'E-mail automático com dados e QR Code PIX', color: 'from-green-500 to-emerald-500' },
  { icon: Bell, title: 'Lembrete de Pagamento', desc: '3 dias antes do vencimento (automação diária 9h)', color: 'from-amber-500 to-orange-500' },
  { icon: AlertTriangle, title: 'Fatura Vencida', desc: 'Notificação para faturas em atraso (diário 10h)', color: 'from-red-500 to-rose-500' },
  { icon: FileText, title: 'Confirmação de Reserva', desc: 'Detalhes da reserva enviados ao cliente', color: 'from-violet-500 to-purple-500' },
  { icon: Zap, title: 'Boas-vindas', desc: 'E-mail de boas-vindas para novos clientes', color: 'from-pink-500 to-rose-500' },
];

export default function EmailPage() {
  const [settings, setSettings] = useState<MailSettings | null>(null);
  const [dns, setDns] = useState<DnsRecord[]>([]);
  const [testEmail, setTestEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [dnsLoading, setDnsLoading] = useState(true);

  useEffect(() => {
    api.get('/mail/settings').then(r => setSettings(r.data)).catch(() => setSettings(null)).finally(() => setLoading(false));
    loadDns();
  }, []);

  const loadDns = () => {
    setDnsLoading(true);
    api.get('/mail/dns').then(r => setDns(r.data || [])).catch(() => setDns([])).finally(() => setDnsLoading(false));
  };

  const handleTestEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testEmail) return;
    setSending(true); setTestResult(null);
    try { const { data } = await api.post('/mail/test', { to: testEmail }); setTestResult(data); }
    catch { setTestResult({ success: false, message: 'Erro ao enviar e-mail de teste' }); }
    finally { setSending(false); }
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="animate-spin text-primary-500" size={32} /></div>;
  }

  const dnsOk = dns.filter(d => d.status === 'ok').length;
  const dnsTotal = dns.length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-gradient-to-br from-primary-500 to-orange-400 rounded-2xl flex items-center justify-center shadow-lg shadow-primary-500/20">
            <Mail className="text-white" size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-th">E-mail</h1>
            <p className="text-th-muted text-xs">Sistema de envio de e-mails transacionais</p>
          </div>
        </div>
        {settings?.configured && (
          <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/20 rounded-xl px-3 py-2">
            <Activity size={14} className="text-green-500" />
            <span className="text-xs font-bold text-green-500">Sistema Ativo</span>
          </div>
        )}
      </div>

      {/* Top cards grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* SMTP Status card */}
        <div className="bg-th-card rounded-2xl border border-th p-5">
          <div className="flex items-center gap-2 mb-4">
            <Server size={16} className="text-th-muted" />
            <h3 className="text-xs font-bold text-th-muted uppercase tracking-wider">Servidor SMTP</h3>
          </div>
          {settings?.configured ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-sm font-bold text-green-500">Conectado</span>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-th-muted">Host</span>
                  <span className="text-th font-mono font-bold">{settings.host}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-th-muted">Porta</span>
                  <span className="text-th font-mono font-bold">{settings.port}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-th-muted">Autenticação</span>
                  <span className="text-th font-bold">{settings.user}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-th-muted">Criptografia</span>
                  <span className="text-th font-bold">{settings.secure ? 'SSL/TLS' : 'STARTTLS'}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-4">
              <XCircle size={24} className="text-red-400 mx-auto mb-2" />
              <p className="text-sm font-bold text-red-400">Não configurado</p>
            </div>
          )}
        </div>

        {/* Remetente */}
        <div className="bg-th-card rounded-2xl border border-th p-5">
          <div className="flex items-center gap-2 mb-4">
            <Mail size={16} className="text-th-muted" />
            <h3 className="text-xs font-bold text-th-muted uppercase tracking-wider">Remetente</h3>
          </div>
          <div className="space-y-3">
            <div className="bg-th-surface rounded-xl p-3">
              <p className="text-[10px] text-th-muted uppercase font-bold">From</p>
              <p className="text-sm text-th font-medium mt-0.5 break-all">{settings?.from || '—'}</p>
            </div>
            <div className="bg-th-surface rounded-xl p-3">
              <p className="text-[10px] text-th-muted uppercase font-bold">Domínio</p>
              <p className="text-sm text-th font-bold mt-0.5">marinaprizeclub.com</p>
            </div>
          </div>
        </div>

        {/* DNS Score */}
        <div className="bg-th-card rounded-2xl border border-th p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Shield size={16} className="text-th-muted" />
              <h3 className="text-xs font-bold text-th-muted uppercase tracking-wider">Reputação DNS</h3>
            </div>
            <button onClick={loadDns} disabled={dnsLoading} className="p-1.5 rounded-lg hover:bg-th-hover transition text-th-muted">
              <RefreshCw size={14} className={dnsLoading ? 'animate-spin' : ''} />
            </button>
          </div>
          {dnsLoading ? (
            <div className="flex items-center justify-center py-6"><Loader2 size={20} className="animate-spin text-th-muted" /></div>
          ) : (
            <div className="space-y-3">
              <div className="text-center">
                <p className={`text-3xl font-black ${dnsOk === dnsTotal ? 'text-green-500' : dnsOk >= 2 ? 'text-amber-500' : 'text-red-500'}`}>
                  {dnsOk}/{dnsTotal}
                </p>
                <p className="text-[10px] text-th-muted uppercase font-bold mt-0.5">Registros OK</p>
              </div>
              <div className="space-y-1.5">
                {dns.map((r) => {
                  const Icon = statusIcon[r.status];
                  return (
                    <div key={r.name} className={`flex items-center gap-2 ${statusBg[r.status]} rounded-lg px-3 py-1.5`}>
                      <Icon size={12} className={statusColors[r.status]} />
                      <span className="text-xs font-bold text-th flex-1">{r.name}</span>
                      <span className={`text-[10px] font-bold ${statusColors[r.status]}`}>
                        {r.status === 'ok' ? 'OK' : r.status === 'warning' ? 'AVISO' : 'ERRO'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* DNS Details */}
      {dns.length > 0 && (
        <div className="bg-th-card rounded-2xl border border-th p-5">
          <div className="flex items-center gap-2 mb-4">
            <Globe size={16} className="text-th-muted" />
            <h3 className="text-xs font-bold text-th-muted uppercase tracking-wider">Detalhes dos Registros DNS</h3>
          </div>
          <div className="space-y-2">
            {dns.map((r) => {
              const Icon = statusIcon[r.status];
              return (
                <div key={r.name} className="bg-th-surface rounded-xl p-4">
                  <div className="flex items-start gap-3">
                    <div className={`w-8 h-8 rounded-lg ${statusBg[r.status]} flex items-center justify-center flex-shrink-0`}>
                      <Icon size={14} className={statusColors[r.status]} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-th">{r.name}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusBg[r.status]} ${statusColors[r.status]}`}>
                          {r.status === 'ok' ? 'CONFIGURADO' : r.status === 'warning' ? 'ATENÇÃO' : 'FALHA'}
                        </span>
                      </div>
                      <p className="text-xs text-th-muted mt-0.5">{r.detail}</p>
                      {r.value && <p className="text-xs font-mono text-th-secondary mt-1 break-all bg-th-card rounded-lg px-2 py-1">{r.value}</p>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Test Email */}
      <div className="bg-th-card rounded-2xl border border-th p-5">
        <div className="flex items-center gap-2 mb-4">
          <Send size={16} className="text-th-muted" />
          <h3 className="text-xs font-bold text-th-muted uppercase tracking-wider">Enviar E-mail de Teste</h3>
        </div>
        <form onSubmit={handleTestEmail} className="flex gap-3">
          <input
            type="email" value={testEmail} onChange={e => setTestEmail(e.target.value)}
            placeholder="seu@email.com" required
            className="flex-1 px-4 py-2.5 rounded-xl bg-th-surface border border-th text-sm text-th outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500/50 transition placeholder:text-th-muted"
          />
          <button type="submit" disabled={sending}
            className="px-5 py-2.5 bg-gradient-to-r from-primary-500 to-orange-400 text-white rounded-xl font-bold text-sm hover:shadow-lg hover:shadow-primary-500/25 transition-all disabled:opacity-50 flex items-center gap-2">
            {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            {sending ? 'Enviando...' : 'Enviar teste'}
          </button>
        </form>
        {testResult && (
          <div className={`mt-3 p-3 rounded-xl text-sm flex items-center gap-2 ${
            testResult.success ? 'bg-green-500/10 border border-green-500/20 text-green-500' : 'bg-red-500/10 border border-red-500/20 text-red-500'
          }`}>
            {testResult.success ? <CheckCircle size={14} /> : <XCircle size={14} />}
            <span className="font-medium">{testResult.message}</span>
          </div>
        )}
      </div>

      {/* Automações Ativas */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Zap size={16} className="text-primary-500" />
          <h3 className="font-bold text-th">Automações de E-mail Ativas</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {features.map((f) => (
            <div key={f.title} className="bg-th-card rounded-2xl border border-th p-4 hover:border-primary-500/20 transition group">
              <div className="flex items-start gap-3">
                <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${f.color} flex items-center justify-center flex-shrink-0 shadow-lg`}>
                  <f.icon size={16} className="text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-th">{f.title}</p>
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                  </div>
                  <p className="text-xs text-th-muted mt-0.5 leading-relaxed">{f.desc}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
