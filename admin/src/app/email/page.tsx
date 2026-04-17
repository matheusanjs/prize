'use client';

import { useState, useEffect } from 'react';
import { Mail, Send, Server, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import api from '@/services/api';

interface MailSettings {
  host: string;
  port: string;
  user: string;
  from: string;
  secure: boolean;
  configured: boolean;
}

export default function EmailPage() {
  const [settings, setSettings] = useState<MailSettings | null>(null);
  const [testEmail, setTestEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/mail/settings')
      .then(res => setSettings(res.data))
      .catch(() => setSettings(null))
      .finally(() => setLoading(false));
  }, []);

  const handleTestEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testEmail) return;
    setSending(true);
    setTestResult(null);
    try {
      const { data } = await api.post('/mail/test', { to: testEmail });
      setTestResult(data);
    } catch {
      setTestResult({ success: false, message: 'Erro ao enviar e-mail de teste' });
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="animate-spin text-primary-500" size={32} />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 bg-primary-500/15 rounded-2xl flex items-center justify-center">
          <Mail className="text-primary-500" size={20} />
        </div>
        <div>
          <h1 className="text-2xl font-black text-th">E-mail</h1>
          <p className="text-th-muted text-sm">Configuração SMTP e envio de e-mails</p>
        </div>
      </div>

      {/* SMTP Status */}
      <div className="bg-th-surface rounded-2xl border border-th p-6">
        <h2 className="text-lg font-bold text-th mb-4 flex items-center gap-2">
          <Server size={18} />
          Configuração SMTP
        </h2>

        {settings?.configured ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-green-500 mb-4">
              <CheckCircle size={18} />
              <span className="font-semibold text-sm">SMTP configurado</span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-th-muted font-medium mb-1">Servidor</p>
                <p className="text-sm text-th font-mono bg-th-card rounded-xl px-3 py-2">{settings.host}:{settings.port}</p>
              </div>
              <div>
                <p className="text-xs text-th-muted font-medium mb-1">Usuário</p>
                <p className="text-sm text-th font-mono bg-th-card rounded-xl px-3 py-2">{settings.user}</p>
              </div>
              <div>
                <p className="text-xs text-th-muted font-medium mb-1">Remetente</p>
                <p className="text-sm text-th font-mono bg-th-card rounded-xl px-3 py-2">{settings.from}</p>
              </div>
              <div>
                <p className="text-xs text-th-muted font-medium mb-1">SSL/TLS</p>
                <p className="text-sm text-th font-mono bg-th-card rounded-xl px-3 py-2">{settings.secure ? 'Ativo' : 'STARTTLS'}</p>
              </div>
            </div>
            <p className="text-xs text-th-muted mt-3">
              Para alterar, edite as variáveis SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM no arquivo .env do backend e reinicie.
            </p>
          </div>
        ) : (
          <div className="text-center py-8">
            <XCircle size={40} className="text-red-400 mx-auto mb-3" />
            <h3 className="text-th font-bold mb-2">SMTP não configurado</h3>
            <p className="text-th-muted text-sm max-w-md mx-auto leading-relaxed">
              Adicione as variáveis de ambiente abaixo ao arquivo <code className="bg-th-card px-1.5 py-0.5 rounded text-xs">.env</code> do backend:
            </p>
            <div className="mt-4 bg-th-card rounded-xl p-4 text-left font-mono text-xs text-th-secondary max-w-sm mx-auto space-y-1">
              <p>SMTP_HOST=smtp.seudominio.com</p>
              <p>SMTP_PORT=587</p>
              <p>SMTP_USER=noreply@seudominio.com</p>
              <p>SMTP_PASS=sua_senha</p>
              <p>SMTP_SECURE=false</p>
              <p>MAIL_FROM=Marina Prize Club &lt;noreply@seudominio.com&gt;</p>
            </div>
          </div>
        )}
      </div>

      {/* Test Email */}
      <div className="bg-th-surface rounded-2xl border border-th p-6">
        <h2 className="text-lg font-bold text-th mb-4 flex items-center gap-2">
          <Send size={18} />
          Enviar E-mail de Teste
        </h2>

        <form onSubmit={handleTestEmail} className="flex gap-3">
          <input
            type="email"
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
            placeholder="email@destino.com"
            required
            className="flex-1 px-4 py-2.5 rounded-2xl input-th border focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500/50 text-sm transition placeholder:text-th-muted"
          />
          <button
            type="submit"
            disabled={sending}
            className="px-6 py-2.5 bg-gradient-to-r from-primary-500 to-orange-400 text-white rounded-2xl font-bold text-sm hover:shadow-lg hover:shadow-primary-500/25 transition-all disabled:opacity-50 flex items-center gap-2"
          >
            {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            {sending ? 'Enviando...' : 'Enviar teste'}
          </button>
        </form>

        {testResult && (
          <div className={`mt-4 p-3 rounded-2xl text-sm flex items-center gap-2 ${
            testResult.success
              ? 'bg-green-500/10 border border-green-500/20 text-green-400'
              : 'bg-red-500/10 border border-red-500/20 text-red-400'
          }`}>
            {testResult.success ? <CheckCircle size={16} /> : <XCircle size={16} />}
            {testResult.message}
          </div>
        )}
      </div>

      {/* Features Info */}
      <div className="bg-th-surface rounded-2xl border border-th p-6">
        <h2 className="text-lg font-bold text-th mb-4">Funcionalidades de E-mail Ativas</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[
            { title: 'Redefinição de Senha', desc: 'Link enviado automaticamente via "Esqueci minha senha"' },
            { title: 'Nova Fatura', desc: 'E-mail automático ao gerar fatura com dados e PIX' },
            { title: 'Lembrete de Pagamento', desc: 'E-mail 3 dias antes do vencimento (diário às 9h)' },
            { title: 'Fatura Vencida', desc: 'Notificação por e-mail para faturas em atraso (diário às 10h)' },
          ].map((item) => (
            <div key={item.title} className="flex items-start gap-3 bg-th-card rounded-xl p-3.5 border border-th">
              <CheckCircle size={16} className="text-green-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-th">{item.title}</p>
                <p className="text-xs text-th-muted">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
