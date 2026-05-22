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

function fail(message) {
  failures.push(message);
}

function warn(message) {
  warnings.push(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

const requiredDocs = [
  'VOICE_RUNTIME_ARCHITECTURE.md',
  'PBX_OWNERSHIP_TOPOLOGY.md',
  'AI_SALES_OPERATIONS.md',
  'CALL_LIFECYCLE_GOVERNANCE.md',
  'REALTIME_AUDIO_FORENSICS.md',
  'VOICE_SESSION_RECOVERY.md',
  'TRANSCRIPTION_AND_AI_PIPELINE.md',
  'COMMUNICATION_OBSERVABILITY.md',
];

for (const doc of requiredDocs) assert(exists(doc), `Missing Phase 11 voice communication document: ${doc}`);

const packageJson = JSON.parse(read('package.json') || '{}');
assert(Boolean(packageJson.scripts?.['recomposition:phase11-validate']), 'Missing package script: recomposition:phase11-validate');

const voice = read('lib/communication/voice-governance.ts');
assert(/buildVoiceGovernanceSnapshot/.test(voice), 'Voice governance must expose buildVoiceGovernanceSnapshot');
assert(/getCallLifecycleRules/.test(voice), 'Call lifecycle governance must exist');
assert(/getPbxOwnershipRules/.test(voice), 'PBX ownership governance must exist');
assert(/getVoiceSessionRules/.test(voice), 'Voice session ownership must exist');
assert(/getAiSalesRules/.test(voice), 'AI sales operations governance must exist');
assert(/getRealtimeAudioRules/.test(voice), 'Realtime audio governance must exist');
assert(/getVoiceRecoveryRules/.test(voice), 'Communication recovery governance must exist');
assert(/getTenantCommunicationRules/.test(voice), 'Tenant communication governance must exist');
assert(/getVoiceUsageMeteringRules/.test(voice), 'Voice usage metering must exist');

for (const phrase of [
  'verimor',
  'sip_bridge',
  'tenant',
  'branch',
  'trunk',
  'extension',
  'did',
  'runtime-session-engine',
  'tenant-runtime-context',
  'communication-observability',
]) {
  assert(voice.includes(phrase), `PBX topology missing contract phrase: ${phrase}`);
}

for (const state of [
  'incoming',
  'outgoing',
  'routing',
  'ai_takeover',
  'human_takeover',
  'transferring',
  'reconnecting',
  'retrying',
  'completed',
  'failed',
]) {
  assert(voice.includes(`state: '${state}'`), `Call lifecycle missing state: ${state}`);
}

for (const session of [
  'speech',
  'transcription',
  'ai_response',
  'realtime_audio_stream',
  'speech_interruption',
  'latency',
  'fallback',
]) {
  assert(voice.includes(`session: '${session}'`), `Voice session governance missing session: ${session}`);
}

for (const signal of [
  'sales_intent_scoring',
  'hesitation_detection',
  'reservation_conversion_scoring',
  'objection_analysis',
  'call_sentiment_analysis',
  'call_success_analytics',
  'ai_sales_recommendations',
]) {
  assert(voice.includes(`signal: '${signal}'`), `AI sales operations missing signal: ${signal}`);
}

for (const metric of [
  'audio_latency',
  'websocket_voice_throughput',
  'speech_interruption_timing',
  'reconnect_storms',
  'audio_buffer_pressure',
  'transcription_delay',
  'ai_response_delay',
  'voice_minutes',
  'transcription_minutes',
  'ai_response_tokens',
  'realtime_websocket_throughput',
  'concurrent_calls',
  'pbx_bridge_usage',
]) {
  assert(voice.includes(metric), `Realtime voice metric missing: ${metric}`);
}

for (const failure of [
  'dropped_call',
  'websocket_reconnect_storm',
  'pbx_reconnect_loop',
  'stale_voice_session',
  'orphan_transcription_session',
  'failed_ai_response_stream',
]) {
  assert(voice.includes(`failure: '${failure}'`), `Voice recovery missing failure: ${failure}`);
}

assert(/maxAttempts:\s*[123]/.test(voice), 'Voice recovery must define bounded maxAttempts');
assert(/safeAutomation:\s*true/.test(voice), 'Voice recovery must mark bounded safe automation');
assert(/forbiddenAction/.test(voice), 'Voice recovery must define forbidden recovery boundaries');
assert(/tenantScoped:\s*true/.test(voice), 'Tenant communication governance must be tenant scoped');
assert(/idempotencyKey/.test(voice), 'Voice usage metering must define idempotency keys');

const monetization = read('lib/monetization/governance.ts');
assert(/metric: 'voice_pbx'/.test(monetization), 'Phase 10 monetization must include voice_pbx usage metric');

const observabilityRoute = read('app/api/system-admin/observability/route.ts');
assert(/buildVoiceGovernanceSnapshot/.test(observabilityRoute), 'System-admin observability must expose voice governance');
assert(/voiceGovernance/.test(observabilityRoute), 'System-admin observability response must include voiceGovernance');

const docsText = requiredDocs.map((doc) => read(doc)).join('\n');
for (const phrase of [
  'No rewrite is introduced in Phase 11',
  'Every call lifecycle transition must be tenant-scoped and auditable',
  'PBX ownership must define runtime, reconnect, auth, retry, and observability owners',
  'Voice recovery must be bounded and must not mutate business data',
  'AI sales operations may recommend actions but must not make unreviewed commitments',
  'Voice usage metering must be idempotent and tenant-scoped',
]) {
  assert(docsText.includes(phrase), `Phase 11 docs must include rule: ${phrase}`);
}

if (!/model .*Call|model .*Voice|model .*Pbx|model .*Transcription/i.test(read('prisma/schema.prisma'))) {
  warn('Dedicated PBX/call/transcription persistence tables are not yet present; Phase 11 records canonical voice ownership contracts without destructive migrations.');
}

const report = {
  ok: failures.length === 0,
  checkedAt: new Date().toISOString(),
  phase: 'phase-11-voice-pbx-orchestration-realtime-communication-ai-sales-operations',
  diagnostics: {
    voiceGovernance: Boolean(voice),
    callLifecycle: /getCallLifecycleRules/.test(voice),
    pbxOwnership: /getPbxOwnershipRules/.test(voice),
    voiceSessions: /getVoiceSessionRules/.test(voice),
    aiSalesTelemetry: /getAiSalesRules/.test(voice),
    realtimeAudio: /getRealtimeAudioRules/.test(voice),
    communicationRecovery: /getVoiceRecoveryRules/.test(voice),
    tenantCommunication: /getTenantCommunicationRules/.test(voice),
  },
  warnings,
  failures,
};

console.log(JSON.stringify(report, null, 2));

if (failures.length > 0) {
  process.exitCode = 1;
}
