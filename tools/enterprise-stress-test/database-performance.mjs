#!/usr/bin/env node

/**
 * ADİSYUM Database Performance Analyzer
 *
 * Analyzes database performance:
 * - Detects slow queries
 * - Identifies missing indexes
 * - Checks connection pool saturation
 * - Identifies table scans
 * - Detects transaction locks
 * - Monitors query cache effectiveness
 */

import pkg from 'pg';
const { Pool } = pkg;
import fs from 'fs';
import path from 'path';

const CONFIG = {
  DATABASE_URL: process.env.DATABASE_URL || 'postgresql://adisyum:staging-password@localhost:5432/adisyum_staging',
  SLOW_QUERY_THRESHOLD_MS: parseInt(process.env.SLOW_QUERY_THRESHOLD_MS || '100'),
  LOG_DIR: './test-results',
  ANALYSIS_DURATION_SECONDS: parseInt(process.env.ANALYSIS_DURATION_SECONDS || '60'),
};

class DatabasePerformanceAnalyzer {
  constructor() {
    this.pool = null;
    this.results = {
      slowQueries: [],
      missingIndexes: [],
      connectionPoolStats: {},
      tableScanWarnings: [],
      lockWaitTimes: [],
      queryStats: [],
      cacheUtilization: {},
    };
  }

  async connect() {
    console.log('Connecting to database...');

    try {
      this.pool = new Pool({
        connectionString: CONFIG.DATABASE_URL,
        max: 20,
        min: 5,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      });

      // Test connection
      const client = await this.pool.connect();
      console.log('✓ Connected to database');
      
      // Get database info
      const result = await client.query('SELECT version()');
      console.log(`Database: ${result.rows[0].version}\n`);
      
      client.release();
    } catch (error) {
      throw new Error(`Failed to connect to database: ${error.message}`);
    }
  }

  async analyzeTableStructure() {
    console.log('[ANALYSIS 1] Table Structure and Indexes');

    const client = await this.pool.connect();

    try {
      // Get all tables
      const tableRes = await client.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
        ORDER BY table_name
      `);

      for (const row of tableRes.rows) {
        const tableName = row.table_name;

        // Check table size
        const sizeRes = await client.query(
          `SELECT pg_size_pretty(pg_total_relation_size($1)) as size`,
          [tableName]
        );

        // Get indexes
        const indexRes = await client.query(`
          SELECT indexname FROM pg_indexes WHERE tablename = $1
        `, [tableName]);

        // Get row count
        const countRes = await client.query(
          `SELECT schemaname, tablename, pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) as size, n_live_tup FROM pg_stat_user_tables WHERE tablename = $1`,
          [tableName]
        );

        console.log(`  ${tableName}:`);
        console.log(`    Size: ${sizeRes.rows[0]?.size || 'unknown'}`);
        console.log(`    Indexes: ${indexRes.rows.length}`);
        console.log(`    Row count: ${countRes.rows[0]?.n_live_tup || 0}`);

        // Check for tables without primary key
        const pkRes = await client.query(`
          SELECT constraint_name FROM information_schema.table_constraints
          WHERE table_name = $1 AND constraint_type = 'PRIMARY KEY'
        `, [tableName]);

        if (pkRes.rows.length === 0) {
          console.log(`    ⚠️  No primary key!`);
        }
      }

      console.log('');
    } finally {
      client.release();
    }
  }

  async analyzeSlowQueries() {
    console.log('[ANALYSIS 2] Slow Query Detection');

    const client = await this.pool.connect();

    try {
      // Check if pg_stat_statements is available
      const extRes = await client.query(`
        SELECT * FROM pg_available_extensions WHERE name = 'pg_stat_statements'
      `);

      if (extRes.rows.length === 0) {
        console.log('  pg_stat_statements not available');
        console.log('  To enable: CREATE EXTENSION pg_stat_statements;\n');
        return;
      }

      // Get slow queries
      const queryRes = await client.query(`
        SELECT 
          query,
          calls,
          mean_exec_time,
          max_exec_time,
          total_exec_time
        FROM pg_stat_statements
        WHERE mean_exec_time > $1
        ORDER BY mean_exec_time DESC
        LIMIT 10
      `, [CONFIG.SLOW_QUERY_THRESHOLD_MS]);

      console.log(`  Found ${queryRes.rows.length} slow queries:\n`);

      for (let i = 0; i < queryRes.rows.length; i++) {
        const row = queryRes.rows[i];
        console.log(`  ${i + 1}. Mean time: ${row.mean_exec_time.toFixed(2)}ms (max: ${row.max_exec_time.toFixed(2)}ms)`);
        console.log(`     Calls: ${row.calls}, Total time: ${(row.total_exec_time / 1000).toFixed(2)}s`);
        console.log(`     Query: ${row.query.substring(0, 80)}...`);

        this.results.slowQueries.push({
          query: row.query,
          meanTime: row.mean_exec_time,
          maxTime: row.max_exec_time,
          calls: row.calls,
        });
      }

      console.log('');
    } catch (error) {
      console.log(`  Slow query analysis error: ${error.message}\n`);
    } finally {
      client.release();
    }
  }

  async analyzeIndexUsage() {
    console.log('[ANALYSIS 3] Index Usage Analysis');

    const client = await this.pool.connect();

    try {
      // Find unused indexes
      const unusedRes = await client.query(`
        SELECT schemaname, tablename, indexname, idx_scan, idx_tup_read, idx_tup_fetch
        FROM pg_stat_user_indexes
        WHERE idx_scan = 0
        AND indexrelname NOT LIKE 'pg_%'
        LIMIT 10
      `);

      if (unusedRes.rows.length > 0) {
        console.log(`  Found ${unusedRes.rows.length} unused indexes:\n`);
        for (const row of unusedRes.rows) {
          console.log(`    - ${row.schemaname}.${row.tablename}.${row.indexname}`);
          this.results.missingIndexes.push({
            type: 'unused_index',
            index: row.indexname,
            table: row.tablename,
          });
        }
        console.log('');
      }

      // Find missing indexes (tables with many seq scans)
      const seqScanRes = await client.query(`
        SELECT schemaname, tablename, seq_scan, seq_tup_read, idx_scan
        FROM pg_stat_user_tables
        WHERE seq_scan > 1000 AND idx_scan < 10
        ORDER BY seq_scan DESC
        LIMIT 5
      `);

      if (seqScanRes.rows.length > 0) {
        console.log(`  Tables with high sequential scans:\n`);
        for (const row of seqScanRes.rows) {
          console.log(`    - ${row.tablename}: ${row.seq_scan} seq scans, ${row.idx_scan} index scans`);
          this.results.tableScanWarnings.push({
            table: row.tablename,
            seqScans: row.seq_scan,
            indexScans: row.idx_scan,
            severity: 'warning',
          });
        }
        console.log('');
      }
    } catch (error) {
      console.log(`  Index analysis error: ${error.message}\n`);
    } finally {
      client.release();
    }
  }

  async analyzeConnectionPool() {
    console.log('[ANALYSIS 4] Connection Pool Analysis');

    const client = await this.pool.connect();

    try {
      const connRes = await client.query(`
        SELECT 
          datname,
          count(*) as total_connections,
          count(*) FILTER (WHERE state = 'active') as active_connections,
          count(*) FILTER (WHERE state = 'idle') as idle_connections,
          count(*) FILTER (WHERE state = 'idle in transaction') as idle_in_transaction
        FROM pg_stat_activity
        WHERE datname IS NOT NULL
        GROUP BY datname
      `);

      for (const row of connRes.rows) {
        console.log(`  Database: ${row.datname}`);
        console.log(`    Total connections: ${row.total_connections}`);
        console.log(`    Active: ${row.active_connections}`);
        console.log(`    Idle: ${row.idle_connections}`);
        console.log(`    Idle in transaction: ${row.idle_in_transaction}`);

        // Warn if pool is near saturation
        if (row.total_connections > 15) {
          console.log(`    ⚠️  Connection pool near saturation!`);
          this.results.connectionPoolStats.warning = true;
        }
      }

      console.log('');
    } catch (error) {
      console.log(`  Connection pool analysis error: ${error.message}\n`);
    } finally {
      client.release();
    }
  }

  async analyzeLocks() {
    console.log('[ANALYSIS 5] Lock Analysis');

    const client = await this.pool.connect();

    try {
      const lockRes = await client.query(`
        SELECT 
          pid,
          usename,
          query,
          waiting,
          wait_event_type,
          wait_event
        FROM pg_stat_activity
        WHERE waiting = true
        LIMIT 5
      `);

      if (lockRes.rows.length > 0) {
        console.log(`  Found ${lockRes.rows.length} waiting locks:\n`);
        for (const row of lockRes.rows) {
          console.log(`    Process ${row.pid} (${row.usename})`);
          console.log(`    Wait event: ${row.wait_event_type}:${row.wait_event}`);
          console.log(`    Query: ${row.query?.substring(0, 60)}...`);

          this.results.lockWaitTimes.push({
            pid: row.pid,
            user: row.usename,
            waitEvent: `${row.wait_event_type}:${row.wait_event}`,
          });
        }
        console.log('');
      } else {
        console.log('  No waiting locks detected\n');
      }
    } catch (error) {
      console.log(`  Lock analysis error: ${error.message}\n`);
    } finally {
      client.release();
    }
  }

  async analyzeTransactions() {
    console.log('[ANALYSIS 6] Transaction Analysis');

    const client = await this.pool.connect();

    try {
      const txnRes = await client.query(`
        SELECT 
          pid,
          usename,
          query,
          query_start,
          xact_start,
          state,
          EXTRACT(EPOCH FROM (NOW() - xact_start))::int as transaction_age_seconds
        FROM pg_stat_activity
        WHERE xact_start IS NOT NULL
        AND query_start IS NOT NULL
        ORDER BY xact_start
      `);

      console.log(`  Active transactions: ${txnRes.rows.length}`);

      // Check for long-running transactions
      const longTxns = txnRes.rows.filter(r => r.transaction_age_seconds > 300);
      if (longTxns.length > 0) {
        console.log(`  ⚠️  Found ${longTxns.length} long-running transactions (>5 min):\n`);
        for (const row of longTxns.slice(0, 3)) {
          console.log(`    PID ${row.pid}: ${row.transaction_age_seconds}s - ${row.query?.substring(0, 50)}...`);
        }
      }

      console.log('');
    } catch (error) {
      console.log(`  Transaction analysis error: ${error.message}\n`);
    } finally {
      client.release();
    }
  }

  async analyzeQueryCache() {
    console.log('[ANALYSIS 7] Query Cache Effectiveness');

    const client = await this.pool.connect();

    try {
      const cacheRes = await client.query(`
        SELECT 
          sum(blks_hit) as cache_hits,
          sum(blks_read) as cache_misses,
          round(sum(blks_hit)::numeric / (sum(blks_hit) + sum(blks_read)), 4) as cache_ratio
        FROM pg_stat_database
        WHERE datname = current_database()
      `);

      const row = cacheRes.rows[0];
      const cacheRatio = parseFloat(row.cache_ratio) || 0;

      console.log(`  Cache hits: ${row.cache_hits}`);
      console.log(`  Cache misses: ${row.cache_misses}`);
      console.log(`  Cache hit ratio: ${(cacheRatio * 100).toFixed(2)}%`);

      if (cacheRatio < 0.99) {
        console.log(`  ⚠️  Low cache hit ratio - consider increasing shared_buffers`);
      }

      this.results.cacheUtilization = {
        hits: row.cache_hits,
        misses: row.cache_misses,
        ratio: cacheRatio,
      };

      console.log('');
    } catch (error) {
      console.log(`  Cache analysis error: ${error.message}\n`);
    } finally {
      client.release();
    }
  }

  generateReport() {
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        slowQueriesDetected: this.results.slowQueries.length,
        missingIndexIssues: this.results.missingIndexes.length,
        tableScanWarnings: this.results.tableScanWarnings.length,
        lockWaits: this.results.lockWaitTimes.length,
      },
      details: {
        slowQueries: this.results.slowQueries,
        indexIssues: this.results.missingIndexes,
        tableScanWarnings: this.results.tableScanWarnings,
        lockWaits: this.results.lockWaitTimes,
        cacheUtilization: this.results.cacheUtilization,
      },
      databasePerformanceScore: this.calculatePerformanceScore(),
    };

    return report;
  }

  calculatePerformanceScore() {
    let score = 100;

    // Penalize for slow queries
    score -= Math.min(this.results.slowQueries.length * 5, 20);

    // Penalize for missing indexes
    score -= Math.min(this.results.missingIndexes.length * 3, 15);

    // Penalize for table scans
    score -= Math.min(this.results.tableScanWarnings.length * 2, 10);

    // Penalize for locks
    score -= Math.min(this.results.lockWaitTimes.length * 10, 20);

    // Penalize for low cache hit ratio
    if (this.results.cacheUtilization.ratio && this.results.cacheUtilization.ratio < 0.99) {
      score -= 15;
    }

    return Math.max(0, score).toFixed(2);
  }

  async run() {
    console.log('=== Database Performance Analysis ===\n');

    try {
      await this.connect();
      await this.analyzeTableStructure();
      await this.analyzeSlowQueries();
      await this.analyzeIndexUsage();
      await this.analyzeConnectionPool();
      await this.analyzeLocks();
      await this.analyzeTransactions();
      await this.analyzeQueryCache();

      const report = this.generateReport();

      // Save report
      if (!fs.existsSync(CONFIG.LOG_DIR)) {
        fs.mkdirSync(CONFIG.LOG_DIR, { recursive: true });
      }

      const reportPath = path.join(CONFIG.LOG_DIR, `database-performance-${Date.now()}.json`);
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

      console.log('\n=== Performance Analysis Results ===');
      console.log(JSON.stringify(report, null, 2));
      console.log(`\nReport saved to: ${reportPath}`);

      await this.pool.end();
    } catch (error) {
      console.error('Analysis failed:', error);
      if (this.pool) {
        await this.pool.end();
      }
      process.exit(1);
    }
  }
}

new DatabasePerformanceAnalyzer().run();
