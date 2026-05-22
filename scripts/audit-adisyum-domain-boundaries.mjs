import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];
const warnings = [];

const allowedFiles = new Set([
  'ADISYUM_DOMAIN_BOUNDARIES.md',
  'scripts/audit-adisyum-domain-boundaries.mjs',
]);

const ignoredDirs = new Set([
  '.git',
  '.next',
  'node_modules',
  '.vercel',
  'out',
  'coverage',
]);

const scannedExtensions = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
  '.md',
  '.sql',
]);

const forbiddenPatterns = [
  { label: 'OtelVoice domain ownership', pattern: /\bOtelVoice\b|otelvoice/ },
  { label: 'PBX ownership', pattern: /\bPBX\b|\bpbx\b|pbx-governance|pbx_configuration|pbx_bridge_usage|PbxOwnership/ },
  { label: 'Verimor provider ownership', pattern: /\bVerimor\b|\bverimor\b/ },
  { label: 'SIP bridge ownership', pattern: /\bSIP\b|sip_bridge/ },
  { label: 'voice governance', pattern: /voiceGovernance|voice-governance|buildVoiceGovernanceSnapshot|voice_pbx|voice-runtime|voice runtime/i },
  { label: 'transcription ownership', pattern: /transcription|orphan_transcription_session|transcription_minutes|transcription_delay/i },
  { label: 'realtime audio governance', pattern: /realtime audio|realtime_audio|audio_latency|audio_buffer_pressure|websocket_voice_throughput/i },
  { label: 'AI sales communication runtime', pattern: /ai_sales|ai-sales|sales_intent_scoring|reservation_conversion_scoring|call_sentiment_analysis/i },
  { label: 'communication observability', pattern: /communication-observability|communication observability/i },
  { label: 'call lifecycle ownership', pattern: /call lifecycle|CallLifecycle|call_lifecycle|dropped_call|concurrent_calls|call session ownership/i },
];

function normalize(file) {
  return file.split(path.sep).join('/');
}

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignoredDirs.has(entry.name)) walk(path.join(dir, entry.name), files);
      continue;
    }

    const absolute = path.join(dir, entry.name);
    const relative = normalize(path.relative(root, absolute));
    const extension = path.extname(entry.name);
    if (!scannedExtensions.has(extension)) continue;
    if (allowedFiles.has(relative)) continue;
    files.push({ absolute, relative });
  }
  return files;
}

function read(file) {
  const absolute = path.join(root, file);
  return fs.existsSync(absolute) ? fs.readFileSync(absolute, 'utf8') : '';
}

function exists(file) {
  return fs.existsSync(path.join(root, file));
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}

assert(exists('ADISYUM_DOMAIN_BOUNDARIES.md'), 'Missing ADISYUM_DOMAIN_BOUNDARIES.md');
assert(!exists('lib/communication/voice-governance.ts'), 'Forbidden communication governance file still exists');
assert(!exists('scripts/verify-enterprise-recomposition-phase11.mjs'), 'Forbidden Phase 11 voice validator still exists');

const packageJson = JSON.parse(read('package.json') || '{}');
assert(Boolean(packageJson.scripts?.['adisyum:domain-audit']), 'Missing package script: adisyum:domain-audit');
assert(!packageJson.scripts?.['recomposition:phase11-validate'], 'Phase 11 voice validator must not remain in package scripts');

const observabilityRoute = read('app/api/system-admin/observability/route.ts');
assert(!/voiceGovernance|buildVoiceGovernanceSnapshot|communication\/voice-governance/.test(observabilityRoute), 'System-admin observability must not expose voice governance');

const monetization = read('lib/monetization/governance.ts');
assert(!/voice_pbx|voice minutes|call count|provider status/i.test(monetization), 'Monetization governance must not include voice/PBX metering');

const matches = [];
for (const file of walk(root)) {
  const content = fs.readFileSync(file.absolute, 'utf8');
  for (const forbidden of forbiddenPatterns) {
    if (forbidden.pattern.test(content)) {
      matches.push(`${file.relative}: ${forbidden.label}`);
    }
  }
}

assert(matches.length === 0, `Forbidden OtelVoice/communication domain traces found: ${matches.join('; ')}`);

const report = {
  ok: failures.length === 0,
  checkedAt: new Date().toISOString(),
  audit: 'adisyum-domain-boundaries',
  allowedDomains: [
    'pos',
    'stock',
    'recipe',
    'payment',
    'table',
    'branch',
    'tenant',
    'saas-monetization',
    'reseller',
    'observability',
    'deployment',
    'ai-operations-core',
  ],
  forbiddenDomainMatches: matches,
  warnings,
  failures,
};

console.log(JSON.stringify(report, null, 2));

if (failures.length > 0) {
  process.exitCode = 1;
}
