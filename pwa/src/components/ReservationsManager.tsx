'use client';

/**
 * ReservationsManager — comprehensive in-page reservation panel for the
 * /boats screen. Tabs:
 *   • Próximas  → my upcoming reservations (confirm presence, cancel)
 *   • Suplente  → vagas onde posso me inscrever + minhas inscrições
 *   • Trocas    → solicitações pendentes de troca de data
 *   • Histórico → reservas passadas (concluídas / canceladas)
 *
 * Designed to match the existing /boats compact card aesthetic:
 *   - var(--card) / var(--border) tokens
 *   - 16-18px radii, 11–13px font
 *   - Animations consistent with existing .ani classes
 */

import { useEffect, useMemo, useState, useCallback } from 'react';
import { resolveMediaUrl } from '@/utils/media';
import {
  Calendar, CheckCircle2, X as XIcon, Clock, ArrowLeftRight, UserPlus,
  History, AlertCircle, Hourglass, Anchor, Check, ChevronRight, Ship,
} from 'lucide-react';
import { format, parseISO, isToday, isBefore, differenceInCalendarDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  getMyReservations, cancelReservation, confirmArrival,
  getMySwaps, respondToSwap,
  getMySubstituteRequests,
  getIncomingSubstitutes, cancelSubstitute,
  passToNextSubstitute,
} from '@/services/api';
import { useAuth } from '@/contexts/auth';

interface Boat { id: string; name: string; model?: string; imageUrl?: string; }
interface MyReservation {
  id: string; startDate: string; endDate: string; status: string;
  confirmedAt?: string | null; expectedArrivalTime?: string | null;
  transferredFromUserId?: string | null;
  boat?: Boat; user?: { id: string; name: string };
}
interface SubstituteRequest {
  id: string; status: string; createdAt: string; promotedAt?: string | null; resolvedAt?: string | null;
  message?: string | null;
  reservation: MyReservation & { user: { id: string; name: string; avatar?: string } };
}
interface IncomingSubstitute {
  id: string; status: string; createdAt: string; message?: string | null;
  substitute: { id: string; name: string; avatar?: string };
  reservation: MyReservation;
}
interface SwapRequest {
  id: string; status: string; message?: string; createdAt: string;
  requesterId?: string; targetUserId?: string;
  reservation: { id: string; startDate: string; endDate: string; boat: { id: string; name: string; model?: string }; user: { id: string; name: string } };
  offeredReservation: { id: string; startDate: string; endDate: string; user: { id: string; name: string } };
  requester: { id: string; name: string };
  targetUser?: { id: string; name: string };
}

type TabKey = 'upcoming' | 'substitutes' | 'swaps';

const HOURS = ['08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00'];

const STATUS_LABEL: Record<string, string> = {
  CONFIRMED: 'Reservada', PENDING: 'Pendente', IN_USE: 'Em uso',
  COMPLETED: 'Concluída', CANCELLED: 'Cancelada',
};
const STATUS_COLOR: Record<string, string> = {
  CONFIRMED: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/15',
  PENDING:   'text-amber-500 bg-amber-500/10 border-amber-500/15',
  IN_USE:    'text-primary-500 bg-primary-500/10 border-primary-500/15',
  COMPLETED: 'text-sky-500 bg-sky-500/10 border-sky-500/15',
  CANCELLED: 'text-red-400 bg-red-500/10 border-red-500/15',
};

export default function ReservationsManager() {
  const { user } = useAuth();
  const [tab, setTab] = useState<TabKey>('upcoming');

  const [myReservations, setMyReservations] = useState<MyReservation[]>([]);
  const [pendingSwaps, setPendingSwaps] = useState<SwapRequest[]>([]);
  const [mySubRequests, setMySubRequests] = useState<SubstituteRequest[]>([]);
  const [incomingSubs, setIncomingSubs] = useState<IncomingSubstitute[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  // Confirm-arrival modal
  const [arrivalModal, setArrivalModal] = useState<MyReservation | null>(null);
  const [arrivalTime, setArrivalTime] = useState('10:00');
  const [arrivalSaving, setArrivalSaving] = useState(false);
  const [arrivalError, setArrivalError] = useState('');

  // Substitute signup inline message — kept for potential future inline UI


  const refresh = useCallback(async () => {
    if (!user) return;
    setError('');
    try {
      const [mine, swaps, mySub, incoming] = await Promise.allSettled([
        getMyReservations(),
        getMySwaps(),
        getMySubstituteRequests(),
        getIncomingSubstitutes(),
      ]);
      const pickList = <T,>(r: PromiseSettledResult<{ data: T[] | { data: T[] } }>): T[] => {
        if (r.status !== 'fulfilled') return [];
        const d = r.value.data as any;
        return Array.isArray(d) ? d : (d?.data || []);
      };
      setMyReservations(pickList<MyReservation>(mine));
      setPendingSwaps(pickList<SwapRequest>(swaps));
      setMySubRequests(pickList<SubstituteRequest>(mySub));
      setIncomingSubs(pickList<IncomingSubstitute>(incoming));
    } catch {
      setError('Não foi possível carregar suas reservas.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  // ─── Derived lists ────────────────────────────────────────────────
  const now = new Date();
  const upcoming = useMemo(() =>
    myReservations
      .filter(r => ['CONFIRMED', 'PENDING', 'IN_USE'].includes(r.status) && parseISO(r.endDate) >= now)
      .sort((a, b) => +parseISO(a.startDate) - +parseISO(b.startDate)),
    [myReservations, now],
  );

  // Split swaps into incoming (I'm the target — can accept/reject) and outgoing (I requested — waiting).
  const userIdAuth = user?.id;
  const incomingSwaps = useMemo(
    () => pendingSwaps.filter(s => s.status === 'PENDING' && (s.targetUserId === userIdAuth || s.targetUser?.id === userIdAuth)),
    [pendingSwaps, userIdAuth],
  );
  const outgoingSwaps = useMemo(
    () => pendingSwaps.filter(s => s.status === 'PENDING' && (s.requesterId === userIdAuth || s.requester?.id === userIdAuth)),
    [pendingSwaps, userIdAuth],
  );

  // ─── Counts (badges) ────────────────────────────────
  const counts = {
    upcoming: upcoming.length,
    substitutes: mySubRequests.filter(s => s.status === 'PENDING').length + incomingSubs.length,
    swaps: incomingSwaps.length + outgoingSwaps.length,
  };

  // ─── Actions ──────────────────────────────────────────────────────
  const openArrival = (r: MyReservation) => {
    setArrivalModal(r);
    setArrivalTime(format(parseISO(r.startDate), 'HH:mm'));
    setArrivalError('');
  };

  const handleConfirmArrival = async () => {
    if (!arrivalModal) return;
    setArrivalSaving(true);
    try {
      await confirmArrival(arrivalModal.id, arrivalTime);
      setArrivalModal(null);
      await refresh();
    } catch (err: any) {
      setArrivalError(err?.response?.data?.message || 'Erro ao confirmar presença');
    }
    setArrivalSaving(false);
  };

  const handleCancel = async (r: MyReservation) => {
    if (!confirm(`Cancelar a reserva de ${format(parseISO(r.startDate), "dd/MM 'às' HH:mm")}?`)) return;
    setBusyId(r.id);
    try {
      await cancelReservation(r.id, 'Cancelado pelo cotista');
      await refresh();
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Erro ao cancelar');
    }
    setBusyId(null);
  };

  const handleSwapRespond = async (id: string, accept: boolean) => {
    setBusyId(id);
    try { await respondToSwap(id, accept); await refresh(); }
    catch { alert('Erro ao responder solicitação'); }
    setBusyId(null);
  };

  const handleCancelSubInscription = async (id: string) => {
    if (!confirm('Cancelar sua inscrição como suplente?')) return;
    setBusyId(id);
    try { await cancelSubstitute(id); await refresh(); }
    catch (err: any) { alert(err?.response?.data?.message || 'Erro ao cancelar'); }
    setBusyId(null);
  };

  const handleResolveIncoming = async (id: string) => {
    if (!confirm('Remover este suplente da sua reserva?')) return;
    setBusyId(id);
    try { await cancelSubstitute(id); await refresh(); }
    catch (err: any) { alert(err?.response?.data?.message || 'Erro ao remover'); }
    setBusyId(null);
  };

  const handlePassToSubstitute = async (reservationId: string, nextSubName: string) => {
    if (!confirm(`Passar a vez para ${nextSubName}? Você abrirá mão da sua reserva e o suplente assumirá em seu lugar (ainda sem confirmação).`)) return;
    setBusyId(reservationId);
    try { await passToNextSubstitute(reservationId); await refresh(); }
    catch (err: any) { alert(err?.response?.data?.message || 'Erro ao passar a vez'); }
    setBusyId(null);
  };

  // Group incoming substitutes by reservation, so the holder sees one card
  // per reservation with the queue of inscribed substitutes.
  const incomingByReservation = useMemo(() => {
    const map = new Map<string, { reservation: IncomingSubstitute['reservation']; subs: IncomingSubstitute[] }>();
    for (const s of incomingSubs) {
      const key = s.reservation.id;
      const entry = map.get(key);
      if (entry) entry.subs.push(s);
      else map.set(key, { reservation: s.reservation, subs: [s] });
    }
    // Sort each queue by createdAt asc (FIFO)
    for (const v of map.values()) {
      v.subs.sort((a, b) => +parseISO(a.createdAt) - +parseISO(b.createdAt));
    }
    return Array.from(map.values()).sort(
      (a, b) => +parseISO(a.reservation.startDate) - +parseISO(b.reservation.startDate),
    );
  }, [incomingSubs]);

  // ─── Render helpers ───────────────────────────────────────────────
  const TabButton = ({ k, label, count }: { k: TabKey; label: string; count: number }) => (
    <button
      onClick={() => setTab(k)}
      className={`flex-1 min-w-fit flex items-center justify-center gap-1.5 px-2.5 h-9 rounded-xl text-[11px] font-bold tracking-wide transition-all ${
        tab === k ? 'bg-primary-500 text-white shadow-[0_2px_8px_rgba(0,194,168,.25)]'
                  : 'bg-[var(--subtle)] text-[var(--text-secondary)] border border-[var(--border)]'
      }`}
    >
      <span>{label}</span>
      {count > 0 && (
        <span className={`px-1.5 min-w-[18px] h-[18px] rounded-full text-[10px] font-extrabold flex items-center justify-center ${
          tab === k ? 'bg-white/25 text-white' : 'bg-primary-500/15 text-primary-500'
        }`}>{count}</span>
      )}
    </button>
  );

  if (loading) {
    return (
      <div className="px-3 mt-3">
        <div className="h-32 rounded-2xl" style={{
          background: 'linear-gradient(90deg,var(--subtle) 25%,var(--card-hover) 50%,var(--subtle) 75%)',
          backgroundSize: '800px 100%', animation: 'sh 1.5s ease-in-out infinite',
        }} />
      </div>
    );
  }

  return (
    <div className="ani ani-3 mt-3">
      <div className="px-4 mb-2 flex items-center gap-2">
        <div className="w-5 h-5 rounded-md flex items-center justify-center" style={{ background: 'rgba(245,158,11,.12)', color: '#F59E0B' }}>
          <Calendar size={10} />
        </div>
        <h2 className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[var(--text)]">Gerenciar Reservas</h2>
        <div className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, var(--border), transparent)' }} />
      </div>

      <div className="px-3">
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-1 -mx-1 px-1">
          <TabButton k="upcoming"    label="Próximas"  count={counts.upcoming} />
          <TabButton k="substitutes" label="Suplente"  count={counts.substitutes} />
          <TabButton k="swaps"       label="Trocas"    count={counts.swaps} />
        </div>

        {error && (
          <div className="mt-2 p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-[11px] text-red-400 flex items-center gap-2">
            <AlertCircle size={12} />{error}
          </div>
        )}

        <div className="mt-2.5 space-y-2">
          {tab === 'upcoming' && (
            upcoming.length === 0 ? (
              <EmptyTab icon={<Calendar size={20} />} text="Nenhuma reserva próxima" sub="Crie uma reserva pelo card da embarcação acima" />
            ) : upcoming.map(r => (
              <ReservationRow
                key={r.id} r={r}
                actionSlot={
                  <div className="mt-3 pt-3 border-t border-[var(--border)] flex flex-col items-center gap-2">
                    {r.transferredFromUserId && (
                      <span className="text-[9px] font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-full bg-primary-500/10 text-primary-500 border border-primary-500/15">
                        ✦ Recebida via suplente
                      </span>
                    )}
                    {r.expectedArrivalTime ? (
                      <span className="inline-flex items-center justify-center gap-1.5 text-[11px] text-emerald-500 font-bold px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/15">
                        <CheckCircle2 size={12} strokeWidth={2.5} /> Presença confirmada · {r.expectedArrivalTime}
                      </span>
                    ) : (() => {
                      const daysUntil = differenceInCalendarDays(parseISO(r.startDate), new Date());
                      const canConfirm = daysUntil === 0 || daysUntil === 1;
                      return (
                        <div className={`grid w-full gap-2 ${canConfirm ? 'grid-cols-2' : 'grid-cols-1'}`}>
                          {canConfirm && (
                            <button
                              onClick={() => openArrival(r)}
                              className="h-10 rounded-xl text-[12px] font-bold text-white flex items-center justify-center gap-1.5 active:scale-[0.97] transition-transform shadow-[0_4px_14px_rgba(16,185,129,.25)]"
                              style={{ background: 'linear-gradient(135deg, #10B981, #34D399)' }}
                            >
                              <CheckCircle2 size={13} strokeWidth={2.5} />
                              {daysUntil === 0 ? 'Confirmar presença' : 'Confirmar (amanhã)'}
                            </button>
                          )}
                          <button
                            onClick={() => handleCancel(r)}
                            disabled={busyId === r.id}
                            className="h-10 rounded-xl text-[12px] font-bold text-red-400 flex items-center justify-center gap-1.5 active:scale-[0.97] disabled:opacity-50 transition-transform"
                            style={{ background: 'rgba(239,68,68,.06)', border: '1px solid rgba(239,68,68,.15)' }}
                          >
                            <XIcon size={13} strokeWidth={2.5} /> Cancelar reserva
                          </button>
                        </div>
                      );
                    })()}
                  </div>
                }
              />
            ))
          )}

          {tab === 'substitutes' && (
            <>
              {/* Incoming: someone signed up as substitute on MY reservation */}
              {incomingSubs.length > 0 && (
                <div>
                  <SubHeader icon={<UserPlus size={11} />} label="Suplentes nas suas reservas" />
                  {incomingByReservation.map(({ reservation, subs }) => {
                    const next = subs[0];
                    const others = subs.slice(1);
                    const startedAlready = parseISO(reservation.startDate) <= new Date();
                    const alreadyConfirmed = !!reservation.expectedArrivalTime;
                    return (
                      <div key={reservation.id} className="rounded-2xl p-3 mb-2 border border-amber-500/15 bg-amber-500/5">
                        {/* Reservation header */}
                        <div className="flex items-start justify-between mb-2">
                          <div className="min-w-0">
                            <p className="text-[12px] font-bold text-[var(--text)] truncate flex items-center gap-1.5">
                              <Anchor size={12} className="text-amber-500" />
                              {reservation.boat?.model || reservation.boat?.name || 'Embarcação'}
                            </p>
                            <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
                              {format(parseISO(reservation.startDate), "dd/MM 'das' HH:mm", { locale: ptBR })} às {format(parseISO(reservation.endDate), 'HH:mm')}
                            </p>
                          </div>
                          <span className="text-[9px] font-extrabold uppercase tracking-wider px-2 py-1 rounded-md bg-amber-500/15 text-amber-600 border border-amber-500/20 whitespace-nowrap">
                            {subs.length} {subs.length === 1 ? 'suplente' : 'suplentes'}
                          </span>
                        </div>

                        {/* Queue list (FIFO) */}
                        <div className="bg-[var(--card)] rounded-xl p-2 mb-2 border border-[var(--border)] space-y-1.5">
                          <p className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-muted)] px-1">Fila de espera</p>
                          <div className="flex items-center gap-1.5 px-1">
                            <span className="w-5 h-5 rounded-full bg-primary-500 text-white text-[10px] font-extrabold flex items-center justify-center flex-shrink-0">1</span>
                            <span className="text-[11px] font-bold text-[var(--text)] truncate flex-1">{next.substitute.name}</span>
                            <button
                              onClick={() => handleResolveIncoming(next.id)}
                              disabled={busyId === next.id}
                              className="text-[10px] text-red-400 font-semibold hover:underline"
                              title="Remover este suplente da fila"
                            >
                              Remover
                            </button>
                          </div>
                          {others.map((s, i) => (
                            <div key={s.id} className="flex items-center gap-1.5 px-1">
                              <span className="w-5 h-5 rounded-full bg-[var(--subtle)] text-[var(--text-secondary)] text-[10px] font-extrabold flex items-center justify-center flex-shrink-0 border border-[var(--border)]">{i + 2}</span>
                              <span className="text-[11px] text-[var(--text-secondary)] truncate flex-1">{s.substitute.name}</span>
                              <button
                                onClick={() => handleResolveIncoming(s.id)}
                                disabled={busyId === s.id}
                                className="text-[10px] text-red-400 font-semibold hover:underline"
                              >
                                Remover
                              </button>
                            </div>
                          ))}
                        </div>

                        {next.message && (
                          <p className="text-[11px] italic text-[var(--text-secondary)] bg-[var(--card)] p-2 rounded-lg mb-2 border border-[var(--border)]">
                            <strong className="not-italic">{next.substitute.name.split(' ')[0]}:</strong> "{next.message}"
                          </p>
                        )}

                        {/* Action buttons */}
                        {alreadyConfirmed ? (
                          <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1.5 px-1">
                            <CheckCircle2 size={12} /> Você já confirmou presença · {reservation.expectedArrivalTime}
                          </div>
                        ) : startedAlready ? (
                          <div className="text-[11px] text-[var(--text-muted)] px-1">Reserva já iniciada</div>
                        ) : (
                          <div className="grid grid-cols-2 gap-2 mt-1">
                            <button
                              onClick={() => openArrival(reservation as MyReservation)}
                              disabled={busyId === reservation.id}
                              className="h-10 rounded-xl text-[12px] font-bold flex items-center justify-center gap-1.5 active:scale-[0.97] disabled:opacity-50 text-white transition-transform shadow-[0_4px_14px_rgba(16,185,129,.25)]"
                              style={{ background: 'linear-gradient(135deg, #10B981, #34D399)' }}
                            >
                              <CheckCircle2 size={13} strokeWidth={2.5} /> Confirmar minha vaga
                            </button>
                            <button
                              onClick={() => handlePassToSubstitute(reservation.id, next.substitute.name)}
                              disabled={busyId === reservation.id}
                              className="h-10 rounded-xl text-[12px] font-bold flex items-center justify-center gap-1.5 text-amber-600 dark:text-amber-400 active:scale-[0.97] disabled:opacity-50 transition-transform"
                              style={{ background: 'rgba(245,158,11,.1)', border: '1px solid rgba(245,158,11,.25)' }}
                            >
                              <ArrowLeftRight size={13} strokeWidth={2.5} /> Passar a vez
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* My active substitute inscriptions */}
              {mySubRequests.filter(s => s.status === 'PENDING').length > 0 && (
                <div>
                  <SubHeader icon={<Hourglass size={11} />} label="Suas inscrições como suplente" />
                  {mySubRequests.filter(s => s.status === 'PENDING').map(s => (
                    <div key={s.id} className="rounded-2xl p-3 mb-2 border border-primary-500/20 bg-primary-500/5">
                      <p className="text-[12px] font-bold text-[var(--text)]">
                        {(s.reservation.boat?.model || s.reservation.boat?.name)} · {format(parseISO(s.reservation.startDate), "dd/MM 'às' HH:mm", { locale: ptBR })}
                      </p>
                      <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                        Titular: {s.reservation.user?.name?.split(' ')[0] || 'Cotista'} · Aguardando resolução
                      </p>
                      <div className="mt-3 pt-3 border-t border-primary-500/15 flex justify-center">
                        <button
                          onClick={() => handleCancelSubInscription(s.id)}
                          disabled={busyId === s.id}
                          className="h-9 px-4 rounded-xl text-[11px] font-bold text-red-400 flex items-center justify-center gap-1.5 active:scale-[0.97] disabled:opacity-50 transition-transform"
                          style={{ background: 'rgba(239,68,68,.06)', border: '1px solid rgba(239,68,68,.15)' }}
                        >
                          <XIcon size={12} strokeWidth={2.5} /> Cancelar inscrição
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Past substitute outcomes (promoted/rejected) */}
              {mySubRequests.filter(s => s.status !== 'PENDING').slice(0, 5).length > 0 && (
                <div>
                  <SubHeader icon={<History size={11} />} label="Histórico de suplência" />
                  {mySubRequests.filter(s => s.status !== 'PENDING').slice(0, 5).map(s => (
                    <div key={s.id} className="rounded-2xl p-3 mb-2 border border-[var(--border)] bg-[var(--card)]">
                      <div className="flex items-center justify-between">
                        <p className="text-[12px] font-bold text-[var(--text)] truncate">
                          {s.reservation.boat?.model || s.reservation.boat?.name}
                        </p>
                        <SubStatusBadge status={s.status} />
                      </div>
                      <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                        {format(parseISO(s.reservation.startDate), "dd/MM 'às' HH:mm", { locale: ptBR })}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {/* Available reservations to subscribe as substitute — hidden on /boats.
                  Inscrição como suplente é feita pela página /reservations. */}
              {incomingSubs.length === 0 && mySubRequests.length === 0 && (
                <EmptyTab
                  icon={<UserPlus size={20} />}
                  text="Nenhuma atividade de suplência"
                  sub="Suplentes nas suas reservas e suas inscrições ativas aparecem aqui"
                />
              )}
            </>
          )}

          {tab === 'swaps' && (
            (incomingSwaps.length === 0 && outgoingSwaps.length === 0) ? (
              <EmptyTab icon={<ArrowLeftRight size={20} />} text="Nenhuma solicitação de troca" sub="Pedidos recebidos e enviados aparecem aqui" />
            ) : (
              <>
                {incomingSwaps.length > 0 && (
                  <div>
                    <SubHeader icon={<ArrowLeftRight size={11} />} label="Recebidas — aguardando sua resposta" />
                    {incomingSwaps.map(s => (
                      <div key={s.id} className="rounded-2xl p-3 mb-2 border border-[var(--border)] bg-[var(--card)]">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 bg-amber-500/10">
                            <ArrowLeftRight size={11} className="text-amber-500" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[12px] font-bold text-[var(--text)] truncate">
                              {s.requester.name.split(' ')[0]} quer trocar
                            </p>
                            <p className="text-[10px] text-[var(--text-muted)] truncate">
                              {s.reservation.boat.model || s.reservation.boat.name}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 text-[11px] text-[var(--text-secondary)] mb-2 px-1 tabular-nums">
                          <span>{format(parseISO(s.reservation.startDate), 'dd/MM HH:mm')}</span>
                          <ArrowLeftRight size={10} className="text-amber-500 mx-1" />
                          <span className="text-primary-500">{format(parseISO(s.offeredReservation.startDate), 'dd/MM HH:mm')}</span>
                        </div>
                        {s.message && (
                          <p className="text-[11px] italic text-[var(--text-secondary)] bg-[var(--subtle)] p-2 rounded-lg mb-2 border border-[var(--border)]">"{s.message}"</p>
                        )}
                        <div className="grid grid-cols-2 gap-2">
                          <button onClick={() => handleSwapRespond(s.id, true)} disabled={busyId === s.id}
                            className="h-10 rounded-xl text-[12px] font-bold flex items-center justify-center gap-1.5 active:scale-[0.97] disabled:opacity-50 text-white transition-transform shadow-[0_4px_14px_rgba(16,185,129,.25)]"
                            style={{ background: 'linear-gradient(135deg, #10B981, #34D399)' }}>
                            <Check size={13} strokeWidth={2.5} /> Aceitar troca
                          </button>
                          <button onClick={() => handleSwapRespond(s.id, false)} disabled={busyId === s.id}
                            className="h-10 rounded-xl text-[12px] font-bold flex items-center justify-center gap-1.5 text-red-400 active:scale-[0.97] disabled:opacity-50 transition-transform"
                            style={{ background: 'rgba(239,68,68,.06)', border: '1px solid rgba(239,68,68,.15)' }}>
                            <XIcon size={13} strokeWidth={2.5} /> Recusar
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {outgoingSwaps.length > 0 && (
                  <div>
                    <SubHeader icon={<Hourglass size={11} />} label="Enviadas — aguardando resposta" />
                    {outgoingSwaps.map(s => (
                      <div key={s.id} className="rounded-2xl p-3 mb-2 border border-primary-500/20 bg-primary-500/5">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 bg-primary-500/10">
                            <ArrowLeftRight size={11} className="text-primary-500" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[12px] font-bold text-[var(--text)] truncate">
                              Você pediu troca a {(s.targetUser?.name || s.reservation.user?.name || '').split(' ')[0] || 'cotista'}
                            </p>
                            <p className="text-[10px] text-[var(--text-muted)] truncate">
                              {s.reservation.boat.model || s.reservation.boat.name}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 text-[11px] text-[var(--text-secondary)] mb-2 px-1 tabular-nums">
                          <span className="text-primary-500">{format(parseISO(s.offeredReservation.startDate), 'dd/MM HH:mm')}</span>
                          <ArrowLeftRight size={10} className="text-amber-500 mx-1" />
                          <span>{format(parseISO(s.reservation.startDate), 'dd/MM HH:mm')}</span>
                        </div>
                        {s.message && (
                          <p className="text-[11px] italic text-[var(--text-secondary)] bg-[var(--card)] p-2 rounded-lg mb-2 border border-[var(--border)]">"{s.message}"</p>
                        )}
                        <p className="text-[10px] text-[var(--text-muted)] flex items-center gap-1">
                          <Hourglass size={10} className="text-amber-500" /> Aguardando o outro cotista responder
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )
          )}

        </div>
      </div>

      {/* Confirm-arrival modal */}
      {arrivalModal && (
        <div className="fixed inset-0 z-[10001] flex items-end" style={{ background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(10px)' }} onClick={() => setArrivalModal(null)}>
          <div onClick={e => e.stopPropagation()}
               className="w-full max-h-[85vh] overflow-auto"
               style={{ background: 'var(--card)', borderTop: '1px solid var(--border)', borderRadius: '20px 20px 0 0', paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}>
            <div className="p-4">
              <div className="w-8 h-1 rounded-full mx-auto mb-4" style={{ background: 'var(--border)' }} />
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-[15px] font-extrabold text-[var(--text)]">Confirmar Presença</h2>
                  <p className="text-[11px] text-[var(--text-muted)] mt-px">
                    {arrivalModal.boat?.model || arrivalModal.boat?.name} · {format(parseISO(arrivalModal.startDate), "dd/MM 'às' HH:mm")} — {format(parseISO(arrivalModal.endDate), 'HH:mm')}
                  </p>
                </div>
                <button onClick={() => setArrivalModal(null)} className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: 'var(--subtle)' }}>
                  <XIcon size={12} className="text-[var(--text-muted)]" />
                </button>
              </div>
              {arrivalError && (
                <div className="mb-3 p-2.5 rounded-xl text-[11px] text-red-400 flex items-start gap-2 bg-red-500/5 border border-red-500/10">
                  <AlertCircle size={12} className="mt-0.5 flex-shrink-0" /> <span>{arrivalError}</span>
                </div>
              )}
              <div className="rounded-xl p-3 mb-4 bg-emerald-500/5 border border-emerald-500/10">
                <p className="text-[12px] text-emerald-500 font-semibold mb-0.5">Confirmando sua presença</p>
                <p className="text-[10px] text-[var(--text-muted)] leading-relaxed">A vaga é sua. Suplentes inscritos serão dispensados automaticamente.</p>
              </div>
              <div className="mb-4">
                <label className="block text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-[0.1em] mb-1.5">Horário de chegada</label>
                <select value={arrivalTime} onChange={e => setArrivalTime(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl text-[13px] outline-none"
                  style={{ background: 'var(--subtle)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                  {HOURS.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
              <button onClick={handleConfirmArrival} disabled={arrivalSaving}
                className="w-full h-[42px] rounded-xl font-bold text-[13px] text-white disabled:opacity-50 active:scale-[0.98] flex items-center justify-center gap-2"
                style={{ background: 'linear-gradient(135deg, #10B981, #34D399)' }}>
                {arrivalSaving ? <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <CheckCircle2 size={14} />}
                {arrivalSaving ? 'Confirmando...' : 'Confirmar Presença'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Sub-components ─────────────────────────────────────────────── */

function ReservationRow({ r, compact, actionSlot }: { r: any; compact?: boolean; actionSlot?: React.ReactNode }) {
  const imgSrc = r.boat?.imageUrl ? resolveMediaUrl(r.boat.imageUrl) : '';
  return (
    <div className="rounded-2xl p-3 border border-[var(--border)] bg-[var(--card)]">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-11 h-11 rounded-xl overflow-hidden flex-shrink-0 bg-primary-500/10 flex items-center justify-center">
            {imgSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imgSrc}
                alt={r.boat?.model || r.boat?.name || 'Embarcação'}
                className="w-full h-full object-cover"
                loading="eager"
                decoding="async"
              />
            ) : (
              <Ship size={16} className="text-primary-500" />
            )}
          </div>
          <div className="min-w-0">
            <p className="text-[12px] font-bold text-[var(--text)] truncate">{r.boat?.model || r.boat?.name || 'Embarcação'}</p>
            <div className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)] mt-0.5">
              <Clock size={10} className="opacity-60" />
              <span className="tabular-nums">
                {format(parseISO(r.startDate), "dd/MM HH:mm", { locale: ptBR })} — {format(parseISO(r.endDate), 'HH:mm')}
              </span>
            </div>
          </div>
        </div>
        <span className={`text-[9px] font-extrabold uppercase tracking-wider px-2 py-1 rounded-md border ${STATUS_COLOR[r.status] || ''}`}>
          {STATUS_LABEL[r.status] || r.status}
        </span>
      </div>
      {!compact && actionSlot}
    </div>
  );
}

function SubHeader({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-1.5 mt-1 mb-1.5 px-1">
      <span className="text-amber-500/70">{icon}</span>
      <span className="text-[9px] font-extrabold uppercase tracking-[0.1em] text-[var(--text-muted)]">{label}</span>
      <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
    </div>
  );
}

function SubStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    PROMOTED:  { label: 'Promovido', cls: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/15' },
    REJECTED:  { label: 'Não promovido', cls: 'text-red-400 bg-red-500/10 border-red-500/15' },
    CANCELLED: { label: 'Cancelado', cls: 'text-[var(--text-muted)] bg-[var(--subtle)] border-[var(--border)]' },
    PENDING:   { label: 'Pendente', cls: 'text-amber-500 bg-amber-500/10 border-amber-500/15' },
  };
  const m = map[status] || map.PENDING;
  return <span className={`text-[9px] font-extrabold uppercase tracking-wider px-2 py-1 rounded-md border ${m.cls}`}>{m.label}</span>;
}

function EmptyTab({ icon, text, sub }: { icon: React.ReactNode; text: string; sub: string }) {
  return (
    <div className="text-center py-8 px-4 rounded-2xl border border-dashed border-[var(--border)] bg-[var(--subtle)]/40">
      <div className="w-10 h-10 rounded-full bg-[var(--subtle)] mx-auto mb-2 flex items-center justify-center" style={{ color: 'var(--text-muted)', opacity: .4 }}>
        {icon}
      </div>
      <p className="text-[12px] font-semibold text-[var(--text-secondary)]">{text}</p>
      <p className="text-[10px] text-[var(--text-muted)] mt-0.5 max-w-[260px] mx-auto leading-relaxed">{sub}</p>
    </div>
  );
}
