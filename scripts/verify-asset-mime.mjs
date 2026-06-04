import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];
const warnings = [];

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function listFiles(relativePath, matcher) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) return [];
  const results = [];
  const stack = [absolutePath];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (!matcher || matcher(fullPath)) {
        results.push(fullPath);
      }
    }
  }
  return results;
}

function readIfExists(relativePath) {
  const absolutePath = path.join(root, relativePath);
  return fs.existsSync(absolutePath) ? fs.readFileSync(absolutePath, 'utf8') : '';
}

const rootStaticFiles = listFiles('.next/static', (file) => /\.(css|js)$/.test(file));
const rootStandaloneStaticFiles = listFiles('.next/standalone/.next/static', (file) => /\.(css|js)$/.test(file));
const websiteStaticFiles = listFiles('apps/website/.next/static', (file) => /\.(css|js)$/.test(file));
const standaloneBuildPresent = exists('.next/standalone');

if (rootStaticFiles.length === 0) failures.push('Root build has no CSS/JS assets under .next/static');
if (standaloneBuildPresent && rootStandaloneStaticFiles.length === 0) {
  failures.push('Root standalone static assets are missing under .next/standalone/.next/static');
}
if (websiteStaticFiles.length === 0) failures.push('Website build has no CSS/JS assets under apps/website/.next/static');

const nextConfig = readIfExists('next.config.mjs');
const ecosystem = readIfExists('ecosystem.config.cjs');
const nginxTemplates = [
  ...listFiles('deploy', (file) => /nginx|runtime|production|reconstruct/i.test(file) && /\.(conf|template|sh|mjs|js|cjs)$/.test(file)),
].map((file) => fs.readFileSync(file, 'utf8')).join('\n');

if (!nextConfig.includes('/adisyum-root-assets')) failures.push('Root asset prefix /adisyum-root-assets is not configured in next.config.mjs');
if (!ecosystem.includes('ADISYUM_ROOT_ASSET_PREFIX')) failures.push('PM2 ecosystem does not pass ADISYUM_ROOT_ASSET_PREFIX');
if (!nginxTemplates.includes('/adisyum-root-assets')) failures.push('Deploy/nginx scripts do not mention /adisyum-root-assets static serving');
if (!nginxTemplates.includes('/website-assets')) failures.push('Deploy/nginx scripts do not mention /website-assets static serving');
if (!readIfExists('package.json').includes('scripts/sync-standalone-static-assets.mjs')) {
  failures.push('Root build script does not sync standalone static assets after next build');
}
if (!nginxTemplates.includes('.next/standalone/.next/static')) {
  failures.push('Deploy reconstruction does not validate/copy root standalone static assets');
}

const suspiciousHtmlAssets = [
  ...rootStaticFiles,
  ...rootStandaloneStaticFiles,
  ...websiteStaticFiles,
].filter((file) => {
  const head = fs.readFileSync(file, 'utf8').slice(0, 256).toLowerCase();
  return head.includes('<!doctype html') || head.includes('<html');
});

if (suspiciousHtmlAssets.length > 0) {
  failures.push(`Static CSS/JS files contain HTML: ${suspiciousHtmlAssets.map((file) => path.relative(root, file)).join(', ')}`);
}

const result = {
  ok: failures.length === 0,
  checkedAt: new Date().toISOString(),
  rootStaticAssetCount: rootStaticFiles.length,
  rootStandaloneStaticAssetCount: rootStandaloneStaticFiles.length,
  websiteStaticAssetCount: websiteStaticFiles.length,
  expectedPrefixes: ['/adisyum-root-assets', '/website-assets'],
  warnings,
  failures,
};

console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exit(1);
