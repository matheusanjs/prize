'use client';

import { useState, useEffect, useCallback } from 'react';
import { CheckCircle2, X, Clock, Ship, AlertCircle, Calendar, Anchor } from 'lucide-react';
import { getMyReservations, confirmArrival, cancelReservation } from '@/services/api';
import { useAuth } from '@/contexts/auth';
import { format, parseISO, isToday, differenceInCalendarDays } from 'date-fns';

const HOURS = ['08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00'];
const DISMISS_KEY = 'pc:reservationReminder:dismissed';
const DISMISS_INTERVAL = 30 * 60 * 1000; // 30 minutes

interface TodayReservation {
  id: string;
  startDate: string;
  endDate: string;
  status: string;
  confirmedAt?: string | null;
  boat?: { id: string; name: string; model?: string; imageUrl?: string | null };
}

export function ReservationReminderModal() {
  const { user } = useAuth();
  const [reservation, setReservation] = useState<TodayReservation | null>(null);
  const [visible, setVisible] = useState(false);
  const [arrivalTime, setArrivalTime] = useState('10:00');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [action, setAction] = useState<'confirm' | 'cancel' | null>(null);

  const isDismissed = useCallback((resId: string) => {
    try {
      const raw = localStorage.getItem(DISMISS_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (data.id !== resId) return false;
      return Date.now() - data.ts < DISMISS_INTERVAL;
    } catch { return false; }
  }, []);

  const dismiss = useCallback((resId: string) => {
    try {
      localStorage.setItem(DISMISS_KEY, JSON.stringify({ id: resId, ts: Date.now() }));
    } catch { /* ignore */ }
    setVisible(false);
  }, []);

  const clearDismiss = useCallback(() => {
    try { localStorage.removeItem(DISMISS_KEY); } catch { /* ignore */ }
  }, []);

  const checkReservations = useCallback(async () => {
    if (!user?.id) return;
    try {
      const { data } = await getMyReservations();
      const list = Array.isArray(data) ? data : data?.data || [];
      const todayPending = list.find((r: TodayReservation) => {
        if (!['CONFIRMED', 'PENDING'].includes(r.status)) return false;
        if (r.confirmedAt) return false;
        const diff = differenceInCalendarDays(parseISO(r.startDate), new Date());
        return diff === 0 || diff === 1;
      });
      if (todayPending) {
        if (!isDismissed(todayPending.id)) {
          setReservation(todayPending);
          setArrivalTime(format(parseISO(todayPending.startDate), 'HH:mm'));
          setError('');
          setAction(null);
          setVisible(true);
        } else {
          setReservation(todayPending);
        }
      } else {
        setVisible(false);
        setReservation(null);
      }
    } catch { /* silent */ }
  }, [user?.id, isDismissed]);

  // Initial check + periodic re-check
  useEffect(() => {
    if (!user?.id) return;
    // Quick check after auth resolves
    const initialTimeout = setTimeout(checkReservations, 500);
    // Full re-check every 30 min (fetch fresh data)
    const dataInterval = setInterval(checkReservations, DISMISS_INTERVAL);
    // Quick dismiss-expiry check every 60s (no API call, just re-show)
    const dismissCheck = setInterval(() => {
      if (reservation && !visible && !isDismissed(reservation.id)) {
        setVisible(true);
      }
    }, 60_000);
    return () => { clearTimeout(initialTimeout); clearInterval(dataInterval); clearInterval(dismissCheck); };
  }, [user?.id, checkReservations, reservation, visible, isDismissed]);

  const handleConfirm = async () => {
    if (!reservation) return;
    setError('');
    setSaving(true);
    try {
      await confirmArrival(reservation.id, arrivalTime);
      clearDismiss();
      setVisible(false);
      setReservation(null);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Erro ao confirmar presença');
    }
    setSaving(false);
  };

  const handleCancel = async () => {
    if (!reservation) return;
    setError('');
    setSaving(true);
    try {
      await cancelReservation(reservation.id);
      clearDismiss();
      setVisible(false);
      setReservation(null);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Erro ao recusar reserva');
    }
    setSaving(false);
  };

  const handleClose = () => {
    if (reservation) dismiss(reservation.id);
  };

  if (!visible || !reservation) return null;

  return (
    <div
      className="fixed inset-0 z-[10002] flex items-center justify-center px-5"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
      onClick={handleClose}
    >
      <div
        className="w-full max-w-[380px] rounded-3xl overflow-hidden"
        style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header accent */}
        <div className="h-1 bg-gradient-to-r from-emerald-500 via-primary-500 to-emerald-400" />

        <div className="p-6">
          {/* Close button */}
          <div className="flex justify-end -mt-1 -mr-1 mb-3">
            <button
              onClick={handleClose}
              className="w-8 h-8 rounded-xl flex items-center justify-center transition"
              style={{ background: 'var(--subtle)' }}
            >
              <X size={15} className="text-[var(--text-muted)]" />
            </button>
          </div>

          {/* Boat image */}
          <div className="flex justify-center mb-4">
            {reservation.boat?.imageUrl ? (
              <div
                className="w-20 h-20 rounded-2xl overflow-hidden"
                style={{ border: '1px solid rgba(16,185,129,0.15)' }}
              >
                <img
                  src={reservation.boat.imageUrl}
                  alt={reservation.boat.model || reservation.boat.name}
                  width={80}
                  height={80}
                  decoding="async"
                  className="w-full h-full object-cover"
                />
              </div>
            ) : (
              <div
                className="w-20 h-20 rounded-2xl flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, rgba(16,185,129,0.12), rgba(16,185,129,0.04))', border: '1px solid rgba(16,185,129,0.15)' }}
              >
                <Ship size={32} className="text-emerald-500" />
              </div>
            )}
          </div>

          {/* Title */}
          <div className="text-center mb-5">
            <h2 className="text-lg font-bold text-[var(--text)]">
              {isToday(parseISO(reservation.startDate)) ? 'Reserva Hoje!' : 'Reserva Amanhã'}
            </h2>
            <p className="text-sm text-[var(--text-muted)] mt-1">
              {isToday(parseISO(reservation.startDate))
                ? 'Você tem uma reserva para hoje'
                : 'Confirme sua presença com antecedência'}
            </p>
          </div>

          {/* Reservation info card */}
          <div
            className="rounded-2xl p-4 mb-5"
            style={{ background: 'var(--subtle)', border: '1px solid var(--border)' }}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'linear-gradient(135deg, rgba(0,194,168,0.1), rgba(0,194,168,0.03))' }}
              >
                <Anchor size={18} className="text-primary-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-[var(--text)]">{reservation.boat?.model || reservation.boat?.name || 'Embarcação'}</p>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  {format(parseISO(reservation.startDate), "dd/MM 'às' HH:mm")} — {format(parseISO(reservation.endDate), 'HH:mm')}
                </p>
              </div>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-4 p-3 rounded-xl text-sm flex items-start gap-2" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', color: '#F87171' }}>
              <AlertCircle size={15} className="mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Confirm flow */}
          {action === 'confirm' ? (
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">
                  Horário previsto de chegada
                </label>
                <select
                  value={arrivalTime}
                  onChange={e => setArrivalTime(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border text-sm transition outline-none"
                  style={{ background: 'var(--subtle)', borderColor: 'var(--border)', color: 'var(--text)' }}
                >
                  {HOURS.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
              <button
                onClick={handleConfirm}
                disabled={saving}
                className="w-full py-3.5 rounded-xl font-semibold text-white flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #10B981, #34D399)', boxShadow: '0 4px 14px rgba(16,185,129,0.3)' }}
              >
                {saving ? (
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <CheckCircle2 size={17} />
                )}
                {saving ? 'Confirmando...' : 'Confirmar Presença'}
              </button>
              <button
                onClick={() => setAction(null)}
                disabled={saving}
                className="w-full py-2.5 text-sm font-medium text-[var(--text-muted)] transition"
              >
                Voltar
              </button>
            </div>
          ) : action === 'cancel' ? (
            <div className="space-y-3">
              <p className="text-sm text-[var(--text-secondary)] text-center">
                Tem certeza que deseja cancelar esta reserva?
              </p>
              <button
                onClick={handleCancel}
                disabled={saving}
                className="w-full py-3.5 rounded-xl font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-50"
                style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', color: '#F87171' }}
              >
                {saving ? (
                  <span className="w-4 h-4 border-2 border-red-400/30 border-t-red-400 rounded-full animate-spin" />
                ) : (
                  <X size={17} />
                )}
                {saving ? 'Cancelando...' : 'Sim, Cancelar Reserva'}
              </button>
              <button
                onClick={() => setAction(null)}
                disabled={saving}
                className="w-full py-2.5 text-sm font-medium text-[var(--text-muted)] transition"
              >
                Voltar
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <button
                onClick={() => setAction('confirm')}
                className="w-full py-3.5 rounded-xl font-semibold text-white flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
                style={{ background: 'linear-gradient(135deg, #10B981, #34D399)', boxShadow: '0 4px 14px rgba(16,185,129,0.3)' }}
              >
                <CheckCircle2 size={17} />
                Confirmar Presença
              </button>
              <button
                onClick={() => setAction('cancel')}
                className="w-full py-3 rounded-xl font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
                style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.12)', color: '#F87171' }}
              >
                <X size={17} />
                Recusar Reserva
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
