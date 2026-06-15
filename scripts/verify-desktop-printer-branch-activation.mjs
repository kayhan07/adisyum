import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const mainPath = path.join(root, 'apps', 'desktop', 'src', 'main.cjs');
const main = fs.readFileSync(mainPath, 'utf8');

const checks = [];

function check(name, ok) {
  checks.push({ name, ok });
}

check(
  'Desktop activation reads live session after login',
  main.includes('async function fetchActivatedSession') &&
    main.includes('/api/auth/me') &&
    main.includes("cookie: setCookie.split(';')[0]"),
);

check(
  'Desktop activation resolves branch from user input then live session then mrk fallback',
  main.includes('const sessionPayload = await fetchActivatedSession(origin, setCookie);') &&
    main.includes('const sessionBranchId = typeof sessionPayload?.session?.branchId ===') &&
    main.includes("const resolvedBranchId = branchId || sessionBranchId || 'mrk';"),
);

check(
  'Cloud printer registry uses the resolved branch id',
  main.includes('branchId: resolvedBranchId') &&
    main.includes("store.get('branchId')") &&
    main.includes("cloudJson('/api/devices/registry'"),
);

const failed = checks.filter((item) => !item.ok);
for (const item of checks) {
  console.log(`${item.ok ? 'PASS' : 'FAIL'} ${item.name}`);
}

if (failed.length > 0) {
  console.error(`\n${failed.length}/${checks.length} desktop printer branch activation checks failed.`);
  process.exit(1);
}

console.log(`\n${checks.length}/${checks.length} desktop printer branch activation checks passed.`);
