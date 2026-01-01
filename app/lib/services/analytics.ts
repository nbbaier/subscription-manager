// Analytics service - value scoring, trends, and insights
import { db, nanoid } from '../db/index.ts';
import { SubscriptionService } from './subscription.ts';
import { UsageService } from './usage.ts';

// Category benchmarks for cost-per-use calculations
// Based on typical usage patterns and industry averages
const CATEGORY_BENCHMARKS: Record<string, { costPerUse: number; unit: string }> = {
  streaming: { costPerUse: 200, unit: 'show/movie' }, // $2.00 per show/movie
  music: { costPerUse: 20, unit: 'hour' }, // $0.20 per hour
  fitness: { costPerUse: 1000, unit: 'session' }, // $10.00 per session
  productivity: { costPerUse: 100, unit: 'day' }, // $1.00 per day of use
  news: { costPerUse: 50, unit: 'article' }, // $0.50 per article
  gaming: { costPerUse: 100, unit: 'hour' }, // $1.00 per hour
  education: { costPerUse: 500, unit: 'lesson' }, // $5.00 per lesson
  other: { costPerUse: 200, unit: 'use' }, // $2.00 per use (default)
};

// Alert thresholds
const ALERT_THRESHOLDS = {
  noUsageDays: 14, // Alert if no usage in 14+ days
  lowValueScore: 40, // Alert if value score below 40
  highCostPerUse: 1500, // Alert if cost per use above $15.00
};

export interface ValueScore {
  subscriptionId: string;
  subscriptionName: string;
  score: number; // 0-100
  breakdown: {
    usageScore: number;
    costScore: number;
    trendBonus: number;
  };
  costPerUse: number | null;
  monthlyUsage: number;
  category: string;
}

export interface Alert {
  type: 'no_usage' | 'low_value' | 'high_cost' | 'trial_ending';
  severity: 'high' | 'medium' | 'low';
  subscriptionId: string;
  subscriptionName: string;
  message: string;
  value?: number;
}

export interface CategorySpending {
  category: string;
  monthlyTotal: number;
  yearlyTotal: number;
  count: number;
  subscriptions: { id: string; name: string; costCents: number }[];
}

export interface UsageTrend {
  subscriptionId: string;
  data: {
    period: string;
    periodStart: number;
    count: number;
  }[];
}

export interface MonthlySpendingTrend {
  month: string;
  total: number;
}

export class AnalyticsService {
  /**
   * Calculate value score for a subscription
   * Score ranges from 0-100 based on usage frequency, cost efficiency, and trends
   */
  static calculateValueScore(subscriptionId: string): ValueScore | null {
    const subscription: any = db.query('SELECT * FROM subscriptions WHERE id = ?').get(subscriptionId);
    if (!subscription) return null;

    const stats = UsageService.getUsageStats(subscriptionId);
    const category = subscription.category || 'other';
    const benchmark = CATEGORY_BENCHMARKS[category] || CATEGORY_BENCHMARKS.other;

    // Calculate monthly cost in cents
    let monthlyCostCents = subscription.cost_cents;
    if (subscription.billing_frequency === 'yearly') {
      monthlyCostCents = subscription.cost_cents / 12;
    } else if (subscription.billing_frequency === 'weekly') {
      monthlyCostCents = subscription.cost_cents * 4.33;
    }

    // Calculate usage score (0-100)
    const expectedUsage = subscription.expected_usage_per_month || 8; // Default to 8 uses/month
    const usageRatio = stats.usageThisMonth / expectedUsage;
    const usageScore = Math.min(100, usageRatio * 80); // 100% of expected = 80 points, 125%+ = 100

    // Calculate cost score (0-100)
    let costScore = 50; // Default middle score
    let costPerUse: number | null = null;
    if (stats.usageThisMonth > 0) {
      costPerUse = monthlyCostCents / stats.usageThisMonth;
      // Compare to benchmark
      const benchmarkCents = benchmark.costPerUse;
      const costRatio = costPerUse / benchmarkCents;
      // At or below benchmark = 100, 2x = 75, 3x = 50, 5x+ = 0
      costScore = Math.max(0, Math.min(100, 100 - (costRatio - 1) * 25));
    }

    // Calculate trend bonus (-10 to +10)
    const trend = this.getUsageTrendDirection(subscriptionId);
    const trendBonus = trend === 'up' ? 10 : trend === 'down' ? -10 : 0;

    // Combine scores with weights
    const rawScore = (
      usageScore * 0.45 +
      costScore * 0.40 +
      (50 + trendBonus) * 0.15
    );

    const finalScore = Math.round(Math.max(0, Math.min(100, rawScore)));

    return {
      subscriptionId,
      subscriptionName: subscription.name,
      score: finalScore,
      breakdown: {
        usageScore: Math.round(usageScore),
        costScore: Math.round(costScore),
        trendBonus,
      },
      costPerUse,
      monthlyUsage: stats.usageThisMonth,
      category,
    };
  }

  /**
   * Get value scores for all active subscriptions, sorted by score
   */
  static getAllValueScores(): ValueScore[] {
    const subscriptions = SubscriptionService.getActiveSubscriptions();
    const scores: ValueScore[] = [];

    for (const sub of subscriptions) {
      const score = this.calculateValueScore(sub.id);
      if (score) {
        scores.push(score);
      }
    }

    return scores.sort((a, b) => b.score - a.score);
  }

  /**
   * Get all alerts that need attention
   */
  static getAlerts(): Alert[] {
    const alerts: Alert[] = [];
    const subscriptions = SubscriptionService.getActiveSubscriptions();

    for (const sub of subscriptions) {
      const stats = UsageService.getUsageStats(sub.id);
      const valueScore = this.calculateValueScore(sub.id);

      // Check for no usage
      if (stats.daysSinceLastUse !== undefined && stats.daysSinceLastUse >= ALERT_THRESHOLDS.noUsageDays) {
        alerts.push({
          type: 'no_usage',
          severity: stats.daysSinceLastUse >= 30 ? 'high' : 'medium',
          subscriptionId: sub.id,
          subscriptionName: sub.name,
          message: `No usage in ${stats.daysSinceLastUse} days`,
          value: stats.daysSinceLastUse,
        });
      } else if (stats.totalEvents === 0) {
        // Never used
        alerts.push({
          type: 'no_usage',
          severity: 'high',
          subscriptionId: sub.id,
          subscriptionName: sub.name,
          message: 'Never used since added',
          value: 0,
        });
      }

      // Check for low value score
      if (valueScore && valueScore.score < ALERT_THRESHOLDS.lowValueScore) {
        alerts.push({
          type: 'low_value',
          severity: valueScore.score < 20 ? 'high' : 'medium',
          subscriptionId: sub.id,
          subscriptionName: sub.name,
          message: `Low value score: ${valueScore.score}/100`,
          value: valueScore.score,
        });
      }

      // Check for high cost per use
      if (valueScore && valueScore.costPerUse && valueScore.costPerUse > ALERT_THRESHOLDS.highCostPerUse) {
        alerts.push({
          type: 'high_cost',
          severity: valueScore.costPerUse > 3000 ? 'high' : 'medium',
          subscriptionId: sub.id,
          subscriptionName: sub.name,
          message: `High cost per use: $${(valueScore.costPerUse / 100).toFixed(2)}`,
          value: valueScore.costPerUse,
        });
      }
    }

    // Sort by severity (high first)
    const severityOrder = { high: 0, medium: 1, low: 2 };
    return alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
  }

  /**
   * Get spending breakdown by category
   */
  static getSpendingByCategory(): CategorySpending[] {
    const subscriptions = SubscriptionService.getActiveSubscriptions();
    const categoryMap = new Map<string, CategorySpending>();

    for (const sub of subscriptions) {
      // SQLite returns snake_case field names, TypeScript interface uses camelCase
      const subAny = sub as any;
      const category = subAny.category || 'other';
      const costCents = subAny.cost_cents ?? subAny.costCents ?? 0;
      const billingFrequency = subAny.billing_frequency ?? subAny.billingFrequency ?? 'monthly';

      // Calculate monthly cost
      let monthlyCostCents = costCents;
      if (billingFrequency === 'yearly') {
        monthlyCostCents = costCents / 12;
      } else if (billingFrequency === 'weekly') {
        monthlyCostCents = costCents * 4.33;
      }

      let yearlyCostCents = costCents;
      if (billingFrequency === 'monthly') {
        yearlyCostCents = costCents * 12;
      } else if (billingFrequency === 'weekly') {
        yearlyCostCents = costCents * 52;
      }

      if (!categoryMap.has(category)) {
        categoryMap.set(category, {
          category,
          monthlyTotal: 0,
          yearlyTotal: 0,
          count: 0,
          subscriptions: [],
        });
      }

      const cat = categoryMap.get(category)!;
      cat.monthlyTotal += monthlyCostCents;
      cat.yearlyTotal += yearlyCostCents;
      cat.count += 1;
      cat.subscriptions.push({
        id: sub.id,
        name: sub.name,
        costCents: costCents,
      });
    }

    return Array.from(categoryMap.values()).sort((a, b) => b.monthlyTotal - a.monthlyTotal);
  }

  /**
   * Get usage trend for a specific subscription over the last N months
   */
  static getUsageTrend(subscriptionId: string, months: number = 6): UsageTrend {
    const data: UsageTrend['data'] = [];
    const now = new Date();

    for (let i = months - 1; i >= 0; i--) {
      const periodStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const periodEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);

      const query = db.query(`
        SELECT COUNT(*) as count FROM usage_events
        WHERE subscription_id = ?
        AND timestamp >= ?
        AND timestamp <= ?
      `);

      const result: any = query.get(
        subscriptionId,
        periodStart.getTime(),
        periodEnd.getTime()
      );

      data.push({
        period: periodStart.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
        periodStart: periodStart.getTime(),
        count: result?.count || 0,
      });
    }

    return { subscriptionId, data };
  }

  /**
   * Get usage trends for all active subscriptions
   */
  static getAllUsageTrends(months: number = 6): UsageTrend[] {
    const subscriptions = SubscriptionService.getActiveSubscriptions();
    return subscriptions.map(sub => this.getUsageTrend(sub.id, months));
  }

  /**
   * Get monthly spending trend over time
   */
  static getMonthlySpendingTrend(months: number = 12): MonthlySpendingTrend[] {
    const trends: MonthlySpendingTrend[] = [];
    const subscriptions = SubscriptionService.getAllSubscriptions();
    const now = new Date();

    for (let i = months - 1; i >= 0; i--) {
      const periodStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const periodEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);

      let total = 0;

      // Sum up costs for all active subscriptions during this period
      for (const sub of subscriptions) {
        // SQLite returns snake_case field names, TypeScript interface uses camelCase
        const subAny = sub as any;
        const status = subAny.status ?? 'active';
        const createdAt = subAny.created_at ?? subAny.createdAt ?? 0;
        const costCents = subAny.cost_cents ?? subAny.costCents ?? 0;
        const billingFrequency = subAny.billing_frequency ?? subAny.billingFrequency ?? 'monthly';

        // Check if subscription was active during this period
        if (status === 'active' || status === 'trial') {
          // Skip if created after this period
          if (createdAt > periodEnd.getTime()) continue;

          // Calculate monthly cost
          let monthlyCost = costCents;
          if (billingFrequency === 'yearly') {
            monthlyCost = costCents / 12;
          } else if (billingFrequency === 'weekly') {
            monthlyCost = costCents * 4.33;
          }
          total += monthlyCost;
        }
      }

      trends.push({
        month: periodStart.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
        total,
      });
    }

    return trends;
  }

  /**
   * Get cost-per-use leaderboard (best value subscriptions)
   */
  static getCostPerUseLeaderboard(): ValueScore[] {
    const scores = this.getAllValueScores();
    // Filter to only those with usage, then sort by cost per use (lowest first)
    return scores
      .filter(s => s.costPerUse !== null && s.monthlyUsage > 0)
      .sort((a, b) => (a.costPerUse || 0) - (b.costPerUse || 0));
  }

  /**
   * Determine if usage trend is going up, down, or stable
   */
  private static getUsageTrendDirection(subscriptionId: string): 'up' | 'down' | 'stable' {
    const trend = this.getUsageTrend(subscriptionId, 3);
    if (trend.data.length < 2) return 'stable';

    const recent = trend.data[trend.data.length - 1].count;
    const previous = trend.data[trend.data.length - 2].count;

    if (recent > previous * 1.2) return 'up';
    if (recent < previous * 0.8) return 'down';
    return 'stable';
  }

  /**
   * Store computed stats in usage_stats table
   */
  static storeUsageStats(subscriptionId: string, periodType: 'day' | 'week' | 'month'): void {
    const now = new Date();
    let periodStart: Date;

    switch (periodType) {
      case 'day':
        periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'week':
        const day = now.getDay();
        periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day);
        break;
      case 'month':
        periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
    }

    const periodEnd = new Date(periodStart);
    if (periodType === 'day') periodEnd.setDate(periodEnd.getDate() + 1);
    if (periodType === 'week') periodEnd.setDate(periodEnd.getDate() + 7);
    if (periodType === 'month') periodEnd.setMonth(periodEnd.getMonth() + 1);

    // Count events in period
    const countQuery = db.query(`
      SELECT COUNT(*) as count, SUM(quantity) as total_quantity
      FROM usage_events
      WHERE subscription_id = ?
      AND timestamp >= ?
      AND timestamp < ?
    `);
    const countResult: any = countQuery.get(subscriptionId, periodStart.getTime(), periodEnd.getTime());

    // Get value score
    const valueScore = this.calculateValueScore(subscriptionId);

    // Upsert stats
    const existingQuery = db.query(`
      SELECT id FROM usage_stats
      WHERE subscription_id = ? AND period_type = ? AND period_start = ?
    `);
    const existing: any = existingQuery.get(subscriptionId, periodType, periodStart.getTime());

    if (existing) {
      db.prepare(`
        UPDATE usage_stats
        SET total_events = ?, total_quantity = ?, cost_per_use = ?, value_score = ?
        WHERE id = ?
      `).run(
        countResult?.count || 0,
        countResult?.total_quantity || 0,
        valueScore?.costPerUse || null,
        valueScore?.score || null,
        existing.id
      );
    } else {
      db.prepare(`
        INSERT INTO usage_stats (id, subscription_id, period_type, period_start, total_events, total_quantity, cost_per_use, value_score)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        nanoid(),
        subscriptionId,
        periodType,
        periodStart.getTime(),
        countResult?.count || 0,
        countResult?.total_quantity || 0,
        valueScore?.costPerUse || null,
        valueScore?.score || null
      );
    }
  }

  /**
   * Compute and store stats for all subscriptions
   */
  static computeAllStats(): void {
    const subscriptions = SubscriptionService.getActiveSubscriptions();
    for (const sub of subscriptions) {
      this.storeUsageStats(sub.id, 'month');
    }
  }
}
