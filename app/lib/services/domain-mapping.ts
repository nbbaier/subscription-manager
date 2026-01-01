// Domain Mapping Service - For browser extension domain tracking
import { db, nanoid } from "../db/index.ts";

// Types
export interface DomainMapping {
	id: string;
	domain: string;
	subscription_id: string;
	active: number;
	created_at: number;
	updated_at: number;
}

// Common domain to service mappings (suggestions for users)
export const COMMON_DOMAIN_MAPPINGS: Record<string, string[]> = {
	// Streaming
	netflix: ["netflix.com", "www.netflix.com"],
	spotify: ["open.spotify.com", "spotify.com"],
	hulu: ["hulu.com", "www.hulu.com"],
	disney: ["disneyplus.com", "www.disneyplus.com"],
	hbo: ["hbomax.com", "max.com", "www.max.com"],
	"amazon-prime": ["primevideo.com", "amazon.com/gp/video"],
	youtube: ["youtube.com", "www.youtube.com", "music.youtube.com"],
	"apple-music": ["music.apple.com"],
	"apple-tv": ["tv.apple.com"],

	// Productivity
	github: ["github.com", "www.github.com"],
	notion: ["notion.so", "www.notion.so"],
	slack: ["slack.com", "app.slack.com"],
	figma: ["figma.com", "www.figma.com"],
	linear: ["linear.app"],
	asana: ["asana.com", "app.asana.com"],
	trello: ["trello.com"],
	jira: ["atlassian.net"],
	dropbox: ["dropbox.com", "www.dropbox.com"],
	"google-workspace": [
		"docs.google.com",
		"drive.google.com",
		"sheets.google.com",
	],

	// News & Reading
	nytimes: ["nytimes.com", "www.nytimes.com"],
	wsj: ["wsj.com", "www.wsj.com"],
	medium: ["medium.com"],
	substack: ["substack.com"],

	// Education
	coursera: ["coursera.org", "www.coursera.org"],
	udemy: ["udemy.com", "www.udemy.com"],
	masterclass: ["masterclass.com", "www.masterclass.com"],
	skillshare: ["skillshare.com", "www.skillshare.com"],

	// Fitness
	peloton: ["members.onepeloton.com", "onepeloton.com"],
	strava: ["strava.com", "www.strava.com"],

	// Gaming
	xbox: ["xbox.com", "www.xbox.com"],
	playstation: ["playstation.com", "store.playstation.com"],
	steam: ["store.steampowered.com", "steampowered.com"],
};

// Get all domain mappings
function getAllMappings(): DomainMapping[] {
	const stmt = db.prepare("SELECT * FROM domain_mappings ORDER BY domain");
	return stmt.all() as DomainMapping[];
}

// Get active domain mappings (for extension sync)
function getActiveMappings(): DomainMapping[] {
	const stmt = db.prepare(
		"SELECT * FROM domain_mappings WHERE active = 1 ORDER BY domain",
	);
	return stmt.all() as DomainMapping[];
}

// Get mapping by domain
function getMappingByDomain(domain: string): DomainMapping | null {
	// Normalize domain (remove www. prefix for lookup)
	const normalizedDomain = domain.replace(/^www\./, "");
	const stmt = db.prepare(`
      SELECT * FROM domain_mappings
      WHERE domain = ? OR domain = ? OR domain = ?
    `);
	return stmt.get(
		domain,
		normalizedDomain,
		`www.${normalizedDomain}`,
	) as DomainMapping | null;
}

// Get mappings for a subscription
function getMappingsForSubscription(subscriptionId: string): DomainMapping[] {
	const stmt = db.prepare(
		"SELECT * FROM domain_mappings WHERE subscription_id = ? ORDER BY domain",
	);
	return stmt.all(subscriptionId) as DomainMapping[];
}

// Create a new domain mapping
function createMapping(domain: string, subscriptionId: string): DomainMapping {
	const now = Date.now();
	const id = nanoid();

	// Normalize domain
	const normalizedDomain = domain
		.toLowerCase()
		.replace(/^https?:\/\//, "")
		.replace(/\/.*$/, "");

	const stmt = db.prepare(`
      INSERT INTO domain_mappings (id, domain, subscription_id, active, created_at, updated_at)
      VALUES (?, ?, ?, 1, ?, ?)
    `);

	try {
		stmt.run(id, normalizedDomain, subscriptionId, now, now);
	} catch (error) {
		if (error instanceof Error && error.message.includes("UNIQUE")) {
			throw new Error(`Domain "${normalizedDomain}" is already mapped`);
		}
		throw error;
	}

	const mapping = getMappingByDomain(normalizedDomain);
	if (!mapping) {
		throw new Error("Failed to create mapping");
	}
	return mapping;
}

// Update a domain mapping
function updateMapping(
	domain: string,
	updates: { subscriptionId?: string; active?: boolean },
): DomainMapping | null {
	const existing = getMappingByDomain(domain);
	if (!existing) return null;

	const now = Date.now();
	const setters: string[] = ["updated_at = ?"];
	const values: (string | number)[] = [now];

	if (updates.subscriptionId !== undefined) {
		setters.push("subscription_id = ?");
		values.push(updates.subscriptionId);
	}

	if (updates.active !== undefined) {
		setters.push("active = ?");
		values.push(updates.active ? 1 : 0);
	}

	values.push(existing.id);

	const stmt = db.prepare(
		`UPDATE domain_mappings SET ${setters.join(", ")} WHERE id = ?`,
	);
	stmt.run(...values);

	return getMappingByDomain(domain);
}

// Delete a domain mapping
function deleteMapping(domain: string): boolean {
	const stmt = db.prepare("DELETE FROM domain_mappings WHERE domain = ?");
	const result = stmt.run(domain);
	return result.changes > 0;
}

// Delete mappings for a subscription
function deleteMappingsForSubscription(subscriptionId: string): number {
	const stmt = db.prepare(
		"DELETE FROM domain_mappings WHERE subscription_id = ?",
	);
	const result = stmt.run(subscriptionId);
	return result.changes;
}

// Get suggested domains for a subscription name
function getSuggestedDomains(subscriptionName: string): string[] {
	const normalizedName = subscriptionName
		.toLowerCase()
		.replace(/[^a-z0-9]/g, "");

	for (const [key, domains] of Object.entries(COMMON_DOMAIN_MAPPINGS)) {
		const normalizedKey = key.replace(/-/g, "");
		if (
			normalizedName.includes(normalizedKey) ||
			normalizedKey.includes(normalizedName)
		) {
			return domains;
		}
	}

	return [];
}

// Bulk create mappings for a subscription
function bulkCreateMappings(
	subscriptionId: string,
	domains: string[],
): DomainMapping[] {
	const created: DomainMapping[] = [];

	for (const domain of domains) {
		try {
			const mapping = createMapping(domain, subscriptionId);
			created.push(mapping);
		} catch {}
	}

	return created;
}

// Get domain mapping configuration for browser extension
function getExtensionConfig(): Record<string, string> {
	const mappings = getActiveMappings();
	const config: Record<string, string> = {};

	for (const mapping of mappings) {
		config[mapping.domain] = mapping.subscription_id;
	}

	return config;
}

export const DomainMappingService = {
	getAllMappings,
	getActiveMappings,
	getMappingByDomain,
	getMappingsForSubscription,
	createMapping,
	updateMapping,
	deleteMapping,
	deleteMappingsForSubscription,
	getSuggestedDomains,
	bulkCreateMappings,
	getExtensionConfig,
};
