const scenarios = [
  {
    name: 'Desktop update without compatible bridge',
    installed: { cloud: '2026.05.19', desktop: '1.0.0', bridge: '0.8.0' },
    expected: 'blocked',
  },
  {
    name: 'Bridge rollout with idle offline queue',
    installed: { cloud: '2026.05.19', desktop: '1.0.0', bridge: '1.0.0', agent: '1.0.0' },
    expected: 'allowed',
  },
  {
    name: 'Fiscal adapter on legacy bridge',
    installed: { cloud: '2026.05.19', bridge: '0.9.0', 'fiscal-adapter': '0.5.0' },
    expected: 'blocked',
  },
];

const rules = [
  {
    sourceComponent: 'desktop',
    sourceVersion: '1.0.0',
    targetComponent: 'cloud',
    minTargetVersion: '2026.05.19',
    severity: 'blocker',
    reason: 'Desktop diagnostics require current cloud telemetry endpoints.',
  },
  {
    sourceComponent: 'desktop',
    sourceVersion: '1.0.0',
    targetComponent: 'bridge',
    minTargetVersion: '1.0.0',
    severity: 'blocker',
    reason: 'Desktop printing and diagnostics require bridge 1.0.0.',
  },
  {
    sourceComponent: 'fiscal-adapter',
    sourceVersion: '0.5.0',
    targetComponent: 'bridge',
    minTargetVersion: '1.0.0',
    severity: 'blocker',
    reason: 'Fiscal adapters require bridge 1.0.0 and must remain internal until vendor certification.',
  },
];

function compareVersions(left, right) {
  const a = left.split(/[.-]/).map((part) => Number.parseInt(part, 10) || 0);
  const b = right.split(/[.-]/).map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const diff = (a[index] ?? 0) - (b[index] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function validate(installed) {
  return rules.filter((rule) => {
    const source = installed[rule.sourceComponent];
    if (!source || compareVersions(source, rule.sourceVersion) < 0) return false;
    const target = installed[rule.targetComponent];
    if (!target) return true;
    return compareVersions(target, rule.minTargetVersion) < 0;
  });
}

let failed = 0;

for (const scenario of scenarios) {
  const violations = validate(scenario.installed);
  const actual = violations.some((rule) => rule.severity === 'blocker') ? 'blocked' : 'allowed';
  const ok = actual === scenario.expected;
  if (!ok) failed += 1;
  console.log(JSON.stringify({
    scenario: scenario.name,
    expected: scenario.expected,
    actual,
    ok,
    violations: violations.map((rule) => rule.reason),
  }));
}

if (failed > 0) {
  console.error(`Release governance simulation failed: ${failed} scenario(s) mismatched.`);
  process.exit(1);
}

console.log('Release governance rollout failure simulation passed.');
