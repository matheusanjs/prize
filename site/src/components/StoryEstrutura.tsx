'use client';

import { useRef, useState, useEffect } from 'react';
import { Shield, Eye, Wrench } from 'lucide-react';

const SECTIONS = [
  {
    video: '/estrutura1.mp4',
    videoDesktop: '/estrutura1-desktop.mp4',
    mobileImg: '/guardaria-mobile.webp',
    icon: Shield,
    label: 'Guardaria',
    title: 'Proteção\nAbsoluta',
    desc: 'Seu jet ski em ambiente coberto, monitorado 24h, com capa personalizada e cuidado que só a Prize oferece.',
    stat: { value: '24h', sub: 'Vigilância' },
  },
  {
    video: '/estrutura2.mp4',
    videoDesktop: '/estrutura2-desktop.mp4',
    mobileImg: '/seguranca-mobile.webp',
    icon: Eye,
    label: 'Segurança',
    title: 'Controle\nTotal',
    desc: 'Câmeras de alta resolução, acesso controlado e equipe dedicada. Tranquilidade que você sente.',
    stat: { value: '360°', sub: 'Monitoramento' },
  },
  {
    video: '/estrutura3.mp4',
    videoDesktop: '/estrutura3-desktop.mp4',
    mobileImg: '/manutencao-mobile.webp',
    icon: Wrench,
    label: 'Manutenção',
    title: 'Sempre\nPronto',
    desc: 'Ligamento semanal do motor, check-up preventivo e resgate em caso de pane. Seu jet ski sempre impecável.',
    stat: { value: '100%', sub: 'Operacional' },
  },
];

function VideoCard({
  section,
  index,
  activeIndex,
  onActivate,
}: {
  section: (typeof SECTIONS)[0];
  index: number;
  activeIndex: number;
  onActivate: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const isActive = index === activeIndex;
  const cardRef = useRef<HTMLDivElement>(null);
  const [isInView, setIsInView] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setIsInView(entry.isIntersecting),
      { rootMargin: '400px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!videoRef.current || isMobile) return;
    const src = section.videoDesktop;
    if (isInView) {
      if (!videoRef.current.src.includes(src)) {
        videoRef.current.src = src;
        videoRef.current.load();
      }
      videoRef.current.play().catch(() => {});
    } else {
      videoRef.current.pause();
    }
  }, [isInView, section.videoDesktop, isMobile]);

  return (
    <div
      ref={cardRef}
      onClick={onActivate}
      className={`relative cursor-pointer overflow-hidden rounded-2xl sm:rounded-3xl transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] min-h-[50vh] sm:min-h-[60vh] ${
        isActive
          ? 'flex-[3]'
          : 'flex-[0.8] opacity-80 hover:opacity-100'
      }`}
    >
      {/* Video (desktop) / Image (mobile) */}
      {isMobile ? (
        <img
          src={section.mobileImg}
          alt={section.label}
          loading="lazy"
          decoding="async"
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <video
          ref={videoRef}
          muted
          loop
          playsInline
          preload="none"
          poster={section.video.replace('.mp4', '-poster.jpg')}
          className="absolute inset-0 w-full h-full object-cover"
          style={{ filter: 'contrast(1.08) saturate(1.15) brightness(1.05)' }}
        />
      )}

      {/* Overlays */}
      <div
        className={`absolute inset-0 transition-all duration-700 ${
          isActive
            ? 'bg-gradient-to-t from-black/90 via-black/40 to-black/10'
            : 'bg-gradient-to-t from-black/90 via-black/60 to-black/40'
        }`}
      />

      {/* Vertical label — collapsed state */}
      <div
        className={`absolute inset-0 flex items-center justify-center transition-all duration-500 ${
          isActive ? 'opacity-0 pointer-events-none' : 'opacity-100'
        }`}
      >
        <div className="flex flex-col items-center gap-3">
          <section.icon className="w-6 h-6 text-primary-400" />
          <p
            className="text-white font-black text-lg tracking-widest uppercase"
            style={{ writingMode: 'vertical-lr', textOrientation: 'mixed' }}
          >
            {section.label}
          </p>
        </div>
      </div>

      {/* Content — expanded state */}
      <div
        className={`absolute inset-0 flex flex-col justify-end p-5 sm:p-10 transition-all duration-700 ${
          isActive
            ? 'opacity-100 translate-y-0'
            : 'opacity-0 translate-y-8 pointer-events-none'
        }`}
      >
        {/* Badge */}
        <div className="flex items-center gap-2 mb-4">
          <section.icon className="w-4 h-4 text-primary-400" />
          <span className="text-primary-400 text-xs font-bold tracking-[0.25em] uppercase">
            {section.label}
          </span>
        </div>

        {/* Title */}
        <h3 className="text-2xl sm:text-4xl lg:text-5xl font-black text-white leading-[1] mb-3 sm:mb-4 whitespace-pre-line" style={{ textShadow: '0 2px 12px rgba(0,0,0,0.5)' }}>
          {section.title}
        </h3>

        {/* Description */}
        <p className="text-sm sm:text-base text-white/80 max-w-md leading-relaxed mb-6">
          {section.desc}
        </p>

        {/* Bottom row: stat + CTA */}
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-3xl sm:text-5xl font-black text-white leading-none">{section.stat.value}</p>
            <p className="text-[10px] sm:text-[11px] text-white/60 font-medium tracking-wider uppercase mt-1">
              {section.stat.sub}
            </p>
          </div>
          <a
            href="https://wa.me/5522981581555?text=Quero%20minha%20vaga%20na%20marina%20Prize!"
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex items-center gap-2 px-6 py-3 bg-primary-500 text-white font-bold rounded-xl hover:bg-primary-400 transition-all hover:-translate-y-0.5 active:scale-[0.98] text-sm"
            onClick={(e) => e.stopPropagation()}
          >
            Garantir vaga
            <svg
              className="w-4 h-4 transition-transform group-hover:translate-x-1"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </a>
        </div>
      </div>

      {/* Top-right index */}
      <div className="absolute top-5 right-5">
        <span className="text-white/10 text-6xl sm:text-8xl font-black leading-none">
          0{index + 1}
        </span>
      </div>
    </div>
  );
}

export default function StoryEstrutura() {
  const [activeIndex, setActiveIndex] = useState(0);
  const sectionRef = useRef<HTMLElement>(null);
  const [isInView, setIsInView] = useState(false);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setIsInView(true); observer.disconnect(); } },
      { rootMargin: '-100px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Auto-rotate
  useEffect(() => {
    if (!isInView) return;
    const timer = setInterval(() => {
      setActiveIndex((p) => (p + 1) % SECTIONS.length);
    }, 6000);
    return () => clearInterval(timer);
  }, [isInView]);

  return (
    <section
      ref={sectionRef}
      id="estrutura"
      className="relative py-16 sm:py-20 lg:py-24 bg-secondary-950 overflow-hidden"
    >
      {/* Ambient glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary-500/[0.03] rounded-full blur-[160px] pointer-events-none" />

      {/* Header */}
      <div className="max-w-7xl mx-auto px-5 sm:px-6 lg:px-8 mb-8 sm:mb-12">
        <div
          className={`flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6 transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] ${isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
        >
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-[2px] bg-primary-500" />
              <span className="text-primary-400 text-xs font-bold tracking-[0.3em] uppercase">
                Estrutura
              </span>
            </div>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-foreground leading-[1.05]">
              Uma marina que você
              <br />
              <span className="text-gradient">precisa conhecer.</span>
            </h2>
          </div>
          <p className="text-sm sm:text-base text-foreground/50 max-w-sm leading-relaxed">
            Três pilares que fazem da Prize Club a referência em marina premium no Brasil.
          </p>
        </div>
      </div>

      {/* Video panels — accordion */}
      <div className="max-w-7xl mx-auto px-5 sm:px-6 lg:px-8">
        <div
          className={`flex flex-row gap-3 sm:gap-4 transition-all duration-[800ms] ease-[cubic-bezier(0.22,1,0.36,1)] delay-200 ${isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}
        >
          {SECTIONS.map((section, i) => (
            <VideoCard
              key={i}
              section={section}
              index={i}
              activeIndex={activeIndex}
              onActivate={() => setActiveIndex(i)}
            />
          ))}
        </div>
      </div>

      {/* Progress indicators */}
      <div className="flex items-center justify-center gap-2 mt-8">
        {SECTIONS.map((_, i) => (
          <button
            key={i}
            onClick={() => setActiveIndex(i)}
            className={`transition-all duration-500 rounded-full ${
              i === activeIndex
                ? 'w-8 h-2 bg-primary-500'
                : 'w-2 h-2 bg-foreground/20 hover:bg-foreground/40'
            }`}
          />
        ))}
      </div>
    </section>
  );
}
