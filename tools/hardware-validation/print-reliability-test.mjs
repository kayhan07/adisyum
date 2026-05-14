#!/usr/bin/env node

const baseUrl = process.env.BRIDGE_URL || 'http://127.0.0.1:4891';
const tenantId = process.env.TENANT_ID || 'hardware-validation-tenant';
const printerName = process.env.PRINTER_NAME || 'validation-printer';
const totalJobs = Number(process.env.PRINT_JOBS || 1000);
const concurrency = Number(process.env.PRINT_CONCURRENCY || 8);

function encode(text) {
  return Buffer.from(text, 'utf8').toString('base64');
}

async function post(path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `HTTP ${response.status}`);
  }
  return payload;
}

async function get(path) {
  const response = await fetch(`${baseUrl}${path}`);
  return response.json();
}

async function worker(workerId, ids, results) {
  for (const index of ids) {
    const ticketType = index % 3 === 0 ? 'kitchen' : index % 3 === 1 ? 'bar' : 'cashier';
    const startedAt = Date.now();
    try {
      const payload = await post('/print', {
        tenantId,
        printerName,
        printerRole: ticketType,
        protocol: process.env.PRINT_PROTOCOL || 'auto',
        bytesBase64: encode(`ADISYUM HW VALIDATION\njob=${index}\nworker=${workerId}\nrole=${ticketType}\nTürkçe karakter güvenliği\n`),
        requestId: `hw-validation-${index}`,
        source: 'hardware-validation-suite',
        priority: ticketType === 'kitchen' ? 1 : 5,
        maxAttempts: 3,
      });
      results.push({ ok: true, latencyMs: Date.now() - startedAt, jobId: payload.jobId });
    } catch (error) {
      results.push({ ok: false, latencyMs: Date.now() - startedAt, error: error.message });
    }
  }
}

async function main() {
  const startedAt = Date.now();
  const healthBefore = await get('/health').catch(() => null);
  const ids = Array.from({ length: totalJobs }, (_, index) => index + 1);
  const shards = Array.from({ length: concurrency }, () => []);
  ids.forEach((id, index) => shards[index % concurrency].push(id));
  const results = [];

  await Promise.all(shards.map((shard, index) => worker(index + 1, shard, results)));

  const duplicateProbe = await Promise.all([
    post('/print', {
      tenantId,
      printerName,
      bytesBase64: encode('duplicate-probe'),
      requestId: 'duplicate-probe',
      source: 'hardware-validation-suite',
      maxAttempts: 1,
    }).catch((error) => ({ ok: false, error: error.message })),
    post('/print', {
      tenantId,
      printerName,
      bytesBase64: encode('duplicate-probe'),
      requestId: 'duplicate-probe',
      source: 'hardware-validation-suite',
      maxAttempts: 1,
    }).catch((error) => ({ ok: false, error: error.message })),
  ]);

  const queues = await get('/queues').catch(() => null);
  const devices = await get('/devices').catch(() => null);
  const healthAfter = await get('/health').catch(() => null);
  const successful = results.filter((item) => item.ok).length;
  const failed = results.length - successful;
  const latencies = results.map((item) => item.latencyMs).sort((a, b) => a - b);
  const percentile = (p) => latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * p))] || 0;
  const dead = queues?.print?.dead || 0;
  const score = Math.max(0, Math.min(100,
    100
      - Math.round((failed / Math.max(1, results.length)) * 60)
      - Math.min(25, dead * 5)
      - (percentile(0.95) > 500 ? 10 : 0)
  ));

  const report = {
    ok: failed === 0,
    baseUrl,
    tenantId,
    printerName,
    totalJobs,
    concurrency,
    durationMs: Date.now() - startedAt,
    successful,
    failed,
    duplicateProbe,
    p50LatencyMs: percentile(0.5),
    p95LatencyMs: percentile(0.95),
    p99LatencyMs: percentile(0.99),
    printReliabilityScore: score,
    queues,
    healthBefore,
    healthAfter,
    devices,
    generatedAt: new Date().toISOString(),
  };

  console.log(JSON.stringify(report, null, 2));
  process.exit(score >= 90 ? 0 : 1);
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exit(1);
});
