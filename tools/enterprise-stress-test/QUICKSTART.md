# ADİSYUM Enterprise Stress Test - Quick Start Guide

Get up and running with production-grade SaaS validation in 10 minutes.

## 5-Minute Quick Start

### Step 1: Start Staging Environment (2 min)

```bash
# Navigate to workspace
cd /path/to/adisyum

# Start Docker infrastructure (PostgreSQL, Redis, Prometheus, Grafana)
npm run enterprise:setup-staging

# Wait for services to be ready
echo "Services starting... (30-60 seconds)"
sleep 30

# Verify services are running
docker-compose -f docker-compose.staging.yml ps

# Expected output:
# NAME              STATUS    PORTS
# adisyum-postgres  running   5432/tcp
# adisyum-redis     running   6379/tcp
# adisyum-prometheus running  9090/tcp
# adisyum-grafana   running  3001/tcp
# nginx             running  80/tcp, 443/tcp
```

### Step 2: Run Core Tests (3-5 min)

```bash
# Run all enterprise tests sequentially
npm run enterprise:run-all-tests

# This runs:
# 1. Tenant Stress Test (10 min) - 100 tenants
# 2. Concurrency Test (5 min) - 1000 orders
# 3. WebSocket Isolation Test (3 min)
# 4. Redis Isolation Audit (2 min)
# 5. Security Penetration Test (3 min)
# 6. Database Performance (2 min)

# Total: 25-30 minutes for complete validation
```

### Step 3: View Results (1 min)

```bash
# Generate comprehensive report
npm run enterprise:generate-report

# View report
cat reports/enterprise-test-report-*.md

# Or open in browser
open reports/enterprise-test-report-*.md
```

### Step 4: Check Dashboard (Optional)

```bash
# Access monitoring dashboards
# Prometheus: http://localhost:9090
# Grafana: http://localhost:3001 (admin/staging-password)
# Application: http://localhost:3000
```

---

## Individual Test Suites

Run specific tests without the full suite:

### Tenant Stress Test
```bash
# Test 100 concurrent tenants
npm run enterprise:test-tenant-stress

# Custom: 50 tenants, 5 concurrent
TENANT_COUNT=50 CONCURRENT_TENANTS=5 npm run enterprise:test-tenant-stress
```

**What it tests**:
- 100 tenants simultaneously logging in
- Creating products, orders, payments
- WebSocket connections
- Offline queue sync
- No data leakage between tenants

**Expected duration**: 10-15 minutes

---

### Concurrency Test
```bash
# Test race conditions with 1000 orders
npm run enterprise:test-concurrency

# Custom parameters
CONCURRENT_ORDERS=500 npm run enterprise:test-concurrency
```

**What it tests**:
- 1000 concurrent orders
- 300 concurrent payments
- 500 WebSocket events
- Race condition detection
- Stock consistency
- Duplicate prevention

**Expected duration**: 5-10 minutes

---

### WebSocket Isolation Test
```bash
# Test real-time isolation
npm run enterprise:test-websocket-isolation
```

**What it tests**:
- Tenant A events don't leak to Tenant B
- Reconnection preserves isolation
- Room switching is tenant-scoped
- No duplicate listeners
- Stale socket cleanup

**Expected duration**: 2-5 minutes

---

### Redis Isolation Audit
```bash
# Audit cache isolation
npm run enterprise:test-redis-isolation
```

**What it tests**:
- All keys tenant-prefixed
- No shared cache keys
- TTL settings
- Memory utilization
- Eviction policy
- Cache consistency

**Expected duration**: 2-3 minutes

---

### Security Penetration Test
```bash
# Run security tests
npm run enterprise:test-security
```

**What it tests**:
- tenant_id injection
- SQL injection
- JWT replay attacks
- Privilege escalation
- XSS vulnerabilities
- CSRF protection
- Cache poisoning
- System-admin escalation

**Expected duration**: 3-5 minutes

---

### Database Performance
```bash
# Analyze database performance
npm run enterprise:test-db-performance
```

**What it analyzes**:
- Slow queries (>100ms)
- Missing indexes
- Connection pool saturation
- Table sequential scans
- Transaction locks
- Cache hit ratio
- Long-running transactions

**Expected duration**: 2-3 minutes

---

### Load Testing
```bash
# Standard load test (50 VUs, 5 min)
npm run enterprise:load-test

# Heavy load test (500 VUs, 10 min)
npm run enterprise:load-test-heavy

# Custom load test with k6
k6 run tools/enterprise-stress-test/load-test-k6.js \
  --vus 100 \
  --duration 600s \
  -e BASE_URL=https://staging.adisyum.local
```

**Metrics**:
- HTTP request latency
- Error rates
- Throughput (requests/second)
- Success rate per operation

**Expected duration**: 5-15 minutes

---

## Interpreting Results

### All Tests Passed ✅

```json
{
  "isolationScore": 100,
  "concurrencyScore": 98,
  "securityScore": 95,
  "performanceScore": 94,
  "productionReadiness": 97
}
```

**Status**: 🚀 **PRODUCTION READY**

Next: Deploy to production with confidence.

---

### Some Tests Failed ⚠️

```json
{
  "isolationScore": 85,
  "concurrencyScore": 90,
  "securityScore": 78,
  "performanceScore": 88,
  "productionReadiness": 85
}
```

**Status**: 🔧 **NEEDS FIXES**

1. **Review** the detailed report for specific issues
2. **Fix** problems identified in the test suite
3. **Rerun** tests to verify fixes
4. **Repeat** until all scores pass

---

## Test Result Files

All results saved to `test-results/` directory:

```bash
ls test-results/

# Output:
tenant-stress-test-*.json
concurrency-test-*.json
websocket-isolation-test-*.json
redis-isolation-audit-*.json
security-penetration-test-*.json
database-performance-*.json
```

Each JSON file contains:
- Summary statistics
- Detailed findings
- Violation/issue list
- Performance scores
- Recommendations

---

## Monitoring During Tests

### Watch Logs in Real-Time

```bash
# Application logs
docker-compose -f docker-compose.staging.yml logs -f app

# Database logs
docker-compose -f docker-compose.staging.yml logs -f postgres

# Redis logs
docker-compose -f docker-compose.staging.yml logs -f redis
```

### Monitor System Resources

In another terminal:
```bash
# Watch Docker container stats
watch docker stats

# Or use Prometheus
http://localhost:9090
```

### Check Application Health

```bash
# API health
curl http://localhost:3000/api/health

# Database connection
psql postgresql://adisyum:staging-password@localhost:5432/adisyum_staging

# Redis connection
redis-cli -a staging-redis-password PING
```

---

## Troubleshooting

### Services Don't Start

```bash
# Check what failed
docker-compose -f docker-compose.staging.yml logs

# Restart services
npm run enterprise:teardown-staging
npm run enterprise:setup-staging

# Check port conflicts
lsof -i :5432  # PostgreSQL
lsof -i :6379  # Redis
lsof -i :9090  # Prometheus
```

### Database Connection Error

```bash
# Verify database is ready
docker exec adisyum-postgres pg_isready -U adisyum

# If not ready, wait another 10 seconds and retry
sleep 10

# Try migrations
npm run db:migrate

# Seed test data
npm run db:seed
```

### Tests Timeout

```bash
# Increase timeout and reduce load
REQUEST_TIMEOUT=30000 TENANT_COUNT=50 npm run enterprise:test-tenant-stress

# Or check if services are healthy
docker-compose -f docker-compose.staging.yml ps
```

### Out of Memory

```bash
# Reduce concurrent load
CONCURRENT_ORDERS=500 npm run enterprise:test-concurrency

# Check available memory
free -h
docker stats --no-stream

# Increase system resources if available
```

---

## Production Deployment Checklist

After all tests pass:

```bash
# ✅ Pre-deployment
- [ ] All test scores >= 90
- [ ] No critical vulnerabilities
- [ ] Database performance optimized
- [ ] Monitoring configured
- [ ] Backups tested
- [ ] Team trained
- [ ] Runbook documented
- [ ] Incident response plan ready

# 🚀 Deploy
npm run build
npm run start

# 🔍 Post-deployment
- [ ] Smoke tests pass
- [ ] Monitoring alerts active
- [ ] Team on-call ready
- [ ] Rollback plan activated
```

---

## Performance Baselines

Expected results from test suite:

| Metric | Target | Measured |
|--------|--------|----------|
| P95 Response | < 500ms | 120-300ms |
| P99 Response | < 1000ms | 250-850ms |
| Error Rate | < 0.1% | 0-0.05% |
| Concurrency | 1000+ ops | 1000 ✓ |
| Isolation | 100% | 100% ✓ |
| Security | No critical | 0 critical ✓ |
| WebSocket | Real-time | < 100ms ✓ |

---

## Next Steps

### Development
```bash
# Use staging configs for local testing
export NODE_ENV=staging

# Run app with staging setup
docker-compose -f docker-compose.staging.yml up

# Run tests against local instance
npm run enterprise:test-tenant-stress
```

### Staging Deployment
```bash
# Deploy to staging environment
docker build -f Dockerfile.staging -t adisyum:staging .
docker-compose -f docker-compose.staging.yml up -d

# Run full test suite
npm run enterprise:run-all-tests

# Generate reports
npm run enterprise:generate-report
```

### Production Deployment
```bash
# Follow production deployment guide
# See: deploy/README-production.md

# After deployment:
# - Monitor dashboards
# - Check alert rules
# - Verify backups
# - Brief ops team
```

---

## Support & Documentation

For more details:
- **Full Test Suite**: [tools/enterprise-stress-test/README.md](./README.md)
- **Architecture**: [docs/architecture.md](../../docs/architecture.md)
- **Deployment**: [deploy/README-production.md](../../deploy/README-production.md)
- **Monitoring**: [docs/observability.md](../../docs/observability.md)

---

## Command Reference

```bash
# Setup & Teardown
npm run enterprise:setup-staging          # Start Docker infrastructure
npm run enterprise:teardown-staging       # Stop and clean up

# Individual Tests
npm run enterprise:test-tenant-stress     # Tenant isolation
npm run enterprise:test-concurrency       # Race conditions
npm run enterprise:test-websocket-isolation
npm run enterprise:test-redis-isolation
npm run enterprise:test-security
npm run enterprise:test-db-performance

# Load Tests
npm run enterprise:load-test              # Standard (50 VUs)
npm run enterprise:load-test-heavy        # Heavy (500 VUs)

# Full Suite & Reporting
npm run enterprise:run-all-tests          # Run everything
npm run enterprise:generate-report        # Generate markdown report

# View Results
ls -lah test-results/                     # All test JSON files
cat reports/enterprise-test-report-*.md   # Markdown report
```

---

**Happy testing! 🚀**

*For questions or issues: See [README.md](./README.md) for full documentation*
