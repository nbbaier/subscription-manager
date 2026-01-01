// Decision service - Phase 4: Decision workflow tracking
// Manages decision logging, review reminders, and savings tracking

import { db, nanoid } from "../db/index.ts";
import { AnalyticsService } from "./analytics.ts";
import { SubscriptionService } from "./subscription.ts";
import { UsageService } from "./usage.ts";

export type DecisionType =
	| "keep"
	| "cancel"
	| "downgrade"
	| "pause"
	| "review_later";

export interface Decision {
	id: string;
	subscriptionId: string;
	subscriptionName?: string;
	decisionDate: number;
	decision: DecisionType;
	reasoning: string | null;
	costAtDecision: number | null;
	usageAtDecision: number | null;
	valueScoreAtDecision: number | null;
	reviewDate: number | null;
	outcome: string | null;
	savingsSince: number;
	createdAt: number;
	updatedAt: number;
}

export interface DecisionInput {
	subscriptionId: string;
	decision: DecisionType;
	reasoning?: string;
	reviewDays?: number; // Days until review reminder
}

export interface CancellationChecklist {
	subscriptionId: string;
	subscriptionName: string;
	cancellationDifficulty: string | null;
	cancellationUrl: string | null;
	cancellationNotes: string | null;
	contractEndDate: number | null;
	steps: {
		step: string;
		description: string;
		required: boolean;
	}[];
}

export interface SavingsSummary {
	totalMonthlySavings: number;
	totalYearlySavings: number;
	totalSavedSinceTracking: number;
	cancelledSubscriptions: {
		id: string;
		name: string;
		cancelledDate: number;
		monthlyAmount: number;
		totalSaved: number;
	}[];
}

/**
 * Log a decision about a subscription
 */
function logDecision(input: DecisionInput): Decision {
	const subscription = SubscriptionService.getSubscriptionById(
		input.subscriptionId,
	);
	if (!subscription) {
		throw new Error("Subscription not found");
	}

	// Get current metrics for snapshot
	const valueScore = AnalyticsService.calculateValueScore(input.subscriptionId);
	const usageStats = UsageService.getUsageStats(input.subscriptionId);

	// Calculate review date if specified
	const reviewDate = input.reviewDays
		? Date.now() + input.reviewDays * 24 * 60 * 60 * 1000
		: null;

	const now = Date.now();
	const id = nanoid();

	// Get monthly cost
	const subTyped = subscription as unknown as {
		cost_cents?: number;
		costCents?: number;
		billing_frequency?: string;
		billingFrequency?: string;
	};
	const costCents = subTyped.cost_cents ?? subTyped.costCents ?? 0;
	const billingFrequency =
		subTyped.billing_frequency ?? subTyped.billingFrequency ?? "monthly";

	let monthlyCost = costCents;
	if (billingFrequency === "yearly") {
		monthlyCost = costCents / 12;
	} else if (billingFrequency === "weekly") {
		monthlyCost = costCents * 4.33;
	}

	db.prepare(
		`
    INSERT INTO decision_log (
      id, subscription_id, decision_date, decision, reasoning,
      cost_at_decision, usage_at_decision, value_score_at_decision,
      review_date, outcome, savings_since, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
	).run(
		id,
		input.subscriptionId,
		now,
		input.decision,
		input.reasoning || null,
		monthlyCost,
		usageStats.usageThisMonth,
		valueScore?.score || null,
		reviewDate,
		null,
		0,
		now,
		now,
	);

	// If decision is to cancel, update subscription status
	if (input.decision === "cancel") {
		SubscriptionService.updateSubscription(input.subscriptionId, {
			status: "cancelled",
		});
	} else if (input.decision === "pause") {
		SubscriptionService.updateSubscription(input.subscriptionId, {
			status: "paused",
		});
	}

	return {
		id,
		subscriptionId: input.subscriptionId,
		decisionDate: now,
		decision: input.decision,
		reasoning: input.reasoning || null,
		costAtDecision: monthlyCost,
		usageAtDecision: usageStats.usageThisMonth,
		valueScoreAtDecision: valueScore?.score || null,
		reviewDate,
		outcome: null,
		savingsSince: 0,
		createdAt: now,
		updatedAt: now,
	};
}

/**
 * Get decision history for a subscription
 */
function getDecisionHistory(subscriptionId: string): Decision[] {
	const results = db
		.query(
			`
    SELECT * FROM decision_log
    WHERE subscription_id = ?
    ORDER BY decision_date DESC
  `,
		)
		.all(subscriptionId) as {
		id: string;
		subscription_id: string;
		decision_date: number;
		decision: DecisionType;
		reasoning: string | null;
		cost_at_decision: number | null;
		usage_at_decision: number | null;
		value_score_at_decision: number | null;
		review_date: number | null;
		outcome: string | null;
		savings_since: number;
		created_at: number;
		updated_at: number;
	}[];

	return results.map((r) => ({
		id: r.id,
		subscriptionId: r.subscription_id,
		decisionDate: r.decision_date,
		decision: r.decision,
		reasoning: r.reasoning,
		costAtDecision: r.cost_at_decision,
		usageAtDecision: r.usage_at_decision,
		valueScoreAtDecision: r.value_score_at_decision,
		reviewDate: r.review_date,
		outcome: r.outcome,
		savingsSince: r.savings_since,
		createdAt: r.created_at,
		updatedAt: r.updated_at,
	}));
}

/**
 * Get all decisions across all subscriptions
 */
function getAllDecisions(): (Decision & { subscriptionName: string })[] {
	const results = db
		.query(
			`
    SELECT d.*, s.name as subscription_name
    FROM decision_log d
    JOIN subscriptions s ON d.subscription_id = s.id
    ORDER BY d.decision_date DESC
  `,
		)
		.all() as {
		id: string;
		subscription_id: string;
		subscription_name: string;
		decision_date: number;
		decision: DecisionType;
		reasoning: string | null;
		cost_at_decision: number | null;
		usage_at_decision: number | null;
		value_score_at_decision: number | null;
		review_date: number | null;
		outcome: string | null;
		savings_since: number;
		created_at: number;
		updated_at: number;
	}[];

	return results.map((r) => ({
		id: r.id,
		subscriptionId: r.subscription_id,
		subscriptionName: r.subscription_name,
		decisionDate: r.decision_date,
		decision: r.decision,
		reasoning: r.reasoning,
		costAtDecision: r.cost_at_decision,
		usageAtDecision: r.usage_at_decision,
		valueScoreAtDecision: r.value_score_at_decision,
		reviewDate: r.review_date,
		outcome: r.outcome,
		savingsSince: r.savings_since,
		createdAt: r.created_at,
		updatedAt: r.updated_at,
	}));
}

/**
 * Update decision outcome (e.g., "Successfully cancelled", "Switched to annual plan")
 */
function updateDecisionOutcome(decisionId: string, outcome: string): Decision {
	const now = Date.now();

	db.prepare(
		`
    UPDATE decision_log
    SET outcome = ?, updated_at = ?
    WHERE id = ?
  `,
	).run(outcome, now, decisionId);

	const result = db
		.query("SELECT * FROM decision_log WHERE id = ?")
		.get(decisionId) as {
		id: string;
		subscription_id: string;
		decision_date: number;
		decision: DecisionType;
		reasoning: string | null;
		cost_at_decision: number | null;
		usage_at_decision: number | null;
		value_score_at_decision: number | null;
		review_date: number | null;
		outcome: string | null;
		savings_since: number;
		created_at: number;
		updated_at: number;
	} | null;

	if (!result) {
		throw new Error("Decision not found");
	}

	return {
		id: result.id,
		subscriptionId: result.subscription_id,
		decisionDate: result.decision_date,
		decision: result.decision,
		reasoning: result.reasoning,
		costAtDecision: result.cost_at_decision,
		usageAtDecision: result.usage_at_decision,
		valueScoreAtDecision: result.value_score_at_decision,
		reviewDate: result.review_date,
		outcome: result.outcome,
		savingsSince: result.savings_since,
		createdAt: result.created_at,
		updatedAt: result.updated_at,
	};
}

/**
 * Set review reminder date for a decision
 */
function setReviewReminder(decisionId: string, reviewDate: number): void {
	const now = Date.now();

	db.prepare(
		`
    UPDATE decision_log
    SET review_date = ?, updated_at = ?
    WHERE id = ?
  `,
	).run(reviewDate, now, decisionId);
}

/**
 * Get cancellation checklist for a subscription
 */
function getCancellationChecklist(
	subscriptionId: string,
): CancellationChecklist | null {
	const subscription = db
		.query("SELECT * FROM subscriptions WHERE id = ?")
		.get(subscriptionId) as {
		id: string;
		name: string;
		cancellation_difficulty: string | null;
		cancellation_url: string | null;
		cancellation_notes: string | null;
		contract_end_date: number | null;
	} | null;

	if (!subscription) return null;

	// Generate steps based on difficulty
	const steps: CancellationChecklist["steps"] = [];

	steps.push({
		step: "Review usage",
		description:
			"Check your recent usage to confirm you want to cancel",
		required: false,
	});

	steps.push({
		step: "Export data",
		description: "Download any important data before cancelling",
		required: false,
	});

	if (subscription.contract_end_date) {
		const contractEnd = new Date(
			subscription.contract_end_date,
		).toLocaleDateString();
		steps.push({
			step: "Check contract end date",
			description: `Your contract ends on ${contractEnd}. Early cancellation may incur fees.`,
			required: true,
		});
	}

	if (
		subscription.cancellation_difficulty === "hard" ||
		subscription.cancellation_difficulty === "nightmare"
	) {
		steps.push({
			step: "Prepare for retention offers",
			description:
				"Be ready to decline retention offers if you're committed to cancelling",
			required: false,
		});
	}

	if (subscription.cancellation_notes) {
		steps.push({
			step: "Follow specific instructions",
			description: subscription.cancellation_notes,
			required: true,
		});
	}

	steps.push({
		step: "Cancel subscription",
		description: subscription.cancellation_url
			? `Visit the cancellation page: ${subscription.cancellation_url}`
			: "Navigate to your account settings to cancel",
		required: true,
	});

	steps.push({
		step: "Confirm cancellation",
		description:
			"Make sure you receive a confirmation email or see the cancelled status",
		required: true,
	});

	steps.push({
		step: "Log the decision",
		description:
			"Record your cancellation decision in the app for future reference",
		required: false,
	});

	return {
		subscriptionId: subscription.id,
		subscriptionName: subscription.name,
		cancellationDifficulty: subscription.cancellation_difficulty,
		cancellationUrl: subscription.cancellation_url,
		cancellationNotes: subscription.cancellation_notes,
		contractEndDate: subscription.contract_end_date,
		steps,
	};
}

/**
 * Calculate savings since cancelling subscriptions
 */
function getSavingsSummary(): SavingsSummary {
	// Get all cancellation decisions
	const cancellations = db
		.query(
			`
    SELECT d.*, s.name as subscription_name
    FROM decision_log d
    JOIN subscriptions s ON d.subscription_id = s.id
    WHERE d.decision = 'cancel'
    ORDER BY d.decision_date DESC
  `,
		)
		.all() as {
		id: string;
		subscription_id: string;
		subscription_name: string;
		decision_date: number;
		cost_at_decision: number;
	}[];

	const now = Date.now();
	let totalMonthlySavings = 0;
	let totalSavedSinceTracking = 0;

	const cancelledSubscriptions = cancellations.map((c) => {
		const monthsSinceCancellation =
			(now - c.decision_date) / (30 * 24 * 60 * 60 * 1000);
		const totalSaved = Math.floor(
			c.cost_at_decision * monthsSinceCancellation,
		);

		totalMonthlySavings += c.cost_at_decision;
		totalSavedSinceTracking += totalSaved;

		// Update the savings_since field in the database
		db.prepare(
			`
      UPDATE decision_log SET savings_since = ? WHERE id = ?
    `,
		).run(totalSaved, c.id);

		return {
			id: c.subscription_id,
			name: c.subscription_name,
			cancelledDate: c.decision_date,
			monthlyAmount: c.cost_at_decision,
			totalSaved,
		};
	});

	return {
		totalMonthlySavings,
		totalYearlySavings: totalMonthlySavings * 12,
		totalSavedSinceTracking,
		cancelledSubscriptions,
	};
}

/**
 * Get decisions pending review (review date has passed or is upcoming)
 */
function getPendingReviews(): (Decision & { subscriptionName: string })[] {
	const now = Date.now();
	const oneWeekFromNow = now + 7 * 24 * 60 * 60 * 1000;

	const results = db
		.query(
			`
    SELECT d.*, s.name as subscription_name
    FROM decision_log d
    JOIN subscriptions s ON d.subscription_id = s.id
    WHERE d.review_date IS NOT NULL
      AND d.review_date <= ?
      AND s.status = 'active'
    ORDER BY d.review_date ASC
  `,
		)
		.all(oneWeekFromNow) as {
		id: string;
		subscription_id: string;
		subscription_name: string;
		decision_date: number;
		decision: DecisionType;
		reasoning: string | null;
		cost_at_decision: number | null;
		usage_at_decision: number | null;
		value_score_at_decision: number | null;
		review_date: number | null;
		outcome: string | null;
		savings_since: number;
		created_at: number;
		updated_at: number;
	}[];

	return results.map((r) => ({
		id: r.id,
		subscriptionId: r.subscription_id,
		subscriptionName: r.subscription_name,
		decisionDate: r.decision_date,
		decision: r.decision,
		reasoning: r.reasoning,
		costAtDecision: r.cost_at_decision,
		usageAtDecision: r.usage_at_decision,
		valueScoreAtDecision: r.value_score_at_decision,
		reviewDate: r.review_date,
		outcome: r.outcome,
		savingsSince: r.savings_since,
		createdAt: r.created_at,
		updatedAt: r.updated_at,
	}));
}

export const DecisionService = {
	logDecision,
	getDecisionHistory,
	getAllDecisions,
	updateDecisionOutcome,
	setReviewReminder,
	getCancellationChecklist,
	getSavingsSummary,
	getPendingReviews,
};
