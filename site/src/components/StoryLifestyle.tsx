'use client';

import { useRef, useState, useEffect } from 'react';

import { Sun, Users, Music } from 'lucide-react';

const MOMENTS = [
  {
    video: '/life1.mp4',
    videoDesktop: '/life1-desktop.mp4',
    mobileImg: '/life1-mobile.webp',
    icon: Sun,
    tag: 'Golden Hour',
    title: 'Pôr do sol',
    desc: 'Cada segundo vira uma obra‑prima no deck da Prize.',
  },
  {
    video: '/life2.mp4',
    videoDesktop: '/life2-desktop.mp4',
    mobileImg: '/life2-mobile.webp',
    icon: Users,
    tag: 'Momentos',
    title: 'Memórias',
    desc: 'Encontros que viram histórias pra sempre.',
  },
  {
    video: '/life3.mp4',
    videoDesktop: '/life3-desktop.mp4',
    mobileImg: '/life3-mobile.webp',
    icon: Music,
    tag: 'Vibe Prize',
    title: 'Exclusivo',
    desc: 'Música, mar e sofisticação num só lugar.',
  },
];

export default function StoryLifestyle() {
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

  return (
    <section
      ref={sectionRef}
      id="lifestyle"
      className="relative py-12 sm:py-20 lg:py-24 bg-secondary-950 overflow-hidden"
    >
      {/* Ambient orb */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-amber-500/[0.02] rounded-full blur-[150px] pointer-events-none" />

        <div className="max-w-7xl mx-auto px-5 sm:px-6 lg:px-8">
        {/* Header */}
        <div
          className={`flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6 mb-10 sm:mb-12 transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] ${isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
        >
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-[2px] bg-primary-500" />
              <span className="text-primary-400 text-xs font-bold tracking-[0.3em] uppercase">
                Lifestyle
              </span>
            </div>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-foreground leading-[1.05]">
              Viva o que só se
              <br />
              <span className="text-gradient">sente aqui.</span>
            </h2>
          </div>
          <p className="text-sm sm:text-base text-foreground/40 max-w-sm leading-relaxed">
            Pôr do sol, vibe premium e momentos que viram histórias. Isso é lifestyle Prize.
          </p>
        </div>

        {/* 3-column video grid */}
        <div
          className={`flex overflow-x-auto sm:overflow-x-visible snap-x snap-mandatory sm:snap-none scrollbar-hide gap-3 sm:gap-5 -mx-5 px-5 sm:mx-0 sm:px-0 pb-2 sm:pb-0 sm:grid sm:grid-cols-3 transition-all duration-[800ms] ease-[cubic-bezier(0.22,1,0.36,1)] delay-200 ${isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}
        >
          {MOMENTS.map((moment, i) => (
            <VideoCard key={i} moment={moment} index={i} />
          ))}
        </div>

        {/* Bottom CTA */}
        <div
          className={`text-center mt-10 sm:mt-12 transition-all duration-[600ms] ease-[cubic-bezier(0.22,1,0.36,1)] delay-[400ms] ${isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'}`}
        >
          <a
            href="https://wa.me/5522981581555?text=Quero%20viver%20o%20lifestyle%20Prize!"
            target="_blank"
            rel="noopener noreferrer"
            className="group relative inline-flex items-center gap-3 px-10 py-4 bg-primary-500 text-white font-bold rounded-2xl overflow-hidden transition-all hover:-translate-y-0.5 active:scale-[0.98]"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-orange-600 to-primary-500 opacity-0 group-hover:opacity-100 transition-opacity" />
            <Sun className="relative w-5 h-5" />
            <span className="relative text-sm sm:text-base">Quero Sentir Isso</span>
          </a>
        </div>
      </div>
    </section>
  );
}

function VideoCard({ moment, index }: { moment: (typeof MOMENTS)[0]; index: number }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [isInView, setIsInView] = useState(false);
  const [revealed, setRevealed] = useState(false);
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
    if (isInView && !revealed) setRevealed(true);
  }, [isInView, revealed]);

  useEffect(() => {
    if (!videoRef.current || isMobile) return;
    const src = moment.videoDesktop;
    if (isInView) {
      if (!videoRef.current.src.includes(src)) {
        videoRef.current.src = src;
        videoRef.current.load();
      }
      videoRef.current.play().catch(() => {});
    } else {
      videoRef.current.pause();
    }
  }, [isInView, moment.videoDesktop, isMobile]);

  return (
    <div
      ref={cardRef}
      className={`relative group rounded-2xl sm:rounded-3xl overflow-hidden min-w-[72vw] sm:min-w-0 flex-shrink-0 sm:flex-shrink snap-center transition-all duration-[600ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${revealed ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
      style={{ aspectRatio: '9/14', transitionDelay: `${index * 100}ms` }}
    >
      {/* Video (desktop only) / Image (mobile) */}
      {isMobile ? (
        <img
          src={moment.mobileImg}
          alt={moment.title}
          loading="lazy"
          decoding="async"
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
        />
      ) : (
        <video
          ref={videoRef}
          muted
          loop
          playsInline
          preload="none"
          poster={moment.video.replace('.mp4', '-poster.jpg')}
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
          style={{ filter: 'contrast(1.08) saturate(1.15) brightness(1.05)' }}
        />
      )}

      {/* Gradient overlays */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-black/20" />

      {/* Top tag */}
      <div className="absolute top-4 left-4 flex items-center gap-2 px-3 py-1.5 bg-black/30 backdrop-blur-md rounded-full border border-white/10">
        <moment.icon className="w-3.5 h-3.5 text-primary-400" />
        <span className="text-white/80 text-[11px] font-semibold tracking-wider uppercase">
          {moment.tag}
        </span>
      </div>

      {/* Index watermark */}
      <div className="absolute top-4 right-4 pointer-events-none">
        <span className="text-white/[0.05] text-6xl sm:text-7xl font-black leading-none select-none">
          {String(index + 1).padStart(2, '0')}
        </span>
      </div>

      {/* Bottom content */}
      <div className="absolute inset-x-0 bottom-0 p-5 sm:p-6">
        <h3 className="text-xl sm:text-2xl font-black text-white leading-tight mb-1.5">
          {moment.title}
        </h3>
        <p className="text-xs sm:text-sm text-white/45 leading-relaxed mb-4">
          {moment.desc}
        </p>
        <a
          href="https://wa.me/5522981581555?text=Quero%20viver%20o%20lifestyle%20Prize!"
          target="_blank"
          rel="noopener noreferrer"
          className="group/btn inline-flex items-center gap-2 px-4 py-2 bg-white/[0.08] border border-white/10 rounded-xl text-white/70 hover:text-white hover:bg-white/[0.15] hover:border-primary-500/30 transition-all duration-300 text-xs font-medium"
        >
          Quero isso
          <svg
            className="w-3 h-3 transition-transform group-hover/btn:translate-x-1"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </a>
      </div>
    </div>
  );
}
