// Usage tracking service
import { db, nanoid } from '../db/index.ts';

export interface UsageEvent {
  id: string;
  subscriptionId: string;
  timestamp: number;
  source: 'manual' | 'api' | 'browser' | 'email' | 'import';
  usageType?: string;
  quantity?: number;
  unit?: string;
  notes?: string;
  metadata?: string;
}

export interface NewUsageEvent {
  subscriptionId: string;
  quantity?: number;
  notes?: string;
}

export interface UsageStats {
  subscriptionId: string;
  totalEvents: number;
  lastUsed?: number;
  daysSinceLastUse?: number;
  usageThisMonth: number;
  costPerUse?: number;
}

export class UsageService {
  static logUsage(data: NewUsageEvent): UsageEvent {
    const id = nanoid();
    const now = Date.now();

    const event: UsageEvent = {
      id,
      subscriptionId: data.subscriptionId,
      timestamp: now,
      source: 'manual',
      quantity: data.quantity || 1,
      notes: data.notes,
    };

    const query = db.prepare(`
      INSERT INTO usage_events (
        id, subscription_id, timestamp, source, quantity, notes
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);

    query.run(
      event.id,
      event.subscriptionId,
      event.timestamp,
      event.source,
      event.quantity,
      event.notes || null
    );

    return event;
  }

  static getUsageForSubscription(subscriptionId: string, limit: number = 50): UsageEvent[] {
    const query = db.query(`
      SELECT * FROM usage_events
      WHERE subscription_id = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    return query.all(subscriptionId, limit) as UsageEvent[];
  }

  static getUsageStats(subscriptionId: string): UsageStats {
    // Get total events
    const totalQuery = db.query(`
      SELECT COUNT(*) as count FROM usage_events
      WHERE subscription_id = ?
    `);
    const totalResult: any = totalQuery.get(subscriptionId);
    const totalEvents = totalResult?.count || 0;

    // Get last used timestamp
    const lastUsedQuery = db.query(`
      SELECT MAX(timestamp) as last_used FROM usage_events
      WHERE subscription_id = ?
    `);
    const lastUsedResult: any = lastUsedQuery.get(subscriptionId);
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
    const monthResult: any = monthQuery.get(subscriptionId, monthStartTimestamp);
    const usageThisMonth = monthResult?.count || 0;

    // Get subscription cost to calculate cost per use
    const subscriptionQuery = db.query(`
      SELECT cost_cents, billing_frequency FROM subscriptions WHERE id = ?
    `);
    const subscription: any = subscriptionQuery.get(subscriptionId);

    let costPerUse: number | undefined;
    if (subscription && totalEvents > 0) {
      let monthlyCost = subscription.cost_cents;
      if (subscription.billing_frequency === 'yearly') {
        monthlyCost = subscription.cost_cents / 12;
      } else if (subscription.billing_frequency === 'weekly') {
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

  static deleteUsageEvent(id: string): boolean {
    const query = db.prepare('DELETE FROM usage_events WHERE id = ?');
    const result = query.run(id);
    return result.changes > 0;
  }
}
