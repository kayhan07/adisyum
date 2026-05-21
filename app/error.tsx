'use client';

import { useEffect } from 'react';

type GlobalRouteErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function GlobalRouteError({ error, reset }: GlobalRouteErrorProps) {
  useEffect(() => {
    console.error('[runtime-error-boundary]', {
      message: error.message,
      digest: error.digest,
      stack: error.stack,
      boundaryName: 'GlobalRouteError',
      componentName: 'app/error.tsx',
      runtimePath: typeof window === 'undefined' ? 'server' : window.location.pathname,
      runtimePayload: {
        search: typeof window === 'undefined' ? '' : window.location.search,
        userAgent: typeof navigator === 'undefined' ? '' : navigator.userAgent,
      },
    });
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-white">
      <section className="w-full max-w-lg rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-300">Runtime hata yakalandı</p>
        <h1 className="mt-3 text-2xl font-semibold">Ekran güvenli moda alındı</h1>
        <p className="mt-2 text-sm leading-6 text-slate-300">
          POS ekranı beklenmeyen bir render hatası yakaladı. Hata konsola işlendi; tekrar deneyebilirsiniz.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-5 inline-flex h-11 items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-500"
        >
          Tekrar dene
        </button>
      </section>
    </main>
  );
}
