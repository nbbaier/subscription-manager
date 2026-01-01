// Recommendation service - Phase 4: Decision Engine
// Provides recommendations for subscriptions to cancel, keep, or review

import { db } from "../db/index.ts";
import { AnalyticsService } from "./analytics.ts";
import { SubscriptionService } from "./subscription.ts";
import { UsageService } from "./usage.ts";

// Difficulty scores for cancellation (lower = easier)
const CANCELLATION_DIFFICULTY_SCORES: Record<string, number> = {
	easy: 10,
	medium: 30,
	hard: 60,
	nightmare: 90,
};

// Weights for recommendation scoring
const RECOMMENDATION_WEIGHTS = {
	valueScore: 0.35, // How much value you're getting
	usageRecency: 0.25, // How recently you used it
	costImpact: 0.25, // Monthly cost relative to total spending
	cancellationEase: 0.15, // How easy it is to cancel
};

export interface Recommendation {
	subscriptionId: string;
	subscriptionName: string;
	action: "consider_cancelling" | "review" | "keep" | "quick_win";
	priority: "high" | "medium" | "low";
	score: number; // 0-100, higher = more recommended to cancel
	reasons: string[];
	savings: {
		monthly: number;
		yearly: number;
	};
	metrics: {
		valueScore: number;
		daysSinceLastUse: number | null;
		costPerUse: number | null;
		monthlyCost: number;
		cancellationDifficulty: string | null;
	};
}

export interface QuickWin {
	subscriptionId: string;
	subscriptionName: string;
	monthlySavings: number;
	yearlySavings: number;
	reason: string;
	cancellationDifficulty: string;
	daysSinceLastUse: number | null;
}

export interface RecommendationSummary {
	totalPotentialSavings: {
		monthly: number;
		yearly: number;
	};
	quickWins: QuickWin[];
	recommendations: Recommendation[];
	reviewReminders: {
		subscriptionId: string;
		subscriptionName: string;
		reviewDate: number;
		lastDecision: string;
	}[];
}

/**
 * Calculate a cancellation recommendation score for a subscription
 * Higher score = more recommended to cancel
 */
function calculateCancellationScore(subscriptionId: string): {
	score: number;
	reasons: string[];
	metrics: Recommendation["metrics"];
} | null {
	const subscription = db
		.query("SELECT * FROM subscriptions WHERE id = ?")
		.get(subscriptionId) as {
		id: string;
		name: string;
		cost_cents: number;
		billing_frequency: string;
		cancellation_difficulty: string | null;
		status: string;
	} | null;

	if (!subscription || subscription.status !== "active") return null;

	const valueScore = AnalyticsService.calculateValueScore(subscriptionId);
	const usageStats = UsageService.getUsageStats(subscriptionId);

	if (!valueScore) return null;

	// Calculate monthly cost
	let monthlyCost = subscription.cost_cents;
	if (subscription.billing_frequency === "yearly") {
		monthlyCost = subscription.cost_cents / 12;
	} else if (subscription.billing_frequency === "weekly") {
		monthlyCost = subscription.cost_cents * 4.33;
	}

	// Get total monthly spending for cost impact calculation
	const totalMonthly = SubscriptionService.getMonthlyTotal();
	const costImpact = totalMonthly > 0 ? (monthlyCost / totalMonthly) * 100 : 0;

	const reasons: string[] = [];

	// Value score component (inverted: low value = high cancel score)
	const valueComponent = 100 - valueScore.score;
	if (valueScore.score < 30) {
		reasons.push(`Very low value score (${valueScore.score}/100)`);
	} else if (valueScore.score < 50) {
		reasons.push(`Low value score (${valueScore.score}/100)`);
	}

	// Usage recency component
	let recencyComponent = 0;
	const daysSinceLastUse = usageStats.daysSinceLastUse;
	if (daysSinceLastUse !== undefined) {
		if (daysSinceLastUse >= 60) {
			recencyComponent = 100;
			reasons.push(`No usage in ${daysSinceLastUse} days`);
		} else if (daysSinceLastUse >= 30) {
			recencyComponent = 75;
			reasons.push(`No usage in ${daysSinceLastUse} days`);
		} else if (daysSinceLastUse >= 14) {
			recencyComponent = 50;
		} else {
			recencyComponent = Math.max(0, daysSinceLastUse * 3);
		}
	} else if (usageStats.totalEvents === 0) {
		recencyComponent = 100;
		reasons.push("Never used since added");
	}

	// Cost impact component (higher cost = more impactful to cancel)
	const costComponent = Math.min(100, costImpact * 5); // 20% of spending = 100
	if (monthlyCost >= 5000) {
		// $50+/month
		reasons.push(`High monthly cost ($${(monthlyCost / 100).toFixed(2)})`);
	}

	// Cancellation ease component (easier = more attractive to cancel)
	const difficulty = subscription.cancellation_difficulty || "medium";
	const difficultyScore = CANCELLATION_DIFFICULTY_SCORES[difficulty] || 30;
	const easeComponent = 100 - difficultyScore;

	// Cost per use analysis
	if (valueScore.costPerUse && valueScore.costPerUse > 1500) {
		reasons.push(
			`High cost per use ($${(valueScore.costPerUse / 100).toFixed(2)})`,
		);
	}

	// Calculate weighted score
	const score = Math.round(
		valueComponent * RECOMMENDATION_WEIGHTS.valueScore +
			recencyComponent * RECOMMENDATION_WEIGHTS.usageRecency +
			costComponent * RECOMMENDATION_WEIGHTS.costImpact +
			easeComponent * RECOMMENDATION_WEIGHTS.cancellationEase,
	);

	return {
		score: Math.min(100, Math.max(0, score)),
		reasons,
		metrics: {
			valueScore: valueScore.score,
			daysSinceLastUse: daysSinceLastUse ?? null,
			costPerUse: valueScore.costPerUse,
			monthlyCost,
			cancellationDifficulty: subscription.cancellation_difficulty,
		},
	};
}

/**
 * Get all recommendations sorted by priority
 */
function getRecommendations(): Recommendation[] {
	const subscriptions = SubscriptionService.getActiveSubscriptions();
	const recommendations: Recommendation[] = [];

	for (const sub of subscriptions) {
		const result = calculateCancellationScore(sub.id);
		if (!result) continue;

		// Calculate savings
		const monthlySavings = result.metrics.monthlyCost;
		const yearlySavings = monthlySavings * 12;

		// Determine action and priority
		let action: Recommendation["action"];
		let priority: Recommendation["priority"];

		// Check if it's a quick win (easy to cancel + low value)
		const isQuickWin =
			result.score >= 60 &&
			(result.metrics.cancellationDifficulty === "easy" ||
				!result.metrics.cancellationDifficulty);

		if (isQuickWin) {
			action = "quick_win";
			priority = "high";
		} else if (result.score >= 70) {
			action = "consider_cancelling";
			priority = "high";
		} else if (result.score >= 50) {
			action = "consider_cancelling";
			priority = "medium";
		} else if (result.score >= 30) {
			action = "review";
			priority = "low";
		} else {
			action = "keep";
			priority = "low";
		}

		recommendations.push({
			subscriptionId: sub.id,
			subscriptionName: sub.name,
			action,
			priority,
			score: result.score,
			reasons: result.reasons,
			savings: {
				monthly: monthlySavings,
				yearly: yearlySavings,
			},
			metrics: result.metrics,
		});
	}

	// Sort by score (highest first)
	return recommendations.sort((a, b) => b.score - a.score);
}

/**
 * Get quick wins - easy cancellations with high impact
 */
function getQuickWins(): QuickWin[] {
	const recommendations = getRecommendations();

	return recommendations
		.filter((r) => r.action === "quick_win")
		.map((r) => ({
			subscriptionId: r.subscriptionId,
			subscriptionName: r.subscriptionName,
			monthlySavings: r.savings.monthly,
			yearlySavings: r.savings.yearly,
			reason: r.reasons[0] || "Low usage and easy to cancel",
			cancellationDifficulty: r.metrics.cancellationDifficulty || "easy",
			daysSinceLastUse: r.metrics.daysSinceLastUse,
		}));
}

/**
 * Get subscriptions that need review based on scheduled review dates
 */
function getReviewReminders(): RecommendationSummary["reviewReminders"] {
	const now = Date.now();
	const oneWeekFromNow = now + 7 * 24 * 60 * 60 * 1000;

	const results = db
		.query(
			`
    SELECT
      d.subscription_id,
      s.name as subscription_name,
      d.review_date,
      d.decision as last_decision
    FROM decision_log d
    JOIN subscriptions s ON d.subscription_id = s.id
    WHERE d.review_date IS NOT NULL
      AND d.review_date <= ?
      AND s.status = 'active'
    ORDER BY d.review_date ASC
  `,
		)
		.all(oneWeekFromNow) as {
		subscription_id: string;
		subscription_name: string;
		review_date: number;
		last_decision: string;
	}[];

	return results.map((r) => ({
		subscriptionId: r.subscription_id,
		subscriptionName: r.subscription_name,
		reviewDate: r.review_date,
		lastDecision: r.last_decision,
	}));
}

/**
 * Get full recommendation summary with potential savings
 */
function getRecommendationSummary(): RecommendationSummary {
	const recommendations = getRecommendations();
	const quickWins = recommendations.filter((r) => r.action === "quick_win");
	const reviewReminders = getReviewReminders();

	// Calculate total potential savings from high-priority recommendations
	const highPriority = recommendations.filter(
		(r) =>
			r.action === "consider_cancelling" ||
			(r.action === "quick_win" && r.priority === "high"),
	);

	const totalPotentialSavings = highPriority.reduce(
		(acc, r) => ({
			monthly: acc.monthly + r.savings.monthly,
			yearly: acc.yearly + r.savings.yearly,
		}),
		{ monthly: 0, yearly: 0 },
	);

	return {
		totalPotentialSavings,
		quickWins: quickWins.map((r) => ({
			subscriptionId: r.subscriptionId,
			subscriptionName: r.subscriptionName,
			monthlySavings: r.savings.monthly,
			yearlySavings: r.savings.yearly,
			reason: r.reasons[0] || "Low usage and easy to cancel",
			cancellationDifficulty: r.metrics.cancellationDifficulty || "easy",
			daysSinceLastUse: r.metrics.daysSinceLastUse,
		})),
		recommendations,
		reviewReminders,
	};
}

/**
 * Get subscriptions with overlapping functionality
 */
function getOverlappingSubscriptions(): {
	category: string;
	subscriptions: {
		id: string;
		name: string;
		monthlyCost: number;
		valueScore: number;
	}[];
	combinedMonthlyCost: number;
	suggestion: string;
}[] {
	const subscriptions = SubscriptionService.getActiveSubscriptions();
	const byCategory = new Map<
		string,
		{
			id: string;
			name: string;
			monthlyCost: number;
			valueScore: number;
		}[]
	>();

	for (const sub of subscriptions) {
		const subTyped = sub as unknown as {
			id: string;
			name: string;
			category: string | null;
			cost_cents: number;
			billing_frequency: string;
		};

		const category = subTyped.category || "other";
		const valueScore = AnalyticsService.calculateValueScore(sub.id);

		let monthlyCost = subTyped.cost_cents;
		if (subTyped.billing_frequency === "yearly") {
			monthlyCost = subTyped.cost_cents / 12;
		} else if (subTyped.billing_frequency === "weekly") {
			monthlyCost = subTyped.cost_cents * 4.33;
		}

		if (!byCategory.has(category)) {
			byCategory.set(category, []);
		}

		byCategory.get(category)?.push({
			id: sub.id,
			name: sub.name,
			monthlyCost,
			valueScore: valueScore?.score || 0,
		});
	}

	// Filter to categories with multiple subscriptions
	const overlaps: ReturnType<typeof getOverlappingSubscriptions> = [];

	for (const [category, subs] of byCategory.entries()) {
		if (subs.length >= 2) {
			const combinedCost = subs.reduce((acc, s) => acc + s.monthlyCost, 0);
			const lowestValue = subs.reduce((min, s) =>
				s.valueScore < min.valueScore ? s : min,
			);

			if (subs[0] && lowestValue) {
				overlaps.push({
					category,
					subscriptions: subs.sort((a, b) => b.valueScore - a.valueScore),
					combinedMonthlyCost: combinedCost,
					suggestion: `Consider keeping ${subs[0].name} (highest value) and cancelling ${lowestValue.name}`,
				});
			}
		}
	}

	return overlaps.sort((a, b) => b.combinedMonthlyCost - a.combinedMonthlyCost);
}

export const RecommendationService = {
	calculateCancellationScore,
	getRecommendations,
	getQuickWins,
	getReviewReminders,
	getRecommendationSummary,
	getOverlappingSubscriptions,
};
