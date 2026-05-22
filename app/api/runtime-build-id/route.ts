import { NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function readBuildId() {
  const candidates = [
    path.join(process.cwd(), '.next', 'BUILD_ID'),
    path.join(process.cwd(), '..', '.next', 'BUILD_ID'),
  ];

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) return fs.readFileSync(candidate, 'utf8').trim();
    } catch {
      // Ignore unreadable candidates; this endpoint is diagnostic-only.
    }
  }

  return null;
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    buildId: readBuildId(),
    gitCommit: process.env.GIT_COMMIT ?? process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    deploymentTime: process.env.DEPLOYED_AT ?? null,
    timestamp: new Date().toISOString(),
    nodeEnv: process.env.NODE_ENV ?? null,
    port: process.env.PORT ?? null,
    sessionCookieDomain: process.env.SESSION_COOKIE_DOMAIN ?? null,
    pm2ProcessId: process.env.pm_id ?? null,
    pm2InstanceId: process.env.NODE_APP_INSTANCE ?? null,
    pm2RestartCount: process.env.PM2_RESTART_COUNT ?? null,
    hostname: process.env.HOSTNAME ?? null,
    runtimeAuthority: {
      canonicalApp: 'adisyum-root-app',
      canonicalAppPort: '3000',
      canonicalWebsite: 'adisyum-website',
      canonicalWebsitePort: '3010',
      apiNamespaceOwner: 'adisyum-root-app',
    },
  });
}
