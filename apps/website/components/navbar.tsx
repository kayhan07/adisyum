'use client';

import { useState, useEffect } from 'react';

const NAV_LINKS = [
  { label: 'Özellikler', href: '#features' },
  { label: 'Ürünler', href: '#products' },
  { label: 'Güven', href: '#trust' },
  { label: 'Fiyatlandırma', href: '#pricing' },
  { label: 'Hakkımızda', href: '#about' },
];

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'border-b border-white/6 bg-[#060b14]/90 backdrop-blur-xl shadow-[0_1px_0_rgba(255,255,255,0.04)]'
          : 'bg-transparent'
      }`}
    >
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 lg:px-8">
        {/* Logo */}
        <a href="/" className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-500 shadow-[0_0_24px_rgba(14,165,233,0.5)]">
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5 text-white">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <span className="text-lg font-bold tracking-tight text-white">adisyum</span>
          <span className="hidden rounded-full bg-brand-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-brand-400 sm:inline">Enterprise</span>
        </a>

        {/* Desktop nav */}
        <ul className="hidden items-center gap-1 lg:flex">
          {NAV_LINKS.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                className="rounded-xl px-4 py-2 text-sm font-medium text-slate-400 transition hover:text-white"
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>

        {/* CTAs */}
        <div className="hidden items-center gap-3 lg:flex">
          <a href="https://app.adisyum.com" className="text-sm font-semibold text-slate-300 hover:text-white transition">
            Giriş Yap
          </a>
          <a
            href="#demo"
            className="rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_0_24px_rgba(14,165,233,0.35)] transition hover:bg-brand-400 hover:shadow-[0_0_32px_rgba(14,165,233,0.5)] active:scale-95"
          >
            Ücretsiz Demo →
          </a>
        </div>

        {/* Mobile hamburger */}
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 text-slate-300 lg:hidden"
          aria-label="Menü"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
            {menuOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </nav>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="border-t border-white/6 bg-[#060b14]/96 px-5 pb-5 pt-3 backdrop-blur-xl lg:hidden">
          <ul className="space-y-1 mb-4">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  onClick={() => setMenuOpen(false)}
                  className="block rounded-xl px-4 py-2.5 text-sm font-medium text-slate-300 hover:bg-white/5 hover:text-white"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
          <div className="grid gap-2">
            <a href="https://app.adisyum.com" className="rounded-xl border border-white/10 px-4 py-3 text-center text-sm font-semibold text-slate-200">Giriş Yap</a>
            <a href="#demo" onClick={() => setMenuOpen(false)} className="rounded-xl bg-brand-500 px-4 py-3 text-center text-sm font-semibold text-white">Ücretsiz Demo →</a>
          </div>
        </div>
      )}
    </header>
  );
}
