import { createHash } from 'node:crypto';
import { prisma } from '@/lib/db/prisma';
import { toPrismaJson } from '@/lib/db/prisma-json';
import type { SessionPayload } from '@/lib/auth';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string | undefined | null) {
  return Boolean(value && UUID_PATTERN.test(value));
}

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function json(value: unknown) {
  return toPrismaJson(value);
}

export async function createDbSession(input: {
  token: string;
  session: SessionPayload;
  ip?: string | null;
  userAgent?: string | null;
}) {
  if (!isUuid(input.session.userId)) return null;

  return prisma.session.create({
    data: {
      tenantId: input.session.tenantId,
      userId: input.session.userId,
      branchId: input.session.branchId ?? null,
      subscriptionId: isUuid(input.session.subscriptionId) ? input.session.subscriptionId : null,
      tokenHash: sha256(input.token),
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
      expiresAt: new Date(input.session.exp * 1000),
      lastSeenAt: new Date(),
      metadata: json({
        sid: input.session.sid,
        role: input.session.role,
        packageType: input.session.packageType,
      }),
    },
    select: { id: true },
  });
}
