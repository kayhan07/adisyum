import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const canonicalOrigin = process.env.PRODUCTION_BASE_URL || 'https://adisyum.com';
const failures = [];
const warnings = [];

function read(file) {
  const absolute = path.join(root, file);
  return fs.existsSync(absolute) ? fs.readFileSync(absolute, 'utf8') : '';
}

function exists(file) {
  return fs.existsSync(path.join(root, file));
}

function parseEnv(text) {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const index = trimmed.indexOf('=');
    values[trimmed.slice(0, index).trim()] = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, '');
  }
  return values;
}

function walk(dir, matcher, matches = []) {
  const absolute = path.join(root, dir);
  if (!fs.existsSync(absolute)) return matches;
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    const relative = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', '.git', '.next'].includes(entry.name)) continue;
      walk(relative, matcher, matches);
    } else if (matcher(relative.replaceAll('\\', '/'))) {
      matches.push(relative.replaceAll('\\', '/'));
    }
  }
  return matches;
}

function isLoopbackUrl(value) {
  try {
    const parsed = new URL(value);
    return ['localhost', '127.0.0.1'].includes(parsed.hostname);
  } catch {
    return /\b(localhost|127\.0\.0\.1)\b/.test(value);
  }
}

const envFiles = ['.env.production', '.env'].filter(exists);
const publicUrlKeys = [
  'NEXT_PUBLIC_APP_URL',
  'NEXTAUTH_URL',
  'APP_URL',
  'PUBLIC_APP_URL',
  'NEXT_PUBLIC_API_URL',
  'API_URL',
  'NEXT_PUBLIC_WEBSOCKET_URL',
  'WEBSOCKET_URL',
];

for (const envFile of envFiles) {
  const env = parseEnv(read(envFile));
  for (const key of publicUrlKeys) {
    if (!env[key]) continue;
    if (isLoopbackUrl(env[key])) failures.push(`${envFile}: ${key} points to loopback (${env[key]})`);
  }
  const canonicalKeys = ['NEXT_PUBLIC_APP_URL', 'NEXTAUTH_URL', 'APP_URL', 'PUBLIC_APP_URL'].filter((key) => env[key]);
  for (const key of canonicalKeys) {
    if (env[key] !== canonicalOrigin) warnings.push(`${envFile}: ${key} is ${env[key]}, expected ${canonicalOrigin}`);
  }
}
const reconstructScript = read('deploy/scripts/reconstruct-vps-runtime.sh');
for (const key of ['NEXT_PUBLIC_APP_URL', 'NEXTAUTH_URL', 'APP_URL', 'PUBLIC_APP_URL']) {
  if (!new RegExp(`export\\s+${key}="https://\\$\\{DOMAIN\\}"`).test(reconstructScript)
    && !new RegExp(`write_env_line\\s+${key}\\s+"https://\\$\\{DOMAIN\\}"`).test(reconstructScript)) {
    failures.push(`deploy script does not force canonical ${key}`);
  }
}

const middleware = read('middleware.ts');
if (!/function configuredPublicOrigin/.test(middleware)) {
  failures.push('middleware.ts does not define canonical public origin handling');
}
if (!/publicRedirectUrl\(request/.test(middleware)) {
  failures.push('middleware.ts redirects are not routed through publicRedirectUrl');
}
if (/request\.nextUrl\.clone\(\)[\s\S]{0,120}NextResponse\.redirect/.test(middleware)) {
  failures.push('middleware.ts still redirects using request.nextUrl.clone directly');
}
if (!/https:\/\/adisyum\.com/.test(middleware)) {
  failures.push('middleware.ts does not have a production canonical origin fallback');
}

const productionBrowserFiles = walk('.', (file) => (
  /\.(ts|tsx|js|jsx|mjs)$/.test(file)
  && !file.startsWith('apps/desktop/')
  && !file.startsWith('tools/')
  && !file.startsWith('deploy/')
  && !file.startsWith('scripts/')
  && !file.startsWith('app/api/')
  && file !== 'agent.js'
  && file !== 'generate-cert.js'
));
const browserLoopback3000 = productionBrowserFiles.filter((file) => /https?:\/\/(?:localhost|127\.0\.0\.1):3000/.test(read(file)));
if (browserLoopback3000.length > 0) {
  failures.push(`Production browser source contains localhost:3000 URLs: ${browserLoopback3000.join(', ')}`);
}

const builtClientChunks = walk('.next/static', (file) => /\.(js|mjs)$/.test(file));
const builtLoopbackRedirectChunks = builtClientChunks.filter((file) => /https?:\/\/(?:localhost|127\.0\.0\.1):3000/.test(read(file)));
if (builtLoopbackRedirectChunks.length > 0) {
  failures.push(`Built browser chunks contain localhost:3000 URLs: ${builtLoopbackRedirectChunks.join(', ')}`);
}

const report = {
  ok: failures.length === 0,
  checkedAt: new Date().toISOString(),
  canonicalOrigin,
  envFiles,
  browserLoopback3000,
  builtLoopbackRedirectChunks,
  warnings,
  failures,
};

console.log(JSON.stringify(report, null, 2));

if (failures.length > 0) {
  process.exitCode = 1;
}
