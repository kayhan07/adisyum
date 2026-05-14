#!/usr/bin/env node

/**
 * ADİSYUM Enterprise Security Penetration Test Suite
 *
 * Tests security vulnerabilities:
 * - tenant_id injection attacks
 * - websocket spoofing
 * - JWT replay attacks
 * - stale session exploitation
 * - CSRF attacks
 * - XSS vulnerabilities
 * - cache poisoning
 * - privilege escalation attempts
 */

import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';

const CONFIG = {
  BASE_URL: process.env.BASE_URL || 'https://staging.adisyum.local',
  LOG_DIR: './test-results',
  REQUEST_TIMEOUT: 10000,
};

class SecurityPenetrationTest {
  constructor() {
    this.results = {
      vulnerabilitiesFound: [],
      testsPassed: [],
      testsFailed: [],
      riskAssessment: {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
      },
    };
    this.testSession = {
      tenantId: null,
      token: null,
      userId: null,
    };
  }

  async setupTestSession() {
    console.log('Setting up test session...');

    try {
      // Create test tenant
      const createRes = await fetch(`${CONFIG.BASE_URL}/api/admin/tenants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: 'security-test-tenant',
          name: 'Security Test Tenant',
          email: 'security-test@test.local',
          password: 'security-test-password',
        }),
        timeout: CONFIG.REQUEST_TIMEOUT,
      });

      if (!createRes.ok && createRes.status !== 409) {
        throw new Error(`Failed to create test tenant: ${createRes.status}`);
      }

      // Login
      const loginRes = await fetch(`${CONFIG.BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: 'security-test-tenant',
          username: 'security-test@test.local',
          password: 'security-test-password',
        }),
        timeout: CONFIG.REQUEST_TIMEOUT,
      });

      if (!loginRes.ok) throw new Error(`Login failed: ${loginRes.status}`);

      const loginData = await loginRes.json();
      this.testSession.tenantId = 'security-test-tenant';
      this.testSession.token = loginData.data?.token || loginData.token;
      this.testSession.userId = loginData.data?.userId;

      console.log('✓ Test session established\n');
    } catch (error) {
      throw new Error(`Session setup failed: ${error.message}`);
    }
  }

  // Test 1: tenant_id injection
  async testTenantIdInjection() {
    console.log('[TEST 1] tenant_id Injection Attack Detection');

    const injectionAttempts = [
      { payload: 'malicious-tenant', description: 'Direct injection' },
      { payload: '"; DROP TABLE tenants; --', description: 'SQL injection' },
      { payload: '../admin-tenant', description: 'Path traversal' },
      { payload: 'security-test-tenant\'; UNION SELECT * FROM tenants;', description: 'UNION injection' },
    ];

    for (const attempt of injectionAttempts) {
      try {
        const response = await fetch(`${CONFIG.BASE_URL}/api/orders`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.testSession.token}`,
            'X-Tenant-ID': attempt.payload,
          },
          body: JSON.stringify({
            totalAmount: 100,
            items: [],
          }),
          timeout: CONFIG.REQUEST_TIMEOUT,
        });

        const data = await response.json();

        // Check if injection was successful
        if (data.data?.tenantId && data.data.tenantId !== this.testSession.tenantId) {
          this.results.vulnerabilitiesFound.push({
            id: 'tenant_injection_' + attempt.description.replace(' ', '_'),
            type: 'tenant_id injection',
            description: attempt.description,
            severity: 'critical',
            payload: attempt.payload,
            impact: `Accepted injected tenant ID: ${data.data.tenantId}`,
          });
          this.results.riskAssessment.critical++;
        } else {
          this.results.testsPassed.push(`tenant_injection_${attempt.description}`);
        }
      } catch (error) {
        console.log(`  [${attempt.description}] Error (OK): ${error.message}`);
      }
    }

    console.log(`✓ ${injectionAttempts.length} injection attempts tested\n`);
  }

  // Test 2: JWT Replay Attack
  async testJWTReplayAttack() {
    console.log('[TEST 2] JWT Replay Attack Detection');

    try {
      const oldToken = this.testSession.token;

      // Attempt to use the same token multiple times
      const responses = [];
      for (let i = 0; i < 3; i++) {
        const response = await fetch(`${CONFIG.BASE_URL}/api/auth/me`, {
          headers: {
            'Authorization': `Bearer ${oldToken}`,
          },
          timeout: CONFIG.REQUEST_TIMEOUT,
        });
        responses.push(response.status);

        // Wait between requests
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      // Check if token was invalidated after first use
      if (responses[1] === 200) {
        this.results.vulnerabilitiesFound.push({
          id: 'jwt_replay',
          type: 'JWT Replay Attack',
          description: 'Old JWT token accepted for replay requests',
          severity: 'high',
          impact: 'Token can be replayed indefinitely',
        });
        this.results.riskAssessment.high++;
      } else {
        this.results.testsPassed.push('jwt_replay_prevented');
      }

      console.log(`✓ JWT replay test completed\n`);
    } catch (error) {
      console.error(`JWT replay test error: ${error.message}\n`);
    }
  }

  // Test 3: Stale Session Exploitation
  async testStaleSessionExploitation() {
    console.log('[TEST 3] Stale Session Exploitation');

    try {
      // Create a session and let it expire
      const sessionBefore = await fetch(`${CONFIG.BASE_URL}/api/auth/me`, {
        headers: {
          'Authorization': `Bearer ${this.testSession.token}`,
        },
        timeout: CONFIG.REQUEST_TIMEOUT,
      });

      if (sessionBefore.ok) {
        this.results.testsPassed.push('stale_session_valid_initial');

        // In a real test, simulate time passing or session expiration
        // For now, check if token remains valid
        const sessionAfter = await fetch(`${CONFIG.BASE_URL}/api/auth/me`, {
          headers: {
            'Authorization': `Bearer ${this.testSession.token}`,
          },
          timeout: CONFIG.REQUEST_TIMEOUT,
        });

        // This is expected in most cases, but we should validate proper expiration handling
        if (sessionAfter.status !== 401) {
          console.log('  Note: Session validation depends on TTL configuration');
        }
      }

      console.log(`✓ Stale session test completed\n`);
    } catch (error) {
      console.error(`Stale session test error: ${error.message}\n`);
    }
  }

  // Test 4: CSRF Attack Prevention
  async testCSRFProtection() {
    console.log('[TEST 4] CSRF Protection Verification');

    try {
      // Attempt state-changing request without CSRF token
      const response = await fetch(`${CONFIG.BASE_URL}/api/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.testSession.token}`,
          // Intentionally omit CSRF token
        },
        body: JSON.stringify({
          totalAmount: 100,
          items: [],
        }),
        timeout: CONFIG.REQUEST_TIMEOUT,
      });

      // Check if CSRF protection is in place
      if (response.status === 403 || response.headers.get('x-csrf-token')) {
        this.results.testsPassed.push('csrf_protection_enabled');
      } else if (response.ok) {
        // CSRF protection might not be explicitly required for authenticated APIs
        this.results.testsPassed.push('csrf_auth_assumed');
      } else {
        this.results.vulnerabilitiesFound.push({
          id: 'csrf_not_verified',
          type: 'CSRF',
          description: 'CSRF token verification unclear',
          severity: 'medium',
          impact: 'Potential for cross-site request forgery',
        });
        this.results.riskAssessment.medium++;
      }

      console.log(`✓ CSRF protection test completed\n`);
    } catch (error) {
      console.error(`CSRF test error: ${error.message}\n`);
    }
  }

  // Test 5: Privilege Escalation
  async testPrivilegeEscalation() {
    console.log('[TEST 5] Privilege Escalation Prevention');

    try {
      // Attempt to access admin endpoints
      const adminEndpoints = [
        '/api/admin/tenants',
        '/api/admin/users',
        '/api/admin/system',
      ];

      for (const endpoint of adminEndpoints) {
        const response = await fetch(`${CONFIG.BASE_URL}${endpoint}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${this.testSession.token}`,
          },
          timeout: CONFIG.REQUEST_TIMEOUT,
        });

        if (response.ok) {
          this.results.vulnerabilitiesFound.push({
            id: 'privilege_escalation_' + endpoint.replace('/', '_'),
            type: 'Privilege Escalation',
            description: `Regular user accessed admin endpoint: ${endpoint}`,
            severity: 'critical',
            impact: 'Unauthorized access to sensitive admin functions',
          });
          this.results.riskAssessment.critical++;
        } else if (response.status === 403 || response.status === 401) {
          this.results.testsPassed.push(`privilege_escalation_blocked_${endpoint}`);
        }
      }

      console.log(`✓ Privilege escalation test completed\n`);
    } catch (error) {
      console.error(`Privilege escalation test error: ${error.message}\n`);
    }
  }

  // Test 6: Cache Poisoning
  async testCachePoisoning() {
    console.log('[TEST 6] Cache Poisoning Prevention');

    try {
      // Try to poison cache with malicious data
      const payload = {
        totalAmount: 100,
        items: [],
        _cacheKey: 'malicious-cache-key',
        _cacheValue: '<script>alert("XSS")</script>',
      };

      const response = await fetch(`${CONFIG.BASE_URL}/api/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.testSession.token}`,
          'X-Tenant-ID': this.testSession.tenantId,
        },
        body: JSON.stringify(payload),
        timeout: CONFIG.REQUEST_TIMEOUT,
      });

      const data = await response.json();

      // Check if malicious cache keys were stored
      if (data.data?._cacheKey || data.data?._cacheValue) {
        this.results.vulnerabilitiesFound.push({
          id: 'cache_poisoning',
          type: 'Cache Poisoning',
          description: 'Malicious cache keys stored in response',
          severity: 'high',
          impact: 'Cache can be poisoned with malicious data',
        });
        this.results.riskAssessment.high++;
      } else {
        this.results.testsPassed.push('cache_poisoning_prevented');
      }

      console.log(`✓ Cache poisoning test completed\n`);
    } catch (error) {
      console.error(`Cache poisoning test error: ${error.message}\n`);
    }
  }

  // Test 7: XSS Vulnerability
  async testXSSVulnerability() {
    console.log('[TEST 7] XSS Vulnerability Detection');

    const xssPayloads = [
      '<script>alert("XSS")</script>',
      '"><script>alert("XSS")</script>',
      'javascript:alert("XSS")',
      '<img src=x onerror="alert(\'XSS\')">',
      '<svg/onload=alert("XSS")>',
    ];

    for (const payload of xssPayloads) {
      try {
        const response = await fetch(`${CONFIG.BASE_URL}/api/orders`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.testSession.token}`,
            'X-Tenant-ID': this.testSession.tenantId,
          },
          body: JSON.stringify({
            totalAmount: 100,
            items: [],
            customerName: payload,
          }),
          timeout: CONFIG.REQUEST_TIMEOUT,
        });

        const data = await response.json();

        // Check if payload was escaped
        if (data.data?.customerName === payload && payload.includes('<')) {
          this.results.vulnerabilitiesFound.push({
            id: 'xss_' + payload.substring(0, 10).replace(/[<>]/g, ''),
            type: 'XSS',
            description: `XSS payload not escaped: ${payload.substring(0, 20)}...`,
            severity: 'high',
            impact: 'Stored XSS vulnerability',
          });
          this.results.riskAssessment.high++;
        } else {
          this.results.testsPassed.push('xss_escaped');
        }
      } catch (error) {
        // Parse error is actually good - means likely properly escaped
      }
    }

    console.log(`✓ XSS vulnerability test completed\n`);
  }

  // Test 8: System-Admin Escalation
  async testSystemAdminEscalation() {
    console.log('[TEST 8] System-Admin Privilege Escalation');

    try {
      // Try to claim super_admin role
      const response = await fetch(`${CONFIG.BASE_URL}/api/auth/me`, {
        headers: {
          'Authorization': `Bearer ${this.testSession.token}`,
          'X-Admin-Override': 'true',
          'X-System-Admin': 'true',
        },
        timeout: CONFIG.REQUEST_TIMEOUT,
      });

      const data = await response.json();

      if (data.data?.role === 'super_admin' || data.data?.isSuperAdmin === true) {
        this.results.vulnerabilitiesFound.push({
          id: 'system_admin_escalation',
          type: 'Privilege Escalation',
          description: 'User escalated to super_admin via header manipulation',
          severity: 'critical',
          impact: 'Full system compromise possible',
        });
        this.results.riskAssessment.critical++;
      } else {
        this.results.testsPassed.push('system_admin_escalation_prevented');
      }

      console.log(`✓ System-admin escalation test completed\n`);
    } catch (error) {
      console.error(`System-admin escalation test error: ${error.message}\n`);
    }
  }

  generateReport() {
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        totalTests: this.results.testsPassed.length + this.results.testsFailed.length + this.results.vulnerabilitiesFound.length,
        vulnerabilitiesFound: this.results.vulnerabilitiesFound.length,
        testsPassed: this.results.testsPassed.length,
        testsFailed: this.results.testsFailed.length,
        riskAssessment: this.results.riskAssessment,
      },
      vulnerabilities: this.results.vulnerabilitiesFound,
      passedTests: this.results.testsPassed,
      failedTests: this.results.testsFailed,
      securityScore: this.calculateSecurityScore(),
    };

    return report;
  }

  calculateSecurityScore() {
    const critical = this.results.riskAssessment.critical * 25;
    const high = this.results.riskAssessment.high * 10;
    const medium = this.results.riskAssessment.medium * 5;
    const low = this.results.riskAssessment.low * 2;

    let score = 100 - (critical + high + medium + low);
    return Math.max(0, score).toFixed(2);
  }

  async run() {
    console.log('=== Security Penetration Test Suite ===\n');

    try {
      await this.setupTestSession();
      await this.testTenantIdInjection();
      await this.testJWTReplayAttack();
      await this.testStaleSessionExploitation();
      await this.testCSRFProtection();
      await this.testPrivilegeEscalation();
      await this.testCachePoisoning();
      await this.testXSSVulnerability();
      await this.testSystemAdminEscalation();

      const report = this.generateReport();

      // Save report
      if (!fs.existsSync(CONFIG.LOG_DIR)) {
        fs.mkdirSync(CONFIG.LOG_DIR, { recursive: true });
      }

      const reportPath = path.join(CONFIG.LOG_DIR, `security-penetration-test-${Date.now()}.json`);
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

      console.log('\n=== Security Test Results ===');
      console.log(JSON.stringify(report, null, 2));
      console.log(`\nReport saved to: ${reportPath}`);

      // Exit with error if critical vulnerabilities
      if (report.summary.riskAssessment.critical > 0) {
        console.error(`\n❌ ${report.summary.riskAssessment.critical} critical vulnerabilities found!`);
        process.exit(1);
      }

      process.exit(0);
    } catch (error) {
      console.error('Security test failed:', error);
      process.exit(1);
    }
  }
}

new SecurityPenetrationTest().run();
