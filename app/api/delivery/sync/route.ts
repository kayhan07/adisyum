import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type PartnerIntegrationAuthType = 'basic' | 'bearer' | 'apiKey';
type PartnerIntegrationMethod = 'GET' | 'POST';

type PartnerIntegrationPayload = {
  id: string;
  name: string;
  authFlow?: 'direct' | 'oauthClientCredentials';
  authType?: PartnerIntegrationAuthType;
  method?: PartnerIntegrationMethod;
  baseUrl?: string;
  ordersPath?: string;
  tokenUrl?: string;
  username?: string;
  password?: string;
  apiKey?: string;
  apiSecret?: string;
  apiKeyHeader?: string;
  apiSecretHeader?: string;
  userAgent?: string;
  sellerId?: string;
  storeId?: string;
  chainId?: string;
  vendorId?: string;
  webhookUrl?: string;
  webhookSecret?: string;
};

type NormalizedRemoteOrder = {
  externalId: string;
  customerName: string;
  amount: number;
  status: 'new' | 'preparing' | 'on_route' | 'delivered' | 'cancelled';
  paymentMethod: 'cash' | 'card' | 'online' | 'account';
  createdAt: string;
  rawStatus: string;
};

function buildUrl(integration: PartnerIntegrationPayload) {
  const baseUrl = (integration.baseUrl ?? '').trim().replace(/\/+$/g, '');
  const ordersPath = (integration.ordersPath ?? '').trim();

  if (!baseUrl || !ordersPath) return '';

  const resolvedPath = ordersPath
    .replaceAll('{sellerId}', integration.sellerId ?? '')
    .replaceAll('{storeId}', integration.storeId ?? integration.sellerId ?? '')
    .replaceAll('{chainId}', integration.chainId ?? '')
    .replaceAll('{vendorId}', integration.vendorId ?? '');

  if (/^https?:\/\//i.test(resolvedPath)) return resolvedPath;
  return `${baseUrl}${resolvedPath.startsWith('/') ? resolvedPath : `/${resolvedPath}`}`;
}

function buildHeaders(integration: PartnerIntegrationPayload) {
  const headers = new Headers({
    Accept: 'application/json',
  });

  if (integration.authType === 'basic') {
    const basicValue = Buffer.from(`${integration.username ?? ''}:${integration.password ?? integration.apiSecret ?? ''}`).toString('base64');
    headers.set('Authorization', `Basic ${basicValue}`);
    return headers;
  }

  if (integration.authType === 'bearer') {
    const token = integration.apiKey || integration.password || integration.apiSecret;
    if (token) {
      headers.set(integration.apiKeyHeader || 'Authorization', `Bearer ${token}`);
    }
    return headers;
  }

  if (integration.apiKey) {
    headers.set(integration.apiKeyHeader || 'X-API-Key', integration.apiKey);
  }

  if (integration.apiSecret) {
    headers.set(integration.apiSecretHeader || 'X-API-Secret', integration.apiSecret);
  }

  return headers;
}

async function buildOauthBearerToken(integration: PartnerIntegrationPayload) {
  const tokenUrl = (integration.tokenUrl ?? '').trim();
  if (!tokenUrl) {
    throw new Error(`${integration.name} için token URL gerekli.`);
  }

  const params = new URLSearchParams();
  params.set('grant_type', 'client_credentials');
  if (integration.username) params.set('client_id', integration.username);
  if (integration.password) params.set('client_secret', integration.password);
  if (integration.apiKey) params.set('client_id', integration.apiKey);
  if (integration.apiSecret) params.set('client_secret', integration.apiSecret);

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
    cache: 'no-store',
  });

  const raw = await response.text();
  const payload = raw ? JSON.parse(raw) as Record<string, unknown> : {};
  if (!response.ok) {
    throw new Error(`${integration.name} token servisi hata döndürdü (${response.status}).`);
  }

  const accessToken = readString(payload.access_token, payload.token, payload.accessToken);
  if (!accessToken) {
    throw new Error(`${integration.name} access token üretmedi.`);
  }

  return accessToken;
}

function extractArray(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];

  const record = payload as Record<string, unknown>;
  const preferredKeys = ['orders', 'data', 'items', 'results', 'content', 'list'];

  for (const key of preferredKeys) {
    const value = record[key];
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object') {
      const nested = extractArray(value);
      if (nested.length > 0) return nested;
    }
  }

  for (const value of Object.values(record)) {
    if (Array.isArray(value)) return value;
  }

  return [];
}

function readString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return '';
}

function readNumber(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const parsed = Number(value.replace(',', '.'));
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return 0;
}

function normalizeStatus(rawStatus: string): NormalizedRemoteOrder['status'] {
  const value = rawStatus.toLocaleLowerCase('tr-TR');

  if (value.includes('cancel') || value.includes('reject') || value.includes('iptal')) return 'cancelled';
  if (value.includes('deliver') || value.includes('complete') || value.includes('teslim')) return 'delivered';
  if (value.includes('route') || value.includes('courier') || value.includes('yolda')) return 'on_route';
  if (value.includes('prep') || value.includes('kitchen') || value.includes('hazir')) return 'preparing';
  return 'new';
}

function normalizePaymentMethod(rawMethod: string): NormalizedRemoteOrder['paymentMethod'] {
  const value = rawMethod.toLocaleLowerCase('tr-TR');

  if (value.includes('cash') || value.includes('nakit')) return 'cash';
  if (value.includes('card') || value.includes('kart') || value.includes('pos')) return 'card';
  if (value.includes('account') || value.includes('veresiye') || value.includes('cari')) return 'account';
  return 'online';
}

function normalizeOrders(payload: unknown) {
  const rows = extractArray(payload);

  return rows
    .map((row, index) => {
      if (!row || typeof row !== 'object') return null;
      const order = row as Record<string, unknown>;
      const customer = (order.customer ?? order.user ?? order.buyer ?? order.recipient ?? {}) as Record<string, unknown>;
      const totals = (order.totalPrice ?? order.totalAmount ?? order.total ?? order.payment ?? {}) as Record<string, unknown>;
      const rawStatus = readString(order.status, order.orderStatus, order.currentStatus, order.deliveryStatus);
      const rawPaymentMethod = readString(order.paymentMethod, order.paymentType, totals.method);
      const externalId = readString(
        order.id,
        order.orderId,
        order.packageId,
        order.number,
        order.code,
        `remote-${index + 1}`,
      );
      const customerName = readString(
        order.customerName,
        order.fullName,
        order.buyerName,
        order.recipientName,
        customer.name,
        customer.fullName,
        customer.firstName && customer.lastName ? `${customer.firstName} ${customer.lastName}` : '',
        'Misafir müşteri',
      );
      const amount = readNumber(
        order.amount,
        order.totalPrice,
        order.totalAmount,
        order.grandTotal,
        order.price,
        totals.value,
        totals.amount,
      );

      return {
        externalId,
        customerName,
        amount,
        status: normalizeStatus(rawStatus),
        paymentMethod: normalizePaymentMethod(rawPaymentMethod),
        createdAt: readString(order.createdAt, order.orderDate, order.date, new Date().toISOString()),
        rawStatus,
      } satisfies NormalizedRemoteOrder;
    })
    .filter((order): order is NormalizedRemoteOrder => Boolean(order && order.externalId && order.amount >= 0));
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { integration?: PartnerIntegrationPayload };
    const integration = body.integration;

    if (!integration) {
      return NextResponse.json({ error: 'Entegrasyon bilgisi eksik.' }, { status: 400 });
    }

    const url = buildUrl(integration);
    if (!url) {
      return NextResponse.json({ error: `${integration.name} için base URL ve sipariş endpoint alanları zorunlu.` }, { status: 400 });
    }

    const headers = buildHeaders(integration);

    if (integration.userAgent?.trim()) {
      headers.set('User-Agent', integration.userAgent.trim());
    }

    if (integration.authFlow === 'oauthClientCredentials') {
      const accessToken = await buildOauthBearerToken(integration);
      headers.set(integration.apiKeyHeader || 'Authorization', `Bearer ${accessToken}`);
    }

    const response = await fetch(url, {
      method: integration.method ?? 'GET',
      headers,
      cache: 'no-store',
    });

    const rawText = await response.text();
    let payload: unknown = null;

    try {
      payload = rawText ? JSON.parse(rawText) : null;
    } catch {
      payload = { raw: rawText };
    }

    if (!response.ok) {
      return NextResponse.json(
        {
          error: `${integration.name} sipariş servisi hata döndürdü (${response.status}).`,
          details: typeof payload === 'object' ? payload : rawText.slice(0, 500),
        },
        { status: response.status },
      );
    }

    return NextResponse.json({
      orders: normalizeOrders(payload),
      receivedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Sipariş entegrasyonu çalıştırılamadı.',
      },
      { status: 500 },
    );
  }
}
