'use client';

import { useState, useEffect } from 'react';
import { UserPlus, Eye, EyeOff, ArrowLeft, Check, AlertCircle, Mail, Lock, User, Phone, CreditCard } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { registerUser } from '@/services/api';
import { useAuth } from '@/contexts/auth';

function formatCPF(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export default function CadastroPage() {
  const { login } = useAuth();
  const [form, setForm] = useState({
    name: '', email: '', phone: '', cpfCnpj: '', password: '', confirmPassword: '',
  });
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const passwordMatch = form.password === form.confirmPassword;
  const passwordStrong = form.password.length >= 6;

  // Kill scroll/bounce on iOS for this page
  useEffect(() => {
    const prevent = (e: TouchEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      // Allow scroll inside the form container
      const scrollable = (e.target as HTMLElement)?.closest('.cadastro-scroll');
      if (scrollable) return;
      e.preventDefault();
    };
    document.addEventListener('touchmove', prevent, { passive: false });
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    const prevBodyBg = document.body.style.background;
    const prevHtmlBg = document.documentElement.style.background;
    document.body.style.background = '#0D1B2A';
    document.documentElement.style.background = '#0D1B2A';
    return () => {
      document.removeEventListener('touchmove', prevent);
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
      document.body.style.background = prevBodyBg;
      document.documentElement.style.background = prevHtmlBg;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!passwordMatch) {
      setError('As senhas não coincidem');
      return;
    }

    setLoading(true);
    try {
      const payload: Record<string, string> = {
        name: form.name,
        email: form.email,
        password: form.password,
      };
      if (form.phone) payload.phone = form.phone.replace(/\D/g, '');
      if (form.cpfCnpj) payload.cpfCnpj = form.cpfCnpj.replace(/\D/g, '');

      await registerUser(payload as any);
      setSuccess(true);

      // Auto-login after registration
      setTimeout(async () => {
        try {
          await login(form.email, form.password);
        } catch {
          window.location.href = '/login';
        }
      }, 1500);
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      if (typeof msg === 'string') {
        if (msg.includes('already exists') || msg.includes('já existe') || msg.includes('Conflict')) {
          setError('Já existe uma conta com este email ou CPF.');
        } else {
          setError(msg);
        }
      } else if (Array.isArray(msg)) {
        setError(msg[0]);
      } else {
        setError('Erro ao criar conta. Tente novamente.');
      }
    }
    setLoading(false);
  };

  const inputStyle: React.CSSProperties = {
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
    boxSizing: 'border-box' as const,
    transition: 'border-color 0.2s',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 12,
    fontWeight: 600,
    color: 'rgba(255,255,255,0.55)',
    marginBottom: 8,
    letterSpacing: '0.04em',
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.style.borderColor = 'rgba(0,177,181,0.5)';
  };
  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.style.borderColor = 'rgba(255,255,255,0.12)';
  };

  if (success) {
    return (
      <div
        style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'linear-gradient(160deg, #0D1B2A 0%, #003C3D 50%, #0D1B2A 100%)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: '0 24px',
        }}
      >
        <div style={{
          width: 80, height: 80, borderRadius: '50%',
          background: 'rgba(16,185,129,0.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 24,
        }}>
          <Check size={40} color="#34D399" />
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 900, color: '#F1F5F9', marginBottom: 8 }}>Conta Criada!</h1>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', textAlign: 'center', lineHeight: 1.5 }}>
          Bem-vindo à Prize Club! Entrando automaticamente...
        </p>
        <div style={{ marginTop: 20 }}>
          <div style={{
            width: 24, height: 24,
            border: '2px solid rgba(0,177,181,0.3)',
            borderTopColor: '#00B1B5',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }} />
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'linear-gradient(160deg, #0D1B2A 0%, #003C3D 50%, #0D1B2A 100%)',
        display: 'flex', flexDirection: 'column',
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

      {/* Scrollable content */}
      <div className="cadastro-scroll" style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '0 24px' }}>
        {/* Back to login */}
        <div style={{ paddingTop: 16, marginBottom: 24 }}>
          <Link
            href="/login"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              color: 'rgba(255,255,255,0.5)', textDecoration: 'none', fontSize: 14, fontWeight: 500,
            }}
          >
            <ArrowLeft size={16} />
            Voltar ao login
          </Link>
        </div>

        {/* Logo area */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <Image
            src="/logo.png"
            alt="Prize Clube"
            width={200}
            height={75}
            style={{ height: 52, width: 'auto', margin: '0 auto 10px', filter: 'brightness(0) invert(1)' }}
            priority
          />
          <h1 style={{ fontSize: 20, fontWeight: 900, color: '#F1F5F9', marginBottom: 4 }}>Crie Sua Conta</h1>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)' }}>Faça parte da família Prize Club</p>
        </div>

        {/* Card */}
        <div style={{
          width: '100%', maxWidth: 380, margin: '0 auto',
          background: 'rgba(255,255,255,0.05)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.10)',
          borderRadius: 24,
          padding: '28px 24px',
          boxShadow: '0 24px 60px rgba(0,0,0,0.4)',
        }}>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {error && (
              <div style={{
                background: 'rgba(239,68,68,0.12)',
                border: '1px solid rgba(239,68,68,0.25)',
                color: '#FCA5A5',
                fontSize: 13,
                padding: '12px 16px',
                borderRadius: 12,
                lineHeight: 1.4,
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8,
              }}>
                <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
                <span>{error}</span>
              </div>
            )}

            {/* Nome */}
            <div>
              <label style={labelStyle}>NOME COMPLETO *</label>
              <div style={{ position: 'relative' }}>
                <User size={16} color="rgba(255,255,255,0.3)" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="Seu nome completo"
                  autoComplete="name"
                  style={inputStyle}
                  onFocus={handleFocus}
                  onBlur={handleBlur}
                />
              </div>
            </div>

            {/* Email */}
            <div>
              <label style={labelStyle}>E-MAIL *</label>
              <div style={{ position: 'relative' }}>
                <Mail size={16} color="rgba(255,255,255,0.3)" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                  placeholder="seu@email.com"
                  autoComplete="email"
                  style={inputStyle}
                  onFocus={handleFocus}
                  onBlur={handleBlur}
                />
              </div>
            </div>

            {/* Phone + CPF */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={labelStyle}>TELEFONE</label>
                <div style={{ position: 'relative' }}>
                  <Phone size={16} color="rgba(255,255,255,0.3)" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                  <input
                    type="text"
                    value={form.phone}
                    onChange={e => setForm({ ...form, phone: formatPhone(e.target.value) })}
                    placeholder="(22) 99999-9999"
                    autoComplete="tel"
                    style={{ ...inputStyle, fontSize: 13 }}
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                  />
                </div>
              </div>
              <div>
                <label style={labelStyle}>CPF</label>
                <div style={{ position: 'relative' }}>
                  <CreditCard size={16} color="rgba(255,255,255,0.3)" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                  <input
                    type="text"
                    value={form.cpfCnpj}
                    onChange={e => setForm({ ...form, cpfCnpj: formatCPF(e.target.value) })}
                    placeholder="000.000.000-00"
                    style={{ ...inputStyle, fontSize: 13 }}
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                  />
                </div>
              </div>
            </div>

            {/* Senha */}
            <div>
              <label style={labelStyle}>SENHA *</label>
              <div style={{ position: 'relative' }}>
                <Lock size={16} color="rgba(255,255,255,0.3)" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                <input
                  type={showPass ? 'text' : 'password'}
                  required
                  minLength={6}
                  value={form.password}
                  onChange={e => setForm({ ...form, password: e.target.value })}
                  placeholder="Mínimo 6 caracteres"
                  autoComplete="new-password"
                  style={{ ...inputStyle, paddingRight: 48 }}
                  onFocus={handleFocus}
                  onBlur={handleBlur}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  style={{
                    position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer', padding: 4,
                    color: 'rgba(255,255,255,0.35)',
                  }}
                >
                  {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {form.password && (
                <p style={{ fontSize: 11, marginTop: 6, color: passwordStrong ? '#34D399' : '#FBBF24' }}>
                  {passwordStrong ? '✓ Senha válida' : 'Mínimo 6 caracteres'}
                </p>
              )}
            </div>

            {/* Confirmar senha */}
            <div>
              <label style={labelStyle}>CONFIRMAR SENHA *</label>
              <div style={{ position: 'relative' }}>
                <Lock size={16} color="rgba(255,255,255,0.3)" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                <input
                  type={showPass ? 'text' : 'password'}
                  required
                  value={form.confirmPassword}
                  onChange={e => setForm({ ...form, confirmPassword: e.target.value })}
                  placeholder="Repita sua senha"
                  autoComplete="new-password"
                  style={{
                    ...inputStyle,
                    borderColor: form.confirmPassword && !passwordMatch ? 'rgba(239,68,68,0.5)' : undefined,
                  }}
                  onFocus={handleFocus}
                  onBlur={handleBlur}
                />
              </div>
              {form.confirmPassword && !passwordMatch && (
                <p style={{ fontSize: 11, marginTop: 6, color: '#F87171' }}>As senhas não coincidem</p>
              )}
            </div>

            {/* Botão */}
            <button
              type="submit"
              disabled={loading || !passwordMatch || !passwordStrong}
              style={{
                width: '100%',
                padding: '15px 0',
                borderRadius: 14,
                background: (loading || !passwordMatch || !passwordStrong)
                  ? 'rgba(0,117,119,0.35)'
                  : 'linear-gradient(135deg, #007577 0%, #33AEB2 100%)',
                color: '#fff',
                fontWeight: 700,
                fontSize: 15,
                letterSpacing: '0.02em',
                border: 'none',
                cursor: (loading || !passwordMatch || !passwordStrong) ? 'not-allowed' : 'pointer',
                transition: 'opacity 0.2s, transform 0.1s',
                boxShadow: (loading || !passwordMatch || !passwordStrong) ? 'none' : '0 8px 24px rgba(0,117,119,0.35)',
                marginTop: 4,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
              onMouseDown={e => { if (!loading) e.currentTarget.style.transform = 'scale(0.98)'; }}
              onMouseUp={e => { e.currentTarget.style.transform = 'scale(1)'; }}
            >
              {loading ? (
                <>
                  <div style={{
                    width: 18, height: 18,
                    border: '2px solid rgba(255,255,255,0.3)',
                    borderTopColor: '#fff',
                    borderRadius: '50%',
                    animation: 'spin 0.8s linear infinite',
                  }} />
                  Criando conta...
                </>
              ) : (
                <>
                  <UserPlus size={18} />
                  Criar Minha Conta
                </>
              )}
            </button>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </form>

          {/* Login link */}
          <div style={{ textAlign: 'center', marginTop: 20 }}>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)' }}>
              Já tem uma conta?{' '}
              <Link href="/login" style={{ color: 'rgba(0,177,181,0.9)', fontWeight: 600, textDecoration: 'none' }}>
                Fazer login
              </Link>
            </p>
          </div>
        </div>

        {/* Footer */}
        <p style={{ textAlign: 'center', marginTop: 24, marginBottom: 24, fontSize: 11, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.05em' }}>
          Prize Clube &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
