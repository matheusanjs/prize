'use client';

import { useState, useEffect } from 'react';
import { Bell, BellOff, X } from 'lucide-react';
import { useAuth } from '@/contexts/auth';

const SNOOZED_KEY = 'pc:push-banner-snoozed-until';
const SNOZE_DAYS = 3;

function isCapacitorNative(): boolean {
  return typeof window !== 'undefined' && !!(window as any).Capacitor?.isNativePlatform?.();
}

type BannerState = 'hidden' | 'default' | 'denied';

export function PushPermissionBanner() {
  const { user } = useAuth();
  const [state, setState] = useState<BannerState>('hidden');

  useEffect(() => {
    if (!user) return;
    // Respect snooze
    const snoozedUntil = localStorage.getItem(SNOOZED_KEY);
    if (snoozedUntil && Date.now() < Number(snoozedUntil)) return;

    checkPermission().then(setState);
  }, [user]);

  async function checkPermission(): Promise<BannerState> {
    if (isCapacitorNative()) {
      try {
        const { PushNotifications } = await import('@capacitor/push-notifications');
        const result = await PushNotifications.checkPermissions();
        if (result.receive === 'granted') return 'hidden';
        if (result.receive === 'denied') return 'denied';
        return 'default'; // 'prompt' or 'prompt-with-rationale'
      } catch {
        return 'hidden';
      }
    } else {
      if (typeof Notification === 'undefined') return 'hidden';
      if (Notification.permission === 'granted') return 'hidden';
      if (Notification.permission === 'denied') return 'denied';
      return 'default';
    }
  }

  async function handleEnable() {
    if (isCapacitorNative()) {
      try {
        const { PushNotifications } = await import('@capacitor/push-notifications');
        const result = await PushNotifications.requestPermissions();
        if (result.receive === 'granted') {
          // PushManager already set up listeners — register() fires the token event
          await PushNotifications.register();
          setState('hidden');
        } else {
          setState('denied');
        }
      } catch (err) {
        console.error('PushPermissionBanner: requestPermissions error', err);
      }
    } else {
      if (typeof Notification === 'undefined') return;
      const perm = await Notification.requestPermission();
      setState(perm === 'granted' ? 'hidden' : 'denied');
    }
  }

  function handleDismiss() {
    const until = Date.now() + SNOZE_DAYS * 24 * 3600 * 1000;
    localStorage.setItem(SNOOZED_KEY, String(until));
    setState('hidden');
  }

  if (state === 'hidden' || !user) return null;

  const isDenied = state === 'denied';

  return (
    <div
      role="alert"
      style={{
        position: 'fixed',
        bottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))',
        left: '1rem',
        right: '1rem',
        zIndex: 200,
        background: '#111D2E',
        border: `1px solid ${isDenied ? 'rgba(239,68,68,0.35)' : 'rgba(0,117,119,0.45)'}`,
        borderRadius: '0.875rem',
        padding: '0.875rem 1rem',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '0.75rem',
        boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
        animation: 'slideUp 0.25s ease-out',
      }}
    >
      {/* Icon */}
      <div style={{
        flexShrink: 0,
        width: 38,
        height: 38,
        borderRadius: '50%',
        background: isDenied ? 'rgba(239,68,68,0.12)' : 'rgba(0,117,119,0.15)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        {isDenied
          ? <BellOff size={18} color="#ef4444" />
          : <Bell size={18} color="#007577" />
        }
      </div>

      {/* Text + action */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: '0.875rem', fontWeight: 700, color: '#F1F5F9', margin: 0, marginBottom: 3 }}>
          {isDenied ? 'Notificações bloqueadas' : 'Ativar notificações'}
        </p>
        <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.55)', lineHeight: 1.45, margin: 0 }}>
          {isDenied
            ? 'Vá em Ajustes > Notificações > Prize Clube para reativar.'
            : 'Receba alertas de faturas, reservas e manutenções em tempo real.'
          }
        </p>

        {!isDenied && (
          <button
            onClick={handleEnable}
            style={{
              marginTop: '0.5rem',
              padding: '0.375rem 1rem',
              background: '#007577',
              color: '#fff',
              border: 'none',
              borderRadius: '0.5rem',
              fontSize: '0.8125rem',
              fontWeight: 600,
              cursor: 'pointer',
              letterSpacing: '0.01em',
            }}
          >
            Ativar agora
          </button>
        )}

        {isDenied && (
          <button
            onClick={handleDismiss}
            style={{
              marginTop: '0.5rem',
              padding: '0.375rem 0.875rem',
              background: 'rgba(255,255,255,0.07)',
              color: 'rgba(255,255,255,0.65)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '0.5rem',
              fontSize: '0.8125rem',
              cursor: 'pointer',
            }}
          >
            Entendido
          </button>
        )}
      </div>

      {/* Dismiss */}
      <button
        onClick={handleDismiss}
        aria-label="Fechar"
        style={{
          flexShrink: 0,
          padding: 4,
          marginTop: -2,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          lineHeight: 1,
        }}
      >
        <X size={16} color="rgba(255,255,255,0.35)" />
      </button>

      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
