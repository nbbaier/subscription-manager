// Database schema for subscription tracker
import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';

// Main subscription record
export const subscriptions = sqliteTable('subscriptions', {
  id: text('id').primaryKey(), // nanoid
  name: text('name').notNull(),
  description: text('description'),

  // Cost & Billing
  costCents: integer('cost_cents').notNull(), // Store in cents to avoid float issues
  currency: text('currency').default('USD'),
  billingFrequency: text('billing_frequency').notNull(), // 'monthly' | 'yearly' | 'weekly' | 'one-time'
  billingDay: integer('billing_day'), // Day of month (1-31) or day of week (0-6)
  nextBillingDate: integer('next_billing_date'), // Unix timestamp

  // Categorization
  category: text('category'), // 'streaming', 'productivity', 'gaming', 'news', 'fitness', etc.
  tags: text('tags'), // JSON array of custom tags

  // Usage tracking config
  usageTrackingType: text('usage_tracking_type').notNull(), // 'manual' | 'api' | 'browser' | 'email'
  usageTrackingConfig: text('usage_tracking_config'), // JSON config for automated tracking
  expectedUsagePerMonth: integer('expected_usage_per_month'), // How often you expect to use it

  // Cancellation info
  cancellationDifficulty: text('cancellation_difficulty'), // 'easy' | 'medium' | 'hard' | 'nightmare'
  cancellationNotes: text('cancellation_notes'), // "Requires phone call", "Must cancel 30 days before renewal"
  cancellationUrl: text('cancellation_url'),
  contractEndDate: integer('contract_end_date'), // For annual commitments

  // Status
  status: text('status').default('active'), // 'active' | 'paused' | 'cancelled' | 'trial'
  trialEndDate: integer('trial_end_date'),

  // Metadata
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  iconUrl: text('icon_url'),
  websiteUrl: text('website_url'),
});

// Individual usage events
export const usageEvents = sqliteTable('usage_events', {
  id: text('id').primaryKey(),
  subscriptionId: text('subscription_id').notNull().references(() => subscriptions.id),

  timestamp: integer('timestamp').notNull(),
  source: text('source').notNull(), // 'manual' | 'api' | 'browser' | 'email' | 'import'

  // Flexible usage data
  usageType: text('usage_type'), // 'session', 'action', 'content_consumed', 'feature_used'
  quantity: real('quantity').default(1), // For countable things (articles read, hours watched)
  unit: text('unit'), // 'hours', 'articles', 'sessions', 'gb', etc.

  // Optional context
  notes: text('notes'),
  metadata: text('metadata'), // JSON for source-specific data
});

// Indexes for better query performance
export const subscriptionsByStatus = index('idx_subscriptions_status').on(subscriptions.status);
export const subscriptionsByNextBilling = index('idx_subscriptions_next_billing').on(subscriptions.nextBillingDate);
export const usageEventsBySubscription = index('idx_usage_events_subscription').on(usageEvents.subscriptionId);
export const usageEventsByTimestamp = index('idx_usage_events_timestamp').on(usageEvents.timestamp);
