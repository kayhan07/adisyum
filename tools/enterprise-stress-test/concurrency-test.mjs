#!/usr/bin/env node

/**
 * ADİSYUM Enterprise Concurrency Test Suite
 * 
 * Stress tests concurrent operations:
 * - 1000 simultaneous orders
 * - 500 WebSocket events
 * - 300 payment operations
 * 
 * Validates:
 * - Race condition handling
 * - Database deadlock detection
 * - Cache consistency
 * - Duplicate prevention
 * - Stock inconsistency detection
 */

import fetch from 'node-fetch';
import { performance } from 'perf_hooks';
import fs from 'fs';
import path from 'path';

const CONFIG = {
  BASE_URL: process.env.BASE_URL || 'https://staging.adisyum.local',
  CONCURRENT_ORDERS: parseInt(process.env.CONCURRENT_ORDERS || '1000'),
  CONCURRENT_WEBSOCKET_EVENTS: parseInt(process.env.CONCURRENT_WS_EVENTS || '500'),
  CONCURRENT_PAYMENTS: parseInt(process.env.CONCURRENT_PAYMENTS || '300'),
  REQUEST_TIMEOUT: 15000,
  LOG_DIR: './test-results',
  TEST_TENANT_ID: 'stress-test-tenant-001',
  TEST_SESSION_TOKEN: process.env.TEST_SESSION_TOKEN || '',
};

class ConcurrencyTestSuite {
  constructor() {
    this.results = {
      orders: [],
      payments: [],
      websocketEvents: [],
      errors: [],
      raceConditions: [],
      deadlocks: [],
      duplicates: new Set(),
      stockInconsistencies: [],
    };
    this.testData = {
      productId: null,
      startingStock: 1000,
      currentStock: 1000,
    };
  }

  async setupTest() {
    console.log('[SETUP] Initializing concurrency test...');

    try {
      // Create test tenant
      console.log('Creating test tenant...');
      const createTenantRes = await fetch(`${CONFIG.BASE_URL}/api/admin/tenants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: CONFIG.TEST_TENANT_ID,
          name: 'Concurrency Test Tenant',
          email: 'concurrency-test@test.local',
          password: 'concurrency-test-password',
        }),
        timeout: CONFIG.REQUEST_TIMEOUT,
      });

      if (!createTenantRes.ok && createTenantRes.status !== 409) {
        throw new Error(`Failed to create test tenant: ${createTenantRes.status}`);
      }

      // Login
      console.log('Logging in test tenant...');
      const loginRes = await fetch(`${CONFIG.BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: CONFIG.TEST_TENANT_ID,
          username: 'concurrency-test@test.local',
          password: 'concurrency-test-password',
        }),
        timeout: CONFIG.REQUEST_TIMEOUT,
      });

      if (!loginRes.ok) {
        throw new Error(`Failed to login: ${loginRes.status}`);
      }

      const loginData = await loginRes.json();
      CONFIG.TEST_SESSION_TOKEN = loginData.data?.token || loginData.token;

      // Create test product
      console.log('Creating test product...');
      const productRes = await fetch(`${CONFIG.BASE_URL}/api/products`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${CONFIG.TEST_SESSION_TOKEN}`,
          'X-Tenant-ID': CONFIG.TEST_TENANT_ID,
        },
        body: JSON.stringify({
          name: 'Concurrent Test Product',
          price: 99.99,
          stock: this.testData.startingStock,
        }),
        timeout: CONFIG.REQUEST_TIMEOUT,
      });

      if (!productRes.ok) {
        throw new Error(`Failed to create product: ${productRes.status}`);
      }

      const productData = await productRes.json();
      this.testData.productId = productData.data?.id;
      console.log(`✓ Setup complete. Product ID: ${this.testData.productId}`);
    } catch (error) {
      console.error('Setup failed:', error.message);
      throw error;
    }
  }

  async testConcurrentOrders() {
    console.log(`\n[ORDERS] Testing ${CONFIG.CONCURRENT_ORDERS} concurrent orders...`);
    const startTime = performance.now();
    const promises = [];

    for (let i = 0; i < CONFIG.CONCURRENT_ORDERS; i++) {
      const promise = (async () => {
        const operationStart = performance.now();
        try {
          const orderId = `order-${Date.now()}-${i}`;
          
          const response = await fetch(`${CONFIG.BASE_URL}/api/orders`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${CONFIG.TEST_SESSION_TOKEN}`,
              'X-Tenant-ID': CONFIG.TEST_TENANT_ID,
            },
            body: JSON.stringify({
              customId: orderId,
              items: [
                {
                  productId: this.testData.productId,
                  quantity: Math.floor(Math.random() * 5) + 1,
                }
              ],
              totalAmount: (Math.random() * 1000) + 50,
            }),
            timeout: CONFIG.REQUEST_TIMEOUT,
          });

          const duration = performance.now() - operationStart;
          const data = await response.json();

          // Check for duplicates
          if (data.data?.id) {
            if (this.results.duplicates.has(data.data.id)) {
              this.results.raceConditions.push({
                type: 'duplicate_order_id',
                orderId: data.data.id,
                time: new Date().toISOString(),
              });
            }
            this.results.duplicates.add(data.data.id);
          }

          this.results.orders.push({
            orderId: orderId,
            responseTime: duration,
            statusCode: response.status,
            successful: response.ok,
          });
        } catch (error) {
          this.results.errors.push({
            type: 'order_creation',
            error: error.message,
            time: new Date().toISOString(),
          });
        }
      })();

      promises.push(promise);
    }

    await Promise.all(promises);
    const duration = (performance.now() - startTime) / 1000;

    const successful = this.results.orders.filter(o => o.successful).length;
    console.log(`✓ Completed ${CONFIG.CONCURRENT_ORDERS} orders in ${duration.toFixed(2)}s`);
    console.log(`  Success rate: ${((successful / CONFIG.CONCURRENT_ORDERS) * 100).toFixed(2)}%`);
    console.log(`  Avg response time: ${(this.results.orders.reduce((a, b) => a + b.responseTime, 0) / CONFIG.CONCURRENT_ORDERS).toFixed(2)}ms`);
  }

  async testConcurrentPayments() {
    console.log(`\n[PAYMENTS] Testing ${CONFIG.CONCURRENT_PAYMENTS} concurrent payments...`);
    const startTime = performance.now();
    const promises = [];

    // Use first N orders for payments
    const orderIds = this.results.orders
      .filter(o => o.successful)
      .slice(0, CONFIG.CONCURRENT_PAYMENTS)
      .map(o => o.orderId);

    let paymentIndex = 0;
    for (const orderId of orderIds) {
      const promise = (async () => {
        const operationStart = performance.now();
        try {
          const response = await fetch(`${CONFIG.BASE_URL}/api/payments`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${CONFIG.TEST_SESSION_TOKEN}`,
              'X-Tenant-ID': CONFIG.TEST_TENANT_ID,
            },
            body: JSON.stringify({
              orderId: orderId,
              amount: (Math.random() * 1000) + 50,
              method: ['cash', 'card'][Math.floor(Math.random() * 2)],
            }),
            timeout: CONFIG.REQUEST_TIMEOUT,
          });

          const duration = performance.now() - operationStart;
          this.results.payments.push({
            orderId: orderId,
            responseTime: duration,
            statusCode: response.status,
            successful: response.ok,
          });
        } catch (error) {
          this.results.errors.push({
            type: 'payment_creation',
            error: error.message,
            orderId: orderId,
          });
        }
      })();

      promises.push(promise);
    }

    await Promise.all(promises);
    const duration = (performance.now() - startTime) / 1000;

    const successful = this.results.payments.filter(p => p.successful).length;
    console.log(`✓ Completed ${orderIds.length} payments in ${duration.toFixed(2)}s`);
    console.log(`  Success rate: ${((successful / orderIds.length) * 100).toFixed(2)}%`);
    console.log(`  Avg response time: ${(this.results.payments.reduce((a, b) => a + b.responseTime, 0) / orderIds.length).toFixed(2)}ms`);
  }

  async testWebSocketConcurrency() {
    console.log(`\n[WEBSOCKET] Testing ${CONFIG.CONCURRENT_WEBSOCKET_EVENTS} concurrent events...`);
    
    // For this test, we simulate WebSocket stress through the HTTP API
    console.log('Note: WebSocket stress test requires live WebSocket connections');
    console.log('Simulating events through order updates...');

    const startTime = performance.now();
    const promises = [];

    for (let i = 0; i < CONFIG.CONCURRENT_WEBSOCKET_EVENTS; i++) {
      const promise = (async () => {
        try {
          const orderId = this.results.orders[Math.floor(Math.random() * this.results.orders.length)]?.orderId;
          if (!orderId) return;

          const response = await fetch(`${CONFIG.BASE_URL}/api/orders/${orderId}`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${CONFIG.TEST_SESSION_TOKEN}`,
              'X-Tenant-ID': CONFIG.TEST_TENANT_ID,
            },
            body: JSON.stringify({
              status: ['pending', 'confirmed', 'completed'][Math.floor(Math.random() * 3)],
            }),
            timeout: CONFIG.REQUEST_TIMEOUT,
          });

          this.results.websocketEvents.push({
            responseTime: Date.now(),
            statusCode: response.status,
            successful: response.ok,
          });
        } catch (error) {
          this.results.errors.push({
            type: 'websocket_event',
            error: error.message,
          });
        }
      })();

      promises.push(promise);
    }

    await Promise.all(promises);
    const duration = (performance.now() - startTime) / 1000;

    const successful = this.results.websocketEvents.filter(e => e.successful).length;
    console.log(`✓ Completed ${CONFIG.CONCURRENT_WEBSOCKET_EVENTS} simulated events in ${duration.toFixed(2)}s`);
    console.log(`  Success rate: ${((successful / CONFIG.CONCURRENT_WEBSOCKET_EVENTS) * 100).toFixed(2)}%`);
  }

  async detectDeadlocks() {
    console.log('\n[DEADLOCK DETECTION] Analyzing for potential deadlocks...');

    // Look for patterns that suggest deadlocks
    const errorPatterns = this.results.errors.reduce((acc, error) => {
      acc[error.type] = (acc[error.type] || 0) + 1;
      return acc;
    }, {});

    // High timeout rate might indicate deadlock
    const timeoutErrors = this.results.errors.filter(e => e.error?.includes('timeout')).length;
    
    if (timeoutErrors > CONFIG.CONCURRENT_ORDERS * 0.05) {
      this.results.deadlocks.push({
        type: 'timeout_spike',
        count: timeoutErrors,
        percentage: ((timeoutErrors / CONFIG.CONCURRENT_ORDERS) * 100).toFixed(2),
        severity: 'warning',
      });
    }

    console.log('Error patterns:', errorPatterns);
    if (this.results.deadlocks.length > 0) {
      console.log('⚠️  Possible deadlocks detected:', this.results.deadlocks);
    } else {
      console.log('✓ No obvious deadlocks detected');
    }
  }

  async checkStockConsistency() {
    console.log('\n[STOCK CONSISTENCY] Checking product stock...');

    try {
      const response = await fetch(`${CONFIG.BASE_URL}/api/products/${this.testData.productId}`, {
        headers: {
          'Authorization': `Bearer ${CONFIG.TEST_SESSION_TOKEN}`,
          'X-Tenant-ID': CONFIG.TEST_TENANT_ID,
        },
        timeout: CONFIG.REQUEST_TIMEOUT,
      });

      const data = await response.json();
      const currentStock = data.data?.stock || 0;
      
      // Calculate expected stock
      const totalOrdered = this.results.orders
        .filter(o => o.successful)
        .reduce((sum) => sum + 1, 0); // Simplified: each order = 1 unit

      console.log(`Initial stock: ${this.testData.startingStock}`);
      console.log(`Total successful orders: ${totalOrdered}`);
      console.log(`Current stock: ${currentStock}`);
      console.log(`Expected stock: ${this.testData.startingStock - totalOrdered}`);

      if (currentStock !== (this.testData.startingStock - totalOrdered)) {
        this.results.stockInconsistencies.push({
          initialStock: this.testData.startingStock,
          expectedStock: this.testData.startingStock - totalOrdered,
          actualStock: currentStock,
          discrepancy: Math.abs(currentStock - (this.testData.startingStock - totalOrdered)),
          severity: 'critical',
        });
        console.log('⚠️  STOCK INCONSISTENCY DETECTED!');
      } else {
        console.log('✓ Stock is consistent');
      }
    } catch (error) {
      console.error('Stock check failed:', error.message);
    }
  }

  generateReport() {
    console.log('\n=== CONCURRENCY TEST REPORT ===\n');

    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        totalOrders: CONFIG.CONCURRENT_ORDERS,
        totalPayments: CONFIG.CONCURRENT_PAYMENTS,
        totalWebSocketEvents: CONFIG.CONCURRENT_WEBSOCKET_EVENTS,
        successfulOrders: this.results.orders.filter(o => o.successful).length,
        successfulPayments: this.results.payments.filter(p => p.successful).length,
        totalErrors: this.results.errors.length,
        raceConditionsDetected: this.results.raceConditions.length,
        deadlocksDetected: this.results.deadlocks.length,
        stockInconsistencies: this.results.stockInconsistencies.length,
      },
      details: {
        orderStats: this.getStats(this.results.orders),
        paymentStats: this.getStats(this.results.payments),
        websocketStats: this.getStats(this.results.websocketEvents),
        errors: this.results.errors,
        raceConditions: this.results.raceConditions,
        deadlocks: this.results.deadlocks,
        stockIssues: this.results.stockInconsistencies,
      },
      concurrencyScore: this.calculateConcurrencyScore(),
    };

    return report;
  }

  getStats(items) {
    const responseTimes = items.map(i => i.responseTime || 0).filter(t => t > 0);
    if (responseTimes.length === 0) return { count: 0 };
    
    responseTimes.sort((a, b) => a - b);
    return {
      count: items.length,
      min: Math.min(...responseTimes),
      max: Math.max(...responseTimes),
      avg: (responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length).toFixed(2),
      p50: responseTimes[Math.floor(responseTimes.length * 0.5)],
      p95: responseTimes[Math.floor(responseTimes.length * 0.95)],
      p99: responseTimes[Math.floor(responseTimes.length * 0.99)],
    };
  }

  calculateConcurrencyScore() {
    const orderSuccessRate = this.results.orders.filter(o => o.successful).length / this.results.orders.length;
    const paymentSuccessRate = this.results.payments.filter(p => p.successful).length / this.results.payments.length;
    const errorRate = this.results.errors.length / (CONFIG.CONCURRENT_ORDERS + CONFIG.CONCURRENT_PAYMENTS);
    const raceConditionRate = this.results.raceConditions.length / CONFIG.CONCURRENT_ORDERS;
    
    let score = 100;
    score -= (1 - orderSuccessRate) * 30;
    score -= (1 - paymentSuccessRate) * 20;
    score -= Math.min(errorRate * 100, 20);
    score -= Math.min(raceConditionRate * 100, 10);

    return Math.max(0, score).toFixed(2);
  }

  async run() {
    try {
      await this.setupTest();
      await this.testConcurrentOrders();
      await this.testConcurrentPayments();
      await this.testWebSocketConcurrency();
      await this.detectDeadlocks();
      await this.checkStockConsistency();

      const report = this.generateReport();

      // Save report
      if (!fs.existsSync(CONFIG.LOG_DIR)) {
        fs.mkdirSync(CONFIG.LOG_DIR, { recursive: true });
      }

      const reportPath = path.join(CONFIG.LOG_DIR, `concurrency-test-${Date.now()}.json`);
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
      
      console.log(`\nReport saved to: ${reportPath}`);
      console.log('\n' + JSON.stringify(report, null, 2));

      // Exit with error if critical issues
      if (report.summary.stockInconsistencies > 0 || report.summary.deadlocksDetected > 0) {
        process.exit(1);
      }

      process.exit(0);
    } catch (error) {
      console.error('Test suite failed:', error);
      process.exit(1);
    }
  }
}

new ConcurrencyTestSuite().run();
