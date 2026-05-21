'use client';

import { emitRuntimeEvent } from '@/lib/pos-runtime/runtime-event-bus';
import { resolvePrinterNameForCategory, type IntegrationState, type PrinterDeviceRecord } from '@/lib/integration-store';
import { fetchLocalAgentJson } from '@/lib/local-agent';
import type { BranchRuntimeScope, TenantRuntimeScope } from '@/lib/runtime/tenant-runtime-context';

export type RuntimeDeviceIdentity = {
  deviceId: string;
  name: string;
  deviceType: PrinterDeviceRecord['deviceType'];
  status: PrinterDeviceRecord['status'];
  branchId: string;
  tenantId: string;
};

export type DeviceOwnershipState = {
  tenantId: string;
  branchId: string;
  defaultPrinter: string;
  kitchenPrinter: string;
  barPrinter: string;
  activeDevices: RuntimeDeviceIdentity[];
};

export type BridgeRuntimeHandshake = {
  bridgeId: string;
  deviceId?: string;
  tenantId?: string;
  branchId?: string;
  requestedAt: string;
};

function looksLikeBarCategory(value: unknown) {
  const key = String(value ?? '').toLocaleLowerCase('tr-TR');
  return key.includes('bar') || key.includes('içecek') || key.includes('icecek') || key.includes('kahve') || key.includes('alkol') || key.includes('su');
}

export function isRuntimeBarCategory(value: unknown) {
  return looksLikeBarCategory(value);
}

export function registerRuntimeDevices(input: {
  integrationState: IntegrationState;
  tenant: TenantRuntimeScope;
  branch: BranchRuntimeScope;
}) {
  const activeDevices = input.integrationState.printerDevices.filter((device) => device.status !== 'Pasif' && device.deviceType !== 'fiscal_pos');
  const sourceDevices = activeDevices.length > 0 ? activeDevices : input.integrationState.printerDevices;

  const firstPrinter = sourceDevices[0]?.name ?? 'POS Yazıcısı';
  const defaultPrinterByRole = sourceDevices.find((device) => {
    const role = (device.role ?? '').toLocaleLowerCase('tr-TR');
    return role.includes('kasa') || role.includes('pos');
  })?.name;
  const kitchenPrinterByRole = sourceDevices.find((device) => {
    const role = (device.role ?? '').toLocaleLowerCase('tr-TR');
    return role.includes('mutfak') || role.includes('kitchen');
  })?.name;
  const barPrinterByRole = sourceDevices.find((device) => {
    const role = (device.role ?? '').toLocaleLowerCase('tr-TR');
    return role.includes('bar');
  })?.name;

  const kitchenMapped = resolvePrinterNameForCategory('Yemek', input.integrationState.printerMappings, input.integrationState.printerDevices);
  const barMapped = resolvePrinterNameForCategory('İçecek', input.integrationState.printerMappings, input.integrationState.printerDevices);
  const defaultPrinter = input.integrationState.printerSettings.defaultPrinter || defaultPrinterByRole || firstPrinter;
  const kitchenPrinter = input.integrationState.printerSettings.kitchenPrinter || (kitchenMapped === 'Mutfak yazıcısı' ? (kitchenPrinterByRole ?? defaultPrinter) : kitchenMapped);
  const barPrinter = input.integrationState.printerSettings.barPrinter || (barMapped === 'Bar yazıcısı' ? (barPrinterByRole ?? defaultPrinter) : barMapped);

  const ownership = {
    tenantId: input.tenant.tenantId,
    branchId: input.branch.branchId,
    defaultPrinter,
    kitchenPrinter: kitchenPrinter || defaultPrinter,
    barPrinter: barPrinter || defaultPrinter,
    activeDevices: sourceDevices.map((device) => ({
      deviceId: device.id,
      name: device.name,
      deviceType: device.deviceType,
      status: device.status,
      branchId: input.branch.branchId,
      tenantId: input.tenant.tenantId,
    })),
  } satisfies DeviceOwnershipState;

  return ownership;
}

export function traceDeviceOwnershipRestored(ownership: DeviceOwnershipState) {
  emitRuntimeEvent({
    type: 'device ownership restored',
    channel: 'pos-runtime',
    payload: {
      tenantId: ownership.tenantId,
      branchId: ownership.branchId,
      deviceCount: ownership.activeDevices.length,
      defaultPrinter: ownership.defaultPrinter,
      kitchenPrinter: ownership.kitchenPrinter,
      barPrinter: ownership.barPrinter,
    },
  });
}

export function resolveRuntimePrinterForCategory(input: {
  category: unknown;
  ownership: DeviceOwnershipState;
}) {
  return looksLikeBarCategory(input.category)
    ? input.ownership.barPrinter
    : input.ownership.kitchenPrinter;
}

export function resolveRuntimePrinterRoute(input: {
  category: unknown;
  integrationState: IntegrationState;
  ownership: DeviceOwnershipState;
}) {
  const categoryDefault = resolveRuntimePrinterForCategory({
    category: input.category,
    ownership: input.ownership,
  });
  const mappedPrinter = resolvePrinterNameForCategory(
    String(input.category ?? ''),
    input.integrationState.printerMappings,
    input.integrationState.printerDevices,
  );
  const resolvedName = (
    mappedPrinter === 'Mutfak yazıcısı'
    || mappedPrinter === 'Bar yazıcısı'
    || mappedPrinter === 'Tatlı yazıcısı'
  )
    ? (categoryDefault || input.ownership.defaultPrinter)
    : (mappedPrinter || categoryDefault || input.ownership.defaultPrinter);
  const resolvedDevice = input.integrationState.printerDevices.find((device) => device.name === resolvedName);

  return resolvedDevice?.deviceType === 'fiscal_pos'
    ? (categoryDefault || input.ownership.defaultPrinter)
    : resolvedName;
}

export async function sendBridgePrint(printerName: string, text: string) {
  const bytesBase64 = btoa(unescape(encodeURIComponent(text)));
  await fetchLocalAgentJson('/print', {
    method: 'POST',
    body: { printerName, bytesBase64, source: 'device-session-registry:sendBridgePrint' },
  });

  emitRuntimeEvent({
    type: 'websocket lifecycle event emitted',
    channel: 'pos-runtime',
    payload: {
      event: 'bridge-print-dispatched',
      printerName,
    },
  });
}

export async function readBridgePrinterNames() {
  const { data } = await fetchLocalAgentJson<
    Array<string | { Name?: string; name?: string }>
    | { ok?: boolean; printers?: Array<string | { Name?: string; name?: string }>; error?: string }
  >('/printers');

  const rawPrinters = Array.isArray(data)
    ? data
    : Array.isArray(data.printers)
      ? data.printers
      : [];

  const printerNames = rawPrinters
    .map((item) => (typeof item === 'string' ? item : (item.Name ?? item.name ?? '')))
    .map((name) => name.trim())
    .filter((name): name is string => Boolean(name));

  emitRuntimeEvent({
    type: 'device ownership restored',
    channel: 'pos-runtime',
    payload: {
      event: 'bridge-printer-discovery',
      printerCount: printerNames.length,
    },
  });

  return printerNames;
}

export function authorizeDeviceHandshake(input: {
  ownership: DeviceOwnershipState;
  handshake: BridgeRuntimeHandshake;
}) {
  const tenantMatches = !input.handshake.tenantId || input.handshake.tenantId === input.ownership.tenantId;
  const branchMatches = !input.handshake.branchId || input.handshake.branchId === input.ownership.branchId || input.ownership.branchId === 'all';
  const deviceMatches = !input.handshake.deviceId || input.ownership.activeDevices.some((device) => device.deviceId === input.handshake.deviceId);
  const authorized = tenantMatches && branchMatches && deviceMatches;

  emitRuntimeEvent({
    type: authorized ? 'bridge session authorized' : 'stale device rejected',
    channel: 'pos-runtime',
    payload: {
      bridgeId: input.handshake.bridgeId,
      deviceId: input.handshake.deviceId,
      tenantId: input.ownership.tenantId,
      branchId: input.ownership.branchId,
      authorized,
      reason: authorized ? undefined : !tenantMatches ? 'tenant_mismatch' : !branchMatches ? 'branch_mismatch' : 'unknown_device',
    },
  });

  return authorized;
}
