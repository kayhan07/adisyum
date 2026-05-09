import { NextRequest, NextResponse } from 'next/server';
import { upsertGibIntegration, type GibProvider } from '@/lib/server/gib-integration-db';

export const dynamic = 'force-dynamic';

const providers: GibProvider[] = ['Uyumsoft', 'Foriba', 'EDM', 'NES'];

function isValidProvider(value: string): value is GibProvider {
  return providers.includes(value as GibProvider);
}

async function requestProviderToken(input: {
  provider: GibProvider;
  companyCode: string;
  username: string;
  password?: string;
  apiKey?: string;
  endpoint: string;
}) {
  if (input.endpoint.startsWith('mock://')) {
    return {
      token: `${input.provider.toLowerCase()}-${Date.now()}`,
      message: 'Demo bağlantı başarılı.',
    };
  }

  const response = await fetch(input.endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(input.apiKey ? { authorization: `Bearer ${input.apiKey}` } : {}),
    },
    body: JSON.stringify({
      companyCode: input.companyCode,
      username: input.username,
      password: input.password,
      apiKey: input.apiKey,
    }),
    signal: AbortSignal.timeout(8000),
  });

  if (!response.ok) {
    throw new Error(`Provider yanıtı başarısız: HTTP ${response.status}`);
  }

  const data = await response.json().catch(() => ({}));
  const token = data.token || data.access_token || data.sessionId || data.session_id;
  if (!token) throw new Error('Provider token döndürmedi.');
  return { token: String(token), message: 'Bağlantı başarılı.' };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const provider = String(body?.provider || '');
    const tenantId = String(body?.tenantId || body?.tenant_id || 'default');
    const companyCode = String(body?.companyCode || '').trim();
    const username = String(body?.username || '').trim();
    const password = String(body?.password || '');
    const apiKey = String(body?.apiKey || '');
    const endpoint = String(body?.endpoint || '').trim();

    if (!isValidProvider(provider)) {
      return NextResponse.json({ success: false, status: 'error', message: 'Geçerli bir GİB entegratörü seçin.' }, { status: 400 });
    }
    if (!companyCode || !username || (!password && !apiKey) || !endpoint) {
      return NextResponse.json({ success: false, status: 'error', message: 'Firma kodu, kullanıcı, şifre/API key ve endpoint zorunlu.' }, { status: 400 });
    }

    const result = await requestProviderToken({ provider, companyCode, username, password, apiKey, endpoint });
    const saved = upsertGibIntegration({
      tenantId,
      provider,
      companyCode,
      username,
      password,
      apiKey,
      endpoint,
      token: result.token,
      status: 'connected',
      lastTestedAt: new Date().toISOString(),
      message: result.message,
    });

    return NextResponse.json({
      success: true,
      status: 'connected',
      message: result.message,
      integration: saved,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      status: 'error',
      message: error instanceof Error ? error.message : 'GİB bağlantısı test edilemedi.',
    }, { status: 502 });
  }
}
