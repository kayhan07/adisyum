'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { getDefaultAccessState, loadAccessState, saveAccessState, subscribeToAccessChanges } from '@/lib/access-store';
import { getDefaultSessionState, loadSessionState, updateSessionUser } from '@/lib/session-store';

const permissionLabels = ['Sipariş oluşturma', 'Sipariş düzenleme', 'Ödeme alma', 'Rapor görme'];

export default function AccessPage() {
  const [accessState, setAccessState] = useState(() => getDefaultAccessState());
  const [session, setSession] = useState(() => getDefaultSessionState());
  const [roleName, setRoleName] = useState('');
  const [roleDescription, setRoleDescription] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const refresh = () => {
      setAccessState(loadAccessState());
      setSession(loadSessionState());
    };
    refresh();
    const unsubscribe = subscribeToAccessChanges(refresh);
    return () => unsubscribe();
  }, []);

  function persist(nextState: ReturnType<typeof loadAccessState>) {
    saveAccessState(nextState);
    setAccessState(nextState);
  }

  function addRole() {
    if (!roleName.trim()) return;
    persist({
      ...accessState,
      customRoles: [
        {
          name: roleName.trim(),
          description: roleDescription.trim() || 'Özel oluşturulan operasyon rolü',
          permissions: permissionLabels.slice(0, 2),
        },
        ...accessState.customRoles,
      ],
    });
    setRoleName('');
    setRoleDescription('');
    setMessage('Yeni özel rol kaydedildi.');
  }

  function switchUserRole(role: string) {
    updateSessionUser({ role });
    setSession(loadSessionState());
    setMessage(`Aktif kullanıcı rolü ${role} olarak güncellendi.`);
  }

  return (
    <AppShell
      title="Rol ve izin matrisi"
      subtitle="Özel rol tanımlayın, aksiyon bazlı yetkileri yönetin ve aktif kullanıcının çalışma rolünü merkezden kontrol edin."
      actions={<button type="button" onClick={() => document.getElementById('ozel-roller')?.scrollIntoView({ behavior: 'smooth' })} className="rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white">Özel Rollere Git</button>}
    >
      {message ? <section className="rounded-3xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-700">{message}</section> : null}
      <section className="grid gap-5 xl:grid-cols-[1fr_0.9fr]">
        <div className="rounded-4xl border border-line bg-panel p-5 shadow-soft">
          <p className="text-xs uppercase tracking-[0.24em] text-muted">Yetki matrisi</p>
          <div className="mt-4 overflow-hidden rounded-3xl border border-line bg-canvas">
            <div className="grid grid-cols-6 gap-3 border-b border-line px-4 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-muted">
              <span>Rol</span><span>Sipariş</span><span>İptal</span><span>Fiyat</span><span>Ödeme</span><span>Rapor</span>
            </div>
            {accessState.permissionMatrix.map((row) => (
              <button key={row.role} type="button" onClick={() => switchUserRole(row.role)} className="grid w-full grid-cols-6 gap-3 px-4 py-4 text-left text-sm text-ink hover:bg-panel">
                <span className="font-semibold">{row.role}</span>
                <span>{row.create ? 'Evet' : 'Hayır'}</span>
                <span>{row.cancel ? 'Evet' : 'Hayır'}</span>
                <span>{row.pricing ? 'Evet' : 'Hayır'}</span>
                <span>{row.payment ? 'Evet' : 'Hayır'}</span>
                <span>{row.reports ? 'Evet' : 'Hayır'}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-5">
          <div className="rounded-4xl border border-line bg-panel p-5 shadow-soft">
            <p className="text-xs uppercase tracking-[0.24em] text-muted">Aktif kullanıcı görünümü</p>
            <h2 className="mt-2 text-2xl font-semibold text-ink">{session.currentUser.name}</h2>
            <p className="mt-1 text-sm text-muted">{session.currentUser.role} · {session.currentUser.branch}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {accessState.currentPermissions.map((permission) => (
                <span key={permission} className="rounded-full bg-accentSoft px-3 py-2 text-sm font-semibold text-accent">{permission}</span>
              ))}
            </div>
          </div>
          <div id="ozel-roller" className="rounded-4xl border border-line bg-panel p-5 shadow-soft scroll-mt-24">
            <p className="text-xs uppercase tracking-[0.24em] text-muted">Özel roller</p>
            <div className="mt-4 grid gap-3">
              <input value={roleName} onChange={(event) => setRoleName(event.target.value)} placeholder="Rol adı" className="rounded-2xl border border-line bg-canvas px-4 py-3 text-sm text-ink outline-none" />
              <input value={roleDescription} onChange={(event) => setRoleDescription(event.target.value)} placeholder="Rol açıklaması" className="rounded-2xl border border-line bg-canvas px-4 py-3 text-sm text-ink outline-none" />
              <button type="button" onClick={addRole} className="rounded-2xl bg-accent px-4 py-3 text-sm font-semibold text-white">Rolü kaydet</button>
            </div>
            <div className="mt-4 space-y-3">
              {accessState.customRoles.map((role) => (
                <div key={role.name} className="rounded-3xl border border-line bg-canvas p-4">
                  <p className="font-semibold text-ink">{role.name}</p>
                  <p className="mt-1 text-sm text-muted">{role.description}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {role.permissions.map((permission) => (
                      <span key={permission} className="rounded-full border border-line px-3 py-1 text-sm text-muted">{permission}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
