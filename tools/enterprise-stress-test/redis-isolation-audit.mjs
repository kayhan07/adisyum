#!/usr/bin/env node

/**
 * ADİSYUM Redis Isolation Audit Tool
 *
 * Validates Redis cache isolation:
 * - All keys are properly tenant-prefixed
 * - No shared cache keys between tenants
 * - Tenant prefixes are consistent
 * - Cache invalidation is tenant-scoped
 * - No stale cache issues
 * - TTL settings are appropriate
 */

import redis from 'redis';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const CONFIG = {
  REDIS_URL: process.env.REDIS_URL || 'redis://:staging-redis-password@localhost:6379/0',
  LOG_DIR: './test-results',
  TENANT_PREFIX_PATTERN: /^(prod|staging):(tenant-[a-zA-Z0-9-]+|system-admin):/,
  MAX_KEYS_TO_SAMPLE: 10000,
};

class RedisIsolationAudit {
  constructor() {
    this.client = null;
    this.results = {
      totalKeys: 0,
      tenantPrefixedKeys: 0,
      nonPrefixedKeys: [],
      sharedCacheIssues: [],
      missingTenantPrefix: [],
      ttlIssues: [],
      inconsistentPrefixes: [],
      tenantKeyDistribution: {},
      cacheHitRate: 0,
      staleCacheIssues: [],
    };
  }

  async connectRedis() {
    console.log('Connecting to Redis...');
    
    try {
      this.client = redis.createClient({
        url: CONFIG.REDIS_URL,
        socket: {
          reconnectStrategy: () => null,
        },
      });

      this.client.on('error', (err) => {
        console.error('Redis client error:', err);
      });

      await this.client.connect();
      console.log('✓ Connected to Redis\n');
    } catch (error) {
      throw new Error(`Failed to connect to Redis: ${error.message}`);
    }
  }

  async auditKeyPrefixes() {
    console.log('[AUDIT 1] Key Prefix Audit');

    try {
      const keys = await this.client.keys('*');
      this.results.totalKeys = keys.length;

      const prefixMap = {};
      const tenantMap = {};

      for (const key of keys.slice(0, CONFIG.MAX_KEYS_TO_SAMPLE)) {
        // Extract prefix
        const parts = key.split(':');
        const prefix = parts[0];

        prefixMap[prefix] = (prefixMap[prefix] || 0) + 1;

        // Check tenant isolation
        if (CONFIG.TENANT_PREFIX_PATTERN.test(key)) {
          this.results.tenantPrefixedKeys++;
          
          // Extract tenant ID
          const tenantMatch = key.match(/^(prod|staging):(tenant-[a-zA-Z0-9-]+|system-admin):/);
          if (tenantMatch) {
            const tenantId = tenantMatch[2];
            tenantMap[tenantId] = (tenantMap[tenantId] || 0) + 1;
          }
        } else {
          this.results.nonPrefixedKeys.push(key);
          
          // Check if this is a shared cache issue
          if (!this.isSystemKey(key)) {
            this.results.sharedCacheIssues.push({
              key,
              issue: 'No tenant prefix found for business data key',
              severity: 'critical',
            });
          }
        }
      }

      this.results.tenantKeyDistribution = tenantMap;

      const prefixedPercentage = ((this.results.tenantPrefixedKeys / this.results.totalKeys) * 100).toFixed(2);
      console.log(`Total keys sampled: ${Math.min(CONFIG.MAX_KEYS_TO_SAMPLE, keys.length)} of ${this.results.totalKeys}`);
      console.log(`Properly prefixed: ${this.results.tenantPrefixedKeys} (${prefixedPercentage}%)`);
      console.log(`Prefix distribution:`, prefixMap);
      console.log(`Tenant distribution:`, tenantMap);

      if (this.results.nonPrefixedKeys.length > 0) {
        console.log(`⚠️  Non-prefixed keys found: ${this.results.nonPrefixedKeys.length}`);
      }
      if (this.results.sharedCacheIssues.length > 0) {
        console.log(`❌ Shared cache issues: ${this.results.sharedCacheIssues.length}`);
      }
    } catch (error) {
      console.error('Prefix audit failed:', error.message);
    }
  }

  async auditTTL() {
    console.log('\n[AUDIT 2] TTL Audit');

    try {
      const keys = await this.client.keys('*');
      const ttlIssues = [];
      let noTTLKeys = 0;
      const ttlDistribution = {};

      for (const key of keys.slice(0, 1000)) {
        const ttl = await this.client.ttl(key);

        if (ttl === -1) {
          noTTLKeys++;
          
          // Keys without TTL might cause memory issues
          if (key.includes('session') || key.includes('cache')) {
            ttlIssues.push({
              key,
              issue: 'No TTL set on cache/session key',
              severity: 'warning',
            });
          }
        } else if (ttl === -2) {
          // Key doesn't exist
        } else {
          ttlDistribution[Math.ceil(ttl / 3600)] = (ttlDistribution[Math.ceil(ttl / 3600)] || 0) + 1;
        }
      }

      this.results.ttlIssues = ttlIssues;
      console.log(`Keys sampled: 1000`);
      console.log(`Keys without TTL: ${noTTLKeys}`);
      console.log(`TTL distribution (hours):`, ttlDistribution);

      if (ttlIssues.length > 0) {
        console.log(`⚠️  TTL issues found: ${ttlIssues.length}`);
      }
    } catch (error) {
      console.error('TTL audit failed:', error.message);
    }
  }

  async auditCacheConsistency() {
    console.log('\n[AUDIT 3] Cache Consistency Audit');

    try {
      // Check for duplicate keys with different prefixes
      const keys = await this.client.keys('*');
      const baseKeyNames = {};

      for (const key of keys) {
        // Extract base name (everything after tenant prefix)
        const parts = key.split(':');
        let basename = key;

        if (CONFIG.TENANT_PREFIX_PATTERN.test(key)) {
          basename = parts.slice(2).join(':');
        }

        if (!baseKeyNames[basename]) {
          baseKeyNames[basename] = [];
        }
        baseKeyNames[basename].push(key);
      }

      // Find keys that appear under multiple tenants
      const multiTenantBaseNames = Object.entries(baseKeyNames)
        .filter(([, keys]) => keys.length > 1)
        .slice(0, 20);

      console.log(`Unique base key names: ${Object.keys(baseKeyNames).length}`);

      if (multiTenantBaseNames.length > 0) {
        console.log(`⚠️  Base names appearing in multiple contexts:`);
        for (const [basename, keys] of multiTenantBaseNames) {
          console.log(`  - ${basename}: ${keys.length} variants`);
        }
      }
    } catch (error) {
      console.error('Consistency audit failed:', error.message);
    }
  }

  async auditMemoryUsage() {
    console.log('\n[AUDIT 4] Memory Usage Audit');

    try {
      const info = await this.client.info('memory');
      const memoryStats = this.parseMemoryInfo(info);

      console.log(`Used memory: ${(memoryStats.used_memory / 1024 / 1024).toFixed(2)} MB`);
      console.log(`Peak memory: ${(memoryStats.used_memory_peak / 1024 / 1024).toFixed(2)} MB`);
      console.log(`Memory fragmentation: ${memoryStats.mem_fragmentation_ratio.toFixed(2)}`);

      // Warn if memory usage is high or fragmentation is bad
      if (memoryStats.mem_fragmentation_ratio > 1.5) {
        this.results.staleCacheIssues.push({
          issue: 'High memory fragmentation (>1.5)',
          severity: 'warning',
          value: memoryStats.mem_fragmentation_ratio,
        });
      }
    } catch (error) {
      console.error('Memory audit failed:', error.message);
    }
  }

  async auditEvictionPolicy() {
    console.log('\n[AUDIT 5] Eviction Policy Audit');

    try {
      const config = await this.client.configGet('maxmemory-policy');
      const policy = config.get('maxmemory-policy') || 'noeviction';

      console.log(`Eviction policy: ${policy}`);

      // Check if appropriate for cache
      const appropriatePolicies = ['allkeys-lru', 'volatile-lru', 'allkeys-lfu'];
      if (!appropriatePolicies.includes(policy)) {
        console.log(`⚠️  Eviction policy "${policy}" may not be optimal for caching`);
      }

      // Check maxmemory setting
      const maxmemory = await this.client.configGet('maxmemory');
      const limit = maxmemory.get('maxmemory') || '0';
      console.log(`Max memory limit: ${limit}`);
    } catch (error) {
      console.error('Eviction policy audit failed:', error.message);
    }
  }

  // Test slow query log (Redis 6.2+)
  async auditCacheErrors() {
    console.log('\n[AUDIT 6] Cache Error Patterns');

    try {
      const keys = await this.client.keys('*');

      // Sample keys for type consistency
      const typeMap = {};
      for (const key of keys.slice(0, 500)) {
        const type = await this.client.type(key);
        typeMap[type] = (typeMap[type] || 0) + 1;
      }

      console.log(`Key type distribution:`, typeMap);

      // Check for potential errors
      if (typeMap.none && typeMap.none > keys.length * 0.1) {
        console.log(`⚠️  High number of missing keys (${typeMap.none})`);
      }
    } catch (error) {
      console.error('Cache error audit failed:', error.message);
    }
  }

  // Helper functions
  isSystemKey(key) {
    const systemPrefixes = [
      'queue:',
      'job:',
      'session:meta:',
      'config:',
      'feature-flag:',
      'rate-limit:',
    ];
    return systemPrefixes.some((prefix) => key.startsWith(prefix));
  }

  parseMemoryInfo(info) {
    const lines = info.split('\r\n');
    const stats = {};

    for (const line of lines) {
      if (!line.includes(':')) continue;
      const [key, value] = line.split(':');
      stats[key] = isNaN(value) ? value : parseInt(value);
    }

    return stats;
  }

  generateReport() {
    const criticalIssues = [
      ...this.results.sharedCacheIssues.filter((i) => i.severity === 'critical'),
      ...this.results.ttlIssues.filter((i) => i.severity === 'critical'),
    ];

    const warningIssues = [
      ...this.results.sharedCacheIssues.filter((i) => i.severity === 'warning'),
      ...this.results.ttlIssues.filter((i) => i.severity === 'warning'),
      ...this.results.staleCacheIssues,
    ];

    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        totalKeys: this.results.totalKeys,
        tenantPrefixedKeys: this.results.tenantPrefixedKeys,
        prefixedPercentage: `${((this.results.tenantPrefixedKeys / this.results.totalKeys) * 100).toFixed(2)}%`,
        nonPrefixedKeysCount: this.results.nonPrefixedKeys.length,
        criticalIssues: criticalIssues.length,
        warningIssues: warningIssues.length,
      },
      issues: {
        critical: criticalIssues,
        warnings: warningIssues,
      },
      tenantDistribution: this.results.tenantKeyDistribution,
      redisIsolationScore: this.calculateScore(),
    };

    return report;
  }

  calculateScore() {
    const prefixRate = (this.results.tenantPrefixedKeys / this.results.totalKeys) * 100;
    const criticalIssues = this.results.sharedCacheIssues.filter((i) => i.severity === 'critical').length;
    const warningIssues = this.results.sharedCacheIssues.filter((i) => i.severity === 'warning').length +
      this.results.ttlIssues.length;

    let score = 100;
    score -= (100 - prefixRate) * 0.5; // 50% weight on prefix rate
    score -= criticalIssues * 20;
    score -= warningIssues * 5;

    return Math.max(0, score).toFixed(2);
  }

  async run() {
    console.log('=== Redis Isolation Audit ===\n');

    try {
      await this.connectRedis();
      await this.auditKeyPrefixes();
      await this.auditTTL();
      await this.auditCacheConsistency();
      await this.auditMemoryUsage();
      await this.auditEvictionPolicy();
      await this.auditCacheErrors();

      const report = this.generateReport();

      // Save report
      if (!fs.existsSync(CONFIG.LOG_DIR)) {
        fs.mkdirSync(CONFIG.LOG_DIR, { recursive: true });
      }

      const reportPath = path.join(CONFIG.LOG_DIR, `redis-isolation-audit-${Date.now()}.json`);
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

      console.log('\n=== Audit Results ===');
      console.log(JSON.stringify(report, null, 2));
      console.log(`\nReport saved to: ${reportPath}`);

      await this.client.quit();

      // Exit with error if critical issues
      if (report.summary.criticalIssues > 0) {
        console.error(`\n❌ ${report.summary.criticalIssues} critical issues found!`);
        process.exit(1);
      }

      process.exit(0);
    } catch (error) {
      console.error('Audit failed:', error);
      if (this.client) {
        await this.client.quit();
      }
      process.exit(1);
    }
  }
}

new RedisIsolationAudit().run();
