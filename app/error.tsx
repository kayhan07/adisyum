'use client';

import { useEffect } from 'react';

type GlobalRouteErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

function summarizeError(error: Error & { digest?: string }) {
  const message = error.message || 'Hata mesajı boş geldi.';
  const stackLine = error.stack?.split('\n').find((line) => line.trim().startsWith('at '))?.trim();
  return {
    message,
    digest: error.digest,
    stackLine,
  };
}

export default function GlobalRouteError({ error, reset }: GlobalRouteErrorProps) {
  const summary = summarizeError(error);

  useEffect(() => {
    console.error('[runtime-error-boundary]', {
      message: summary.message,
      digest: summary.digest,
      stack: error.stack,
      boundaryName: 'GlobalRouteError',
      componentName: 'app/error.tsx',
      runtimePath: typeof window === 'undefined' ? 'server' : window.location.pathname,
      runtimePayload: {
        search: typeof window === 'undefined' ? '' : window.location.search,
        userAgent: typeof navigator === 'undefined' ? '' : navigator.userAgent,
      },
    });
  }, [error, summary.digest, summary.message]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-white">
      <section className="w-full max-w-lg rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-300">Runtime hata yakalandı</p>
        <h1 className="mt-3 text-2xl font-semibold">Ekran güvenli moda alındı</h1>
        <p className="mt-2 text-sm leading-6 text-slate-300">
          POS ekranı beklenmeyen bir render hatası yakaladı. Hata detayı aşağıda ve konsolda kayıtlıdır.
        </p>
        <div className="mt-3 rounded-xl border border-rose-400/20 bg-rose-950/30 px-3 py-2 text-xs text-rose-100">
          <p className="font-semibold">{summary.message}</p>
          {summary.digest ? <p className="mt-1 text-rose-200/80">Digest: {summary.digest}</p> : null}
          {summary.stackLine ? <p className="mt-1 break-words text-rose-200/80">{summary.stackLine}</p> : null}
        </div>
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
