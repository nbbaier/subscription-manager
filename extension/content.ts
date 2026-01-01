// Content Script for Subscription Tracker Extension
// Tracks active time on page using visibility API and user interaction

let isVisible = !document.hidden;
let lastActiveTime = Date.now();
let totalActiveSeconds = 0;
let activityTimeout: ReturnType<typeof setTimeout> | null = null;

const IDLE_TIMEOUT_MS = 60000; // Consider idle after 1 minute of no activity

// Track visibility changes
document.addEventListener("visibilitychange", () => {
	if (document.hidden) {
		// Page became hidden
		if (isVisible) {
			totalActiveSeconds += Math.floor((Date.now() - lastActiveTime) / 1000);
			isVisible = false;
		}
		if (activityTimeout) {
			clearTimeout(activityTimeout);
			activityTimeout = null;
		}
	} else {
		// Page became visible
		isVisible = true;
		lastActiveTime = Date.now();
		startActivityTracking();
	}
});

// Track user activity
function resetActivityTimer(): void {
	if (activityTimeout) {
		clearTimeout(activityTimeout);
	}

	if (!isVisible) {
		isVisible = true;
		lastActiveTime = Date.now();
	}

	activityTimeout = setTimeout(() => {
		// User went idle
		if (isVisible) {
			totalActiveSeconds += Math.floor((Date.now() - lastActiveTime) / 1000);
			isVisible = false;
		}
	}, IDLE_TIMEOUT_MS);
}

function startActivityTracking(): void {
	// User interaction events
	const events = ["mousemove", "mousedown", "keydown", "scroll", "touchstart"];

	events.forEach((event) => {
		document.addEventListener(event, resetActivityTimer, { passive: true });
	});

	resetActivityTimer();
}

// Start tracking if page is visible
if (!document.hidden) {
	startActivityTracking();
}

// Report stats when requested by background script
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
	if (message.type === "GET_PAGE_STATS") {
		let activeSeconds = totalActiveSeconds;
		if (isVisible) {
			activeSeconds += Math.floor((Date.now() - lastActiveTime) / 1000);
		}

		sendResponse({
			url: window.location.href,
			domain: window.location.hostname,
			activeSeconds,
			isVisible,
		});
		return true;
	}
});

// Notify background script of significant activity
function notifyActivity(type: string, details?: object): void {
	chrome.runtime
		.sendMessage({
			type: "PAGE_ACTIVITY",
			activityType: type,
			url: window.location.href,
			domain: window.location.hostname,
			timestamp: Date.now(),
			...details,
		})
		.catch(() => {
			// Background script might not be ready
		});
}

// Detect specific actions on known services
function setupServiceDetection(): void {
	const domain = window.location.hostname.replace(/^www\./, "");

	// Netflix: Detect video playback
	if (domain.includes("netflix.com")) {
		const observer = new MutationObserver(() => {
			const video = document.querySelector("video");
			if (video && !video.paused) {
				notifyActivity("video_playing", { service: "netflix" });
			}
		});
		observer.observe(document.body, { childList: true, subtree: true });
	}

	// YouTube: Detect video playback
	if (domain.includes("youtube.com")) {
		const checkVideo = (): void => {
			const video = document.querySelector("video");
			if (video && !video.paused) {
				notifyActivity("video_playing", { service: "youtube" });
			}
		};
		document.addEventListener("play", checkVideo, true);
	}

	// Spotify Web Player: Detect playback
	if (domain.includes("spotify.com")) {
		const observer = new MutationObserver(() => {
			const playButton = document.querySelector(
				'[data-testid="control-button-playpause"]',
			);
			if (playButton?.getAttribute("aria-label")?.includes("Pause")) {
				notifyActivity("audio_playing", { service: "spotify" });
			}
		});
		observer.observe(document.body, { childList: true, subtree: true });
	}

	// GitHub: Detect contributions
	if (domain.includes("github.com")) {
		// Detect if user is viewing their contributions or making commits
		const contributionGraph = document.querySelector(".js-calendar-graph");
		if (contributionGraph) {
			notifyActivity("viewing_contributions", { service: "github" });
		}
	}
}

// Run service detection after page load
if (document.readyState === "complete") {
	setupServiceDetection();
} else {
	window.addEventListener("load", setupServiceDetection);
}
