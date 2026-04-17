'use client';

import { useEffect, useState, useCallback } from 'react';
import { MessageCircle, Anchor, Loader2, Users2, Fuel, Gauge, Eye, X, MapPin, Volume2, VolumeX } from 'lucide-react';
import { getMarketplaceBoats } from '@/services/api';
import { useCachedState, hasCached } from '@/hooks/useCachedState';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';
const WHATSAPP_URL = 'https://wa.me/5522981581555';

interface BoatMarketplace {
  id: string;
  name: string;
  model: string;
  year: number;
  capacity: number;
  fuelType: string;
  fuelCapacity: number;
  totalShares: number;
  monthlyFee: number;
  shareValue: number;
  marketplaceDescription: string;
  imageUrl: string;
  availableShares: number;
  brand: string;
  locationBerth?: string | null;
  hasSound?: boolean;
}

function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

/* ─── Modal (mobile-first bottom sheet) ─── */
function BoatModal({ boat, onClose }: { boat: BoatMarketplace; onClose: () => void }) {
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const descParagraphs = boat.marketplaceDescription
    ? boat.marketplaceDescription.split(/\n+/).filter(Boolean)
    : [];

  return (
    <div className="fixed inset-0 z-[9999] flex items-end justify-center" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative z-10 w-full max-h-[93vh] bg-[var(--card)] border-t border-[var(--border)] rounded-t-3xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
        style={{ animation: 'slideUp 0.3s ease-out' }}
      >
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-20 w-8 h-8 flex items-center justify-center rounded-full bg-black/40 backdrop-blur-sm text-white/70"
        >
          <X size={18} />
        </button>

        {/* Drag indicator */}
        <div className="flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 rounded-full bg-[var(--text-muted)]/30" />
        </div>

        {/* Scrollable */}
        <div className="overflow-y-auto flex-1 overscroll-contain">
          {/* Image */}
          <div className="relative aspect-[16/9] overflow-hidden">
            <img
              src={`${API_URL}${boat.imageUrl}`}
              alt={boat.name}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[var(--card)] via-transparent to-transparent" />

            <div className="absolute top-4 left-4 flex gap-2">
              <span className="bg-black/60 backdrop-blur-md text-white text-xs font-bold px-3 py-1.5 rounded-lg border border-white/10">
                {boat.brand}
              </span>
              <span className="bg-primary-500/90 text-white text-xs font-bold px-3 py-1.5 rounded-lg">
                {boat.year}
              </span>
            </div>
          </div>

          {/* Body */}
          <div className="px-5 pb-5 -mt-5 relative z-10">
            <h2 className="text-2xl font-black text-[var(--text)] leading-tight mb-0.5">{boat.name}</h2>
            <p className="text-primary-500 font-semibold text-sm mb-4">{boat.model}</p>

            {/* Prices */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-[var(--subtle)] border border-[var(--border)] rounded-2xl p-3.5">
                <p className="text-[var(--text-muted)] text-[10px] uppercase tracking-wider mb-1">Valor da cota</p>
                <p className="text-[var(--text)] font-black text-xl">{formatCurrency(boat.shareValue)}</p>
              </div>
              <div className="bg-[var(--subtle)] border border-[var(--border)] rounded-2xl p-3.5">
                <p className="text-[var(--text-muted)] text-[10px] uppercase tracking-wider mb-1">Mensalidade</p>
                <p className="text-[var(--text)] font-black text-xl">{formatCurrency(boat.monthlyFee)}<span className="text-sm font-semibold text-[var(--text-muted)]">/mês</span></p>
              </div>
            </div>

            {/* Specs */}
            <div className="grid grid-cols-4 gap-2 mb-4">
              <div className="bg-[var(--subtle)] border border-[var(--border)] rounded-2xl p-3 text-center">
                <Users2 size={16} className="text-primary-500 mx-auto mb-1" />
                <p className="text-[var(--text)] font-bold text-sm">{boat.capacity}</p>
                <p className="text-[var(--text-muted)] text-[10px]">Pessoas</p>
              </div>
              <div className="bg-[var(--subtle)] border border-[var(--border)] rounded-2xl p-3 text-center">
                <Fuel size={16} className="text-primary-500 mx-auto mb-1" />
                <p className="text-[var(--text)] font-bold text-sm">{boat.fuelCapacity}L</p>
                <p className="text-[var(--text-muted)] text-[10px]">Tanque</p>
              </div>
              <div className="bg-[var(--subtle)] border border-[var(--border)] rounded-2xl p-3 text-center">
                <Gauge size={16} className="text-primary-500 mx-auto mb-1" />
                <p className="text-[var(--text)] font-bold text-sm">{boat.fuelType === 'GASOLINE' ? 'Gasolina' : boat.fuelType}</p>
                <p className="text-[var(--text-muted)] text-[10px]">Combustível</p>
              </div>
              <div className={`bg-[var(--subtle)] border rounded-2xl p-3 text-center ${boat.hasSound ? 'border-primary-500/30' : 'border-[var(--border)]'}`}>
                {boat.hasSound ? <Volume2 size={16} className="text-primary-500 mx-auto mb-1" /> : <VolumeX size={16} className="text-[var(--text-muted)] mx-auto mb-1" />}
                <p className="text-[var(--text)] font-bold text-sm">{boat.hasSound ? 'Sim' : 'Não'}</p>
                <p className="text-[var(--text-muted)] text-[10px]">Som</p>
              </div>
            </div>

            {/* Description */}
            {descParagraphs.length > 0 && (
              <div className="mb-4">
                <h3 className="text-[var(--text)] font-bold text-xs uppercase tracking-wider mb-2">Sobre</h3>
                <div className="space-y-2">
                  {descParagraphs.map((p, i) => (
                    <p key={i} className="text-[var(--text-secondary)] text-sm leading-relaxed">{p}</p>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Fixed CTA */}
        <div className="border-t border-[var(--border)] p-4 bg-[var(--card)]">
          <a
            href={`${WHATSAPP_URL}?text=${encodeURIComponent(`Olá! Tenho interesse na cota do ${boat.name} (${boat.model} ${boat.year}). Gostaria de mais informações.`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full py-3.5 bg-[#25D366] text-white font-bold text-base rounded-2xl active:scale-[0.98] transition-transform shadow-[0_4px_14px_rgba(37,211,102,0.25)]"
          >
            <MessageCircle size={20} />
            Tenho interesse nesta cota
          </a>
        </div>
      </div>

      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

export default function ComprasPage() {
  const [boats, setBoats] = useCachedState<BoatMarketplace[]>('pc:compras:boats', []);
  const [loading, setLoading] = useState(() => !hasCached('pc:compras:boats'));
  const [selectedBoat, setSelectedBoat] = useState<BoatMarketplace | null>(null);

  const handleCloseModal = useCallback(() => setSelectedBoat(null), []);

  useEffect(() => {
    getMarketplaceBoats()
      .then((r) => setBoats(Array.isArray(r.data) ? r.data : []))
      .catch(() => setBoats([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen pt-4 pb-20 bg-[var(--bg)]">
      <div className="px-4 space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 text-primary-500 animate-spin" />
          </div>
        ) : boats.length === 0 ? (
          <div className="text-center py-16">
            <Anchor className="w-10 h-10 text-[var(--text-muted)] mx-auto mb-3" />
            <p className="text-[var(--text-secondary)]">Nenhuma embarcação disponível no momento</p>
          </div>
        ) : (
          boats.map((boat) => (
            <div key={boat.id} className="bg-[var(--card)] rounded-3xl border border-[var(--border)] overflow-hidden shadow-[0_2px_20px_var(--calendar-shadow)]">
              {/* Image */}
              <div className="relative aspect-[16/10] overflow-hidden">
                <img
                  src={`${API_URL}${boat.imageUrl}`}
                  alt={boat.name}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                <div className="absolute top-3 left-3 flex gap-1.5">
                  <span className="bg-black/60 backdrop-blur-md text-white text-[10px] font-bold px-2 py-1 rounded-md border border-white/10">
                    {boat.brand}
                  </span>
                  <span className="bg-primary-500/90 text-white text-[10px] font-bold px-2 py-1 rounded-md">
                    {boat.year}
                  </span>
                </div>
                <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between">
                  <div>
                    <p className="text-white/50 text-[9px] uppercase tracking-wider">Cota</p>
                    <p className="text-white font-black text-lg drop-shadow-lg">{formatCurrency(boat.shareValue)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-white/50 text-[9px] uppercase tracking-wider">Mensal</p>
                    <p className="text-white font-bold text-base drop-shadow-lg">{formatCurrency(boat.monthlyFee)}</p>
                  </div>
                </div>
              </div>

              {/* Content */}
              <div className="p-4">
                <h3 className="text-lg font-bold text-[var(--text)]">{boat.name}</h3>
                <p className="text-sm text-primary-500 font-medium mb-3">{boat.model}</p>

                {/* Specs */}
                <div className="flex items-center gap-3 mb-3 text-[var(--text-muted)]">
                  <div className="flex items-center gap-1">
                    <Users2 size={13} />
                    <span className="text-[10px]">{boat.capacity} pessoas</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Fuel size={13} />
                    <span className="text-[10px]">{boat.fuelCapacity}L</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Gauge size={13} />
                    <span className="text-[10px]">{boat.fuelType === 'GASOLINE' ? 'Gasolina' : boat.fuelType}</span>
                  </div>
                  <div className={`flex items-center gap-1 ${boat.hasSound ? 'text-primary-500' : ''}`}>
                    {boat.hasSound ? <Volume2 size={13} /> : <VolumeX size={13} />}
                    <span className="text-[10px]">{boat.hasSound ? 'Com som' : 'Sem som'}</span>
                  </div>
                </div>

                {/* Description */}
                {boat.marketplaceDescription && (
                  <p className="text-xs text-[var(--text-secondary)] leading-relaxed mb-3 line-clamp-2">
                    {boat.marketplaceDescription}
                  </p>
                )}

                {/* Buttons */}
                <div className="flex gap-2.5">
                  <button
                    onClick={() => setSelectedBoat(boat)}
                    className="flex items-center justify-center gap-1.5 flex-1 py-3 bg-[var(--subtle)] border border-[var(--border)] text-[var(--text)] font-semibold text-sm rounded-2xl active:scale-[0.98] transition-transform"
                  >
                    <Eye size={16} />
                    Ver detalhes
                  </button>
                  <a
                    href={`${WHATSAPP_URL}?text=${encodeURIComponent(`Olá! Tenho interesse na cota do ${boat.name} (${boat.model} ${boat.year}). Gostaria de mais informações.`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-1.5 flex-1 py-3 bg-[#25D366] text-white font-bold text-sm rounded-2xl active:scale-[0.98] transition-transform shadow-[0_4px_14px_rgba(37,211,102,0.25)]"
                  >
                    <MessageCircle size={16} />
                    Quero essa cota
                  </a>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal */}
      {selectedBoat && <BoatModal boat={selectedBoat} onClose={handleCloseModal} />}
    </div>
  );
}
