// ROI Analysis service - Phase 4: Return on Investment calculations
// Industry comparisons, value rankings, savings projections, and annual summaries

import { db } from "../db/index.ts";
import { AnalyticsService } from "./analytics.ts";
import { DecisionService } from "./decision.ts";
import { SubscriptionService } from "./subscription.ts";
import { UsageService } from "./usage.ts";

// Industry average costs by category (in cents per month)
const INDUSTRY_AVERAGES: Record<
	string,
	{
		avgMonthlyCost: number;
		lowTier: number;
		highTier: number;
		description: string;
	}
> = {
	streaming: {
		avgMonthlyCost: 1500, // $15.00
		lowTier: 800, // $8.00
		highTier: 2500, // $25.00
		description: "Video streaming services (Netflix, Hulu, Disney+)",
	},
	music: {
		avgMonthlyCost: 1100, // $11.00
		lowTier: 500, // $5.00
		highTier: 1700, // $17.00 (family plans)
		description: "Music streaming services (Spotify, Apple Music)",
	},
	fitness: {
		avgMonthlyCost: 4000, // $40.00
		lowTier: 1000, // $10.00 (app-only)
		highTier: 15000, // $150.00 (premium gyms)
		description: "Fitness subscriptions (gyms, apps, classes)",
	},
	productivity: {
		avgMonthlyCost: 1500, // $15.00
		lowTier: 500, // $5.00
		highTier: 5000, // $50.00 (business tools)
		description: "Productivity tools (Notion, Todoist, Office 365)",
	},
	news: {
		avgMonthlyCost: 1200, // $12.00
		lowTier: 500, // $5.00
		highTier: 4000, // $40.00 (premium publications)
		description: "News and publications (NYTimes, WSJ)",
	},
	gaming: {
		avgMonthlyCost: 1500, // $15.00
		lowTier: 500, // $5.00
		highTier: 2000, // $20.00
		description: "Gaming subscriptions (Xbox Game Pass, PlayStation Plus)",
	},
	education: {
		avgMonthlyCost: 2500, // $25.00
		lowTier: 1000, // $10.00
		highTier: 10000, // $100.00 (professional courses)
		description: "Learning platforms (Coursera, LinkedIn Learning)",
	},
	cloud: {
		avgMonthlyCost: 1000, // $10.00
		lowTier: 100, // $1.00
		highTier: 5000, // $50.00
		description: "Cloud storage and services (iCloud, Dropbox, Google One)",
	},
	other: {
		avgMonthlyCost: 1500, // $15.00
		lowTier: 500,
		highTier: 5000,
		description: "Other subscription services",
	},
};

export interface IndustryComparison {
	subscriptionId: string;
	subscriptionName: string;
	category: string;
	monthlyCost: number;
	industryAverage: number;
	industryLow: number;
	industryHigh: number;
	percentageVsAverage: number; // Negative = below average (good), Positive = above
	tier: "below_average" | "average" | "above_average" | "premium";
	insight: string;
}

export interface ValuePerDollar {
	subscriptionId: string;
	subscriptionName: string;
	category: string;
	monthlyCost: number;
	usageThisMonth: number;
	valueScore: number;
	valuePerDollar: number; // Higher = better value
	rank: number;
	insight: string;
}

export interface WhatIfScenario {
	subscriptionsToCancel: {
		id: string;
		name: string;
		monthlyCost: number;
	}[];
	monthlySavings: number;
	yearlySavings: number;
	fiveYearSavings: number;
	remainingMonthlySpend: number;
	percentageReduction: number;
}

export interface AnnualSummary {
	year: number;
	totalSpent: number;
	averageMonthlySpend: number;
	highestMonth: {
		month: string;
		amount: number;
	};
	lowestMonth: {
		month: string;
		amount: number;
	};
	categoryBreakdown: {
		category: string;
		total: number;
		percentage: number;
	}[];
	subscriptionChanges: {
		added: { name: string; date: number; cost: number }[];
		cancelled: { name: string; date: number; previousCost: number }[];
	};
	savingsFromCancellations: number;
	topValueSubscriptions: {
		name: string;
		valueScore: number;
		costPerUse: number | null;
	}[];
	worstValueSubscriptions: {
		name: string;
		valueScore: number;
		costPerUse: number | null;
	}[];
	insights: string[];
}

/**
 * Compare subscription costs to industry averages
 */
function getIndustryComparisons(): IndustryComparison[] {
	const subscriptions = SubscriptionService.getActiveSubscriptions();
	const comparisons: IndustryComparison[] = [];

	for (const sub of subscriptions) {
		const subTyped = sub as unknown as {
			id: string;
			name: string;
			category: string | null;
			cost_cents: number;
			billing_frequency: string;
		};

		const category = subTyped.category || "other";
		const industry = INDUSTRY_AVERAGES[category] || INDUSTRY_AVERAGES.other;

		let monthlyCost = subTyped.cost_cents;
		if (subTyped.billing_frequency === "yearly") {
			monthlyCost = subTyped.cost_cents / 12;
		} else if (subTyped.billing_frequency === "weekly") {
			monthlyCost = subTyped.cost_cents * 4.33;
		}

		const percentageVsAverage =
			((monthlyCost - industry.avgMonthlyCost) / industry.avgMonthlyCost) * 100;

		let tier: IndustryComparison["tier"];
		if (monthlyCost < industry.lowTier) {
			tier = "below_average";
		} else if (monthlyCost <= industry.avgMonthlyCost * 1.1) {
			tier = "average";
		} else if (monthlyCost <= industry.highTier) {
			tier = "above_average";
		} else {
			tier = "premium";
		}

		let insight: string;
		if (percentageVsAverage < -20) {
			insight = `Great deal! ${Math.abs(Math.round(percentageVsAverage))}% below industry average.`;
		} else if (percentageVsAverage < 10) {
			insight = "Cost is in line with industry average.";
		} else if (percentageVsAverage < 50) {
			insight = `${Math.round(percentageVsAverage)}% above average. Consider if the premium features are worth it.`;
		} else {
			insight = `Significantly above average (${Math.round(percentageVsAverage)}%). Review if this provides proportional value.`;
		}

		comparisons.push({
			subscriptionId: sub.id,
			subscriptionName: sub.name,
			category,
			monthlyCost,
			industryAverage: industry.avgMonthlyCost,
			industryLow: industry.lowTier,
			industryHigh: industry.highTier,
			percentageVsAverage: Math.round(percentageVsAverage),
			tier,
			insight,
		});
	}

	return comparisons.sort((a, b) => b.percentageVsAverage - a.percentageVsAverage);
}

/**
 * Get value per dollar rankings
 */
function getValuePerDollarRankings(): ValuePerDollar[] {
	const subscriptions = SubscriptionService.getActiveSubscriptions();
	const rankings: ValuePerDollar[] = [];

	for (const sub of subscriptions) {
		const subTyped = sub as unknown as {
			id: string;
			name: string;
			category: string | null;
			cost_cents: number;
			billing_frequency: string;
		};

		const valueScore = AnalyticsService.calculateValueScore(sub.id);
		const usageStats = UsageService.getUsageStats(sub.id);

		if (!valueScore) continue;

		let monthlyCost = subTyped.cost_cents;
		if (subTyped.billing_frequency === "yearly") {
			monthlyCost = subTyped.cost_cents / 12;
		} else if (subTyped.billing_frequency === "weekly") {
			monthlyCost = subTyped.cost_cents * 4.33;
		}

		// Calculate value per dollar (value score points per dollar spent)
		const monthlyCostDollars = monthlyCost / 100;
		const valuePerDollar =
			monthlyCostDollars > 0 ? valueScore.score / monthlyCostDollars : 0;

		let insight: string;
		if (valuePerDollar > 10) {
			insight = "Excellent value for money!";
		} else if (valuePerDollar > 5) {
			insight = "Good value for the price.";
		} else if (valuePerDollar > 2) {
			insight = "Moderate value. Consider increasing usage.";
		} else {
			insight = "Low value per dollar. Review if worth keeping.";
		}

		rankings.push({
			subscriptionId: sub.id,
			subscriptionName: sub.name,
			category: subTyped.category || "other",
			monthlyCost,
			usageThisMonth: usageStats.usageThisMonth,
			valueScore: valueScore.score,
			valuePerDollar: Math.round(valuePerDollar * 100) / 100,
			rank: 0, // Will be set after sorting
			insight,
		});
	}

	// Sort by value per dollar and assign ranks
	rankings.sort((a, b) => b.valuePerDollar - a.valuePerDollar);
	rankings.forEach((r, index) => {
		r.rank = index + 1;
	});

	return rankings;
}

/**
 * Calculate hypothetical savings if certain subscriptions were cancelled
 */
function calculateWhatIf(subscriptionIds: string[]): WhatIfScenario {
	const currentMonthlyTotal = SubscriptionService.getMonthlyTotal();

	const subscriptionsToCancel: WhatIfScenario["subscriptionsToCancel"] = [];
	let monthlySavings = 0;

	for (const id of subscriptionIds) {
		const sub = db.query("SELECT * FROM subscriptions WHERE id = ?").get(id) as {
			id: string;
			name: string;
			cost_cents: number;
			billing_frequency: string;
		} | null;

		if (!sub) continue;

		let monthlyCost = sub.cost_cents;
		if (sub.billing_frequency === "yearly") {
			monthlyCost = sub.cost_cents / 12;
		} else if (sub.billing_frequency === "weekly") {
			monthlyCost = sub.cost_cents * 4.33;
		}

		subscriptionsToCancel.push({
			id: sub.id,
			name: sub.name,
			monthlyCost,
		});

		monthlySavings += monthlyCost;
	}

	const yearlySavings = monthlySavings * 12;
	const fiveYearSavings = yearlySavings * 5;
	const remainingMonthlySpend = currentMonthlyTotal - monthlySavings;
	const percentageReduction =
		currentMonthlyTotal > 0
			? Math.round((monthlySavings / currentMonthlyTotal) * 100)
			: 0;

	return {
		subscriptionsToCancel,
		monthlySavings,
		yearlySavings,
		fiveYearSavings,
		remainingMonthlySpend,
		percentageReduction,
	};
}

/**
 * Generate annual review summary
 */
function generateAnnualSummary(year?: number): AnnualSummary {
	const targetYear = year || new Date().getFullYear();
	const yearStart = new Date(targetYear, 0, 1).getTime();
	const yearEnd = new Date(targetYear, 11, 31, 23, 59, 59).getTime();

	// Get all subscriptions that were active during the year
	const subscriptions = SubscriptionService.getAllSubscriptions();

	// Calculate monthly spending for each month
	const monthlySpending: { month: string; amount: number }[] = [];
	let totalSpent = 0;

	for (let month = 0; month < 12; month++) {
		const monthStart = new Date(targetYear, month, 1).getTime();
		const monthEnd = new Date(targetYear, month + 1, 0).getTime();
		let monthTotal = 0;

		for (const sub of subscriptions) {
			const subTyped = sub as unknown as {
				status: string;
				created_at: number;
				cost_cents: number;
				billing_frequency: string;
			};

			// Check if subscription was active during this month
			if (subTyped.created_at > monthEnd) continue;

			let monthlyCost = subTyped.cost_cents;
			if (subTyped.billing_frequency === "yearly") {
				monthlyCost = subTyped.cost_cents / 12;
			} else if (subTyped.billing_frequency === "weekly") {
				monthlyCost = subTyped.cost_cents * 4.33;
			}

			monthTotal += monthlyCost;
		}

		const monthName = new Date(targetYear, month, 1).toLocaleDateString(
			"en-US",
			{ month: "short" },
		);
		monthlySpending.push({ month: monthName, amount: monthTotal });
		totalSpent += monthTotal;
	}

	// Find highest and lowest months
	const sortedMonths = [...monthlySpending].sort(
		(a, b) => b.amount - a.amount,
	);
	const highestMonth = sortedMonths[0] || { month: "N/A", amount: 0 };
	const lowestMonth = sortedMonths[sortedMonths.length - 1] || {
		month: "N/A",
		amount: 0,
	};

	// Get category breakdown
	const categoryBreakdown = AnalyticsService.getSpendingByCategory().map(
		(cat) => ({
			category: cat.category,
			total: cat.yearlyTotal,
			percentage: totalSpent > 0 ? Math.round((cat.yearlyTotal / totalSpent) * 100) : 0,
		}),
	);

	// Get subscription changes during the year
	const added: AnnualSummary["subscriptionChanges"]["added"] = [];
	const cancelled: AnnualSummary["subscriptionChanges"]["cancelled"] = [];

	for (const sub of subscriptions) {
		const subTyped = sub as unknown as {
			name: string;
			status: string;
			created_at: number;
			cost_cents: number;
		};

		if (subTyped.created_at >= yearStart && subTyped.created_at <= yearEnd) {
			added.push({
				name: sub.name,
				date: subTyped.created_at,
				cost: subTyped.cost_cents,
			});
		}
	}

	// Get cancellation decisions from the year
	const decisions = db
		.query(
			`
    SELECT d.*, s.name as subscription_name
    FROM decision_log d
    JOIN subscriptions s ON d.subscription_id = s.id
    WHERE d.decision = 'cancel'
      AND d.decision_date >= ?
      AND d.decision_date <= ?
  `,
		)
		.all(yearStart, yearEnd) as {
		subscription_name: string;
		decision_date: number;
		cost_at_decision: number;
	}[];

	for (const decision of decisions) {
		cancelled.push({
			name: decision.subscription_name,
			date: decision.decision_date,
			previousCost: decision.cost_at_decision,
		});
	}

	// Calculate savings from cancellations
	const savingsSummary = DecisionService.getSavingsSummary();
	const savingsFromCancellations = savingsSummary.totalSavedSinceTracking;

	// Get top and worst value subscriptions
	const valueScores = AnalyticsService.getAllValueScores();
	const topValue = valueScores.slice(0, 3).map((v) => ({
		name: v.subscriptionName,
		valueScore: v.score,
		costPerUse: v.costPerUse,
	}));
	const worstValue = valueScores
		.slice(-3)
		.reverse()
		.map((v) => ({
			name: v.subscriptionName,
			valueScore: v.score,
			costPerUse: v.costPerUse,
		}));

	// Generate insights
	const insights: string[] = [];

	if (cancelled.length > 0) {
		const totalCancelledCost = cancelled.reduce(
			(sum, c) => sum + c.previousCost,
			0,
		);
		insights.push(
			`You cancelled ${cancelled.length} subscription(s), saving approximately $${(totalCancelledCost / 100).toFixed(2)}/month.`,
		);
	}

	if (added.length > 0) {
		insights.push(`You added ${added.length} new subscription(s) this year.`);
	}

	const avgMonthly = totalSpent / 12;
	insights.push(
		`Your average monthly subscription spending was $${(avgMonthly / 100).toFixed(2)}.`,
	);

	if (worstValue.length > 0 && worstValue[0].valueScore < 30) {
		insights.push(
			`${worstValue[0].name} has the lowest value score. Consider reviewing it.`,
		);
	}

	if (categoryBreakdown.length > 0) {
		const topCategory = categoryBreakdown[0];
		insights.push(
			`${topCategory.category} is your largest spending category (${topCategory.percentage}% of total).`,
		);
	}

	return {
		year: targetYear,
		totalSpent,
		averageMonthlySpend: avgMonthly,
		highestMonth,
		lowestMonth,
		categoryBreakdown,
		subscriptionChanges: { added, cancelled },
		savingsFromCancellations,
		topValueSubscriptions: topValue,
		worstValueSubscriptions: worstValue,
		insights,
	};
}

/**
 * Get quick ROI stats
 */
function getQuickStats(): {
	monthlySpend: number;
	yearlySpend: number;
	avgValueScore: number;
	potentialSavings: number;
	subscriptionsAboveAverage: number;
	subscriptionsBelowAverage: number;
} {
	const monthlySpend = SubscriptionService.getMonthlyTotal();
	const valueScores = AnalyticsService.getAllValueScores();
	const comparisons = getIndustryComparisons();

	const avgValueScore =
		valueScores.length > 0
			? Math.round(
					valueScores.reduce((sum, v) => sum + v.score, 0) / valueScores.length,
				)
			: 0;

	// Potential savings from low-value subscriptions
	const lowValueSubs = valueScores.filter((v) => v.score < 40);
	const potentialSavings = lowValueSubs.reduce((sum, v) => {
		const sub = SubscriptionService.getSubscriptionById(v.subscriptionId) as {
			cost_cents: number;
			billing_frequency: string;
		} | null;
		if (!sub) return sum;

		let monthly = sub.cost_cents;
		if (sub.billing_frequency === "yearly") {
			monthly = sub.cost_cents / 12;
		} else if (sub.billing_frequency === "weekly") {
			monthly = sub.cost_cents * 4.33;
		}
		return sum + monthly;
	}, 0);

	const subscriptionsAboveAverage = comparisons.filter(
		(c) => c.percentageVsAverage > 10,
	).length;
	const subscriptionsBelowAverage = comparisons.filter(
		(c) => c.percentageVsAverage < -10,
	).length;

	return {
		monthlySpend,
		yearlySpend: monthlySpend * 12,
		avgValueScore,
		potentialSavings,
		subscriptionsAboveAverage,
		subscriptionsBelowAverage,
	};
}

export const ROIService = {
	getIndustryComparisons,
	getValuePerDollarRankings,
	calculateWhatIf,
	generateAnnualSummary,
	getQuickStats,
	INDUSTRY_AVERAGES,
};
