'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { MapPin, Calendar, Users, Navigation, Star, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.marinaprizeclub.com/api/v1';
const API_ORIGIN = API_URL.replace(/\/api\/v1$/, '');

function resolveMediaUrl(url: string | undefined | null): string {
  if (!url) return '';
  if (url.startsWith('/uploads/')) return `${API_ORIGIN}${url}`;
  return url;
}

export default function SharePage() {
  const params = useParams();
  const token = params.token as string;
  const [trip, setTrip] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_URL}/social/share/${token}`)
      .then(r => r.json())
      .then(setTrip)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-b from-blue-950 to-black">
      <Loader2 className="animate-spin text-blue-400" size={32} />
    </div>
  );

  if (!trip) return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-b from-blue-950 to-black text-white text-center px-8">
      <div>
        <Navigation size={48} className="mx-auto mb-4 text-blue-400 opacity-60" />
        <h1 className="text-xl font-bold mb-2">Trip não encontrada</h1>
        <p className="text-blue-200/60 text-sm">Este link pode ter expirado ou não existe mais.</p>
      </div>
    </div>
  );

  const photo = trip.photos?.[0]?.url;

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-950 via-blue-900 to-black text-white">
      {/* Hero */}
      <div className="relative h-[50vh] overflow-hidden">
        {photo && <img src={resolveMediaUrl(photo)} alt="" className="absolute inset-0 w-full h-full object-cover" />}
        <div className="absolute inset-0 bg-gradient-to-t from-blue-950 via-blue-950/40 to-transparent" />

        {trip.isOfficial && (
          <div className="absolute top-6 left-6 flex items-center gap-1.5 bg-amber-500/90 backdrop-blur-sm text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg">
            <Star size={14} fill="white" /> TRIP OFICIAL PRIZE
          </div>
        )}

        <div className="absolute bottom-0 left-0 right-0 p-6">
          <div className="max-w-lg mx-auto">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-5 h-5 rounded-full bg-blue-400/20 flex items-center justify-center">
                <Navigation size={10} className="text-blue-300" />
              </div>
              <span className="text-xs text-blue-300 font-medium tracking-wider uppercase">Prize Social Club</span>
            </div>
            <h1 className="text-3xl font-extrabold leading-tight">{trip.title}</h1>
            <div className="flex items-center gap-2 mt-2">
              {trip.creator?.avatar ? (
                <img src={resolveMediaUrl(trip.creator.avatar)} alt="" className="w-6 h-6 rounded-full object-cover" />
              ) : (
                <div className="w-6 h-6 rounded-full bg-blue-400/20 flex items-center justify-center text-xs font-bold text-blue-300">
                  {trip.creator?.name?.[0]}
                </div>
              )}
              <span className="text-sm text-blue-200/80">Organizado por {trip.creator?.name}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-lg mx-auto px-6 py-8 space-y-6">
        {trip.description && (
          <p className="text-blue-100/80 text-sm leading-relaxed">{trip.description}</p>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
            <div className="flex items-center gap-2 text-blue-300 mb-1">
              <MapPin size={14} /> <span className="text-xs font-medium">Encontro</span>
            </div>
            <p className="text-sm font-semibold">{trip.meetingPoint}</p>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
            <div className="flex items-center gap-2 text-blue-300 mb-1">
              <Navigation size={14} /> <span className="text-xs font-medium">Destino</span>
            </div>
            <p className="text-sm font-semibold">{trip.destination}</p>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
            <div className="flex items-center gap-2 text-blue-300 mb-1">
              <Calendar size={14} /> <span className="text-xs font-medium">Data</span>
            </div>
            <p className="text-sm font-semibold">
              {format(new Date(trip.date), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
              {trip.time && ` • ${trip.time}`}
            </p>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
            <div className="flex items-center gap-2 text-blue-300 mb-1">
              <Users size={14} /> <span className="text-xs font-medium">Participantes</span>
            </div>
            <p className="text-sm font-semibold">{trip._count?.participants || 0} confirmados</p>
          </div>
        </div>

        {/* Photos gallery */}
        {trip.photos?.length > 1 && (
          <div className="grid grid-cols-2 gap-2">
            {trip.photos.slice(1, 5).map((p: any) => (
              <img key={p.id} src={resolveMediaUrl(p.url)} alt="" className="w-full h-32 object-cover rounded-xl" />
            ))}
          </div>
        )}

        {/* CTA */}
        <div className="text-center pt-4 space-y-3">
          <a
            href="https://app.marinaprizeclub.com/social"
            className="inline-block px-8 py-3 bg-blue-500 hover:bg-blue-400 text-white rounded-full font-semibold text-sm shadow-xl shadow-blue-500/30 transition"
          >
            Ver no Prize Social
          </a>
          <p className="text-blue-200/40 text-xs">
            Exclusivo para membros Prize Club
          </p>
        </div>

        {/* Footer */}
        <div className="text-center pt-8 pb-4 border-t border-white/10">
          <p className="text-blue-200/30 text-xs">Prize Social Club © {new Date().getFullYear()}</p>
        </div>
      </div>
    </div>
  );
}
