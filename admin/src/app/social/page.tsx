'use client';

import React, { useState, useEffect, useCallback } from 'react';
import api, { resolveStaticUrl } from '@/services/api';
import {
  Compass, Check, X, Star, Crown, Trash2, Eye, MessageCircle,
  Users, Calendar, MapPin, ChevronDown, Loader2, Navigation,
  Clock, Shield, AlertTriangle, Pencil, Save, Upload, XCircle, Image as ImageIcon,
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const API_ORIGIN = (process.env.NEXT_PUBLIC_API_URL || 'https://api.marinaprizeclub.com/api/v1').replace(/\/api\/v1$/, '');
function resolveMediaUrl(url: string | undefined | null): string {
  if (!url) return '';
  if (url.startsWith('/uploads/')) return `${API_ORIGIN}${url}`;
  return url;
}

interface Trip {
  id: string; title: string; description?: string; meetingPoint: string; destination: string;
  date: string; time?: string; status: string; isOfficial: boolean; isHighlighted: boolean;
  shareToken: string; maxParticipants?: number;
  creator: { id: string; name: string; avatar?: string; phone?: string; email?: string };
  photos: { id: string; url: string; order: number }[];
  participants?: { id: string; user: { id: string; name: string; avatar?: string; phone?: string }; joinedAt: string }[];
  messages?: { id: string; content?: string; type: string; mediaUrl?: string; isDeleted: boolean; createdAt: string; user: { id: string; name: string; avatar?: string } }[];
  _count: { participants: number; messages: number; likes: number };
  createdAt: string;
}

export default function SocialAdminPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('');
  const [selected, setSelected] = useState<Trip | null>(null);
  const [tab, setTab] = useState<'info' | 'participants' | 'chat'>('info');

  const loadTrips = useCallback(async () => {
    try {
      const { data } = await api.get('/social/admin/trips', { params: filter ? { status: filter } : {} });
      setTrips(data);
    } catch { }
    setLoading(false);
  }, [filter]);

  useEffect(() => { loadTrips(); }, [loadTrips]);

  const openTrip = async (id: string) => {
    try {
      const { data } = await api.get(`/social/admin/trips/${id}`);
      setSelected(data);
      setTab('info');
    } catch { }
  };

  const approveTrip = async (id: string) => {
    await api.patch(`/social/admin/trips/${id}/approve`);
    loadTrips();
    if (selected?.id === id) openTrip(id);
  };

  const rejectTrip = async (id: string) => {
    await api.patch(`/social/admin/trips/${id}/reject`);
    loadTrips();
    if (selected?.id === id) openTrip(id);
  };

  const toggleHighlight = async (id: string) => {
    await api.patch(`/social/admin/trips/${id}/highlight`);
    loadTrips();
    if (selected?.id === id) openTrip(id);
  };

  const toggleOfficial = async (id: string) => {
    await api.patch(`/social/admin/trips/${id}/official`);
    loadTrips();
    if (selected?.id === id) openTrip(id);
  };

  const deleteTrip = async (id: string) => {
    if (!confirm('Deletar esta trip permanentemente?')) return;
    await api.delete(`/social/admin/trips/${id}`);
    setSelected(null);
    loadTrips();
  };

  const deleteMessage = async (msgId: string) => {
    await api.delete(`/social/admin/messages/${msgId}`);
    if (selected) openTrip(selected.id);
  };

  const pendingCount = trips.filter(t => t.status === 'PENDING').length;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
            <Compass size={20} className="text-blue-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Prize Social</h1>
            <p className="text-sm text-gray-500">Gerenciar trips e conversas</p>
          </div>
        </div>
        {pendingCount > 0 && (
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 px-3 py-1.5 rounded-full text-sm font-medium">
            <Clock size={14} />
            {pendingCount} pendente{pendingCount > 1 ? 's' : ''}
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4">
        {[
          { value: '', label: 'Todas' },
          { value: 'PENDING', label: 'Pendentes' },
          { value: 'APPROVED', label: 'Aprovadas' },
          { value: 'REJECTED', label: 'Rejeitadas' },
        ].map(f => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${filter === f.value ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Trip list */}
        <div className="lg:col-span-1 space-y-3 max-h-[80vh] overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="animate-spin text-gray-400" size={24} /></div>
          ) : trips.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <Navigation size={32} className="mx-auto mb-2" />
              <p className="text-sm">Nenhuma trip encontrada</p>
            </div>
          ) : trips.map(trip => (
            <div
              key={trip.id}
              onClick={() => openTrip(trip.id)}
              className={`bg-white rounded-xl border p-3 cursor-pointer transition hover:shadow-md ${selected?.id === trip.id ? 'border-blue-500 ring-2 ring-blue-100' : 'border-gray-200'}`}
            >
              <div className="flex gap-3">
                {trip.photos[0] && (
                  <img src={resolveMediaUrl(trip.photos[0].url)} alt="" className="w-16 h-16 rounded-lg object-cover shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                    {trip.isOfficial && <Star size={12} className="text-amber-500 shrink-0" fill="currentColor" />}
                    {trip.isHighlighted && <Crown size={12} className="text-amber-500 shrink-0" />}
                    <StatusBadge status={trip.status} />
                  </div>
                  <h3 className="font-semibold text-sm text-gray-900 truncate">{trip.title}</h3>
                  <p className="text-xs text-gray-500 truncate">{trip.creator.name} • {trip.destination}</p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                    <span className="flex items-center gap-0.5"><Users size={10} />{trip._count.participants}</span>
                    <span className="flex items-center gap-0.5"><MessageCircle size={10} />{trip._count.messages}</span>
                    <span>{format(new Date(trip.date), 'dd/MM/yy')}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Detail panel */}
        <div className="lg:col-span-2">
          {!selected ? (
            <div className="bg-white rounded-xl border border-gray-200 flex items-center justify-center h-96 text-gray-400">
              <div className="text-center">
                <Eye size={32} className="mx-auto mb-2" />
                <p className="text-sm">Selecione uma trip para ver os detalhes</p>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {/* Trip photos */}
              {selected.photos.length > 0 && (
                <div className="flex overflow-x-auto">
                  {selected.photos.map(p => (
                    <img key={p.id} src={resolveMediaUrl(p.url)} alt="" className="h-48 w-auto object-cover shrink-0" />
                  ))}
                </div>
              )}

              {/* Actions bar */}
              <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2 flex-wrap">
                {selected.status === 'PENDING' && (
                  <>
                    <button onClick={() => approveTrip(selected.id)} className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition">
                      <Check size={14} /> Aprovar
                    </button>
                    <button onClick={() => rejectTrip(selected.id)} className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition">
                      <X size={14} /> Rejeitar
                    </button>
                  </>
                )}
                <button onClick={() => toggleHighlight(selected.id)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition ${selected.isHighlighted ? 'bg-amber-50 border-amber-200 text-amber-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                  <Crown size={14} /> {selected.isHighlighted ? 'Destacada' : 'Destacar'}
                </button>
                <button onClick={() => toggleOfficial(selected.id)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition ${selected.isOfficial ? 'bg-amber-50 border-amber-200 text-amber-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                  <Star size={14} /> {selected.isOfficial ? 'Oficial' : 'Marcar Oficial'}
                </button>
                <div className="flex-1" />
                <button onClick={() => deleteTrip(selected.id)} className="flex items-center gap-1.5 px-3 py-1.5 text-red-600 hover:bg-red-50 rounded-lg text-sm transition">
                  <Trash2 size={14} /> Deletar
                </button>
              </div>

              {/* Tabs */}
              <div className="flex border-b border-gray-100">
                {(['info', 'participants', 'chat'] as const).map(t => (
                  <button key={t} onClick={() => setTab(t)} className={`px-4 py-2.5 text-sm font-medium border-b-2 transition ${tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                    {t === 'info' ? 'Informações' : t === 'participants' ? `Participantes (${selected._count.participants})` : `Chat (${selected._count.messages})`}
                  </button>
                ))}
              </div>

              <div className="p-4 max-h-[50vh] overflow-y-auto">
                {tab === 'info' && <TripInfo trip={selected} onSaved={(t) => { setSelected(t); loadTrips(); }} />}
                {tab === 'participants' && <TripParticipants trip={selected} />}
                {tab === 'chat' && <TripMessages trip={selected} onDeleteMessage={deleteMessage} />}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cfg = {
    PENDING: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Pendente' },
    APPROVED: { bg: 'bg-green-100', text: 'text-green-700', label: 'Aprovada' },
    REJECTED: { bg: 'bg-red-100', text: 'text-red-700', label: 'Rejeitada' },
  }[status] || { bg: 'bg-gray-100', text: 'text-gray-600', label: status };

  return <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${cfg.bg} ${cfg.text}`}>{cfg.label}</span>;
}

function TripInfo({ trip, onSaved }: { trip: Trip; onSaved: (t: Trip) => void }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: trip.title,
    description: trip.description || '',
    meetingPoint: trip.meetingPoint,
    destination: trip.destination,
    date: trip.date.split('T')[0],
    time: trip.time || '',
    maxParticipants: trip.maxParticipants?.toString() || '',
  });
  const [removePhotoIds, setRemovePhotoIds] = useState<string[]>([]);
  const [newPhotos, setNewPhotos] = useState<string[]>([]);
  const [newPhotoPreviews, setNewPhotoPreviews] = useState<string[]>([]);
  const fileRef = React.useRef<HTMLInputElement>(null);

  // Reset form when trip changes
  React.useEffect(() => {
    setForm({
      title: trip.title,
      description: trip.description || '',
      meetingPoint: trip.meetingPoint,
      destination: trip.destination,
      date: trip.date.split('T')[0],
      time: trip.time || '',
      maxParticipants: trip.maxParticipants?.toString() || '',
    });
    setRemovePhotoIds([]);
    setNewPhotos([]);
    setNewPhotoPreviews([]);
    setEditing(false);
  }, [trip.id]);

  const handlePhotoAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        const b64 = reader.result as string;
        setNewPhotos(prev => [...prev, b64]);
        setNewPhotoPreviews(prev => [...prev, b64]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data } = await api.patch(`/social/admin/trips/${trip.id}`, {
        ...form,
        maxParticipants: form.maxParticipants || null,
        removePhotoIds: removePhotoIds.length > 0 ? removePhotoIds : undefined,
        newPhotos: newPhotos.length > 0 ? newPhotos : undefined,
      });
      onSaved(data);
      setEditing(false);
      setRemovePhotoIds([]);
      setNewPhotos([]);
      setNewPhotoPreviews([]);
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Erro ao salvar');
    }
    setSaving(false);
  };

  const remainingPhotos = trip.photos.filter(p => !removePhotoIds.includes(p.id));

  if (!editing) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{trip.title}</h2>
            <p className="text-sm text-gray-500 mt-1">Criado por {trip.creator.name} {trip.creator.phone && `• ${trip.creator.phone}`} {trip.creator.email && `• ${trip.creator.email}`}</p>
          </div>
          <button onClick={() => setEditing(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition">
            <Pencil size={14} /> Editar
          </button>
        </div>

        {trip.description && (
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-sm text-gray-700 leading-relaxed">{trip.description}</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <InfoCard icon={<MapPin size={14} />} label="Ponto de encontro" value={trip.meetingPoint} />
          <InfoCard icon={<Navigation size={14} />} label="Destino" value={trip.destination} />
          <InfoCard icon={<Calendar size={14} />} label="Data" value={`${format(new Date(trip.date), "dd/MM/yyyy", { locale: ptBR })}${trip.time ? ` ${trip.time}` : ''}`} />
          <InfoCard icon={<Users size={14} />} label="Participantes" value={`${trip._count.participants}${trip.maxParticipants ? ` / ${trip.maxParticipants}` : ''}`} />
        </div>

        <div className="text-xs text-gray-400">
          Share link: <code className="bg-gray-100 px-1 py-0.5 rounded">app.marinaprizeclub.com/social/share/{trip.shareToken}</code>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-900">Editar Trip</h2>
        <div className="flex gap-2">
          <button onClick={() => { setEditing(false); setRemovePhotoIds([]); setNewPhotos([]); setNewPhotoPreviews([]); }} className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 transition">
            <X size={14} /> Cancelar
          </button>
          <button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition disabled:opacity-50">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Salvar
          </button>
        </div>
      </div>

      {/* Photos management */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Fotos</label>
        <div className="flex gap-2 flex-wrap">
          {remainingPhotos.map(p => (
            <div key={p.id} className="relative group w-24 h-24 rounded-lg overflow-hidden border border-gray-200">
              <img src={resolveMediaUrl(p.url)} alt="" className="w-full h-full object-cover" />
              <button
                onClick={() => setRemovePhotoIds(prev => [...prev, p.id])}
                className="absolute top-1 right-1 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
              >
                <X size={12} />
              </button>
            </div>
          ))}
          {newPhotoPreviews.map((preview, i) => (
            <div key={`new-${i}`} className="relative group w-24 h-24 rounded-lg overflow-hidden border-2 border-blue-300">
              <img src={preview} alt="" className="w-full h-full object-cover" />
              <button
                onClick={() => { setNewPhotos(prev => prev.filter((_, j) => j !== i)); setNewPhotoPreviews(prev => prev.filter((_, j) => j !== i)); }}
                className="absolute top-1 right-1 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
              >
                <X size={12} />
              </button>
              <span className="absolute bottom-0 left-0 right-0 bg-blue-600 text-white text-[9px] text-center py-0.5">Nova</span>
            </div>
          ))}
          <button
            onClick={() => fileRef.current?.click()}
            className="w-24 h-24 rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center text-gray-400 hover:text-blue-500 hover:border-blue-300 transition"
          >
            <Upload size={18} />
            <span className="text-[10px] mt-1">Adicionar</span>
          </button>
          <input ref={fileRef} type="file" accept="image/*" multiple onChange={handlePhotoAdd} className="hidden" />
        </div>
      </div>

      {/* Form fields */}
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Título</label>
          <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none" />
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Descrição</label>
          <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none resize-none" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Ponto de Encontro</label>
          <input value={form.meetingPoint} onChange={e => setForm(f => ({ ...f, meetingPoint: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Destino</label>
          <input value={form.destination} onChange={e => setForm(f => ({ ...f, destination: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Data</label>
          <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Horário</label>
          <input type="time" value={form.time} onChange={e => setForm(f => ({ ...f, time: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Máx. Participantes</label>
          <input type="number" value={form.maxParticipants} onChange={e => setForm(f => ({ ...f, maxParticipants: e.target.value }))} placeholder="Sem limite" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none" />
        </div>
      </div>

      <div className="text-xs text-gray-400">
        Share link: <code className="bg-gray-100 px-1 py-0.5 rounded">app.marinaprizeclub.com/social/share/{trip.shareToken}</code>
      </div>
    </div>
  );
}

function InfoCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-gray-50 rounded-lg p-3">
      <div className="flex items-center gap-1.5 text-gray-400 mb-1">{icon}<span className="text-[11px] font-medium">{label}</span></div>
      <p className="text-sm font-semibold text-gray-800">{value}</p>
    </div>
  );
}

function TripParticipants({ trip }: { trip: Trip }) {
  if (!trip.participants || trip.participants.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-8">Nenhum participante</p>;
  }

  return (
    <div className="space-y-2">
      {trip.participants.map(p => (
        <div key={p.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50">
          {p.user.avatar ? (
            <img src={resolveMediaUrl(p.user.avatar)} alt="" className="w-8 h-8 rounded-full object-cover" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-600">
              {p.user.name[0]}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{p.user.name}</p>
            <p className="text-xs text-gray-400">
              {p.user.phone && `${p.user.phone} • `}
              Entrou {format(new Date(p.joinedAt), 'dd/MM HH:mm')}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

function TripMessages({ trip, onDeleteMessage }: { trip: Trip; onDeleteMessage: (id: string) => void }) {
  if (!trip.messages || trip.messages.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-8">Nenhuma mensagem</p>;
  }

  return (
    <div className="space-y-2">
      {[...trip.messages].reverse().map(msg => (
        <div key={msg.id} className="flex gap-3 p-2 rounded-lg hover:bg-gray-50 group">
          {msg.user.avatar ? (
            <img src={resolveMediaUrl(msg.user.avatar)} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
          ) : (
            <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-[10px] font-bold text-blue-600 shrink-0">
              {msg.user.name[0]}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-gray-800">{msg.user.name}</span>
              <span className="text-[10px] text-gray-400">{format(new Date(msg.createdAt), 'dd/MM HH:mm')}</span>
            </div>
            {msg.isDeleted ? (
              <p className="text-xs italic text-gray-400">Mensagem apagada</p>
            ) : (
              <>
                {msg.type === 'IMAGE' && msg.mediaUrl && (
                  <img src={resolveMediaUrl(msg.mediaUrl)} alt="" className="max-w-[200px] rounded-lg mt-1" />
                )}
                {msg.type === 'AUDIO' && msg.mediaUrl && (
                  <audio controls src={resolveMediaUrl(msg.mediaUrl)} className="mt-1 max-w-[250px]" />
                )}
                {msg.content && <p className="text-sm text-gray-700 mt-0.5">{msg.content}</p>}
              </>
            )}
          </div>
          {!msg.isDeleted && (
            <button
              onClick={() => onDeleteMessage(msg.id)}
              className="opacity-0 group-hover:opacity-100 p-1 text-red-400 hover:text-red-600 transition"
              title="Apagar mensagem"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
