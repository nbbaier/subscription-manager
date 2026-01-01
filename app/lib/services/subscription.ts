// Subscription service - business logic layer
import { db, nanoid } from "../db/index.ts";

export interface Subscription {
	id: string;
	name: string;
	description?: string;
	costCents: number;
	currency?: string;
	billingFrequency: "monthly" | "yearly" | "weekly" | "one-time";
	billingDay?: number;
	nextBillingDate?: number;
	category?: string;
	tags?: string;
	usageTrackingType: "manual" | "api" | "browser" | "email";
	expectedUsagePerMonth?: number;
	status?: "active" | "paused" | "cancelled" | "trial";
	createdAt: number;
	updatedAt: number;
	iconUrl?: string;
	websiteUrl?: string;
}

export interface NewSubscription {
	name: string;
	description?: string;
	costCents: number;
	billingFrequency: "monthly" | "yearly" | "weekly" | "one-time";
	category?: string;
	usageTrackingType?: "manual" | "api" | "browser" | "email";
}

function getAllSubscriptions(): Subscription[] {
	const query = db.query(
		"SELECT * FROM subscriptions ORDER BY created_at DESC",
	);
	return query.all() as Subscription[];
}

function getActiveSubscriptions(): Subscription[] {
	const query = db.query(
		"SELECT * FROM subscriptions WHERE status = 'active' ORDER BY created_at DESC",
	);
	return query.all() as Subscription[];
}

function getSubscriptionById(id: string): Subscription | null {
	const query = db.query("SELECT * FROM subscriptions WHERE id = ?");
	return query.get(id) as Subscription | null;
}

function createSubscription(data: NewSubscription): Subscription {
	const id = nanoid();
	const now = Date.now();

	const subscription: Subscription = {
		id,
		name: data.name,
		description: data.description,
		costCents: data.costCents,
		currency: "USD",
		billingFrequency: data.billingFrequency,
		category: data.category,
		usageTrackingType: data.usageTrackingType || "manual",
		status: "active",
		createdAt: now,
		updatedAt: now,
	};

	const query = db.prepare(`
      INSERT INTO subscriptions (
        id, name, description, cost_cents, currency, billing_frequency,
        category, usage_tracking_type, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

	query.run(
		subscription.id,
		subscription.name,
		subscription.description || null,
		subscription.costCents,
		subscription.currency || "USD",
		subscription.billingFrequency,
		subscription.category || null,
		subscription.usageTrackingType,
		subscription.status || "active",
		subscription.createdAt,
		subscription.updatedAt,
	);

	return subscription;
}

function updateSubscription(
	id: string,
	data: Partial<NewSubscription>,
): Subscription | null {
	const existing = getSubscriptionById(id);
	if (!existing) return null;

	const updated = {
		...existing,
		...data,
		updatedAt: Date.now(),
	};

	const query = db.prepare(`
      UPDATE subscriptions
      SET name = ?, description = ?, cost_cents = ?, billing_frequency = ?,
          category = ?, updated_at = ?
      WHERE id = ?
    `);

	query.run(
		updated.name,
		updated.description || null,
		updated.costCents,
		updated.billingFrequency,
		updated.category || null,
		updated.updatedAt,
		id,
	);

	return getSubscriptionById(id);
}

function deleteSubscription(id: string): boolean {
	// First delete all associated usage events
	const deleteEvents = db.prepare(
		"DELETE FROM usage_events WHERE subscription_id = ?",
	);
	deleteEvents.run(id);

	// Then delete the subscription
	const query = db.prepare("DELETE FROM subscriptions WHERE id = ?");
	const result = query.run(id);
	return result.changes > 0;
}

function getMonthlyTotal(): number {
	const query = db.query(`
      SELECT SUM(
        CASE
          WHEN billing_frequency = 'monthly' THEN cost_cents
          WHEN billing_frequency = 'yearly' THEN cost_cents / 12
          WHEN billing_frequency = 'weekly' THEN cost_cents * 4.33
          ELSE 0
        END
      ) as total
      FROM subscriptions
      WHERE status = 'active'
    `);

	const result = query.get() as { total: number } | null;
	return result?.total || 0;
}

function getYearlyTotal(): number {
	const query = db.query(`
      SELECT SUM(
        CASE
          WHEN billing_frequency = 'monthly' THEN cost_cents * 12
          WHEN billing_frequency = 'yearly' THEN cost_cents
          WHEN billing_frequency = 'weekly' THEN cost_cents * 52
          ELSE cost_cents
        END
      ) as total
      FROM subscriptions
      WHERE status = 'active'
    `);

	const result = query.get() as { total: number } | null;
	return result?.total || 0;
}

export const SubscriptionService = {
	getAllSubscriptions,
	getActiveSubscriptions,
	getSubscriptionById,
	createSubscription,
	updateSubscription,
	deleteSubscription,
	getMonthlyTotal,
	getYearlyTotal,
};
