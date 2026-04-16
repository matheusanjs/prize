'use client';

import { MapPin, Phone, Mail } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';

export default function Footer() {
  return (
    <footer className="bg-secondary-900 text-foreground">
      {/* Footer content */}
        <div className="max-w-7xl mx-auto px-5 sm:px-6 lg:px-8 py-8 sm:py-14">

          {/* Mobile: compact layout */}
          <div className="sm:hidden">
            {/* Brand + social row */}
            <div className="flex items-center justify-between mb-6">
              <Image src="/logo.png" alt="Prize Club" width={120} height={40} className="h-7 w-auto dark:brightness-0 dark:invert" />
              <div className="flex gap-2">
                <a href="https://www.instagram.com/prizecabofrio/" target="_blank" rel="noopener noreferrer" className="w-8 h-8 bg-foreground/[0.06] rounded-lg flex items-center justify-center hover:bg-primary-500 hover:text-white transition-colors">
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
                </a>
                <a href="https://www.facebook.com/prizecabofrio" target="_blank" rel="noopener noreferrer" className="w-8 h-8 bg-foreground/[0.06] rounded-lg flex items-center justify-center hover:bg-primary-500 hover:text-white transition-colors">
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385h-3.047v-3.47h3.047v-2.642c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953h-1.513c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385c5.738-.9 10.125-5.864 10.125-11.854z"/></svg>
                </a>
              </div>
            </div>

            {/* Contact info — single compact row */}
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-foreground/40 mb-5">
              <a href="tel:+5522981581555" className="flex items-center gap-1.5 hover:text-primary-400 transition-colors">
                <Phone className="w-3 h-3 text-primary-400" />
                (22) 98158-1555
              </a>
              <a href="mailto:contato@marinaprizeclub.com.br" className="flex items-center gap-1.5 hover:text-primary-400 transition-colors">
                <Mail className="w-3 h-3 text-primary-400" />
                contato@marina...
              </a>
              <span className="flex items-center gap-1.5">
                <MapPin className="w-3 h-3 text-primary-400" />
                Cabo Frio - RJ
              </span>
            </div>

            {/* Links compact row */}
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-foreground/35 mb-5">
              {[
                { label: 'Experiência', href: '/experiencia' },
                { label: 'Estrutura', href: '/estrutura' },
                { label: 'Gastronomia', href: '/gastronomia' },
                { label: 'Lifestyle', href: '/lifestyle' },
                { label: 'FAQ', href: '/faq' },
              ].map(link => (
                <Link key={link.href} href={link.href} className="hover:text-primary-400 transition-colors">
                  {link.label}
                </Link>
              ))}
            </div>

            {/* Legal links */}
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-foreground/25 mb-5">
              <Link href="/privacidade" className="hover:text-primary-400 transition-colors">Privacidade</Link>
              <Link href="/termos" className="hover:text-primary-400 transition-colors">Termos de Uso</Link>
              <Link href="/exclusao-de-dados" className="hover:text-primary-400 transition-colors">Exclusão de Dados</Link>
            </div>

            {/* Copyright */}
            <div className="border-t border-foreground/[0.06] pt-4">
              <p className="text-[10px] text-foreground/20 text-center">
                © {new Date().getFullYear()} Marina Prize Club. Todos os direitos reservados.
              </p>
            </div>
          </div>

          {/* Desktop: original full layout */}
          <div className="hidden sm:block">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 sm:gap-10">
          {/* Brand */}
          <div className="col-span-2 lg:col-span-1">
            <div className="mb-4">
              <Image src="/logo.png" alt="Prize Club" width={140} height={48} className="h-9 w-auto dark:brightness-0 dark:invert" />
            </div>
            <p className="text-foreground/40 text-sm leading-relaxed max-w-xs">
              A melhor estrutura náutica de Cabo Frio para sua diversão!
            </p>
          </div>

          {/* Links */}
          <div>
            <h4 className="font-bold text-xs uppercase tracking-wider text-foreground/50 mb-4">Navegação</h4>
            <div className="space-y-2.5">
              {[
                { label: 'Experiência', href: '/experiencia' },
                { label: 'Estrutura', href: '/estrutura' },
                { label: 'Gastronomia', href: '/gastronomia' },
                { label: 'Lifestyle', href: '/lifestyle' },
                { label: 'FAQ', href: '/faq' },
              ].map(link => (
                <Link key={link.href} href={link.href} className="block text-sm text-foreground/40 hover:text-primary-400 transition-colors duration-200">
                  {link.label}
                </Link>
              ))}
            </div>
          </div>

          {/* Account */}
          <div>
            <h4 className="font-bold text-xs uppercase tracking-wider text-foreground/50 mb-4">Sua Conta</h4>
            <div className="space-y-2.5">
              <Link href="/login" className="block text-sm text-foreground/40 hover:text-primary-400 transition-colors duration-200">
                Entrar
              </Link>
              <Link href="/cadastro" className="block text-sm text-foreground/40 hover:text-primary-400 transition-colors duration-200">
                Criar Conta
              </Link>
            </div>
            <h4 className="font-bold text-xs uppercase tracking-wider text-foreground/50 mb-4 mt-6">Legal</h4>
            <div className="space-y-2.5">
              <Link href="/privacidade" className="block text-sm text-foreground/40 hover:text-primary-400 transition-colors duration-200">
                Privacidade
              </Link>
              <Link href="/termos" className="block text-sm text-foreground/40 hover:text-primary-400 transition-colors duration-200">
                Termos de Uso
              </Link>
              <Link href="/exclusao-de-dados" className="block text-sm text-foreground/40 hover:text-primary-400 transition-colors duration-200">
                Exclusão de Dados
              </Link>
            </div>
          </div>

          {/* Contact */}
          <div>
            <h4 className="font-bold text-xs uppercase tracking-wider text-foreground/50 mb-4">Contato</h4>
            <div className="space-y-3">
              <div className="flex items-start gap-2.5">
                <MapPin className="w-4 h-4 text-primary-400 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-foreground/40 leading-relaxed">
                  Rua dos Camarões, 117 - Ogiva<br />Cabo Frio - RJ
                </p>
              </div>
              <a href="tel:+5522981581555" className="flex items-center gap-2.5 text-sm text-foreground/40 hover:text-primary-400 transition-colors duration-200">
                <Phone className="w-4 h-4 text-primary-400" />
                (22) 98158-1555
              </a>
              <a href="mailto:contato@marinaprizeclub.com.br" className="flex items-center gap-2.5 text-sm text-foreground/40 hover:text-primary-400 transition-colors duration-200">
                <Mail className="w-4 h-4 text-primary-400" />
                contato@marina...
              </a>
            </div>

            {/* Social */}
            <div className="flex gap-2 mt-5">
              <a href="https://www.instagram.com/prizecabofrio/" target="_blank" rel="noopener noreferrer" className="w-9 h-9 bg-foreground/[0.06] rounded-xl flex items-center justify-center hover:bg-primary-500 hover:text-white transition-colors duration-200">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
              </a>
              <a href="https://www.facebook.com/prizecabofrio" target="_blank" rel="noopener noreferrer" className="w-9 h-9 bg-foreground/[0.06] rounded-xl flex items-center justify-center hover:bg-primary-500 hover:text-white transition-colors duration-200">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385h-3.047v-3.47h3.047v-2.642c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953h-1.513c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385c5.738-.9 10.125-5.864 10.125-11.854z"/></svg>
              </a>
            </div>
          </div>
        </div>

          <div className="border-t border-foreground/[0.06] mt-8 pt-5 text-center">
            <p className="text-xs text-foreground/25">
              © {new Date().getFullYear()} Marina Prize Club. Todos os direitos reservados.
            </p>
          </div>
          </div>
        </div>
    </footer>
  );
}
