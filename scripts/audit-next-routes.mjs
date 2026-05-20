import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

const criticalRoutes = [
  {
    route: '/api/pos/table-orders',
    manifestKey: '/api/pos/table-orders/route',
    source: 'app/api/pos/table-orders/route.ts',
    artifact: '.next/server/app/api/pos/table-orders/route.js',
    methods: ['GET', 'POST'],
  },
  {
    route: '/api/system-admin/observability/ingest',
    manifestKey: '/api/system-admin/observability/ingest/route',
    source: 'app/api/system-admin/observability/ingest/route.ts',
    artifact: '.next/server/app/api/system-admin/observability/ingest/route.js',
    methods: ['POST'],
  },
  {
    route: '/api/runtime/pos-catalog',
    manifestKey: '/api/runtime/pos-catalog/route',
    source: 'app/api/runtime/pos-catalog/route.ts',
    artifact: '.next/server/app/api/runtime/pos-catalog/route.js',
    methods: ['GET', 'POST'],
  },
  {
    route: '/api/runtime/state/[scope]',
    manifestKey: '/api/runtime/state/[scope]/route',
    source: 'app/api/runtime/state/[scope]/route.ts',
    artifact: '.next/server/app/api/runtime/state/[scope]/route.js',
    methods: ['GET', 'POST', 'DELETE'],
  },
];

function readJson(file) {
  const absolute = path.join(root, file);
  if (!fs.existsSync(absolute)) return null;
  return JSON.parse(fs.readFileSync(absolute, 'utf8'));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const appPathsManifest = readJson('.next/server/app-paths-manifest.json');
assert(appPathsManifest, 'Missing .next/server/app-paths-manifest.json. Run next build before routes:audit.');

const failures = [];
const results = [];

for (const route of criticalRoutes) {
  const sourcePath = path.join(root, route.source);
  const artifactPath = path.join(root, route.artifact);
  const source = fs.existsSync(sourcePath) ? fs.readFileSync(sourcePath, 'utf8') : '';
  const manifestValue = appPathsManifest[route.manifestKey];
  const methodResults = route.methods.map((method) => ({
    method,
    exported: new RegExp(`export\\s+async\\s+function\\s+${method}\\b|export\\s+function\\s+${method}\\b|export\\s+const\\s+${method}\\b`).test(source),
  }));
  const missingMethods = methodResults.filter((item) => !item.exported).map((item) => item.method);
  const ok = Boolean(source)
    && fs.existsSync(artifactPath)
    && manifestValue === route.artifact.replace('.next/server/', '')
    && missingMethods.length === 0;

  results.push({
    route: route.route,
    source: route.source,
    artifact: route.artifact,
    manifestValue,
    methods: methodResults,
    ok,
  });

  if (!source) failures.push(`${route.route}: source missing at ${route.source}`);
  if (!fs.existsSync(artifactPath)) failures.push(`${route.route}: build artifact missing at ${route.artifact}`);
  if (manifestValue !== route.artifact.replace('.next/server/', '')) {
    failures.push(`${route.route}: manifest mismatch, got ${manifestValue ?? '(missing)'}`);
  }
  if (missingMethods.length > 0) failures.push(`${route.route}: missing method exports ${missingMethods.join(', ')}`);
}

console.log(JSON.stringify({ ok: failures.length === 0, checkedAt: new Date().toISOString(), results, failures }, null, 2));

if (failures.length > 0) {
  process.exitCode = 1;
}
