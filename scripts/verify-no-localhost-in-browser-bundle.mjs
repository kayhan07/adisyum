import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const patterns = [
  'localhost:3001',
  '127.0.0.1:3001',
  'http://localhost:3001',
  'http://127.0.0.1:3001',
];
const sourceRoots = ['app', 'components', 'hooks', 'lib'];
const builtRoots = ['.next/static', '.next/standalone/.next/static'];
const failures = [];

function walk(relativePath, matcher) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) return [];
  const results = [];
  const stack = [absolutePath];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!['node_modules', '.git'].includes(entry.name)) stack.push(fullPath);
      } else if (matcher(fullPath)) {
        results.push(fullPath);
      }
    }
  }
  return results;
}

function scanFile(file, area) {
  const content = fs.readFileSync(file, 'utf8');
  for (const pattern of patterns) {
    if (content.includes(pattern)) {
      failures.push({ area, file: path.relative(root, file), pattern });
    }
  }
}

for (const sourceRoot of sourceRoots) {
  for (const file of walk(sourceRoot, (entry) => /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry))) {
    scanFile(file, 'browser-source');
  }
}

for (const builtRoot of builtRoots) {
  for (const file of walk(builtRoot, (entry) => /\.(js|css)$/.test(entry))) {
    scanFile(file, 'built-browser-asset');
  }
}

const result = {
  ok: failures.length === 0,
  checkedAt: new Date().toISOString(),
  scannedSourceRoots: sourceRoots,
  scannedBuiltRoots: builtRoots.filter((entry) => fs.existsSync(path.join(root, entry))),
  forbiddenPatterns: patterns,
  failures,
};

console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exit(1);
