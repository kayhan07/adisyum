import { timingSafeEqual } from 'node:crypto';
import { prisma } from '@/lib/db/prisma';
import { hashDeviceToken } from '@/lib/device-runtime';
import { assertTenantCanAccess } from '@/lib/db/tenant-repository';
import { getSessionFromRequest } from '@/lib/session';
import { isSessionActive } from '@/lib/server/session-guard';

function safeEqual(left: string | null | undefined, right: string | null | undefined) {
  if (!left || !right) return false;
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export async function authenticateRegisteredDevice(request: Request, options: { readOnly?: boolean } = {}) {
  const tenantId = request.headers.get('x-adisyum-tenant-id')?.trim().slice(0, 64);
  const deviceId = request.headers.get('x-adisyum-device-id')?.trim().slice(0, 160);
  const deviceToken = request.headers.get('x-adisyum-device-token')?.trim();
  if (!tenantId || !deviceId || !deviceToken) return null;

  const device = await prisma.tenantDeviceRegistry.findFirst({
    where: { tenantId, deviceId, revokedAt: null },
  });
  if (!device || !safeEqual(device.deviceTokenHash, hashDeviceToken(deviceToken))) return null;
  await assertTenantCanAccess(tenantId, { readOnly: options.readOnly ?? false });
  return { tenantId, branchId: device.branchId, deviceId, device };
}

export async function authenticateTenantSession(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session || !(await isSessionActive(session))) return null;
  return session;
}
