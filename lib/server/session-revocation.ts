import { runtimeStateTenantKey } from '@/lib/db/compound-keys';
import { prisma } from '@/lib/db/prisma';
import type { SessionPayload } from '@/lib/auth';

type JsonValueLike = string | number | boolean | null | Record<string, unknown> | JsonValueLike[];

const REVOCATION_KEY = 'auth:session-revocation';
const MAX_ACTIVE_SESSIONS = 500;
const MAX_REVOCATIONS = 3000;

type RevocationRecord = {
  at: number;
  reason: string;
  actorUserId?: string;
};

type ActiveSessionRecord = {
  sid: string;
  userId: string;
  role: string;
  iat: number;
  exp: number;
  lastSeenAt: number;
};

type RevocationState = {
  version: 1;
  updatedAt: number;
  tenantRevoked?: RevocationRecord;
  userRevocations: Record<string, RevocationRecord>;
  sessionRevocations: Record<string, RevocationRecord>;
  activeSessions: Record<string, ActiveSessionRecord>;
};

function createEmptyState(): RevocationState {
  return {
    version: 1,
    updatedAt: Date.now(),
    userRevocations: {},
    sessionRevocations: {},
    activeSessions: {},
  };
}

function normalizeState(payload: unknown): RevocationState {
  if (!payload || typeof payload !== 'object') return createEmptyState();
  const input = payload as Partial<RevocationState>;
  return {
    version: 1,
    updatedAt: typeof input.updatedAt === 'number' ? input.updatedAt : Date.now(),
    tenantRevoked: input.tenantRevoked && typeof input.tenantRevoked === 'object'
      ? {
          at: Number((input.tenantRevoked as RevocationRecord).at || 0),
          reason: String((input.tenantRevoked as RevocationRecord).reason || 'forced'),
          actorUserId: (input.tenantRevoked as RevocationRecord).actorUserId,
        }
      : undefined,
    userRevocations: input.userRevocations && typeof input.userRevocations === 'object'
      ? Object.fromEntries(
          Object.entries(input.userRevocations).map(([userId, value]) => [
            userId,
            {
              at: Number((value as RevocationRecord)?.at || 0),
              reason: String((value as RevocationRecord)?.reason || 'forced'),
              actorUserId: (value as RevocationRecord)?.actorUserId,
            } satisfies RevocationRecord,
          ]),
        )
      : {},
    sessionRevocations: input.sessionRevocations && typeof input.sessionRevocations === 'object'
      ? Object.fromEntries(
          Object.entries(input.sessionRevocations).map(([sid, value]) => [
            sid,
            {
              at: Number((value as RevocationRecord)?.at || 0),
              reason: String((value as RevocationRecord)?.reason || 'forced'),
              actorUserId: (value as RevocationRecord)?.actorUserId,
            } satisfies RevocationRecord,
          ]),
        )
      : {},
    activeSessions: input.activeSessions && typeof input.activeSessions === 'object'
      ? Object.fromEntries(
          Object.entries(input.activeSessions).map(([sid, value]) => [
            sid,
            {
              sid,
              userId: String((value as ActiveSessionRecord)?.userId || ''),
              role: String((value as ActiveSessionRecord)?.role || ''),
              iat: Number((value as ActiveSessionRecord)?.iat || 0),
              exp: Number((value as ActiveSessionRecord)?.exp || 0),
              lastSeenAt: Number((value as ActiveSessionRecord)?.lastSeenAt || 0),
            } satisfies ActiveSessionRecord,
          ]),
        )
      : {},
  };
}

function pruneState(state: RevocationState) {
  const nowSec = Math.floor(Date.now() / 1000);

  for (const [sid, session] of Object.entries(state.activeSessions)) {
    if (!session?.exp || session.exp <= nowSec) {
      delete state.activeSessions[sid];
    }
  }

  for (const [sid, revoked] of Object.entries(state.sessionRevocations)) {
    if (!revoked?.at || revoked.at < nowSec - (60 * 60 * 24 * 7)) {
      delete state.sessionRevocations[sid];
    }
  }

  for (const [userId, revoked] of Object.entries(state.userRevocations)) {
    if (!revoked?.at || revoked.at < nowSec - (60 * 60 * 24 * 7)) {
      delete state.userRevocations[userId];
    }
  }

  const sessions = Object.values(state.activeSessions)
    .sort((a, b) => b.lastSeenAt - a.lastSeenAt)
    .slice(0, MAX_ACTIVE_SESSIONS);
  state.activeSessions = Object.fromEntries(sessions.map((session) => [session.sid, session]));

  const sessionRevocations = Object.entries(state.sessionRevocations)
    .sort((a, b) => b[1].at - a[1].at)
    .slice(0, MAX_REVOCATIONS);
  state.sessionRevocations = Object.fromEntries(sessionRevocations);

  const userRevocations = Object.entries(state.userRevocations)
    .sort((a, b) => b[1].at - a[1].at)
    .slice(0, MAX_REVOCATIONS);
  state.userRevocations = Object.fromEntries(userRevocations);

  state.updatedAt = Date.now();
}

async function readState(tenantId: string) {
  const row = await prisma.runtimeState.findUnique({
    where: runtimeStateTenantKey(tenantId, REVOCATION_KEY),
    select: { payload: true },
  }).catch(() => null);

  const state = normalizeState(row?.payload);
  pruneState(state);
  return state;
}

async function writeState(tenantId: string, state: RevocationState) {
  pruneState(state);
  await prisma.runtimeState.upsert({
    where: runtimeStateTenantKey(tenantId, REVOCATION_KEY),
    update: { payload: JSON.parse(JSON.stringify(state)) as JsonValueLike },
    create: {
      tenantId,
      key: REVOCATION_KEY,
      payload: JSON.parse(JSON.stringify(state)) as JsonValueLike,
    },
  });
}

export async function registerActiveSession(session: Pick<SessionPayload, 'tenantId' | 'userId' | 'role' | 'iat' | 'exp' | 'sid'>) {
  if (!session.sid) return;
  const state = await readState(session.tenantId);
  state.activeSessions[session.sid] = {
    sid: session.sid,
    userId: session.userId,
    role: session.role,
    iat: session.iat,
    exp: session.exp,
    lastSeenAt: Math.floor(Date.now() / 1000),
  };
  await writeState(session.tenantId, state);
}

export async function revokeCurrentSession(options: {
  tenantId: string;
  sid?: string;
  reason: string;
  actorUserId?: string;
}) {
  if (!options.sid) return;
  const state = await readState(options.tenantId);
  const nowSec = Math.floor(Date.now() / 1000);
  state.sessionRevocations[options.sid] = {
    at: nowSec,
    reason: options.reason,
    actorUserId: options.actorUserId,
  };
  delete state.activeSessions[options.sid];
  await writeState(options.tenantId, state);
}

export async function revokeUserSessions(options: {
  tenantId: string;
  userId: string;
  reason: string;
  actorUserId?: string;
  exceptSid?: string;
}) {
  const state = await readState(options.tenantId);
  const nowSec = Math.floor(Date.now() / 1000);

  state.userRevocations[options.userId] = {
    at: nowSec,
    reason: options.reason,
    actorUserId: options.actorUserId,
  };

  for (const [sid, session] of Object.entries(state.activeSessions)) {
    if (session.userId !== options.userId) continue;
    if (options.exceptSid && sid === options.exceptSid) continue;
    state.sessionRevocations[sid] = {
      at: nowSec,
      reason: options.reason,
      actorUserId: options.actorUserId,
    };
    delete state.activeSessions[sid];
  }

  await writeState(options.tenantId, state);
}

export async function revokeTenantSessions(options: {
  tenantId: string;
  reason: string;
  actorUserId?: string;
  exceptSid?: string;
}) {
  const state = await readState(options.tenantId);
  const nowSec = Math.floor(Date.now() / 1000);

  state.tenantRevoked = {
    at: nowSec,
    reason: options.reason,
    actorUserId: options.actorUserId,
  };

  for (const [sid] of Object.entries(state.activeSessions)) {
    if (options.exceptSid && sid === options.exceptSid) continue;
    state.sessionRevocations[sid] = {
      at: nowSec,
      reason: options.reason,
      actorUserId: options.actorUserId,
    };
    delete state.activeSessions[sid];
  }

  await writeState(options.tenantId, state);
}

export async function isSessionRevoked(session: Pick<SessionPayload, 'tenantId' | 'userId' | 'sid' | 'iat'>) {
  const state = await readState(session.tenantId);

  if (state.tenantRevoked && session.iat <= state.tenantRevoked.at) {
    return true;
  }

  const userRevoked = state.userRevocations[session.userId];
  if (userRevoked && session.iat <= userRevoked.at) {
    return true;
  }

  if (session.sid && state.sessionRevocations[session.sid]) {
    return true;
  }

  return false;
}

export async function getRevocationSummary(tenantId: string) {
  const state = await readState(tenantId);
  return {
    activeSessions: Object.keys(state.activeSessions).length,
    userRevocations: Object.keys(state.userRevocations).length,
    sessionRevocations: Object.keys(state.sessionRevocations).length,
    tenantRevoked: Boolean(state.tenantRevoked),
    updatedAt: state.updatedAt,
  };
}
