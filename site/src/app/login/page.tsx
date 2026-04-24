'use client';

import { useState } from 'react';
import { Eye, EyeOff, Sun, Moon } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { loginUser } from '@/services/api';
import { useTheme } from '@/components/ThemeProvider';

export default function LoginPage() {
  const { theme, toggleTheme } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { data } = await loginUser({ email, password });
      const { accessToken, refreshToken, user } = data;

      if (user.role === 'ADMIN' || user.role === 'OPERATOR') {
        const adminUrl = process.env.NEXT_PUBLIC_ADMIN_URL || 'http://localhost:3001';
        window.location.href = `${adminUrl}/dashboard?token=${accessToken}&refreshToken=${refreshToken}`;
      } else if (user.role === 'WAITER') {
        const garcomUrl = process.env.NEXT_PUBLIC_GARCOM_URL || (process.env.NEXT_PUBLIC_ADMIN_URL || 'http://localhost:3001').replace(':3001', ':3004');
        window.location.href = `${garcomUrl}/?token=${accessToken}&refreshToken=${refreshToken}`;
      } else {
        const pwaUrl = process.env.NEXT_PUBLIC_PWA_URL || 'http://localhost:3002';
        window.location.href = `${pwaUrl}/?token=${accessToken}&refreshToken=${refreshToken}`;
      }
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      if (msg === 'Invalid credentials' || msg === 'Credenciais inválidas') {
        setError('Email ou senha incorretos');
      } else if (typeof msg === 'string') {
        setError(msg);
      } else {
        setError('Erro ao fazer login. Tente novamente.');
      }
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex bg-white dark:bg-secondary-900">
      {/* Left side - branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gray-50 dark:bg-secondary-800 items-center justify-center p-12 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary-500/10 via-transparent to-primary-500/5" />
        <div className="absolute top-0 right-0 w-96 h-96 bg-primary-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-primary-500/3 rounded-full blur-3xl" />
        <div className="relative z-10 max-w-md">
          <Image src="/logo.png" alt="Prize Club" width={180} height={60} className={`h-12 w-auto mb-8 ${theme === 'dark' ? 'brightness-0 invert' : ''}`} />
          <h1 className="text-4xl font-black text-foreground mb-3">Sua marina na <span className="text-primary-500">palma da mão</span></h1>
          <p className="text-lg text-secondary-500 dark:text-secondary-400 mb-10">Tudo que você precisa para aproveitar ao máximo sua experiência náutica</p>
          <div className="space-y-4">
            <div className="flex items-center gap-4 bg-white dark:bg-secondary-900 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-secondary-700">
              <div className="w-10 h-10 bg-blue-500/15 rounded-2xl flex items-center justify-center text-lg shrink-0">🚤</div>
              <div>
                <p className="text-foreground font-semibold text-sm">Reservas online</p>
                <p className="text-secondary-500 dark:text-secondary-400 text-xs">Agende seu jet ski a qualquer hora</p>
              </div>
            </div>
            <div className="flex items-center gap-4 bg-white dark:bg-secondary-900 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-secondary-700">
              <div className="w-10 h-10 bg-emerald-500/15 rounded-2xl flex items-center justify-center text-lg shrink-0">🛡️</div>
              <div>
                <p className="text-foreground font-semibold text-sm">Guardaria premium 24h</p>
                <p className="text-secondary-500 dark:text-secondary-400 text-xs">Seu jet ski protegido e sempre pronto</p>
              </div>
            </div>
            <div className="flex items-center gap-4 bg-white dark:bg-secondary-900 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-secondary-700">
              <div className="w-10 h-10 bg-amber-500/15 rounded-2xl flex items-center justify-center text-lg shrink-0">📱</div>
              <div>
                <p className="text-foreground font-semibold text-sm">Acompanhe pelo app</p>
                <p className="text-secondary-500 dark:text-secondary-400 text-xs">Checklists, combustível, faturas e mais</p>
              </div>
            </div>
            <div className="flex items-center gap-4 bg-white dark:bg-secondary-900 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-secondary-700">
              <div className="w-10 h-10 bg-purple-500/15 rounded-2xl flex items-center justify-center text-lg shrink-0">🍽️</div>
              <div>
                <p className="text-foreground font-semibold text-sm">Gastronomia & bar</p>
                <p className="text-secondary-500 dark:text-secondary-400 text-xs">Benefícios exclusivos para cotistas</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right side - form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-white dark:bg-secondary-900 relative">
        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          className="absolute top-6 right-6 p-2.5 rounded-xl bg-gray-100 dark:bg-secondary-800 border border-gray-200 dark:border-secondary-700 text-secondary-500 dark:text-secondary-400 hover:text-primary-500 transition"
          title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        <div className="w-full max-w-md">
          <div className="text-center mb-8 lg:hidden">
            <Image src="/logo.png" alt="Prize Club" width={150} height={50} className={`h-10 w-auto mx-auto mb-4 ${theme === 'dark' ? 'brightness-0 invert' : ''}`} />
          </div>
          <div className="text-center mb-8">
            <h2 className="text-3xl font-black text-foreground">Bem-vindo de volta!</h2>
            <p className="text-secondary-500 dark:text-secondary-400 mt-2">Entre na sua conta Prize Club</p>
          </div>

          <form onSubmit={handleSubmit} className="bg-gray-50 dark:bg-secondary-800 rounded-2xl border border-gray-200 dark:border-secondary-700 p-8 shadow-xl">
            {error && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-2xl text-sm text-red-500 dark:text-red-400">
                {error}
              </div>
            )}

            <div className="mb-5">
              <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1.5">E-mail</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                required
                className="w-full px-4 py-3 rounded-2xl bg-white dark:bg-secondary-900 border border-gray-200 dark:border-secondary-700 text-foreground focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500/50 text-sm transition placeholder:text-secondary-400 dark:placeholder:text-secondary-500"
              />
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1.5">Senha</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={6}
                  className="w-full px-4 py-3 rounded-2xl bg-white dark:bg-secondary-900 border border-gray-200 dark:border-secondary-700 text-foreground focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500/50 text-sm pr-10 transition placeholder:text-secondary-400 dark:placeholder:text-secondary-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-secondary-400 hover:text-secondary-600 dark:hover:text-secondary-300 transition"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-primary-500 to-orange-400 text-white py-3 rounded-2xl font-bold hover:shadow-lg hover:shadow-primary-500/25 transition-all disabled:opacity-50"
            >
              {loading ? 'Entrando...' : 'Entrar'}
            </button>

            <div className="text-center mt-6">
              <p className="text-secondary-500 dark:text-secondary-400 text-sm">
                Não tem uma conta?{' '}
                <Link href="/cadastro" className="text-primary-500 font-semibold hover:text-primary-400 transition-colors">
                  Cadastre-se grátis
                </Link>
              </p>
            </div>

            <p className="text-center text-xs text-secondary-400 dark:text-secondary-500 mt-4">
              Prize Club &copy; {new Date().getFullYear()} — Marina Prize Club
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
