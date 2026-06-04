import { Suspense } from 'react';
import nextDynamic from 'next/dynamic';
import { AppShell } from '@/components/app-shell';
import { FloorModeActions } from '@/components/floor/floor-mode-actions';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const FloorWorkspace = nextDynamic(() => import('@/components/floor-workspace').then((mod) => mod.FloorWorkspace), {
  loading: () => <div className="rounded-[1.5rem] border border-white/10 bg-[#111827] p-5 text-sm text-slate-300">Masalar yükleniyor...</div>,
});

export default function FloorPage() {
  return (
    <AppShell
      title="Masalar"
      subtitle=""
      focusMode
      immersiveMode
      actions={(
        <Suspense fallback={null}>
          <FloorModeActions />
        </Suspense>
      )}
    >
      <Suspense fallback={<div className="rounded-[1.5rem] border border-white/10 bg-[#111827] p-5 text-sm text-slate-300">Masalar yükleniyor...</div>}>
        <FloorWorkspace />
      </Suspense>
    </AppShell>
  );
}
