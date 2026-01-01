// Main application entry point
import { initializeDatabase } from './lib/db/index.ts';
import { SubscriptionService } from './lib/services/subscription.ts';
import { UsageService } from './lib/services/usage.ts';

// Initialize database on startup
initializeDatabase();

const server = Bun.serve({
  port: process.env.PORT || 3000,

  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;

    // Enable CORS for development
    const headers = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      return new Response(null, { headers });
    }

    try {
      // API Routes
      if (path.startsWith('/api')) {
        // GET /api/subscriptions - List all subscriptions
        if (path === '/api/subscriptions' && req.method === 'GET') {
          const subscriptions = SubscriptionService.getAllSubscriptions();
          return new Response(JSON.stringify(subscriptions), { headers });
        }

        // GET /api/subscriptions/stats - Get overall stats
        if (path === '/api/subscriptions/stats' && req.method === 'GET') {
          const monthlyTotal = SubscriptionService.getMonthlyTotal();
          const yearlyTotal = SubscriptionService.getYearlyTotal();
          const subscriptions = SubscriptionService.getActiveSubscriptions();

          return new Response(JSON.stringify({
            monthlyTotal,
            yearlyTotal,
            activeCount: subscriptions.length,
          }), { headers });
        }

        // GET /api/subscriptions/:id - Get subscription by ID
        const getMatch = path.match(/^\/api\/subscriptions\/([^\/]+)$/);
        if (getMatch && req.method === 'GET') {
          const subscription = SubscriptionService.getSubscriptionById(getMatch[1]);
          if (!subscription) {
            return new Response(JSON.stringify({ error: 'Subscription not found' }), {
              status: 404,
              headers
            });
          }
          return new Response(JSON.stringify(subscription), { headers });
        }

        // POST /api/subscriptions - Create new subscription
        if (path === '/api/subscriptions' && req.method === 'POST') {
          const data = await req.json();
          const subscription = SubscriptionService.createSubscription(data);
          return new Response(JSON.stringify(subscription), {
            status: 201,
            headers
          });
        }

        // PUT /api/subscriptions/:id - Update subscription
        const putMatch = path.match(/^\/api\/subscriptions\/([^\/]+)$/);
        if (putMatch && req.method === 'PUT') {
          const data = await req.json();
          const subscription = SubscriptionService.updateSubscription(putMatch[1], data);
          if (!subscription) {
            return new Response(JSON.stringify({ error: 'Subscription not found' }), {
              status: 404,
              headers
            });
          }
          return new Response(JSON.stringify(subscription), { headers });
        }

        // DELETE /api/subscriptions/:id - Delete subscription
        const deleteMatch = path.match(/^\/api\/subscriptions\/([^\/]+)$/);
        if (deleteMatch && req.method === 'DELETE') {
          const success = SubscriptionService.deleteSubscription(deleteMatch[1]);
          if (!success) {
            return new Response(JSON.stringify({ error: 'Subscription not found' }), {
              status: 404,
              headers
            });
          }
          return new Response(JSON.stringify({ success: true }), { headers });
        }

        // POST /api/subscriptions/:id/usage - Log usage event
        const usageMatch = path.match(/^\/api\/subscriptions\/([^\/]+)\/usage$/);
        if (usageMatch && req.method === 'POST') {
          const data = await req.json();
          const event = UsageService.logUsage({
            subscriptionId: usageMatch[1],
            quantity: data.quantity,
            notes: data.notes,
          });
          return new Response(JSON.stringify(event), {
            status: 201,
            headers
          });
        }

        // GET /api/subscriptions/:id/usage - Get usage events
        const getUsageMatch = path.match(/^\/api\/subscriptions\/([^\/]+)\/usage$/);
        if (getUsageMatch && req.method === 'GET') {
          const events = UsageService.getUsageForSubscription(getUsageMatch[1]);
          return new Response(JSON.stringify(events), { headers });
        }

        // GET /api/subscriptions/:id/usage/stats - Get usage stats
        const getStatsMatch = path.match(/^\/api\/subscriptions\/([^\/]+)\/usage\/stats$/);
        if (getStatsMatch && req.method === 'GET') {
          const stats = UsageService.getUsageStats(getStatsMatch[1]);
          return new Response(JSON.stringify(stats), { headers });
        }

        return new Response(JSON.stringify({ error: 'Not found' }), {
          status: 404,
          headers
        });
      }

      // Serve static HTML
      if (path === '/' || path === '/index.html') {
        const html = await Bun.file('./public/index.html').text();
        return new Response(html, {
          headers: { 'Content-Type': 'text/html' }
        });
      }

      // Serve static files from public directory
      if (path.startsWith('/public/')) {
        const file = Bun.file('.' + path);
        return new Response(file);
      }

      return new Response('Not Found', { status: 404 });

    } catch (error) {
      console.error('Error handling request:', error);
      return new Response(JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      }), {
        status: 500,
        headers
      });
    }
  },
});

console.log(`🚀 Subscription Manager running at http://localhost:${server.port}`);
console.log(`📊 Dashboard: http://localhost:${server.port}/`);
console.log(`🔌 API: http://localhost:${server.port}/api/subscriptions`);
