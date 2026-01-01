// Main application entry point
import { initializeDatabase } from './lib/db/index.ts';
import { SubscriptionService } from './lib/services/subscription.ts';
import { UsageService } from './lib/services/usage.ts';
import { AnalyticsService } from './lib/services/analytics.ts';

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

        // GET /api/subscriptions/:id/trend - Get usage trend for a subscription
        const getTrendMatch = path.match(/^\/api\/subscriptions\/([^\/]+)\/trend$/);
        if (getTrendMatch && req.method === 'GET') {
          const months = parseInt(url.searchParams.get('months') || '6');
          const trend = AnalyticsService.getUsageTrend(getTrendMatch[1], months);
          return new Response(JSON.stringify(trend), { headers });
        }

        // GET /api/subscriptions/:id/value-score - Get value score for a subscription
        const getValueScoreMatch = path.match(/^\/api\/subscriptions\/([^\/]+)\/value-score$/);
        if (getValueScoreMatch && req.method === 'GET') {
          const score = AnalyticsService.calculateValueScore(getValueScoreMatch[1]);
          if (!score) {
            return new Response(JSON.stringify({ error: 'Subscription not found' }), {
              status: 404,
              headers
            });
          }
          return new Response(JSON.stringify(score), { headers });
        }

        // ==================== ANALYTICS ENDPOINTS ====================

        // GET /api/analytics/value-scores - Get all value scores ranked
        if (path === '/api/analytics/value-scores' && req.method === 'GET') {
          const scores = AnalyticsService.getAllValueScores();
          return new Response(JSON.stringify(scores), { headers });
        }

        // GET /api/analytics/alerts - Get all alerts
        if (path === '/api/analytics/alerts' && req.method === 'GET') {
          const alerts = AnalyticsService.getAlerts();
          return new Response(JSON.stringify(alerts), { headers });
        }

        // GET /api/analytics/spending-by-category - Get spending breakdown by category
        if (path === '/api/analytics/spending-by-category' && req.method === 'GET') {
          const categories = AnalyticsService.getSpendingByCategory();
          return new Response(JSON.stringify(categories), { headers });
        }

        // GET /api/analytics/spending-trend - Get monthly spending trend
        if (path === '/api/analytics/spending-trend' && req.method === 'GET') {
          const months = parseInt(url.searchParams.get('months') || '12');
          const trend = AnalyticsService.getMonthlySpendingTrend(months);
          return new Response(JSON.stringify(trend), { headers });
        }

        // GET /api/analytics/cost-leaderboard - Get cost-per-use leaderboard
        if (path === '/api/analytics/cost-leaderboard' && req.method === 'GET') {
          const leaderboard = AnalyticsService.getCostPerUseLeaderboard();
          return new Response(JSON.stringify(leaderboard), { headers });
        }

        // GET /api/analytics/usage-trends - Get usage trends for all subscriptions
        if (path === '/api/analytics/usage-trends' && req.method === 'GET') {
          const months = parseInt(url.searchParams.get('months') || '6');
          const trends = AnalyticsService.getAllUsageTrends(months);
          return new Response(JSON.stringify(trends), { headers });
        }

        // POST /api/analytics/compute-stats - Trigger stats computation
        if (path === '/api/analytics/compute-stats' && req.method === 'POST') {
          AnalyticsService.computeAllStats();
          return new Response(JSON.stringify({ success: true, message: 'Stats computed' }), { headers });
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
