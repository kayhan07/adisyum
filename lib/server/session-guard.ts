import type { SessionPayload } from '@/lib/auth';
import { isSessionRevoked } from '@/lib/server/session-revocation';

export async function isSessionActive(session: SessionPayload | null | undefined) {
  if (!session) return false;
  const revoked = await isSessionRevoked(session).catch(() => false);
  return !revoked;
}

export async function assertSessionActive(session: SessionPayload | null | undefined, message = 'Oturum sonlandirildi.') {
  if (!session) return { ok: false as const, error: 'Oturum bulunamadi.' };
  const active = await isSessionActive(session);
  if (!active) return { ok: false as const, error: message };
  return { ok: true as const, session };
}
