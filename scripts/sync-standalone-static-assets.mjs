import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const rootStatic = path.join(root, '.next', 'static');
const standaloneRoot = path.join(root, '.next', 'standalone');
const standaloneStatic = path.join(standaloneRoot, '.next', 'static');
const publicDir = path.join(root, 'public');
const standalonePublic = path.join(standaloneRoot, 'public');

function listAssets(dir) {
  if (!fs.existsSync(dir)) return [];
  const results = [];
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (/\.(css|js)$/.test(entry.name)) {
        results.push(fullPath);
      }
    }
  }
  return results;
}

function copyDirectory(source, destination) {
  fs.rmSync(destination, { recursive: true, force: true });
  fs.mkdirSync(destination, { recursive: true });
  fs.cpSync(source, destination, { recursive: true });
}

const failures = [];

if (!fs.existsSync(rootStatic)) failures.push('Root .next/static is missing. Run next build first.');
if (!fs.existsSync(standaloneRoot)) failures.push('Root .next/standalone is missing. Root build must use output: standalone.');

if (failures.length === 0) {
  copyDirectory(rootStatic, standaloneStatic);
  if (fs.existsSync(publicDir)) copyDirectory(publicDir, standalonePublic);
}

const rootAssetCount = listAssets(rootStatic).length;
const standaloneAssetCount = listAssets(standaloneStatic).length;

if (rootAssetCount === 0) failures.push('Root .next/static has no CSS/JS assets.');
if (fs.existsSync(standaloneRoot) && standaloneAssetCount === 0) {
  failures.push('Root standalone .next/static has no CSS/JS assets after sync.');
}

const result = {
  ok: failures.length === 0,
  rootStatic: path.relative(root, rootStatic).replaceAll('\\', '/'),
  standaloneStatic: path.relative(root, standaloneStatic).replaceAll('\\', '/'),
  rootAssetCount,
  standaloneAssetCount,
  failures,
};

console.log(JSON.stringify(result, null, 2));
if (failures.length > 0) process.exit(1);
