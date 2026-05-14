import { recordStructuredLog, type ObservabilityLogLevel } from '@/lib/observability/metrics-store';

type StructuredLogInput = {
  level?: ObservabilityLogLevel;
  message: string;
  tenantId?: string;
  service: string;
  route?: string;
  context?: Record<string, unknown>;
};

function toPayload(input: Required<Pick<StructuredLogInput, 'level' | 'message' | 'service'>> & Omit<StructuredLogInput, 'level' | 'message' | 'service'>) {
  return {
    timestamp: new Date().toISOString(),
    level: input.level,
    message: input.message,
    tenantId: input.tenantId,
    service: input.service,
    route: input.route,
    context: input.context,
  };
}

export function writeStructuredLog(input: StructuredLogInput) {
  const level = input.level ?? 'info';
  const payload = toPayload({
    ...input,
    level,
    message: input.message,
    service: input.service,
  });

  if (level === 'error') {
    console.error(JSON.stringify(payload));
  } else if (level === 'warn') {
    console.warn(JSON.stringify(payload));
  } else {
    console.log(JSON.stringify(payload));
  }

  recordStructuredLog({
    level,
    message: input.message,
    tenantId: input.tenantId,
    service: input.service,
    route: input.route,
    context: input.context,
  });
}

export function logInfo(input: Omit<StructuredLogInput, 'level'>) {
  writeStructuredLog({ ...input, level: 'info' });
}

export function logWarn(input: Omit<StructuredLogInput, 'level'>) {
  writeStructuredLog({ ...input, level: 'warn' });
}

export function logError(input: Omit<StructuredLogInput, 'level'>) {
  writeStructuredLog({ ...input, level: 'error' });
}
