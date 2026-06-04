import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

const IGNORED_DIRS = new Set([
  '.git',
  '.next',
  'node_modules',
  'dist',
  'build',
  'coverage',
  'out',
]);

const IGNORED_PATH_PARTS = [
  path.join('apps', 'desktop', 'dist'),
  path.join('tools', 'adisyum-pos-agent', 'bin'),
  path.join('tools', 'adisyum-pos-agent', 'obj'),
  path.join('tools', 'agent-installer', 'bin'),
  path.join('tools', 'agent-installer', 'obj'),
];

const ALLOWED_FILES = new Set([
  path.normalize(path.join('lib', 'receipt-formatter.ts')),
]);

const TEXT_EXTENSIONS = new Set([
  '.cjs',
  '.css',
  '.html',
  '.js',
  '.json',
  '.jsx',
  '.md',
  '.mjs',
  '.prisma',
  '.ps1',
  '.sh',
  '.sql',
  '.svg',
  '.ts',
  '.tsx',
  '.txt',
  '.yml',
  '.yaml',
]);

const MOJIBAKE_PATTERNS = [
  '\u00c3',
  '\u00c4',
  '\u00c5',
  '\u00c2',
  '\ufffd',
  'Y\u00c3',
  'g\u00c3',
  '\u00c3\u00bc',
  '\u00c3\u00b6',
  '\u00c3\u00a7',
  '\u00c5\u015f',
  'bulunamad\u00c4',
  'kullan\u00c4',
  'ba\u00c5\u015f',
  's\u00c3\u00bcre',
  '\u00c5ifre',
  'g\u00c3\u00bcn',
  'i\u00c5\u015flem',
  'biti\u00c5\u015f',
  'ba\u00c5\u015flang',
];

function toRelative(filePath) {
  return path.relative(ROOT, filePath).split(path.sep).join('/');
}

function shouldIgnoreDir(dirPath) {
  const name = path.basename(dirPath);
  if (IGNORED_DIRS.has(name)) return true;
  const relative = path.relative(ROOT, dirPath);
  return IGNORED_PATH_PARTS.some((part) => relative === part || relative.startsWith(`${part}${path.sep}`));
}

function shouldScanFile(filePath) {
  const relative = path.normalize(path.relative(ROOT, filePath));
  if (ALLOWED_FILES.has(relative)) return false;
  return TEXT_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function walk(dirPath, files = []) {
  if (shouldIgnoreDir(dirPath)) return files;
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, files);
    } else if (entry.isFile() && shouldScanFile(fullPath)) {
      files.push(fullPath);
    }
  }
  return files;
}

const files = walk(ROOT);
const failures = [];

for (const filePath of files) {
  const buffer = fs.readFileSync(filePath);
  if (buffer.includes(0)) continue;
  const text = buffer.toString('utf8');
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    const matched = MOJIBAKE_PATTERNS.filter((pattern) => line.includes(pattern));
    if (matched.length > 0) {
      failures.push({
        file: toRelative(filePath),
        line: index + 1,
        patterns: [...new Set(matched)],
        preview: line.trim().slice(0, 180),
      });
    }
  });
}

if (failures.length > 0) {
  console.error('[encoding:tr] Mojibake patterns found');
  console.error(JSON.stringify({ ok: false, failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, scannedFiles: files.length, failures: [] }, null, 2));
