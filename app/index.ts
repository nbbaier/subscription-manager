// Main application entry point
import { initializeDatabase } from "./lib/db/index.ts";
import {
	GitHubIntegration,
	type GitHubSyncResult,
} from "./lib/integrations/github.ts";
import {
	SpotifyIntegration,
	type SpotifySyncResult,
} from "./lib/integrations/spotify.ts";
import { AnalyticsService } from "./lib/services/analytics.ts";
import { DomainMappingService } from "./lib/services/domain-mapping.ts";
import {
	IntegrationService,
	type IntegrationServiceName,
	SUPPORTED_INTEGRATIONS,
} from "./lib/services/integration.ts";
import { SubscriptionService } from "./lib/services/subscription.ts";
import { UsageService } from "./lib/services/usage.ts";

// Initialize database on startup
initializeDatabase();

const server = Bun.serve({
	port: process.env.PORT || 3000,

	async fetch(req) {
		const url = new URL(req.url);
		const path = url.pathname;

		// Enable CORS for development
		const headers = {
			"Content-Type": "application/json",
			"Access-Control-Allow-Origin": "*",
			"Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
			"Access-Control-Allow-Headers": "Content-Type",
		};

		// Handle preflight requests
		if (req.method === "OPTIONS") {
			return new Response(null, { headers });
		}

		try {
			// API Routes
			if (path.startsWith("/api")) {
				// GET /api/subscriptions - List all subscriptions
				if (path === "/api/subscriptions" && req.method === "GET") {
					const subscriptions = SubscriptionService.getAllSubscriptions();
					return new Response(JSON.stringify(subscriptions), { headers });
				}

				// GET /api/subscriptions/stats - Get overall stats
				if (path === "/api/subscriptions/stats" && req.method === "GET") {
					const monthlyTotal = SubscriptionService.getMonthlyTotal();
					const yearlyTotal = SubscriptionService.getYearlyTotal();
					const subscriptions = SubscriptionService.getActiveSubscriptions();

					return new Response(
						JSON.stringify({
							monthlyTotal,
							yearlyTotal,
							activeCount: subscriptions.length,
						}),
						{ headers },
					);
				}

				// GET /api/subscriptions/:id - Get subscription by ID
				const getMatch = path.match(/^\/api\/subscriptions\/([^/]+)$/);
				if (getMatch && req.method === "GET") {
					const id = getMatch[1];
					const subscription = id
						? SubscriptionService.getSubscriptionById(id)
						: null;
					if (!subscription) {
						return new Response(
							JSON.stringify({ error: "Subscription not found" }),
							{
								status: 404,
								headers,
							},
						);
					}
					return new Response(JSON.stringify(subscription), { headers });
				}

				// POST /api/subscriptions - Create new subscription
				if (path === "/api/subscriptions" && req.method === "POST") {
					const data = await req.json();
					const subscription = SubscriptionService.createSubscription(data);
					return new Response(JSON.stringify(subscription), {
						status: 201,
						headers,
					});
				}

				// PUT /api/subscriptions/:id - Update subscription
				const putMatch = path.match(/^\/api\/subscriptions\/([^/]+)$/);
				if (putMatch && req.method === "PUT") {
					const id = putMatch[1];
					const data = await req.json();
					const subscription = id
						? SubscriptionService.updateSubscription(id, data)
						: null;
					if (!subscription) {
						return new Response(
							JSON.stringify({ error: "Subscription not found" }),
							{
								status: 404,
								headers,
							},
						);
					}
					return new Response(JSON.stringify(subscription), { headers });
				}

				// DELETE /api/subscriptions/:id - Delete subscription
				const deleteMatch = path.match(/^\/api\/subscriptions\/([^/]+)$/);
				if (deleteMatch && req.method === "DELETE") {
					const id = deleteMatch[1];
					const success = id
						? SubscriptionService.deleteSubscription(id)
						: false;
					if (!success) {
						return new Response(
							JSON.stringify({ error: "Subscription not found" }),
							{
								status: 404,
								headers,
							},
						);
					}
					return new Response(JSON.stringify({ success: true }), { headers });
				}

				// POST /api/subscriptions/:id/usage - Log usage event
				const usageMatch = path.match(/^\/api\/subscriptions\/([^/]+)\/usage$/);
				if (usageMatch && req.method === "POST") {
					const id = usageMatch[1];
					const data = await req.json();
					const event = id
						? UsageService.logUsage({
								subscriptionId: id,
								quantity: data.quantity,
								notes: data.notes,
							})
						: null;
					return new Response(JSON.stringify(event), {
						status: 201,
						headers,
					});
				}

				// GET /api/subscriptions/:id/usage - Get usage events
				const getUsageMatch = path.match(
					/^\/api\/subscriptions\/([^/]+)\/usage$/,
				);
				if (getUsageMatch && req.method === "GET") {
					const id = getUsageMatch[1];
					const events = id ? UsageService.getUsageForSubscription(id) : [];
					return new Response(JSON.stringify(events), { headers });
				}

				// GET /api/subscriptions/:id/usage/stats - Get usage stats
				const getStatsMatch = path.match(
					/^\/api\/subscriptions\/([^/]+)\/usage\/stats$/,
				);
				if (getStatsMatch && req.method === "GET") {
					const id = getStatsMatch[1];
					const stats = id ? UsageService.getUsageStats(id) : null;
					return new Response(JSON.stringify(stats), { headers });
				}

				// GET /api/subscriptions/:id/trend - Get usage trend for a subscription
				const getTrendMatch = path.match(
					/^\/api\/subscriptions\/([^/]+)\/trend$/,
				);
				if (getTrendMatch && req.method === "GET") {
					const id = getTrendMatch[1];
					const months = parseInt(url.searchParams.get("months") || "6", 10);
					const trend = id ? AnalyticsService.getUsageTrend(id, months) : null;
					return new Response(JSON.stringify(trend), { headers });
				}

				// GET /api/subscriptions/:id/value-score - Get value score for a subscription
				const getValueScoreMatch = path.match(
					/^\/api\/subscriptions\/([^/]+)\/value-score$/,
				);
				if (getValueScoreMatch && req.method === "GET") {
					const id = getValueScoreMatch[1];
					const score = id ? AnalyticsService.calculateValueScore(id) : null;
					if (!score) {
						return new Response(
							JSON.stringify({ error: "Subscription not found" }),
							{
								status: 404,
								headers,
							},
						);
					}
					return new Response(JSON.stringify(score), { headers });
				}

				// ==================== ANALYTICS ENDPOINTS ====================

				// GET /api/analytics/value-scores - Get all value scores ranked
				if (path === "/api/analytics/value-scores" && req.method === "GET") {
					const scores = AnalyticsService.getAllValueScores();
					return new Response(JSON.stringify(scores), { headers });
				}

				// GET /api/analytics/alerts - Get all alerts
				if (path === "/api/analytics/alerts" && req.method === "GET") {
					const alerts = AnalyticsService.getAlerts();
					return new Response(JSON.stringify(alerts), { headers });
				}

				// GET /api/analytics/spending-by-category - Get spending breakdown by category
				if (
					path === "/api/analytics/spending-by-category" &&
					req.method === "GET"
				) {
					const categories = AnalyticsService.getSpendingByCategory();
					return new Response(JSON.stringify(categories), { headers });
				}

				// GET /api/analytics/spending-trend - Get monthly spending trend
				if (path === "/api/analytics/spending-trend" && req.method === "GET") {
					const months = parseInt(url.searchParams.get("months") || "12", 10);
					const trend = AnalyticsService.getMonthlySpendingTrend(months);
					return new Response(JSON.stringify(trend), { headers });
				}

				// GET /api/analytics/cost-leaderboard - Get cost-per-use leaderboard
				if (
					path === "/api/analytics/cost-leaderboard" &&
					req.method === "GET"
				) {
					const leaderboard = AnalyticsService.getCostPerUseLeaderboard();
					return new Response(JSON.stringify(leaderboard), { headers });
				}

				// GET /api/analytics/usage-trends - Get usage trends for all subscriptions
				if (path === "/api/analytics/usage-trends" && req.method === "GET") {
					const months = parseInt(url.searchParams.get("months") || "6", 10);
					const trends = AnalyticsService.getAllUsageTrends(months);
					return new Response(JSON.stringify(trends), { headers });
				}

				// POST /api/analytics/compute-stats - Trigger stats computation
				if (path === "/api/analytics/compute-stats" && req.method === "POST") {
					AnalyticsService.computeAllStats();
					return new Response(
						JSON.stringify({ success: true, message: "Stats computed" }),
						{ headers },
					);
				}

				// ==================== INTEGRATION ENDPOINTS ====================

				// GET /api/integrations - List all integrations with status
				if (path === "/api/integrations" && req.method === "GET") {
					const summary = IntegrationService.getIntegrationsSummary();
					return new Response(JSON.stringify(summary), { headers });
				}

				// GET /api/integrations/:service - Get specific integration status
				const getIntegrationMatch = path.match(
					/^\/api\/integrations\/([^/]+)$/,
				);
				if (getIntegrationMatch && req.method === "GET") {
					const serviceName = getIntegrationMatch[1];
					if (!serviceName) {
						return new Response(
							JSON.stringify({ error: "Missing service name" }),
							{ status: 400, headers },
						);
					}
					const integration = IntegrationService.getIntegration(serviceName);
					const serviceInfo =
						SUPPORTED_INTEGRATIONS[serviceName as IntegrationServiceName];

					if (!serviceInfo) {
						return new Response(
							JSON.stringify({ error: "Unknown integration" }),
							{
								status: 404,
								headers,
							},
						);
					}

					return new Response(
						JSON.stringify({
							service: serviceName,
							name: serviceInfo.name,
							description: serviceInfo.description,
							icon: serviceInfo.icon,
							status: integration?.sync_status || "disconnected",
							lastSync: integration?.last_sync_at || null,
							subscriptionId: integration?.subscription_id || null,
							error: integration?.sync_error || null,
						}),
						{ headers },
					);
				}

				// GET /api/integrations/:service/auth-url - Get OAuth authorization URL
				const authUrlMatch = path.match(
					/^\/api\/integrations\/([^/]+)\/auth-url$/,
				);
				if (authUrlMatch && req.method === "GET") {
					const serviceName = authUrlMatch[1] as IntegrationServiceName;

					if (!SUPPORTED_INTEGRATIONS[serviceName]) {
						return new Response(
							JSON.stringify({ error: "Unknown integration" }),
							{
								status: 404,
								headers,
							},
						);
					}

					const redirectUri =
						url.searchParams.get("redirect_uri") ||
						`${url.origin}/api/integrations/${serviceName}/callback`;

					try {
						const authUrl = IntegrationService.generateAuthUrl(
							serviceName,
							redirectUri,
						);
						return new Response(JSON.stringify({ authUrl, redirectUri }), {
							headers,
						});
					} catch (error) {
						return new Response(
							JSON.stringify({
								error: "Failed to generate auth URL",
								message:
									error instanceof Error ? error.message : "Unknown error",
							}),
							{ status: 500, headers },
						);
					}
				}

				// GET /api/integrations/:service/callback - OAuth callback handler
				const callbackMatch = path.match(
					/^\/api\/integrations\/([^/]+)\/callback$/,
				);
				if (callbackMatch && req.method === "GET") {
					const serviceName = callbackMatch[1] as IntegrationServiceName;
					const code = url.searchParams.get("code");
					const error = url.searchParams.get("error");

					if (error) {
						// Redirect to frontend with error
						return new Response(null, {
							status: 302,
							headers: {
								Location: `/?integration=${serviceName}&error=${encodeURIComponent(error)}`,
							},
						});
					}

					if (!code) {
						return new Response(
							JSON.stringify({ error: "No authorization code provided" }),
							{
								status: 400,
								headers,
							},
						);
					}

					const url = new URL(req.url);
					const redirectUri = `${url.origin}/api/integrations/${serviceName}/callback`;

					try {
						const tokens = await IntegrationService.exchangeCodeForTokens(
							serviceName,
							code,
							redirectUri,
						);
						IntegrationService.storeTokens(serviceName, tokens);

						// Redirect to frontend with success
						return new Response(null, {
							status: 302,
							headers: {
								Location: `/?integration=${serviceName}&connected=true`,
							},
						});
					} catch (error) {
						return new Response(null, {
							status: 302,
							headers: {
								Location: `/?integration=${serviceName}&error=${encodeURIComponent(
									error instanceof Error ? error.message : "Connection failed",
								)}`,
							},
						});
					}
				}

				// POST /api/integrations/:service/disconnect - Disconnect integration
				const disconnectMatch = path.match(
					/^\/api\/integrations\/([^/]+)\/disconnect$/,
				);
				if (disconnectMatch && req.method === "POST") {
					const serviceName = disconnectMatch[1];
					const success = serviceName
						? IntegrationService.disconnect(serviceName)
						: false;
					return new Response(JSON.stringify({ success }), { headers });
				}

				// POST /api/integrations/:service/sync - Manually trigger sync
				const syncMatch = path.match(/^\/api\/integrations\/([^/]+)\/sync$/);
				if (syncMatch && req.method === "POST") {
					const serviceName = syncMatch[1];
					if (!serviceName) {
						return new Response(
							JSON.stringify({ error: "Missing service name" }),
							{ status: 400, headers },
						);
					}

					let result: SpotifySyncResult | GitHubSyncResult | null = null;
					switch (serviceName) {
						case "spotify":
							result = await SpotifyIntegration.syncUsage();
							break;
						case "github":
							result = await GitHubIntegration.syncUsage();
							break;
						default:
							return new Response(
								JSON.stringify({ error: "Unknown integration" }),
								{
									status: 404,
									headers,
								},
							);
					}

					return new Response(JSON.stringify(result), { headers });
				}

				// POST /api/integrations/:service/link - Link integration to subscription
				const linkMatch = path.match(/^\/api\/integrations\/([^/]+)\/link$/);
				if (linkMatch && req.method === "POST") {
					const serviceName = linkMatch[1];
					const data = await req.json();

					if (!serviceName || !data.subscriptionId) {
						return new Response(
							JSON.stringify({
								error: "serviceName and subscriptionId required",
							}),
							{
								status: 400,
								headers,
							},
						);
					}

					IntegrationService.linkToSubscription(
						serviceName,
						data.subscriptionId,
					);
					return new Response(JSON.stringify({ success: true }), { headers });
				}

				// ==================== DOMAIN MAPPING ENDPOINTS ====================

				// GET /api/domain-mappings - List all domain mappings
				if (path === "/api/domain-mappings" && req.method === "GET") {
					const mappings = DomainMappingService.getAllMappings();
					return new Response(JSON.stringify(mappings), { headers });
				}

				// GET /api/domain-mappings/config - Get extension config (domain -> subscription map)
				if (path === "/api/domain-mappings/config" && req.method === "GET") {
					const config = DomainMappingService.getExtensionConfig();
					return new Response(JSON.stringify(config), { headers });
				}

				// GET /api/domain-mappings/suggestions/:subscriptionId - Get domain suggestions
				const suggestionsMatch = path.match(
					/^\/api\/domain-mappings\/suggestions\/([^/]+)$/,
				);
				if (suggestionsMatch && req.method === "GET") {
					const id = suggestionsMatch[1];
					const subscription = id
						? SubscriptionService.getSubscriptionById(id)
						: null;
					if (!subscription) {
						return new Response(
							JSON.stringify({ error: "Subscription not found" }),
							{
								status: 404,
								headers,
							},
						);
					}
					const suggestions = DomainMappingService.getSuggestedDomains(
						subscription.name,
					);
					return new Response(JSON.stringify({ suggestions }), { headers });
				}

				// POST /api/domain-mappings - Create a new domain mapping
				if (path === "/api/domain-mappings" && req.method === "POST") {
					const data = await req.json();

					if (!data.domain || !data.subscriptionId) {
						return new Response(
							JSON.stringify({ error: "domain and subscriptionId required" }),
							{
								status: 400,
								headers,
							},
						);
					}

					try {
						const mapping = DomainMappingService.createMapping(
							data.domain,
							data.subscriptionId,
						);
						return new Response(JSON.stringify(mapping), {
							status: 201,
							headers,
						});
					} catch (error) {
						return new Response(
							JSON.stringify({
								error:
									error instanceof Error
										? error.message
										: "Failed to create mapping",
							}),
							{ status: 400, headers },
						);
					}
				}

				// DELETE /api/domain-mappings/:domain - Delete a domain mapping
				const deleteMappingMatch = path.match(/^\/api\/domain-mappings\/(.+)$/);
				if (deleteMappingMatch && req.method === "DELETE") {
					const encodedDomain = deleteMappingMatch[1];
					const domain = encodedDomain
						? decodeURIComponent(encodedDomain)
						: null;
					const success = domain
						? DomainMappingService.deleteMapping(domain)
						: false;

					if (!success) {
						return new Response(
							JSON.stringify({ error: "Domain mapping not found" }),
							{
								status: 404,
								headers,
							},
						);
					}

					return new Response(JSON.stringify({ success: true }), { headers });
				}

				// POST /api/domain-mappings/bulk - Bulk create mappings
				if (path === "/api/domain-mappings/bulk" && req.method === "POST") {
					const data = await req.json();

					if (!data.subscriptionId || !Array.isArray(data.domains)) {
						return new Response(
							JSON.stringify({
								error: "subscriptionId and domains array required",
							}),
							{
								status: 400,
								headers,
							},
						);
					}

					const created = DomainMappingService.bulkCreateMappings(
						data.subscriptionId,
						data.domains,
					);
					return new Response(
						JSON.stringify({ created: created.length, mappings: created }),
						{ headers },
					);
				}

				// POST /api/usage/batch - Batch log usage (for browser extension)
				if (path === "/api/usage/batch" && req.method === "POST") {
					const data = await req.json();

					if (!Array.isArray(data.events)) {
						return new Response(
							JSON.stringify({ error: "events array required" }),
							{
								status: 400,
								headers,
							},
						);
					}

					const results = [];
					for (const event of data.events) {
						if (!event.subscriptionId) {
							// Try to resolve from domain
							if (event.domain) {
								const mapping = DomainMappingService.getMappingByDomain(
									event.domain,
								);
								if (mapping) {
									event.subscriptionId = mapping.subscription_id;
								}
							}
						}

						if (
							event.subscriptionId &&
							SubscriptionService.getSubscriptionById(event.subscriptionId)
						) {
							const usage = UsageService.logUsage({
								subscriptionId: event.subscriptionId,
								source: event.source || "browser",
								usageType: event.usageType || "session",
								quantity:
									event.quantity || (event.minutes ? event.minutes / 60 : 1),
								unit: event.unit || "hours",
								timestamp: event.timestamp,
								notes: event.notes,
								metadata: event.metadata
									? JSON.stringify(event.metadata)
									: undefined,
							});
							results.push({ success: true, id: usage.id });
						} else {
							results.push({
								success: false,
								error: "Could not resolve subscription",
							});
						}
					}

					return new Response(
						JSON.stringify({ processed: results.length, results }),
						{ headers },
					);
				}

				return new Response(JSON.stringify({ error: "Not found" }), {
					status: 404,
					headers,
				});
			}

			// Serve static HTML
			if (path === "/" || path === "/index.html") {
				const html = await Bun.file("./public/index.html").text();
				return new Response(html, {
					headers: { "Content-Type": "text/html" },
				});
			}

			// Serve static files from public directory
			if (path.startsWith("/public/")) {
				const file = Bun.file(`.${path}`);
				return new Response(file);
			}

			return new Response("Not Found", { status: 404 });
		} catch (error) {
			console.error("Error handling request:", error);
			return new Response(
				JSON.stringify({
					error: "Internal server error",
					message: error instanceof Error ? error.message : "Unknown error",
				}),
				{
					status: 500,
					headers,
				},
			);
		}
	},
});

console.log(
	`🚀 Subscription Manager running at http://localhost:${server.port}`,
);
console.log(`📊 Dashboard: http://localhost:${server.port}/`);
console.log(`🔌 API: http://localhost:${server.port}/api/subscriptions`);
