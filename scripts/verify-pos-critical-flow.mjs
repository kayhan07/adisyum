import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}

const orderComposer = read('components/order-composer.tsx');
const floorWorkspace = read('components/floor-workspace.tsx');
const tableOrdersRoute = read('app/api/pos/table-orders/route.ts');
const localAgentRoute = read('app/api/printers/local-agent/route.ts');

const saveRequestIndex = orderComposer.indexOf("action: 'save_order'");
const printerDiscoveryIndex = orderComposer.indexOf('const ensureRuntimePrinters');

assert(saveRequestIndex > -1, 'Order composer must persist save_order before printing');
assert(printerDiscoveryIndex > -1 && saveRequestIndex < printerDiscoveryIndex, 'Order persistence must run before printer discovery');
assert(orderComposer.includes('Adisyon kaydedildi. Yazıcı bulunamadı'), 'Missing printer feedback must confirm the order remains saved');
assert(tableOrdersRoute.includes("normalizedBody.action === 'save_order'"), 'Table-orders API must expose the save_order mutation');
assert(tableOrdersRoute.includes("normalizedBody.action === 'mark_order_sent'"), 'Table-orders API must separate saved orders from printed orders');
assert(orderComposer.includes("await persistOrderState('mark_order_sent')"), 'Order composer must mark items sent only after successful printing');
assert(tableOrdersRoute.includes("'order.saved'"), 'Table-orders API must publish the saved order event');
assert(tableOrdersRoute.includes('tenantProductIds'), 'Open-order hydration must preserve active products linked to the current tenant');
assert(!/catalog\.items\.length === 0[\s\S]{0,120}return \{\}/.test(tableOrdersRoute), 'Open-order hydration must not disappear while the runtime catalog is rebuilding');
assert(tableOrdersRoute.includes("normalizedBody.action === 'close_table_payment'"), 'Payment must close through the authoritative table-orders API');
assert(tableOrdersRoute.includes("'order_not_found_for_payment'"), 'Payment close must fail safely when the table order is missing');
assert(/table\.total > 0\) return 'occupied'/.test(floorWorkspace), 'Floor status must mark a table occupied when the authoritative total is positive');
assert(localAgentRoute.includes('registered_printers_only'), 'Local-agent proxy must expose registered printers when the agent is missing');
assert(localAgentRoute.includes('agent_offline_registered_printers'), 'Local-agent proxy must expose registered printers when the agent is offline');
assert(localAgentRoute.includes('prisma.printer.findMany'), 'Local-agent proxy must load tenant-scoped registered printer mappings');

if (failures.length > 0) {
  console.error('POS critical flow validation failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('POS critical flow validation passed.');
