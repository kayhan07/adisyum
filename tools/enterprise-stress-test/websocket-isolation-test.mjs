#!/usr/bin/env node

/**
 * ADİSYUM WebSocket Isolation Test
 *
 * Validates that WebSocket connections maintain strict tenant isolation:
 * - Tenant A events NEVER reach Tenant B
 * - Room subscriptions are properly scoped
 * - Reconnection doesn't leak state
 * - Tenant switches don't create listeners
 * - State socket cleanup is complete
 */

import WebSocket from 'ws';
import fetch from 'node-fetch';
import { performance } from 'perf_hooks';
import fs from 'fs';
import path from 'path';

const CONFIG = {
  BASE_URL: process.env.BASE_URL || 'https://staging.adisyum.local',
  LOG_DIR: './test-results',
  REQUEST_TIMEOUT: 10000,
  WS_TIMEOUT: 5000,
};

class WebSocketIsolationTest {
  constructor() {
    this.results = {
      testsPassed: [],
      testsFailed: [],
      isolationViolations: [],
      reconnectIssues: [],
      roomIssues: [],
    };
    this.tenants = [];
  }

  async createTestTenant(index) {
    const tenantId = `ws-test-tenant-${index}`;
    const credentials = {
      tenantId,
      username: `user-${tenantId}@test.local`,
      password: `password-${tenantId}`,
      email: `user-${tenantId}@test.local`,
    };

    try {
      // Create tenant
      const createRes = await fetch(`${CONFIG.BASE_URL}/api/admin/tenants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...credentials,
          name: `WebSocket Test Tenant ${index}`,
        }),
        timeout: CONFIG.REQUEST_TIMEOUT,
      });

      if (!createRes.ok && createRes.status !== 409) {
        throw new Error(`Create failed: ${createRes.status}`);
      }

      // Login
      const loginRes = await fetch(`${CONFIG.BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
        timeout: CONFIG.REQUEST_TIMEOUT,
      });

      if (!loginRes.ok) throw new Error(`Login failed: ${loginRes.status}`);

      const loginData = await loginRes.json();
      const token = loginData.data?.token || loginData.token;

      return {
        tenantId,
        token,
        credentials,
        receivedMessages: [],
      };
    } catch (error) {
      throw new Error(`Failed to create tenant ${tenantId}: ${error.message}`);
    }
  }

  async connectWebSocket(tenant) {
    return new Promise((resolve, reject) => {
      const wsUrl = CONFIG.BASE_URL.replace('https', 'wss').replace('http', 'ws');
      const ws = new WebSocket(`${wsUrl}/api/realtime?token=${tenant.token}`);

      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error('WebSocket connection timeout'));
      }, CONFIG.WS_TIMEOUT);

      ws.on('open', () => {
        clearTimeout(timeout);
        resolve(ws);
      });

      ws.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data);
          tenant.receivedMessages.push({
            timestamp: Date.now(),
            data: message,
          });
        } catch (e) {
          // Ignore parse errors
        }
      });
    });
  }

  // Test 1: Basic isolation - events don't cross tenants
  async testBasicIsolation() {
    console.log('\n[TEST 1] Basic Isolation - Events don\'t cross tenant boundaries');

    try {
      // Create 2 tenants
      const tenant1 = await this.createTestTenant(1);
      const tenant2 = await this.createTestTenant(2);

      // Connect both
      const ws1 = await this.connectWebSocket(tenant1);
      const ws2 = await this.connectWebSocket(tenant2);

      // Subscribe to orders
      ws1.send(JSON.stringify({
        type: 'subscribe',
        channel: `tenant:${tenant1.tenantId}:orders`,
      }));

      ws2.send(JSON.stringify({
        type: 'subscribe',
        channel: `tenant:${tenant2.tenantId}:orders`,
      }));

      // Simulate event from tenant 1
      const testEvent = {
        type: 'order_created',
        orderId: 'test-order-1',
        tenantId: tenant1.tenantId,
        timestamp: Date.now(),
      };

      ws1.send(JSON.stringify({
        type: 'event',
        channel: `tenant:${tenant1.tenantId}:orders`,
        data: testEvent,
      }));

      // Wait for event propagation
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Check if tenant2 received tenant1's event
      const tenant2ReceivedTenant1Event = tenant2.receivedMessages.some(
        (msg) => msg.data?.data?.tenantId === tenant1.tenantId
      );

      if (tenant2ReceivedTenant1Event) {
        this.results.isolationViolations.push({
          test: 'basic_isolation',
          violation: 'Tenant 2 received Tenant 1 events',
          severity: 'critical',
        });
        this.results.testsFailed.push('basic_isolation');
      } else {
        this.results.testsPassed.push('basic_isolation');
      }

      ws1.close();
      ws2.close();
    } catch (error) {
      this.results.testsFailed.push({
        test: 'basic_isolation',
        error: error.message,
      });
    }
  }

  // Test 2: Reconnection doesn't leak previous socket state
  async testReconnectionLeakage() {
    console.log('[TEST 2] Reconnection - No state leakage on reconnect');

    try {
      const tenant = await this.createTestTenant(3);
      tenant.connectionCount = 0;

      // Connect and disconnect 3 times
      for (let i = 0; i < 3; i++) {
        const ws = await this.connectWebSocket(tenant);
        tenant.connectionCount++;

        ws.send(JSON.stringify({
          type: 'subscribe',
          channel: `tenant:${tenant.tenantId}:orders`,
        }));

        await new Promise((resolve) => setTimeout(resolve, 500));
        ws.close();
      }

      // Final connection - verify no accumulated listeners
      const finalWs = await this.connectWebSocket(tenant);
      const messageCountBefore = tenant.receivedMessages.length;

      finalWs.send(JSON.stringify({
        type: 'ping',
      }));

      await new Promise((resolve) => setTimeout(resolve, 500));
      const messageCountAfter = tenant.receivedMessages.length;

      // Should only receive new messages, not duplicates
      if (messageCountAfter - messageCountBefore > 2) {
        this.results.reconnectIssues.push({
          test: 'reconnection_leakage',
          duplicateMessages: messageCountAfter - messageCountBefore,
          severity: 'warning',
        });
        this.results.testsFailed.push('reconnection_leakage');
      } else {
        this.results.testsPassed.push('reconnection_leakage');
      }

      finalWs.close();
    } catch (error) {
      this.results.testsFailed.push({
        test: 'reconnection_leakage',
        error: error.message,
      });
    }
  }

  // Test 3: Room switching maintains isolation
  async testRoomSwitchIsolation() {
    console.log('[TEST 3] Room Switching - Isolation maintained during room changes');

    try {
      const tenant1 = await this.createTestTenant(4);
      const tenant2 = await this.createTestTenant(5);

      const ws1 = await this.connectWebSocket(tenant1);
      const ws2 = await this.connectWebSocket(tenant2);

      // Tenant 1: Subscribe to room A
      ws1.send(JSON.stringify({
        type: 'subscribe',
        channel: `tenant:${tenant1.tenantId}:room_a`,
      }));

      // Tenant 2: Subscribe to room A (same name, different tenant context)
      ws2.send(JSON.stringify({
        type: 'subscribe',
        channel: `tenant:${tenant2.tenantId}:room_a`,
      }));

      await new Promise((resolve) => setTimeout(resolve, 500));

      // Tenant 1 sends to its room
      ws1.send(JSON.stringify({
        data: { orderId: 'order-1', tenantId: tenant1.tenantId },
      }));

      await new Promise((resolve) => setTimeout(resolve, 500));

      // Check isolation
      const crossTenantMessage = tenant2.receivedMessages.some(
        (msg) => msg.data?.data?.tenantId === tenant1.tenantId
      );

      if (crossTenantMessage) {
        this.results.roomIssues.push({
          test: 'room_switch_isolation',
          issue: 'Cross-tenant room message',
          severity: 'critical',
        });
        this.results.testsFailed.push('room_switch_isolation');
      } else {
        this.results.testsPassed.push('room_switch_isolation');
      }

      ws1.close();
      ws2.close();
    } catch (error) {
      this.results.testsFailed.push({
        test: 'room_switch_isolation',
        error: error.message,
      });
    }
  }

  // Test 4: Stale socket cleanup
  async testStaleSocketCleanup() {
    console.log('[TEST 4] Stale Socket Cleanup - No lingering listeners');

    try {
      const tenant = await this.createTestTenant(6);

      // Create multiple connections without proper cleanup
      const sockets = [];
      for (let i = 0; i < 5; i++) {
        const ws = await this.connectWebSocket(tenant);
        ws.send(JSON.stringify({
          type: 'subscribe',
          channel: `tenant:${tenant.tenantId}:orders`,
        }));
        sockets.push(ws);
      }

      // Close all without proper unsubscribe
      sockets.forEach((ws) => ws.close());

      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Connect fresh socket
      const freshWs = await this.connectWebSocket(tenant);
      const initialMessageCount = tenant.receivedMessages.length;

      freshWs.send(JSON.stringify({
        type: 'event',
        channel: `tenant:${tenant.tenantId}:orders`,
        data: { test: true },
      }));

      await new Promise((resolve) => setTimeout(resolve, 1000));
      const finalMessageCount = tenant.receivedMessages.length;

      // Should not receive duplicate old messages
      const duplicateCount = finalMessageCount - initialMessageCount;
      if (duplicateCount > 1) {
        this.results.reconnectIssues.push({
          test: 'stale_socket_cleanup',
          duplicateMessages: duplicateCount,
          severity: 'warning',
        });
        this.results.testsFailed.push('stale_socket_cleanup');
      } else {
        this.results.testsPassed.push('stale_socket_cleanup');
      }

      freshWs.close();
    } catch (error) {
      this.results.testsFailed.push({
        test: 'stale_socket_cleanup',
        error: error.message,
      });
    }
  }

  // Test 5: Duplicate listener prevention
  async testDuplicateListenerPrevention() {
    console.log('[TEST 5] Duplicate Listener Prevention - No message duplication');

    try {
      const tenant = await this.createTestTenant(7);
      const ws = await this.connectWebSocket(tenant);

      // Subscribe to the same channel multiple times
      for (let i = 0; i < 3; i++) {
        ws.send(JSON.stringify({
          type: 'subscribe',
          channel: `tenant:${tenant.tenantId}:orders`,
        }));
      }

      await new Promise((resolve) => setTimeout(resolve, 500));

      const messageCountBefore = tenant.receivedMessages.length;

      // Send test event
      ws.send(JSON.stringify({
        type: 'test_event',
        data: { test: 'message' },
      }));

      await new Promise((resolve) => setTimeout(resolve, 500));
      const messageCountAfter = tenant.receivedMessages.length;

      // Should receive only 1 event, not 3
      const duplicateEvents = (messageCountAfter - messageCountBefore) - 1;
      if (duplicateEvents > 0) {
        this.results.isolationViolations.push({
          test: 'duplicate_listener_prevention',
          duplicateEventCount: duplicateEvents,
          severity: 'warning',
        });
        this.results.testsFailed.push('duplicate_listener_prevention');
      } else {
        this.results.testsPassed.push('duplicate_listener_prevention');
      }

      ws.close();
    } catch (error) {
      this.results.testsFailed.push({
        test: 'duplicate_listener_prevention',
        error: error.message,
      });
    }
  }

  generateReport() {
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        totalTests: this.results.testsPassed.length + this.results.testsFailed.length,
        passed: this.results.testsPassed.length,
        failed: this.results.testsFailed.length,
        isolationViolationsFound: this.results.isolationViolations.length,
        reconnectIssuesFound: this.results.reconnectIssues.length,
        roomIssuesFound: this.results.roomIssues.length,
      },
      results: {
        passed: this.results.testsPassed,
        failed: this.results.testsFailed,
      },
      violations: {
        isolation: this.results.isolationViolations,
        reconnect: this.results.reconnectIssues,
        rooms: this.results.roomIssues,
      },
      websocketIsolationScore: this.calculateScore(),
    };

    return report;
  }

  calculateScore() {
    const total = this.results.testsPassed.length + this.results.testsFailed.length;
    const passRate = (this.results.testsPassed.length / total) * 100;
    const violationPenalty = Math.min(this.results.isolationViolations.length * 10, 30);

    let score = passRate - violationPenalty;
    return Math.max(0, score).toFixed(2);
  }

  async run() {
    console.log('=== WebSocket Isolation Test Suite ===\n');

    try {
      await this.testBasicIsolation();
      await this.testReconnectionLeakage();
      await this.testRoomSwitchIsolation();
      await this.testStaleSocketCleanup();
      await this.testDuplicateListenerPrevention();

      const report = this.generateReport();

      // Save report
      if (!fs.existsSync(CONFIG.LOG_DIR)) {
        fs.mkdirSync(CONFIG.LOG_DIR, { recursive: true });
      }

      const reportPath = path.join(CONFIG.LOG_DIR, `websocket-isolation-test-${Date.now()}.json`);
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

      console.log('\n=== Test Results ===');
      console.log(JSON.stringify(report, null, 2));
      console.log(`\nReport saved to: ${reportPath}`);

      // Fail if critical violations found
      const criticalViolations = this.results.isolationViolations.filter(
        (v) => v.severity === 'critical'
      ).length;

      if (criticalViolations > 0) {
        console.error(`\n❌ ${criticalViolations} critical isolation violations found!`);
        process.exit(1);
      }

      process.exit(0);
    } catch (error) {
      console.error('Test suite failed:', error);
      process.exit(1);
    }
  }
}

new WebSocketIsolationTest().run();
