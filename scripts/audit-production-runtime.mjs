import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];
const warnings = [];

function read(file) {
  const absolute = path.join(root, file);
  return fs.existsSync(absolute) ? fs.readFileSync(absolute, 'utf8') : '';
}

function exists(file) {
  return fs.existsSync(path.join(root, file));
}

function walk(dir, matcher, matches = []) {
  const absolute = path.join(root, dir);
  if (!fs.existsSync(absolute)) return matches;
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    const relative = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', '.git'].includes(entry.name)) continue;
      walk(relative, matcher, matches);
    } else if (matcher(relative.replaceAll('\\', '/'))) {
      matches.push(relative.replaceAll('\\', '/'));
    }
  }
  return matches;
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'pipe', shell: process.platform === 'win32', encoding: 'utf8' });
  if (result.status !== 0) {
    failures.push(`${command} ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
  }
  return result;
}

run('npm', ['run', 'routes:audit']);

const nextConfig = read('next.config.mjs') || read('next.config.js');
const ecosystemConfig = read('ecosystem.config.cjs') || read('ecosystem.config.js');
const middleware = read('middleware.ts');
const reconstructScript = read('deploy/scripts/reconstruct-vps-runtime.sh');
const nginxConfig = read('deploy/nginx/adisyum.conf');
const websiteNextConfig = read('apps/website/next.config.mjs');
const envFiles = ['.env', '.env.production'].filter(exists);

if (!/output\s*:\s*['"]standalone['"]/.test(nextConfig)) {
  failures.push('next.config does not enable output: standalone');
}
if (!/adisyum-root-assets/.test(nextConfig) || !/ADISYUM_ROOT_ASSET_PREFIX/.test(nextConfig)) {
  failures.push('Root app assetPrefix must default to /adisyum-root-assets and allow ADISYUM_ROOT_ASSET_PREFIX override');
}
if (!/website-assets/.test(websiteNextConfig) || !/ADISYUM_WEBSITE_ASSET_PREFIX/.test(websiteNextConfig)) {
  failures.push('Website app assetPrefix must default to /website-assets and allow ADISYUM_WEBSITE_ASSET_PREFIX override');
}
if (!/location\s+\^~\s+\/adisyum-root-assets\/_next\/static\//.test(nginxConfig)) {
  failures.push('Nginx must serve root app static assets from /adisyum-root-assets/_next/static/');
}
if (!/location\s+\^~\s+\/website-assets\/_next\/static\//.test(nginxConfig)) {
  failures.push('Nginx must serve website static assets from /website-assets/_next/static/');
}
if (!exists('.next/standalone/server.js')) {
  failures.push('Missing .next/standalone/server.js');
}
if (!exists('.next/standalone/.next/server/app/api/pos/table-orders/route.js')) {
  failures.push('Missing standalone POS table-orders route artifact');
}
if (!exists('.next/static')) {
  failures.push('Missing root static assets at .next/static');
}
if (!exists('apps/website/.next/static')) {
  failures.push('Missing website static assets at apps/website/.next/static');
}
if (!/script:\s*['"]\.next\/standalone\/server\.js['"]/.test(ecosystemConfig)) {
  failures.push('PM2 root app is not configured to run .next/standalone/server.js');
}
if (!/PORT:\s*['"]3000['"]/.test(ecosystemConfig)) {
  failures.push('PM2 root app does not set PORT=3000 for standalone runtime');
}
if (!/HOSTNAME:\s*['"]0\.0\.0\.0['"]/.test(ecosystemConfig)) {
  failures.push('PM2 root app does not set HOSTNAME=0.0.0.0 for standalone runtime');
}
if (/adisyum-root-app must start on port 3000/.test(reconstructScript) || /root\?\.args[\s\S]*-p 3000/.test(reconstructScript)) {
  failures.push('Deploy script still contains stale next-start args validation for adisyum-root-app');
}
if (!/adisyum-root-app must bind PORT=3000/.test(reconstructScript)) {
  failures.push('Deploy script does not validate standalone PORT=3000 governance');
}
if (!/validate_live_ports/.test(reconstructScript)) {
  failures.push('Deploy script does not validate live listener ports');
}
for (const envFile of envFiles) {
  const env = read(envFile);
  const portLines = env.split(/\r?\n/).filter((line) => /^PORT\s*=/.test(line.trim()));
  if (portLines.some((line) => !/^PORT\s*=\s*3000\s*$/.test(line.trim()))) {
    warnings.push(`${envFile} contains a PORT assignment that differs from 3000`);
  }
}
const connectSrcMatch = middleware.match(/connect-src\s+([^;"]+);/);
const connectSrc = connectSrcMatch?.[1]?.trim() ?? '';
const requiredPrinterBridgeOrigins = [
  'http://127.0.0.1:4891',
  'http://localhost:4891',
  'http://[::1]:4891',
];
if (!connectSrcMatch) {
  failures.push('CSP connect-src directive is missing');
}
if (!connectSrc.includes("'self'") || !connectSrc.includes('https:') || !connectSrc.includes('ws:') || !connectSrc.includes('wss:')) {
  failures.push('CSP connect-src governance changed unexpectedly');
}
for (const origin of requiredPrinterBridgeOrigins) {
  if (!connectSrc.includes(origin)) {
    failures.push(`CSP connect-src must allow local Printer Bridge origin ${origin}`);
  }
}
if (/\*/.test(connectSrc) || /(^|\s)http:(\s|$)/.test(connectSrc)) {
  failures.push('CSP connect-src is too broad for production');
}
const disallowedLoopbackOrigins = [...connectSrc.matchAll(/https?:\/\/(?:127\.0\.0\.1|localhost|\[::1\]):(\d+)/g)]
  .map((match) => match[0])
  .filter((origin) => !requiredPrinterBridgeOrigins.includes(origin));
if (disallowedLoopbackOrigins.length > 0) {
  failures.push(`CSP connect-src allows unexpected loopback origins: ${[...new Set(disallowedLoopbackOrigins)].join(', ')}`);
}

const browserSourceWithDirectBridge = walk('.', (file) => (
  /\.(ts|tsx|js|jsx)$/.test(file)
  && !file.startsWith('app/api/')
  && !file.startsWith('apps/desktop/')
  && !file.startsWith('tools/')
  && !file.startsWith('scripts/')
  && !file.startsWith('deploy/')
  && !file.startsWith('.next/')
)).filter((file) => /http:\/\/(127\.0\.0\.1|localhost):3001/.test(read(file)));

if (browserSourceWithDirectBridge.length > 0) {
  failures.push(`Browser/runtime source contains direct 3001 bridge URLs: ${browserSourceWithDirectBridge.join(', ')}`);
}

const builtClientChunks = walk('.next/static', (file) => /\.(js|mjs)$/.test(file));
const builtDirectBridgeChunks = builtClientChunks.filter((file) => /http:\/\/(127\.0\.0\.1|localhost):3001/.test(read(file)));
if (builtDirectBridgeChunks.length > 0) {
  failures.push(`Built browser chunks contain direct 3001 bridge URLs: ${builtDirectBridgeChunks.join(', ')}`);
}

const rootStaticAssets = walk('.next/static', (file) => /\.(css|js|mjs)$/.test(file));
if (rootStaticAssets.length === 0) {
  failures.push('Root runtime has no CSS/JS assets');
}

const websiteStaticAssets = walk('apps/website/.next/static', (file) => /\.(css|js|mjs)$/.test(file));
if (websiteStaticAssets.length === 0) {
  failures.push('Website runtime has no CSS/JS assets');
}

if (!exists('.next/server/middleware-manifest.json')) {
  failures.push('Missing middleware manifest');
}
if (!exists('.next/server/app-paths-manifest.json')) {
  failures.push('Missing app paths manifest');
}

const report = {
  ok: failures.length === 0,
  checkedAt: new Date().toISOString(),
  standalone: {
    enabled: /output\s*:\s*['"]standalone['"]/.test(nextConfig),
    serverExists: exists('.next/standalone/server.js'),
    posRouteExists: exists('.next/standalone/.next/server/app/api/pos/table-orders/route.js'),
    staticAssetCount: rootStaticAssets.length,
  },
  website: {
    staticAssetCount: websiteStaticAssets.length,
  },
  pm2: {
    rootScript: '.next/standalone/server.js',
    configured: /script:\s*['"]\.next\/standalone\/server\.js['"]/.test(ecosystemConfig),
    port: /PORT:\s*['"]3000['"]/.test(ecosystemConfig) ? 3000 : null,
    hostname: /HOSTNAME:\s*['"]0\.0\.0\.0['"]/.test(ecosystemConfig) ? '0.0.0.0' : null,
  },
  envFiles,
  csp: {
    loopbackBridgeAllowed: requiredPrinterBridgeOrigins.every((origin) => connectSrc.includes(origin)),
    connectSrc,
  },
  staticRouting: {
    rootAssetPrefix: /adisyum-root-assets/.test(nextConfig),
    websiteAssetPrefix: /website-assets/.test(websiteNextConfig),
    nginxRootStatic: /location\s+\^~\s+\/adisyum-root-assets\/_next\/static\//.test(nginxConfig),
    nginxWebsiteStatic: /location\s+\^~\s+\/website-assets\/_next\/static\//.test(nginxConfig),
  },
  browserSourceWithDirectBridge,
  builtDirectBridgeChunks,
  warnings,
  failures,
};

console.log(JSON.stringify(report, null, 2));

if (failures.length > 0) {
  process.exitCode = 1;
}
