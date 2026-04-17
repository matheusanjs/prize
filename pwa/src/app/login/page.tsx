'use client';

import { useState } from 'react';
import { Eye, EyeOff, Mail, Lock } from 'lucide-react';
import Image from 'next/image';
import { useAuth } from '@/contexts/auth';

export default function LoginPage() {
  const { login } = useAuth();
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
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'E-mail ou senha incorretos';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'linear-gradient(160deg, #0D1B2A 0%, #003C3D 50%, #0D1B2A 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 24px',
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        overflow: 'hidden',
        boxSizing: 'border-box',
      }}
    >
      {/* Decorative circles */}
      <div style={{
        position: 'absolute', top: '-80px', right: '-80px',
        width: 280, height: 280, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(0,117,119,0.18) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', bottom: '-60px', left: '-60px',
        width: 220, height: 220, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(0,117,119,0.12) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      {/* Logo area */}
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <Image
          src="/logo.png"
          alt="Prize Clube"
          width={200}
          height={75}
          style={{ height: 64, width: 'auto', margin: '0 auto 12px', filter: 'brightness(0) invert(1)' }}
          priority
        />
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 500 }}>
          Portal do Cliente
        </p>
      </div>

      {/* Card */}
      <div style={{
        width: '100%', maxWidth: 380,
        background: 'rgba(255,255,255,0.05)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid rgba(255,255,255,0.10)',
        borderRadius: 24,
        padding: '32px 28px',
        boxShadow: '0 24px 60px rgba(0,0,0,0.4)',
      }}>
        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {error && (
            <div style={{
              background: 'rgba(239,68,68,0.12)',
              border: '1px solid rgba(239,68,68,0.25)',
              color: '#FCA5A5',
              fontSize: 13,
              padding: '12px 16px',
              borderRadius: 12,
              lineHeight: 1.4,
            }}>
              {error}
            </div>
          )}

          {/* Email */}
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.55)', marginBottom: 8, letterSpacing: '0.04em' }}>
              E-MAIL
            </label>
            <div style={{ position: 'relative' }}>
              <Mail size={16} color="rgba(255,255,255,0.3)" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                required
                autoComplete="email"
                style={{
                  width: '100%',
                  paddingLeft: 40,
                  paddingRight: 16,
                  paddingTop: 14,
                  paddingBottom: 14,
                  borderRadius: 14,
                  background: 'rgba(255,255,255,0.07)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  color: '#F1F5F9',
                  fontSize: 15,
                  outline: 'none',
                  boxSizing: 'border-box',
                  transition: 'border-color 0.2s',
                }}
                onFocus={e => (e.target.style.borderColor = 'rgba(0,177,181,0.5)')}
                onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,0.12)')}
              />
            </div>
          </div>

          {/* Senha */}
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.55)', marginBottom: 8, letterSpacing: '0.04em' }}>
              SENHA
            </label>
            <div style={{ position: 'relative' }}>
              <Lock size={16} color="rgba(255,255,255,0.3)" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
                style={{
                  width: '100%',
                  paddingLeft: 40,
                  paddingRight: 48,
                  paddingTop: 14,
                  paddingBottom: 14,
                  borderRadius: 14,
                  background: 'rgba(255,255,255,0.07)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  color: '#F1F5F9',
                  fontSize: 15,
                  outline: 'none',
                  boxSizing: 'border-box',
                  transition: 'border-color 0.2s',
                }}
                onFocus={e => (e.target.style.borderColor = 'rgba(0,177,181,0.5)')}
                onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,0.12)')}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer', padding: 4,
                  color: 'rgba(255,255,255,0.35)',
                }}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {/* Botão */}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '15px 0',
              borderRadius: 14,
              background: loading ? 'rgba(0,117,119,0.5)' : 'linear-gradient(135deg, #007577 0%, #33AEB2 100%)',
              color: '#fff',
              fontWeight: 700,
              fontSize: 15,
              letterSpacing: '0.02em',
              border: 'none',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'opacity 0.2s, transform 0.1s',
              boxShadow: loading ? 'none' : '0 8px 24px rgba(0,117,119,0.35)',
              marginTop: 4,
            }}
            onMouseDown={e => { if (!loading) (e.currentTarget.style.transform = 'scale(0.98)'); }}
            onMouseUp={e => { (e.currentTarget.style.transform = 'scale(1)'); }}
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>

      {/* Footer */}
      <p style={{ marginTop: 32, fontSize: 11, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.05em' }}>
        Prize Clube &copy; {new Date().getFullYear()}
      </p>
    </div>
  );
}
