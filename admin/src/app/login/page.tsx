'use client';

import { useState } from 'react';
import { Eye, EyeOff, Sun, Moon } from 'lucide-react';
import Image from 'next/image';
import { useAuth } from '@/contexts/auth';
import { useTheme } from '@/contexts/theme';

export default function LoginPage() {
  const { login } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, password);
    } catch {
      setError('E-mail ou senha incorretos');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-th-card">
      {/* Left side - branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-th-surface items-center justify-center p-12 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary-500/10 via-transparent to-primary-500/5" />
        <div className="absolute top-0 right-0 w-96 h-96 bg-primary-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-primary-500/3 rounded-full blur-3xl" />
        <div className="relative z-10 max-w-md">
          <Image src="/logo.png" alt="Prize Club" width={180} height={60} className={`h-12 w-auto mb-8 ${theme === 'dark' ? 'brightness-0 invert' : ''}`} />
          <h1 className="text-4xl font-black text-th mb-3">Gestão completa da <span className="text-gradient">sua marina</span></h1>
          <p className="text-lg text-th-muted mb-10">Plataforma inteligente para controle de cotas, reservas e finanças</p>
          <div className="space-y-4">
            <div className="flex items-center gap-4 bg-th-card rounded-2xl p-4 border border-th">
              <div className="w-10 h-10 bg-primary-500/15 rounded-2xl flex items-center justify-center text-primary-400 text-lg">📊</div>
              <div>
                <p className="text-th font-semibold text-sm">Dashboard em tempo real</p>
                <p className="text-th-muted text-xs">Métricas e KPIs atualizados</p>
              </div>
            </div>
            <div className="flex items-center gap-4 bg-th-card rounded-2xl p-4 border border-th">
              <div className="w-10 h-10 bg-primary-500/15 rounded-2xl flex items-center justify-center text-primary-400 text-lg">🤖</div>
              <div>
                <p className="text-th font-semibold text-sm">IA integrada com Gemini</p>
                <p className="text-th-muted text-xs">Insights automáticos para decisões</p>
              </div>
            </div>
            <div className="flex items-center gap-4 bg-th-card rounded-2xl p-4 border border-th">
              <div className="w-10 h-10 bg-primary-500/15 rounded-2xl flex items-center justify-center text-primary-400 text-lg">🚤</div>
              <div>
                <p className="text-th font-semibold text-sm">Gestão de cotas e reservas</p>
                <p className="text-th-muted text-xs">Controle total da operação</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right side - form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-th-card relative">
        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          className="absolute top-6 right-6 p-2.5 rounded-xl bg-th-surface border border-th text-th-muted hover:text-primary-500 transition"
          title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        <div className="w-full max-w-md">
          <div className="text-center mb-8 lg:hidden">
            <Image src="/logo.png" alt="Prize Club" width={150} height={50} className={`h-10 w-auto mx-auto mb-4 ${theme === 'dark' ? 'brightness-0 invert' : ''}`} />
          </div>
          <div className="text-center mb-8">
            <h2 className="text-3xl font-black text-th">Painel Admin</h2>
            <p className="text-th-muted mt-2">Acesse o painel de administração</p>
          </div>

          <form onSubmit={handleLogin} className="bg-th-surface rounded-2xl border border-th p-8 shadow-xl">
            {error && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-2xl text-sm text-red-400">
                {error}
              </div>
            )}

            <div className="mb-5">
              <label className="block text-sm font-medium text-th-secondary mb-1.5">E-mail</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@prizeclube.com"
                required
                className="w-full px-4 py-3 rounded-2xl input-th border focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500/50 text-sm transition placeholder:text-th-muted"
              />
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-th-secondary mb-1.5">Senha</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full px-4 py-3 rounded-2xl input-th border focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500/50 text-sm pr-10 transition placeholder:text-th-muted"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-th-muted hover:text-th-secondary transition"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div className="flex justify-end -mt-1 mb-4">
              <a href="/forgot-password" className="text-sm text-primary-500 hover:text-primary-400 transition">
                Esqueci minha senha
              </a>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-primary-500 to-orange-400 text-white py-3 rounded-2xl font-bold hover:shadow-lg hover:shadow-primary-500/25 transition-all disabled:opacity-50"
            >
              {loading ? 'Entrando...' : 'Entrar'}
            </button>

            <p className="text-center text-xs text-th-muted mt-6">
              Prize Club &copy; {new Date().getFullYear()} — Painel Administrativo
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
