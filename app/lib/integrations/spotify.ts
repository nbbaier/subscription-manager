// Spotify Integration - Track listening hours automatically
import { IntegrationService } from "../services/integration.ts";
import { SubscriptionService } from "../services/subscription.ts";
import { UsageService } from "../services/usage.ts";

// Types for Spotify API responses
interface SpotifyTrack {
	played_at: string;
	track: {
		id: string;
		name: string;
		duration_ms: number;
		artists: Array<{ name: string }>;
		album: { name: string };
	};
}

interface SpotifyRecentlyPlayedResponse {
	items: SpotifyTrack[];
	next: string | null;
	cursors?: {
		after: string;
		before: string;
	};
}

interface SpotifyUserProfile {
	id: string;
	display_name: string;
	email: string;
	product: string; // 'premium', 'free', etc.
}

export interface SpotifySyncResult {
	success: boolean;
	tracksProcessed: number;
	totalMinutes: number;
	newEvents: number;
	error?: string;
}

const SPOTIFY_API_BASE = "https://api.spotify.com/v1";

// Fetch recently played tracks
async function fetchRecentlyPlayed(
	accessToken: string,
	after?: number,
): Promise<SpotifyTrack[]> {
	const params = new URLSearchParams({
		limit: "50", // Max allowed by Spotify
	});

	if (after) {
		params.set("after", after.toString());
	}

	const response = await fetch(
		`${SPOTIFY_API_BASE}/me/player/recently-played?${params}`,
		{
			headers: {
				Authorization: `Bearer ${accessToken}`,
			},
		},
	);

	if (!response.ok) {
		if (response.status === 401) {
			throw new Error("Token expired");
		}
		throw new Error(`Spotify API error: ${response.status}`);
	}

	const data = (await response.json()) as SpotifyRecentlyPlayedResponse;
	return data.items;
}

// Get user profile
async function getUserProfile(
	accessToken: string,
): Promise<SpotifyUserProfile> {
	const response = await fetch(`${SPOTIFY_API_BASE}/me`, {
		headers: {
			Authorization: `Bearer ${accessToken}`,
		},
	});

	if (!response.ok) {
		throw new Error(`Failed to fetch profile: ${response.status}`);
	}

	return (await response.json()) as SpotifyUserProfile;
}

// Calculate listening time from tracks
function calculateListeningMinutes(tracks: SpotifyTrack[]): number {
	const totalMs = tracks.reduce(
		(sum, track) => sum + track.track.duration_ms,
		0,
	);
	return Math.round(totalMs / 60000);
}

// Group tracks by date
function groupTracksByDate(
	tracks: SpotifyTrack[],
): Map<string, SpotifyTrack[]> {
	const grouped = new Map<string, SpotifyTrack[]>();

	for (const track of tracks) {
		const date = track.played_at.split("T")[0] ?? track.played_at; // YYYY-MM-DD
		const existing = grouped.get(date) || [];
		existing.push(track);
		grouped.set(date, existing);
	}

	return grouped;
}

// Sync usage data from Spotify
async function syncUsage(): Promise<SpotifySyncResult> {
	try {
		// Get valid access token
		const accessToken = await IntegrationService.getValidAccessToken("spotify");
		if (!accessToken) {
			return {
				success: false,
				tracksProcessed: 0,
				totalMinutes: 0,
				newEvents: 0,
				error: "Not connected to Spotify",
			};
		}

		IntegrationService.updateSyncStatus("spotify", "syncing");

		// Get the integration to find linked subscription
		const integration = IntegrationService.getIntegration("spotify");
		let subscriptionId = integration?.subscription_id;

		// If no subscription linked, try to find a Spotify subscription
		if (!subscriptionId) {
			const subscriptions = SubscriptionService.getAllSubscriptions();
			const spotifySub = subscriptions.find((s) =>
				s.name.toLowerCase().includes("spotify"),
			);
			if (spotifySub) {
				subscriptionId = spotifySub.id;
				IntegrationService.linkToSubscription("spotify", subscriptionId);
			}
		}

		if (!subscriptionId) {
			return {
				success: false,
				tracksProcessed: 0,
				totalMinutes: 0,
				newEvents: 0,
				error:
					"No Spotify subscription found. Please create a subscription for Spotify first.",
			};
		}

		// Get last sync timestamp
		const lastSyncAt = integration?.last_sync_at || 0;

		// Fetch recently played tracks
		const tracks = await fetchRecentlyPlayed(accessToken, lastSyncAt);

		if (tracks.length === 0) {
			IntegrationService.updateSyncStatus("spotify", "connected");
			return {
				success: true,
				tracksProcessed: 0,
				totalMinutes: 0,
				newEvents: 0,
			};
		}

		// Group tracks by date and log usage events
		const tracksByDate = groupTracksByDate(tracks);
		let newEvents = 0;
		let totalMinutes = 0;

		for (const [date, dateTracks] of tracksByDate) {
			const minutes = calculateListeningMinutes(dateTracks);
			totalMinutes += minutes;

			// Use actual timestamp of first track played that day
			const firstTrack = dateTracks[0];
			if (!firstTrack) continue;
			const timestamp = new Date(firstTrack.played_at).getTime();

			// Get unique artists and track names for better logging
			const topTracks = dateTracks
				.slice(0, 3)
				.map(
					(t) =>
						`${t.track.name} - ${t.track.artists[0]?.name || "Unknown Artist"}`,
				)
				.join(", ");

			// Log usage event with actual play time
			UsageService.logUsage({
				subscriptionId,
				source: "api",
				usageType: "session",
				quantity: minutes / 60, // Convert to hours
				unit: "hours",
				timestamp,
				notes: `${dateTracks.length} tracks: ${topTracks}`,
				metadata: JSON.stringify({
					trackCount: dateTracks.length,
					topTracks: dateTracks.map((t) => t.track.name),
					date,
				}),
			});

			newEvents++;
		}

		IntegrationService.updateSyncStatus("spotify", "connected");

		return {
			success: true,
			tracksProcessed: tracks.length,
			totalMinutes,
			newEvents,
		};
	} catch (error) {
		const errorMsg = error instanceof Error ? error.message : "Unknown error";
		IntegrationService.updateSyncStatus("spotify", "error", errorMsg);

		return {
			success: false,
			tracksProcessed: 0,
			totalMinutes: 0,
			newEvents: 0,
			error: errorMsg,
		};
	}
}

// Get listening stats
async function getListeningStats(accessToken: string): Promise<{
	recentTracks: number;
	totalMinutes: number;
	topArtists: string[];
}> {
	const tracks = await fetchRecentlyPlayed(accessToken);

	const artistCounts = new Map<string, number>();
	for (const track of tracks) {
		const artist = track.track.artists[0]?.name || "Unknown";
		artistCounts.set(artist, (artistCounts.get(artist) || 0) + 1);
	}

	const topArtists = Array.from(artistCounts.entries())
		.sort((a, b) => b[1] - a[1])
		.slice(0, 5)
		.map(([name]) => name);

	return {
		recentTracks: tracks.length,
		totalMinutes: calculateListeningMinutes(tracks),
		topArtists,
	};
}

export const SpotifyIntegration = {
	fetchRecentlyPlayed,
	getUserProfile,
	calculateListeningMinutes,
	groupTracksByDate,
	syncUsage,
	getListeningStats,
};
