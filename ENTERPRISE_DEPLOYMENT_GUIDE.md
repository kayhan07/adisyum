# Enterprise Staging Environment - Deployment & Operations Guide

**Version**: 1.0  
**Last Updated**: May 13, 2025  
**Status**: Production-Ready

---

## Table of Contents

1. [Initial Setup](#initial-setup)
2. [Infrastructure Startup](#infrastructure-startup)
3. [Test Execution](#test-execution)
4. [Results Analysis](#results-analysis)
5. [Troubleshooting](#troubleshooting)
6. [Performance Tuning](#performance-tuning)
7. [Maintenance](#maintenance)
8. [Disaster Recovery](#disaster-recovery)

---

## Initial Setup

### Prerequisites Check

```bash
# Verify system requirements
echo "=== System Information ==="
node --version        # Should be v20 or higher
docker --version      # Should be latest
docker-compose --version
redis-cli --version   # Or: install redis-tools
psql --version        # Or: install postgresql-client

# Check available resources
free -h               # Should have 8GB+ RAM
df -h                 # Should have 20GB+ storage
nproc                 # Should be 4+ cores
```

### Dependencies Installation

```bash
# If any tools are missing:

# Node.js (macOS)
brew install node@20

# Docker (all platforms)
# Download from: https://www.docker.com/products/docker-desktop

# PostgreSQL client
brew install postgresql  # macOS
apt-get install postgresql-client  # Ubuntu/Debian

# K6 (for load testing)
brew install k6  # macOS
choco install k6  # Windows
apt-get install k6  # Ubuntu/Debian
```

### Project Setup

```bash
# 1. Navigate to workspace
cd c:\Users\Kayhan\Desktop\adisyum

# 2. Install dependencies
npm install

# 3. Generate Prisma client
npm run prisma:generate

# 4. Verify environment files exist
ls -la .env.*

# Expected output:
# .env.development
# .env.staging
# .env.production
```

---

## Infrastructure Startup

### Option A: Docker Compose (Recommended)

**Complete staging environment in one command:**

```bash
# 1. Start all services
npm run enterprise:setup-staging

# Expected output:
# Creating network...
# Creating postgres...
# Creating redis...
# Creating prometheus...
# etc.

# 2. Wait for services to be healthy (30-60 seconds)
sleep 30

# 3. Verify all services running
docker-compose -f docker-compose.staging.yml ps

# Expected output:
SERVICE              STATUS         PORTS
adisyum-postgres     Up (healthy)   5432/tcp
adisyum-redis        Up (healthy)   6379/tcp
adisyum-prometheus   Up             9090/tcp
adisyum-grafana      Up             3001/tcp
adisyum-nginx        Up             80/tcp, 443/tcp
adisyum-app          Up             3000/tcp
```

### Option B: Manual Service Startup

If Docker Compose is unavailable:

```bash
# Database (PostgreSQL)
docker run -d \
  --name adisyum-postgres \
  -e POSTGRES_USER=adisyum \
  -e POSTGRES_PASSWORD=staging-password \
  -e POSTGRES_DB=adisyum_staging \
  -p 5432:5432 \
  postgres:16-alpine

# Cache (Redis)
docker run -d \
  --name adisyum-redis \
  -e REDIS_PASSWORD=staging-redis-password \
  -p 6379:6379 \
  redis:7-alpine redis-server --requirepass staging-redis-password

# Wait for databases to be ready
sleep 10

# Application (Next.js)
npm run build
export NODE_ENV=staging
npm start
```

### Option C: Local Development

For development without Docker:

```bash
# 1. Ensure PostgreSQL and Redis are running locally
psql -U postgres -c "CREATE DATABASE adisyum_staging;"
redis-cli PING  # Should return "PONG"

# 2. Configure environment
export NODE_ENV=development
export DATABASE_URL=postgresql://user:password@localhost:5432/adisyum_staging
export REDIS_URL=redis://localhost:6379/0

# 3. Start application
npm run dev
```

---

## Infrastructure Health Checks

### Database Health

```bash
# PostgreSQL connection test
psql postgresql://adisyum:staging-password@localhost:5432/adisyum_staging -c "SELECT 1 AS status"

# Check database size
psql postgresql://adisyum:staging-password@localhost:5432/adisyum_staging -c "
  SELECT pg_database.datname, 
         pg_size_pretty(pg_database_size(pg_database.datname)) AS size 
  FROM pg_database 
  WHERE datname = 'adisyum_staging';"

# Check connection count
psql postgresql://adisyum:staging-password@localhost:5432/adisyum_staging -c "
  SELECT count(*) FROM pg_stat_activity WHERE datname = 'adisyum_staging';"
```

### Redis Health

```bash
# Connection test
redis-cli -a staging-redis-password PING

# Memory usage
redis-cli -a staging-redis-password INFO memory | grep used_memory_human

# Number of keys
redis-cli -a staging-redis-password DBSIZE

# Check if data is persisting
redis-cli -a staging-redis-password KEYS "*"
```

### Application Health

```bash
# API health check
curl http://localhost:3000/api/health

# Expected response:
# {"status": "ok", "timestamp": "2025-05-13T..."}

# Check logs
docker logs adisyum-app | tail -50

# Monitor in real-time
docker logs -f adisyum-app
```

---

## Test Execution

### Sequential Test Run (Recommended)

**Runs all tests one after another:**

```bash
# Start the test suite
npm run enterprise:run-all-tests

# This runs:
# 1. Tenant Stress Test (15 min)
# 2. Concurrency Test (10 min)
# 3. WebSocket Isolation Test (5 min)
# 4. Redis Isolation Audit (3 min)
# 5. Security Penetration Test (5 min)
# 6. Database Performance (3 min)

# Total: ~40 minutes

# Watch progress
# Terminal 2: Monitor logs
docker logs -f adisyum-app

# Terminal 3: Monitor resources
watch docker stats

# Terminal 4: Check metrics
curl http://localhost:9090/api/v1/query?query=up | jq
```

### Parallel Test Run (Faster)

**Run tests in parallel terminals:**

```bash
# Terminal 1: Tenant stress test
npm run enterprise:test-tenant-stress

# Terminal 2: Concurrency test (wait 5 min, then start)
sleep 300 && npm run enterprise:test-concurrency

# Terminal 3: WebSocket isolation (wait 10 min, then start)
sleep 600 && npm run enterprise:test-websocket-isolation

# Terminal 4: Load test (wait 15 min, then start)
sleep 900 && npm run enterprise:load-test

# Reduces from 40 min → 20 min total
```

### Individual Test Execution

```bash
# Run specific test with custom parameters
TENANT_COUNT=50 npm run enterprise:test-tenant-stress

# Custom concurrency test
CONCURRENT_ORDERS=500 CONCURRENT_PAYMENTS=100 npm run enterprise:test-concurrency

# Light load test
npm run enterprise:load-test  # 50 VUs, 300s

# Heavy load test
npm run enterprise:load-test-heavy  # 500 VUs, 600s
```

### Live Monitoring During Tests

```bash
# Terminal 1: Application logs
docker logs -f adisyum-app 2>&1 | grep -E "ERROR|WARN|tenant"

# Terminal 2: Database connections
watch -n 5 'psql postgresql://adisyum:staging-password@localhost:5432/adisyum_staging -c "SELECT count(*) FROM pg_stat_activity;"'

# Terminal 3: Redis memory
watch -n 5 'redis-cli -a staging-redis-password INFO memory | grep used_memory_human'

# Terminal 4: Prometheus queries
# Open browser: http://localhost:9090
# Query: rate(adisyum_http_requests_total[5m])
```

---

## Results Analysis

### Immediate Results

```bash
# After tests complete, check results directory
ls -lh test-results/

# You should see:
# -rw-r--r--  tenant-stress-test-2025-05-13_*.json
# -rw-r--r--  concurrency-test-2025-05-13_*.json
# -rw-r--r--  websocket-isolation-*.json
# -rw-r--r--  redis-isolation-audit-*.json
# -rw-r--r--  security-penetration-*.json
# -rw-r--r--  database-performance-*.json
```

### Generate Comprehensive Report

```bash
# Create aggregated markdown report
npm run enterprise:generate-report

# View report
ls -lh reports/

# Expected:
# reports/enterprise-test-report-2025-05-13.md

# Read in terminal
cat reports/enterprise-test-report-2025-05-13.md | less

# Or open in editor
code reports/enterprise-test-report-2025-05-13.md
```

### Extract Key Metrics

```bash
# Parse JSON results
jq '.summary' test-results/tenant-stress-test-*.json

# Get concurrency score
jq '.concurrencyScore' test-results/concurrency-test-*.json

# Check for isolation violations
jq '.summary.isolationViolations' test-results/tenant-stress-test-*.json

# Security vulnerabilities
jq '.summary.riskAssessment' test-results/security-penetration-*.json
```

### Scorecard Interpretation

```bash
# Extract all scores
jq '{
  isolation: .isolationScore,
  concurrency: .concurrencyScore, 
  security: .securityScore,
  performance: .performanceScore,
  ready: .productionReadiness
}' reports/enterprise-test-report-*.md 2>/dev/null || echo "See markdown report for scores"
```

---

## Troubleshooting

### Common Issues & Solutions

#### Issue 1: Docker Services Don't Start

```bash
# Check Docker status
docker info

# Check logs
docker-compose -f docker-compose.staging.yml logs

# Solutions:
# 1. Restart Docker daemon
docker daemon restart  # macOS
systemctl restart docker  # Linux

# 2. Clean up old containers
docker-compose -f docker-compose.staging.yml down -v
npm run enterprise:setup-staging

# 3. Check port conflicts
lsof -i :5432  # PostgreSQL
lsof -i :6379  # Redis
# Kill conflicting process: kill -9 <PID>
```

#### Issue 2: Database Connection Refused

```bash
# Verify PostgreSQL is running
docker-compose -f docker-compose.staging.yml ps postgres

# Check logs
docker logs adisyum-postgres

# Connect directly
psql postgresql://adisyum:staging-password@localhost:5432/adisyum_staging -c "SELECT 1"

# Solutions:
# 1. Restart database
docker-compose -f docker-compose.staging.yml restart postgres

# 2. Reset database (caution: deletes data)
docker-compose -f docker-compose.staging.yml down -v
npm run enterprise:setup-staging

# 3. Check network
docker network ls
docker network inspect adisyum-staging
```

#### Issue 3: Tests Timeout

```bash
# Increase timeout
REQUEST_TIMEOUT=30000 npm run enterprise:test-tenant-stress

# Reduce load
TENANT_COUNT=50 npm run enterprise:test-tenant-stress

# Check if app is responding
curl -v http://localhost:3000/api/health

# View app logs
docker logs -f adisyum-app | grep -i error
```

#### Issue 4: Out of Memory

```bash
# Check available memory
free -h
docker stats --no-stream

# Solutions:
# 1. Reduce concurrent load
CONCURRENT_TENANTS=5 npm run enterprise:test-tenant-stress

# 2. Clear Docker cache
docker system prune -a

# 3. Increase system memory (if possible)
# Or reduce test parameters
```

#### Issue 5: Redis Memory Issues

```bash
# Check Redis memory
redis-cli -a staging-redis-password INFO memory

# Clear database (careful!)
redis-cli -a staging-redis-password FLUSHDB

# Check key distribution
redis-cli -a staging-redis-password --scan | head -20

# Monitor in real-time
watch -n 1 'redis-cli -a staging-redis-password INFO memory | grep used'
```

---

## Performance Tuning

### Database Optimization

```bash
# After tests, run performance analysis
npm run enterprise:test-db-performance

# Common optimizations:

# 1. Create missing indexes
psql postgresql://adisyum:staging-password@localhost:5432/adisyum_staging << EOF
CREATE INDEX idx_orders_tenant_id ON orders(tenant_id);
CREATE INDEX idx_orders_created_at ON orders(created_at);
CREATE INDEX idx_payments_tenant_id ON payments(tenant_id);
EOF

# 2. Vacuum and analyze
psql postgresql://adisyum:staging-password@localhost:5432/adisyum_staging -c "VACUUM ANALYZE;"

# 3. Check query plans
psql postgresql://adisyum:staging-password@localhost:5432/adisyum_staging -c "EXPLAIN ANALYZE SELECT * FROM orders LIMIT 10;"
```

### Redis Optimization

```bash
# Monitor cache effectiveness
redis-cli -a staging-redis-password INFO stats

# Optimize eviction policy
redis-cli -a staging-redis-password CONFIG GET maxmemory-policy
redis-cli -a staging-redis-password CONFIG SET maxmemory-policy allkeys-lru

# Check memory fragmentation
redis-cli -a staging-redis-password INFO memory | grep fragmentation
```

### Application Optimization

```bash
# Check Node.js memory usage
docker stats adisyum-app --no-stream

# Profile next run
DEBUG=adisyum:perf npm run enterprise:test-tenant-stress

# Analyze profiling results
cat perf-*.json | jq '.sampling | length'
```

---

## Maintenance

### Regular Maintenance Tasks

```bash
# Daily: Check service health
docker-compose -f docker-compose.staging.yml ps

# Daily: Monitor logs for errors
docker logs adisyum-app 2>&1 | grep ERROR | wc -l

# Weekly: Run full test suite
npm run enterprise:run-all-tests

# Weekly: Backup test results
cp -r test-results test-results-backup-$(date +%Y%m%d)

# Monthly: Run security penetration test
npm run enterprise:test-security

# Monthly: Database maintenance
psql postgresql://adisyum:staging-password@localhost:5432/adisyum_staging -c "REINDEX DATABASE adisyum_staging;"
```

### Backup & Restore

```bash
# Backup database
docker exec adisyum-postgres pg_dump -U adisyum adisyum_staging > adisyum_backup_$(date +%Y%m%d).sql

# Backup Redis
docker exec adisyum-redis redis-cli -a staging-redis-password --rdb /data/dump.rdb

# Restore database
docker exec -i adisyum-postgres psql -U adisyum adisyum_staging < adisyum_backup_20250513.sql

# Restore Redis
docker exec adisyum-redis redis-cli -a staging-redis-password BGREWRITEAOF
```

### Log Rotation

```bash
# View current logs
docker logs adisyum-app --tail 100

# Save logs
docker logs adisyum-app > logs/app-$(date +%Y%m%d-%H%M%S).log

# Or enable auto-rotation in docker-compose
# (add logging driver config)
```

---

## Disaster Recovery

### Service Recovery

```bash
# If services crash:
docker-compose -f docker-compose.staging.yml restart

# If specific service crashes:
docker-compose -f docker-compose.staging.yml restart adisyum-app

# Full reset (warning: deletes all data)
npm run enterprise:teardown-staging
npm run enterprise:setup-staging
npm run db:migrate
npm run db:seed
```

### Data Recovery

```bash
# If database is corrupted:
# 1. Restore from backup
docker exec -i adisyum-postgres psql -U adisyum adisyum_staging < backup.sql

# 2. Or reset and reseed
docker-compose -f docker-compose.staging.yml down
docker volume rm adisyum_postgres_data
npm run enterprise:setup-staging
npm run db:seed
```

### Connection Pool Recovery

```bash
# If connection pool is exhausted:
# 1. Check active connections
psql postgresql://adisyum:staging-password@localhost:5432/adisyum_staging -c "
  SELECT * FROM pg_stat_activity WHERE datname = 'adisyum_staging';"

# 2. Kill idle connections
psql postgresql://adisyum:staging-password@localhost:5432/adisyum_staging -c "
  SELECT pg_terminate_backend(pid) 
  FROM pg_stat_activity 
  WHERE state = 'idle' AND query_start < now() - interval '1 hour';"

# 3. Restart application
docker-compose -f docker-compose.staging.yml restart adisyum-app
```

---

## Monitoring & Alerting

### Real-Time Dashboards

```bash
# Prometheus (Metrics)
# http://localhost:9090
# Queries: up, increase(rate(...)), histogram_quantile(...)

# Grafana (Visualization)
# http://localhost:3001
# Default login: admin/staging-password

# Application
# http://localhost:3000
# Check running endpoints in app logs
```

### Alert Rules

20+ alerting rules are configured in `staging_rules.yml`:

- High error rate (> 5%)
- Application down
- High response time (p99 > 1s)
- Database pool saturation
- Slow queries
- Redis memory critical
- Tenant isolation violations
- ...and more

View active alerts:
```bash
curl http://localhost:9090/api/v1/rules | jq '.data.groups[].rules[] | select(.state=="firing")'
```

---

## Production Deployment Prep

### Pre-Deployment Checklist

```bash
# ✅ Validation
- [ ] All test scores >= 90
- [ ] No critical security vulnerabilities  
- [ ] Database performs well (p95 < 500ms)
- [ ] Memory leaks not detected
- [ ] Networking stable

# ✅ Configuration
- [ ] .env.production set with real secrets
- [ ] Database credentials updated
- [ ] SSL certificates ready
- [ ] Monitoring configured

# ✅ Documentation
- [ ] Runbook created
- [ ] Incident response plan ready
- [ ] Team trained on deployment
- [ ] Rollback procedure documented

# ✅ Infrastructure
- [ ] Production servers sized
- [ ] Load balancer configured
- [ ] Backup system tested
- [ ] Monitoring alerts set
```

### Deployment Commands

```bash
# 1. Build for production
npm run build

# 2. Start with PM2 cluster
pm2 start ecosystem.config.js --env production

# 3. Verify deployment
curl https://api.adisyum.com/api/health

# 4. Monitor
pm2 logs
npm run enterprise:generate-report
```

---

## Quick Reference

```bash
# Infrastructure
npm run enterprise:setup-staging     # Start
npm run enterprise:teardown-staging  # Stop

# Testing
npm run enterprise:run-all-tests     # Full suite
npm run enterprise:test-tenant-stress
npm run enterprise:test-concurrency
npm run enterprise:load-test

# Reporting
npm run enterprise:generate-report
cat reports/enterprise-test-report-*.md

# Monitoring
docker logs -f adisyum-app
docker stats
curl http://localhost:9090  # Prometheus

# Troubleshooting  
docker-compose -f docker-compose.staging.yml logs
psql postgresql://adisyum:staging-password@localhost:5432/adisyum_staging -c "\dt"
redis-cli -a staging-redis-password INFO
```

---

*For detailed test documentation, see: `tools/enterprise-stress-test/README.md`*  
*For quick start, see: `tools/enterprise-stress-test/QUICKSTART.md`*

---

**Last Updated**: May 13, 2025  
**Version**: 1.0  
**Status**: Production Ready
