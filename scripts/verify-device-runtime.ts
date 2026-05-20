import {
  computeDeviceInstabilityScore,
  hashDeviceToken,
  normalizePrinterInventory,
  summarizeDeviceCapabilities,
  validateCloudPrintRequest,
} from '../lib/device-runtime';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const printers = normalizePrinterInventory([
  { name: 'Kitchen ESC/POS', driver: 'Generic', online: true, escpos: true, turkishCharset: true, cut: true },
  { name: 'Kitchen ESC/POS', driver: 'Duplicate', online: false },
  { name: 'Cashier', online: true, drawerPulse: true, paperWidthMm: 80 },
]);

assert(printers.length === 2, 'printer inventory must deduplicate by name');
const summary = summarizeDeviceCapabilities(printers);
assert(summary.escposCapable, 'ESC/POS capability must be detected');
assert(summary.drawerPulseCapable, 'cash drawer capability must be detected');
assert(hashDeviceToken('secret-token')?.length === 64, 'device token hash must be sha256');

const invalidPrint = validateCloudPrintRequest({ tenantId: 'ABN', printerName: '', bytesBase64: '', mutationId: '' });
assert(!invalidPrint.ok && invalidPrint.errors.length >= 3, 'invalid cloud print request must be rejected');
const validPrint = validateCloudPrintRequest({ tenantId: 'ABN', printerName: 'Cashier', bytesBase64: 'AA==', mutationId: 'print-1' });
assert(validPrint.ok, 'valid cloud print request must pass');

const instability = computeDeviceInstabilityScore({ reconnectCount: 5, queueDepth: 3, failedJobs: 2, latencyMs: 3200 });
assert(instability > 0, 'instability score must react to reconnects/failures');

console.log('device runtime verified', { printerCount: printers.length, instability });
