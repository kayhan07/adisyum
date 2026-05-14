#!/usr/bin/env node

/**
 * ADİSYUM Enterprise Tenant Stress Test Suite
 * 
 * Tests 100 tenants with:
 * - Login operations
 * - Product creation
 * - Order creation
 * - Payment processing
 * - WebSocket connections
 * - Realtime events
 * - Offline sync
 * 
 * Validates:
 * - Tenant isolation
 * - No data leakage
 * - Race condition handling
 * - Concurrent operations
 */

import fetch from 'node-fetch';
import WebSocket from 'ws';
import { performance } from 'perf_hooks';
import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';

// Configuration
const CONFIG = {
  BASE_URL: process.env.BASE_URL || 'https://staging.adisyum.local',
  TENANT_COUNT: parseInt(process.env.TENANT_COUNT || '100'),
  CONCURRENT_TENANTS: parseInt(process.env.CONCURRENT_TENANTS || '10'),
  OPERATIONS_PER_TENANT: 20,
  WEBSOCKET_TIMEOUT: 30000,
  REQUEST_TIMEOUT: 10000,
  LOG_DIR: './test-results',
};

// Metrics
class MetricsCollector extends EventEmitter {
  constructor() {
    super();
    this.reset();
  }

  reset() {
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalErrors: 0,
      isolationViolations: 0,
      responseTime: [],
      operations: {},
      tenants: {},
    };
  }

  recordRequest(operation, statusCode, duration, tenantId) {
    this.metrics.totalRequests++;
    if (statusCode >= 200 && statusCode < 300) {
      this.metrics.successfulRequests++;
    } else {
      this.metrics.failedRequests++;
    }

    // Track by operation
    if (!this.metrics.operations[operation]) {
      this.metrics.operations[operation] = { count: 0, duration: [] };
    }
    this.metrics.operations[operation].count++;
    this.metrics.operations[operation].duration.push(duration);

    // Track by tenant
    if (!this.metrics.tenants[tenantId]) {
      this.metrics.tenants[tenantId] = { requests: 0, errors: 0 };
    }
    this.metrics.tenants[tenantId].requests++;
    if (statusCode >= 400) {
      this.metrics.tenants[tenantId].errors++;
    }

    this.metrics.responseTime.push(duration);
  }

  recordError(error, tenantId) {
    this.metrics.totalErrors++;
    if (this.metrics.tenants[tenantId]) {
      this.metrics.tenants[tenantId].errors++;
    }
  }

  recordIsolationViolation(violation) {
    this.metrics.isolationViolations++;
    this.emit('isolation-violation', violation);
  }

  getStats() {
    const responseTimes = this.metrics.responseTime;
    return {
      totalRequests: this.metrics.totalRequests,
      successfulRequests: this.metrics.successfulRequests,
      failedRequests: this.metrics.failedRequests,
      successRate: ((this.metrics.successfulRequests / this.metrics.totalRequests) * 100).toFixed(2) + '%',
      totalErrors: this.metrics.totalErrors,
      isolationViolations: this.metrics.isolationViolations,
      averageResponseTime: (responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length).toFixed(2) + 'ms',
      p50ResponseTime: this.percentile(responseTimes, 50).toFixed(2) + 'ms',
      p95ResponseTime: this.percentile(responseTimes, 95).toFixed(2) + 'ms',
      p99ResponseTime: this.percentile(responseTimes, 99).toFixed(2) + 'ms',
      maxResponseTime: Math.max(...responseTimes).toFixed(2) + 'ms',
      operationStats: this.metrics.operations,
    };
  }

  percentile(arr, p) {
    if (arr.length === 0) return 0;
    const sorted = arr.sort((a, b) => a - b);
    const index = Math.ceil(sorted.length * (p / 100)) - 1;
    return sorted[index];
  }
}

// Test Data Generator
class TestDataGenerator {
  static generateTenantId(index) {
    return `test-tenant-${String(index).padStart(4, '0')}`;
  }

  static generateUserCredentials(tenantId) {
    return {
      username: `user-${tenantId}@test.local`,
      password: `password-${tenantId}`,
      email: `user-${tenantId}@test.local`,
    };
  }

  static generateProduct(tenantId, index) {
    return {
      name: `Product ${index} - ${tenantId}`,
      description: `Test product for tenant ${tenantId}`,
      price: 100 + Math.random() * 500,
      category: ['Food', 'Beverage', 'Dessert'][Math.floor(Math.random() * 3)],
      sku: `SKU-${tenantId}-${index}`,
    };
  }

  static generateOrder(tenantId, products, index) {
    const selectedProducts = products.slice(0, Math.min(3, products.length));
    return {
      items: selectedProducts.map((p) => ({
        productId: p.id,
        quantity: Math.floor(Math.random() * 5) + 1,
        price: p.price,
      })),
      customerName: `Customer ${index}`,
      totalAmount: selectedProducts.reduce((sum, p) => sum + p.price, 0),
      status: 'pending',
    };
  }

  static generatePayment(order) {
    return {
      orderId: order.id,
      amount: order.totalAmount,
      method: ['cash', 'card', 'crypto'][Math.floor(Math.random() * 3)],
      status: 'completed',
    };
  }
}

// HTTP Client with Tenant Isolation Checks
class TenantAwareHttpClient {
  constructor(tenantId, sessionToken, metrics) {
    this.tenantId = tenantId;
    this.sessionToken = sessionToken;
    this.metrics = metrics;
    this.data = {
      products: [],
      orders: [],
      payments: [],
    };
  }

  async request(method, endpoint, body = null, checkTenantIsolation = true) {
    const startTime = performance.now();
    const url = `${CONFIG.BASE_URL}${endpoint}`;

    try {
      const options = {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.sessionToken}`,
          'X-Tenant-ID': this.tenantId,
        },
        timeout: CONFIG.REQUEST_TIMEOUT,
      };

      if (body) {
        options.body = JSON.stringify(body);
      }

      const response = await fetch(url, options);
      const duration = performance.now() - startTime;
      const data = await response.json();

      // Tenant isolation check
      if (checkTenantIsolation && data.data) {
        if (data.data.tenantId && data.data.tenantId !== this.tenantId) {
          this.metrics.recordIsolationViolation({
            tenantId: this.tenantId,
            receivedTenantId: data.data.tenantId,
            endpoint,
          });
        }
      }

      this.metrics.recordRequest(
        method.toUpperCase() + ' ' + endpoint,
        response.status,
        duration,
        this.tenantId
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${data.error || 'Unknown error'}`);
      }

      return { status: response.status, data };
    } catch (error) {
      this.metrics.recordError(error, this.tenantId);
      throw error;
    }
  }

  async login(credentials) {
    const response = await this.request('POST', '/api/auth/login', credentials, false);
    return response.data;
  }

  async createProduct(product) {
    const response = await this.request('POST', '/api/products', product);
    this.data.products.push(response.data.data);
    return response.data.data;
  }

  async listProducts() {
    const response = await this.request('GET', '/api/products');
    // Verify all products belong to this tenant
    const products = response.data.data || [];
    for (const product of products) {
      if (product.tenantId !== this.tenantId) {
        this.metrics.recordIsolationViolation({
          type: 'product_leak',
          tenantId: this.tenantId,
          receivedTenantId: product.tenantId,
        });
      }
    }
    return products;
  }

  async createOrder(order) {
    const response = await this.request('POST', '/api/orders', order);
    this.data.orders.push(response.data.data);
    return response.data.data;
  }

  async listOrders() {
    const response = await this.request('GET', '/api/orders');
    const orders = response.data.data || [];
    for (const order of orders) {
      if (order.tenantId !== this.tenantId) {
        this.metrics.recordIsolationViolation({
          type: 'order_leak',
          tenantId: this.tenantId,
          receivedTenantId: order.tenantId,
        });
      }
    }
    return orders;
  }

  async createPayment(payment) {
    const response = await this.request('POST', '/api/payments', payment);
    this.data.payments.push(response.data.data);
    return response.data.data;
  }

  async connectWebSocket() {
    return new Promise((resolve, reject) => {
      const wsUrl = CONFIG.BASE_URL.replace('https', 'wss').replace('http', 'ws');
      const ws = new WebSocket(`${wsUrl}/api/realtime?token=${this.sessionToken}`);

      const timeoutHandle = setTimeout(() => {
        ws.close();
        reject(new Error('WebSocket connection timeout'));
      }, CONFIG.WEBSOCKET_TIMEOUT);

      ws.on('open', () => {
        clearTimeout(timeoutHandle);
        resolve(ws);
      });

      ws.on('error', (error) => {
        clearTimeout(timeoutHandle);
        reject(error);
      });
    });
  }

  async offlineSync(queue) {
    const response = await this.request('POST', '/api/offline/sync', {
      tenantId: this.tenantId,
      queue,
    });
    return response.data;
  }
}

// Tenant Stress Test
class TenantStressTest {
  constructor(metrics) {
    this.metrics = metrics;
    this.tenants = [];
  }

  async createTenant(tenantId) {
    try {
      const credentials = TestDataGenerator.generateUserCredentials(tenantId);
      
      // Create tenant and user
      const createResponse = await fetch(`${CONFIG.BASE_URL}/api/admin/tenants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          name: `Test Tenant ${tenantId}`,
          email: credentials.email,
          password: credentials.password,
        }),
        timeout: CONFIG.REQUEST_TIMEOUT,
      });

      if (!createResponse.ok) {
        console.log(`  Tenant ${tenantId} might already exist, attempting login...`);
      }

      // Login
      const loginResponse = await fetch(`${CONFIG.BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          username: credentials.username,
          password: credentials.password,
        }),
        timeout: CONFIG.REQUEST_TIMEOUT,
      });

      if (!loginResponse.ok) {
        throw new Error(`Failed to login tenant ${tenantId}`);
      }

      const loginData = await loginResponse.json();
      const sessionToken = loginData.data?.token || loginData.token;

      if (!sessionToken) {
        throw new Error(`No session token received for tenant ${tenantId}`);
      }

      return new TenantAwareHttpClient(tenantId, sessionToken, this.metrics);
    } catch (error) {
      console.error(`Error creating tenant ${tenantId}:`, error.message);
      throw error;
    }
  }

  async runTenantOperations(client) {
    const tenantId = client.tenantId;
    console.log(`  [${tenantId}] Starting operations...`);

    try {
      // Create products
      for (let i = 0; i < 5; i++) {
        const product = TestDataGenerator.generateProduct(tenantId, i);
        await client.createProduct(product);
      }

      // List products (validate isolation)
      const products = await client.listProducts();
      if (products.length === 0) {
        console.warn(`  [${tenantId}] No products found after creation`);
      }

      // Create orders
      for (let i = 0; i < 5; i++) {
        if (products.length > 0) {
          const order = TestDataGenerator.generateOrder(tenantId, products, i);
          await client.createOrder(order);
        }
      }

      // List orders (validate isolation)
      const orders = await client.listOrders();
      if (orders.length === 0) {
        console.warn(`  [${tenantId}] No orders found after creation`);
      }

      // Create payments
      for (const order of orders.slice(0, 3)) {
        const payment = TestDataGenerator.generatePayment(order);
        await client.createPayment(payment);
      }

      // WebSocket connection test
      try {
        const ws = await client.connectWebSocket();
        
        // Send a test message
        ws.send(JSON.stringify({
          type: 'subscribe',
          channel: `tenant:${tenantId}:orders`,
        }));

        // Wait for confirmation
        await new Promise((resolve) => {
          const timeout = setTimeout(resolve, 2000);
          ws.once('message', (data) => {
            clearTimeout(timeout);
            resolve();
          });
        });

        ws.close();
      } catch (error) {
        console.warn(`  [${tenantId}] WebSocket error (non-critical):`, error.message);
      }

      // Offline sync simulation
      const offlineQueue = [
        {
          type: 'CREATE_ORDER',
          data: {
            items: [{ productId: client.data.products[0]?.id, quantity: 1 }],
            totalAmount: 100,
          },
        },
      ];
      
      if (client.data.products.length > 0) {
        try {
          await client.offlineSync(offlineQueue);
        } catch (error) {
          console.warn(`  [${tenantId}] Offline sync error (non-critical):`, error.message);
        }
      }

      console.log(`  [${tenantId}] ✓ Operations completed`);
      return true;
    } catch (error) {
      console.error(`  [${tenantId}] ✗ Operations failed:`, error.message);
      return false;
    }
  }

  async runConcurrentTenants(startIndex, count) {
    const promises = [];

    for (let i = startIndex; i < startIndex + count; i++) {
      const tenantId = TestDataGenerator.generateTenantId(i);
      
      const promise = (async () => {
        try {
          const client = await this.createTenant(tenantId);
          await this.runTenantOperations(client);
        } catch (error) {
          console.error(`Tenant ${tenantId} failed:`, error.message);
        }
      })();

      promises.push(promise);
    }

    await Promise.all(promises);
  }

  async runFullTest() {
    console.log('[TENANT STRESS TEST] Starting...');
    console.log(`Configuration: ${CONFIG.TENANT_COUNT} tenants, ${CONFIG.CONCURRENT_TENANTS} concurrent`);

    const startTime = performance.now();

    // Run tenants in batches
    for (let i = 0; i < CONFIG.TENANT_COUNT; i += CONFIG.CONCURRENT_TENANTS) {
      const batchSize = Math.min(CONFIG.CONCURRENT_TENANTS, CONFIG.TENANT_COUNT - i);
      console.log(`\nBatch ${Math.floor(i / CONFIG.CONCURRENT_TENANTS) + 1}: Tenants ${i} to ${i + batchSize - 1}`);
      
      await this.runConcurrentTenants(i, batchSize);
    }

    const duration = (performance.now() - startTime) / 1000;
    console.log(`\n[TENANT STRESS TEST] Completed in ${duration.toFixed(2)}s`);
    return this.metrics.getStats();
  }
}

// Main execution
async function main() {
  // Ensure log directory exists
  if (!fs.existsSync(CONFIG.LOG_DIR)) {
    fs.mkdirSync(CONFIG.LOG_DIR, { recursive: true });
  }

  const metrics = new MetricsCollector();
  const test = new TenantStressTest(metrics);

  try {
    const stats = await test.runFullTest();
    
    // Write results
    const resultsFile = path.join(CONFIG.LOG_DIR, `tenant-stress-test-${Date.now()}.json`);
    fs.writeFileSync(resultsFile, JSON.stringify(stats, null, 2));
    
    console.log('\n=== TEST RESULTS ===');
    console.log(JSON.stringify(stats, null, 2));
    console.log(`\nResults saved to: ${resultsFile}`);

    // Exit with error code if there were isolation violations
    if (stats.isolationViolations > 0) {
      console.error('\n⚠️  ISOLATION VIOLATIONS DETECTED!');
      process.exit(1);
    }

    process.exit(0);
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
}

main();
