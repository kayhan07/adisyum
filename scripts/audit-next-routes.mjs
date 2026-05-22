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

function routeFromSource(source) {
  if (source.startsWith('app/api/') && source.endsWith('/route.ts')) {
    return {
      route: `/${source.replace(/^app\//, '').replace(/\/route\.ts$/, '')}`,
      manifestKey: `/${source.replace(/^app\//, '').replace(/\.ts$/, '')}`,
      source,
      artifact: `.next/server/${source.replace(/\.ts$/, '.js')}`,
    };
  }
  if (source.startsWith('pages/api/')) {
    return {
      route: `/${source.replace(/\.(ts|tsx|js|mjs|cjs)$/, '')}`,
      manifestKey: null,
      source,
      artifact: `.next/server/${source.replace(/\.(ts|tsx|js|mjs|cjs)$/, '.js')}`,
    };
  }
  return null;
}

function readJson(file) {
  const absolute = path.join(root, file);
  if (!fs.existsSync(absolute)) return null;
  return JSON.parse(fs.readFileSync(absolute, 'utf8'));
}

function readText(file) {
  const absolute = path.join(root, file);
  return fs.existsSync(absolute) ? fs.readFileSync(absolute, 'utf8') : '';
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function nginxLocationBlock(config, pattern) {
  const match = pattern.exec(config);
  if (!match) return '';
  const start = match.index;
  let depth = 0;
  for (let index = start; index < config.length; index += 1) {
    if (config[index] === '{') depth += 1;
    if (config[index] === '}') {
      depth -= 1;
      if (depth === 0) return config.slice(start, index + 1);
    }
  }
  return config.slice(start);
}

function walkFiles(dir, matcher, matches = []) {
  const absolute = path.join(root, dir);
  if (!fs.existsSync(absolute)) return matches;
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    const relative = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', '.next', '.git'].includes(entry.name)) continue;
      walkFiles(relative, matcher, matches);
    } else if (matcher(relative.replaceAll('\\', '/'))) {
      matches.push(relative.replaceAll('\\', '/'));
    }
  }
  return matches;
}

const appPathsManifest = readJson('.next/server/app-paths-manifest.json');
assert(appPathsManifest, 'Missing .next/server/app-paths-manifest.json. Run next build before routes:audit.');
const middlewareManifest = readJson('.next/server/middleware-manifest.json');

const failures = [];
const results = [];
const warnings = [];
const nextConfig = readText('next.config.mjs') || readText('next.config.js');
const ecosystemConfig = readText('ecosystem.config.cjs') || readText('ecosystem.config.js');
const nginxConfig = readText('deploy/nginx/adisyum.conf');
const reconstructScript = readText('deploy/scripts/reconstruct-vps-runtime.sh');
const standaloneExpected = /output\s*:\s*['"]standalone['"]/.test(nextConfig);
const nginxExactApiBlock = nginxLocationBlock(nginxConfig, /location\s+=\s+\/api\s*\{/);
const nginxPrefixApiBlock = nginxLocationBlock(nginxConfig, /location\s+\^~\s+\/api\/\s*\{/);
const nginxLegacyAdisyonExactBlock = nginxLocationBlock(nginxConfig, /location\s+=\s+\/adisyonsistemi\s*\{/);
const nginxLegacyAdisyonPrefixBlock = nginxLocationBlock(nginxConfig, /location\s+\^~\s+\/adisyonsistemi\/\s*\{/);
const nginxExactApiToRoot = /proxy_pass\s+http:\/\/127\.0\.0\.1:3000;/.test(nginxExactApiBlock);
const nginxPrefixApiToRoot = /proxy_pass\s+http:\/\/127\.0\.0\.1:3000;/.test(nginxPrefixApiBlock);
const nginxApiToWebsite = /proxy_pass\s+http:\/\/127\.0\.0\.1:3010;/.test(`${nginxExactApiBlock}\n${nginxPrefixApiBlock}`);
const nginxLegacyAdisyonRedirectsToApp = /return\s+308\s+\/app;/.test(nginxLegacyAdisyonExactBlock)
  && /return\s+308\s+\/app;/.test(nginxLegacyAdisyonPrefixBlock);
const nginxLegacyAdisyonProxiesToRoot = /proxy_pass\s+http:\/\/127\.0\.0\.1:3000;/.test(`${nginxLegacyAdisyonExactBlock}\n${nginxLegacyAdisyonPrefixBlock}`)
  || /location\s+~[^{]*adisyonsistemi[^{]*\{[\s\S]*?proxy_pass\s+http:\/\/127\.0\.0\.1:3000;[\s\S]*?\}/.test(nginxConfig);
const pm2UsesStandalone = /\.next\/standalone|standalone\/server\.js|server\.js/.test(ecosystemConfig);
const standaloneExists = fs.existsSync(path.join(root, '.next/standalone'));
const duplicateTableOrderRoutes = walkFiles('.', (file) => (
  /(^|\/)(app|pages|apps)\/.*api\/pos\/table-orders\/route\.(ts|tsx|js|mjs|cjs)$/.test(file)
  || /(^|\/)(pages|apps)\/.*api\/pos\/table-orders\.(ts|tsx|js|mjs|cjs)$/.test(file)
));
const discoveredApiRoutes = walkFiles('.', (file) => (
  /^app\/api\/.*\/route\.ts$/.test(file)
  || /^pages\/api\/.*\.(ts|tsx|js|mjs|cjs)$/.test(file)
))
  .map(routeFromSource)
  .filter(Boolean);
const routesBySource = new Map();

for (const route of [...discoveredApiRoutes, ...criticalRoutes]) {
  const previous = routesBySource.get(route.source);
  routesBySource.set(route.source, { ...previous, ...route, methods: route.methods ?? previous?.methods });
}
const auditedRoutes = [...routesBySource.values()];

if (duplicateTableOrderRoutes.length !== 1 || duplicateTableOrderRoutes[0] !== 'app/api/pos/table-orders/route.ts') {
  failures.push(`/api/pos/table-orders: duplicate or misplaced route files detected: ${duplicateTableOrderRoutes.join(', ') || '(none)'}`);
}

if (standaloneExpected && !standaloneExists) {
  failures.push('next.config expects standalone output, but .next/standalone is missing');
}

if (pm2UsesStandalone && !standaloneExists) {
  failures.push('PM2 config appears to use standalone runtime, but .next/standalone is missing');
}

if (!middlewareManifest) {
  failures.push('Missing .next/server/middleware-manifest.json. Middleware build output is not auditable.');
}

if (!nginxExactApiToRoot) {
  failures.push('deploy/nginx/adisyum.conf must route exact /api to root app port 3000');
}

if (!nginxPrefixApiToRoot) {
  failures.push('deploy/nginx/adisyum.conf must route /api/* to root app port 3000');
}

if (nginxApiToWebsite) {
  failures.push('deploy/nginx/adisyum.conf routes /api to website port 3010');
}

if (!nginxLegacyAdisyonRedirectsToApp) {
  failures.push('deploy/nginx/adisyum.conf must permanently redirect /adisyonsistemi to /app');
}

if (nginxLegacyAdisyonProxiesToRoot) {
  failures.push('deploy/nginx/adisyum.conf must not proxy legacy /adisyonsistemi to the root runtime');
}

if (!/Missing location = \/api/.test(reconstructScript) || !/Missing location \^~ \/api\//.test(reconstructScript)) {
  failures.push('reconstruct-vps-runtime.sh must validate active NGINX /api locations');
}

if (!/expected HTTP \$\{expected\}/.test(reconstructScript) || !/api\/pos\/table-orders\"\s+\"401\"/.test(reconstructScript)) {
  failures.push('reconstruct-vps-runtime.sh must require POST /api/pos/table-orders to return 401 missing-session route proof, not merely non-404');
}

if (!standaloneExpected && !pm2UsesStandalone) {
  warnings.push('Standalone output is not enabled; PM2 is expected to run next start against .next.');
}

for (const route of auditedRoutes) {
  const sourcePath = path.join(root, route.source);
  const artifactPath = path.join(root, route.artifact);
  const standaloneArtifactPath = path.join(root, '.next/standalone/.next/server', route.artifact.replace('.next/server/', ''));
  const source = fs.existsSync(sourcePath) ? fs.readFileSync(sourcePath, 'utf8') : '';
  const manifestValue = appPathsManifest[route.manifestKey];
  const routeMethods = route.methods ?? ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].filter((method) => (
    new RegExp(`export\\s+async\\s+function\\s+${method}\\b|export\\s+function\\s+${method}\\b|export\\s+const\\s+${method}\\b`).test(source)
  ));
  const methodResults = routeMethods.map((method) => ({
    method,
    exported: new RegExp(`export\\s+async\\s+function\\s+${method}\\b|export\\s+function\\s+${method}\\b|export\\s+const\\s+${method}\\b`).test(source),
  }));
  const missingMethods = methodResults.filter((item) => !item.exported).map((item) => item.method);
  const ok = Boolean(source)
    && fs.existsSync(artifactPath)
    && (!route.manifestKey || manifestValue === route.artifact.replace('.next/server/', ''))
    && missingMethods.length === 0;

  results.push({
    route: route.route,
    source: route.source,
    artifact: route.artifact,
    standaloneArtifact: standaloneExists ? path.relative(root, standaloneArtifactPath).replaceAll('\\', '/') : null,
    standaloneArtifactExists: standaloneExists ? fs.existsSync(standaloneArtifactPath) : null,
    manifestValue,
    methods: methodResults,
    ok,
  });

  if (!source) failures.push(`${route.route}: source missing at ${route.source}`);
  if (!fs.existsSync(artifactPath)) failures.push(`${route.route}: build artifact missing at ${route.artifact}`);
  if (route.manifestKey && manifestValue !== route.artifact.replace('.next/server/', '')) {
    failures.push(`${route.route}: manifest mismatch, got ${manifestValue ?? '(missing)'}`);
  }
  if (missingMethods.length > 0) failures.push(`${route.route}: missing method exports ${missingMethods.join(', ')}`);
  if (standaloneExists && !fs.existsSync(standaloneArtifactPath)) {
    failures.push(`${route.route}: standalone artifact missing at ${path.relative(root, standaloneArtifactPath)}`);
  }
}

console.log(JSON.stringify({
  ok: failures.length === 0,
  checkedAt: new Date().toISOString(),
  deploymentShape: {
    standaloneExpected,
    standaloneExists,
    pm2UsesStandalone,
    pm2Runtime: pm2UsesStandalone ? 'standalone' : 'next-start',
    duplicateTableOrderRoutes,
    nginxApiNamespace: {
      exactApiToRoot: nginxExactApiToRoot,
      prefixApiToRoot: nginxPrefixApiToRoot,
      apiToWebsite: nginxApiToWebsite,
    },
    legacyAdisyonRoute: {
      redirectsToApp: nginxLegacyAdisyonRedirectsToApp,
      proxiesToRoot: nginxLegacyAdisyonProxiesToRoot,
    },
  },
  results,
  warnings,
  failures,
}, null, 2));

if (failures.length > 0) {
  process.exitCode = 1;
}
