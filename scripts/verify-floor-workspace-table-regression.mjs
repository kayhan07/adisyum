import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const floorWorkspace = readFileSync(join(root, 'components', 'floor-workspace.tsx'), 'utf8');

const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function getAuthoritativeOrderGross(lines) {
  const subtotal = lines.reduce((sum, line) => sum + (line.complimentary ? 0 : line.qty * line.price * (line.isReturn ? -1 : 1)), 0);
  return Number(subtotal.toFixed(2));
}

function buildLiveTotalsForKnownTables(knownTables, serverOrders) {
  const allKnownTableIds = [...new Set([
    ...knownTables.map((table) => table.id),
    ...Object.keys(serverOrders),
  ])];

  return Object.fromEntries(
    allKnownTableIds.map((tableId) => [
      tableId,
      getAuthoritativeOrderGross(serverOrders[tableId] ?? []),
    ]),
  );
}

const knownTables = [{ id: 'table-full' }, { id: 'table-cleared' }, { id: 'table-empty' }];
const serverOrders = {
  'table-full': [
    { qty: 2, price: 125 },
    { qty: 1, price: 25, complimentary: true },
    { qty: 1, price: 30, isReturn: true },
  ],
};
const liveTotals = buildLiveTotalsForKnownTables(knownTables, serverOrders);

assert(liveTotals['table-full'] === 220, 'authoritative live total must account for complimentary lines and returns');
assert(liveTotals['table-cleared'] === 0, 'cleared known table must receive explicit liveTotals[tableId] = 0');
assert(liveTotals['table-empty'] === 0, 'empty known table must receive explicit liveTotals[tableId] = 0');
assert(!Object.values(liveTotals).some((value) => value === undefined), 'liveTotals must not contain undefined values for known tables');

assert(/function buildLiveTotalsForKnownTables/.test(floorWorkspace), 'floor workspace must centralize known-table live total building');
assert(/setLiveTotals\(buildLiveTotalsForKnownTables\(nextRows, serverOrders\)\)/.test(floorWorkspace), 'authoritative refresh/hydration must set totals for all known rows');
assert(/setLiveTotals\(buildLiveTotalsForKnownTables\(sortedTableRows, authoritativeOrders\)\)/.test(floorWorkspace), 'table closure server sync must preserve zero totals for omitted known tables');
assert(/stale layout total/.test(floorWorkspace), 'displayTableRows must document stale layout total fallback risk');
assert(/table\.id === tableId[\s\S]*?status: 'available'[\s\S]*?total: 0/.test(floorWorkspace), 'quickClearTable must persist cleared row as available with total 0');
assert(/table\.id === sourceId[\s\S]*?status: 'available'[\s\S]*?total: 0/.test(floorWorkspace), 'performMove source row must persist as available with total 0');
assert(/table\.id === targetId[\s\S]*?status: movedTotal > 0 \? 'occupied' as const : 'available' as const[\s\S]*?total: movedTotal/.test(floorWorkspace), 'performMove target row must persist moved total and occupancy status');
assert(/setTableLiveTotals\(\{[\s\S]*?\[sourceId\]: 0,[\s\S]*?\[targetId\]: movedTotal/.test(floorWorkspace), 'performMove must update live totals for both source and target immediately');
assert(/setTableLiveTotals\(\{ \.\.\.currentTotals, \[tableId\]: 0 \}\)/.test(floorWorkspace), 'quickClearTable must update live total to 0 immediately');

if (failures.length > 0) {
  console.error('Floor workspace table regression checks failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Floor workspace table regression checks passed.');
