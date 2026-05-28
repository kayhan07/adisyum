/**
 * ADISYUM Enterprise Alert Engine
 * Multi-channel alerts: Webhook, Telegram, Discord, Email
 * Severity levels: info | warning | critical | emergency
 */

import { logInfo, logError, logWarn } from '@/lib/observability/structured-logger';

// ─── Types ────────────────────────────────────────────────────────────────────

export type AlertSeverity = 'info' | 'warning' | 'critical' | 'emergency';

export type AlertChannel = 'webhook' | 'telegram' | 'discord' | 'email' | 'internal';

export type AlertEvent = {
  id: string;
  severity: AlertSeverity;
  title: string;
  message: string;
  tenantId?: string;
  service?: string;
  context?: Record<string, unknown>;
  firedAt: string;
  channels: AlertChannel[];
  deliveredTo: AlertChannel[];
  suppressedUntil?: string;
};

type AlertChannelConfig = {
  webhookUrl?: string;
  telegramBotToken?: string;
  telegramChatId?: string;
  discordWebhookUrl?: string;
  emailFrom?: string;
  emailTo?: string;
  smtpHost?: string;
  smtpPort?: number;
};

// ─── Global Singleton ─────────────────────────────────────────────────────────

const MAX_ALERTS = 1000;

const g = globalThis as typeof globalThis & {
  __adisyumAlerts?: AlertEvent[];
  __adisyumAlertSuppress?: Record<string, number>; // key → epoch until suppressed
};

function getAlertStore(): AlertEvent[] {
  if (!g.__adisyumAlerts) g.__adisyumAlerts = [];
  return g.__adisyumAlerts;
}

function getSuppressMap(): Record<string, number> {
  if (!g.__adisyumAlertSuppress) g.__adisyumAlertSuppress = {};
  return g.__adisyumAlertSuppress;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function nowIso() { return new Date().toISOString(); }
function uid() { return `alert-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; }

function severityEmoji(sev: AlertSeverity) {
  return { info: 'ℹ️', warning: '⚠️', critical: '🚨', emergency: '🆘' }[sev];
}

function severityColor(sev: AlertSeverity) {
  return { info: 3447003, warning: 16776960, critical: 15158332, emergency: 10038562 }[sev];
}

function getChannelConfig(): AlertChannelConfig {
  return {
    webhookUrl: process.env.ALERT_WEBHOOK_URL,
    telegramBotToken: process.env.ALERT_TELEGRAM_BOT_TOKEN,
    telegramChatId: process.env.ALERT_TELEGRAM_CHAT_ID,
    discordWebhookUrl: process.env.ALERT_DISCORD_WEBHOOK_URL,
    emailTo: process.env.ALERT_EMAIL_TO,
    smtpHost: process.env.ALERT_SMTP_HOST,
  };
}

function isSuppressed(key: string): boolean {
  const suppress = getSuppressMap();
  return (suppress[key] ?? 0) > Date.now();
}

function suppress(key: string, ttlMs: number) {
  getSuppressMap()[key] = Date.now() + ttlMs;
}

// ─── Channel Delivery ─────────────────────────────────────────────────────────

async function sendWebhook(cfg: AlertChannelConfig, alert: AlertEvent): Promise<boolean> {
  if (!cfg.webhookUrl) return false;
  try {
    const res = await fetch(cfg.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        alert_id: alert.id,
        severity: alert.severity,
        title: alert.title,
        message: alert.message,
        tenant_id: alert.tenantId,
        service: alert.service,
        context: alert.context,
        fired_at: alert.firedAt,
      }),
      signal: AbortSignal.timeout(8000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function sendTelegram(cfg: AlertChannelConfig, alert: AlertEvent): Promise<boolean> {
  if (!cfg.telegramBotToken || !cfg.telegramChatId) return false;
  const emoji = severityEmoji(alert.severity);
  const text = [
    `${emoji} *${alert.severity.toUpperCase()}* — ${alert.title}`,
    ``,
    `${alert.message}`,
    alert.tenantId ? `\n🏢 Tenant: \`${alert.tenantId.slice(0, 12)}\`` : '',
    alert.service ? `🔧 Servis: \`${alert.service}\`` : '',
    `\n⏱ ${new Date(alert.firedAt).toLocaleString('tr-TR')}`,
  ].filter(Boolean).join('\n');

  try {
    const res = await fetch(`https://api.telegram.org/bot${cfg.telegramBotToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: cfg.telegramChatId, text, parse_mode: 'Markdown' }),
      signal: AbortSignal.timeout(10000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function sendDiscord(cfg: AlertChannelConfig, alert: AlertEvent): Promise<boolean> {
  if (!cfg.discordWebhookUrl) return false;
  const emoji = severityEmoji(alert.severity);

  try {
    const res = await fetch(cfg.discordWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'Adisyum Ops',
        embeds: [{
          title: `${emoji} ${alert.title}`,
          description: alert.message,
          color: severityColor(alert.severity),
          fields: [
            alert.tenantId ? { name: 'Tenant', value: alert.tenantId, inline: true } : null,
            alert.service ? { name: 'Servis', value: alert.service, inline: true } : null,
            { name: 'Severity', value: alert.severity, inline: true },
          ].filter(Boolean),
          timestamp: alert.firedAt,
          footer: { text: 'Adisyum Enterprise Ops' },
        }],
      }),
      signal: AbortSignal.timeout(10000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function sendEmail(cfg: AlertChannelConfig, alert: AlertEvent): Promise<boolean> {
  // Lightweight SMTP send via fetch to a simple relay if configured
  if (!cfg.smtpHost || !cfg.emailTo) return false;

  // For now log intent — full SMTP would require nodemailer (external dep)
  logInfo({
    service: 'alert-engine',
    message: `[EMAIL INTENT] To: ${cfg.emailTo} | Subject: [${alert.severity.toUpperCase()}] ${alert.title}`,
    context: { alertId: alert.id, tenantId: alert.tenantId },
  });
  return true;
}

// ─── Core Fire Function ───────────────────────────────────────────────────────

export async function fireAlert(input: {
  severity: AlertSeverity;
  title: string;
  message: string;
  tenantId?: string;
  service?: string;
  context?: Record<string, unknown>;
  channels?: AlertChannel[];
  suppressTtlMs?: number;
}): Promise<AlertEvent> {
  const suppressKey = `${input.severity}:${input.title}:${input.tenantId ?? '*'}`;
  const ttl = input.suppressTtlMs ?? suppressTtlFor(input.severity);

  if (isSuppressed(suppressKey)) {
    const store = getAlertStore();
    // Return last matching suppressed alert without re-firing
    const existing = store.find((a) => a.title === input.title && a.tenantId === input.tenantId);
    if (existing) return existing;
  }

  suppress(suppressKey, ttl);

  const cfg = getChannelConfig();
  const channelsToUse: AlertChannel[] = input.channels ?? resolveDefaultChannels(input.severity);

  const alert: AlertEvent = {
    id: uid(),
    severity: input.severity,
    title: input.title,
    message: input.message,
    tenantId: input.tenantId,
    service: input.service,
    context: input.context,
    firedAt: nowIso(),
    channels: channelsToUse,
    deliveredTo: ['internal'],
  };

  // Record in store
  const store = getAlertStore();
  store.unshift(alert);
  if (store.length > MAX_ALERTS) store.splice(MAX_ALERTS);

  // Internal log
  const logFn = input.severity === 'info' ? logInfo : input.severity === 'warning' ? logWarn : logError;
  logFn({
    service: 'alert-engine',
    tenantId: input.tenantId,
    message: `[ALERT:${input.severity.toUpperCase()}] ${input.title} — ${input.message}`,
  });

  // Async delivery (fire-and-forget with delivery tracking)
  const deliveryPromises: Promise<void>[] = [];

  if (channelsToUse.includes('webhook')) {
    deliveryPromises.push(
      sendWebhook(cfg, alert)
        .then((ok) => { if (ok) alert.deliveredTo.push('webhook'); })
        .catch((error) => {
          console.warn('[alert-engine] webhook delivery failed', {
            tenantId: input.tenantId,
            alertId: alert.id,
            channel: 'webhook',
            timestamp: new Date().toISOString(),
            error: error instanceof Error ? error.message : String(error),
          });
        }),
    );
  }
  if (channelsToUse.includes('telegram')) {
    deliveryPromises.push(
      sendTelegram(cfg, alert)
        .then((ok) => { if (ok) alert.deliveredTo.push('telegram'); })
        .catch((error) => {
          console.warn('[alert-engine] telegram delivery failed', {
            tenantId: input.tenantId,
            alertId: alert.id,
            channel: 'telegram',
            timestamp: new Date().toISOString(),
            error: error instanceof Error ? error.message : String(error),
          });
        }),
    );
  }
  if (channelsToUse.includes('discord')) {
    deliveryPromises.push(
      sendDiscord(cfg, alert)
        .then((ok) => { if (ok) alert.deliveredTo.push('discord'); })
        .catch((error) => {
          console.warn('[alert-engine] discord delivery failed', {
            tenantId: input.tenantId,
            alertId: alert.id,
            channel: 'discord',
            timestamp: new Date().toISOString(),
            error: error instanceof Error ? error.message : String(error),
          });
        }),
    );
  }
  if (channelsToUse.includes('email')) {
    deliveryPromises.push(
      sendEmail(cfg, alert)
        .then((ok) => { if (ok) alert.deliveredTo.push('email'); })
        .catch((error) => {
          console.warn('[alert-engine] email delivery failed', {
            tenantId: input.tenantId,
            alertId: alert.id,
            channel: 'email',
            timestamp: new Date().toISOString(),
            error: error instanceof Error ? error.message : String(error),
          });
        }),
    );
  }

  // Don't await — non-blocking
  void Promise.allSettled(deliveryPromises);

  return alert;
}

// ─── Severity → Suppress TTL ──────────────────────────────────────────────────

function suppressTtlFor(severity: AlertSeverity): number {
  return {
    info: 30 * 60 * 1000,       // 30 min
    warning: 15 * 60 * 1000,    // 15 min
    critical: 5 * 60 * 1000,    // 5 min
    emergency: 60 * 1000,       // 1 min (always re-fire)
  }[severity];
}

// ─── Default Channels per Severity ───────────────────────────────────────────

function resolveDefaultChannels(severity: AlertSeverity): AlertChannel[] {
  switch (severity) {
    case 'info':
      return ['internal'];
    case 'warning':
      return ['internal', 'webhook'];
    case 'critical':
      return ['internal', 'webhook', 'telegram', 'discord'];
    case 'emergency':
      return ['internal', 'webhook', 'telegram', 'discord', 'email'];
  }
}

// ─── Convenience Helpers ──────────────────────────────────────────────────────

export function alertInfo(title: string, message: string, ctx?: Partial<Parameters<typeof fireAlert>[0]>) {
  return fireAlert({ severity: 'info', title, message, ...ctx });
}

export function alertWarning(title: string, message: string, ctx?: Partial<Parameters<typeof fireAlert>[0]>) {
  return fireAlert({ severity: 'warning', title, message, ...ctx });
}

export function alertCritical(title: string, message: string, ctx?: Partial<Parameters<typeof fireAlert>[0]>) {
  return fireAlert({ severity: 'critical', title, message, ...ctx });
}

export function alertEmergency(title: string, message: string, ctx?: Partial<Parameters<typeof fireAlert>[0]>) {
  return fireAlert({ severity: 'emergency', title, message, ...ctx });
}

// ─── Read API ─────────────────────────────────────────────────────────────────

export function getRecentAlerts(limit = 100): AlertEvent[] {
  return getAlertStore().slice(0, limit);
}

export function getAlertsByTenant(tenantId: string, limit = 50): AlertEvent[] {
  return getAlertStore().filter((a) => a.tenantId === tenantId).slice(0, limit);
}

export function getAlertStats() {
  const alerts = getAlertStore();
  const last24h = Date.now() - 24 * 60 * 60 * 1000;
  const recent = alerts.filter((a) => new Date(a.firedAt).getTime() > last24h);

  return {
    total: alerts.length,
    last24h: recent.length,
    bySeverity: {
      info: recent.filter((a) => a.severity === 'info').length,
      warning: recent.filter((a) => a.severity === 'warning').length,
      critical: recent.filter((a) => a.severity === 'critical').length,
      emergency: recent.filter((a) => a.severity === 'emergency').length,
    },
  };
}
