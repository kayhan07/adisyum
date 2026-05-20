import crypto from 'node:crypto';

export type BridgePrinterInventory = {
  name: string;
  driver?: string;
  status?: string;
  online?: boolean;
  connectionType?: 'usb' | 'network' | 'serial' | 'windows' | 'unknown' | string;
  default?: boolean;
  paperWidthMm?: number;
  escpos?: boolean;
  turkishCharset?: boolean;
  cut?: boolean;
  drawerPulse?: boolean;
};

export type BridgeRegistrationInput = {
  tenantId: string;
  branchId?: string | null;
  deviceId: string;
  hostname?: string | null;
  localIp?: string | null;
  bridgeVersion?: string | null;
  deviceToken?: string | null;
  printers?: BridgePrinterInventory[];
  fiscalCapable?: boolean;
  reconnectCount?: number;
  queueDepth?: number;
  spoolerHealth?: string;
  metadata?: Record<string, unknown>;
};

export function hashDeviceToken(token: string | null | undefined) {
  if (!token) return null;
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function normalizePrinterInventory(printers: BridgePrinterInventory[] = []) {
  const seen = new Set<string>();
  return printers
    .filter((printer) => printer?.name?.trim())
    .map((printer) => ({
      name: printer.name.trim().slice(0, 180),
      driver: printer.driver?.trim().slice(0, 180),
      status: printer.status ?? (printer.online === false ? 'offline' : 'online'),
      online: printer.online !== false,
      connectionType: printer.connectionType ?? 'unknown',
      default: Boolean(printer.default),
      paperWidthMm: Number.isFinite(Number(printer.paperWidthMm)) ? Number(printer.paperWidthMm) : undefined,
      escpos: Boolean(printer.escpos),
      turkishCharset: Boolean(printer.turkishCharset),
      cut: Boolean(printer.cut),
      drawerPulse: Boolean(printer.drawerPulse),
    }))
    .filter((printer) => {
      const key = printer.name.toLocaleLowerCase('tr-TR');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 100);
}

export function summarizeDeviceCapabilities(printers: BridgePrinterInventory[] = []) {
  const normalized = normalizePrinterInventory(printers);
  return {
    printerCount: normalized.length,
    onlinePrinterCount: normalized.filter((printer) => printer.online).length,
    escposCapable: normalized.some((printer) => printer.escpos),
    turkishCharsetCapable: normalized.some((printer) => printer.turkishCharset),
    drawerPulseCapable: normalized.some((printer) => printer.drawerPulse),
    cutCapable: normalized.some((printer) => printer.cut),
  };
}

export function computeDeviceInstabilityScore(input: {
  reconnectCount?: number;
  queueDepth?: number;
  offlineDurationSec?: number;
  failedJobs?: number;
  latencyMs?: number;
}) {
  const reconnectPenalty = Math.min(35, Math.max(0, input.reconnectCount ?? 0) * 3);
  const queuePenalty = Math.min(25, Math.max(0, input.queueDepth ?? 0));
  const offlinePenalty = Math.min(25, Math.floor(Math.max(0, input.offlineDurationSec ?? 0) / 60));
  const failurePenalty = Math.min(30, Math.max(0, input.failedJobs ?? 0) * 5);
  const latencyPenalty = (input.latencyMs ?? 0) > 3000 ? 10 : (input.latencyMs ?? 0) > 1000 ? 4 : 0;
  return Math.min(100, reconnectPenalty + queuePenalty + offlinePenalty + failurePenalty + latencyPenalty);
}

export function validateCloudPrintRequest(input: {
  tenantId?: string;
  printerName?: string;
  bytesBase64?: string;
  mutationId?: string;
  targetDeviceId?: string | null;
}) {
  const errors: string[] = [];
  if (!input.tenantId) errors.push('tenantId_missing');
  if (!input.printerName?.trim()) errors.push('printerName_missing');
  if (!input.bytesBase64?.trim()) errors.push('payload_missing');
  if (!input.mutationId?.trim()) errors.push('mutationId_missing');
  return {
    ok: errors.length === 0,
    errors,
    printerName: input.printerName?.trim() ?? '',
    mutationId: input.mutationId?.trim() ?? '',
    targetDeviceId: input.targetDeviceId?.trim() || null,
  };
}
