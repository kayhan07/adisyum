import { Suspense } from 'react';
import dynamic from 'next/dynamic';
import { AppShell } from '@/components/app-shell';
import { FloorModeActions } from '@/components/floor/floor-mode-actions';

const FloorWorkspace = dynamic(() => import('@/components/floor-workspace').then((mod) => mod.FloorWorkspace), {
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
