'use client';

import { useEffect, useState, useRef, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/auth';
import api from '@/services/api';
import {
  MapPin, Calendar, Users, Heart, MessageCircle, Plus, Send, ChevronLeft,
  Image as ImageIcon, Mic, MicOff, Loader2, Share2, Clock, Crown, Star,
  Lock, X, Check, Navigation, Camera, Anchor, Sparkles, ChevronRight, Eye,
} from 'lucide-react';
import { io, Socket } from 'socket.io-client';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const API_ORIGIN = (process.env.NEXT_PUBLIC_API_URL || 'https://api.marinaprizeclub.com/api/v1').replace(/\/api\/v1$/, '');
const WS_URL = API_ORIGIN;

function resolveMediaUrl(url: string | undefined | null): string {
  if (!url) return '';
  if (url.startsWith('/')) return `${API_ORIGIN}${url}`;
  return url;
}

function formatDate(d: string) {
  return format(new Date(d), "dd 'de' MMMM", { locale: ptBR });
}

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

interface TripPhoto { id: string; url: string; order: number }
interface TripParticipant { id: string; userId: string; user: { id: string; name: string; avatar: string | null }; joinedAt: string }
interface Trip {
  id: string; title: string; description: string | null; meetingPoint: string; destination: string;
  stops: any; date: string; time: string | null; maxParticipants: number | null;
  status: string; isOfficial: boolean; isHighlighted: boolean; shareToken: string;
  creator: { id: string; name: string; avatar: string | null };
  photos: TripPhoto[]; participants: TripParticipant[];
  _count: { messages: number; likes: number; participants: number };
  isLiked: boolean; isParticipant?: boolean;
  createdAt: string;
}
interface ChatMessage {
  id: string; content: string | null; type: string; mediaUrl: string | null;
  isDeleted: boolean; createdAt: string;
  user: { id: string; name: string; avatar: string | null };
}

// ═══════════════════════════════════════════════════════════════
// CSS KEYFRAMES
// ═══════════════════════════════════════════════════════════════

const gStyles = `
@keyframes fadeInUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
@keyframes shimmer { 0%{background-position:-200% 0} 100%{background-position:200% 0} }
@keyframes pulseGlow { 0%,100%{box-shadow:0 0 0 0 rgba(0,194,168,0.4)} 50%{box-shadow:0 0 20px 4px rgba(0,194,168,0.15)} }
.aFadeUp{animation:fadeInUp .5s ease-out both}
.aShimmer{background:linear-gradient(90deg,var(--subtle) 25%,var(--subtle-hover) 50%,var(--subtle) 75%);background-size:200% 100%;animation:shimmer 1.5s infinite}
.aPulse{animation:pulseGlow 2.5s ease-in-out infinite}
`;

// ═══════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════

export default function SocialPage() {
  return (
    <Suspense>
      <SocialPageInner />
    </Suspense>
  );
}

function SocialPageInner() {
  const { user } = useAuth();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [hasShare, setHasShare] = useState(true);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'feed' | 'create' | 'detail'>('feed');
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  const [showChat, setShowChat] = useState(false);

  const loadTrips = useCallback(async () => {
    try {
      const { data } = await api.get('/social/trips');
      setHasShare(data.hasShare);
      setTrips(data.trips);
    } catch { }
    setLoading(false);
  }, []);

  const searchParams = useSearchParams();

  useEffect(() => { loadTrips(); }, [loadTrips]);

  const openTrip = useCallback(async (tripId: string) => {
    try {
      const { data } = await api.get(`/social/trips/${tripId}`);
      setSelectedTrip(data);
      setView('detail');
    } catch { }
  }, []);

  // Auto-open trip from query param (e.g. /social?tripId=xxx)
  useEffect(() => {
    const tripId = searchParams.get('tripId');
    if (tripId) openTrip(tripId);
  }, [searchParams, openTrip]);

  if (loading) return <SkeletonFeed />;
  if (!hasShare) return <LockedView />;

  if (view === 'create') return <CreateTrip onBack={() => setView('feed')} onCreated={() => { setView('feed'); loadTrips(); }} />;
  if (view === 'detail' && selectedTrip) {
    if (showChat) return <TripChat trip={selectedTrip} userId={user?.id || ''} onBack={() => setShowChat(false)} />;
    return <TripDetail trip={selectedTrip} userId={user?.id || ''} onBack={() => { setView('feed'); loadTrips(); }} onOpenChat={() => setShowChat(true)} onRefresh={() => openTrip(selectedTrip.id)} />;
  }

  const highlighted = trips.filter(t => t.isHighlighted);
  const regular = trips.filter(t => !t.isHighlighted);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: gStyles }} />
      <div className="-mx-4 -mt-2 pb-6">
        {/* ── HERO HEADER ── */}
        <div className="relative overflow-hidden px-5 pt-4 pb-6" style={{ background: 'linear-gradient(135deg, #0A2540 0%, #0D1B2A 40%, #0A2540 100%)' }}>
          <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full opacity-[0.04]" style={{ background: 'radial-gradient(circle, #00C2A8, transparent 70%)' }} />
          <div className="absolute -bottom-8 -left-8 w-32 h-32 rounded-full opacity-[0.03]" style={{ background: 'radial-gradient(circle, #FFC857, transparent 70%)' }} />

          <div className="relative">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #00C2A8, #007577)' }}>
                <Anchor size={12} className="text-white" />
              </div>
              <span className="text-[10px] font-semibold tracking-[0.15em] uppercase" style={{ color: '#00C2A8' }}>Apenas Membros Prize</span>
            </div>
            <h1 className="text-[22px] font-extrabold text-white tracking-tight leading-tight">Prize Social</h1>
            <p className="text-[13px] mt-0.5" style={{ color: 'rgba(255,255,255,0.45)' }}>Experiências exclusivas no mar</p>
          </div>

        </div>

        <div className="px-4">
          {/* ── HIGHLIGHTED ── */}
          {highlighted.length > 0 && (
            <div className="mt-5 aFadeUp">
              <div className="flex items-center gap-2 mb-3 px-1">
                <Sparkles size={14} style={{ color: '#FFC857' }} />
                <span className="text-xs font-bold text-[var(--text)] tracking-wide uppercase">Em destaque</span>
              </div>
              <div className="space-y-3">
                {highlighted.map((trip, i) => (
                  <div key={trip.id} onClick={() => openTrip(trip.id)} className="aFadeUp" style={{ animationDelay: `${i * 0.1}s` }}>
                    <HeroCard trip={trip} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── ALL TRIPS ── */}
          {regular.length > 0 && (
            <div className="mt-6">
              <div className="flex items-center gap-2 mb-3 px-1">
                <Navigation size={14} className="text-[var(--text-muted)]" />
                <span className="text-xs font-bold text-[var(--text)] tracking-wide uppercase">Todas as Trips</span>
              </div>
              <div className="space-y-4">
                {regular.map((trip, i) => (
                  <div key={trip.id} className="aFadeUp" style={{ animationDelay: `${i * 0.08}s` }}>
                    <TripCard trip={trip} onClick={() => openTrip(trip.id)} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {trips.length === 0 && (
            <div className="text-center py-24 aFadeUp">
              <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ background: 'rgba(0,194,168,0.08)' }}>
                <Navigation size={28} style={{ color: '#00C2A8', opacity: 0.6 }} />
              </div>
              <p className="font-semibold text-[var(--text)] text-sm">Nenhuma trip ainda</p>
              <p className="text-xs mt-1 text-[var(--text-muted)]">Seja o primeiro a criar uma aventura!</p>
            </div>
          )}
        </div>

        {/* FAB — Criar Trip */}
        <button
          onClick={() => setView('create')}
          className="fixed bottom-[84px] right-5 z-40 w-14 h-14 rounded-full flex items-center justify-center text-white active:scale-[0.92] transition-all duration-200"
          style={{ background: 'linear-gradient(135deg, #00C2A8 0%, #007577 100%)', boxShadow: '0 4px 24px rgba(0,194,168,0.35)' }}
        >
          <Plus size={24} strokeWidth={2.5} />
        </button>
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
// SKELETON LOADING
// ═══════════════════════════════════════════════════════════════

function SkeletonFeed() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: gStyles }} />
      <div className="-mx-4 -mt-2 pb-6">
        <div className="px-5 pt-4 pb-6" style={{ background: 'linear-gradient(135deg, #0A2540 0%, #0D1B2A 40%, #0A2540 100%)' }}>
          <div className="w-20 h-3 rounded-full aShimmer mb-2" />
          <div className="w-32 h-6 rounded-lg aShimmer mb-1" />
          <div className="w-44 h-3 rounded-full aShimmer mt-2" />
          <div className="w-28 h-9 rounded-full aShimmer mt-4" />
        </div>
        <div className="px-4 mt-5 space-y-4">
          {[1,2,3].map(i => (<div key={i} className="h-28 aShimmer rounded-[16px]" />))}
        </div>
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
// LOCKED VIEW
// ═══════════════════════════════════════════════════════════════

function LockedView() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: gStyles }} />
      <div className="-mx-4 -mt-2 flex flex-col items-center justify-center min-h-[80vh] px-10 text-center aFadeUp">
        <div className="relative">
          <div className="w-24 h-24 rounded-3xl flex items-center justify-center mb-6" style={{ background: 'linear-gradient(135deg, rgba(0,194,168,0.1), rgba(255,200,87,0.08))' }}>
            <Lock size={36} style={{ color: '#00C2A8', opacity: 0.7 }} />
          </div>
          <div className="absolute -top-1 -right-1 w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #FFC857, #FFAA00)' }}>
            <Crown size={14} className="text-[#0A2540]" />
          </div>
        </div>
        <h2 className="text-xl font-extrabold text-[var(--text)] mb-2 tracking-tight">Sociedade Exclusiva</h2>
        <p className="text-[var(--text-muted)] text-[13px] leading-relaxed max-w-[260px]">
          Prize Social é exclusivo para membros com cota ativa. Experiências limitadas para quem faz parte do clube.
        </p>
        <div className="mt-6 flex items-center gap-2 text-[11px] font-medium" style={{ color: '#00C2A8' }}>
          <Sparkles size={12} />
          <span>Apenas membros Prize Club</span>
        </div>
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
// HERO CARD (Highlighted)
// ═══════════════════════════════════════════════════════════════

function HeroCard({ trip }: { trip: Trip }) {
  const photo = trip.photos[0]?.url;
  return (
    <div className="relative rounded-[16px] overflow-hidden h-28 cursor-pointer active:scale-[0.97] transition-transform duration-200" style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.35)' }}>
      {photo && <img src={resolveMediaUrl(photo)} alt="" className="absolute inset-0 w-full h-full object-cover" />}
      <div className="absolute inset-0" style={{ background: 'linear-gradient(90deg, rgba(10,37,64,0.92) 0%, rgba(10,37,64,0.5) 60%, transparent 100%)' }} />

      {trip.isOfficial && (
        <div className="absolute top-2.5 left-3">
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold tracking-wide text-[#0A2540]" style={{ background: 'linear-gradient(90deg, #FFC857, #FFAA00)' }}>
            <Star size={8} fill="#0A2540" /> OFICIAL
          </span>
        </div>
      )}

      <div className="absolute top-2.5 right-3 flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-semibold text-white" style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)' }}>
        <Users size={9} /> {trip._count.participants}
      </div>

      <div className="absolute bottom-0 left-0 right-0 px-3.5 pb-2.5">
        <h3 className="text-white font-bold text-[14px] leading-tight drop-shadow-lg truncate">{trip.title}</h3>
        <div className="flex items-center gap-3 mt-1">
          <span className="flex items-center gap-1 text-white/60 text-[10px]"><MapPin size={9} /> {trip.destination}</span>
          <span className="flex items-center gap-1 text-white/60 text-[10px]"><Calendar size={9} /> {formatDate(trip.date)}</span>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// TRIP CARD (Regular — Hero Style)
// ═══════════════════════════════════════════════════════════════

function TripCard({ trip, onClick }: { trip: Trip; onClick: () => void }) {
  const photo = trip.photos[0]?.url;
  const isPending = trip.status === 'PENDING';

  return (
    <div onClick={onClick} className="relative rounded-[16px] overflow-hidden cursor-pointer active:scale-[0.97] transition-all duration-200" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.25)' }}>
      <div className="relative h-28">
        {photo ? (
          <img src={resolveMediaUrl(photo)} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #0A2540, #1A3A5C)' }}>
            <Navigation size={40} className="text-white/10" />
          </div>
        )}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(0deg, rgba(10,37,64,0.92) 0%, rgba(10,37,64,0.4) 50%, rgba(10,37,64,0.15) 100%)' }} />

        {/* Badges */}
        <div className="absolute top-3 left-3 flex items-center gap-2">
          {trip.isOfficial && (
            <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wide text-[#0A2540]" style={{ background: 'linear-gradient(90deg, #FFC857, #FFAA00)', boxShadow: '0 2px 8px rgba(255,200,87,0.3)' }}>
              <Star size={10} fill="#0A2540" /> OFICIAL
            </span>
          )}
          {isPending && (
            <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold text-amber-100" style={{ background: 'rgba(245,158,11,0.8)', backdropFilter: 'blur(8px)' }}>
              <Clock size={10} /> PENDENTE
            </span>
          )}
        </div>

        {/* Stats */}
        <div className="absolute top-3 right-3 flex items-center gap-2">
          <span className="flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium text-white" style={{ background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(8px)' }}>
            <Heart size={10} className={trip.isLiked ? 'fill-red-400 text-red-400' : ''} /> {trip._count.likes}
          </span>
          <span className="flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium text-white" style={{ background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(8px)' }}>
            <MessageCircle size={10} /> {trip._count.messages}
          </span>
        </div>

        {/* Content */}
        <div className="absolute inset-0 flex items-end p-3.5">
          <div className="flex-1 min-w-0">
            <h3 className="text-white font-bold text-[14px] leading-tight truncate">{trip.title}</h3>
            <div className="flex items-center gap-2.5 mt-1 text-white/50 text-[10px]">
              <span className="flex items-center gap-1"><MapPin size={9} />{trip.destination}</span>
              <span className="flex items-center gap-1"><Calendar size={9} />{formatDate(trip.date)}</span>
              <span className="flex items-center gap-1"><Users size={9} />{trip._count.participants}{trip.maxParticipants ? `/${trip.maxParticipants}` : ''}</span>
            </div>
          </div>
          <ChevronRight size={16} className="text-white/30 shrink-0 ml-2" />
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// TRIP DETAIL
// ═══════════════════════════════════════════════════════════════

function TripDetail({ trip, userId, onBack, onOpenChat, onRefresh }: {
  trip: Trip; userId: string; onBack: () => void; onOpenChat: () => void; onRefresh: () => void;
}) {
  const [joining, setJoining] = useState(false);
  const [liking, setLiking] = useState(false);
  const [liked, setLiked] = useState(trip.isLiked);
  const [likeCount, setLikeCount] = useState(trip._count.likes);
  const [showAllP, setShowAllP] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const isParticipant = trip.isParticipant || trip.participants?.some(p => p.userId === userId);
  const isCreator = trip.creator.id === userId;

  const handleJoin = async () => {
    setJoining(true);
    try { await api.post(`/social/trips/${trip.id}/join`); onRefresh(); } catch { }
    setJoining(false);
  };

  const handleLeave = async () => {
    try { await api.post(`/social/trips/${trip.id}/leave`); onRefresh(); } catch { }
  };

  const handleLike = async () => {
    setLiking(true);
    try {
      const { data } = await api.post(`/social/trips/${trip.id}/like`);
      setLiked(data.liked);
      setLikeCount(prev => data.liked ? prev + 1 : prev - 1);
    } catch { }
    setLiking(false);
  };

  const handleShare = async () => {
    const url = `${window.location.origin}/social/share/${trip.shareToken}`;
    if (navigator.share) {
      await navigator.share({ title: trip.title, text: trip.description || `Venha para a trip ${trip.title}!`, url });
    } else {
      navigator.clipboard.writeText(url);
    }
  };

  const showJoinBtn = !isParticipant && !isCreator && trip.status === 'APPROVED';

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: gStyles }} />
      <div className="-mx-4 -mt-2 pb-28 aFadeUp">
        {/* ── HERO ── */}
        <div className="relative h-[56vh] min-h-[340px] max-h-[440px] overflow-hidden">
          {trip.photos.length > 0 ? (
            <div className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide h-full">
              {trip.photos.map(p => (
                <img key={p.id} src={resolveMediaUrl(p.url)} alt="" className="w-full h-full object-cover snap-start shrink-0" />
              ))}
            </div>
          ) : (
            <div className="w-full h-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #0A2540, #1A3A5C)' }}>
              <Navigation size={48} className="text-white/10" />
            </div>
          )}

          <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(0deg, var(--bg) 0%, rgba(13,27,42,0.4) 40%, rgba(0,0,0,0.2) 60%, rgba(0,0,0,0.3) 100%)' }} />

          {/* Nav buttons */}
          <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 pt-3 safe-area-top z-10">
            <button onClick={onBack} className="w-9 h-9 rounded-full flex items-center justify-center text-white active:scale-90 transition" style={{ background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(12px)' }}>
              <ChevronLeft size={20} />
            </button>
            <button onClick={handleShare} className="w-9 h-9 rounded-full flex items-center justify-center text-white active:scale-90 transition" style={{ background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(12px)' }}>
              <Share2 size={16} />
            </button>
          </div>

          {trip.photos.length > 1 && (
            <div className="absolute bottom-20 right-4 px-2.5 py-1 rounded-full text-[10px] font-medium text-white z-10" style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)' }}>
              {trip.photos.length} fotos
            </div>
          )}

          {/* Title overlay */}
          <div className="absolute bottom-0 left-0 right-0 px-5 pb-5 z-10">
            <div className="flex items-center gap-2 mb-2">
              {trip.isOfficial && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold text-[#0A2540]" style={{ background: 'linear-gradient(90deg, #FFC857, #FFAA00)', boxShadow: '0 2px 12px rgba(255,200,87,0.3)' }}>
                  <Crown size={10} fill="#0A2540" /> TRIP OFICIAL PRIZE
                </span>
              )}
              {trip.status === 'PENDING' && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold text-amber-100" style={{ background: 'rgba(245,158,11,0.8)' }}>
                  <Clock size={10} /> Aguardando aprovação
                </span>
              )}
            </div>
            <h1 className="text-2xl font-extrabold text-white leading-tight tracking-tight drop-shadow-lg">{trip.title}</h1>
            <div className="flex items-center gap-2 mt-2">
              {trip.creator.avatar ? (
                <img src={resolveMediaUrl(trip.creator.avatar)} alt="" className="w-7 h-7 rounded-full object-cover ring-2 ring-white/20" />
              ) : (
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold ring-2 ring-white/20" style={{ background: 'linear-gradient(135deg, #00C2A8, #007577)', color: 'white' }}>
                  {trip.creator.name[0]}
                </div>
              )}
              <span className="text-xs text-white/60 font-medium">Organizado por <span className="text-white/80">{trip.creator.name}</span></span>
            </div>
          </div>
        </div>

        {/* ── CONTENT ── */}
        <div className="px-5 -mt-1 space-y-5">

          {/* Toggle details button */}
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[13px] font-semibold transition-all active:scale-[0.97]"
            style={{ background: 'var(--subtle)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
          >
            <Eye size={15} /> {showDetails ? 'Ocultar detalhes' : 'Exibir mais detalhes'}
          </button>

          {showDetails && (
            <div className="space-y-5 aFadeUp">
          {trip.description && (
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{trip.description}</p>
          )}

          {/* Info */}
          <div className="rounded-xl overflow-hidden" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2.5 px-4 py-2.5" style={{ borderBottom: '1px solid var(--border)' }}>
              <MapPin size={14} style={{ color: '#00C2A8', flexShrink: 0 }} />
              <span className="text-[11px] text-[var(--text-muted)] shrink-0">Encontro</span>
              <span className="text-[12px] font-semibold text-[var(--text)] ml-auto text-right truncate">{trip.meetingPoint}</span>
            </div>
            <div className="flex items-center gap-2.5 px-4 py-2.5" style={{ borderBottom: '1px solid var(--border)' }}>
              <Navigation size={14} style={{ color: '#00C2A8', flexShrink: 0 }} />
              <span className="text-[11px] text-[var(--text-muted)] shrink-0">Destino</span>
              <span className="text-[12px] font-semibold text-[var(--text)] ml-auto text-right truncate">{trip.destination}</span>
            </div>
            <div className="flex items-center gap-2.5 px-4 py-2.5" style={{ borderBottom: '1px solid var(--border)' }}>
              <Calendar size={14} style={{ color: '#FFC857', flexShrink: 0 }} />
              <span className="text-[11px] text-[var(--text-muted)] shrink-0">Data</span>
              <span className="text-[12px] font-semibold text-[var(--text)] ml-auto text-right">{formatDate(trip.date)}{trip.time ? ` · ${trip.time}` : ''}</span>
            </div>
            <div className="flex items-center gap-2.5 px-4 py-2.5">
              <Users size={14} style={{ color: '#00C2A8', flexShrink: 0 }} />
              <span className="text-[11px] text-[var(--text-muted)] shrink-0">Participantes</span>
              <span className="text-[12px] font-semibold text-[var(--text)] ml-auto text-right">{trip._count.participants}{trip.maxParticipants ? ` / ${trip.maxParticipants}` : ''} confirmados</span>
            </div>
          </div>

          </div>
          )}

          {/* Participants - always visible */}
          {trip.participants && trip.participants.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-bold text-[var(--text)] tracking-wide uppercase">Quem vai</p>
                {trip.participants.length > 6 && (
                  <button onClick={() => setShowAllP(!showAllP)} className="text-[11px] font-semibold flex items-center gap-1" style={{ color: '#00C2A8' }}>
                    {showAllP ? 'Menos' : 'Ver todos'} <ChevronRight size={12} />
                  </button>
                )}
              </div>
              <div className="flex items-center">
                <div className="flex -space-x-2.5">
                  {(showAllP ? trip.participants : trip.participants.slice(0, 8)).map(p => (
                    p.user.avatar ? (
                      <img key={p.id} src={resolveMediaUrl(p.user.avatar)} alt={p.user.name} title={p.user.name} className="w-9 h-9 rounded-full object-cover ring-[2.5px] ring-[var(--bg)]" />
                    ) : (
                      <div key={p.id} title={p.user.name} className="w-9 h-9 rounded-full flex items-center justify-center text-[10px] font-bold ring-[2.5px] ring-[var(--bg)]" style={{ background: 'linear-gradient(135deg, #00C2A8, #007577)', color: 'white' }}>
                        {p.user.name[0]}
                      </div>
                    )
                  ))}
                </div>
                {!showAllP && trip.participants.length > 8 && (
                  <div className="w-9 h-9 -ml-2.5 rounded-full flex items-center justify-center text-[10px] font-bold ring-[2.5px] ring-[var(--bg)]" style={{ background: 'rgba(0,194,168,0.15)', color: '#00C2A8' }}>
                    +{trip.participants.length - 8}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Action Pills */}
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={handleLike} disabled={liking}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-full text-[13px] font-semibold transition-all active:scale-[0.94]"
              style={{ background: liked ? 'rgba(239,68,68,0.12)' : 'var(--subtle)', color: liked ? '#EF4444' : 'var(--text-muted)', border: `1px solid ${liked ? 'rgba(239,68,68,0.2)' : 'var(--border)'}` }}>
              <Heart size={15} className={liked ? 'fill-red-500' : ''} /> {likeCount}
            </button>

            <button onClick={onOpenChat}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-full text-[13px] font-semibold transition-all active:scale-[0.94]"
              style={{ background: 'var(--subtle)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
              <MessageCircle size={15} /> Chat {trip._count.messages > 0 && `(${trip._count.messages})`}
            </button>

            {isParticipant && !isCreator && (
              <button onClick={handleLeave}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-full text-[13px] font-semibold transition-all active:scale-[0.94]"
                style={{ background: 'rgba(239,68,68,0.08)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.15)' }}>
                Sair
              </button>
            )}

            {(isParticipant || isCreator) && (
              <span className="flex items-center gap-1 px-3 py-2 rounded-full text-[11px] font-semibold" style={{ background: 'rgba(0,194,168,0.1)', color: '#00C2A8' }}>
                <Check size={12} /> {isCreator ? 'Organizador' : 'Confirmado'}
              </span>
            )}
          </div>

          <div className="flex items-center justify-center gap-2 py-2 text-[10px] font-medium text-[var(--text-muted)]">
            <Lock size={10} /><span>Experiência exclusiva para membros Prize Club</span>
          </div>
        </div>

        {/* Fixed Bottom CTA */}
        {showJoinBtn && (
          <div className="fixed bottom-[72px] left-0 right-0 z-40 px-5 pb-3 pt-3 safe-area-bottom" style={{ background: 'linear-gradient(0deg, var(--bg) 60%, transparent 100%)' }}>
            <button onClick={handleJoin} disabled={joining}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-white text-[15px] font-bold tracking-wide active:scale-[0.97] transition-all duration-200 aPulse"
              style={{ background: 'linear-gradient(135deg, #00C2A8 0%, #007577 100%)', boxShadow: '0 4px 24px rgba(0,194,168,0.35)' }}>
              {joining ? <Loader2 size={18} className="animate-spin" /> : <><Navigation size={18} /> Entrar na Trip</>}
            </button>
          </div>
        )}
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
// CREATE TRIP
// ═══════════════════════════════════════════════════════════════

function CreateTrip({ onBack, onCreated }: { onBack: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ title: '', meetingPoint: '', destination: '', date: '', time: '', maxParticipants: '' });
  const [photos, setPhotos] = useState<string[]>([]);
  const [stops, setStops] = useState<string[]>([]);
  const [newStop, setNewStop] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') setPhotos(prev => [...prev, reader.result as string]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removePhoto = (i: number) => setPhotos(prev => prev.filter((_, idx) => idx !== i));
  const addStop = () => { if (newStop.trim()) { setStops(prev => [...prev, newStop.trim()]); setNewStop(''); } };

  const handleSubmit = async () => {
    if (!form.title || !form.meetingPoint || !form.destination || !form.date || photos.length === 0) return;
    setSubmitting(true);
    try {
      await api.post('/social/trips', {
        ...form,
        maxParticipants: form.maxParticipants ? parseInt(form.maxParticipants) : null,
        photos,
        stops: stops.map(s => ({ name: s })),
      });
      onCreated();
    } catch { }
    setSubmitting(false);
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: gStyles }} />
      <div className="-mx-4 -mt-2 pb-24 aFadeUp">
        <div className="sticky top-0 z-50 px-4 py-3 flex items-center gap-3 safe-area-top" style={{ background: 'var(--header-bg)', backdropFilter: 'blur(12px)', borderBottom: '1px solid var(--border)' }}>
          <button onClick={onBack} className="p-1"><ChevronLeft size={22} className="text-[var(--text)]" /></button>
          <div>
            <h2 className="text-sm font-bold text-[var(--text)]">Nova Trip</h2>
            <p className="text-[10px] text-[var(--text-muted)]">Crie uma experiência no mar</p>
          </div>
        </div>

        <div className="px-5 space-y-4 mt-4">
          <CField label="Nome da Trip" value={form.title} onChange={v => setForm(f => ({ ...f, title: v }))} placeholder="Ex: Passeio até Ilha Grande" />
          <CField label="Ponto de Encontro" value={form.meetingPoint} onChange={v => setForm(f => ({ ...f, meetingPoint: v }))} placeholder="Ex: Marina Prize Club" />
          <CField label="Destino" value={form.destination} onChange={v => setForm(f => ({ ...f, destination: v }))} placeholder="Ex: Ilha Grande" />

          <div className="grid grid-cols-2 gap-3">
            <CField label="Data" type="date" value={form.date} onChange={v => setForm(f => ({ ...f, date: v }))} />
            <CField label="Horário" type="time" value={form.time} onChange={v => setForm(f => ({ ...f, time: v }))} />
          </div>

          <CField label="Máx. Participantes (opcional)" type="number" value={form.maxParticipants} onChange={v => setForm(f => ({ ...f, maxParticipants: v }))} placeholder="Sem limite" />

          {/* Stops */}
          <div>
            <label className="text-[11px] font-bold text-[var(--text)] mb-1.5 block uppercase tracking-wide">Paradas (opcional)</label>
            <div className="flex gap-2">
              <input value={newStop} onChange={e => setNewStop(e.target.value)} placeholder="Ex: Praia do Aventureiro" className="flex-1 bg-[var(--subtle)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)]" />
              <button onClick={addStop} className="px-3.5 py-2.5 rounded-xl text-sm font-bold" style={{ background: 'rgba(0,194,168,0.1)', color: '#00C2A8' }}>+</button>
            </div>
            {stops.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {stops.map((s, i) => (
                  <span key={i} className="inline-flex items-center gap-1 text-[var(--text)] text-xs px-3 py-1.5 rounded-full" style={{ background: 'var(--subtle)', border: '1px solid var(--border)' }}>
                    <MapPin size={10} style={{ color: '#00C2A8' }} /> {s}
                    <X size={12} className="cursor-pointer text-[var(--text-muted)] ml-1" onClick={() => setStops(prev => prev.filter((_, idx) => idx !== i))} />
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Photos */}
          <div>
            <label className="text-[11px] font-bold text-[var(--text)] mb-1.5 block uppercase tracking-wide">Fotos (mínimo 1)</label>
            <input ref={fileRef} type="file" accept="image/*" multiple onChange={handlePhoto} className="hidden" />
            <div className="flex gap-2.5 overflow-x-auto pb-2">
              {photos.map((p, i) => (
                <div key={i} className="relative min-w-[88px] h-20 rounded-2xl overflow-hidden shrink-0" style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.15)' }}>
                  <img src={p} alt="" className="w-full h-full object-cover" />
                  <button onClick={() => removePhoto(i)} className="absolute top-1.5 right-1.5 bg-black/60 rounded-full p-0.5 backdrop-blur-sm"><X size={12} className="text-white" /></button>
                </div>
              ))}
              <button onClick={() => fileRef.current?.click()} className="min-w-[88px] h-20 rounded-2xl border-2 border-dashed flex items-center justify-center" style={{ borderColor: 'rgba(0,194,168,0.3)', color: '#00C2A8' }}>
                <Camera size={22} />
              </button>
            </div>
          </div>

          <button onClick={handleSubmit}
            disabled={submitting || !form.title || !form.meetingPoint || !form.destination || !form.date || photos.length === 0}
            className="w-full py-3.5 rounded-2xl font-bold text-[15px] text-white disabled:opacity-40 active:scale-[0.97] transition-all duration-200"
            style={{ background: 'linear-gradient(135deg, #00C2A8 0%, #007577 100%)', boxShadow: '0 4px 20px rgba(0,194,168,0.25)' }}>
            {submitting ? <Loader2 size={18} className="animate-spin mx-auto" /> : 'Criar Trip'}
          </button>

          <div className="flex items-center justify-center gap-2 text-[10px] text-[var(--text-muted)] font-medium">
            <Sparkles size={10} /><span>Sua trip será analisada pela equipe Prize</span>
          </div>
        </div>
      </div>
    </>
  );
}

function CField({ label, value, onChange, placeholder, type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <div>
      <label className="text-[11px] font-bold text-[var(--text)] mb-1.5 block uppercase tracking-wide">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full bg-[var(--subtle)] border border-[var(--border)] rounded-xl px-3.5 py-3 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:border-[#00C2A8] focus:ring-1 focus:ring-[#00C2A8]/20 transition-all" />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// CHAT
// ═══════════════════════════════════════════════════════════════

function TripChat({ trip, userId, onBack }: { trip: Trip; userId: string; onBack: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.get(`/social/trips/${trip.id}/messages`).then(({ data }) => {
      setMessages(data.messages);
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    });

    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    const socket = io(`${WS_URL}/social`, { auth: { token }, transports: ['websocket'] });
    socketRef.current = socket;

    socket.on('connect', () => { socket.emit('joinTrip', { tripId: trip.id }); });
    socket.on('newMessage', (msg: ChatMessage) => {
      setMessages(prev => {
        if (prev.some(m => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    });

    return () => { socket.emit('leaveTrip', { tripId: trip.id }); socket.disconnect(); };
  }, [trip.id]);

  const send = async () => {
    if (!text.trim()) return;
    setSending(true);
    const content = text;
    setText('');
    try { socketRef.current?.emit('sendMessage', { tripId: trip.id, content, type: 'TEXT' }); } catch { }
    setSending(false);
  };

  const sendImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      socketRef.current?.emit('sendMessage', { tripId: trip.id, mediaBase64: reader.result as string, type: 'IMAGE' });
    };
    reader.readAsDataURL(file);
  };

  const toggleRecording = async () => {
    if (recording) { mediaRecorderRef.current?.stop(); setRecording(false); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      const chunks: Blob[] = [];
      recorder.ondataavailable = e => chunks.push(e.data);
      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunks, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onload = () => { socketRef.current?.emit('sendMessage', { tripId: trip.id, mediaBase64: reader.result as string, type: 'AUDIO' }); };
        reader.readAsDataURL(blob);
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch { }
  };

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-[var(--bg)]">
      <div className="px-4 py-3 flex items-center gap-3 safe-area-top shrink-0" style={{ background: 'var(--header-bg)', backdropFilter: 'blur(12px)', borderBottom: '1px solid var(--border)' }}>
        <button onClick={onBack} className="p-1"><ChevronLeft size={22} className="text-[var(--text)]" /></button>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-bold text-[var(--text)] truncate">{trip.title}</h2>
          <p className="text-[10px] text-[var(--text-muted)]">{trip._count.participants} participantes</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <MessageCircle size={32} className="text-[var(--text-muted)] opacity-30 mb-2" />
            <p className="text-xs text-[var(--text-muted)]">Nenhuma mensagem ainda</p>
            <p className="text-[10px] text-[var(--text-muted)] mt-0.5">Seja o primeiro a enviar!</p>
          </div>
        )}
        {messages.map(msg => (
          <MessageBubble key={msg.id} msg={msg} isOwn={msg.user.id === userId} />
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="border-t px-3 py-2 safe-area-bottom shrink-0" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-2 max-w-lg mx-auto">
          <input ref={fileInputRef} type="file" accept="image/*" onChange={sendImage} className="hidden" />
          <button onClick={() => fileInputRef.current?.click()} className="p-2 text-[var(--text-muted)] active:scale-90 transition"><ImageIcon size={20} /></button>
          <button onClick={toggleRecording} className={`p-2 active:scale-90 transition ${recording ? 'text-red-500 animate-pulse' : 'text-[var(--text-muted)]'}`}>
            {recording ? <MicOff size={20} /> : <Mic size={20} />}
          </button>
          <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} placeholder="Mensagem..."
            className="flex-1 bg-[var(--subtle)] border border-[var(--border)] rounded-full px-4 py-2.5 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:border-[#00C2A8] transition" />
          <button onClick={send} disabled={!text.trim() || sending} className="p-2 disabled:opacity-30 active:scale-90 transition" style={{ color: '#00C2A8' }}><Send size={20} /></button>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ msg, isOwn }: { msg: ChatMessage; isOwn: boolean }) {
  if (msg.isDeleted) {
    return (
      <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
        <div className="rounded-2xl px-3 py-2 max-w-[80%] opacity-50" style={{ background: 'var(--subtle)' }}>
          <p className="text-xs italic text-[var(--text-muted)]">Mensagem apagada</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'} gap-2`}>
      {!isOwn && (
        msg.user.avatar ? (
          <img src={resolveMediaUrl(msg.user.avatar)} alt="" className="w-7 h-7 rounded-full object-cover shrink-0 mt-1" />
        ) : (
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 mt-1" style={{ background: 'linear-gradient(135deg, #00C2A8, #007577)', color: 'white' }}>
            {msg.user.name[0]}
          </div>
        )
      )}
      <div className={`rounded-2xl px-3.5 py-2.5 max-w-[80%] ${isOwn ? 'text-white' : 'text-[var(--text)]'}`}
        style={{ background: isOwn ? 'linear-gradient(135deg, #00C2A8, #007577)' : 'var(--card)', border: isOwn ? 'none' : '1px solid var(--border)', boxShadow: isOwn ? '0 2px 8px rgba(0,194,168,0.2)' : 'none' }}>
        {!isOwn && <p className="text-[10px] font-semibold mb-0.5 opacity-60">{msg.user.name}</p>}
        {msg.type === 'IMAGE' && msg.mediaUrl && (
          <img src={resolveMediaUrl(msg.mediaUrl)} alt="" className="rounded-xl max-w-full max-h-48 object-cover mb-1" />
        )}
        {msg.type === 'AUDIO' && msg.mediaUrl && (
          <audio controls src={resolveMediaUrl(msg.mediaUrl)} className="max-w-[200px]" />
        )}
        {msg.content && <p className="text-sm break-words leading-relaxed">{msg.content}</p>}
        <p className={`text-[9px] mt-1 ${isOwn ? 'text-white/50' : 'text-[var(--text-muted)]'} text-right`}>
          {format(new Date(msg.createdAt), 'HH:mm')}
        </p>
      </div>
    </div>
  );
}
