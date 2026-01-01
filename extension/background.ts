// Background Service Worker for Subscription Tracker Extension
// Handles event aggregation, batching, and sync with main app

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3000";
const SYNC_INTERVAL_MINUTES = 5;
const MIN_TRACKING_SECONDS = 30; // Minimum time to track (avoid quick visits)

interface TrackingSession {
	domain: string;
	subscriptionId?: string;
	startTime: number;
	lastActiveTime: number;
	totalSeconds: number;
	isActive: boolean;
}

interface PendingEvent {
	domain: string;
	subscriptionId?: string;
	minutes: number;
	timestamp: number;
	source: string;
}

// State
let domainMappings: Record<string, string> = {};
const activeSessions: Map<number, TrackingSession> = new Map();
let pendingEvents: PendingEvent[] = [];
let isOnline = true;

// Initialize
chrome.runtime.onInstalled.addListener(async () => {
	console.log("Subscription Tracker extension installed");
	await fetchDomainMappings();

	// Set up periodic sync
	chrome.alarms.create("syncUsage", { periodInMinutes: SYNC_INTERVAL_MINUTES });
});

// Fetch domain mappings from main app
async function fetchDomainMappings(): Promise<void> {
	try {
		const response = await fetch(`${API_BASE}/api/domain-mappings/config`);
		if (response.ok) {
			domainMappings = await response.json();
			await chrome.storage.local.set({ domainMappings });
			isOnline = true;
		}
	} catch (_error) {
		console.log("Failed to fetch domain mappings, using cached");
		isOnline = false;
		const cached = await chrome.storage.local.get("domainMappings");
		domainMappings = (cached.domainMappings as Record<string, string>) || {};
	}
}

// Extract domain from URL
function extractDomain(url: string): string | null {
	try {
		const urlObj = new URL(url);
		return urlObj.hostname.replace(/^www\./, "");
	} catch {
		return null;
	}
}

// Check if domain is tracked
function isTrackedDomain(domain: string): boolean {
	// Check exact match
	if (domainMappings[domain]) return true;
	if (domainMappings[`www.${domain}`]) return true;

	// Check without www
	const withoutWww = domain.replace(/^www\./, "");
	if (domainMappings[withoutWww]) return true;

	return false;
}

// Get subscription ID for domain
function getSubscriptionId(domain: string): string | undefined {
	return (
		domainMappings[domain] ||
		domainMappings[`www.${domain}`] ||
		domainMappings[domain.replace(/^www\./, "")]
	);
}

// Handle tab updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
	if (changeInfo.status === "complete" && tab.url) {
		handleTabChange(tabId, tab.url);
	}
});

// Handle tab activation
chrome.tabs.onActivated.addListener(async (activeInfo) => {
	const tab = await chrome.tabs.get(activeInfo.tabId);
	if (tab.url) {
		handleTabChange(activeInfo.tabId, tab.url);
	}
});

// Handle tab removal
chrome.tabs.onRemoved.addListener((tabId) => {
	endSession(tabId);
});

// Handle window focus changes
chrome.windows.onFocusChanged.addListener(async (windowId) => {
	if (windowId === chrome.windows.WINDOW_ID_NONE) {
		// Browser lost focus, pause all sessions
		for (const [_tabId, session] of activeSessions) {
			if (session.isActive) {
				session.totalSeconds += Math.floor(
					(Date.now() - session.lastActiveTime) / 1000,
				);
				session.isActive = false;
			}
		}
	} else {
		// Browser gained focus, resume active tab
		const tabs = await chrome.tabs.query({ active: true, windowId });
		if (tabs[0]?.id && tabs[0]?.url) {
			handleTabChange(tabs[0].id, tabs[0].url);
		}
	}
});

// Handle tab changes
function handleTabChange(tabId: number, url: string): void {
	const domain = extractDomain(url);

	// End previous session for this tab
	endSession(tabId);

	if (!domain || !isTrackedDomain(domain)) {
		return;
	}

	// Start new session
	const session: TrackingSession = {
		domain,
		subscriptionId: getSubscriptionId(domain),
		startTime: Date.now(),
		lastActiveTime: Date.now(),
		totalSeconds: 0,
		isActive: true,
	};

	activeSessions.set(tabId, session);

	// Update badge
	updateBadge();
}

// End a tracking session
function endSession(tabId: number): void {
	const session = activeSessions.get(tabId);
	if (!session) return;

	// Calculate final duration
	if (session.isActive) {
		session.totalSeconds += Math.floor(
			(Date.now() - session.lastActiveTime) / 1000,
		);
	}

	// Only record if significant time was spent
	if (session.totalSeconds >= MIN_TRACKING_SECONDS) {
		const minutes = Math.round((session.totalSeconds / 60) * 10) / 10; // Round to 1 decimal

		pendingEvents.push({
			domain: session.domain,
			subscriptionId: session.subscriptionId,
			minutes,
			timestamp: session.startTime,
			source: "browser",
		});

		// Save pending events
		savePendingEvents();
	}

	activeSessions.delete(tabId);
	updateBadge();
}

// Update extension badge
function updateBadge(): void {
	const activeCount = activeSessions.size;
	if (activeCount > 0) {
		chrome.action.setBadgeText({ text: String(activeCount) });
		chrome.action.setBadgeBackgroundColor({ color: "#10B981" }); // Green
	} else {
		chrome.action.setBadgeText({ text: "" });
	}
}

// Save pending events to storage
async function savePendingEvents(): Promise<void> {
	await chrome.storage.local.set({ pendingEvents });
}

// Load pending events from storage
async function loadPendingEvents(): Promise<void> {
	const data = await chrome.storage.local.get("pendingEvents");
	pendingEvents = (data.pendingEvents as PendingEvent[]) || [];
}

// Sync pending events to main app
async function syncPendingEvents(): Promise<{
	synced: number;
	failed: number;
}> {
	if (pendingEvents.length === 0) {
		return { synced: 0, failed: 0 };
	}

	try {
		const response = await fetch(`${API_BASE}/api/usage/batch`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ events: pendingEvents }),
		});

		if (response.ok) {
			const result = await response.json();
			const synced = result.results.filter(
				(r: { success: boolean }) => r.success,
			).length;
			const failed = result.results.filter(
				(r: { success: boolean }) => !r.success,
			).length;

			// Clear synced events, keep failed ones
			pendingEvents = pendingEvents.filter(
				(_, i) => !result.results[i]?.success,
			);
			await savePendingEvents();

			isOnline = true;
			return { synced, failed };
		} else {
			isOnline = false;
			return { synced: 0, failed: pendingEvents.length };
		}
	} catch (error) {
		console.error("Sync failed:", error);
		isOnline = false;
		return { synced: 0, failed: pendingEvents.length };
	}
}

// Handle alarms
chrome.alarms.onAlarm.addListener(async (alarm) => {
	if (alarm.name === "syncUsage") {
		await fetchDomainMappings();
		await syncPendingEvents();
	}
});

// Message handling for popup and content scripts
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
	if (message.type === "GET_STATUS") {
		const activeDomains = Array.from(activeSessions.values()).map((s) => ({
			domain: s.domain,
			seconds: s.isActive
				? s.totalSeconds + Math.floor((Date.now() - s.lastActiveTime) / 1000)
				: s.totalSeconds,
		}));

		sendResponse({
			isOnline,
			activeSessions: activeDomains,
			pendingEvents: pendingEvents.length,
			trackedDomains: Object.keys(domainMappings).length,
		});
		return true;
	}

	if (message.type === "SYNC_NOW") {
		syncPendingEvents().then(sendResponse);
		return true;
	}

	if (message.type === "REFRESH_MAPPINGS") {
		fetchDomainMappings().then(() => {
			sendResponse({
				success: true,
				count: Object.keys(domainMappings).length,
			});
		});
		return true;
	}

	if (message.type === "QUICK_LOG") {
		// Quick log from popup
		const event: PendingEvent = {
			domain: message.domain,
			subscriptionId: message.subscriptionId,
			minutes: message.minutes || 1,
			timestamp: Date.now(),
			source: "manual",
		};
		pendingEvents.push(event);
		savePendingEvents().then(() => {
			sendResponse({ success: true });
		});
		return true;
	}
});

// Initialize on startup
loadPendingEvents();
fetchDomainMappings();
