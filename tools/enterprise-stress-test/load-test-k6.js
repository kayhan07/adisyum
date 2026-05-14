import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate, Trend, Counter, Gauge } from 'k6/metrics';

/**
 * ADİSYUM Enterprise Load Test
 * 
 * k6 load test script for enterprise stress testing
 * 
 * Run with:
 * k6 run tools/enterprise-stress-test/load-test-k6.js \
 *   --vus 100 \
 *   --duration 60s \
 *   --rps 1000 \
 *   -e BASE_URL=https://staging.adisyum.local \
 *   -e TENANT_ID=load-test-tenant
 */

// Metrics
const loginFailureRate = new Rate('login_failure_rate');
const orderCreationTime = new Trend('order_creation_time', { isTime: true });
const paymentProcessingTime = new Trend('payment_processing_time', { isTime: true });
const productListingTime = new Trend('product_listing_time', { isTime: true });
const websocketConnectTime = new Trend('websocket_connect_time', { isTime: true });
const errorRate = new Rate('error_rate');
const successfulOrders = new Counter('successful_orders');
const failedOrders = new Counter('failed_orders');
const successRate = new Gauge('success_rate');

// Configuration
const BASE_URL = __ENV.BASE_URL || 'https://staging.adisyum.local';
const TENANT_ID = __ENV.TENANT_ID || 'load-test-tenant';
const TEST_USER_EMAIL = `user-${TENANT_ID}@test.local`;
const TEST_USER_PASSWORD = `password-${TENANT_ID}`;

// Load test options
export const options = {
  vus: parseInt(__ENV.VUS || '10'),
  duration: __ENV.DURATION || '60s',

  // Stages for ramping up/down load
  stages: [
    { duration: '30s', target: parseInt(__ENV.VUS || '10') }, // Ramp up
    { duration: '60s', target: parseInt(__ENV.VUS || '10') }, // Stay at peak
    { duration: '30s', target: 0 }, // Ramp down
  ],

  thresholds: {
    'http_req_duration': ['p(95)<500', 'p(99)<1000'],
    'http_req_failed': ['rate<0.1'],
    'login_failure_rate': ['rate<0.05'],
    'error_rate': ['rate<0.1'],
  },

  ext: {
    loadimpact: {
      projectID: parseInt(__ENV.LOAD_IMPACT_PROJECT_ID || '0'),
      name: 'ADİSYUM Enterprise Load Test',
    },
  },
};

let sessionToken = null;
let products = [];
let orders = [];

// Setup: Create test tenant and get session
export function setup() {
  console.log('Setting up load test...');

  // Create tenant
  let res = http.post(`${BASE_URL}/api/admin/tenants`, JSON.stringify({
    tenantId: TENANT_ID,
    name: `Load Test Tenant`,
    email: TEST_USER_EMAIL,
    password: TEST_USER_PASSWORD,
  }), {
    headers: { 'Content-Type': 'application/json' },
    timeout: '30s',
  });

  if (res.status !== 201 && res.status !== 409) {
    console.error('Failed to create test tenant:', res.status, res.body);
  }

  // Login
  res = http.post(`${BASE_URL}/api/auth/login`, JSON.stringify({
    tenantId: TENANT_ID,
    username: TEST_USER_EMAIL,
    password: TEST_USER_PASSWORD,
  }), {
    headers: { 'Content-Type': 'application/json' },
    timeout: '30s',
  });

  check(res, {
    'login success': (r) => r.status === 200,
  });

  const data = JSON.parse(res.body);
  const token = data.data?.token || data.token;

  // Create test products
  for (let i = 0; i < 10; i++) {
    const productRes = http.post(`${BASE_URL}/api/products`, JSON.stringify({
      name: `Load Test Product ${i}`,
      price: 50 + Math.random() * 450,
      stock: 10000,
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'X-Tenant-ID': TENANT_ID,
      },
      timeout: '30s',
    });

    if (productRes.status === 201 || productRes.status === 200) {
      const productData = JSON.parse(productRes.body);
      products.push(productData.data);
    }
  }

  console.log(`Setup complete. Created ${products.length} products.`);

  return {
    token: token,
    products: products,
  };
}

export default function (data) {
  const token = data.token;
  const testProducts = data.products;

  group('Authentication', () => {
    let res = http.get(`${BASE_URL}/api/auth/me`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      timeout: '10s',
    });

    check(res, {
      'get user info': (r) => r.status === 200,
    }) || loginFailureRate.add(1);

    sleep(1);
  });

  group('Product Operations', () => {
    // List products
    let start = new Date();
    let res = http.get(`${BASE_URL}/api/products`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-Tenant-ID': TENANT_ID,
      },
      timeout: '10s',
    });

    productListingTime.add(new Date() - start);

    check(res, {
      'product list success': (r) => r.status === 200,
      'product list has items': (r) => JSON.parse(r.body).data?.length > 0,
    }) || errorRate.add(1);

    sleep(1);
  });

  group('Order Operations', () => {
    if (testProducts.length > 0) {
      const product = testProducts[Math.floor(Math.random() * testProducts.length)];

      // Create order
      let start = new Date();
      let res = http.post(`${BASE_URL}/api/orders`, JSON.stringify({
        items: [
          {
            productId: product.id,
            quantity: Math.floor(Math.random() * 5) + 1,
          }
        ],
        totalAmount: product.price * (Math.floor(Math.random() * 5) + 1),
      }), {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'X-Tenant-ID': TENANT_ID,
        },
        timeout: '10s',
      });

      orderCreationTime.add(new Date() - start);

      const orderCreated = check(res, {
        'order creation success': (r) => r.status === 201 || r.status === 200,
      });

      if (orderCreated) {
        successfulOrders.add(1);
      } else {
        failedOrders.add(1);
        errorRate.add(1);
      }

      // Parse order ID from response
      if (res.status === 201 || res.status === 200) {
        const orderData = JSON.parse(res.body);
        if (orderData.data?.id) {
          orders.push(orderData.data.id);

          // Process payment
          group('Payment Operations', () => {
            let paymentStart = new Date();
            let paymentRes = http.post(`${BASE_URL}/api/payments`, JSON.stringify({
              orderId: orderData.data.id,
              amount: orderData.data.totalAmount || 100,
              method: 'card',
            }), {
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
                'X-Tenant-ID': TENANT_ID,
              },
              timeout: '10s',
            });

            paymentProcessingTime.add(new Date() - paymentStart);

            check(paymentRes, {
              'payment success': (r) => r.status === 200 || r.status === 201,
            }) || errorRate.add(1);
          });
        }
      }
    }

    sleep(2);
  });

  group('Reporting', () => {
    let res = http.get(`${BASE_URL}/api/reports/summary`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-Tenant-ID': TENANT_ID,
      },
      timeout: '10s',
    });

    check(res, {
      'report generation success': (r) => r.status === 200 || r.status === 206,
    }) || errorRate.add(1);

    sleep(1);
  });

  // Calculate success rate
  const totalRequests = successfulOrders.value + failedOrders.value;
  if (totalRequests > 0) {
    successRate.set((successfulOrders.value / totalRequests) * 100);
  }

  sleep(Math.random() * 3);
}

// Teardown: Cleanup
export function teardown(data) {
  console.log('Tearing down load test...');
  console.log(`Total orders created: ${orders.length}`);
}

// Custom summary
export function handleSummary(data) {
  return {
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
    '/tmp/load-test-summary.json': JSON.stringify(data),
  };
}

function textSummary(data, options) {
  let summary = '\n=== Load Test Summary ===\n\n';

  // Metrics summary
  const metrics = data.metrics;

  for (const [metricName, metric] of Object.entries(metrics)) {
    summary += `${metricName}:\n`;

    if (metric.values) {
      for (const [key, value] of Object.entries(metric.values)) {
        summary += `  ${key}: ${value}\n`;
      }
    }
  }

  // Thresholds summary
  if (data.thresholds) {
    summary += '\nThreshold Results:\n';
    for (const [threshold, result] of Object.entries(data.thresholds)) {
      const status = result.ok ? '✓' : '✗';
      summary += `  ${status} ${threshold}: ${result.ok ? 'PASSED' : 'FAILED'}\n`;
    }
  }

  return summary;
}
