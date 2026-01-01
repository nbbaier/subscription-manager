// Usage tracking service
import { db, nanoid } from "../db/index.ts";

export interface UsageEvent {
	id: string;
	subscriptionId: string;
	timestamp: number;
	source: "manual" | "api" | "browser" | "email" | "import";
	usageType?: string;
	quantity?: number;
	unit?: string;
	notes?: string;
	metadata?: string;
}

export interface NewUsageEvent {
	subscriptionId: string;
	timestamp?: number;
	source?: UsageEvent["source"];
	usageType?: string;
	quantity?: number;
	unit?: string;
	notes?: string;
	metadata?: string;
}

export interface UsageStats {
	subscriptionId: string;
	totalEvents: number;
	lastUsed?: number;
	daysSinceLastUse?: number;
	usageThisMonth: number;
	costPerUse?: number;
}

function logUsage(data: NewUsageEvent): UsageEvent {
	const id = nanoid();

	const event: UsageEvent = {
		id,
		subscriptionId: data.subscriptionId,
		timestamp: data.timestamp || Date.now(),
		source: data.source || "manual",
		usageType: data.usageType,
		quantity: data.quantity ?? 1,
		unit: data.unit,
		notes: data.notes,
		metadata: data.metadata,
	};

	const query = db.prepare(`
      INSERT INTO usage_events (
        id, subscription_id, timestamp, source, usage_type, quantity, unit, notes, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

	query.run(
		event.id,
		event.subscriptionId,
		event.timestamp,
		event.source,
		event.usageType || null,
		event.quantity ?? null,
		event.unit || null,
		event.notes || null,
		event.metadata || null,
	);

	return event;
}

function getUsageForSubscription(
	subscriptionId: string,
	limit: number = 50,
): UsageEvent[] {
	const query = db.query(`
      SELECT * FROM usage_events
      WHERE subscription_id = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `);

	return query.all(subscriptionId, limit) as UsageEvent[];
}

function getUsageStats(subscriptionId: string): UsageStats {
	// Get total events
	const totalQuery = db.query(`
      SELECT COUNT(*) as count FROM usage_events
      WHERE subscription_id = ?
    `);
	const totalResult = totalQuery.get(subscriptionId) as {
		count: number;
	} | null;
	const totalEvents = totalResult?.count || 0;

	// Get last used timestamp
	const lastUsedQuery = db.query(`
      SELECT MAX(timestamp) as last_used FROM usage_events
      WHERE subscription_id = ?
    `);
	const lastUsedResult = lastUsedQuery.get(subscriptionId) as {
		last_used: number;
	} | null;
	const lastUsed = lastUsedResult?.last_used;

	// Calculate days since last use
	const daysSinceLastUse = lastUsed
		? Math.floor((Date.now() - lastUsed) / (1000 * 60 * 60 * 24))
		: undefined;

	// Get usage this month
	const monthStart = new Date();
	monthStart.setDate(1);
	monthStart.setHours(0, 0, 0, 0);
	const monthStartTimestamp = monthStart.getTime();

	const monthQuery = db.query(`
      SELECT COUNT(*) as count FROM usage_events
      WHERE subscription_id = ? AND timestamp >= ?
    `);
	const monthResult = monthQuery.get(subscriptionId, monthStartTimestamp) as {
		count: number;
	} | null;
	const usageThisMonth = monthResult?.count || 0;

	// Get subscription cost to calculate cost per use
	const subscriptionQuery = db.query(`
      SELECT cost_cents, billing_frequency FROM subscriptions WHERE id = ?
    `);
	const subscription = subscriptionQuery.get(subscriptionId) as {
		cost_cents: number;
		billing_frequency: string;
	} | null;

	let costPerUse: number | undefined;
	if (subscription && totalEvents > 0) {
		let monthlyCost = subscription.cost_cents;
		if (subscription.billing_frequency === "yearly") {
			monthlyCost = subscription.cost_cents / 12;
		} else if (subscription.billing_frequency === "weekly") {
			monthlyCost = subscription.cost_cents * 4.33;
		}

		// Cost per use for the month
		if (usageThisMonth > 0) {
			costPerUse = monthlyCost / usageThisMonth;
		}
	}

	return {
		subscriptionId,
		totalEvents,
		lastUsed,
		daysSinceLastUse,
		usageThisMonth,
		costPerUse,
	};
}

function deleteUsageEvent(id: string): boolean {
	const query = db.prepare("DELETE FROM usage_events WHERE id = ?");
	const result = query.run(id);
	return result.changes > 0;
}

export const UsageService = {
	logUsage,
	getUsageForSubscription,
	getUsageStats,
	deleteUsageEvent,
};
