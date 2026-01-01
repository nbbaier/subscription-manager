// Popup script for Subscription Tracker Extension

interface Status {
	isOnline: boolean;
	activeSessions: Array<{ domain: string; seconds: number }>;
	pendingEvents: number;
	trackedDomains: number;
}

// Format seconds to human readable
function formatTime(seconds: number): string {
	if (seconds < 60) {
		return `${seconds}s`;
	}
	if (seconds < 3600) {
		const mins = Math.floor(seconds / 60);
		const secs = seconds % 60;
		return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
	}
	const hours = Math.floor(seconds / 3600);
	const mins = Math.floor((seconds % 3600) / 60);
	return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

// Update UI with status
function updateUI(status: Status): void {
	// Status indicator
	const statusDot = document.getElementById("statusDot");
	const statusText = document.getElementById("statusText");

	if (statusDot && statusText) {
		if (status.isOnline) {
			statusDot.className = "status-dot online";
			statusText.textContent = "Connected to Subscription Manager";
		} else {
			statusDot.className = "status-dot offline";
			statusText.textContent = "Offline - events will sync later";
		}
	}

	// Stats
	const trackedCount = document.getElementById("trackedCount");
	if (trackedCount) {
		trackedCount.textContent = String(status.trackedDomains);
	}

	const activeCount = document.getElementById("activeCount");
	if (activeCount) {
		activeCount.textContent = String(status.activeSessions.length);
	}

	const pendingCount = document.getElementById("pendingCount");
	if (pendingCount) {
		pendingCount.textContent = String(status.pendingEvents);
	}

	// Pending badge
	const pendingBadge = document.getElementById("pendingBadge");
	if (pendingBadge) {
		if (status.pendingEvents > 0) {
			pendingBadge.style.display = "inline-flex";
			pendingBadge.textContent = String(status.pendingEvents);
		} else {
			pendingBadge.style.display = "none";
		}
	}

	// Active sessions
	const sessionsContainer = document.getElementById("activeSessions");
	if (sessionsContainer) {
		if (status.activeSessions.length === 0) {
			sessionsContainer.innerHTML =
				'<div class="empty-state">No active sessions</div>';
		} else {
			sessionsContainer.innerHTML = status.activeSessions
				.sort((a, b) => b.seconds - a.seconds)
				.map(
					(session) => `
        <div class="session-item">
          <span class="session-domain">${session.domain}</span>
          <span class="session-time">${formatTime(session.seconds)}</span>
        </div>
      `,
				)
				.join("");
		}
	}
}

// Fetch and display status
async function refreshStatus(): Promise<void> {
	try {
		const status = (await chrome.runtime.sendMessage({
			type: "GET_STATUS",
		})) as Status;
		updateUI(status);
	} catch (error) {
		console.error("Failed to get status:", error);
	}
}

// Sync now button
const syncBtn = document.getElementById("syncBtn");
syncBtn?.addEventListener("click", async () => {
	const originalText = syncBtn.innerHTML;
	syncBtn.innerHTML = "Syncing...";
	syncBtn.setAttribute("disabled", "true");

	try {
		const result = (await chrome.runtime.sendMessage({ type: "SYNC_NOW" })) as {
			synced: number;
			failed: number;
		};
		syncBtn.innerHTML = `Synced ${result.synced} events`;

		setTimeout(() => {
			syncBtn.innerHTML = originalText;
			syncBtn.removeAttribute("disabled");
			refreshStatus();
		}, 2000);
	} catch (_error) {
		syncBtn.innerHTML = "Sync failed";
		setTimeout(() => {
			syncBtn.innerHTML = originalText;
			syncBtn.removeAttribute("disabled");
		}, 2000);
	}
});

// Refresh domains button
const refreshBtn = document.getElementById("refreshBtn");
refreshBtn?.addEventListener("click", async () => {
	const originalText = refreshBtn.textContent;
	refreshBtn.textContent = "Refreshing...";
	refreshBtn.setAttribute("disabled", "true");

	try {
		const result = (await chrome.runtime.sendMessage({
			type: "REFRESH_MAPPINGS",
		})) as { success: boolean; count: number };
		refreshBtn.textContent = `Updated ${result.count} domains`;

		setTimeout(() => {
			if (originalText) refreshBtn.textContent = originalText;
			refreshBtn.removeAttribute("disabled");
			refreshStatus();
		}, 2000);
	} catch (_error) {
		refreshBtn.textContent = "Refresh failed";
		setTimeout(() => {
			if (originalText) refreshBtn.textContent = originalText;
			refreshBtn.removeAttribute("disabled");
		}, 2000);
	}
});

// Initial load
refreshStatus();

// Refresh every 5 seconds while popup is open
setInterval(refreshStatus, 5000);
