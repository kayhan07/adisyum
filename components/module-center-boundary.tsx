'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { secureLogout } from '@/lib/client/secure-logout';

type ModuleCenterBoundaryProps = {
  children: ReactNode;
};

type ModuleCenterBoundaryState = {
  error: Error | null;
};

export class ModuleCenterBoundary extends Component<ModuleCenterBoundaryProps, ModuleCenterBoundaryState> {
  state: ModuleCenterBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ModuleCenterBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[module-center-boundary] render failed', {
      message: error.message,
      stack: error.stack,
      componentStack: info.componentStack,
    });
  }

  render() {
    if (!this.state.error) return this.props.children;

    const message = this.state.error.message || 'Modül merkezi render hatası.';
    const stackLine = this.state.error.stack?.split('\n').find((line) => line.trim().startsWith('at '))?.trim();

    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-white">
        <section className="w-full max-w-lg rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">Modül merkezi hatası</p>
          <h1 className="mt-3 text-2xl font-semibold">Ana ekran açılamadı</h1>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            Uygulama oturumu açık, ancak modül merkezi render sırasında hata verdi.
          </p>
          <div className="mt-3 rounded-xl border border-amber-400/20 bg-amber-950/30 px-3 py-2 text-xs text-amber-100">
            <p className="font-semibold">{message}</p>
            {stackLine ? <p className="mt-1 break-words text-amber-100/80">{stackLine}</p> : null}
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => this.setState({ error: null })}
              className="inline-flex h-11 items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-500"
            >
              Tekrar dene
            </button>
            <button
              type="button"
              onClick={() => void secureLogout({ reason: 'manual', scope: 'current', redirect: true })}
              className="inline-flex h-11 items-center justify-center rounded-xl border border-rose-400/40 bg-rose-500/10 px-4 text-sm font-semibold text-rose-100"
            >
              Güvenli Çıkış
            </button>
          </div>
        </section>
      </main>
    );
  }
}
