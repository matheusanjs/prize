'use client';

import { useState, Suspense } from 'react';
import { Lock, Eye, EyeOff, ArrowLeft, CheckCircle } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTheme } from '@/contexts/theme';
import api from '@/services/api';

function ResetPasswordForm() {
  const { theme } = useTheme();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) { setError('A senha deve ter pelo menos 6 caracteres.'); return; }
    if (password !== confirmPassword) { setError('As senhas não coincidem.'); return; }
    if (!token) { setError('Token inválido. Solicite um novo link.'); return; }

    setLoading(true);
    try {
      await api.post('/auth/reset-password', { token, newPassword: password });
      setSuccess(true);
    } catch {
      setError('Token inválido ou expirado. Solicite um novo link.');
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
          <h2 className="text-2xl font-black text-th">Nova Senha</h2>
          <p className="text-th-muted mt-2 text-sm">Painel Administrativo</p>
        </div>

        <div className="bg-th-surface rounded-2xl border border-th p-8 shadow-xl">
          {success ? (
            <div className="text-center">
              <CheckCircle size={48} className="text-primary-500 mx-auto mb-4" />
              <h3 className="text-lg font-bold text-th mb-2">Senha redefinida!</h3>
              <p className="text-th-muted text-sm mb-6 leading-relaxed">
                Sua senha foi alterada com sucesso. Faça login com a nova senha.
              </p>
              <Link href="/login"
                className="inline-block px-8 py-3 bg-gradient-to-r from-primary-500 to-orange-400 text-white rounded-2xl font-bold hover:shadow-lg hover:shadow-primary-500/25 transition-all">
                Ir para Login
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <p className="text-th-muted text-sm leading-relaxed">
                Digite sua nova senha abaixo.
              </p>

              {error && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-2xl text-sm text-red-400">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-th-secondary mb-1.5">Nova Senha</label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-th-muted pointer-events-none" />
                  <input
                    type={showPassword ? 'text' : 'password'} value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres" required minLength={6}
                    className="w-full pl-10 pr-10 py-3 rounded-2xl input-th border focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500/50 text-sm transition placeholder:text-th-muted"
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-th-muted hover:text-th-secondary transition">
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-th-secondary mb-1.5">Confirmar Senha</label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-th-muted pointer-events-none" />
                  <input
                    type={showPassword ? 'text' : 'password'} value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repita a senha" required minLength={6}
                    className="w-full pl-10 pr-4 py-3 rounded-2xl input-th border focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500/50 text-sm transition placeholder:text-th-muted"
                  />
                </div>
              </div>

              <button type="submit" disabled={loading}
                className="w-full bg-gradient-to-r from-primary-500 to-orange-400 text-white py-3 rounded-2xl font-bold hover:shadow-lg hover:shadow-primary-500/25 transition-all disabled:opacity-50">
                {loading ? 'Redefinindo...' : 'Redefinir Senha'}
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

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-th-card text-th-muted">Carregando...</div>}>
      <ResetPasswordForm />
    </Suspense>
  );
}
