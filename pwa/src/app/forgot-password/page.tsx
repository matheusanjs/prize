'use client';

import { useState } from 'react';
import { Mail, ArrowLeft, CheckCircle } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import api from '@/services/api';

export default function ForgotPasswordPage() {
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
    <div
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'linear-gradient(160deg, #0D1B2A 0%, #003C3D 50%, #0D1B2A 100%)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '0 24px',
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        overflow: 'hidden', boxSizing: 'border-box',
      }}
    >
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <Image src="/logo.png" alt="Prize Clube" width={200} height={75}
          style={{ height: 64, width: 'auto', margin: '0 auto 12px', filter: 'brightness(0) invert(1)' }} priority />
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 500 }}>
          Recuperar Senha
        </p>
      </div>

      <div style={{
        width: '100%', maxWidth: 380,
        background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid rgba(255,255,255,0.10)', borderRadius: 24, padding: '32px 28px',
        boxShadow: '0 24px 60px rgba(0,0,0,0.4)',
      }}>
        {sent ? (
          <div style={{ textAlign: 'center' }}>
            <CheckCircle size={48} color="#33AEB2" style={{ margin: '0 auto 16px' }} />
            <h3 style={{ color: '#F1F5F9', fontSize: 18, fontWeight: 700, marginBottom: 8 }}>E-mail enviado!</h3>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, lineHeight: 1.6, marginBottom: 24 }}>
              Se o e-mail estiver cadastrado, você receberá um link para redefinir sua senha. Verifique sua caixa de entrada e spam.
            </p>
            <Link href="/login" style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              color: 'rgba(0,177,181,0.8)', fontSize: 14, fontWeight: 600, textDecoration: 'none',
            }}>
              <ArrowLeft size={16} /> Voltar ao login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, lineHeight: 1.6, margin: 0 }}>
              Digite seu e-mail e enviaremos um link para redefinir sua senha.
            </p>

            {error && (
              <div style={{
                background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)',
                color: '#FCA5A5', fontSize: 13, padding: '12px 16px', borderRadius: 12,
              }}>
                {error}
              </div>
            )}

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.55)', marginBottom: 8, letterSpacing: '0.04em' }}>
                E-MAIL
              </label>
              <div style={{ position: 'relative' }}>
                <Mail size={16} color="rgba(255,255,255,0.3)" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                <input
                  type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com" required autoComplete="email"
                  style={{
                    width: '100%', paddingLeft: 40, paddingRight: 16, paddingTop: 14, paddingBottom: 14,
                    borderRadius: 14, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
                    color: '#F1F5F9', fontSize: 15, outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.2s',
                  }}
                  onFocus={e => (e.target.style.borderColor = 'rgba(0,177,181,0.5)')}
                  onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,0.12)')}
                />
              </div>
            </div>

            <button type="submit" disabled={loading} style={{
              width: '100%', padding: '15px 0', borderRadius: 14,
              background: loading ? 'rgba(0,117,119,0.5)' : 'linear-gradient(135deg, #007577 0%, #33AEB2 100%)',
              color: '#fff', fontWeight: 700, fontSize: 15, border: 'none',
              cursor: loading ? 'not-allowed' : 'pointer',
              boxShadow: loading ? 'none' : '0 8px 24px rgba(0,117,119,0.35)', marginTop: 4,
            }}>
              {loading ? 'Enviando...' : 'Enviar link de redefinição'}
            </button>

            <div style={{ textAlign: 'center' }}>
              <Link href="/login" style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                color: 'rgba(0,177,181,0.8)', fontSize: 13, fontWeight: 500, textDecoration: 'none',
              }}>
                <ArrowLeft size={14} /> Voltar ao login
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
