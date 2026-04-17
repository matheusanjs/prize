'use client';

import { useState } from 'react';
import { Mail, ArrowLeft, CheckCircle } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useTheme } from '@/contexts/theme';
import api from '@/services/api';

export default function ForgotPasswordPage() {
  const { theme } = useTheme();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.post('/auth/forgot-password', { email });
      setSent(true);
    } catch {
      setError('Erro ao enviar. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-th-card p-8">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Image src="/logo.png" alt="Prize Club" width={150} height={50}
            className={`h-10 w-auto mx-auto mb-4 ${theme === 'dark' ? 'brightness-0 invert' : ''}`} />
          <h2 className="text-2xl font-black text-th">Recuperar Senha</h2>
          <p className="text-th-muted mt-2 text-sm">Painel Administrativo</p>
        </div>

        <div className="bg-th-surface rounded-2xl border border-th p-8 shadow-xl">
          {sent ? (
            <div className="text-center">
              <CheckCircle size={48} className="text-primary-500 mx-auto mb-4" />
              <h3 className="text-lg font-bold text-th mb-2">E-mail enviado!</h3>
              <p className="text-th-muted text-sm mb-6 leading-relaxed">
                Se o e-mail estiver cadastrado, você receberá um link para redefinir sua senha. Verifique sua caixa de entrada e spam.
              </p>
              <Link href="/login" className="inline-flex items-center gap-2 text-primary-500 hover:text-primary-400 text-sm font-semibold transition">
                <ArrowLeft size={16} /> Voltar ao login
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <p className="text-th-muted text-sm leading-relaxed">
                Digite seu e-mail e enviaremos um link para redefinir sua senha.
              </p>

              {error && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-2xl text-sm text-red-400">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-th-secondary mb-1.5">E-mail</label>
                <div className="relative">
                  <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-th-muted pointer-events-none" />
                  <input
                    type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@prizeclube.com" required
                    className="w-full pl-10 pr-4 py-3 rounded-2xl input-th border focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500/50 text-sm transition placeholder:text-th-muted"
                  />
                </div>
              </div>

              <button type="submit" disabled={loading}
                className="w-full bg-gradient-to-r from-primary-500 to-orange-400 text-white py-3 rounded-2xl font-bold hover:shadow-lg hover:shadow-primary-500/25 transition-all disabled:opacity-50">
                {loading ? 'Enviando...' : 'Enviar link de redefinição'}
              </button>

              <div className="text-center">
                <Link href="/login" className="inline-flex items-center gap-1.5 text-primary-500 hover:text-primary-400 text-sm font-medium transition">
                  <ArrowLeft size={14} /> Voltar ao login
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
