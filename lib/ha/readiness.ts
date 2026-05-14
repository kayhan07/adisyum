import { logInfo } from '@/lib/observability/structured-logger';

type ReplicationStatus = 'healthy' | 'lagging' | 'down' | 'unknown';
type FailoverStatus = 'ready' | 'degraded' | 'not_configured';

export type HAReadinessReport = {
  generatedAt: string;
  cluster: {
    instanceCount: number;
    targetInstanceCount: number;
    stickySessions: boolean;
    statelessWorkers: boolean;
    distributedWebsocketState: boolean;
  };
  redis: {
    enabled: boolean;
    failover: FailoverStatus;
    replication: ReplicationStatus;
  };
  postgresql: {
    replication: ReplicationStatus;
    replicas: number;
    pointInTimeRecoveryEnabled: boolean;
  };
  score: number;
  risks: string[];
};

function envBool(name: string, fallback = false) {
  const value = process.env[name];
  if (!value) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function envNumber(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

function envEnum<T extends string>(name: string, allowed: T[], fallback: T): T {
  const value = process.env[name] as T | undefined;
  if (!value) return fallback;
  return allowed.includes(value) ? value : fallback;
}

export function getHAReadinessReport(): HAReadinessReport {
  const instanceCount = envNumber('HA_INSTANCE_COUNT', 1);
  const targetInstanceCount = envNumber('HA_TARGET_INSTANCE_COUNT', 2);
  const stickySessions = envBool('HA_STICKY_SESSIONS', true);
  const statelessWorkers = envBool('HA_STATELESS_WORKERS', true);
  const distributedWebsocketState = envBool('HA_DISTRIBUTED_WS_STATE', false);

  const redisEnabled = envBool('HA_REDIS_ENABLED', true);
  const redisFailover = envEnum('HA_REDIS_FAILOVER', ['ready', 'degraded', 'not_configured'], 'degraded');
  const redisReplication = envEnum('HA_REDIS_REPLICATION', ['healthy', 'lagging', 'down', 'unknown'], 'unknown');

  const pgReplication = envEnum('HA_PG_REPLICATION', ['healthy', 'lagging', 'down', 'unknown'], 'unknown');
  const pgReplicas = envNumber('HA_PG_REPLICAS', 1);
  const pitr = envBool('HA_PITR_ENABLED', true);

  const risks: string[] = [];
  let score = 100;

  if (instanceCount < targetInstanceCount) {
    score -= 20;
    risks.push('Multi-instance hedefi karşılanmıyor.');
  }
  if (!distributedWebsocketState) {
    score -= 12;
    risks.push('WebSocket durumu dağıtık paylaşılmıyor.');
  }
  if (!statelessWorkers) {
    score -= 10;
    risks.push('Worker süreçleri tam stateless değil.');
  }
  if (redisFailover !== 'ready') {
    score -= 15;
    risks.push('Redis failover hazır değil veya degrade.');
  }
  if (redisReplication === 'down') {
    score -= 15;
    risks.push('Redis replication down.');
  } else if (redisReplication === 'lagging') {
    score -= 8;
    risks.push('Redis replication lagging.');
  }

  if (pgReplication === 'down') {
    score -= 20;
    risks.push('PostgreSQL replication down.');
  } else if (pgReplication === 'lagging') {
    score -= 10;
    risks.push('PostgreSQL replication lagging.');
  }
  if (pgReplicas < 1) {
    score -= 10;
    risks.push('PostgreSQL read replica yok.');
  }
  if (!pitr) {
    score -= 10;
    risks.push('PITR devre dışı.');
  }

  const report: HAReadinessReport = {
    generatedAt: new Date().toISOString(),
    cluster: {
      instanceCount,
      targetInstanceCount,
      stickySessions,
      statelessWorkers,
      distributedWebsocketState,
    },
    redis: {
      enabled: redisEnabled,
      failover: redisFailover,
      replication: redisReplication,
    },
    postgresql: {
      replication: pgReplication,
      replicas: pgReplicas,
      pointInTimeRecoveryEnabled: pitr,
    },
    score: Math.max(0, Math.min(100, Math.round(score))),
    risks,
  };

  logInfo({
    service: 'ha-readiness',
    message: `HA readiness report generated with score ${report.score}`,
  });

  return report;
}
